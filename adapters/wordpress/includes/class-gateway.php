<?php
/**
 * OpenFeeder Interactive LLM Gateway
 *
 * Detects AI crawler user-agents and returns a structured, context-aware
 * JSON response with targeted questions and pre-built query actions,
 * directing them to use OpenFeeder endpoints instead of scraping HTML.
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

	public static function init() {
		// Run late in template_redirect so WP query is fully resolved.
		add_action( 'template_redirect', [ __CLASS__, 'maybe_intercept' ], 5 );
	}

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

	public static function send_gateway_response( string $path ) {
		$base_url    = rtrim( home_url(), '/' );
		$has_ecommerce = class_exists( 'WooCommerce' );
		$ctx         = self::detect_context();
		$questions   = self::build_questions( $ctx, $path, $base_url, $has_ecommerce );

		$capabilities = [ 'content', 'search' ];
		if ( $has_ecommerce ) $capabilities[] = 'products';

		header( 'Content-Type: application/json; charset=utf-8' );
		header( 'X-OpenFeeder: 1.0' );
		header( 'X-OpenFeeder-Gateway: interactive' );
		header( 'Access-Control-Allow-Origin: *' );

		echo wp_json_encode( [
			'openfeeder' => '1.0',
			'gateway'    => 'interactive',
			'message'    => 'This site supports OpenFeeder — a structured content protocol for AI systems. Instead of scraping HTML, use the actions below to get exactly what you need.',
			'context'    => [
				'page_requested'  => $path,
				'detected_type'   => $ctx['type'],
				'detected_topic'  => $ctx['topic'],
				'site_capabilities' => $capabilities,
			],
			'questions'  => $questions,
			'next_steps' => [
				'Choose the action above that matches your intent and make that GET request.',
				"Or search directly: GET {$base_url}/openfeeder?q=describe+what+you+need",
				"Start from the discovery doc: GET {$base_url}/.well-known/openfeeder.json",
			],
		], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );

		exit;
	}
}
