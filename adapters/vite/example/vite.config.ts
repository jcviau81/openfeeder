/**
 * Example vite.config.ts using the OpenFeeder plugin.
 */

import { defineConfig } from "vite";
import { viteOpenFeeder } from "../src/index.js";
import config from "./openfeeder.config.js";

export default defineConfig({
  plugins: [
    viteOpenFeeder(config),
  ],
});
