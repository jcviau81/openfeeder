<?php

namespace Drupal\openfeeder\Service;

use Drupal\Core\Cache\CacheBackendInterface;

/**
 * OpenFeeder cache layer using Drupal's cache API.
 *
 * Provides get/set/invalidate backed by Drupal's cache system with tag-based
 * invalidation. Default TTL is 1 hour.
 */
class CacheService {

  /**
   * Default cache TTL in seconds (1 hour).
   */
  const TTL = 3600;

  /**
   * Prefix for all cache IDs.
   */
  const PREFIX = 'openfeeder:';

  /**
   * The cache backend.
   *
   * @var \Drupal\Core\Cache\CacheBackendInterface
   */
  protected CacheBackendInterface $cache;

  /**
   * Constructs a CacheService object.
   *
   * @param \Drupal\Core\Cache\CacheBackendInterface $cache
   *   The cache backend.
   */
  public function __construct(CacheBackendInterface $cache) {
    $this->cache = $cache;
  }

  /**
   * Get a cached value.
   *
   * @param string $key
   *   Cache key (without prefix).
   *
   * @return array|false
   *   Array with 'data' and 'created' keys, or FALSE on miss.
   */
  public function get(string $key) {
    $item = $this->cache->get(self::PREFIX . $key);

    if (!$item) {
      return FALSE;
    }

    return $item->data;
  }

  /**
   * Store a value in cache.
   *
   * @param string $key
   *   Cache key (without prefix).
   * @param mixed $data
   *   Data to cache.
   * @param array $tags
   *   Cache tags for invalidation.
   */
  public function set(string $key, $data, array $tags = []): void {
    $value = [
      'data' => $data,
      'created' => \Drupal::time()->getRequestTime(),
    ];

    $this->cache->set(
      self::PREFIX . $key,
      $value,
      \Drupal::time()->getRequestTime() + self::TTL,
      array_merge(['openfeeder'], $tags)
    );
  }

  /**
   * Invalidate cache entries by tags.
   *
   * @param array $tags
   *   Cache tags to invalidate.
   */
  public function invalidateTags(array $tags): void {
    \Drupal::service('cache_tags.invalidator')->invalidateTags($tags);
  }

  /**
   * Invalidate cache for a specific node.
   *
   * @param int $nid
   *   The node ID.
   */
  public function invalidateNode(int $nid): void {
    $this->invalidateTags(['node:' . $nid, 'node_list']);
  }

  /**
   * Invalidate all OpenFeeder cache entries.
   */
  public function invalidateAll(): void {
    $this->invalidateTags(['openfeeder']);
  }

  /**
   * Calculate the age of a cached entry in seconds.
   *
   * @param array $cached
   *   Cached value from get().
   *
   * @return int
   *   Age in seconds.
   */
  public function age(array $cached): int {
    if (!isset($cached['created'])) {
      return 0;
    }
    return \Drupal::time()->getRequestTime() - $cached['created'];
  }

}
