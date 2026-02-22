import ora from "ora";
import { triggerCrawl } from "../utils/sidecar.js";
import { dockerCompose, hasDockerCompose } from "../utils/docker.js";
import { ok, err, info, dim } from "../utils/colors.js";

export async function crawl() {
  const spinner = ora("Triggering re-crawl...").start();

  // Try the /crawl endpoint first
  const result = await triggerCrawl();

  if (result.ok) {
    spinner.succeed(ok("Re-crawl triggered successfully"));
    if (result.data?.message) {
      console.log(dim(`  ${result.data.message}`));
    }
    return;
  }

  // Fallback: restart via docker compose
  spinner.text = "Sidecar /crawl endpoint not available, restarting container...";

  if (!(await hasDockerCompose())) {
    spinner.fail(err("Cannot trigger crawl — sidecar unreachable and docker compose not available"));
    console.log(info("  Set SIDECAR_URL or ensure docker compose is installed."));
    process.exit(1);
  }

  try {
    await dockerCompose(["restart", "openfeeder"]);
    spinner.succeed(ok("Container restarted — re-crawl will begin automatically"));
  } catch (e) {
    spinner.fail(err("Failed to restart container"));
    console.log(err(`  ${e.message}`));
    process.exit(1);
  }
}
