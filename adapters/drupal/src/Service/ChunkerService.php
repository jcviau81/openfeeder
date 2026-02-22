<?php

namespace Drupal\openfeeder\Service;

/**
 * Content cleaner and chunker for OpenFeeder.
 *
 * Strips HTML tags from node content and splits the result into ~500-character
 * chunks aligned on paragraph boundaries.
 */
class ChunkerService {

  /**
   * Target characters per chunk.
   */
  const CHARS_PER_CHUNK = 500;

  /**
   * Clean raw HTML content for LLM consumption.
   *
   * Strips all HTML tags and normalizes whitespace.
   *
   * @param string $content
   *   Raw HTML content from a node body field.
   *
   * @return string
   *   Cleaned plain-text content.
   */
  public function clean(string $content): string {
    // Strip all HTML tags.
    $content = strip_tags($content);

    // Decode HTML entities.
    $content = html_entity_decode($content, ENT_QUOTES | ENT_HTML5, 'UTF-8');

    // Normalize whitespace: collapse runs of spaces/tabs, keep paragraph breaks.
    $content = preg_replace('/[ \t]+/', ' ', $content);
    $content = preg_replace('/\n{3,}/', "\n\n", $content);

    return trim($content);
  }

  /**
   * Split cleaned content into chunks of approximately CHARS_PER_CHUNK chars.
   *
   * Splits on paragraph boundaries (double newline) first, then groups
   * paragraphs into chunks that stay near the target character count.
   *
   * @param string $content
   *   Cleaned plain-text content.
   * @param string $node_url
   *   Node URL (used for chunk ID generation).
   *
   * @return array
   *   Array of chunk arrays matching the OpenFeeder spec schema.
   */
  public function chunk(string $content, string $node_url = ''): array {
    if (empty(trim($content))) {
      return [];
    }

    $paragraphs = preg_split('/\n{2,}/', $content);
    $paragraphs = array_values(array_filter(array_map('trim', $paragraphs)));

    if (empty($paragraphs)) {
      return [];
    }

    $chunks = [];
    $current_text = '';
    $current_len = 0;

    foreach ($paragraphs as $para) {
      $para_len = mb_strlen($para);

      // If adding this paragraph exceeds the target and we have content, flush.
      if ($current_len > 0 && ($current_len + $para_len) > self::CHARS_PER_CHUNK) {
        $chunks[] = $current_text;
        $current_text = $para;
        $current_len = $para_len;
      }
      else {
        $current_text .= ($current_text !== '' ? "\n\n" : '') . $para;
        $current_len += $para_len;
      }
    }

    // Flush remaining.
    if ($current_text !== '') {
      $chunks[] = $current_text;
    }

    // Build spec-compliant chunk objects.
    $result = [];
    $post_id = md5($node_url);

    foreach ($chunks as $i => $text) {
      $result[] = [
        'id' => $post_id . '_' . $i,
        'text' => $text,
        'type' => $this->detectType($text),
        'relevance' => NULL,
      ];
    }

    return $result;
  }

  /**
   * Trim text to a given number of words.
   *
   * @param string $text
   *   The text to trim.
   * @param int $num_words
   *   Maximum number of words.
   *
   * @return string
   *   Trimmed text with trailing ellipsis if truncated.
   */
  public function trimWords(string $text, int $num_words): string {
    $words = preg_split('/\s+/', trim($text), $num_words + 1);
    if (count($words) > $num_words) {
      array_pop($words);
      return implode(' ', $words) . '...';
    }
    return implode(' ', $words);
  }

  /**
   * Detect the chunk type based on content heuristics.
   *
   * @param string $text
   *   Chunk text.
   *
   * @return string
   *   One of: paragraph, heading, list, code, quote.
   */
  protected function detectType(string $text): string {
    $trimmed = trim($text);
    $lines = explode("\n", $trimmed);

    // Lines starting with bullet/number patterns suggest a list.
    $list_lines = 0;
    foreach ($lines as $line) {
      $line = trim($line);
      if (preg_match('/^(\d+[\.\)]\s|[-*]\s)/', $line)) {
        $list_lines++;
      }
    }
    if ($list_lines > 0 && $list_lines >= count($lines) / 2) {
      return 'list';
    }

    // Short text on a single line is likely a heading.
    if (count($lines) === 1 && str_word_count($trimmed) < 15) {
      return 'heading';
    }

    return 'paragraph';
  }

}
