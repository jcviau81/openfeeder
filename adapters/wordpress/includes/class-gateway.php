<?php
/**
 * OpenFeeder LLM Gateway
 *
 * Detects AI crawler user-agents and returns a structured JSON response
 * instead of HTML, directing them to use OpenFeeder endpoints.
 *
 * @package OpenFeeder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class OpenFeeder_Gateway {

	/**
	 * Known LLM crawler user-agent patterns.
	 */
	const LLM_AGENTS = [
		'GPTBot',
		'ChatGPT-User',
		'ClaudeBot',
		'anthropic-ai',
		'PerplexityBot',
		'Google-Extended',
		'cohere-ai',
		'CCBot',
		'FacebookBot',
		'Amazonbot',
		'YouBot',
		'Bytespider',
	];

	/**
	 * Static asset extensions to skip.
	 */
	const STATIC_EXTS = [ 'js', 'css', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'eot' ];

	/**
	 * Initialize the gateway hooks.
	 */
	public static function init() {
		add_action( 'template_redirect', [ __CLASS__, 'maybe_intercept' ], 1 );
	}

	/**
	 * Check if the current request should be intercepted.
	 */
	public static function maybe_intercept() {
		// Only GET requests.
		if ( 'GET' !== $_SERVER['REQUEST_METHOD'] ) {
			return;
		}

		// Skip admin, feeds, and OpenFeeder own endpoints.
		if ( is_admin() ) return;
		$path = parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH ) ?? '/';
		if ( preg_match( '#^/(openfeeder|\.well-known/openfeeder)#', $path ) ) return;

		// Skip static assets.
		$ext = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
		if ( $ext && in_array( $ext, self::STATIC_EXTS, true ) ) return;

		// Detect LLM bot.
		$ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
		if ( ! self::is_llm_bot( $ua ) ) return;

		// Intercept!
		self::send_gateway_response( $path );
	}

	/**
	 * Check if a user-agent string belongs to an LLM crawler.
	 *
	 * @param string $ua User-agent string.
	 * @return bool
	 */
	public static function is_llm_bot( string $ua ): bool {
		if ( empty( $ua ) ) return false;
		foreach ( self::LLM_AGENTS as $pattern ) {
			if ( str_contains( $ua, $pattern ) ) return true;
		}
		return false;
	}

	/**
	 * Send the gateway JSON response and exit.
	 *
	 * @param string $path The requested path.
	 */
	public static function send_gateway_response( string $path ) {
		$site_url = rtrim( home_url(), '/' );

		header( 'Content-Type: application/json; charset=utf-8' );
		header( 'X-OpenFeeder: 1.0' );
		header( 'X-OpenFeeder-Gateway: active' );
		header( 'Access-Control-Allow-Origin: *' );

		echo wp_json_encode( [
			'openfeeder'   => '1.0',
			'message'      => 'This site supports OpenFeeder — a structured content protocol for AI systems. Use the endpoints below instead of scraping HTML.',
			'endpoints'    => [
				'discovery' => $site_url . '/.well-known/openfeeder.json',
				'content'   => $site_url . '/openfeeder',
			],
			'usage'        => [
				'index'       => $site_url . '/openfeeder',
				'search'      => $site_url . '/openfeeder?q=your+search+query',
				'single_page' => $site_url . '/openfeeder?url=' . rawurlencode( $path ),
				'paginate'    => $site_url . '/openfeeder?page=2&limit=10',
			],
			'current_page' => [
				'url'           => $path,
				'openfeeder_url' => $site_url . '/openfeeder?url=' . rawurlencode( $path ),
			],
			'hint'         => "What are you looking for? Append ?q=your+query to /openfeeder to get relevant content chunks directly.",
		], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );

		exit;
	}
}
