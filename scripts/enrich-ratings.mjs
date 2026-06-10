// Enriches data/players.json with a `rating` (EA FC26 "overall", higher = better)
// by fuzzy-matching each World Cup squad player against the public FC26 dataset.
//
//   node scripts/enrich-ratings.mjs            # match + write ratings, print report
//   node scripts/enrich-ratings.mjs --dry      # report only, don't write players.json
//
// Source: github.com/ismailoksuz/EAFC26-DataHub (sofifa-derived, ~18k players).
// Unmatched players get rating: null (they sort last under the "Ranking" option).
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DRY = process.argv.includes("--dry");
const CSV_URL =
  "https://raw.githubusercontent.com/ismailoksuz/EAFC26-DataHub/main/data/players.csv";
const CSV_CACHE = "data/.fifa-fc26.csv";
const PLAYERS_JSON = "data/players.json";

// ---- download (cached) -----------------------------------------------------
async function loadCsvText() {
  if (existsSync(CSV_CACHE)) return readFileSync(CSV_CACHE, "utf8");
  process.stderr.write(`Downloading FC26 dataset…\n`);
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`fetch ${CSV_URL} -> ${res.status}`);
  const text = await res.text();
  writeFileSync(CSV_CACHE, text);
  return text;
}

// ---- minimal RFC-4180 CSV parser (handles quoted commas/newlines) ----------
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* skip */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ---- normalization ---------------------------------------------------------
const LIG = { ø: "o", ł: "l", đ: "d", ı: "i", ß: "ss", æ: "ae", œ: "oe", ð: "d", þ: "th", ð: "d" };
function norm(s) {
  if (!s) return "";
  return String(s)
    .replace(/[øłđıßæœðþ]/gi, (c) => LIG[c.toLowerCase()] || c)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
const toks = (s) => norm(s).split(" ").filter((t) => t.length > 1);

// Surname = leading ALL-CAPS tokens of full_name ("ALVAREZ Julian" -> ALVAREZ).
function splitName(fullName, shirt) {
  const sur = [], giv = [];
  let inSur = true;
  for (const t of String(fullName).split(/\s+/)) {
    const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
    const isCaps = letters.length > 0 && letters === letters.toLocaleUpperCase();
    if (inSur && isCaps) sur.push(t);
    else { inSur = false; giv.push(t); }
  }
  if (!sur.length) return { surname: toks(shirt), given: [] };
  return { surname: toks(sur.join(" ")), given: toks(giv.join(" ")) };
}

// Nationality: WC spelling -> FC26 `nationality_name` spelling.
// FC26 already uses "Cabo Verde", "Czechia", "Côte d'Ivoire", "Congo DR",
// "Iran", "Türkiye", "Korea Republic" verbatim — only USA needs an alias.
const NAT_ALIAS = { usa: "united states" };
const natKey = (c) => { const n = norm(c); return NAT_ALIAS[n] || n; };
function natMatch(wc, fifa) {
  const a = natKey(wc), b = norm(fifa);
  if (!a || !b) return false;
  if (a === b) return true;
  const tb = new Set(b.split(" "));
  return a.split(" ").some((t) => tb.has(t));
}

// ---- build FC26 index ------------------------------------------------------
async function buildIndex() {
  const rows = parseCSV(await loadCsvText());
  const head = rows[0];
  const col = (n) => head.indexOf(n);
  const ci = {
    pid: col("player_id"), upd: col("fifa_update"), long: col("long_name"),
    short: col("short_name"), overall: col("overall"),
    nat: col("nationality_name"), club: col("club_name"),
  };
  // Dedupe by player_id, keep the latest fifa_update.
  const byPid = new Map();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row[ci.long]) continue;
    const pid = row[ci.pid];
    const upd = Number(row[ci.upd]) || 0;
    const prev = byPid.get(pid);
    if (!prev || upd > prev.upd) {
      byPid.set(pid, {
        upd,
        nameToks: new Set([...toks(row[ci.long]), ...toks(row[ci.short])]),
        clubToks: new Set(toks(row[ci.club])),
        nat: row[ci.nat],
        overall: Number(row[ci.overall]) || 0,
        long: row[ci.long], club: row[ci.club],
      });
    }
  }
  const recs = [...byPid.values()];
  // token -> rec[] index for fast surname lookup
  const tokIdx = new Map();
  for (const rec of recs)
    for (const t of rec.nameToks)
      (tokIdx.get(t) || tokIdx.set(t, []).get(t)).push(rec);
  return { recs, tokIdx };
}

// ---- match one WC player ---------------------------------------------------
function matchPlayer(p, idx) {
  const { surname, given } = splitName(p.full_name, p.name_on_shirt);
  if (!surname.length) return null;

  // Anchor on the longest surname token (most distinctive), then score how many
  // of the remaining surname tokens also appear — tolerant of FC26 storing a
  // different number of name parts ("Lo Celso", "Hadj Moussa", "Neymar Jr").
  const anchor = [...surname].sort((a, b) => b.length - a.length)[0];
  const cand = idx.tokIdx.get(anchor) || [];
  if (!cand.length) return null;

  const clubToks = toks(p.club);
  let best = null;
  for (const r of cand) {
    const surnameHit = surname.filter((t) => r.nameToks.has(t)).length;
    const givenHit = given.filter((t) => r.nameToks.has(t)).length;
    const nat = natMatch(p.country, r.nat);
    const clubHit = clubToks.some((t) => r.clubToks.has(t));
    const score = surnameHit * 2 + givenHit * 3 + (nat ? 5 : 0) + (clubHit ? 2 : 0);
    // Guard against coincidental single-token surname clashes: a lone anchor hit
    // with nothing else corroborating is only trusted when the candidate is unique.
    const corroborated = nat || givenHit > 0 || clubHit || surnameHit >= 2;
    if (!corroborated && cand.length > 1) continue;
    if (best === null || score > best.score ||
        (score === best.score && r.overall > best.rec.overall)) {
      best = { rec: r, score, nat, givenHit, surnameHit, clubHit };
    }
  }
  if (!best) return null;
  const conf =
    best.nat && best.givenHit ? "high" :
    best.nat || best.givenHit || best.surnameHit >= 2 ? "medium" : "low";
  return { rating: best.rec.overall, conf, match: best };
}

// ---- run -------------------------------------------------------------------
const idx = await buildIndex();
const players = JSON.parse(readFileSync(PLAYERS_JSON, "utf8"));

const stats = { high: 0, medium: 0, low: 0, none: 0 };
const byCountry = new Map();
const unmatched = [];
for (const p of players) {
  const m = matchPlayer(p, idx);
  p.rating = m ? m.rating : null;
  const bucket = m ? m.conf : "none";
  stats[bucket]++;
  const cc = byCountry.get(p.country) || { n: 0, ok: 0 };
  cc.n++; if (m) cc.ok++; byCountry.set(p.country, cc);
  if (!m) unmatched.push(`${p.full_name} (${p.country}, ${p.club || "?"})`);
}

const matched = stats.high + stats.medium + stats.low;
process.stderr.write(
  `\n${matched}/${players.length} matched ` +
  `(${(100 * matched / players.length).toFixed(1)}%)\n` +
  `  high=${stats.high} medium=${stats.medium} low=${stats.low} unmatched=${stats.none}\n\n`
);

// Per-country coverage, worst first
const cov = [...byCountry.entries()]
  .map(([c, v]) => `  ${(100 * v.ok / v.n).toFixed(0).padStart(3)}%  ${c} (${v.ok}/${v.n})`)
  .sort();
process.stderr.write("Coverage by country (sorted):\n" + cov.join("\n") + "\n\n");

process.stderr.write(`Unmatched (${unmatched.length}):\n` +
  unmatched.slice(0, 60).map((u) => "  " + u).join("\n") +
  (unmatched.length > 60 ? `\n  …and ${unmatched.length - 60} more` : "") + "\n");

if (!DRY) {
  writeFileSync(PLAYERS_JSON, JSON.stringify(players, null, 2) + "\n");
  process.stderr.write(`\nWrote ratings to ${PLAYERS_JSON}\n`);
} else {
  process.stderr.write(`\n--dry: players.json not modified\n`);
}
