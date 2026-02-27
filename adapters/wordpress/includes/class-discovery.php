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
	 * Serve the discovery JSON response with HTTP caching headers.
	 */
	public function serve() {
		$description = get_option( 'openfeeder_description', '' );
		if ( empty( $description ) ) {
			$description = get_bloginfo( 'description' );
		}

		$data = array(
			'version'      => '1.0.1',
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
			'capabilities' => array( 'diff-sync' ),
			'contact'      => get_option( 'admin_email', '' ),
		);

		$json          = wp_json_encode( $data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );
		$etag          = '"' . substr( md5( $json ), 0, 16 ) . '"';
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
		header( 'Access-Control-Allow-Origin: *' );
		header( 'Cache-Control: public, max-age=300, stale-while-revalidate=60' );
		header( 'ETag: ' . $etag );
		header( 'Last-Modified: ' . $last_modified );
		header( 'Vary: Accept-Encoding' );

		echo $json; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	}
}
