import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const remote = process.argv.includes("--remote");
const force = process.argv.includes("--force");
const players = JSON.parse(readFileSync("data/players.json", "utf8"));

// Safety guard: the seed starts with `DELETE FROM players`, and FKs aren't
// enforced, so re-seeding during a live/finished draft orphans every pick (their
// player_id values then point at re-issued AUTOINCREMENT ids). Refuse unless the
// draft is back in the lobby with no picks. Override with --force. (Review M17.)
function dbResults(commandSql) {
  const wranglerArgs = ["wrangler", "d1", "execute", "DRAFT_DB", remote ? "--remote" : "--local", "--json", "--command", commandSql];
  const [bin, args] = process.platform === "win32" ? ["cmd", ["/c", "npx", ...wranglerArgs]] : ["npx", wranglerArgs];
  const r = spawnSync(bin, args, { encoding: "utf8", shell: false });
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout)?.[0]?.results ?? null; } catch { return null; }
}

if (!force) {
  const rows = dbResults("SELECT (SELECT COUNT(*) FROM picks) AS picks, (SELECT status FROM draft_settings WHERE id=1) AS status");
  const row = rows && rows[0];
  // Fail SAFE: if we couldn't determine the draft state (probe failed / no row),
  // refuse rather than risk wiping players under a live draft. Override with --force.
  if (!row) {
    console.error(
      "Could not verify draft state before seeding (have migrations been applied?). " +
      "Refusing to DELETE FROM players. Re-run with --force to override."
    );
    process.exit(1);
  }
  if (Number(row.picks) > 0 || (row.status && row.status !== "lobby")) {
    console.error(
      `Refusing to re-seed: draft has ${row.picks} pick(s), status='${row.status}'. ` +
      `Re-seeding would orphan existing picks. Re-run with --force to override.`
    );
    process.exit(1);
  }
}

const esc = (s) => s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`;
const num = (n) => (n == null || Number.isNaN(Number(n))) ? "NULL" : String(Number(n));

let sql = "DELETE FROM players;\n";

for (let i = 0; i < players.length; i += 100) {
  const chunk = players.slice(i, i + 100);
  sql += "INSERT INTO players (country,country_code,position,shirt_number,full_name,name_on_shirt,club,dob,rating) VALUES\n";
  sql += chunk
    .map(p =>
      `(${esc(p.country)},${esc(p.country_code)},${esc(p.position)},${num(p.shirt_number)},${esc(p.full_name)},${esc(p.name_on_shirt)},${esc(p.club)},${esc(p.dob)},${num(p.rating)})`
    )
    .join(",\n") + ";\n";
}

writeFileSync(".seed.sql", sql);

try {
  // Build the argument list for: npx wrangler d1 execute DRAFT_DB <flag> --file=.seed.sql
  // All values are hardcoded constants — no user input is interpolated.
  // On Windows, .cmd shims cannot be directly spawned without a shell, so we
  // invoke via `cmd /c` with shell: false to avoid both EINVAL and the Node
  // DEP0190 deprecation warning that fires when shell: true receives an args array.
  const wranglerArgs = ["wrangler", "d1", "execute", "DRAFT_DB",
    remote ? "--remote" : "--local",
    "--file=.seed.sql"];
  const [bin, args] = process.platform === "win32"
    ? ["cmd", ["/c", "npx", ...wranglerArgs]]
    : ["npx", wranglerArgs];
  const result = spawnSync(bin, args, { stdio: "inherit", shell: false });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
} finally {
  rmSync(".seed.sql", { force: true });
}

console.log(`Seeded ${players.length} players (${remote ? "remote" : "local"}).`);
