import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ok, warn, dim, bold } from "../utils/colors.js";

export async function version() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.resolve(__dirname, "../../package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  const current = pkg.version;

  console.log(bold(`\nopenfeeder-cli v${current}\n`));

  // Check npm registry for latest version
  try {
    const resp = await fetch("https://registry.npmjs.org/openfeeder-cli/latest", {
      signal: AbortSignal.timeout(5000),
    });

    if (resp.ok) {
      const data = await resp.json();
      const latest = data.version;

      if (latest === current) {
        console.log(ok("Up to date."));
      } else {
        console.log(warn(`Update available: ${current} → ${latest}`));
        console.log(dim("  Run: npm install -g openfeeder-cli"));
      }
    }
  } catch {
    console.log(dim("Could not check for updates."));
  }

  console.log();
}
