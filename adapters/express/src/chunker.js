/**
 * OpenFeeder Express Adapter — Text chunker
 *
 * Strips HTML tags and splits content into ~500-word chunks aligned on
 * paragraph boundaries. Mirrors the behaviour of the Next.js/Vite adapters.
 */

'use strict';

const { createHash } = require('crypto');

const WORDS_PER_CHUNK = 500;

/**
 * Strip HTML tags and normalise whitespace.
 * @param {string} html
 * @returns {string}
 */
function cleanHtml(html) {
  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, ' ');
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
  // Normalise whitespace — collapse spaces/tabs but preserve paragraph breaks
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

/**
 * @param {string} text
 * @returns {number}
 */
function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * @param {string} text
 * @returns {'paragraph'|'heading'|'list'|'code'|'quote'}
 */
function detectType(text) {
  const trimmed = text.trim();
  const lines = trimmed.split('\n');
  const totalLines = lines.length;

  // Code: fenced code block
  if (/^```/.test(trimmed)) return 'code';

  // Quote: blockquote markdown
  if (/^>/.test(trimmed)) return 'quote';

  // Heading: single short line
  if (totalLines === 1 && countWords(text) < 15) {
    return 'heading';
  }

  // List: majority of lines start with bullet/number patterns
  const listLines = lines.filter((l) =>
    /^(\d+[.)]\s|[-*+]\s)/.test(l.trim())
  ).length;
  if (totalLines > 0 && listLines / totalLines >= 0.5) {
    return 'list';
  }

  return 'paragraph';
}

/**
 * Clean HTML content and split into OpenFeeder-compliant chunks.
 *
 * @param {string} html  Raw HTML or plain text content
 * @param {string} url   Item URL (used for deterministic chunk IDs)
 * @returns {Array<{ id: string, text: string, type: string, relevance: null }>}
 */
function chunkContent(html, url) {
  const text = cleanHtml(html);
  if (!text) return [];

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [];

  const chunkTexts = [];
  let current = '';
  let currentWords = 0;

  for (const para of paragraphs) {
    const paraWords = countWords(para);

    if (currentWords > 0 && currentWords + paraWords > WORDS_PER_CHUNK) {
      chunkTexts.push(current);
      current = para;
      currentWords = paraWords;
    } else {
      current = current === '' ? para : `${current}\n\n${para}`;
      currentWords += paraWords;
    }
  }

  if (current !== '') {
    chunkTexts.push(current);
  }

  const idPrefix = createHash('md5').update(url).digest('hex');

  return chunkTexts.map((chunkText, i) => ({
    id: `${idPrefix}_${i}`,
    text: chunkText,
    type: detectType(chunkText),
    relevance: null,
  }));
}

/**
 * Return a short summary (first ~40 words) from HTML content.
 *
 * @param {string} html
 * @param {number} [words=40]
 * @returns {string}
 */
function summarise(html, words = 40) {
  const text = cleanHtml(html);
  const wordList = text.split(/\s+/).filter(Boolean);
  if (wordList.length <= words) return text;
  return wordList.slice(0, words).join(' ') + '...';
}

module.exports = { chunkContent, summarise };
