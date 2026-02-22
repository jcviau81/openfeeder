<?php
/**
 * OpenFeeder - Simple/Classic Joomla 3/4/5 compatible plugin
 * Single file, no namespace, no DI - for testing purposes
 */
defined('_JEXEC') or die;

use Joomla\CMS\Plugin\CMSPlugin;
use Joomla\CMS\Uri\Uri;

class PlgSystemOpenfeeder extends CMSPlugin
{
    public function onAfterRoute()
    {
        $app = JFactory::getApplication();
        if (!$app->isClient('site')) return;

        $path = rtrim(Uri::getInstance()->getPath(), '/');
        $base = rtrim(Uri::base(true), '/');
        if ($base && strpos($path, $base) === 0) {
            $path = substr($path, strlen($base));
        }

        if ($path === '/.well-known/openfeeder.json') {
            $this->serveDiscovery();
        } elseif (strpos($path, '/openfeeder') === 0) {
            $this->serveContent();
        }
    }

    private function serveDiscovery()
    {
        $config = JFactory::getConfig();
        header('Content-Type: application/json');
        header('X-OpenFeeder: 1.0');
        echo json_encode([
            'version' => '1.0',
            'site' => [
                'name'        => $config->get('sitename', ''),
                'url'         => Uri::root(),
                'language'    => 'en',
                'description' => '',
            ],
            'feed'         => ['endpoint' => '/openfeeder', 'type' => 'paginated'],
            'capabilities' => ['search'],
            'contact'      => null,
        ], JSON_PRETTY_PRINT);
        JFactory::getApplication()->close();
    }

    private function serveContent()
    {
        header('Content-Type: application/json');
        header('X-OpenFeeder: 1.0');

        $db    = JFactory::getDbo();
        $url   = $_GET['url'] ?? null;
        $q     = $_GET['q'] ?? null;
        $page  = max(1, (int)($_GET['page'] ?? 1));
        $limit = min(50, max(1, (int)($_GET['limit'] ?? 10)));

        if ($url) {
            // Single article by alias
            $query = $db->getQuery(true)
                ->select(['a.id','a.title','a.introtext','a.fulltext','a.created','a.alias'])
                ->from('#__content AS a')
                ->where('a.state = 1')
                ->where($db->quoteName('a.alias') . ' = ' . $db->quote(basename($url)));
            $db->setQuery($query);
            $article = $db->loadObject();

            if (!$article) {
                http_response_code(404);
                echo json_encode(['schema'=>'openfeeder/1.0','error'=>['code'=>'NOT_FOUND','message'=>'Article not found']]);
                JFactory::getApplication()->close();
            }

            $text   = strip_tags($article->introtext . ' ' . $article->fulltext);
            $chunks = $this->chunk($text);
            echo json_encode([
                'schema'    => 'openfeeder/1.0',
                'url'       => $url,
                'title'     => $article->title,
                'author'    => null,
                'published' => $article->created,
                'summary'   => mb_substr(strip_tags($article->introtext), 0, 300),
                'chunks'    => $chunks,
                'meta'      => ['total_chunks' => count($chunks), 'returned_chunks' => count($chunks), 'cached' => false],
            ], JSON_PRETTY_PRINT);
        } else {
            // Index
            $countQ = $db->getQuery(true)->select('COUNT(*)')->from('#__content')->where('state = 1');
            $db->setQuery($countQ);
            $total = (int)$db->loadResult();
            $totalPages = max(1, (int)ceil($total / $limit));

            $query = $db->getQuery(true)
                ->select(['id','title','created','alias','introtext'])
                ->from('#__content')
                ->where('state = 1')
                ->order('created DESC')
                ->setLimit($limit, ($page - 1) * $limit);
            $db->setQuery($query);
            $articles = $db->loadObjectList();

            $items = array_map(fn($a) => [
                'url'       => '/article/' . $a->alias,
                'title'     => $a->title,
                'published' => $a->created,
                'summary'   => mb_substr(strip_tags($a->introtext), 0, 200),
            ], $articles);

            echo json_encode([
                'schema'      => 'openfeeder/1.0',
                'type'        => 'index',
                'page'        => $page,
                'total_pages' => $totalPages,
                'items'       => $items,
            ], JSON_PRETTY_PRINT);
        }
        JFactory::getApplication()->close();
    }

    private function chunk(string $text, int $size = 500): array
    {
        $paragraphs = preg_split('/\n{2,}/', trim($text));
        $chunks = [];
        $i = 0;
        foreach ($paragraphs as $p) {
            $p = trim($p);
            if (strlen($p) < 20) continue;
            $chunks[] = ['id' => 'c' . (++$i), 'text' => $p, 'type' => 'paragraph', 'relevance' => null];
        }
        return $chunks ?: [['id' => 'c1', 'text' => mb_substr($text, 0, $size), 'type' => 'paragraph', 'relevance' => null]];
    }
}
