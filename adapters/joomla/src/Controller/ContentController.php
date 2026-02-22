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
use Joomla\CMS\Factory;
use Joomla\CMS\Uri\Uri;
use Joomla\Plugin\System\OpenFeeder\Helper\Chunker;
use Joomla\Registry\Registry;

class ContentController
{
    private const ITEMS_PER_PAGE = 20;

    private SiteApplication $app;
    private Registry $params;

    public function __construct(SiteApplication $app, Registry $params)
    {
        $this->app    = $app;
        $this->params = $params;
    }

    public function execute(): void
    {
        $input = $this->app->input;
        $url   = $input->getString('url', '');
        $q     = $input->getString('q', '');
        $page  = max(1, $input->getInt('page', 1));
        $limit = min(
            (int) $this->params->get('max_chunks', 50),
            max(1, $input->getInt('limit', 10))
        );

        $this->app->setHeader('Content-Type', 'application/json; charset=utf-8');
        $this->app->setHeader('X-OpenFeeder', '1.0');

        if ($url !== '') {
            $this->handleSingleArticle($url, $limit);
        } elseif ($q !== '') {
            $this->handleSearch($q, $page, $limit);
        } else {
            $this->handleIndex($page);
        }
    }

    private function handleIndex(int $page): void
    {
        $cache    = Factory::getCache('openfeeder', '');
        $cacheKey = 'index_' . $page;
        $cached   = $cache->get($cacheKey);

        if ($cached !== false) {
            $age = time() - ($cached['created'] ?? time());

            $cached['data']['meta']['cached']            = true;
            $cached['data']['meta']['cache_age_seconds']  = $age;

            $this->app->setHeader('X-OpenFeeder-Cache', 'HIT');
            $this->respond($cached['data']);

            return;
        }

        $db    = Factory::getDbo();
        $query = $db->getQuery(true);

        // Count total published articles
        $countQuery = $db->getQuery(true)
            ->select('COUNT(*)')
            ->from($db->quoteName('#__content'))
            ->where($db->quoteName('state') . ' = 1');

        $db->setQuery($countQuery);
        $total      = (int) $db->loadResult();
        $totalPages = max(1, (int) ceil($total / self::ITEMS_PER_PAGE));
        $offset     = ($page - 1) * self::ITEMS_PER_PAGE;

        // Fetch articles
        $query->select([
            $db->quoteName('id'),
            $db->quoteName('title'),
            $db->quoteName('alias'),
            $db->quoteName('catid'),
            $db->quoteName('created'),
            $db->quoteName('introtext'),
        ])
            ->from($db->quoteName('#__content'))
            ->where($db->quoteName('state') . ' = 1')
            ->order($db->quoteName('created') . ' DESC');

        $db->setQuery($query, $offset, self::ITEMS_PER_PAGE);
        $articles = $db->loadObjectList();

        $items = [];

        foreach ($articles as $article) {
            $articlePath = $this->getArticlePath($article);

            $items[] = [
                'url'       => $articlePath,
                'title'     => $article->title,
                'published' => $this->toIso8601($article->created),
                'summary'   => $this->generateSummary($article->introtext),
            ];
        }

        $response = [
            'schema'      => 'openfeeder/1.0',
            'type'        => 'index',
            'page'        => $page,
            'total_pages' => $totalPages,
            'items'       => $items,
            'meta'        => [
                'cached'            => false,
                'cache_age_seconds' => null,
            ],
        ];

        $cache->store(['data' => $response, 'created' => time()], $cacheKey);

        $this->app->setHeader('X-OpenFeeder-Cache', 'MISS');
        $this->respond($response);
    }

    private function handleSingleArticle(string $url, int $limit): void
    {
        $alias = $this->extractAlias($url);

        if ($alias === '') {
            $this->respondError('NOT_FOUND', 'Invalid URL parameter.', 404);

            return;
        }

        $cache    = Factory::getCache('openfeeder', '');
        $cacheKey = 'article_' . md5($alias);
        $cached   = $cache->get($cacheKey);

        if ($cached !== false) {
            $age  = time() - ($cached['created'] ?? time());
            $data = $cached['data'];

            $data['meta']['cached']            = true;
            $data['meta']['cache_age_seconds']  = $age;

            // Apply limit
            $allChunks                    = $data['chunks'];
            $data['chunks']               = array_slice($allChunks, 0, $limit);
            $data['meta']['returned_chunks'] = count($data['chunks']);

            $this->app->setHeader('X-OpenFeeder-Cache', 'HIT');
            $this->respond($data);

            return;
        }

        $article = $this->loadArticleByAlias($alias);

        if ($article === null) {
            $this->respondError('NOT_FOUND', 'Article not found.', 404);

            return;
        }

        $fulltext = trim(($article->introtext ?? '') . "\n\n" . ($article->fulltext ?? ''));
        $chunks   = Chunker::chunk($fulltext, $url);

        $language = str_replace('_', '-', $this->app->getLanguage()->getTag());

        $authorName = null;

        if (!empty($article->created_by)) {
            $db    = Factory::getDbo();
            $query = $db->getQuery(true)
                ->select($db->quoteName('name'))
                ->from($db->quoteName('#__users'))
                ->where($db->quoteName('id') . ' = ' . (int) $article->created_by);
            $db->setQuery($query);
            $authorName = $db->loadResult() ?: null;
        }

        $response = [
            'schema'    => 'openfeeder/1.0',
            'url'       => rtrim(Uri::root(), '/') . '/' . ltrim($url, '/'),
            'title'     => $article->title,
            'author'    => $authorName,
            'published' => $this->toIso8601($article->created),
            'updated'   => $this->toIso8601($article->modified),
            'language'  => $language,
            'summary'   => $this->generateSummary($article->introtext),
            'chunks'    => $chunks,
            'meta'      => [
                'total_chunks'    => count($chunks),
                'returned_chunks' => count($chunks),
                'cached'          => false,
                'cache_age_seconds' => null,
            ],
        ];

        // Cache the full response (before applying limit)
        $cache->store(['data' => $response, 'created' => time()], $cacheKey);

        // Apply limit for this response
        $response['chunks']                  = array_slice($response['chunks'], 0, $limit);
        $response['meta']['returned_chunks'] = count($response['chunks']);

        $this->app->setHeader('X-OpenFeeder-Cache', 'MISS');
        $this->respond($response);
    }

    private function handleSearch(string $q, int $page, int $limit): void
    {
        $db     = Factory::getDbo();
        $query  = $db->getQuery(true);
        $search = $db->quote('%' . $db->escape($q, true) . '%', false);

        // Count matching articles
        $countQuery = $db->getQuery(true)
            ->select('COUNT(*)')
            ->from($db->quoteName('#__content'))
            ->where($db->quoteName('state') . ' = 1')
            ->where('(' .
                $db->quoteName('title') . ' LIKE ' . $search . ' OR ' .
                $db->quoteName('introtext') . ' LIKE ' . $search .
            ')');

        $db->setQuery($countQuery);
        $total      = (int) $db->loadResult();
        $totalPages = max(1, (int) ceil($total / self::ITEMS_PER_PAGE));
        $offset     = ($page - 1) * self::ITEMS_PER_PAGE;

        // Relevance: title match scores higher than introtext match
        $titleMatch = 'CASE WHEN ' . $db->quoteName('title') . ' LIKE ' . $search . ' THEN 1.0 ELSE 0.0 END';
        $bodyMatch  = 'CASE WHEN ' . $db->quoteName('introtext') . ' LIKE ' . $search . ' THEN 0.5 ELSE 0.0 END';

        $query->select([
            $db->quoteName('id'),
            $db->quoteName('title'),
            $db->quoteName('alias'),
            $db->quoteName('catid'),
            $db->quoteName('created'),
            $db->quoteName('introtext'),
            '(' . $titleMatch . ' + ' . $bodyMatch . ') AS relevance',
        ])
            ->from($db->quoteName('#__content'))
            ->where($db->quoteName('state') . ' = 1')
            ->where('(' .
                $db->quoteName('title') . ' LIKE ' . $search . ' OR ' .
                $db->quoteName('introtext') . ' LIKE ' . $search .
            ')')
            ->order('relevance DESC, ' . $db->quoteName('created') . ' DESC');

        $db->setQuery($query, $offset, self::ITEMS_PER_PAGE);
        $articles = $db->loadObjectList();

        $items = [];

        foreach ($articles as $article) {
            $articlePath = $this->getArticlePath($article);

            $items[] = [
                'url'       => $articlePath,
                'title'     => $article->title,
                'published' => $this->toIso8601($article->created),
                'summary'   => $this->generateSummary($article->introtext),
                'relevance' => (float) $article->relevance,
            ];
        }

        $response = [
            'schema'      => 'openfeeder/1.0',
            'type'        => 'index',
            'page'        => $page,
            'total_pages' => $totalPages,
            'items'       => $items,
            'meta'        => [
                'cached'            => false,
                'cache_age_seconds' => null,
            ],
        ];

        $this->app->setHeader('X-OpenFeeder-Cache', 'MISS');
        $this->respond($response);
    }

    private function loadArticleByAlias(string $alias): ?object
    {
        $db    = Factory::getDbo();
        $query = $db->getQuery(true)
            ->select('*')
            ->from($db->quoteName('#__content'))
            ->where($db->quoteName('state') . ' = 1')
            ->where($db->quoteName('alias') . ' = ' . $db->quote($alias));

        $db->setQuery($query, 0, 1);
        $article = $db->loadObject();

        return $article ?: null;
    }

    private function extractAlias(string $url): string
    {
        $url = trim($url, '/');

        // If the URL contains slashes, take the last segment as the alias
        if (strpos($url, '/') !== false) {
            $segments = explode('/', $url);

            return end($segments);
        }

        return $url;
    }

    private function getArticlePath(object $article): string
    {
        // Build a simple path from category alias + article alias
        $db    = Factory::getDbo();
        $query = $db->getQuery(true)
            ->select($db->quoteName('alias'))
            ->from($db->quoteName('#__categories'))
            ->where($db->quoteName('id') . ' = ' . (int) $article->catid);

        $db->setQuery($query);
        $catAlias = $db->loadResult();

        if ($catAlias && $catAlias !== 'uncategorised') {
            return '/' . $catAlias . '/' . $article->alias;
        }

        return '/' . $article->alias;
    }

    private function generateSummary(string $introtext): string
    {
        $text  = strip_tags($introtext);
        $text  = html_entity_decode($text, ENT_QUOTES, 'UTF-8');
        $text  = preg_replace('/\s+/', ' ', $text);
        $text  = trim($text);
        $words = explode(' ', $text);

        if (count($words) > 40) {
            return implode(' ', array_slice($words, 0, 40)) . '...';
        }

        return $text;
    }

    private function toIso8601(?string $datetime): ?string
    {
        if (empty($datetime) || $datetime === '0000-00-00 00:00:00') {
            return null;
        }

        return (new \DateTime($datetime, new \DateTimeZone('UTC')))->format('c');
    }

    private function respond(array $data): void
    {
        $this->app->sendHeaders();
        echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        $this->app->close();
    }

    private function respondError(string $code, string $message, int $httpStatus): void
    {
        http_response_code($httpStatus);

        $error = [
            'schema' => 'openfeeder/1.0',
            'error'  => [
                'code'    => $code,
                'message' => $message,
            ],
        ];

        $this->app->sendHeaders();
        echo json_encode($error, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        $this->app->close();
    }
}
