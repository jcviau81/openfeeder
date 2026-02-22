<?php

namespace Drupal\openfeeder\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Datetime\DateFormatterInterface;
use Drupal\openfeeder\Service\CacheService;
use Drupal\openfeeder\Service\ChunkerService;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;

/**
 * Handles GET /openfeeder requests.
 *
 * Without a `url` parameter, returns a paginated index of published nodes.
 * With a `url` parameter, returns chunked content for that node.
 * With a `q` parameter, returns search results ranked by relevance.
 */
class ContentController extends ControllerBase {

  /**
   * Number of items per index page.
   */
  const ITEMS_PER_PAGE = 20;

  /**
   * The chunker service.
   *
   * @var \Drupal\openfeeder\Service\ChunkerService
   */
  protected ChunkerService $chunker;

  /**
   * The cache service.
   *
   * @var \Drupal\openfeeder\Service\CacheService
   */
  protected CacheService $cacheService;

  /**
   * The date formatter service.
   *
   * @var \Drupal\Core\Datetime\DateFormatterInterface
   */
  protected DateFormatterInterface $dateFormatter;

  /**
   * Constructs a ContentController object.
   *
   * @param \Drupal\openfeeder\Service\ChunkerService $chunker
   *   The chunker service.
   * @param \Drupal\openfeeder\Service\CacheService $cache_service
   *   The cache service.
   * @param \Drupal\Core\Datetime\DateFormatterInterface $date_formatter
   *   The date formatter service.
   */
  public function __construct(ChunkerService $chunker, CacheService $cache_service, DateFormatterInterface $date_formatter) {
    $this->chunker = $chunker;
    $this->cacheService = $cache_service;
    $this->dateFormatter = $date_formatter;
  }

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('openfeeder.chunker'),
      $container->get('openfeeder.cache'),
      $container->get('date.formatter'),
    );
  }

  /**
   * Route the request to the appropriate handler.
   *
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The current request.
   *
   * @return \Symfony\Component\HttpFoundation\JsonResponse
   *   The JSON response.
   */
  public function serve(Request $request): JsonResponse {
    $config = $this->config('openfeeder.settings');
    $enabled = $config->get('enabled') ?? TRUE;

    if (!$enabled) {
      return $this->errorResponse('NOT_FOUND', 'OpenFeeder is disabled on this site.', 404);
    }

    $url = $request->query->get('url', '');
    $query = $request->query->get('q', '');

    if (!empty($url)) {
      return $this->serveSingle($request, $url);
    }

    if (!empty($query)) {
      return $this->serveSearch($request, $query);
    }

    return $this->serveIndex($request);
  }

  /**
   * Serve chunked content for a single node.
   *
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The current request.
   * @param string $url
   *   Relative URL of the node.
   *
   * @return \Symfony\Component\HttpFoundation\JsonResponse
   *   The JSON response.
   */
  protected function serveSingle(Request $request, string $url): JsonResponse {
    $node = $this->findNodeByUrl($url);

    if (!$node) {
      return $this->errorResponse('NOT_FOUND', 'No published content found at the given URL.', 404);
    }

    $config = $this->config('openfeeder.settings');
    $limit = (int) ($request->query->get('limit', 10));
    $max_chunks = (int) ($config->get('max_chunks') ?: 50);
    $limit = min(max($limit, 1), $max_chunks);

    // Check cache.
    $cache_key = 'node_' . $node->id();
    $cached = $this->cacheService->get($cache_key);

    if ($cached !== FALSE) {
      $data = $cached['data'];
      $data['meta']['cached'] = TRUE;
      $data['meta']['cache_age_seconds'] = $this->cacheService->age($cached);
      $data['chunks'] = array_slice($data['chunks'], 0, $limit);
      $data['meta']['returned_chunks'] = count($data['chunks']);

      return $this->jsonResponse($data, 'HIT');
    }

    // Build response.
    $body = '';
    if ($node->hasField('body') && !$node->get('body')->isEmpty()) {
      $body = $node->get('body')->value;
    }

    $cleaned = $this->chunker->clean($body);
    $node_url = $node->toUrl()->setAbsolute(TRUE)->toString();
    $chunks = $this->chunker->chunk($cleaned, $node_url);

    $author = NULL;
    if ($node->getOwner()) {
      $author = $node->getOwner()->getDisplayName();
    }

    $summary = '';
    if ($node->hasField('body') && !$node->get('body')->isEmpty()) {
      $summary = $node->get('body')->summary;
    }
    if (empty($summary)) {
      $summary = $this->chunker->trimWords($cleaned, 40);
    }

    $language = \Drupal::languageManager()->getCurrentLanguage()->getId();

    $data = [
      'schema' => 'openfeeder/1.0',
      'url' => $node_url,
      'title' => $node->getTitle(),
      'author' => $author,
      'published' => gmdate('c', $node->getCreatedTime()),
      'updated' => gmdate('c', $node->getChangedTime()),
      'language' => $language,
      'summary' => $summary,
      'chunks' => $chunks,
      'meta' => [
        'total_chunks' => count($chunks),
        'returned_chunks' => min(count($chunks), $limit),
        'cached' => FALSE,
        'cache_age_seconds' => NULL,
      ],
    ];

    // Store full response in cache before applying limit.
    $this->cacheService->set($cache_key, $data, ['node:' . $node->id()]);

    $data['chunks'] = array_slice($data['chunks'], 0, $limit);
    $data['meta']['returned_chunks'] = count($data['chunks']);

    return $this->jsonResponse($data, 'MISS');
  }

  /**
   * Serve a paginated index of all published nodes.
   *
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The current request.
   *
   * @return \Symfony\Component\HttpFoundation\JsonResponse
   *   The JSON response.
   */
  protected function serveIndex(Request $request): JsonResponse {
    $page = max(1, (int) $request->query->get('page', 1));

    // Check cache.
    $cache_key = 'index_' . $page;
    $cached = $this->cacheService->get($cache_key);

    if ($cached !== FALSE) {
      return $this->jsonResponse($cached['data'], 'HIT');
    }

    $storage = $this->entityTypeManager()->getStorage('node');
    $query = $storage->getQuery()
      ->accessCheck(TRUE)
      ->condition('status', 1)
      ->sort('created', 'DESC')
      ->range(($page - 1) * self::ITEMS_PER_PAGE, self::ITEMS_PER_PAGE);
    $nids = $query->execute();

    // Get total count for pagination.
    $count_query = $storage->getQuery()
      ->accessCheck(TRUE)
      ->condition('status', 1)
      ->count();
    $total = (int) $count_query->execute();
    $total_pages = (int) ceil($total / self::ITEMS_PER_PAGE);

    $items = [];
    if (!empty($nids)) {
      $nodes = $storage->loadMultiple($nids);
      foreach ($nodes as $node) {
        $summary = '';
        if ($node->hasField('body') && !$node->get('body')->isEmpty()) {
          $summary = $node->get('body')->summary;
          if (empty($summary)) {
            $summary = $this->chunker->trimWords(
              strip_tags($node->get('body')->value),
              30
            );
          }
        }

        $path = $node->toUrl()->toString();

        $items[] = [
          'url' => $path,
          'title' => $node->getTitle(),
          'published' => gmdate('c', $node->getCreatedTime()),
          'summary' => $summary,
        ];
      }
    }

    $data = [
      'schema' => 'openfeeder/1.0',
      'type' => 'index',
      'page' => $page,
      'total_pages' => $total_pages,
      'items' => $items,
    ];

    $this->cacheService->set($cache_key, $data, ['node_list']);

    return $this->jsonResponse($data, 'MISS');
  }

  /**
   * Serve search results ranked by simple relevance.
   *
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The current request.
   * @param string $query
   *   The search query string.
   *
   * @return \Symfony\Component\HttpFoundation\JsonResponse
   *   The JSON response.
   */
  protected function serveSearch(Request $request, string $query): JsonResponse {
    $limit = (int) ($request->query->get('limit', 10));
    $limit = min(max($limit, 1), 50);

    $storage = $this->entityTypeManager()->getStorage('node');

    // Search by title and body using CONTAINS condition.
    $title_query = $storage->getQuery()
      ->accessCheck(TRUE)
      ->condition('status', 1)
      ->condition('title', $query, 'CONTAINS')
      ->range(0, $limit);
    $title_nids = $title_query->execute();

    $body_query = $storage->getQuery()
      ->accessCheck(TRUE)
      ->condition('status', 1)
      ->condition('body.value', $query, 'CONTAINS')
      ->range(0, $limit);
    $body_nids = $body_query->execute();

    // Merge results, prioritizing title matches.
    $all_nids = array_unique(array_merge(array_values($title_nids), array_values($body_nids)));
    $all_nids = array_slice($all_nids, 0, $limit);

    $items = [];
    if (!empty($all_nids)) {
      $nodes = $storage->loadMultiple($all_nids);
      $query_lower = mb_strtolower($query);

      foreach ($nodes as $node) {
        $title = $node->getTitle();
        $body_text = '';
        $summary = '';

        if ($node->hasField('body') && !$node->get('body')->isEmpty()) {
          $body_text = strip_tags($node->get('body')->value);
          $summary = $node->get('body')->summary;
          if (empty($summary)) {
            $summary = $this->chunker->trimWords($body_text, 30);
          }
        }

        // Simple relevance score: title match = 0.8+, body match = 0.4+.
        $relevance = 0.0;
        $title_lower = mb_strtolower($title);
        $body_lower = mb_strtolower($body_text);

        if (str_contains($title_lower, $query_lower)) {
          $relevance += 0.6;
          // Bonus for exact title match.
          if ($title_lower === $query_lower) {
            $relevance += 0.3;
          }
        }
        if (str_contains($body_lower, $query_lower)) {
          $relevance += 0.4;
        }
        $relevance = min($relevance, 1.0);

        $items[] = [
          'url' => $node->toUrl()->toString(),
          'title' => $title,
          'published' => gmdate('c', $node->getCreatedTime()),
          'summary' => $summary,
          'relevance' => round($relevance, 2),
        ];
      }

      // Sort by relevance descending.
      usort($items, fn($a, $b) => $b['relevance'] <=> $a['relevance']);
    }

    $data = [
      'schema' => 'openfeeder/1.0',
      'type' => 'search',
      'query' => $request->query->get('q'),
      'items' => $items,
    ];

    return $this->jsonResponse($data, 'MISS');
  }

  /**
   * Find a published node by its path alias or internal path.
   *
   * @param string $url
   *   The URL or path alias to look up.
   *
   * @return \Drupal\node\NodeInterface|null
   *   The node entity, or NULL if not found.
   */
  protected function findNodeByUrl(string $url) {
    // Ensure path starts with /.
    $path = parse_url($url, PHP_URL_PATH) ?: $url;
    if (!str_starts_with($path, '/')) {
      $path = '/' . $path;
    }

    // Resolve alias to internal path.
    $path_alias_manager = \Drupal::service('path_alias.manager');
    $internal_path = $path_alias_manager->getPathByAlias($path);

    // Try to extract node ID from internal path.
    if (preg_match('#^/node/(\d+)$#', $internal_path, $matches)) {
      $node = $this->entityTypeManager()->getStorage('node')->load($matches[1]);
      if ($node && $node->isPublished()) {
        return $node;
      }
    }

    // Fallback: try the original path as an internal path.
    if (preg_match('#^/node/(\d+)$#', $path, $matches)) {
      $node = $this->entityTypeManager()->getStorage('node')->load($matches[1]);
      if ($node && $node->isPublished()) {
        return $node;
      }
    }

    return NULL;
  }

  /**
   * Send a JSON response with OpenFeeder headers.
   *
   * @param array $data
   *   Response data.
   * @param string $cache_state
   *   'HIT' or 'MISS'.
   *
   * @return \Symfony\Component\HttpFoundation\JsonResponse
   *   The JSON response.
   */
  protected function jsonResponse(array $data, string $cache_state = 'MISS'): JsonResponse {
    $response = new JsonResponse($data, 200, [
      'X-OpenFeeder' => '1.0',
      'X-OpenFeeder-Cache' => $cache_state,
    ]);
    $response->setEncodingOptions(JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

    return $response;
  }

  /**
   * Build an error response.
   *
   * @param string $code
   *   Error code.
   * @param string $message
   *   Human-readable message.
   * @param int $status
   *   HTTP status code.
   *
   * @return \Symfony\Component\HttpFoundation\JsonResponse
   *   The error response.
   */
  protected function errorResponse(string $code, string $message, int $status): JsonResponse {
    $data = [
      'schema' => 'openfeeder/1.0',
      'error' => [
        'code' => $code,
        'message' => $message,
      ],
    ];

    $response = new JsonResponse($data, $status, [
      'X-OpenFeeder' => '1.0',
    ]);
    $response->setEncodingOptions(JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

    return $response;
  }

}
