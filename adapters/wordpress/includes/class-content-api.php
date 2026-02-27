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
	 * Route the request to the appropriate handler.
	 */
	public function serve() {
		// API key check: if openfeeder_api_key is set, require Authorization: Bearer <key>
		$api_key = get_option( 'openfeeder_api_key', '' );
		if ( ! empty( $api_key ) ) {
			$auth_header = '';
			if ( isset( $_SERVER['HTTP_AUTHORIZATION'] ) ) {
				$auth_header = trim( $_SERVER['HTTP_AUTHORIZATION'] );
			} elseif ( isset( $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ) ) {
				// Apache mod_php strips Authorization header; this fallback requires:
				// RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
				$auth_header = trim( $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] );
			}
			if ( ! hash_equals( 'Bearer ' . $api_key, $auth_header ) ) {
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
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$q = isset( $_GET['q'] ) ? sanitize_text_field( wp_unslash( $_GET['q'] ) ) : '';
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$since_raw = isset( $_GET['since'] ) ? sanitize_text_field( wp_unslash( $_GET['since'] ) ) : '';
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$until_raw = isset( $_GET['until'] ) ? sanitize_text_field( wp_unslash( $_GET['until'] ) ) : '';

		// Differential sync: ?since= and/or ?until= without ?q= (search takes priority).
		if ( ( ! empty( $since_raw ) || ! empty( $until_raw ) ) && empty( $q ) ) {
			$this->serve_diff_sync( $since_raw, $until_raw );
			return;
		}

		if ( ! empty( $raw_url ) ) {
			$url = $this->sanitize_url_param( $raw_url );
			if ( null === $url ) {
						$this->send_error( 'INVALID_URL', 'The ?url= parameter must be a valid relative path.', 400 );
				return;
			}
			$this->serve_single( $url );
		} else {
			$this->serve_index();
		}
	}

	/**
	 * Parse a ?since= value — accepts RFC 3339 datetime or a base64 sync_token.
	 *
	 * @param string $raw Raw since parameter value.
	 * @return int|false Unix timestamp or false on failure.
	 */
	private function parse_since( string $raw ) {
		// Try RFC 3339 first.
		$ts = strtotime( $raw );
		if ( false !== $ts && $ts > 0 ) {
			return $ts;
		}

		// Try sync_token (base64-encoded JSON with "t" key).
		$decoded = base64_decode( $raw, true );
		if ( false !== $decoded ) {
			$payload = json_decode( $decoded, true );
			if ( is_array( $payload ) && isset( $payload['t'] ) ) {
				$ts = strtotime( $payload['t'] );
				if ( false !== $ts && $ts > 0 ) {
					return $ts;
				}
			}
		}

		return false;
	}

	/**
	 * Generate a sync_token from a timestamp.
	 *
	 * @param string $as_of_iso ISO 8601 timestamp.
	 * @return string Base64-encoded sync_token.
	 */
	private function make_sync_token( string $as_of_iso ): string {
		return base64_encode( wp_json_encode( array( 't' => $as_of_iso ) ) );
	}

	/**
	 * Serve a differential sync response.
	 *
	 * @param string $since_raw Raw ?since= parameter value (may be empty).
	 * @param string $until_raw Raw ?until= parameter value (may be empty).
	 */
	private function serve_diff_sync( string $since_raw, string $until_raw = '' ) {
		$since_ts = false;
		$until_ts = false;

		if ( ! empty( $since_raw ) ) {
			$since_ts = $this->parse_since( $since_raw );
			if ( false === $since_ts ) {
				$this->send_error( 'INVALID_PARAM', 'Invalid ?since= value. Provide an RFC3339 datetime or a valid sync_token.', 400 );
				return;
			}
		}

		if ( ! empty( $until_raw ) ) {
			$until_ts = strtotime( $until_raw );
			if ( false === $until_ts || $until_ts <= 0 ) {
				$this->send_error( 'INVALID_PARAM', 'Invalid ?until= value. Provide an RFC3339 datetime.', 400 );
				return;
			}
		}

		if ( false !== $since_ts && false !== $until_ts && $until_ts < $since_ts ) {
			$this->send_error( 'INVALID_PARAM', '?until= must be after ?since=.', 400 );
			return;
		}

		$since_iso = false !== $since_ts ? gmdate( 'c', $since_ts ) : null;
		$until_iso = false !== $until_ts ? gmdate( 'c', $until_ts ) : null;
		$as_of     = gmdate( 'c' );

		// Build date_query: closed range from ?since= to ?until=.
		$date_conditions = array( 'relation' => 'AND' );
		if ( null !== $since_iso ) {
			$date_conditions[] = array(
				'column' => 'post_modified_gmt',
				'after'  => $since_iso,
			);
		}
		if ( null !== $until_iso ) {
			$date_conditions[] = array(
				'column'    => 'post_modified_gmt',
				'before'    => $until_iso,
				'inclusive' => true,
			);
		}

		// Query posts modified within the given date range.
		$query_args = array(
			'post_type'      => $this->get_allowed_post_types(),
			'post_status'    => 'publish',
			'has_password'   => false,
			'posts_per_page' => -1,
			'date_query'     => $date_conditions,
		);

		$query = new WP_Query( $query_args );

		$added   = array();
		$updated = array();

		if ( $query->have_posts() ) {
			while ( $query->have_posts() ) {
				$query->the_post();
				$post = get_post();

				$rel_url = wp_make_link_relative( get_permalink( $post ) );
				if ( $this->is_excluded_path( $rel_url ) ) {
					continue;
				}

				$excerpt = $post->post_excerpt;
				if ( empty( $excerpt ) ) {
					$excerpt = wp_trim_words( wp_strip_all_tags( $post->post_content ), 30, '...' );
				}

				$page_obj = array(
					'url'       => $rel_url,
					'title'     => get_the_title( $post ),
					'published' => get_post_time( 'c', true, $post ),
					'updated'   => get_post_modified_time( 'c', true, $post ),
					'summary'   => $excerpt,
				);

				// If post_date >= since (or no since) → "added", else → "updated".
				$post_date_ts = get_post_time( 'U', true, $post );
				if ( false === $since_ts || $post_date_ts >= $since_ts ) {
					$added[] = $page_obj;
				} else {
					$updated[] = $page_obj;
				}
			}
			wp_reset_postdata();
		}

		// Get tombstones.
		$tombstones_raw = get_option( 'openfeeder_tombstones', '[]' );
		$all_tombstones = json_decode( $tombstones_raw, true );
		if ( ! is_array( $all_tombstones ) ) {
			$all_tombstones = array();
		}

		$deleted = array();
		if ( false !== $since_ts ) {
			foreach ( $all_tombstones as $tomb ) {
				$del_ts = isset( $tomb['deleted_at'] ) ? strtotime( $tomb['deleted_at'] ) : 0;
				if ( $del_ts >= $since_ts ) {
					$deleted[] = $tomb;
				}
			}
		}

		$token = $this->make_sync_token( $as_of );

		$sync_meta = array(
			'as_of'      => $as_of,
			'sync_token' => $token,
			'counts'     => array(
				'added'   => count( $added ),
				'updated' => count( $updated ),
				'deleted' => count( $deleted ),
			),
		);
		if ( null !== $since_iso ) {
			$sync_meta['since'] = $since_iso;
		}
		if ( null !== $until_iso ) {
			$sync_meta['until'] = $until_iso;
		}

		$data = array(
			'openfeeder_version' => '1.0',
			'sync'               => $sync_meta,
			'added'              => $added,
			'updated'            => $updated,
			'deleted'            => $deleted,
		);

		$this->send_json( $data, 'MISS' );
	}

	/**
	 * Check whether a path should be excluded based on the excluded_paths config.
	 *
	 * @param string $path Relative URL path.
	 * @return bool True if the path should be excluded.
	 */
	private function is_excluded_path( string $path ): bool {
		$excluded = array_filter( array_map( 'trim', explode( "\n", get_option( 'openfeeder_excluded_paths', '' ) ) ) );
		foreach ( $excluded as $prefix ) {
			if ( '' !== $prefix && str_starts_with( $path, $prefix ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Get the list of post types that should be excluded from OpenFeeder.
	 *
	 * @return array List of excluded post type slugs.
	 */
	private function get_excluded_post_types(): array {
		$defaults = array(
			'attachment',
			'revision',
			'nav_menu_item',
			'custom_css',
			'customize_changeset',
			'oembed_cache',
			'user_request',
			'wp_block',
			'wp_template',
			'wp_template_part',
			'wp_global_styles',
			'wp_navigation',
		);
		$custom = array_filter( array_map( 'trim', explode( "\n", get_option( 'openfeeder_excluded_post_types', '' ) ) ) );
		return array_unique( array_merge( $defaults, $custom ) );
	}

	/**
	 * Get the allowed post types (all public post types minus excluded ones).
	 *
	 * @return array List of allowed post type slugs.
	 */
	private function get_allowed_post_types(): array {
		$public_types = get_post_types( array( 'public' => true ), 'names' );
		$excluded     = $this->get_excluded_post_types();
		return array_values( array_diff( $public_types, $excluded ) );
	}

	/**
	 * Serve chunked content for a single post.
	 *
	 * @param string $url Relative URL of the post.
	 */
	private function serve_single( $url ) {
		// Check excluded paths.
		if ( $this->is_excluded_path( $url ) ) {
			$this->send_error( 'NOT_FOUND', 'No published post found at the given URL.', 404 );
			return;
		}

		$cache  = new OpenFeeder_Cache();
		$post   = $this->find_post_by_url( $url );

		if ( ! $post ) {
			$this->send_error( 'NOT_FOUND', 'No published post found at the given URL.', 404 );
			return;
		}

		// Reject password-protected posts.
		if ( ! empty( $post->post_password ) ) {
			$this->send_error( 'NOT_FOUND', 'No published post found at the given URL.', 404 );
			return;
		}

		// Reject excluded post types.
		if ( in_array( $post->post_type, $this->get_excluded_post_types(), true ) ) {
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

		$author_display = get_option( 'openfeeder_author_display', 'name' );
		$author = null;
		if ( 'name' === $author_display ) {
			$author = get_the_author_meta( 'display_name', $post->post_author );
			if ( empty( $author ) ) {
				$author = null;
			}
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
			'post_type'      => $this->get_allowed_post_types(),
			'post_status'    => 'publish',
			'has_password'   => false,
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

				$rel_url = wp_make_link_relative( get_permalink( $post ) );

				// Skip excluded paths.
				if ( $this->is_excluded_path( $rel_url ) ) {
					continue;
				}

				$excerpt = $post->post_excerpt;
				if ( empty( $excerpt ) ) {
					$excerpt = wp_trim_words( wp_strip_all_tags( $post->post_content ), 30, '...' );
				}

				$items[] = array(
					'url'       => $rel_url,
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
			if ( $post && 'publish' === $post->post_status && empty( $post->post_password ) ) {
				return $post;
			}
		}

		// Fallback: try matching by post name (slug).
		$slug = basename( untrailingslashit( $path ) );
		if ( ! empty( $slug ) ) {
			$posts = get_posts( array(
				'name'         => $slug,
				'post_type'    => $this->get_allowed_post_types(),
				'post_status'  => 'publish',
				'has_password' => false,
				'numberposts'  => 10,
			) );
			// Verify permalink matches to avoid returning wrong post when
			// two posts share the same slug in different categories.
			foreach ( $posts as $post ) {
				$post_permalink = str_replace( home_url(), '', get_permalink( $post->ID ) );
				if ( rtrim( $post_permalink, '/' ) === rtrim( $path, '/' ) ) {
					return $post;
				}
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
