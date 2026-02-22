import ora from "ora";
import { checkHealth, checkDiscovery, checkContent } from "../utils/sidecar.js";
import { getSiteUrl, getSidecarUrl } from "../utils/config.js";
import { ok, err, bold, CHECK, CROSS } from "../utils/colors.js";

export async function status() {
  const siteUrl = await getSiteUrl();
  const sidecarUrl = await getSidecarUrl();

  if (!siteUrl) {
    console.log(err("No SITE_URL configured. Run `openfeeder setup` or set SITE_URL in .env"));
    process.exit(1);
  }

  console.log(bold("\nOpenFeeder Status\n"));

  const spinner = ora("Checking sidecar...").start();

  // 1. Health check
  const health = await checkHealth();
  spinner.stop();

  if (health.ok && health.data?.status === "ok") {
    console.log(`${CHECK} Sidecar (${sidecarUrl})    ${ok("UP — healthy")}`);
  } else {
    console.log(`${CROSS} Sidecar (${sidecarUrl})    ${err("DOWN")}`);
    console.log(err(`  Sidecar not running — try: docker compose up -d`));
  }

  // 2. Discovery endpoint
  const discovery = await checkDiscovery(siteUrl);
  if (discovery.ok) {
    console.log(`${CHECK} Discovery endpoint          ${ok(`${discovery.status} OK`)}`);
  } else {
    console.log(`${CROSS} Discovery endpoint          ${err(`${discovery.status || "UNREACHABLE"}`)}`);
  }

  // 3. Content endpoint
  const content = await checkContent(siteUrl);
  if (content.ok) {
    const items = content.data?.items;
    const totalInfo = items ? ` — ${items.length} pages indexed` : "";
    console.log(`${CHECK} Content endpoint            ${ok(`${content.status} OK${totalInfo}`)}`);
  } else {
    console.log(`${CROSS} Content endpoint            ${err(`${content.status || "UNREACHABLE"}`)}`);
  }

  console.log();

  // Exit code
  const allOk = health.ok && discovery.ok && content.ok;
  if (!allOk) process.exit(1);
}
