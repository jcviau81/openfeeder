<?php

/**
 * @package     Joomla.Plugin
 * @subpackage  System.OpenFeeder
 *
 * @copyright   OpenFeeder
 * @license     GNU General Public License version 2 or later
 */

namespace Joomla\Plugin\System\OpenFeeder\Controller;

defined('_JEXEC') or die;

use Joomla\CMS\Application\SiteApplication;
use Joomla\CMS\Uri\Uri;
use Joomla\Registry\Registry;

class DiscoveryController
{
    private SiteApplication $app;
    private Registry $params;

    public function __construct(SiteApplication $app, Registry $params)
    {
        $this->app    = $app;
        $this->params = $params;
    }

    public function execute(): void
    {
        $siteName    = $this->app->get('sitename', '');
        $siteUrl     = rtrim(Uri::root(), '/');
        $language    = str_replace('_', '-', $this->app->getLanguage()->getTag());
        $description = $this->params->get('site_description', '') ?: null;

        $discovery = [
            'version'      => '1.0',
            'site'         => [
                'name'        => $siteName,
                'url'         => $siteUrl,
                'language'    => $language,
                'description' => $description,
            ],
            'feed'         => [
                'endpoint' => '/openfeeder',
                'type'     => 'paginated',
            ],
            'capabilities' => [],
            'contact'      => null,
        ];

        // Remove null values from site
        $discovery['site'] = array_filter($discovery['site'], function ($v) {
            return $v !== null;
        });

        $json         = json_encode($discovery, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        $etag         = '"' . substr(md5($json), 0, 16) . '"';
        $lastModified = gmdate('D, d M Y 00:00:00 T'); // Today at midnight UTC

        // Conditional request: 304 Not Modified.
        $ifNoneMatch = isset($_SERVER['HTTP_IF_NONE_MATCH'])
            ? trim($_SERVER['HTTP_IF_NONE_MATCH']) : '';
        if ($ifNoneMatch === $etag) {
            http_response_code(304);
            $this->app->close();
            return;
        }

        $this->app->setHeader('Content-Type', 'application/json; charset=utf-8');
        $this->app->setHeader('X-OpenFeeder', '1.0');
        $this->app->setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
        $this->app->setHeader('ETag', $etag);
        $this->app->setHeader('Last-Modified', $lastModified);
        $this->app->setHeader('Vary', 'Accept-Encoding');
        $this->app->sendHeaders();

        echo $json;

        $this->app->close();
    }
}
