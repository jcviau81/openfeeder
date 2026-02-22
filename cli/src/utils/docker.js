import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Check if docker compose is available.
 */
export async function hasDockerCompose() {
  try {
    await execFileAsync("docker", ["compose", "version"]);
    return true;
  } catch {
    try {
      await execFileAsync("docker-compose", ["version"]);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Run a docker compose command. Returns { stdout, stderr }.
 */
export async function dockerCompose(args, options = {}) {
  try {
    return await execFileAsync("docker", ["compose", ...args], {
      timeout: 120_000,
      ...options,
    });
  } catch {
    // Fallback to docker-compose (v1)
    return execFileAsync("docker-compose", args, {
      timeout: 120_000,
      ...options,
    });
  }
}

/**
 * Get openfeeder container status from docker ps.
 */
export async function getContainerStatus() {
  try {
    const { stdout } = await execFileAsync("docker", [
      "ps",
      "--filter", "name=openfeeder",
      "--format", "{{.Names}}\t{{.Status}}\t{{.Ports}}",
    ]);
    if (!stdout.trim()) return null;
    const [name, status, ports] = stdout.trim().split("\t");
    return { name, status, ports };
  } catch {
    return null;
  }
}

/**
 * Spawn docker compose logs with streaming output.
 */
export function spawnLogs(follow = false, lines = 50) {
  const args = ["compose", "logs", "openfeeder", `--tail=${lines}`];
  if (follow) args.push("-f");
  return spawn("docker", args, { stdio: "inherit" });
}
