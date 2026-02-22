import ora from "ora";
import { checkHealth, checkDiscovery, checkContent } from "../utils/sidecar.js";
import { getSiteUrl, getSidecarUrl, readEnv } from "../utils/config.js";
import { getContainerStatus, hasDockerCompose } from "../utils/docker.js";
import { ok, err, warn, info, bold, dim, CHECK, CROSS, WARN_ICON } from "../utils/colors.js";

export async function doctor() {
  const siteUrl = await getSiteUrl();
  const sidecarUrl = await getSidecarUrl();
  let failed = false;

  if (!siteUrl) {
    console.log(err("No SITE_URL configured. Run `openfeeder setup` or set SITE_URL in .env"));
    process.exit(1);
  }

  console.log(bold("\nOpenFeeder Doctor — Full Diagnostic\n"));
  console.log(dim(`Site:    ${siteUrl}`));
  console.log(dim(`Sidecar: ${sidecarUrl}\n`));

  const spinner = ora("Running diagnostics...").start();

  // 1. Health check
  const health = await checkHealth();
  if (health.ok && health.data?.status === "ok") {
    console.log(`${CHECK} Sidecar health              ${ok("UP — healthy")}`);
    if (health.data.last_crawl) {
      const lastCrawl = new Date(health.data.last_crawl * 1000);
      console.log(`  ${dim("Last crawl:")} ${lastCrawl.toLocaleString()}`);
    }
    if (health.data.crawl_running) {
      console.log(`  ${info("Crawl currently in progress")}`);
    }
  } else {
    console.log(`${CROSS} Sidecar health              ${err("DOWN")}`);
    console.log(err(`  Sidecar not running — try: docker compose up -d`));
    failed = true;
  }

  // 2. Sidecar version from headers
  if (health.headers) {
    const version = health.headers.get("x-openfeeder");
    if (version) {
      console.log(`${CHECK} Sidecar version             ${ok(`OpenFeeder ${version}`)}`);
    }
  }

  // 3. Discovery endpoint
  const discovery = await checkDiscovery(siteUrl);
  if (discovery.ok) {
    console.log(`${CHECK} Discovery endpoint          ${ok(`${discovery.status} OK`)}`);
    const d = discovery.data;
    if (d) {
      if (d.site?.name) console.log(`  ${dim("Site name:")} ${d.site.name}`);
      if (d.capabilities) console.log(`  ${dim("Capabilities:")} ${d.capabilities.join(", ")}`);
    }
  } else {
    console.log(`${CROSS} Discovery endpoint          ${err(`${discovery.status || "UNREACHABLE"}`)}`);
    failed = true;
  }

  // 4. Content endpoint
  const content = await checkContent(siteUrl);
  if (content.ok) {
    const data = content.data;
    const totalPages = data?.total_pages || "?";
    const firstItem = data?.items?.[0];
    console.log(`${CHECK} Content endpoint            ${ok(`${content.status} OK — ${data?.items?.length || 0} items, ${totalPages} pages`)}`);
    if (firstItem) {
      console.log(`  ${dim("First item:")} ${firstItem.title || firstItem.url} ${firstItem.published ? dim(`(${firstItem.published})`) : ""}`);
    }
  } else {
    console.log(`${CROSS} Content endpoint            ${err(`${content.status || "UNREACHABLE"}`)}`);
    failed = true;
  }

  // 5. Docker container status
  if (await hasDockerCompose()) {
    const container = await getContainerStatus();
    if (container) {
      console.log(`${CHECK} Docker container            ${ok(container.status)}`);
      if (container.ports) console.log(`  ${dim("Ports:")} ${container.ports}`);
    } else {
      console.log(`${CROSS} Docker container            ${err("Not found")}`);
      failed = true;
    }
  } else {
    console.log(`${WARN_ICON} Docker                      ${warn("docker compose not available")}`);
  }

  // 6. Warnings
  spinner.stop();
  console.log(bold("\nWarnings:\n"));

  const env = await readEnv();
  let warnings = 0;

  if (!env.OPENFEEDER_WEBHOOK_SECRET && !process.env.OPENFEEDER_WEBHOOK_SECRET) {
    console.log(`${WARN_ICON} No webhook secret set — POST /openfeeder/update is unauthenticated`);
    warnings++;
  }

  if (health.ok && health.data?.last_crawl === 0) {
    console.log(`${WARN_ICON} No crawl has completed yet — content may be empty`);
    warnings++;
  }

  if (warnings === 0) {
    console.log(ok("  No warnings."));
  }

  console.log();

  if (failed) {
    console.log(err("Some checks failed. See above for details."));
    process.exit(1);
  } else {
    console.log(ok("All checks passed."));
  }
}
