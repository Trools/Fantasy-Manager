import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const remote = process.argv.includes("--remote");
const players = JSON.parse(readFileSync("data/players.json", "utf8"));

const esc = (s) => s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`;
const num = (n) => (n == null || Number.isNaN(Number(n))) ? "NULL" : String(Number(n));

let sql = "DELETE FROM players;\n";

for (let i = 0; i < players.length; i += 100) {
  const chunk = players.slice(i, i + 100);
  sql += "INSERT INTO players (country,country_code,position,shirt_number,full_name,name_on_shirt,club,dob) VALUES\n";
  sql += chunk
    .map(p =>
      `(${esc(p.country)},${esc(p.country_code)},${esc(p.position)},${num(p.shirt_number)},${esc(p.full_name)},${esc(p.name_on_shirt)},${esc(p.club)},${esc(p.dob)})`
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
