<?php

namespace Drupal\openfeeder\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\JsonResponse;

/**
 * Serves the /.well-known/openfeeder.json discovery document.
 */
class DiscoveryController extends ControllerBase {

  /**
   * Serve the discovery JSON response.
   *
   * @return \Symfony\Component\HttpFoundation\JsonResponse
   *   The discovery document.
   */
  public function serve(): JsonResponse {
    $config = $this->config('openfeeder.settings');
    $site_config = $this->config('system.site');

    $enabled = $config->get('enabled') ?? TRUE;
    if (!$enabled) {
      return $this->errorResponse('NOT_FOUND', 'OpenFeeder is disabled on this site.', 404);
    }

    $description = $config->get('description') ?: $site_config->get('slogan') ?: '';
    $language = \Drupal::languageManager()->getCurrentLanguage()->getId();

    $data = [
      'version' => '1.0',
      'site' => [
        'name' => $site_config->get('name'),
        'url' => \Drupal::request()->getSchemeAndHttpHost() . '/',
        'language' => $language,
        'description' => $description,
      ],
      'feed' => [
        'endpoint' => '/api/openfeeder',
        'type' => 'paginated',
      ],
      'capabilities' => ['search'],
      'contact' => $site_config->get('mail') ?: '',
    ];

    $response = new JsonResponse($data, 200, [
      'X-OpenFeeder' => '1.0',
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
