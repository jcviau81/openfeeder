<?php
/**
 * Plugin Name: OpenFeeder
 * Plugin URI:  https://github.com/openfeeder/openfeeder
 * Description: Expose your content to LLMs via the OpenFeeder protocol.
 * Version:     1.0.1
 * Author:      OpenFeeder
 * Author URI:  https://github.com/openfeeder/openfeeder
 * License:     MIT
 * Text Domain: openfeeder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'OPENFEEDER_VERSION', '1.0.1' );
define( 'OPENFEEDER_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );

// Load classes.
require_once OPENFEEDER_PLUGIN_DIR . 'includes/class-cache.php';
require_once OPENFEEDER_PLUGIN_DIR . 'includes/class-chunker.php';
require_once OPENFEEDER_PLUGIN_DIR . 'includes/class-discovery.php';
require_once OPENFEEDER_PLUGIN_DIR . 'includes/class-content-api.php';
require_once OPENFEEDER_PLUGIN_DIR . 'includes/class-gateway.php';

// Initialize LLM Gateway if enabled.
if ( get_option( 'openfeeder_llm_gateway', false ) ) {
	OpenFeeder_Gateway::init();

	// Register REST route for dialogue respond (Mode 1 Round 2).
	add_action( 'rest_api_init', function () {
		register_rest_route( 'openfeeder/v1', '/gateway/respond', [
			'methods'             => 'POST',
			'callback'            => [ 'OpenFeeder_Gateway', 'handle_dialogue_respond' ],
			'permission_callback' => '__return_true',
		] );
	} );
}

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

/**
 * Record a tombstone when a post is trashed or deleted (for differential sync).
 *
 * @param int $post_id Post ID.
 */
function openfeeder_record_tombstone( $post_id ) {
	if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
		return;
	}

	$post = get_post( $post_id );
	if ( ! $post || 'publish' !== $post->post_status ) {
		// For trashed_post the status is still 'publish' at hook time.
		// For deleted_post it may differ — record anyway if we can get permalink.
	}

	$permalink = get_permalink( $post_id );
	if ( empty( $permalink ) ) {
		return;
	}

	$tombstones = get_option( 'openfeeder_tombstones', '[]' );
	$tombstones = json_decode( $tombstones, true );
	if ( ! is_array( $tombstones ) ) {
		$tombstones = array();
	}

	$tombstones[] = array(
		'url'        => $permalink,
		'deleted_at' => gmdate( 'c' ),
	);

	// FIFO cap at 1000 entries.
	if ( count( $tombstones ) > 1000 ) {
		$tombstones = array_slice( $tombstones, -1000 );
	}

	update_option( 'openfeeder_tombstones', wp_json_encode( $tombstones ), false );
}
add_action( 'trashed_post', 'openfeeder_record_tombstone', 5 );
add_action( 'deleted_post', 'openfeeder_record_tombstone', 5 );

// ── Sidecar webhook notifications ─────────────────────────────────────────────

/**
 * Notify the OpenFeeder sidecar to upsert a post's content.
 * Triggered when a post is published (new) or updated.
 *
 * @param int     $post_id Post ID.
 * @param WP_Post $post    Post object (may be null in post_updated hook).
 */
function openfeeder_notify_sidecar( $post_id, $post = null ) {
	// Resolve post object if not provided (post_updated passes old + new separately)
	if ( null === $post ) {
		$post = get_post( $post_id );
	}

	if ( ! $post || 'publish' !== $post->post_status ) {
		return;
	}
	if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
		return;
	}

	$webhook_url = get_option( 'openfeeder_sidecar_webhook', '' );
	if ( empty( $webhook_url ) ) {
		return;
	}

	$permalink = str_replace( home_url(), '', get_permalink( $post_id ) );
	if ( empty( $permalink ) ) {
		return;
	}

	$webhook_key = get_option( 'openfeeder_sidecar_key', '' );

	$headers = array( 'Content-Type' => 'application/json' );
	if ( ! empty( $webhook_key ) ) {
		$headers['Authorization'] = 'Bearer ' . $webhook_key;
	}

	wp_remote_post(
		trailingslashit( $webhook_url ) . 'openfeeder/update',
		array(
			'headers'  => $headers,
			'body'     => wp_json_encode( array(
				'action' => 'upsert',
				'urls'   => array( $permalink ),
			) ),
			'blocking' => false,
			'timeout'  => 5,
		)
	);
}
add_action( 'publish_post', 'openfeeder_notify_sidecar', 10, 2 );
add_action( 'post_updated', 'openfeeder_notify_sidecar', 10, 2 );

/**
 * Notify the OpenFeeder sidecar to delete a post's content from the index.
 * Triggered when a post is trashed or permanently deleted.
 *
 * @param int $post_id Post ID.
 */
function openfeeder_delete_from_sidecar( $post_id ) {
	if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
		return;
	}

	$webhook_url = get_option( 'openfeeder_sidecar_webhook', '' );
	if ( empty( $webhook_url ) ) {
		return;
	}

	// get_permalink may not work after deletion; use the stored URL or reconstruct
	$permalink = str_replace( home_url(), '', get_permalink( $post_id ) );
	if ( empty( $permalink ) ) {
		return;
	}

	$webhook_key = get_option( 'openfeeder_sidecar_key', '' );

	$headers = array( 'Content-Type' => 'application/json' );
	if ( ! empty( $webhook_key ) ) {
		$headers['Authorization'] = 'Bearer ' . $webhook_key;
	}

	wp_remote_post(
		trailingslashit( $webhook_url ) . 'openfeeder/update',
		array(
			'headers'  => $headers,
			'body'     => wp_json_encode( array(
				'action' => 'delete',
				'urls'   => array( $permalink ),
			) ),
			'blocking' => false,
			'timeout'  => 5,
		)
	);
}
add_action( 'trashed_post', 'openfeeder_delete_from_sidecar' );
add_action( 'deleted_post', 'openfeeder_delete_from_sidecar' );

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
	register_setting( 'openfeeder_settings', 'openfeeder_llm_gateway', array(
		'type'              => 'boolean',
		'default'           => false,
		'sanitize_callback' => 'rest_sanitize_boolean',
	) );
	register_setting( 'openfeeder_settings', 'openfeeder_max_chunks', array(
		'type'              => 'integer',
		'default'           => 50,
		'sanitize_callback' => 'absint',
	) );
	register_setting( 'openfeeder_settings', 'openfeeder_api_key', array(
		'type'              => 'string',
		'default'           => '',
		'sanitize_callback' => 'sanitize_text_field',
	) );
	register_setting( 'openfeeder_settings', 'openfeeder_excluded_paths', array(
		'type'              => 'string',
		'default'           => "/checkout\n/cart\n/my-account",
		'sanitize_callback' => 'sanitize_textarea_field',
	) );
	register_setting( 'openfeeder_settings', 'openfeeder_excluded_post_types', array(
		'type'              => 'string',
		'default'           => '',
		'sanitize_callback' => 'sanitize_textarea_field',
	) );
	register_setting( 'openfeeder_settings', 'openfeeder_author_display', array(
		'type'              => 'string',
		'default'           => 'name',
		'sanitize_callback' => 'sanitize_text_field',
	) );
	register_setting( 'openfeeder_settings', 'openfeeder_sidecar_webhook', array(
		'type'              => 'string',
		'default'           => '',
		'sanitize_callback' => 'esc_url_raw',
	) );
	register_setting( 'openfeeder_settings', 'openfeeder_sidecar_key', array(
		'type'              => 'string',
		'default'           => '',
		'sanitize_callback' => 'sanitize_text_field',
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
				<tr>
					<th scope="row">
						<label for="openfeeder_llm_gateway">
							<?php esc_html_e( 'LLM Gateway', 'openfeeder' ); ?>
						</label>
					</th>
					<td>
						<input type="checkbox" id="openfeeder_llm_gateway" name="openfeeder_llm_gateway" value="1"
							<?php checked( get_option( 'openfeeder_llm_gateway', false ) ); ?> />
						<label for="openfeeder_llm_gateway">
							<?php esc_html_e( 'Enable', 'openfeeder' ); ?>
						</label>
						<p class="description">
							<?php esc_html_e( 'When enabled, AI crawlers (GPTBot, ClaudeBot, PerplexityBot…) visiting any page will receive a structured JSON response directing them to use OpenFeeder endpoints instead of scraping HTML.', 'openfeeder' ); ?>
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row">
						<label for="openfeeder_api_key">
							<?php esc_html_e( 'API Key', 'openfeeder' ); ?>
						</label>
					</th>
					<td>
						<input type="text" id="openfeeder_api_key" name="openfeeder_api_key"
							value="<?php echo esc_attr( get_option( 'openfeeder_api_key', '' ) ); ?>"
							class="regular-text" autocomplete="off" />
						<p class="description">
							<?php esc_html_e( 'Optional. If set, requests to /openfeeder must include an Authorization: Bearer &lt;key&gt; header. Leave blank to allow public access. The discovery document (/.well-known/openfeeder.json) is always public.', 'openfeeder' ); ?>
						</p>
					</td>
				</tr>
				</table>

			<h2><?php esc_html_e( 'Security', 'openfeeder' ); ?></h2>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row">
						<label for="openfeeder_excluded_paths">
							<?php esc_html_e( 'Excluded Paths', 'openfeeder' ); ?>
						</label>
					</th>
					<td>
						<textarea id="openfeeder_excluded_paths" name="openfeeder_excluded_paths"
							rows="5" class="large-text code"><?php echo esc_textarea( get_option( 'openfeeder_excluded_paths', "/checkout\n/cart\n/my-account" ) ); ?></textarea>
						<p class="description">
							<?php esc_html_e( 'Path prefixes to exclude from OpenFeeder (one per line). Posts with URLs starting with these prefixes will not be exposed. Example: /checkout, /cart, /my-account, /admin', 'openfeeder' ); ?>
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row">
						<label for="openfeeder_excluded_post_types">
							<?php esc_html_e( 'Additional Excluded Post Types', 'openfeeder' ); ?>
						</label>
					</th>
					<td>
						<textarea id="openfeeder_excluded_post_types" name="openfeeder_excluded_post_types"
							rows="3" class="large-text code"><?php echo esc_textarea( get_option( 'openfeeder_excluded_post_types', '' ) ); ?></textarea>
						<p class="description">
							<?php esc_html_e( 'Additional post type slugs to exclude (one per line). Internal types (attachment, revision, nav_menu_item, wp_block, wp_template, etc.) are always excluded.', 'openfeeder' ); ?>
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row">
						<label for="openfeeder_author_display">
							<?php esc_html_e( 'Author Display', 'openfeeder' ); ?>
						</label>
					</th>
					<td>
						<select id="openfeeder_author_display" name="openfeeder_author_display">
							<option value="name" <?php selected( get_option( 'openfeeder_author_display', 'name' ), 'name' ); ?>>
								<?php esc_html_e( 'Display name only', 'openfeeder' ); ?>
							</option>
							<option value="hidden" <?php selected( get_option( 'openfeeder_author_display', 'name' ), 'hidden' ); ?>>
								<?php esc_html_e( 'Hidden (never expose author)', 'openfeeder' ); ?>
							</option>
						</select>
						<p class="description">
							<?php esc_html_e( 'Control whether author names appear in OpenFeeder responses. Only display names are ever used — email addresses and user IDs are never exposed.', 'openfeeder' ); ?>
						</p>
					</td>
				</tr>
			</table>

			<h2><?php esc_html_e( 'Sidecar Integration', 'openfeeder' ); ?></h2>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row">
						<label for="openfeeder_sidecar_webhook">
							<?php esc_html_e( 'Sidecar Webhook URL', 'openfeeder' ); ?>
						</label>
					</th>
					<td>
						<input type="url" id="openfeeder_sidecar_webhook" name="openfeeder_sidecar_webhook"
							value="<?php echo esc_attr( get_option( 'openfeeder_sidecar_webhook', '' ) ); ?>"
							class="regular-text" placeholder="http://localhost:8080" />
						<p class="description">
							<?php esc_html_e( 'Optional. Base URL of your OpenFeeder sidecar (e.g. http://localhost:8080). When set, WordPress will notify the sidecar whenever a post is published, updated, or deleted, so the sidecar index stays in sync without waiting for the next scheduled re-crawl.', 'openfeeder' ); ?>
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row">
						<label for="openfeeder_sidecar_key">
							<?php esc_html_e( 'Sidecar Webhook Key', 'openfeeder' ); ?>
						</label>
					</th>
					<td>
						<input type="text" id="openfeeder_sidecar_key" name="openfeeder_sidecar_key"
							value="<?php echo esc_attr( get_option( 'openfeeder_sidecar_key', '' ) ); ?>"
							class="regular-text" autocomplete="off" />
						<p class="description">
							<?php esc_html_e( 'Optional. The OPENFEEDER_WEBHOOK_SECRET configured in the sidecar. Sent as Authorization: Bearer &lt;key&gt;. Leave blank if the sidecar has no secret set.', 'openfeeder' ); ?>
						</p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}
