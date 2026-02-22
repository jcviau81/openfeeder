<?php

/**
 * @package     Joomla.Plugin
 * @subpackage  System.OpenFeeder
 *
 * @copyright   OpenFeeder
 * @license     GNU General Public License version 2 or later
 */

namespace Joomla\Plugin\System\OpenFeeder\Helper;

defined('_JEXEC') or die;

class Chunker
{
    private const TARGET_CHARS = 500;

    /**
     * Clean HTML content and split into spec-compliant chunks.
     *
     * @param  string  $html  Raw article HTML (introtext + fulltext)
     * @param  string  $url   Article URL (used for chunk ID generation)
     *
     * @return array   Array of chunk objects
     */
    public static function chunk(string $html, string $url): array
    {
        $text = self::clean($html);

        if (trim($text) === '') {
            return [];
        }

        // Split on paragraph boundaries (double newlines)
        $paragraphs = preg_split('/\n{2,}/', $text);
        $paragraphs = array_filter(array_map('trim', $paragraphs));
        $paragraphs = array_values($paragraphs);

        $chunks       = [];
        $currentChunk = '';
        $idPrefix     = md5($url);

        foreach ($paragraphs as $paragraph) {
            $combined = trim($currentChunk . "\n\n" . $paragraph);

            if ($currentChunk !== '' && mb_strlen($combined) > self::TARGET_CHARS) {
                $chunks[]     = $currentChunk;
                $currentChunk = $paragraph;
            } else {
                $currentChunk = $currentChunk === '' ? $paragraph : $combined;
            }
        }

        if (trim($currentChunk) !== '') {
            $chunks[] = $currentChunk;
        }

        $result = [];

        foreach ($chunks as $index => $chunkText) {
            $result[] = [
                'id'        => $idPrefix . '_' . $index,
                'text'      => $chunkText,
                'type'      => self::detectType($chunkText),
                'relevance' => null,
            ];
        }

        return $result;
    }

    /**
     * Strip HTML, shortcodes, and normalize whitespace.
     */
    private static function clean(string $html): string
    {
        // Remove common CMS shortcodes/tags
        $html = preg_replace('/\{[^}]*\}/', '', $html);

        // Strip all HTML tags
        $text = strip_tags($html);

        // Decode entities
        $text = html_entity_decode($text, ENT_QUOTES, 'UTF-8');

        // Normalize whitespace: collapse spaces/tabs but preserve paragraph breaks
        $text = preg_replace('/[ \t]+/', ' ', $text);
        $text = preg_replace('/\n{3,}/', "\n\n", $text);

        return trim($text);
    }

    /**
     * Detect chunk type based on content patterns.
     */
    private static function detectType(string $text): string
    {
        $lines      = explode("\n", trim($text));
        $totalLines = count($lines);

        // Heading: single line, under 15 words
        if ($totalLines === 1 && str_word_count($text) < 15) {
            return 'heading';
        }

        // List: majority of lines start with bullet/number patterns
        $listLines = 0;

        foreach ($lines as $line) {
            $trimmed = trim($line);

            if (preg_match('/^(\d+[\.\)]\s|[-*+]\s)/', $trimmed)) {
                $listLines++;
            }
        }

        if ($totalLines > 0 && ($listLines / $totalLines) >= 0.5) {
            return 'list';
        }

        return 'paragraph';
    }
}
