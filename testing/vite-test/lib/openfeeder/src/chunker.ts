/**
 * OpenFeeder Vite Adapter — Text chunker
 *
 * Strips HTML tags and splits content into ~500-word chunks aligned on
 * paragraph boundaries.
 */

import { createHash } from "crypto";
import type { OpenFeederChunk } from "./types";

const WORDS_PER_CHUNK = 500;

function cleanHtml(html: string): string {
  let text = html.replace(/<[^>]*>/g, " ");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
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

  if (totalLines === 1 && countWords(text) < 15) {
    return "heading";
  }

  const listLines = lines.filter((l) =>
    /^(\d+[.)]\s|[-*+]\s)/.test(l.trim())
  ).length;

  if (totalLines > 0 && listLines / totalLines >= 0.5) {
    return "list";
  }

  return "paragraph";
}

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

export function summarise(html: string, words = 40): string {
  const text = cleanHtml(html);
  const wordList = text.split(/\s+/).filter(Boolean);
  if (wordList.length <= words) return text;
  return wordList.slice(0, words).join(" ") + "...";
}
