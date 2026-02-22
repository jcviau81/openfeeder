<?php
/**
 * OpenFeeder content cleaner and chunker.
 *
 * Strips WordPress noise (shortcodes, widgets, ads, navigation blocks) from
 * post content and splits the result into ~500-word chunks aligned on
 * paragraph boundaries.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class OpenFeeder_Chunker {

	/**
	 * Target words per chunk.
	 *
	 * @var int
	 */
	const WORDS_PER_CHUNK = 500;

	/**
	 * Shortcode tags to strip entirely (output and content).
	 *
	 * @var array
	 */
	private static $strip_shortcodes = array(
		'gallery',
		'embed',
		'video',
		'audio',
		'playlist',
		'caption',
		'ad',
		'adsense',
		'sidebar',
		'widget',
		'social',
		'share',
		'related_posts',
	);

	/**
	 * Clean a post's content for LLM consumption.
	 *
	 * Removes shortcodes that produce ads/embeds/widgets, strips HTML tags,
	 * and normalises whitespace.
	 *
	 * @param string $content Raw post_content.
	 * @return string Cleaned plain-text content.
	 */
	public function clean( $content ) {
		// Remove specific noisy shortcodes.
		foreach ( self::$strip_shortcodes as $tag ) {
			$content = preg_replace(
				'/\[' . preg_quote( $tag, '/' ) . '[^\]]*\](?:.*?\[\/' . preg_quote( $tag, '/' ) . '\])?/s',
				'',
				$content
			);
		}

		// Strip any remaining shortcodes.
		$content = strip_shortcodes( $content );

		// Remove WordPress navigation and widget blocks (<!-- wp:navigation --> etc.).
		$content = preg_replace(
			'/<!--\s*wp:(navigation|widget|social-links|search|tag-cloud|categories|archives|calendar|rss|latest-comments)[\s\S]*?-->/s',
			'',
			$content
		);

		// Apply WordPress content filters (wpautop, etc.) then strip HTML.
		$content = apply_filters( 'the_content', $content );
		$content = wp_strip_all_tags( $content );

		// Normalise whitespace: collapse runs of spaces/tabs, keep double newlines as paragraph separators.
		$content = preg_replace( '/[ \t]+/', ' ', $content );
		$content = preg_replace( '/\n{3,}/', "\n\n", $content );

		return trim( $content );
	}

	/**
	 * Split cleaned content into chunks of approximately WORDS_PER_CHUNK words.
	 *
	 * Splits on paragraph boundaries (double newline) first, then groups
	 * paragraphs into chunks that stay near the target word count.
	 *
	 * @param string $content  Cleaned plain-text content.
	 * @param string $post_url Post URL (used for chunk ID generation).
	 * @return array Array of chunk arrays matching the spec schema.
	 */
	public function chunk( $content, $post_url = '' ) {
		if ( empty( $content ) ) {
			return array();
		}

		$paragraphs = preg_split( '/\n{2,}/', $content );
		$paragraphs = array_filter( array_map( 'trim', $paragraphs ) );
		$paragraphs = array_values( $paragraphs );

		if ( empty( $paragraphs ) ) {
			return array();
		}

		$chunks       = array();
		$current_text = '';
		$current_wc   = 0;

		foreach ( $paragraphs as $para ) {
			$para_wc = str_word_count( $para );

			// If adding this paragraph would exceed the target and we already have content, flush.
			if ( $current_wc > 0 && ( $current_wc + $para_wc ) > self::WORDS_PER_CHUNK ) {
				$chunks[]     = $current_text;
				$current_text = $para;
				$current_wc   = $para_wc;
			} else {
				$current_text .= ( '' !== $current_text ? "\n\n" : '' ) . $para;
				$current_wc   += $para_wc;
			}
		}

		// Flush remaining.
		if ( '' !== $current_text ) {
			$chunks[] = $current_text;
		}

		// Build spec-compliant chunk objects.
		$result  = array();
		$post_id = md5( $post_url );

		foreach ( $chunks as $i => $text ) {
			$result[] = array(
				'id'        => $post_id . '_' . $i,
				'text'      => $text,
				'type'      => $this->detect_type( $text ),
				'relevance' => null,
			);
		}

		return $result;
	}

	/**
	 * Detect the chunk type based on content heuristics.
	 *
	 * @param string $text Chunk text.
	 * @return string One of: paragraph, heading, list, code, quote.
	 */
	private function detect_type( $text ) {
		$trimmed = trim( $text );

		// Lines starting with bullet/number patterns suggest a list.
		$lines       = explode( "\n", $trimmed );
		$list_lines  = 0;
		foreach ( $lines as $line ) {
			$line = trim( $line );
			if ( preg_match( '/^(\d+[\.\)]\s|[-*]\s)/', $line ) ) {
				$list_lines++;
			}
		}
		if ( $list_lines > 0 && $list_lines >= count( $lines ) / 2 ) {
			return 'list';
		}

		// Short text (< 15 words) on a single line is likely a heading.
		if ( count( $lines ) === 1 && str_word_count( $trimmed ) < 15 ) {
			return 'heading';
		}

		return 'paragraph';
	}
}
