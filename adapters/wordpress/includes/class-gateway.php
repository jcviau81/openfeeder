<?php
/**
 * OpenFeeder Interactive LLM Gateway
 *
 * Detects AI crawler user-agents and returns a structured, context-aware
 * JSON response with targeted questions and pre-built query actions,
 * directing them to use OpenFeeder endpoints instead of scraping HTML.
 *
 * Supports 3 interaction modes:
 *   Mode 1 (Cold start) — dialogue with session
 *   Mode 2 (Warm start) — direct response via X-OpenFeeder-* headers
 *   Mode 3 (Bypass)     — legacy bots use endpoints directly
 *
 * @package OpenFeeder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class OpenFeeder_Gateway {

	const LLM_AGENTS = [
		'GPTBot', 'ChatGPT-User', 'ClaudeBot', 'anthropic-ai',
		'PerplexityBot', 'Google-Extended', 'cohere-ai', 'CCBot',
		'FacebookBot', 'Amazonbot', 'YouBot', 'Bytespider',
	];

	const STATIC_EXTS = [ 'js', 'css', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'eot' ];

	const SESSION_TTL = 300; // 5 minutes

	public static function init() {
		// Run late in template_redirect so WP query is fully resolved.
		add_action( 'template_redirect', [ __CLASS__, 'maybe_intercept' ], 5 );
	}

	// ── Session store using WordPress transients ──────────────────────────────

	/**
	 * Create a gateway dialogue session.
	 *
	 * @param array $context Session context data.
	 * @return string Session ID (16 hex chars prefixed with "gw_").
	 */
	public static function create_session( array $context ): string {
		$id = 'gw_' . bin2hex( random_bytes( 8 ) );
		set_transient( 'of_gw_' . $id, $context, self::SESSION_TTL );
		return $id;
	}

	/**
	 * Retrieve a session by ID.
	 *
	 * @param string $id Session ID.
	 * @return array|false Session context or false if expired/not found.
	 */
	public static function get_session( string $id ) {
		return get_transient( 'of_gw_' . $id );
	}

	/**
	 * Delete a session after use.
	 *
	 * @param string $id Session ID.
	 */
	public static function delete_session( string $id ): void {
		delete_transient( 'of_gw_' . $id );
	}

	// ── Bot detection ─────────────────────────────────────────────────────────

	public static function maybe_intercept() {
		if ( 'GET' !== $_SERVER['REQUEST_METHOD'] ) return;
		if ( is_admin() ) return;

		$path = parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH ) ?? '/';
		if ( preg_match( '#^/(openfeeder|\.well-known/openfeeder)#', $path ) ) return;

		$ext = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
		if ( $ext && in_array( $ext, self::STATIC_EXTS, true ) ) return;

		$ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
		if ( ! self::is_llm_bot( $ua ) ) return;

		self::send_gateway_response( $path );
	}

	public static function is_llm_bot( string $ua ): bool {
		if ( empty( $ua ) ) return false;
		foreach ( self::LLM_AGENTS as $pattern ) {
			if ( str_contains( $ua, $pattern ) ) return true;
		}
		return false;
	}

	/**
	 * Detect WordPress context using the query object.
	 * Returns [ 'type' => ..., 'topic' => ..., 'object' => ... ]
	 */
	private static function detect_context(): array {
		if ( is_singular( 'product' ) ) {
			$post = get_post();
			return [ 'type' => 'product', 'topic' => $post ? $post->post_title : null, 'object' => $post ];
		}
		if ( is_singular() ) {
			$post = get_post();
			return [ 'type' => 'article', 'topic' => $post ? $post->post_title : null, 'object' => $post ];
		}
		if ( is_product_category() || is_product_tag() ) {
			$term = get_queried_object();
			return [ 'type' => 'product_category', 'topic' => $term ? $term->name : null, 'object' => $term ];
		}
		if ( is_category() || is_tag() || is_tax() ) {
			$term = get_queried_object();
			return [ 'type' => 'category', 'topic' => $term ? $term->name : null, 'object' => $term ];
		}
		if ( is_search() ) {
			return [ 'type' => 'search', 'topic' => get_search_query(), 'object' => null ];
		}
		if ( is_home() || is_front_page() ) {
			return [ 'type' => 'home', 'topic' => null, 'object' => null ];
		}
		if ( is_shop() ) {
			return [ 'type' => 'shop', 'topic' => null, 'object' => null ];
		}
		return [ 'type' => 'page', 'topic' => null, 'object' => null ];
	}

	/**
	 * Build context-aware questions with pre-built OpenFeeder query URLs.
	 */
	private static function build_questions( array $ctx, string $path, string $base_url, bool $has_ecommerce ): array {
		$questions  = [];
		$encoded    = rawurlencode( $path );

		switch ( $ctx['type'] ) {
			case 'product':
				$questions[] = [
					'question' => $ctx['topic'] ? "Do you want the full details of \"{$ctx['topic']}\"?" : 'Do you want the full details of this product?',
					'intent'   => 'single_product',
					'action'   => "GET {$base_url}/openfeeder/products?url={$encoded}",
					'returns'  => 'Full description, price, variants, availability, stock status',
				];
				// Get product categories
				$post = $ctx['object'];
				if ( $post && function_exists( 'wc_get_product' ) ) {
					$terms = wp_get_post_terms( $post->ID, 'product_cat', [ 'number' => 1 ] );
					if ( ! is_wp_error( $terms ) && ! empty( $terms ) ) {
						$cat_slug = $terms[0]->slug;
						$cat_name = $terms[0]->name;
						$questions[] = [
							'question' => "Are you comparing this with other \"{$cat_name}\" products?",
							'intent'   => 'category_browse',
							'action'   => "GET {$base_url}/openfeeder/products?category={$cat_slug}",
							'returns'  => "All products in \"{$cat_name}\" with pricing and availability",
						];
					}
				}
				$questions[] = [
					'question' => 'Are you looking for similar products by keyword?',
					'intent'   => 'keyword_search',
					'action'   => "GET {$base_url}/openfeeder/products?q=" . rawurlencode( $ctx['topic'] ?? '' ),
					'returns'  => 'Products matching keywords from the name/description',
				];
				$questions[] = [
					'question' => 'Are you filtering by price or availability?',
					'intent'   => 'price_filter',
					'action'   => "GET {$base_url}/openfeeder/products?in_stock=true",
					'returns'  => 'All in-stock products (add &min_price=X&max_price=Y for budget filter)',
				];
				break;

			case 'product_category':
			case 'shop':
				$cat_param = $ctx['object'] ? '?category=' . $ctx['object']->slug : '';
				$questions[] = [
					'question' => $ctx['topic'] ? "Do you want to browse all products in \"{$ctx['topic']}\"?" : 'Do you want to browse all products?',
					'intent'   => 'category_browse',
					'action'   => "GET {$base_url}/openfeeder/products{$cat_param}",
					'returns'  => 'All products in this category with pricing and availability',
				];
				$questions[] = [
					'question' => 'Are you looking for in-stock items only?',
					'intent'   => 'availability_filter',
					'action'   => "GET {$base_url}/openfeeder/products{$cat_param}" . ( $cat_param ? '&' : '?' ) . 'in_stock=true',
					'returns'  => 'Only available products in this category',
				];
				$questions[] = [
					'question' => 'Are you looking for items on sale?',
					'intent'   => 'sale_filter',
					'action'   => "GET {$base_url}/openfeeder/products?on_sale=true" . ( $ctx['object'] ? '&category=' . $ctx['object']->slug : '' ),
					'returns'  => 'Discounted products currently on sale',
				];
				$questions[] = [
					'question' => 'Do you want to search by keyword or feature?',
					'intent'   => 'keyword_search',
					'action'   => "GET {$base_url}/openfeeder/products?q=your+keywords",
					'returns'  => 'Products matching your search terms',
				];
				break;

			case 'article':
				$questions[] = [
					'question' => $ctx['topic'] ? "Do you want the full content of \"{$ctx['topic']}\"?" : 'Do you want the full content of this page?',
					'intent'   => 'single_page',
					'action'   => "GET {$base_url}/openfeeder?url={$encoded}",
					'returns'  => 'Full article text split into semantic chunks, ready for LLM processing',
				];
				if ( $ctx['topic'] ) {
					$q = rawurlencode( $ctx['topic'] );
					$questions[] = [
						'question' => "Are you looking for more content related to \"{$ctx['topic']}\"?",
						'intent'   => 'topic_search',
						'action'   => "GET {$base_url}/openfeeder?q={$q}",
						'returns'  => 'All content related to this topic',
					];
				}
				// Get post tags for related search suggestions
				$post = $ctx['object'];
				if ( $post ) {
					$tags = wp_get_post_tags( $post->ID, [ 'number' => 3 ] );
					if ( ! is_wp_error( $tags ) && ! empty( $tags ) ) {
						$tag_q = rawurlencode( implode( ' ', array_column( $tags, 'name' ) ) );
						$tag_names = implode( ', ', array_column( $tags, 'name' ) );
						$questions[] = [
							'question' => "Are you interested in topics like: {$tag_names}?",
							'intent'   => 'tag_search',
							'action'   => "GET {$base_url}/openfeeder?q={$tag_q}",
							'returns'  => "Articles tagged with: {$tag_names}",
						];
					}
				}
				$questions[] = [
					'question' => 'Do you want to browse all available articles?',
					'intent'   => 'index_browse',
					'action'   => "GET {$base_url}/openfeeder",
					'returns'  => 'Paginated index of all articles with summaries',
				];
				break;

			case 'category':
				$term = $ctx['object'];
				$cat_q = $term ? rawurlencode( $term->name ) : '';
				$questions[] = [
					'question' => $ctx['topic'] ? "Do you want all articles in the \"{$ctx['topic']}\" category?" : 'Do you want articles in this category?',
					'intent'   => 'category_content',
					'action'   => "GET {$base_url}/openfeeder?q={$cat_q}",
					'returns'  => 'Articles related to this category',
				];
				$questions[] = [
					'question' => 'Are you looking for something more specific?',
					'intent'   => 'search',
					'action'   => "GET {$base_url}/openfeeder?q=your+specific+topic",
					'returns'  => 'Articles matching your search query',
				];
				break;

			case 'search':
				$q = $ctx['topic'] ? rawurlencode( $ctx['topic'] ) : 'your+query';
				$questions[] = [
					'question' => $ctx['topic'] ? "Do you want OpenFeeder results for \"{$ctx['topic']}\"?" : 'Do you want structured search results?',
					'intent'   => 'search',
					'action'   => "GET {$base_url}/openfeeder?q={$q}",
					'returns'  => 'Structured content matching your search query',
				];
				if ( $has_ecommerce ) {
					$questions[] = [
						'question' => $ctx['topic'] ? "Are you searching for products matching \"{$ctx['topic']}\"?" : 'Are you searching for products?',
						'intent'   => 'product_search',
						'action'   => "GET {$base_url}/openfeeder/products?q={$q}",
						'returns'  => 'Products matching your search query',
					];
				}
				break;

			case 'home':
			default:
				$questions[] = [
					'question' => 'Do you want to browse all available content?',
					'intent'   => 'index_browse',
					'action'   => "GET {$base_url}/openfeeder",
					'returns'  => 'Paginated index of all content with summaries',
				];
				$questions[] = [
					'question' => 'Are you searching for something specific?',
					'intent'   => 'search',
					'action'   => "GET {$base_url}/openfeeder?q=describe+what+you+need",
					'returns'  => 'Content matching your search query',
				];
				if ( $has_ecommerce ) {
					$questions[] = [
						'question' => 'Are you looking for products?',
						'intent'   => 'products_browse',
						'action'   => "GET {$base_url}/openfeeder/products",
						'returns'  => 'Full product catalog with pricing and availability',
					];
				}
				break;
		}

		return $questions;
	}

	// ── Tailored response builder ─────────────────────────────────────────────

	/**
	 * Build a tailored response for Mode 2 (direct) or Mode 1 Round 2 (dialogue respond).
	 *
	 * @param array  $intent_data Intent, depth, format, query, language.
	 * @param array  $context     Page context (page_requested, detected_type, detected_topic).
	 * @param string $base_url    Site base URL.
	 * @return array Response array.
	 */
	private static function build_tailored_response( array $intent_data, array $context, string $base_url ): array {
		$intent = $intent_data['intent'] ?? 'answer-question';
		$depth  = $intent_data['depth'] ?? 'standard';
		$format = $intent_data['format'] ?? 'full-text';
		$query  = $intent_data['query'] ?? '';
		$page   = $context['page_requested'] ?? '/';

		$endpoints = [];

		if ( ! empty( $query ) ) {
			$endpoints[] = [
				'url'         => "{$base_url}/openfeeder?q=" . rawurlencode( $query ) . "&format={$format}",
				'relevance'   => 'high',
				'description' => 'Content filtered to match your specific question',
			];
		}

		$type = $context['detected_type'] ?? 'page';
		if ( in_array( $type, [ 'product', 'product_category', 'shop' ], true ) ) {
			$endpoints[] = [
				'url'         => "{$base_url}/openfeeder/products?url=" . rawurlencode( $page ),
				'relevance'   => empty( $query ) ? 'high' : 'medium',
				'description' => 'Product details for the requested page',
			];
		} else {
			$endpoints[] = [
				'url'         => "{$base_url}/openfeeder?url=" . rawurlencode( $page ),
				'relevance'   => empty( $query ) ? 'high' : 'medium',
				'description' => 'Full content of the requested page',
			];
		}

		if ( empty( $query ) ) {
			$endpoints[] = [
				'url'         => "{$base_url}/openfeeder",
				'relevance'   => 'low',
				'description' => 'Browse all available content',
			];
		}

		$query_hints = [];
		if ( ! empty( $query ) ) {
			$query_hints[] = 'GET /openfeeder?q=' . rawurlencode( $query );
			$query_hints[] = "GET /openfeeder?q=" . rawurlencode( $query ) . "&format={$format}&depth={$depth}";
		} else {
			$query_hints[] = 'GET /openfeeder?url=' . rawurlencode( $page );
		}

		return [
			'openfeeder'            => '1.0',
			'tailored'              => true,
			'intent'                => $intent,
			'depth'                 => $depth,
			'format'                => $format,
			'recommended_endpoints' => $endpoints,
			'query_hints'           => $query_hints,
			'current_page'          => [
				'openfeeder_url' => "{$base_url}/openfeeder?url=" . rawurlencode( $page ),
				'title'          => $context['detected_topic'] ?? null,
				'summary'        => ! empty( $type ) ? "{$type} page" : null,
			],
			'endpoints'             => [
				'content'   => "{$base_url}/openfeeder",
				'discovery' => "{$base_url}/.well-known/openfeeder.json",
			],
		];
	}

	// ── Extract intent from headers/params ────────────────────────────────────

	/**
	 * Extract intent data from X-OpenFeeder-* headers or _of_* query params.
	 *
	 * @return array|null Null if no intent indicators present.
	 */
	private static function extract_intent_data(): ?array {
		$intent = $_SERVER['HTTP_X_OPENFEEDER_INTENT'] ?? $_GET['_of_intent'] ?? null;
		if ( ! $intent ) {
			return null;
		}

		return [
			'intent'   => $intent,
			'depth'    => $_SERVER['HTTP_X_OPENFEEDER_DEPTH'] ?? $_GET['_of_depth'] ?? 'standard',
			'format'   => $_SERVER['HTTP_X_OPENFEEDER_FORMAT'] ?? $_GET['_of_format'] ?? 'full-text',
			'query'    => $_SERVER['HTTP_X_OPENFEEDER_QUERY'] ?? $_GET['_of_query'] ?? '',
			'language' => $_SERVER['HTTP_X_OPENFEEDER_LANGUAGE'] ?? $_GET['_of_language'] ?? 'en',
		];
	}

	// ── Gateway response headers ──────────────────────────────────────────────

	private static function send_gateway_headers(): void {
		header( 'Content-Type: application/json; charset=utf-8' );
		header( 'X-OpenFeeder: 1.0' );
		header( 'X-OpenFeeder-Gateway: interactive' );
		header( 'Access-Control-Allow-Origin: *' );
	}

	// ── Main gateway response (Mode 1 Round 1 + Mode 2) ──────────────────────

	public static function send_gateway_response( string $path ) {
		$base_url      = rtrim( home_url(), '/' );
		$has_ecommerce = class_exists( 'WooCommerce' );
		$ctx           = self::detect_context();

		$context = [
			'page_requested'  => $path,
			'detected_type'   => $ctx['type'],
			'detected_topic'  => $ctx['topic'],
		];

		// Mode 2 — Direct (Warm Start): X-OpenFeeder-* headers or _of_* params
		$intent_data = self::extract_intent_data();
		if ( $intent_data ) {
			self::send_gateway_headers();
			echo wp_json_encode(
				self::build_tailored_response( $intent_data, $context, $base_url ),
				JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
			);
			exit;
		}

		// Mode 1 Round 1 — Cold Start: dialogue + session
		$questions = self::build_questions( $ctx, $path, $base_url, $has_ecommerce );

		$capabilities = [ 'content', 'search' ];
		if ( $has_ecommerce ) $capabilities[] = 'products';

		$session_context = [
			'url'            => $path,
			'detected_type'  => $ctx['type'],
			'detected_topic' => $ctx['topic'],
			'created_at'     => time(),
		];
		$session_id = self::create_session( $session_context );

		self::send_gateway_headers();

		echo wp_json_encode( [
			'openfeeder' => '1.0',
			'gateway'    => 'interactive',
			'message'    => 'This site supports OpenFeeder — a structured content protocol for AI systems. Instead of scraping HTML, use the actions below to get exactly what you need.',
			'dialog'     => [
				'active'     => true,
				'session_id' => $session_id,
				'expires_in' => self::SESSION_TTL,
				'message'    => 'To give you the most relevant content, a few quick questions:',
				'questions'  => [
					[
						'id'       => 'intent',
						'question' => 'What is your primary goal?',
						'type'     => 'choice',
						'options'  => [ 'answer-question', 'broad-research', 'fact-check', 'summarize', 'find-sources' ],
					],
					[
						'id'       => 'depth',
						'question' => 'How much detail do you need?',
						'type'     => 'choice',
						'options'  => [ 'overview', 'standard', 'deep' ],
					],
					[
						'id'       => 'format',
						'question' => 'Preferred output format?',
						'type'     => 'choice',
						'options'  => [ 'full-text', 'key-facts', 'summary', 'qa' ],
					],
					[
						'id'       => 'query',
						'question' => 'What specifically are you looking for? (optional — leave blank to browse)',
						'type'     => 'text',
					],
				],
				'reply_to'   => 'POST /openfeeder/gateway/respond',
			],
			'context'    => array_merge( $context, [
				'site_capabilities' => $capabilities,
			] ),
			'questions'  => $questions,
			'endpoints'  => [
				'content'   => "{$base_url}/openfeeder",
				'discovery' => "{$base_url}/.well-known/openfeeder.json",
			],
			'next_steps' => [
				'Answer the dialog questions via POST /openfeeder/gateway/respond for a tailored response.',
				'Or choose an action from the questions above and make that GET request.',
				"Or search directly: GET {$base_url}/openfeeder?q=describe+what+you+need",
				"Start from the discovery doc: GET {$base_url}/.well-known/openfeeder.json",
			],
		], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );

		exit;
	}

	// ── Mode 1 Round 2 — Dialogue respond (WP REST API callback) ─────────────

	/**
	 * Handle POST /openfeeder/v1/gateway/respond
	 *
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response
	 */
	public static function handle_dialogue_respond( $request ) {
		$body       = $request->get_json_params();
		$session_id = $body['session_id'] ?? null;
		$answers    = $body['answers'] ?? [];

		if ( empty( $session_id ) || ! is_string( $session_id ) ) {
			return new WP_REST_Response( [
				'openfeeder' => '1.0',
				'error'      => [
					'code'    => 'INVALID_SESSION',
					'message' => 'Missing or invalid session_id.',
				],
			], 400 );
		}

		$session_data = self::get_session( $session_id );
		if ( false === $session_data ) {
			return new WP_REST_Response( [
				'openfeeder' => '1.0',
				'error'      => [
					'code'    => 'SESSION_EXPIRED',
					'message' => 'Session not found or expired.',
				],
			], 400 );
		}

		$base_url = rtrim( home_url(), '/' );

		$intent_data = [
			'intent'   => $answers['intent'] ?? 'answer-question',
			'depth'    => $answers['depth'] ?? 'standard',
			'format'   => $answers['format'] ?? 'full-text',
			'query'    => $answers['query'] ?? '',
			'language' => $answers['language'] ?? 'en',
		];

		$context = [
			'page_requested' => $session_data['url'] ?? '/',
			'detected_type'  => $session_data['detected_type'] ?? 'page',
			'detected_topic' => $session_data['detected_topic'] ?? null,
		];

		self::delete_session( $session_id );

		$response = new WP_REST_Response(
			self::build_tailored_response( $intent_data, $context, $base_url ),
			200
		);
		$response->header( 'X-OpenFeeder', '1.0' );
		$response->header( 'X-OpenFeeder-Gateway', 'interactive' );

		return $response;
	}
}
