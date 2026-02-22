/**
 * OpenFeeder Next.js Adapter — Text chunker
 *
 * Strips HTML tags and splits content into ~500-word chunks aligned on
 * paragraph boundaries. Mirrors the behaviour of the WordPress/Joomla adapters.
 */

import { createHash } from "crypto";
import type { OpenFeederChunk } from "./types";

const WORDS_PER_CHUNK = 500;

/** Strip HTML tags and normalise whitespace. */
function cleanHtml(html: string): string {
  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, " ");
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
  // Normalise whitespace — collapse spaces/tabs but preserve paragraph breaks
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function detectType(
  text: string
): "paragraph" | "heading" | "list" | "code" | "quote" {
  const lines = text.trim().split("\n");
  const totalLines = lines.length;

  // Heading: single short line
  if (totalLines === 1 && countWords(text) < 15) {
    return "heading";
  }

  // List: majority of lines start with bullet/number patterns
  const listLines = lines.filter((l) =>
    /^(\d+[.)]\s|[-*+]\s)/.test(l.trim())
  ).length;
  if (totalLines > 0 && listLines / totalLines >= 0.5) {
    return "list";
  }

  return "paragraph";
}

/**
 * Clean HTML content and split into OpenFeeder-compliant chunks.
 *
 * @param html  Raw HTML or plain text content
 * @param url   Item URL (used for deterministic chunk IDs)
 */
export function chunkContent(html: string, url: string): OpenFeederChunk[] {
  const text = cleanHtml(html);
  if (!text) return [];

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [];

  const chunkTexts: string[] = [];
  let current = "";
  let currentWords = 0;

  for (const para of paragraphs) {
    const paraWords = countWords(para);

    if (currentWords > 0 && currentWords + paraWords > WORDS_PER_CHUNK) {
      chunkTexts.push(current);
      current = para;
      currentWords = paraWords;
    } else {
      current = current === "" ? para : `${current}\n\n${para}`;
      currentWords += paraWords;
    }
  }

  if (current !== "") {
    chunkTexts.push(current);
  }

  const idPrefix = createHash("md5").update(url).digest("hex");

  return chunkTexts.map((chunkText, i) => ({
    id: `${idPrefix}_${i}`,
    text: chunkText,
    type: detectType(chunkText),
    relevance: null,
  }));
}

/** Return a short summary (first ~40 words) from HTML content. */
export function summarise(html: string, words = 40): string {
  const text = cleanHtml(html);
  const wordList = text.split(/\s+/).filter(Boolean);
  if (wordList.length <= words) return text;
  return wordList.slice(0, words).join(" ") + "...";
}
