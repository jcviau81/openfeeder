import { defineConfig } from "vite";
import { viteOpenFeeder } from "./lib/openfeeder/src/index";
import config from "./openfeeder.config";

export default defineConfig({
  plugins: [viteOpenFeeder(config)],
});
