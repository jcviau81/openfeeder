/**
 * Tests for the text chunker module.
 *
 * Run with: node adapters/express/tests/test-chunker.js
 * No external dependencies required — uses Node.js built-in assert.
 */

'use strict';

const assert = require('assert');
const path = require('path');

const { chunkContent, summarise } = require(path.join(__dirname, '../src/chunker'));

// ---------------------------------------------------------------------------
// Simple test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function check(condition, label) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

function section(title) {
  console.log(`\nUnit: ${title}`);
}

// ---------------------------------------------------------------------------
// Helper to generate text with a given word count
// ---------------------------------------------------------------------------

function generateWords(n) {
  const words = [];
  for (let i = 0; i < n; i++) words.push('word' + i);
  return words.join(' ');
}

// ---------------------------------------------------------------------------
// Tests — chunkContent
// ---------------------------------------------------------------------------

section('chunkContent — empty / whitespace input');

check(chunkContent('', '/test').length === 0, 'empty string returns empty array');
check(chunkContent('   ', '/test').length === 0, 'whitespace-only returns empty array');
check(chunkContent('  \n\n  ', '/test').length === 0, 'newlines-only returns empty array');

section('chunkContent — short content returns single chunk');

const short = chunkContent('Hello, this is a short paragraph.', '/short');
check(short.length === 1, 'single paragraph → 1 chunk');
check(typeof short[0].id === 'string', 'chunk has id');
check(short[0].text === 'Hello, this is a short paragraph.', 'chunk text matches input');
check(short[0].type === 'heading', 'short single line detected as heading');
check(short[0].relevance === null, 'relevance is null');

section('chunkContent — HTML stripping');

const html = chunkContent('<p>Hello <b>world</b></p><p>Second paragraph.</p>', '/html');
check(html.length >= 1, 'HTML input produces chunks');
check(!html[0].text.includes('<'), 'HTML tags are stripped');
check(html[0].text.includes('Hello'), 'text content preserved');
check(html[0].text.includes('world'), 'inner tag content preserved');

section('chunkContent — HTML entity decoding');

const entities = chunkContent('&amp; &lt; &gt; &quot; &#039; &nbsp;', '/entities');
check(entities.length === 1, 'entity input produces chunk');
check(entities[0].text.includes('&'), 'amp decoded');
check(entities[0].text.includes('<'), 'lt decoded');
check(entities[0].text.includes('>'), 'gt decoded');
check(entities[0].text.includes('"'), 'quot decoded');
check(entities[0].text.includes("'"), 'apos decoded');

section('chunkContent — splits long text into multiple chunks');

// Create content with > 500 words spread across several paragraphs
const paras = [];
for (let i = 0; i < 10; i++) {
  paras.push(generateWords(100));
}
const longText = paras.join('\n\n');

const chunks = chunkContent(longText, '/long');
check(chunks.length > 1, `long text (1000 words) split into ${chunks.length} chunks`);

// Verify chunk structure
for (let i = 0; i < chunks.length; i++) {
  check(typeof chunks[i].id === 'string', `chunk[${i}] has string id`);
  check(typeof chunks[i].text === 'string', `chunk[${i}] has string text`);
  check(chunks[i].text.length > 0, `chunk[${i}] is non-empty`);
  check(typeof chunks[i].type === 'string', `chunk[${i}] has string type`);
  check(chunks[i].relevance === null, `chunk[${i}] relevance is null`);
}

section('chunkContent — respects ~500 word max per chunk');

for (const chunk of chunks) {
  const wordCount = chunk.text.trim().split(/\s+/).filter(Boolean).length;
  // Allow some overflow since chunks align on paragraph boundaries
  check(wordCount <= 600, `chunk has ${wordCount} words (≤600 with paragraph boundary tolerance)`);
}

section('chunkContent — deterministic chunk IDs');

const c1 = chunkContent('Same content here.', '/same-url');
const c2 = chunkContent('Same content here.', '/same-url');
check(c1[0].id === c2[0].id, 'same URL produces same chunk IDs');

const c3 = chunkContent('Same content here.', '/different-url');
check(c1[0].id !== c3[0].id, 'different URL produces different chunk IDs');

section('chunkContent — type detection: heading');

const heading = chunkContent('Introduction', '/heading');
check(heading[0].type === 'heading', 'short single line → heading');

section('chunkContent — type detection: list');

const listText = '- Item one\n- Item two\n- Item three\n- Item four';
const listChunks = chunkContent(listText, '/list');
check(listChunks[0].type === 'list', 'bullet list → list type');

const numberedList = '1. First\n2. Second\n3. Third\n4. Fourth';
const numberedChunks = chunkContent(numberedList, '/numlist');
check(numberedChunks[0].type === 'list', 'numbered list → list type');

section('chunkContent — type detection: paragraph');

const paraText = 'This is a longer paragraph that contains several sentences. ' +
  'It talks about various things at length. There is enough content here to be classified ' +
  'as a paragraph type since it has more than fifteen words on multiple conceptual lines.';
const paraChunks = chunkContent(paraText, '/para');
check(paraChunks[0].type === 'paragraph', 'multi-sentence text → paragraph');

section('chunkContent — preserves paragraph boundaries');

const twoPara = 'First paragraph with some words.\n\nSecond paragraph with more words.';
const twoChunks = chunkContent(twoPara, '/two');
check(twoChunks.length === 1, 'two short paragraphs fit in one chunk');
check(twoChunks[0].text.includes('First paragraph'), 'first para present');
check(twoChunks[0].text.includes('Second paragraph'), 'second para present');

// ---------------------------------------------------------------------------
// Tests — summarise
// ---------------------------------------------------------------------------

section('summarise()');

check(summarise('') === '', 'empty input returns empty string');

const shortText = 'This is a short summary.';
check(summarise(shortText) === shortText, 'short text returned as-is');

const longSumText = generateWords(100);
const summary = summarise(longSumText);
const summaryWords = summary.split(/\s+/).filter(Boolean);
check(summary.endsWith('...'), 'long text summary ends with ...');
// 40 words + the word that has "..." appended
check(summaryWords.length <= 41, `summary is ~40 words (got ${summaryWords.length})`);

// Custom word count
const summary20 = summarise(longSumText, 20);
const summary20Words = summary20.split(/\s+/).filter(Boolean);
check(summary20.endsWith('...'), 'custom word count summary ends with ...');
check(summary20Words.length <= 21, `summary with words=20 is ~20 words (got ${summary20Words.length})`);

// HTML stripping in summaries
const htmlSummary = summarise('<p>Hello <b>world</b> test content</p>');
check(!htmlSummary.includes('<'), 'summarise strips HTML');
check(htmlSummary.includes('Hello'), 'summarise preserves text content');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(55));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
