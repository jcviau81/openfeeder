<?php
/**
 * OpenFeeder WooCommerce discovery endpoint.
 *
 * Serves the /.well-known/openfeeder-ecommerce.json discovery document
 * with extended ecommerce capabilities appended to the base document.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class OpenFeeder_WC_Discovery {

	/**
	 * Serve the ecommerce discovery JSON response.
	 *
	 * If the base OpenFeeder plugin is active, this extends its document.
	 * Otherwise, it builds a standalone discovery document.
	 */
	public function serve() {
		$data = $this->build();
		$json = wp_json_encode( $data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );
		$etag = '"' . substr( md5( $json ), 0, 16 ) . '"';
		$last_modified = gmdate( 'D, d M Y 00:00:00 T' ); // Today at midnight UTC

		// Conditional request: 304 Not Modified.
		$if_none_match = isset( $_SERVER['HTTP_IF_NONE_MATCH'] )
			? trim( $_SERVER['HTTP_IF_NONE_MATCH'] ) : '';
		if ( $if_none_match === $etag ) {
			status_header( 304 );
			exit;
		}

		header( 'Content-Type: application/json; charset=utf-8' );
		header( 'X-OpenFeeder: 1.0' );
		header( 'X-OpenFeeder-Extension: ecommerce/1.0' );
		header( 'Access-Control-Allow-Origin: *' );
		header( 'Cache-Control: public, max-age=300, stale-while-revalidate=60' );
		header( 'ETag: ' . $etag );
		header( 'Last-Modified: ' . $last_modified );
		header( 'Vary: Accept-Encoding' );

		echo $json; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	}

	/**
	 * Build the discovery document array.
	 *
	 * @return array Discovery document.
	 */
	public function build() {
		// Start with base data from the WordPress OpenFeeder plugin if available,
		// or build a standalone document.
		if ( class_exists( 'OpenFeeder_Discovery' ) ) {
			// Let the base class build its data, then we extend it.
			$base = $this->get_base_discovery();
		} else {
			$base = $this->build_base();
		}

		// Ensure 'products' is in capabilities.
		if ( ! isset( $base['capabilities'] ) ) {
			$base['capabilities'] = array();
		}
		if ( ! in_array( 'products', $base['capabilities'], true ) ) {
			$base['capabilities'][] = 'products';
		}

		// Add ecommerce block.
		$base['ecommerce'] = array(
			'products_endpoint'     => '/openfeeder/products',
			'currencies'            => array( get_woocommerce_currency() ),
			'supports_variants'     => true,
			'supports_availability' => true,
		);

		return $base;
	}

	/**
	 * Build a base discovery document when the base plugin is not active.
	 *
	 * @return array Base discovery document.
	 */
	private function build_base() {
		$description = get_option( 'openfeeder_description', '' );
		if ( empty( $description ) ) {
			$description = get_bloginfo( 'description' );
		}

		return array(
			'version'      => '1.0.2',
			'site'         => array(
				'name'        => get_bloginfo( 'name' ),
				'url'         => home_url( '/' ),
				'language'    => get_bloginfo( 'language' ),
				'description' => $description,
			),
			'feed'         => array(
				'endpoint' => '/openfeeder',
				'type'     => 'paginated',
			),
			'capabilities' => array(),
			'contact'      => get_option( 'admin_email', '' ),
		);
	}

	/**
	 * Get base discovery data by reflecting what the base plugin would produce.
	 * Used when base OpenFeeder plugin is active, to keep data consistent.
	 *
	 * @return array Base discovery document.
	 */
	private function get_base_discovery() {
		// This mirrors OpenFeeder_Discovery::serve() logic without outputting.
		$description = get_option( 'openfeeder_description', '' );
		if ( empty( $description ) ) {
			$description = get_bloginfo( 'description' );
		}

		$data = array(
			'version'      => '1.0.2',
			'site'         => array(
				'name'        => get_bloginfo( 'name' ),
				'url'         => home_url( '/' ),
				'language'    => get_bloginfo( 'language' ),
				'description' => $description,
			),
			'feed'         => array(
				'endpoint' => '/openfeeder',
				'type'     => 'paginated',
			),
			'capabilities' => array(),
			'contact'      => get_option( 'admin_email', '' ),
		);

		// Allow base plugin to filter its own data; we pick that up too.
		return apply_filters( 'openfeeder_discovery_data', $data );
	}
}
