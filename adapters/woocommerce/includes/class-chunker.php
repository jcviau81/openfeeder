<?php
/**
 * OpenFeeder WooCommerce HTML cleaner and paragraph chunker.
 *
 * Strips HTML from WooCommerce product descriptions and splits the result
 * into paragraph chunks for LLM consumption.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class OpenFeeder_WC_Chunker {

	/**
	 * Target words per chunk (product descriptions are typically shorter).
	 *
	 * @var int
	 */
	const WORDS_PER_CHUNK = 300;

	/**
	 * Clean product HTML description for LLM consumption.
	 *
	 * Strips shortcodes, HTML tags, and normalises whitespace.
	 *
	 * @param string $content Raw product description (HTML).
	 * @return string Cleaned plain-text content.
	 */
	public function clean( $content ) {
		if ( empty( $content ) ) {
			return '';
		}

		// Strip shortcodes.
		$content = strip_shortcodes( $content );

		// Apply WordPress filters (wpautop etc.) then strip HTML.
		$content = wp_strip_all_tags( $content, true );

		// Decode HTML entities.
		$content = html_entity_decode( $content, ENT_QUOTES | ENT_HTML5, 'UTF-8' );

		// Normalise whitespace: collapse runs of spaces/tabs, keep paragraph breaks.
		$content = preg_replace( '/[ \t]+/', ' ', $content );
		$content = preg_replace( '/\n{3,}/', "\n\n", $content );

		return trim( $content );
	}

	/**
	 * Generate a brief summary from the product short description or description.
	 *
	 * @param string $short_description Short description (HTML).
	 * @param string $description       Full description (HTML).
	 * @return string Plain-text summary (~50 words max).
	 */
	public function summarize( $short_description, $description ) {
		$source = ! empty( $short_description ) ? $short_description : $description;
		$text   = $this->clean( $source );

		if ( empty( $text ) ) {
			return '';
		}

		// Truncate to ~50 words.
		$words = preg_split( '/\s+/', $text );
		if ( count( $words ) > 50 ) {
			$text = implode( ' ', array_slice( $words, 0, 50 ) ) . '…';
		}

		return $text;
	}

	/**
	 * Split cleaned content into paragraph chunks.
	 *
	 * @param string $content    Cleaned plain-text content.
	 * @param string $product_id Product ID (used for chunk ID generation).
	 * @return array Array of chunk objects matching the OpenFeeder spec.
	 */
	public function chunk( $content, $product_id = '' ) {
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

			if ( $current_wc > 0 && ( $current_wc + $para_wc ) > self::WORDS_PER_CHUNK ) {
				$chunks[]     = $current_text;
				$current_text = $para;
				$current_wc   = $para_wc;
			} else {
				$current_text .= ( '' !== $current_text ? "\n\n" : '' ) . $para;
				$current_wc   += $para_wc;
			}
		}

		if ( '' !== $current_text ) {
			$chunks[] = $current_text;
		}

		// Build spec-compliant chunk objects.
		$result     = array();
		$id_prefix  = 'p' . $product_id;

		foreach ( $chunks as $i => $text ) {
			$result[] = array(
				'id'        => $id_prefix . '_' . $i,
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
	 * @return string One of: paragraph, list.
	 */
	private function detect_type( $text ) {
		$lines      = explode( "\n", trim( $text ) );
		$list_lines = 0;

		foreach ( $lines as $line ) {
			$line = trim( $line );
			if ( preg_match( '/^(\d+[\.\)]\s|[-*•]\s)/', $line ) ) {
				$list_lines++;
			}
		}

		if ( $list_lines > 0 && $list_lines >= count( $lines ) / 2 ) {
			return 'list';
		}

		return 'paragraph';
	}
}
