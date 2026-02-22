import ora from "ora";
import { httpGet } from "../utils/sidecar.js";
import { ok, err, warn, bold, dim, CHECK, CROSS, WARN_ICON } from "../utils/colors.js";

export async function validate(url) {
  if (!url) {
    console.log(err("Usage: openfeeder validate <url>"));
    process.exit(1);
  }

  // Normalize URL
  let baseUrl = url.replace(/\/$/, "");
  if (!baseUrl.startsWith("http")) {
    baseUrl = `https://${baseUrl}`;
  }

  console.log(bold(`\nValidating OpenFeeder compliance: ${baseUrl}\n`));

  let passed = 0;
  let failed = 0;
  let warnings = 0;

  // 1. Discovery endpoint
  const spinner = ora("Checking discovery endpoint...").start();
  const discovery = await httpGet(`${baseUrl}/.well-known/openfeeder.json`);
  spinner.stop();

  if (discovery.ok && discovery.data) {
    console.log(`${CHECK} Discovery endpoint          ${ok("PASS")}`);
    const d = discovery.data;

    // Validate required fields
    if (d.version) {
      console.log(`${CHECK}   version: ${d.version}       ${ok("PASS")}`);
      passed++;
    } else {
      console.log(`${CROSS}   version field missing     ${err("FAIL")}`);
      failed++;
    }

    if (d.site?.url) {
      console.log(`${CHECK}   site.url present          ${ok("PASS")}`);
      passed++;
    } else {
      console.log(`${CROSS}   site.url missing          ${err("FAIL")}`);
      failed++;
    }

    if (d.feed?.endpoint) {
      console.log(`${CHECK}   feed.endpoint present     ${ok("PASS")}`);
      passed++;
    } else {
      console.log(`${CROSS}   feed.endpoint missing     ${err("FAIL")}`);
      failed++;
    }

    passed++;
  } else {
    console.log(`${CROSS} Discovery endpoint          ${err("FAIL")} — ${discovery.status || "unreachable"}`);
    failed++;
  }

  // 2. Content endpoint — index mode
  const content = await httpGet(`${baseUrl}/openfeeder`);
  if (content.ok && content.data) {
    console.log(`${CHECK} Content endpoint (index)    ${ok("PASS")}`);

    if (content.data.schema === "openfeeder/1.0") {
      console.log(`${CHECK}   schema: openfeeder/1.0    ${ok("PASS")}`);
      passed++;
    } else {
      console.log(`${CROSS}   schema field incorrect    ${err("FAIL")} — got: ${content.data.schema}`);
      failed++;
    }

    if (content.data.items && Array.isArray(content.data.items)) {
      console.log(`${CHECK}   items array present       ${ok("PASS")} — ${content.data.items.length} items`);
      passed++;
    } else {
      console.log(`${WARN_ICON}   items array missing       ${warn("WARN")} — may be empty index`);
      warnings++;
    }

    passed++;
  } else {
    console.log(`${CROSS} Content endpoint (index)    ${err("FAIL")} — ${content.status || "unreachable"}`);
    failed++;
  }

  // 3. Search mode
  const search = await httpGet(`${baseUrl}/openfeeder?q=test`);
  if (search.ok) {
    console.log(`${CHECK} Content endpoint (search)   ${ok("PASS")}`);
    passed++;
  } else if (search.status === 404) {
    console.log(`${WARN_ICON} Content endpoint (search)   ${warn("WARN")} — no results for "test" (may be expected)`);
    warnings++;
  } else {
    console.log(`${CROSS} Content endpoint (search)   ${err("FAIL")} — ${search.status || "unreachable"}`);
    failed++;
  }

  // 4. X-OpenFeeder header
  const header = content.headers?.get("x-openfeeder");
  if (header) {
    console.log(`${CHECK} X-OpenFeeder header         ${ok("PASS")} — ${header}`);
    passed++;
  } else {
    console.log(`${WARN_ICON} X-OpenFeeder header         ${warn("WARN")} — missing (recommended)`);
    warnings++;
  }

  // Summary
  console.log(bold("\n─── Summary ───\n"));
  console.log(`  ${ok(`${passed} passed`)}  ${failed > 0 ? err(`${failed} failed`) : dim("0 failed")}  ${warnings > 0 ? warn(`${warnings} warnings`) : dim("0 warnings")}`);
  console.log();

  if (failed > 0) {
    console.log(err("Validation FAILED."));
    process.exit(1);
  } else if (warnings > 0) {
    console.log(warn("Validation PASSED with warnings."));
  } else {
    console.log(ok("Validation PASSED."));
  }
}
