<?php
/**
 * OpenFeeder uninstall handler.
 *
 * Removes all plugin options and transients when the plugin is deleted
 * via the WordPress admin.
 *
 * @package OpenFeeder
 * @license GPL-2.0-or-later
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

// Remove plugin options.
$options = array(
	'openfeeder_enabled',
	'openfeeder_description',
	'openfeeder_llm_gateway',
	'openfeeder_max_chunks',
	'openfeeder_api_key',
	'openfeeder_excluded_paths',
	'openfeeder_excluded_post_types',
	'openfeeder_author_display',
	'openfeeder_sidecar_webhook',
	'openfeeder_sidecar_key',
	'openfeeder_tombstones',
);

foreach ( $options as $option ) {
	delete_option( $option );
}

// Remove cached transients.
global $wpdb;

$wpdb->query(
	$wpdb->prepare(
		"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
		$wpdb->esc_like( '_transient_openfeeder_' ) . '%',
		$wpdb->esc_like( '_transient_timeout_openfeeder_' ) . '%'
	)
);

// Remove gateway session transients.
$wpdb->query(
	$wpdb->prepare(
		"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
		$wpdb->esc_like( '_transient_of_gw_' ) . '%',
		$wpdb->esc_like( '_transient_timeout_of_gw_' ) . '%'
	)
);
