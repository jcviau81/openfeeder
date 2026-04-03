#!/usr/bin/env node
/**
 * Generate WordPress.org plugin directory visual assets.
 * Uses SVG templates rendered to PNG via sharp.
 *
 * Output: adapters/wordpress/assets/
 *   - banner-1544x500.png, banner-772x250.png
 *   - icon-256x256.png, icon-128x128.png
 *   - screenshot-1.png, screenshot-2.png, screenshot-3.png
 */

import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "..", "adapters", "wordpress", "assets");
mkdirSync(ASSETS_DIR, { recursive: true });

// Brand colors
const BRAND = {
  primary: "#1a73e8",    // Blue
  secondary: "#34a853",  // Green
  accent: "#f9ab00",     // Amber
  dark: "#1a1a2e",       // Dark navy
  light: "#f8f9fa",      // Light gray
  white: "#ffffff",
  text: "#202124",
  textLight: "#5f6368",
  gradient1: "#1a73e8",
  gradient2: "#6c5ce7",
};

// --- Icon SVG ---
function iconSvg(size) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const r = s * 0.35;
  // Feed icon arcs + neural dot pattern
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BRAND.dark}"/>
      <stop offset="100%" stop-color="#16213e"/>
    </linearGradient>
    <linearGradient id="feed" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BRAND.primary}"/>
      <stop offset="100%" stop-color="${BRAND.secondary}"/>
    </linearGradient>
  </defs>
  <rect width="${s}" height="${s}" rx="${s * 0.18}" fill="url(#bg)"/>

  <!-- Feed arcs -->
  <g transform="translate(${cx - r}, ${cy + r * 0.2})">
    <!-- Dot -->
    <circle cx="${r * 0.15}" cy="${r * 0.85}" r="${r * 0.14}" fill="url(#feed)"/>
    <!-- Inner arc -->
    <path d="M ${r * 0.05} ${r * 0.45} A ${r * 0.55} ${r * 0.55} 0 0 1 ${r * 0.6} ${r * 0.95}"
          fill="none" stroke="url(#feed)" stroke-width="${r * 0.12}" stroke-linecap="round"/>
    <!-- Outer arc -->
    <path d="M ${r * 0.05} ${r * 0.05} A ${r * 0.95} ${r * 0.95} 0 0 1 ${r * 1.0} ${r * 0.95}"
          fill="none" stroke="url(#feed)" stroke-width="${r * 0.12}" stroke-linecap="round"/>
  </g>

  <!-- Neural network dots (AI motif) -->
  <g fill="${BRAND.accent}" opacity="0.8">
    <circle cx="${cx + r * 0.5}" cy="${cy - r * 0.6}" r="${r * 0.07}"/>
    <circle cx="${cx + r * 0.8}" cy="${cy - r * 0.25}" r="${r * 0.05}"/>
    <circle cx="${cx + r * 0.65}" cy="${cy + r * 0.1}" r="${r * 0.06}"/>
    <circle cx="${cx + r * 0.4}" cy="${cy - r * 0.3}" r="${r * 0.04}"/>
  </g>
  <!-- Connection lines -->
  <g stroke="${BRAND.accent}" stroke-width="${r * 0.02}" opacity="0.4">
    <line x1="${cx + r * 0.5}" y1="${cy - r * 0.6}" x2="${cx + r * 0.8}" y2="${cy - r * 0.25}"/>
    <line x1="${cx + r * 0.8}" y1="${cy - r * 0.25}" x2="${cx + r * 0.65}" y2="${cy + r * 0.1}"/>
    <line x1="${cx + r * 0.5}" y1="${cy - r * 0.6}" x2="${cx + r * 0.4}" y2="${cy - r * 0.3}"/>
    <line x1="${cx + r * 0.4}" y1="${cy - r * 0.3}" x2="${cx + r * 0.65}" y2="${cy + r * 0.1}"/>
  </g>
</svg>`;
}

// --- Banner SVG ---
function bannerSvg(w, h) {
  const fontSize = h * 0.16;
  const subFontSize = h * 0.07;
  const tagFontSize = h * 0.055;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bannerBg" x1="0" y1="0" x2="1" y2="0.5">
      <stop offset="0%" stop-color="${BRAND.dark}"/>
      <stop offset="60%" stop-color="#16213e"/>
      <stop offset="100%" stop-color="#0f3460"/>
    </linearGradient>
    <linearGradient id="accentLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${BRAND.primary}"/>
      <stop offset="50%" stop-color="${BRAND.secondary}"/>
      <stop offset="100%" stop-color="${BRAND.accent}"/>
    </linearGradient>
  </defs>

  <rect width="${w}" height="${h}" fill="url(#bannerBg)"/>

  <!-- Decorative grid pattern -->
  <g stroke="${BRAND.primary}" stroke-width="0.5" opacity="0.08">
    ${Array.from({ length: 20 }, (_, i) => `<line x1="${w * i / 20}" y1="0" x2="${w * i / 20}" y2="${h}"/>`).join("\n    ")}
    ${Array.from({ length: 8 }, (_, i) => `<line x1="0" y1="${h * i / 8}" x2="${w}" y2="${h * i / 8}"/>`).join("\n    ")}
  </g>

  <!-- Floating data blocks (right side) -->
  <g transform="translate(${w * 0.62}, ${h * 0.15})" opacity="0.15">
    <rect x="0" y="0" width="${w * 0.15}" height="${h * 0.12}" rx="4" fill="${BRAND.primary}"/>
    <rect x="${w * 0.05}" y="${h * 0.16}" width="${w * 0.2}" height="${h * 0.12}" rx="4" fill="${BRAND.secondary}"/>
    <rect x="${w * 0.02}" y="${h * 0.32}" width="${w * 0.12}" height="${h * 0.12}" rx="4" fill="${BRAND.accent}"/>
    <rect x="${w * 0.1}" y="${h * 0.48}" width="${w * 0.18}" height="${h * 0.12}" rx="4" fill="${BRAND.primary}"/>
    <rect x="${w * 0.04}" y="${h * 0.64}" width="${w * 0.14}" height="${h * 0.12}" rx="4" fill="${BRAND.secondary}"/>
  </g>

  <!-- Connection lines between blocks -->
  <g stroke="${BRAND.accent}" stroke-width="1.5" opacity="0.1">
    <line x1="${w * 0.68}" y1="${h * 0.25}" x2="${w * 0.72}" y2="${h * 0.35}"/>
    <line x1="${w * 0.75}" y1="${h * 0.38}" x2="${w * 0.7}" y2="${h * 0.5}"/>
    <line x1="${w * 0.72}" y1="${h * 0.55}" x2="${w * 0.76}" y2="${h * 0.68}"/>
  </g>

  <!-- Mini feed icon -->
  <g transform="translate(${w * 0.06}, ${h * 0.28})">
    <circle cx="${h * 0.02}" cy="${h * 0.18}" r="${h * 0.025}" fill="${BRAND.primary}"/>
    <path d="M ${h * 0.01} ${h * 0.1} A ${h * 0.1} ${h * 0.1} 0 0 1 ${h * 0.12} ${h * 0.2}"
          fill="none" stroke="${BRAND.primary}" stroke-width="${h * 0.02}" stroke-linecap="round"/>
    <path d="M ${h * 0.01} ${h * 0.01} A ${h * 0.19} ${h * 0.19} 0 0 1 ${h * 0.21} ${h * 0.2}"
          fill="none" stroke="${BRAND.primary}" stroke-width="${h * 0.02}" stroke-linecap="round"/>
  </g>

  <!-- Text -->
  <text x="${w * 0.15}" y="${h * 0.48}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="${fontSize}" font-weight="700" fill="${BRAND.white}" letter-spacing="-1">
    OpenFeeder
  </text>
  <text x="${w * 0.15}" y="${h * 0.63}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="${subFontSize}" font-weight="400" fill="${BRAND.primary}">
    RSS for AI — Structured content for LLMs
  </text>

  <!-- Bottom accent line -->
  <rect x="0" y="${h - 4}" width="${w}" height="4" fill="url(#accentLine)"/>

  <!-- Tag pills -->
  <g transform="translate(${w * 0.15}, ${h * 0.74})">
    <rect x="0" y="0" width="${tagFontSize * 5}" height="${tagFontSize * 1.8}" rx="${tagFontSize * 0.5}" fill="${BRAND.primary}" opacity="0.2"/>
    <text x="${tagFontSize * 2.5}" y="${tagFontSize * 1.25}" font-family="system-ui, sans-serif" font-size="${tagFontSize}" fill="${BRAND.primary}" text-anchor="middle">WordPress</text>

    <rect x="${tagFontSize * 5.8}" y="0" width="${tagFontSize * 4}" height="${tagFontSize * 1.8}" rx="${tagFontSize * 0.5}" fill="${BRAND.secondary}" opacity="0.2"/>
    <text x="${tagFontSize * 7.8}" y="${tagFontSize * 1.25}" font-family="system-ui, sans-serif" font-size="${tagFontSize}" fill="${BRAND.secondary}" text-anchor="middle">JSON API</text>

    <rect x="${tagFontSize * 10.5}" y="0" width="${tagFontSize * 5.5}" height="${tagFontSize * 1.8}" rx="${tagFontSize * 0.5}" fill="${BRAND.accent}" opacity="0.2"/>
    <text x="${tagFontSize * 13.25}" y="${tagFontSize * 1.25}" font-family="system-ui, sans-serif" font-size="${tagFontSize}" fill="${BRAND.accent}" text-anchor="middle">Open Standard</text>
  </g>
</svg>`;
}

// --- Screenshot mockups ---
function screenshotSettingsSvg() {
  const w = 1200, h = 900;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <!-- WP Admin background -->
  <rect width="${w}" height="${h}" fill="#f0f0f1"/>

  <!-- WP Admin sidebar -->
  <rect x="0" y="0" width="200" height="${h}" fill="#1d2327"/>
  <rect x="0" y="0" width="200" height="46" fill="#2c3338"/>
  <text x="16" y="30" font-family="system-ui, sans-serif" font-size="14" fill="#fff" font-weight="600">WordPress Admin</text>

  <!-- Sidebar menu items -->
  ${["Dashboard", "Posts", "Media", "Pages", "Comments", "OpenFeeder"].map((item, i) => `
  <rect x="0" y="${56 + i * 40}" width="200" height="40" fill="${item === "OpenFeeder" ? "#2271b1" : "transparent"}"/>
  <text x="16" y="${81 + i * 40}" font-family="system-ui, sans-serif" font-size="13" fill="${item === "OpenFeeder" ? "#fff" : "#a7aaad"}">${item}</text>`).join("")}

  <!-- Content area -->
  <text x="230" y="55" font-family="system-ui, sans-serif" font-size="23" fill="#1d2327" font-weight="400">OpenFeeder Settings</text>

  <!-- Settings card -->
  <rect x="230" y="75" width="740" height="${h - 105}" rx="4" fill="#fff" stroke="#c3c4c7" stroke-width="1"/>

  <!-- General section -->
  <text x="260" y="115" font-family="system-ui, sans-serif" font-size="16" fill="#1d2327" font-weight="600">General</text>
  <line x1="260" y1="125" x2="940" y2="125" stroke="#c3c4c7" stroke-width="1"/>

  <!-- Enable toggle -->
  <text x="260" y="160" font-family="system-ui, sans-serif" font-size="13" fill="#1d2327">Enable OpenFeeder</text>
  <rect x="440" y="145" width="40" height="22" rx="11" fill="#2271b1"/>
  <circle cx="469" cy="156" r="9" fill="#fff"/>

  <!-- Posts per page -->
  <text x="260" y="205" font-family="system-ui, sans-serif" font-size="13" fill="#1d2327">Posts per page</text>
  <rect x="440" y="188" width="80" height="28" rx="4" fill="#fff" stroke="#8c8f94" stroke-width="1"/>
  <text x="455" y="207" font-family="monospace" font-size="13" fill="#2c3338">20</text>

  <!-- Cache duration -->
  <text x="260" y="250" font-family="system-ui, sans-serif" font-size="13" fill="#1d2327">Cache duration (seconds)</text>
  <rect x="440" y="233" width="80" height="28" rx="4" fill="#fff" stroke="#8c8f94" stroke-width="1"/>
  <text x="455" y="252" font-family="monospace" font-size="13" fill="#2c3338">3600</text>

  <!-- Content section -->
  <text x="260" y="310" font-family="system-ui, sans-serif" font-size="16" fill="#1d2327" font-weight="600">Content Settings</text>
  <line x1="260" y1="320" x2="940" y2="320" stroke="#c3c4c7" stroke-width="1"/>

  <!-- Chunk size -->
  <text x="260" y="355" font-family="system-ui, sans-serif" font-size="13" fill="#1d2327">Chunk size (tokens)</text>
  <rect x="440" y="338" width="80" height="28" rx="4" fill="#fff" stroke="#8c8f94" stroke-width="1"/>
  <text x="455" y="357" font-family="monospace" font-size="13" fill="#2c3338">500</text>

  <!-- Post types -->
  <text x="260" y="400" font-family="system-ui, sans-serif" font-size="13" fill="#1d2327">Post types to expose</text>
  <rect x="440" y="383" width="16" height="16" rx="2" fill="#2271b1"/>
  <text x="462" y="396" font-family="system-ui, sans-serif" font-size="13" fill="#2c3338">Posts</text>
  <rect x="520" y="383" width="16" height="16" rx="2" fill="#2271b1"/>
  <text x="542" y="396" font-family="system-ui, sans-serif" font-size="13" fill="#2c3338">Pages</text>
  <rect x="600" y="383" width="16" height="16" rx="2" fill="#fff" stroke="#8c8f94" stroke-width="1"/>
  <text x="622" y="396" font-family="system-ui, sans-serif" font-size="13" fill="#2c3338">Products</text>

  <!-- Endpoints section -->
  <text x="260" y="460" font-family="system-ui, sans-serif" font-size="16" fill="#1d2327" font-weight="600">Endpoint Status</text>
  <line x1="260" y1="470" x2="940" y2="470" stroke="#c3c4c7" stroke-width="1"/>

  <!-- Status rows -->
  <circle cx="270" cy="500" r="5" fill="#00a32a"/>
  <text x="285" y="504" font-family="monospace" font-size="12" fill="#2c3338">/wp-json/openfeeder/v1/discovery</text>
  <text x="700" y="504" font-family="system-ui, sans-serif" font-size="12" fill="#00a32a">Active</text>

  <circle cx="270" cy="530" r="5" fill="#00a32a"/>
  <text x="285" y="534" font-family="monospace" font-size="12" fill="#2c3338">/wp-json/openfeeder/v1/content</text>
  <text x="700" y="534" font-family="system-ui, sans-serif" font-size="12" fill="#00a32a">Active</text>

  <circle cx="270" cy="560" r="5" fill="#00a32a"/>
  <text x="285" y="564" font-family="monospace" font-size="12" fill="#2c3338">/wp-json/openfeeder/v1/search</text>
  <text x="700" y="564" font-family="system-ui, sans-serif" font-size="12" fill="#00a32a">Active</text>

  <!-- Save button -->
  <rect x="260" y="610" width="120" height="36" rx="4" fill="#2271b1"/>
  <text x="292" y="633" font-family="system-ui, sans-serif" font-size="13" fill="#fff" font-weight="600">Save Changes</text>
</svg>`;
}

function screenshotDiscoverySvg() {
  const w = 1200, h = 900;
  const json = JSON.stringify({
    openfeeder: "1.0",
    provider: {
      name: "My WordPress Site",
      url: "https://example.com"
    },
    endpoints: {
      content: "/wp-json/openfeeder/v1/content",
      search: "/wp-json/openfeeder/v1/search"
    },
    capabilities: {
      search: true,
      differential_sync: true,
      chunking: true,
      pagination: true
    },
    content_stats: {
      total_items: 142,
      last_updated: "2026-04-01T12:00:00Z"
    }
  }, null, 2);

  const lines = json.split("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#1e1e2e"/>

  <!-- URL bar -->
  <rect x="0" y="0" width="${w}" height="50" fill="#2a2a3e"/>
  <rect x="16" y="10" width="900" height="30" rx="4" fill="#1e1e2e"/>
  <text x="30" y="30" font-family="monospace" font-size="13" fill="#89b4fa">GET</text>
  <text x="62" y="30" font-family="monospace" font-size="13" fill="#cdd6f4">https://example.com/wp-json/openfeeder/v1/discovery</text>

  <!-- Status badge -->
  <rect x="940" y="12" width="60" height="26" rx="4" fill="#a6e3a1" opacity="0.2"/>
  <text x="955" y="30" font-family="monospace" font-size="12" fill="#a6e3a1">200 OK</text>

  <!-- Response header -->
  <text x="30" y="80" font-family="monospace" font-size="11" fill="#6c7086">Content-Type: application/json</text>
  <line x1="16" y1="95" x2="${w - 16}" y2="95" stroke="#313244" stroke-width="1"/>

  <!-- JSON body with syntax highlighting -->
  ${lines.map((line, i) => {
    // Colorize JSON
    const colored = line
      .replace(/"([^"]+)":/g, '<tspan fill="#89b4fa">"$1"</tspan>:')
      .replace(/: "([^"]+)"/g, ': <tspan fill="#a6e3a1">"$1"</tspan>')
      .replace(/: (\d+)/g, ': <tspan fill="#fab387">$1</tspan>')
      .replace(/: (true|false)/g, ': <tspan fill="#f9e2af">$1</tspan>');
    return `<text x="30" y="${115 + i * 20}" font-family="monospace" font-size="13" fill="#cdd6f4">${colored}</text>`;
  }).join("\n  ")}
</svg>`;
}

function screenshotContentSvg() {
  const w = 1200, h = 900;
  const json = JSON.stringify({
    openfeeder: "1.0",
    content: [
      {
        id: "post-42",
        title: "Getting Started with AI Integration",
        url: "https://example.com/ai-integration/",
        content_type: "Article",
        published: "2026-03-15T09:00:00Z",
        chunks: [
          {
            index: 0,
            text: "Artificial intelligence is transforming how we interact with web content. In this guide, we explore practical approaches to making your content AI-ready...",
            token_estimate: 487
          },
          {
            index: 1,
            text: "The OpenFeeder protocol provides a standardized way for AI systems to consume structured content. Unlike web scraping, it delivers clean text...",
            token_estimate: 412
          }
        ]
      }
    ],
    pagination: {
      page: 1,
      per_page: 20,
      total: 142,
      total_pages: 8
    }
  }, null, 2);

  const lines = json.split("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#1e1e2e"/>

  <!-- URL bar -->
  <rect x="0" y="0" width="${w}" height="50" fill="#2a2a3e"/>
  <rect x="16" y="10" width="900" height="30" rx="4" fill="#1e1e2e"/>
  <text x="30" y="30" font-family="monospace" font-size="13" fill="#89b4fa">GET</text>
  <text x="62" y="30" font-family="monospace" font-size="13" fill="#cdd6f4">https://example.com/wp-json/openfeeder/v1/content?page=1</text>

  <!-- Status badge -->
  <rect x="940" y="12" width="60" height="26" rx="4" fill="#a6e3a1" opacity="0.2"/>
  <text x="955" y="30" font-family="monospace" font-size="12" fill="#a6e3a1">200 OK</text>

  <!-- Response header -->
  <text x="30" y="80" font-family="monospace" font-size="11" fill="#6c7086">Content-Type: application/json; charset=utf-8</text>
  <line x1="16" y1="95" x2="${w - 16}" y2="95" stroke="#313244" stroke-width="1"/>

  <!-- JSON body -->
  ${lines.slice(0, 38).map((line, i) => {
    const colored = line
      .replace(/"([^"]+)":/g, '<tspan fill="#89b4fa">"$1"</tspan>:')
      .replace(/: "([^"]+)"/g, ': <tspan fill="#a6e3a1">"$1"</tspan>')
      .replace(/: (\d+)/g, ': <tspan fill="#fab387">$1</tspan>')
      .replace(/: (true|false|null)/g, ': <tspan fill="#f9e2af">$1</tspan>');
    return `<text x="30" y="${115 + i * 20}" font-family="monospace" font-size="13" fill="#cdd6f4">${colored}</text>`;
  }).join("\n  ")}
</svg>`;
}

// --- Render all assets ---
async function render(svgStr, width, height, outputPath) {
  await sharp(Buffer.from(svgStr))
    .resize(width, height)
    .png()
    .toFile(outputPath);
  console.log(`  ✓ ${outputPath.split("/").pop()} (${width}x${height})`);
}

async function main() {
  console.log("Generating WordPress.org plugin assets...\n");

  // Icons
  console.log("Icons:");
  await render(iconSvg(256), 256, 256, join(ASSETS_DIR, "icon-256x256.png"));
  await render(iconSvg(128), 128, 128, join(ASSETS_DIR, "icon-128x128.png"));

  // Banners
  console.log("\nBanners:");
  await render(bannerSvg(1544, 500), 1544, 500, join(ASSETS_DIR, "banner-1544x500.png"));
  await render(bannerSvg(772, 250), 772, 250, join(ASSETS_DIR, "banner-772x250.png"));

  // Screenshots
  console.log("\nScreenshots:");
  await render(screenshotSettingsSvg(), 1200, 900, join(ASSETS_DIR, "screenshot-1.png"));
  await render(screenshotDiscoverySvg(), 1200, 900, join(ASSETS_DIR, "screenshot-2.png"));
  await render(screenshotContentSvg(), 1200, 900, join(ASSETS_DIR, "screenshot-3.png"));

  console.log("\nDone! Assets written to adapters/wordpress/assets/");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
