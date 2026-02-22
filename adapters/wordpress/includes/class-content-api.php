<?php
/**
 * OpenFeeder content API endpoint.
 *
 * Handles GET /openfeeder requests. When a `url` parameter is provided,
 * returns chunked content for that post. Otherwise returns a paginated index
 * of all published posts.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class OpenFeeder_Content_API {

	/**
	 * Number of posts per index page.
	 *
	 * @var int
	 */
	const POSTS_PER_PAGE = 20;

	/**
	 * Route the request to the appropriate handler.
	 */
	public function serve() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$url = isset( $_GET['url'] ) ? sanitize_text_field( wp_unslash( $_GET['url'] ) ) : '';

		if ( ! empty( $url ) ) {
			$this->serve_single( $url );
		} else {
			$this->serve_index();
		}
	}

	/**
	 * Serve chunked content for a single post.
	 *
	 * @param string $url Relative URL of the post.
	 */
	private function serve_single( $url ) {
		$cache  = new OpenFeeder_Cache();
		$post   = $this->find_post_by_url( $url );

		if ( ! $post ) {
			$this->send_error( 'NOT_FOUND', 'No published post found at the given URL.', 404 );
			return;
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$limit = isset( $_GET['limit'] ) ? absint( $_GET['limit'] ) : 10;
		$limit = min( $limit, (int) get_option( 'openfeeder_max_chunks', 50 ) );

		// Check cache.
		$cache_key = $cache->post_key( $post->ID );
		$cached    = $cache->get( $cache_key );

		if ( false !== $cached ) {
			$data              = $cached['data'];
			$data['meta']['cached']            = true;
			$data['meta']['cache_age_seconds']  = $cache->age( $cached );

			// Apply limit.
			$data['chunks']                    = array_slice( $data['chunks'], 0, $limit );
			$data['meta']['returned_chunks']   = count( $data['chunks'] );

			$this->send_json( $data, 'HIT' );
			return;
		}

		// Build response.
		$chunker = new OpenFeeder_Chunker();
		$cleaned = $chunker->clean( $post->post_content );
		$chunks  = $chunker->chunk( $cleaned, get_permalink( $post ) );

		$author = get_the_author_meta( 'display_name', $post->post_author );
		if ( empty( $author ) ) {
			$author = null;
		}

		$excerpt = $post->post_excerpt;
		if ( empty( $excerpt ) ) {
			$excerpt = wp_trim_words( $cleaned, 40, '...' );
		}

		$data = array(
			'schema'    => 'openfeeder/1.0',
			'url'       => get_permalink( $post ),
			'title'     => get_the_title( $post ),
			'author'    => $author,
			'published' => get_post_time( 'c', true, $post ),
			'updated'   => get_post_modified_time( 'c', true, $post ),
			'language'  => get_bloginfo( 'language' ),
			'summary'   => $excerpt,
			'chunks'    => $chunks,
			'meta'      => array(
				'total_chunks'    => count( $chunks ),
				'returned_chunks' => min( count( $chunks ), $limit ),
				'cached'          => false,
				'cache_age_seconds' => null,
			),
		);

		// Store full response in cache (before applying limit).
		$cache->set( $cache_key, $data );

		// Apply limit.
		$data['chunks']                  = array_slice( $data['chunks'], 0, $limit );
		$data['meta']['returned_chunks'] = count( $data['chunks'] );

		$this->send_json( $data, 'MISS' );
	}

	/**
	 * Serve a paginated index of all published posts.
	 */
	private function serve_index() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$page  = isset( $_GET['page'] ) ? max( 1, absint( $_GET['page'] ) ) : 1;
		$cache = new OpenFeeder_Cache();

		// Check cache.
		$cache_key = $cache->index_key( $page );
		$cached    = $cache->get( $cache_key );

		if ( false !== $cached ) {
			$this->send_json( $cached['data'], 'HIT' );
			return;
		}

		$query = new WP_Query( array(
			'post_type'      => 'post',
			'post_status'    => 'publish',
			'posts_per_page' => self::POSTS_PER_PAGE,
			'paged'          => $page,
			'orderby'        => 'date',
			'order'          => 'DESC',
		) );

		$total_pages = (int) $query->max_num_pages;
		$items       = array();

		if ( $query->have_posts() ) {
			while ( $query->have_posts() ) {
				$query->the_post();
				$post = get_post();

				$excerpt = $post->post_excerpt;
				if ( empty( $excerpt ) ) {
					$excerpt = wp_trim_words( wp_strip_all_tags( $post->post_content ), 30, '...' );
				}

				$items[] = array(
					'url'       => wp_make_link_relative( get_permalink( $post ) ),
					'title'     => get_the_title( $post ),
					'published' => get_post_time( 'c', true, $post ),
					'summary'   => $excerpt,
				);
			}
			wp_reset_postdata();
		}

		$data = array(
			'schema'      => 'openfeeder/1.0',
			'type'        => 'index',
			'page'        => $page,
			'total_pages' => $total_pages,
			'items'       => $items,
		);

		$cache->set( $cache_key, $data );

		$this->send_json( $data, 'MISS' );
	}

	/**
	 * Find a published post by its relative or absolute URL.
	 *
	 * @param string $url URL or path to look up.
	 * @return WP_Post|null Post object or null if not found.
	 */
	private function find_post_by_url( $url ) {
		// Normalise: ensure it starts with / and strip the site host.
		$parsed = wp_parse_url( $url );
		$path   = isset( $parsed['path'] ) ? $parsed['path'] : $url;

		// Try url_to_postid first (handles most permalink structures).
		$post_id = url_to_postid( home_url( $path ) );

		if ( $post_id ) {
			$post = get_post( $post_id );
			if ( $post && 'publish' === $post->post_status ) {
				return $post;
			}
		}

		// Fallback: try matching by post name (slug).
		$slug = basename( untrailingslashit( $path ) );
		if ( ! empty( $slug ) ) {
			$posts = get_posts( array(
				'name'        => $slug,
				'post_type'   => 'post',
				'post_status' => 'publish',
				'numberposts' => 1,
			) );
			if ( ! empty( $posts ) ) {
				return $posts[0];
			}
		}

		return null;
	}

	/**
	 * Send a JSON response with OpenFeeder headers.
	 *
	 * @param array  $data        Response data.
	 * @param string $cache_state 'HIT' or 'MISS'.
	 */
	private function send_json( $data, $cache_state = 'MISS' ) {
		header( 'Content-Type: application/json; charset=utf-8' );
		header( 'X-OpenFeeder: 1.0' );
		header( 'Access-Control-Allow-Origin: *' );
		header( 'X-OpenFeeder-Cache: ' . $cache_state );

		echo wp_json_encode( $data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );
		exit;
	}

	/**
	 * Send an error response.
	 *
	 * @param string $code    Error code (e.g. NOT_FOUND).
	 * @param string $message Human-readable message.
	 * @param int    $status  HTTP status code.
	 */
	private function send_error( $code, $message, $status = 400 ) {
		status_header( $status );
		header( 'Content-Type: application/json; charset=utf-8' );
		header( 'X-OpenFeeder: 1.0' );
		header( 'Access-Control-Allow-Origin: *' );

		echo wp_json_encode(
			array(
				'schema' => 'openfeeder/1.0',
				'error'  => array(
					'code'    => $code,
					'message' => $message,
				),
			),
			JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
		);
		exit;
	}
}
