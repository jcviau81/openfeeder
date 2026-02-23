/**
 * OpenFeeder MCP Server — integration test script
 *
 * Tests the tool functions directly (not via MCP protocol).
 * Run: npm run build && node --loader ts-node/esm test.ts
 */

import { discover } from "./dist/tools/discover.js";
import { list } from "./dist/tools/list.js";
import { search } from "./dist/tools/search.js";
import { sync } from "./dist/tools/sync.js";
import { smartFetch } from "./dist/tools/smart-fetch.js";

const TEST_SITE = "https://sketchynews.snaf.foo/";

async function run() {
  console.log("=== OpenFeeder MCP Server — Integration Tests ===\n");

  // Test 1: Discover
  console.log("── Test 1: openfeeder_discover ──");
  try {
    const result = await discover(TEST_SITE);
    console.log(JSON.stringify(result, null, 2));
    console.log(
      result.supported ? "✓ OpenFeeder supported" : "✗ OpenFeeder not found"
    );
  } catch (err) {
    console.error("✗ Discover failed:", err);
  }
  console.log();

  // Test 2: List
  console.log("── Test 2: openfeeder_list ──");
  try {
    const result = await list({ url: TEST_SITE, page: 1 });
    const data = result as Record<string, unknown>;
    console.log(JSON.stringify(result, null, 2).slice(0, 1000));
    if (data.items) {
      console.log(`✓ Got ${(data.items as unknown[]).length} items`);
    }
  } catch (err) {
    console.error("✗ List failed:", err);
  }
  console.log();

  // Test 3: Search
  console.log('── Test 3: openfeeder_search (query="trump") ──');
  try {
    const result = await search({ url: TEST_SITE, query: "trump" });
    console.log(JSON.stringify(result, null, 2).slice(0, 1000));
    console.log("✓ Search completed");
  } catch (err) {
    console.error("✗ Search failed:", err);
  }
  console.log();

  // Test 4: Sync
  console.log("── Test 4: openfeeder_sync (since=2026-02-01T00:00:00Z) ──");
  try {
    const result = await sync({
      url: TEST_SITE,
      since: "2026-02-01T00:00:00Z",
    });
    console.log(JSON.stringify(result, null, 2).slice(0, 1000));
    console.log("✓ Sync completed");
  } catch (err) {
    console.error("✗ Sync failed:", err);
  }
  console.log();

  // Test 5: Smart Fetch with query
  console.log('── Test 5: smart_fetch (query="trump") ──');
  try {
    const result = await smartFetch({ url: TEST_SITE, query: "trump" });
    console.log(`Method used: ${result.method}`);
    console.log(`OpenFeeder supported: ${result.openfeeder_supported}`);
    console.log(JSON.stringify(result.content, null, 2).slice(0, 500));
    console.log("✓ Smart fetch completed");
  } catch (err) {
    console.error("✗ Smart fetch failed:", err);
  }
  console.log();

  // Test 6: Smart Fetch without query
  console.log("── Test 6: smart_fetch (no query) ──");
  try {
    const result = await smartFetch({ url: TEST_SITE });
    console.log(`Method used: ${result.method}`);
    console.log(`OpenFeeder supported: ${result.openfeeder_supported}`);
    console.log("✓ Smart fetch completed");
  } catch (err) {
    console.error("✗ Smart fetch failed:", err);
  }

  console.log("\n=== All tests complete ===");
}

run().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
