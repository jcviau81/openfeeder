import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ENV_FILE = path.resolve(".env");

/**
 * Read the .env file and return a key→value map.
 */
export async function readEnv() {
  if (!existsSync(ENV_FILE)) return {};
  const text = await readFile(ENV_FILE, "utf-8");
  const env = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

/**
 * Write a key→value map back to the .env file, preserving comments.
 */
export async function writeEnv(updates) {
  let lines = [];
  if (existsSync(ENV_FILE)) {
    const text = await readFile(ENV_FILE, "utf-8");
    lines = text.split("\n");
  }

  const remaining = { ...updates };

  // Update existing keys in-place
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key in remaining) {
      lines[i] = `${key}=${remaining[key]}`;
      delete remaining[key];
    }
  }

  // Append new keys
  for (const [key, val] of Object.entries(remaining)) {
    lines.push(`${key}=${val}`);
  }

  await writeFile(ENV_FILE, lines.join("\n") + "\n");
}

/**
 * Get a config value from env var or .env file.
 */
export async function getConfig(key) {
  if (process.env[key]) return process.env[key];
  const env = await readEnv();
  return env[key] || null;
}

/**
 * Get the sidecar URL (env var or default).
 */
export async function getSidecarUrl() {
  const url = await getConfig("SIDECAR_URL");
  if (url) return url.replace(/\/$/, "");
  const port = (await getConfig("PORT")) || "8080";
  return `http://localhost:${port}`;
}

/**
 * Get the SITE_URL from env or .env.
 */
export async function getSiteUrl() {
  return getConfig("SITE_URL");
}
