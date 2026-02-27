<?php

namespace Drupal\openfeeder\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Serves the /.well-known/openfeeder.json discovery document.
 */
class DiscoveryController extends ControllerBase {

  /**
   * Serve the discovery JSON response with HTTP caching headers.
   *
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The current request (injected by Drupal for conditional request support).
   *
   * @return \Symfony\Component\HttpFoundation\JsonResponse|\Symfony\Component\HttpFoundation\Response
   *   The discovery document, or a 304 response.
   */
  public function serve(Request $request): JsonResponse|Response {
    $config = $this->config('openfeeder.settings');
    $site_config = $this->config('system.site');

    $enabled = $config->get('enabled') ?? TRUE;
    if (!$enabled) {
      return $this->errorResponse('NOT_FOUND', 'OpenFeeder is disabled on this site.', 404);
    }

    $description = $config->get('description') ?: $site_config->get('slogan') ?: '';
    $language = \Drupal::languageManager()->getCurrentLanguage()->getId();

    $data = [
      'version' => '1.0.2',
      'site' => [
        'name' => $site_config->get('name'),
        'url' => \Drupal::request()->getSchemeAndHttpHost() . '/',
        'language' => $language,
        'description' => $description,
      ],
      'feed' => [
        'endpoint' => '/openfeeder',
        'type' => 'paginated',
      ],
      'capabilities' => ['search'],
      'contact' => $site_config->get('mail') ?: '',
    ];

    $response = new JsonResponse($data, 200, [
      'X-OpenFeeder' => '1.0',
    ]);
    $response->setEncodingOptions(JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

    $json = $response->getContent();
    $etag = '"' . substr(md5($json), 0, 16) . '"';
    $last_modified = gmdate('D, d M Y 00:00:00 T'); // Today at midnight UTC

    // Conditional request: 304 Not Modified.
    if ($request->headers->get('if-none-match') === $etag) {
      return new Response('', 304);
    }

    $response->headers->set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    $response->headers->set('ETag', $etag);
    $response->headers->set('Last-Modified', $last_modified);
    $response->headers->set('Vary', 'Accept-Encoding');

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
