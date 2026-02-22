<?php
/**
 * OpenFeeder cache layer using WordPress transients.
 *
 * Provides a simple get/set/invalidate interface backed by the WordPress
 * transients API. Default TTL is 1 hour.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class OpenFeeder_Cache {

	/**
	 * Default cache TTL in seconds (1 hour).
	 *
	 * @var int
	 */
	const TTL = 3600;

	/**
	 * Prefix for all transient keys.
	 *
	 * @var string
	 */
	const PREFIX = 'openfeeder_';

	/**
	 * Get a cached value.
	 *
	 * @param string $key Cache key (without prefix).
	 * @return array|false Array with 'data' and 'created' keys, or false on miss.
	 */
	public function get( $key ) {
		$value = get_transient( self::PREFIX . $key );

		if ( false === $value ) {
			return false;
		}

		return $value;
	}

	/**
	 * Store a value in cache.
	 *
	 * @param string $key  Cache key (without prefix).
	 * @param mixed  $data Data to cache.
	 * @return bool True on success.
	 */
	public function set( $key, $data ) {
		$value = array(
			'data'    => $data,
			'created' => time(),
		);

		return set_transient( self::PREFIX . $key, $value, self::TTL );
	}

	/**
	 * Build a cache key for a single post.
	 *
	 * @param int $post_id Post ID.
	 * @return string Cache key.
	 */
	public function post_key( $post_id ) {
		return 'post_' . (int) $post_id;
	}

	/**
	 * Build a cache key for an index page.
	 *
	 * @param int $page Page number.
	 * @return string Cache key.
	 */
	public function index_key( $page ) {
		return 'index_' . (int) $page;
	}

	/**
	 * Invalidate the cache for a specific post.
	 *
	 * @param int $post_id Post ID.
	 */
	public function invalidate_post( $post_id ) {
		delete_transient( self::PREFIX . $this->post_key( $post_id ) );
	}

	/**
	 * Invalidate all index pages.
	 *
	 * Deletes index page caches for pages 1 through 100 (best-effort).
	 */
	public function invalidate_index() {
		for ( $i = 1; $i <= 100; $i++ ) {
			delete_transient( self::PREFIX . $this->index_key( $i ) );
		}
	}

	/**
	 * Calculate the age of a cached entry in seconds.
	 *
	 * @param array $cached Cached value from get().
	 * @return int Age in seconds.
	 */
	public function age( $cached ) {
		if ( ! isset( $cached['created'] ) ) {
			return 0;
		}
		return time() - $cached['created'];
	}
}
