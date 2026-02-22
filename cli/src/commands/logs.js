import { spawnLogs } from "../utils/docker.js";
import { hasDockerCompose } from "../utils/docker.js";
import { err } from "../utils/colors.js";

export async function logs(options) {
  if (!(await hasDockerCompose())) {
    console.log(err("\ndocker compose not available. Cannot show logs.\n"));
    process.exit(1);
  }

  const child = spawnLogs(options.follow, 50);

  child.on("error", (e) => {
    console.log(err(`Failed to get logs: ${e.message}`));
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code || 0);
  });
}
