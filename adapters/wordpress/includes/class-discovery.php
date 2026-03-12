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
	 * Get the discovery document data.
	 *
	 * @return array Discovery document structure.
	 */
	public function get_data() {
		$description = get_option( 'openfeeder_description', '' );
		if ( empty( $description ) ) {
			$description = get_bloginfo( 'description' );
		}

		// Note: We intentionally do NOT expose admin email for privacy/security.
		// Sites can provide contact via LLM Gateway settings if desired.
		return array(
			'version'      => '1.0.2',
			'site'         => array(
				'name'        => get_bloginfo( 'name' ),
				'url'         => home_url( '/' ),
				'language'    => get_bloginfo( 'language' ),
				'description' => $description,
			),
			'feed'         => array(
				'endpoint' => '/wp-json/openfeeder/v1/content',
				'type'     => 'paginated',
			),
			'capabilities' => array( 'diff-sync' ),
			'contact'      => null,
		);
	}
}
