<?php
/**
 * OpenFeeder WooCommerce products API endpoint.
 *
 * Handles GET /openfeeder/products with filtering, pagination, and
 * full OpenFeeder schema output including variants and chunked descriptions.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class OpenFeeder_WC_Products_API {

	/**
	 * Maximum allowed limit per request.
	 *
	 * @var int
	 */
	const MAX_LIMIT = 100;

	/**
	 * Serve the products endpoint response.
	 */
	public function serve() {
		$this->send_headers();

		// Handle CORS preflight.
		if ( 'OPTIONS' === $_SERVER['REQUEST_METHOD'] ) {
			status_header( 204 );
			exit;
		}

		if ( 'GET' !== $_SERVER['REQUEST_METHOD'] ) {
			$this->send_error( 'METHOD_NOT_ALLOWED', 'Only GET requests are supported.', 405 );
		}

		// Single product lookup.
		$url = isset( $_GET['url'] ) ? sanitize_text_field( wp_unslash( $_GET['url'] ) ) : '';
		$sku = isset( $_GET['sku'] ) ? sanitize_text_field( wp_unslash( $_GET['sku'] ) ) : '';

		if ( ! empty( $url ) || ! empty( $sku ) ) {
			$this->serve_single( $url, $sku );
			return;
		}

		// Paginated / filtered product list.
		$this->serve_list();
	}

	// ── Single product ────────────────────────────────────────────────────────

	/**
	 * Serve a single product by URL or SKU.
	 *
	 * @param string $url Relative product URL.
	 * @param string $sku Product SKU.
	 */
	private function serve_single( $url, $sku ) {
		$product = null;

		if ( ! empty( $url ) ) {
			// Resolve URL to post ID.
			$post_id = url_to_postid( home_url( $url ) );
			if ( $post_id ) {
				$product = wc_get_product( $post_id );
			}
		} elseif ( ! empty( $sku ) ) {
			$product_id = wc_get_product_id_by_sku( $sku );
			if ( $product_id ) {
				$product = wc_get_product( $product_id );
			}
		}

		if ( ! $product || ! $product->is_visible() ) {
			$this->send_error( 'NOT_FOUND', 'Product not found.', 404 );
		}

		$chunker = new OpenFeeder_WC_Chunker();
		$item    = $this->format_product( $product, $chunker );

		$data = array(
			'schema'   => 'openfeeder/1.0+ecommerce',
			'type'     => 'product',
			'currency' => get_woocommerce_currency(),
			'item'     => $item,
		);

		$this->apply_cache_headers( $data );
		echo wp_json_encode( $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
	}

	// ── Product list ──────────────────────────────────────────────────────────

	/**
	 * Serve a paginated, filtered list of products.
	 */
	private function serve_list() {
		$default_per_page = (int) get_option( 'openfeeder_wc_per_page', 10 );
		$default_per_page = max( 1, min( self::MAX_LIMIT, $default_per_page ) );

		// Parse and sanitize query params.
		$page     = max( 1, (int) ( isset( $_GET['page'] ) ? $_GET['page'] : 1 ) );
		$limit    = max( 1, min( self::MAX_LIMIT, (int) ( isset( $_GET['limit'] ) ? $_GET['limit'] : $default_per_page ) ) );
		$category = isset( $_GET['category'] ) ? sanitize_text_field( wp_unslash( $_GET['category'] ) ) : '';
		$search   = isset( $_GET['q'] )        ? sanitize_text_field( wp_unslash( $_GET['q'] ) )        : '';
		$sku      = isset( $_GET['sku'] )       ? sanitize_text_field( wp_unslash( $_GET['sku'] ) )      : '';
		$min_price = isset( $_GET['min_price'] ) ? (float) $_GET['min_price'] : null;
		$max_price = isset( $_GET['max_price'] ) ? (float) $_GET['max_price'] : null;
		$in_stock  = isset( $_GET['in_stock'] )  ? filter_var( $_GET['in_stock'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE ) : null;
		$on_sale   = isset( $_GET['on_sale'] )   ? filter_var( $_GET['on_sale'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE ) : null;

		// Build WC query args.
		$args = array(
			'status'   => 'publish',
			'limit'    => $limit,
			'page'     => $page,
			'orderby'  => 'date',
			'order'    => 'DESC',
		);

		if ( ! empty( $search ) ) {
			$args['s'] = $search;
		}

		if ( ! empty( $sku ) ) {
			$args['sku'] = $sku;
		}

		if ( true === $in_stock ) {
			$args['stock_status'] = 'instock';
		}

		if ( true === $on_sale ) {
			$args['on_sale'] = true;
		}

		if ( ! empty( $category ) ) {
			$args['category'] = array( $category );
		}

		if ( null !== $min_price || null !== $max_price ) {
			// WC_Product_Query supports min_price / max_price via meta.
			// We'll use wc_get_products() which handles these via WP_Query tax/meta.
			if ( null !== $min_price ) {
				$args['min_price'] = $min_price;
			}
			if ( null !== $max_price ) {
				$args['max_price'] = $max_price;
			}
		}

		// Get total count for pagination (separate query without limit).
		$count_args                = $args;
		$count_args['limit']       = -1;
		$count_args['paginate']    = false;
		$count_args['return']      = 'ids';
		unset( $count_args['page'] );

		$all_ids     = wc_get_products( $count_args );
		$total_items = is_array( $all_ids ) ? count( $all_ids ) : 0;
		$total_pages = ( $total_items > 0 ) ? (int) ceil( $total_items / $limit ) : 1;

		// Fetch paged products.
		$args['return'] = 'objects';
		$products       = wc_get_products( $args );

		if ( ! is_array( $products ) ) {
			$products = array();
		}

		$chunker = new OpenFeeder_WC_Chunker();
		$items   = array();

		foreach ( $products as $product ) {
			if ( ! $product->is_visible() ) {
				continue;
			}
			$items[] = $this->format_product( $product, $chunker );
		}

		$data = array(
			'schema'      => 'openfeeder/1.0+ecommerce',
			'type'        => 'products',
			'page'        => $page,
			'total_pages' => $total_pages,
			'total_items' => $total_items,
			'currency'    => get_woocommerce_currency(),
			'items'       => $items,
		);

		$this->apply_cache_headers( $data );
		echo wp_json_encode( $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
	}

	// ── Product formatter ─────────────────────────────────────────────────────

	/**
	 * Format a WC_Product into the OpenFeeder product schema.
	 *
	 * @param WC_Product             $product WooCommerce product object.
	 * @param OpenFeeder_WC_Chunker  $chunker Chunker instance.
	 * @return array Formatted product array.
	 */
	private function format_product( WC_Product $product, OpenFeeder_WC_Chunker $chunker ) {
		$description = $product->get_description();
		$short_desc  = $product->get_short_description();
		$clean_desc  = $chunker->clean( $description );
		$summary     = $chunker->summarize( $short_desc, $description );
		$chunks      = $chunker->chunk( $clean_desc, (string) $product->get_id() );
		$permalink   = get_permalink( $product->get_id() );

		// Relative URL.
		$rel_url = str_replace( home_url(), '', $permalink );

		// Availability.
		$availability = $this->get_availability( $product );

		// Categories.
		$categories = array();
		foreach ( $product->get_category_ids() as $cat_id ) {
			$term = get_term( $cat_id, 'product_cat' );
			if ( $term && ! is_wp_error( $term ) ) {
				$categories[] = $term->name;
			}
		}

		// Tags.
		$tags = array();
		foreach ( $product->get_tag_ids() as $tag_id ) {
			$term = get_term( $tag_id, 'product_tag' );
			if ( $term && ! is_wp_error( $term ) ) {
				$tags[] = $term->name;
			}
		}

		// Images.
		$images       = array();
		$image_id     = $product->get_image_id();
		if ( $image_id ) {
			$image_url = wp_get_attachment_url( $image_id );
			if ( $image_url ) {
				$images[] = str_replace( home_url(), '', $image_url );
			}
		}
		foreach ( $product->get_gallery_image_ids() as $gal_id ) {
			$gal_url = wp_get_attachment_url( $gal_id );
			if ( $gal_url ) {
				$images[] = str_replace( home_url(), '', $gal_url );
			}
		}

		// Pricing.
		$price         = $product->get_price();
		$regular_price = $product->get_regular_price();
		$sale_price    = $product->get_sale_price();

		$item = array(
			'url'            => $rel_url,
			'title'          => $product->get_name(),
			'sku'            => $product->get_sku(),
			'price'          => $price !== '' ? wc_format_decimal( $price, 2 ) : null,
			'regular_price'  => $regular_price !== '' ? wc_format_decimal( $regular_price, 2 ) : null,
			'sale_price'     => $sale_price !== '' ? wc_format_decimal( $sale_price, 2 ) : null,
			'on_sale'        => $product->is_on_sale(),
			'availability'   => $availability,
			'stock_quantity' => $product->managing_stock() ? $product->get_stock_quantity() : null,
			'categories'     => $categories,
			'tags'           => $tags,
			'summary'        => $summary,
			'chunks'         => $chunks,
			'variants'       => $this->get_variants( $product ),
			'images'         => $images,
		);

		return $item;
	}

	/**
	 * Get availability string for a product.
	 *
	 * @param WC_Product $product WooCommerce product.
	 * @return string 'in_stock' | 'out_of_stock' | 'on_backorder'
	 */
	private function get_availability( WC_Product $product ) {
		if ( $product->is_in_stock() ) {
			if ( $product->is_on_backorder() ) {
				return 'on_backorder';
			}
			return 'in_stock';
		}
		return 'out_of_stock';
	}

	/**
	 * Get formatted variants for a variable product.
	 *
	 * @param WC_Product $product WooCommerce product.
	 * @return array Array of variant objects, or empty array for simple products.
	 */
	private function get_variants( WC_Product $product ) {
		if ( ! $product->is_type( 'variable' ) ) {
			return array();
		}

		/** @var WC_Product_Variable $product */
		$variations = $product->get_available_variations();
		$variants   = array();

		foreach ( $variations as $variation_data ) {
			$variation = wc_get_product( $variation_data['variation_id'] );
			if ( ! $variation ) {
				continue;
			}

			// Build clean attributes map (strip 'attribute_pa_' prefix, clean values).
			$attributes = array();
			foreach ( $variation_data['attributes'] as $attr_key => $attr_value ) {
				$clean_key = preg_replace( '/^attribute_pa_/', '', $attr_key );
				$clean_key = preg_replace( '/^attribute_/', '', $clean_key );
				$clean_key = str_replace( '-', '_', $clean_key );

				// If it's a taxonomy attribute, get the term label.
				if ( strpos( $attr_key, 'pa_' ) !== false ) {
					$taxonomy = str_replace( 'attribute_', '', $attr_key );
					$term     = get_term_by( 'slug', $attr_value, $taxonomy );
					$attr_value = ( $term && ! is_wp_error( $term ) ) ? $term->name : $attr_value;
				}

				$attributes[ $clean_key ] = $attr_value;
			}

			$v_price = $variation->get_price();

			$variants[] = array(
				'sku'          => $variation->get_sku(),
				'attributes'   => $attributes,
				'price'        => $v_price !== '' ? wc_format_decimal( $v_price, 2 ) : null,
				'availability' => $this->get_availability( $variation ),
			);
		}

		return $variants;
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	/**
	 * Send standard OpenFeeder base response headers.
	 *
	 * Cache-Control and ETag are added later once the response body is known.
	 */
	private function send_headers() {
		header( 'Content-Type: application/json; charset=utf-8' );
		header( 'X-OpenFeeder: 1.0' );
		header( 'X-OpenFeeder-Extension: ecommerce/1.0' );
		header( 'Access-Control-Allow-Origin: *' );
		header( 'Access-Control-Allow-Methods: GET, OPTIONS' );
		header( 'Access-Control-Allow-Headers: Content-Type' );
	}

	/**
	 * Apply HTTP caching headers and handle conditional 304 requests.
	 *
	 * Must be called BEFORE any output is generated (before echo).
	 *
	 * @param array $data The full response data array.
	 */
	private function apply_cache_headers( array $data ): void {
		$json          = wp_json_encode( $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
		$etag          = '"' . substr( md5( $json ), 0, 16 ) . '"';
		$last_modified = $this->get_last_modified_from_data( $data );

		// Conditional request: 304 Not Modified.
		$if_none_match = isset( $_SERVER['HTTP_IF_NONE_MATCH'] )
			? trim( $_SERVER['HTTP_IF_NONE_MATCH'] ) : '';
		if ( $if_none_match === $etag ) {
			status_header( 304 );
			exit;
		}

		header( 'Cache-Control: public, max-age=300, stale-while-revalidate=60' );
		header( 'ETag: ' . $etag );
		header( 'Last-Modified: ' . $last_modified );
		header( 'Vary: Accept-Encoding' );
	}

	/**
	 * Compute RFC 7231 Last-Modified date from response data.
	 *
	 * @param array $data Response data array.
	 * @return string RFC 7231 formatted date.
	 */
	private function get_last_modified_from_data( array $data ): string {
		$timestamps = array();

		if ( isset( $data['item']['published'] ) ) {
			$t = strtotime( $data['item']['published'] );
			if ( $t ) {
				$timestamps[] = $t;
			}
		}
		if ( isset( $data['items'] ) && is_array( $data['items'] ) ) {
			foreach ( $data['items'] as $item ) {
				if ( isset( $item['published'] ) ) {
					$t = strtotime( $item['published'] );
					if ( $t ) {
						$timestamps[] = $t;
					}
				}
			}
		}

		$max_ts = ! empty( $timestamps ) ? max( $timestamps ) : time();
		return gmdate( 'D, d M Y H:i:s T', $max_ts );
	}

	/**
	 * Send a JSON error response and exit.
	 *
	 * @param string $code    Error code.
	 * @param string $message Human-readable message.
	 * @param int    $status  HTTP status code.
	 */
	private function send_error( $code, $message, $status = 400 ) {
		status_header( $status );
		echo wp_json_encode(
			array(
				'schema' => 'openfeeder/1.0+ecommerce',
				'error'  => array(
					'code'    => $code,
					'message' => $message,
				),
			),
			JSON_UNESCAPED_SLASHES
		);
		exit;
	}
}
