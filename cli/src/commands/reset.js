import inquirer from "inquirer";
import ora from "ora";
import { dockerCompose, hasDockerCompose } from "../utils/docker.js";
import { ok, err, warn } from "../utils/colors.js";

export async function reset() {
  if (!(await hasDockerCompose())) {
    console.log(err("\ndocker compose not available. Cannot reset.\n"));
    process.exit(1);
  }

  const { confirmed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmed",
      message: warn("This will delete all indexed content. Are you sure?"),
      default: false,
    },
  ]);

  if (!confirmed) {
    console.log("\nAborted.\n");
    return;
  }

  const spinner = ora("Stopping containers and removing volumes...").start();

  try {
    await dockerCompose(["down", "-v"]);
    spinner.text = "Starting fresh containers...";
    await dockerCompose(["up", "-d"]);
    spinner.succeed(ok("Reset complete — sidecar is starting with a fresh database"));
    console.log("  Run `openfeeder status` to check when the initial crawl is done.\n");
  } catch (e) {
    spinner.fail(err("Reset failed"));
    console.log(err(`  ${e.message}`));
    process.exit(1);
  }
}
