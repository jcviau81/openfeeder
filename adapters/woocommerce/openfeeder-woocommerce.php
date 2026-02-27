<?php
/**
 * Plugin Name: OpenFeeder for WooCommerce
 * Plugin URI:  https://github.com/jcviau81/openfeeder
 * Description: Expose WooCommerce products to LLMs via the OpenFeeder protocol. Powers AI shopping assistants with real-time product data.
 * Version:     1.0.1
 * Author:      OpenFeeder
 * Author URI:  https://github.com/jcviau81/openfeeder
 * License:     MIT
 * Text Domain: openfeeder-woocommerce
 * Requires Plugins: woocommerce
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'OPENFEEDER_WC_VERSION', '1.0.1' );
define( 'OPENFEEDER_WC_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'OPENFEEDER_WC_PLUGIN_FILE', __FILE__ );

// ── Dependency check ──────────────────────────────────────────────────────────

/**
 * Check if WooCommerce is active. Show admin notice if not.
 */
function openfeeder_wc_check_dependencies() {
	if ( ! class_exists( 'WooCommerce' ) ) {
		add_action( 'admin_notices', 'openfeeder_wc_missing_notice' );
		return false;
	}
	return true;
}

/**
 * Admin notice for missing WooCommerce.
 */
function openfeeder_wc_missing_notice() {
	?>
	<div class="notice notice-error">
		<p>
			<strong><?php esc_html_e( 'OpenFeeder for WooCommerce', 'openfeeder-woocommerce' ); ?></strong>
			<?php esc_html_e( 'requires WooCommerce to be installed and activated.', 'openfeeder-woocommerce' ); ?>
		</p>
	</div>
	<?php
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

/**
 * Load the plugin after all plugins are loaded (so WooCommerce is available).
 */
function openfeeder_wc_init() {
	if ( ! openfeeder_wc_check_dependencies() ) {
		return;
	}

	require_once OPENFEEDER_WC_PLUGIN_DIR . 'includes/class-chunker.php';
	require_once OPENFEEDER_WC_PLUGIN_DIR . 'includes/class-discovery.php';
	require_once OPENFEEDER_WC_PLUGIN_DIR . 'includes/class-products-api.php';

	// Register rewrite rules and query var.
	openfeeder_wc_add_rewrite_rules();
}
add_action( 'plugins_loaded', 'openfeeder_wc_init' );

// ── Rewrite rules ─────────────────────────────────────────────────────────────

/**
 * Register rewrite rules for OpenFeeder WooCommerce endpoints.
 */
function openfeeder_wc_add_rewrite_rules() {
	add_rewrite_rule(
		'^openfeeder/products/?$',
		'index.php?openfeeder_wc_route=products',
		'top'
	);

	// Extend the discovery endpoint (served alongside or instead of base openfeeder.json).
	add_rewrite_rule(
		'^\.well-known/openfeeder-ecommerce\.json$',
		'index.php?openfeeder_wc_route=discovery',
		'top'
	);
}
add_action( 'init', 'openfeeder_wc_add_rewrite_rules' );

/**
 * Register the custom query variable.
 *
 * @param array $vars Existing query vars.
 * @return array Modified query vars.
 */
function openfeeder_wc_query_vars( $vars ) {
	$vars[] = 'openfeeder_wc_route';
	return $vars;
}
add_filter( 'query_vars', 'openfeeder_wc_query_vars' );

// ── Request handler ───────────────────────────────────────────────────────────

/**
 * Handle incoming requests for OpenFeeder WooCommerce endpoints.
 */
function openfeeder_wc_handle_request() {
	if ( ! class_exists( 'WooCommerce' ) ) {
		return;
	}

	$route = get_query_var( 'openfeeder_wc_route' );

	if ( ! $route ) {
		return;
	}

	// Check if plugin is enabled.
	if ( ! get_option( 'openfeeder_wc_enabled', true ) ) {
		status_header( 404 );
		header( 'Content-Type: application/json; charset=utf-8' );
		echo wp_json_encode(
			array(
				'schema' => 'openfeeder/1.0+ecommerce',
				'error'  => array(
					'code'    => 'NOT_FOUND',
					'message' => 'OpenFeeder WooCommerce endpoint is disabled.',
				),
			),
			JSON_UNESCAPED_SLASHES
		);
		exit;
	}

	if ( 'discovery' === $route ) {
		$discovery = new OpenFeeder_WC_Discovery();
		$discovery->serve();
	} elseif ( 'products' === $route ) {
		$api = new OpenFeeder_WC_Products_API();
		$api->serve();
	}

	exit;
}
add_action( 'template_redirect', 'openfeeder_wc_handle_request' );

// ── Extend base OpenFeeder discovery (if base plugin is active) ───────────────

/**
 * Hook into the base OpenFeeder discovery document to inject ecommerce block.
 * This runs when the base OpenFeeder plugin serves /.well-known/openfeeder.json.
 */
add_filter( 'openfeeder_discovery_data', 'openfeeder_wc_extend_discovery' );

/**
 * Extend the base discovery document with ecommerce capabilities.
 *
 * @param array $data Discovery document array.
 * @return array Modified discovery document.
 */
function openfeeder_wc_extend_discovery( $data ) {
	if ( ! class_exists( 'WooCommerce' ) ) {
		return $data;
	}
	if ( ! get_option( 'openfeeder_wc_enabled', true ) ) {
		return $data;
	}

	// Add 'products' to capabilities.
	if ( isset( $data['capabilities'] ) && ! in_array( 'products', $data['capabilities'], true ) ) {
		$data['capabilities'][] = 'products';
	}

	// Add ecommerce block.
	$data['ecommerce'] = array(
		'products_endpoint'    => '/openfeeder/products',
		'currencies'           => array( get_woocommerce_currency() ),
		'supports_variants'    => true,
		'supports_availability' => true,
	);

	return $data;
}

// ── Activation / deactivation ─────────────────────────────────────────────────

/**
 * Flush rewrite rules on activation.
 */
function openfeeder_wc_activate() {
	openfeeder_wc_add_rewrite_rules();
	flush_rewrite_rules();
}
register_activation_hook( __FILE__, 'openfeeder_wc_activate' );

/**
 * Flush rewrite rules on deactivation.
 */
function openfeeder_wc_deactivate() {
	flush_rewrite_rules();
}
register_deactivation_hook( __FILE__, 'openfeeder_wc_deactivate' );

// ── Admin settings ────────────────────────────────────────────────────────────

/**
 * Register settings page under WooCommerce menu.
 */
function openfeeder_wc_admin_menu() {
	add_submenu_page(
		'woocommerce',
		__( 'OpenFeeder Settings', 'openfeeder-woocommerce' ),
		__( 'OpenFeeder', 'openfeeder-woocommerce' ),
		'manage_woocommerce',
		'openfeeder-woocommerce',
		'openfeeder_wc_settings_page'
	);
}
add_action( 'admin_menu', 'openfeeder_wc_admin_menu' );

/**
 * Register plugin settings.
 */
function openfeeder_wc_register_settings() {
	register_setting(
		'openfeeder_wc_settings',
		'openfeeder_wc_enabled',
		array(
			'type'              => 'boolean',
			'default'           => true,
			'sanitize_callback' => 'rest_sanitize_boolean',
		)
	);
	register_setting(
		'openfeeder_wc_settings',
		'openfeeder_wc_per_page',
		array(
			'type'              => 'integer',
			'default'           => 10,
			'sanitize_callback' => 'absint',
		)
	);
}
add_action( 'admin_init', 'openfeeder_wc_register_settings' );

/**
 * Render the settings page.
 */
function openfeeder_wc_settings_page() {
	if ( ! current_user_can( 'manage_woocommerce' ) ) {
		return;
	}
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'OpenFeeder for WooCommerce', 'openfeeder-woocommerce' ); ?></h1>
		<p class="description">
			<?php esc_html_e( 'Expose your products to AI shopping assistants via the OpenFeeder protocol.', 'openfeeder-woocommerce' ); ?>
		</p>

		<form method="post" action="options.php">
			<?php settings_fields( 'openfeeder_wc_settings' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><?php esc_html_e( 'Enable Products Endpoint', 'openfeeder-woocommerce' ); ?></th>
					<td>
						<label>
							<input type="checkbox" name="openfeeder_wc_enabled" value="1"
								<?php checked( get_option( 'openfeeder_wc_enabled', true ) ); ?> />
							<?php esc_html_e( 'Expose products via /openfeeder/products', 'openfeeder-woocommerce' ); ?>
						</label>
					</td>
				</tr>
				<tr>
					<th scope="row">
						<label for="openfeeder_wc_per_page">
							<?php esc_html_e( 'Products Per Page', 'openfeeder-woocommerce' ); ?>
						</label>
					</th>
					<td>
						<input type="number" id="openfeeder_wc_per_page" name="openfeeder_wc_per_page"
							value="<?php echo esc_attr( get_option( 'openfeeder_wc_per_page', 10 ) ); ?>"
							min="1" max="100" class="small-text" />
						<p class="description">
							<?php esc_html_e( 'Default number of products returned per page (1–100). Clients can override with the limit= parameter.', 'openfeeder-woocommerce' ); ?>
						</p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>

		<hr />
		<h2><?php esc_html_e( 'Endpoints', 'openfeeder-woocommerce' ); ?></h2>
		<table class="widefat striped" style="max-width:600px">
			<thead>
				<tr>
					<th><?php esc_html_e( 'Endpoint', 'openfeeder-woocommerce' ); ?></th>
					<th><?php esc_html_e( 'URL', 'openfeeder-woocommerce' ); ?></th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td><?php esc_html_e( 'Products API', 'openfeeder-woocommerce' ); ?></td>
					<td><code><?php echo esc_html( home_url( '/openfeeder/products' ) ); ?></code></td>
				</tr>
				<tr>
					<td><?php esc_html_e( 'Discovery (ecommerce)', 'openfeeder-woocommerce' ); ?></td>
					<td><code><?php echo esc_html( home_url( '/.well-known/openfeeder-ecommerce.json' ) ); ?></code></td>
				</tr>
			</tbody>
		</table>
	</div>
	<?php
}
