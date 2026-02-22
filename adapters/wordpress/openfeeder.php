<?php
/**
 * Plugin Name: OpenFeeder
 * Plugin URI:  https://github.com/openfeeder/openfeeder
 * Description: Expose your content to LLMs via the OpenFeeder protocol.
 * Version:     1.0.0
 * Author:      OpenFeeder
 * Author URI:  https://github.com/openfeeder/openfeeder
 * License:     MIT
 * Text Domain: openfeeder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'OPENFEEDER_VERSION', '1.0.0' );
define( 'OPENFEEDER_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );

// Load classes.
require_once OPENFEEDER_PLUGIN_DIR . 'includes/class-cache.php';
require_once OPENFEEDER_PLUGIN_DIR . 'includes/class-chunker.php';
require_once OPENFEEDER_PLUGIN_DIR . 'includes/class-discovery.php';
require_once OPENFEEDER_PLUGIN_DIR . 'includes/class-content-api.php';

/**
 * Register rewrite rules for OpenFeeder endpoints.
 */
function openfeeder_add_rewrite_rules() {
	add_rewrite_rule(
		'^\.well-known/openfeeder\.json$',
		'index.php?openfeeder_route=discovery',
		'top'
	);
	add_rewrite_rule(
		'^openfeeder/?$',
		'index.php?openfeeder_route=content',
		'top'
	);
}
add_action( 'init', 'openfeeder_add_rewrite_rules' );

/**
 * Register the custom query variable.
 *
 * @param array $vars Existing query vars.
 * @return array Modified query vars.
 */
function openfeeder_query_vars( $vars ) {
	$vars[] = 'openfeeder_route';
	return $vars;
}
add_filter( 'query_vars', 'openfeeder_query_vars' );

/**
 * Handle incoming requests for OpenFeeder endpoints.
 */
function openfeeder_handle_request() {
	$route = get_query_var( 'openfeeder_route' );

	if ( ! $route ) {
		return;
	}

	// Check if plugin is enabled.
	if ( ! get_option( 'openfeeder_enabled', true ) ) {
		wp_send_json(
			array(
				'schema' => 'openfeeder/1.0',
				'error'  => array(
					'code'    => 'NOT_FOUND',
					'message' => 'OpenFeeder is disabled on this site.',
				),
			),
			404
		);
	}

	if ( 'discovery' === $route ) {
		$discovery = new OpenFeeder_Discovery();
		$discovery->serve();
	} elseif ( 'content' === $route ) {
		$api = new OpenFeeder_Content_API();
		$api->serve();
	}

	exit;
}
add_action( 'template_redirect', 'openfeeder_handle_request' );

/**
 * Flush rewrite rules on activation.
 */
function openfeeder_activate() {
	openfeeder_add_rewrite_rules();
	flush_rewrite_rules();
}
register_activation_hook( __FILE__, 'openfeeder_activate' );

/**
 * Flush rewrite rules on deactivation.
 */
function openfeeder_deactivate() {
	flush_rewrite_rules();
}
register_deactivation_hook( __FILE__, 'openfeeder_deactivate' );

/**
 * Invalidate cache when a post is published or updated.
 *
 * @param int     $post_id Post ID.
 * @param WP_Post $post    Post object.
 */
function openfeeder_invalidate_on_save( $post_id, $post ) {
	if ( 'publish' !== $post->post_status ) {
		return;
	}
	if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
		return;
	}

	$cache = new OpenFeeder_Cache();
	$cache->invalidate_post( $post_id );
	$cache->invalidate_index();
}
add_action( 'save_post', 'openfeeder_invalidate_on_save', 10, 2 );

/**
 * Invalidate cache when a post is trashed or deleted.
 *
 * @param int $post_id Post ID.
 */
function openfeeder_invalidate_on_delete( $post_id ) {
	$cache = new OpenFeeder_Cache();
	$cache->invalidate_post( $post_id );
	$cache->invalidate_index();
}
add_action( 'trashed_post', 'openfeeder_invalidate_on_delete' );
add_action( 'deleted_post', 'openfeeder_invalidate_on_delete' );

// ── Settings page ──────────────────────────────────────────────────────────────

/**
 * Register settings page under Settings menu.
 */
function openfeeder_admin_menu() {
	add_options_page(
		__( 'OpenFeeder Settings', 'openfeeder' ),
		__( 'OpenFeeder', 'openfeeder' ),
		'manage_options',
		'openfeeder',
		'openfeeder_settings_page'
	);
}
add_action( 'admin_menu', 'openfeeder_admin_menu' );

/**
 * Register plugin settings.
 */
function openfeeder_register_settings() {
	register_setting( 'openfeeder_settings', 'openfeeder_enabled', array(
		'type'              => 'boolean',
		'default'           => true,
		'sanitize_callback' => 'rest_sanitize_boolean',
	) );
	register_setting( 'openfeeder_settings', 'openfeeder_description', array(
		'type'              => 'string',
		'default'           => '',
		'sanitize_callback' => 'sanitize_text_field',
	) );
	register_setting( 'openfeeder_settings', 'openfeeder_max_chunks', array(
		'type'              => 'integer',
		'default'           => 50,
		'sanitize_callback' => 'absint',
	) );
}
add_action( 'admin_init', 'openfeeder_register_settings' );

/**
 * Render the settings page.
 */
function openfeeder_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'OpenFeeder Settings', 'openfeeder' ); ?></h1>
		<form method="post" action="options.php">
			<?php settings_fields( 'openfeeder_settings' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><?php esc_html_e( 'Enable OpenFeeder', 'openfeeder' ); ?></th>
					<td>
						<label>
							<input type="checkbox" name="openfeeder_enabled" value="1"
								<?php checked( get_option( 'openfeeder_enabled', true ) ); ?> />
							<?php esc_html_e( 'Expose published content via the OpenFeeder protocol.', 'openfeeder' ); ?>
						</label>
					</td>
				</tr>
				<tr>
					<th scope="row">
						<label for="openfeeder_description">
							<?php esc_html_e( 'Site Description', 'openfeeder' ); ?>
						</label>
					</th>
					<td>
						<input type="text" id="openfeeder_description" name="openfeeder_description"
							value="<?php echo esc_attr( get_option( 'openfeeder_description', '' ) ); ?>"
							class="regular-text" />
						<p class="description">
							<?php esc_html_e( 'Overrides the WordPress tagline in the discovery document. Leave blank to use the tagline.', 'openfeeder' ); ?>
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row">
						<label for="openfeeder_max_chunks">
							<?php esc_html_e( 'Max Chunks per Response', 'openfeeder' ); ?>
						</label>
					</th>
					<td>
						<input type="number" id="openfeeder_max_chunks" name="openfeeder_max_chunks"
							value="<?php echo esc_attr( get_option( 'openfeeder_max_chunks', 50 ) ); ?>"
							min="1" max="50" class="small-text" />
						<p class="description">
							<?php esc_html_e( 'Maximum number of chunks returned in a single API response (1-50).', 'openfeeder' ); ?>
						</p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}
