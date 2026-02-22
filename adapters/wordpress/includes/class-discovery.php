<?php
/**
 * OpenFeeder discovery endpoint.
 *
 * Serves the /.well-known/openfeeder.json discovery document using
 * WordPress site information from get_bloginfo().
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class OpenFeeder_Discovery {

	/**
	 * Serve the discovery JSON response.
	 */
	public function serve() {
		$description = get_option( 'openfeeder_description', '' );
		if ( empty( $description ) ) {
			$description = get_bloginfo( 'description' );
		}

		$data = array(
			'version'      => '1.0',
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

		header( 'Content-Type: application/json; charset=utf-8' );
		header( 'X-OpenFeeder: 1.0' );
		header( 'Access-Control-Allow-Origin: *' );

		echo wp_json_encode( $data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );
	}
}
