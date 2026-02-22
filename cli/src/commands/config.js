import { readEnv, writeEnv } from "../utils/config.js";
import { ok, err, bold, dim, info } from "../utils/colors.js";

export async function configGet() {
  const env = await readEnv();
  const keys = Object.keys(env);

  if (keys.length === 0) {
    console.log(dim("\nNo .env file found. Run `openfeeder setup` to create one.\n"));
    return;
  }

  console.log(bold("\nCurrent Configuration\n"));
  const maxLen = Math.max(...keys.map((k) => k.length));
  for (const [key, val] of Object.entries(env)) {
    const display = key.includes("SECRET") && val ? "********" : val;
    console.log(`  ${info(key.padEnd(maxLen))}  ${display}`);
  }
  console.log();
}

export async function configSet(key, value) {
  if (!key || value === undefined) {
    console.log(err("Usage: openfeeder config set <KEY> <VALUE>"));
    process.exit(1);
  }

  await writeEnv({ [key]: value });
  console.log(ok(`\n✅ Set ${key}=${key.includes("SECRET") ? "********" : value}\n`));
  console.log(dim("Restart the sidecar for changes to take effect: docker compose restart openfeeder"));
}
