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
	 * Sanitize the ?url= parameter: extract pathname only, reject path traversal.
	 * Absolute URLs are stripped to pathname. Returns null on invalid input.
	 *
	 * @param string $raw Raw URL parameter.
	 * @return string|null Sanitized path or null on failure.
	 */
	private function sanitize_url_param( string $raw ): ?string {
		$raw = trim( $raw );
		if ( empty( $raw ) ) {
			return null;
		}
		$parsed = parse_url( $raw );
		$path   = rtrim( $parsed['path'] ?? '/', '/' ) ?: '/';
		if ( str_contains( $path, '..' ) ) {
			return null;
		}
		return $path;
	}

	/**
	 * Add rate limit headers to the current response.
	 * These are informational — actual enforcement is at the server/Nginx level.
	 */
	private function add_rate_limit_headers(): void {
		$reset = time() + 60;
		header( 'X-RateLimit-Limit: 60' );
		header( 'X-RateLimit-Remaining: 60' );
		header( 'X-RateLimit-Reset: ' . $reset );
	}

	/**
	 * Route the request to the appropriate handler.
	 */
	public function serve() {
		// API key check: if openfeeder_api_key is set, require Authorization: Bearer <key>
		$api_key = get_option( 'openfeeder_api_key', '' );
		if ( ! empty( $api_key ) ) {
			$auth_header = isset( $_SERVER['HTTP_AUTHORIZATION'] ) ? trim( $_SERVER['HTTP_AUTHORIZATION'] ) : '';
			if ( $auth_header !== 'Bearer ' . $api_key ) {
				$this->add_rate_limit_headers();
				wp_send_json(
					array(
						'schema' => 'openfeeder/1.0',
						'error'  => array(
							'code'    => 'UNAUTHORIZED',
							'message' => 'Valid API key required. Include Authorization: Bearer <key> header.',
						),
					),
					401
				);
				return;
			}
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$raw_url = isset( $_GET['url'] ) ? sanitize_text_field( wp_unslash( $_GET['url'] ) ) : '';

		if ( ! empty( $raw_url ) ) {
			$url = $this->sanitize_url_param( $raw_url );
			if ( null === $url ) {
				$this->add_rate_limit_headers();
				$this->send_error( 'INVALID_URL', 'The ?url= parameter must be a valid relative path.', 400 );
				return;
			}
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
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$q     = isset( $_GET['q'] ) ? mb_substr( sanitize_text_field( wp_unslash( $_GET['q'] ) ), 0, 200 ) : '';
		$cache = new OpenFeeder_Cache();

		// Check cache (only when no search query).
		if ( empty( $q ) ) {
			$cache_key = $cache->index_key( $page );
			$cached    = $cache->get( $cache_key );

			if ( false !== $cached ) {
				$this->send_json( $cached['data'], 'HIT' );
				return;
			}
		}

		$query_args = array(
			'post_type'      => 'post',
			'post_status'    => 'publish',
			'posts_per_page' => self::POSTS_PER_PAGE,
			'paged'          => $page,
			'orderby'        => 'date',
			'order'          => 'DESC',
		);

		if ( ! empty( $q ) ) {
			$query_args['s'] = $q;
		}

		$query = new WP_Query( $query_args );

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

		if ( empty( $q ) ) {
			$cache->set( $cache_key, $data );
		}

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
	 * Compute the RFC 7231 Last-Modified date from response data.
	 *
	 * Uses the most recently published item for index responses, or the
	 * item's own published date for single-post responses.
	 *
	 * @param array $data Response data array.
	 * @return string RFC 7231 formatted date string.
	 */
	private function get_last_modified_from_data( array $data ): string {
		$timestamps = array();

		// Single post: use its published/updated date.
		if ( isset( $data['published'] ) ) {
			$t = strtotime( $data['published'] );
			if ( $t ) {
				$timestamps[] = $t;
			}
		}
		if ( isset( $data['updated'] ) ) {
			$t = strtotime( $data['updated'] );
			if ( $t ) {
				$timestamps[] = $t;
			}
		}

		// Index: use the most recent item's published date.
		if ( isset( $data['items'] ) && is_array( $data['items'] ) ) {
			foreach ( $data['items'] as $item ) {
				if ( isset( $item['published'] ) ) {
					$t = strtotime( $item['published'] );
					if ( $t ) {
						$timestamps[] = $t;
					}
				}
			}
		}

		$max_ts = ! empty( $timestamps ) ? max( $timestamps ) : time();
		return gmdate( 'D, d M Y H:i:s T', $max_ts );
	}

	/**
	 * Send a JSON response with OpenFeeder headers and HTTP caching support.
	 *
	 * Computes an ETag from the response body and checks If-None-Match to
	 * support 304 Not Modified responses for CDN and proxy caches.
	 *
	 * @param array  $data        Response data.
	 * @param string $cache_state 'HIT' or 'MISS'.
	 */
	private function send_json( $data, $cache_state = 'MISS' ) {
		$json = wp_json_encode( $data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );
		$etag = '"' . substr( md5( $json ), 0, 16 ) . '"';
		$last_modified = $this->get_last_modified_from_data( $data );

		// Conditional request: 304 Not Modified.
		$if_none_match = isset( $_SERVER['HTTP_IF_NONE_MATCH'] )
			? trim( $_SERVER['HTTP_IF_NONE_MATCH'] ) : '';
		if ( $if_none_match === $etag ) {
			status_header( 304 );
			exit;
		}

		header( 'Content-Type: application/json; charset=utf-8' );
		header( 'X-OpenFeeder: 1.0' );
		header( 'Access-Control-Allow-Origin: *' );
		header( 'X-OpenFeeder-Cache: ' . $cache_state );
		header( 'Cache-Control: public, max-age=300, stale-while-revalidate=60' );
		header( 'ETag: ' . $etag );
		header( 'Last-Modified: ' . $last_modified );
		header( 'Vary: Accept-Encoding' );
		$this->add_rate_limit_headers();

		echo $json; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
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
		$this->add_rate_limit_headers();

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
