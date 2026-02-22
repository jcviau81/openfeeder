#!/usr/bin/env node

import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(await readFile(path.resolve(__dirname, "../package.json"), "utf-8"));

const program = new Command();

program
  .name("openfeeder")
  .description("CLI for managing OpenFeeder sidecar installations")
  .version(pkg.version);

// setup
program
  .command("setup")
  .description("Interactive setup wizard — generates docker-compose.yml and .env")
  .action(async () => {
    const { setup } = await import("../src/commands/setup.js");
    await setup();
  });

// status
program
  .command("status")
  .description("Check if sidecar is running and healthy")
  .action(async () => {
    const { status } = await import("../src/commands/status.js");
    await status();
  });

// doctor
program
  .command("doctor")
  .description("Full diagnostic report")
  .action(async () => {
    const { doctor } = await import("../src/commands/doctor.js");
    await doctor();
  });

// config
const configCmd = program
  .command("config")
  .description("View and update configuration");

configCmd
  .command("get")
  .description("Print current configuration")
  .action(async () => {
    const { configGet } = await import("../src/commands/config.js");
    await configGet();
  });

configCmd
  .command("show")
  .description("Print current configuration (alias for get)")
  .action(async () => {
    const { configGet } = await import("../src/commands/config.js");
    await configGet();
  });

configCmd
  .command("set <key> <value>")
  .description("Set a configuration value in .env")
  .action(async (key, value) => {
    const { configSet } = await import("../src/commands/config.js");
    await configSet(key, value);
  });

// crawl
program
  .command("crawl")
  .description("Trigger a manual re-crawl")
  .action(async () => {
    const { crawl } = await import("../src/commands/crawl.js");
    await crawl();
  });

// reset
program
  .command("reset")
  .description("Wipe ChromaDB and restart with a fresh database")
  .action(async () => {
    const { reset } = await import("../src/commands/reset.js");
    await reset();
  });

// logs
program
  .command("logs")
  .description("Show sidecar container logs")
  .option("-f, --follow", "Stream logs continuously")
  .action(async (options) => {
    const { logs } = await import("../src/commands/logs.js");
    await logs(options);
  });

// validate
program
  .command("validate <url>")
  .description("Validate a URL for OpenFeeder compliance")
  .action(async (url) => {
    const { validate } = await import("../src/commands/validate.js");
    await validate(url);
  });

// version (explicit command in addition to --version flag)
program
  .command("version")
  .description("Show CLI version and check for updates")
  .action(async () => {
    const { version } = await import("../src/commands/version.js");
    await version();
  });

program.parse();
