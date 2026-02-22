<?php
/**
 * OpenFeeder Standalone Gateway for Joomla
 *
 * Place this file in your Joomla webroot and add the .htaccess rewrite
 * rules from the README. Bootstraps Joomla for DB access, then serves
 * OpenFeeder discovery and content JSON responses.
 *
 * @copyright  OpenFeeder
 * @license    GNU General Public License version 2 or later
 */

// Bootstrap Joomla
define('_JEXEC', 1);
define('JPATH_BASE', __DIR__);

require_once JPATH_BASE . '/includes/defines.php';
require_once JPATH_BASE . '/includes/framework.php';

// Boot the DI container so Factory::getDbo() works
$container   = \Joomla\CMS\Factory::getContainer();
$app         = $container->get(\Joomla\CMS\Application\SiteApplication::class);
\Joomla\CMS\Factory::$application = $app;

// ── Route request ──────────────────────────────────────────────────────

$uri = $_SERVER['REQUEST_URI'] ?? '';

if (strpos($uri, '.well-known/openfeeder') !== false) {
    handle_discovery($app);
} elseif (strpos($uri, '/openfeeder') !== false) {
    handle_content($app);
} else {
    send_error('NOT_FOUND', 'Unknown OpenFeeder endpoint.', 404);
}

// ── Discovery endpoint ─────────────────────────────────────────────────

function handle_discovery($app): void
{
    $config   = \Joomla\CMS\Factory::getConfig();
    $siteName = $config->get('sitename', '');
    $siteUrl  = rtrim(\Joomla\CMS\Uri\Uri::root(), '/');
    $language = str_replace('_', '-', $app->getLanguage()->getTag());

    $discovery = [
        'version'      => '1.0',
        'site'         => [
            'name'     => $siteName,
            'url'      => $siteUrl,
            'language' => $language,
        ],
        'feed'         => [
            'endpoint' => '/openfeeder',
            'type'     => 'paginated',
        ],
        'capabilities' => ['search'],
        'contact'      => null,
    ];

    send_json($discovery);
}

// ── Content endpoint ───────────────────────────────────────────────────

function handle_content($app): void
{
    $url   = isset($_GET['url'])   ? trim($_GET['url'])              : '';
    $q     = isset($_GET['q'])     ? trim($_GET['q'])                : '';
    $page  = isset($_GET['page'])  ? max(1, (int) $_GET['page'])     : 1;
    $limit = isset($_GET['limit']) ? max(1, min(50, (int) $_GET['limit'])) : 10;

    if ($url !== '') {
        handle_single($app, $url, $limit);
    } elseif ($q !== '') {
        handle_search($app, $q, $page, $limit);
    } else {
        handle_index($app, $page);
    }
}

// ── Index mode ─────────────────────────────────────────────────────────

function handle_index($app, int $page): void
{
    $db         = \Joomla\CMS\Factory::getDbo();
    $perPage    = 20;

    // Total published articles
    $countQuery = $db->getQuery(true)
        ->select('COUNT(*)')
        ->from($db->quoteName('#__content'))
        ->where($db->quoteName('state') . ' = 1');
    $db->setQuery($countQuery);
    $total      = (int) $db->loadResult();
    $totalPages = max(1, (int) ceil($total / $perPage));
    $offset     = ($page - 1) * $perPage;

    // Fetch articles
    $query = $db->getQuery(true)
        ->select([
            $db->quoteName('id'),
            $db->quoteName('title'),
            $db->quoteName('alias'),
            $db->quoteName('catid'),
            $db->quoteName('publish_up'),
            $db->quoteName('introtext'),
        ])
        ->from($db->quoteName('#__content'))
        ->where($db->quoteName('state') . ' = 1')
        ->order($db->quoteName('publish_up') . ' DESC');
    $db->setQuery($query, $offset, $perPage);
    $articles = $db->loadObjectList();

    $items = [];
    foreach ($articles as $article) {
        $items[] = [
            'url'       => build_article_path($db, $article),
            'title'     => $article->title,
            'published' => to_iso8601($article->publish_up),
            'summary'   => generate_summary($article->introtext),
        ];
    }

    send_json([
        'schema'      => 'openfeeder/1.0',
        'type'        => 'index',
        'page'        => $page,
        'total_pages' => $totalPages,
        'items'       => $items,
    ]);
}

// ── Single article mode ────────────────────────────────────────────────

function handle_single($app, string $url, int $limit): void
{
    $alias = extract_alias($url);

    if ($alias === '') {
        send_error('NOT_FOUND', 'Invalid URL parameter.', 404);
        return;
    }

    $db      = \Joomla\CMS\Factory::getDbo();
    $article = load_article_by_alias($db, $alias);

    if ($article === null) {
        send_error('NOT_FOUND', 'Article not found.', 404);
        return;
    }

    $fulltext = trim(($article->introtext ?? '') . "\n\n" . ($article->fulltext ?? ''));
    $chunks   = chunk_content($fulltext, $url);

    $language   = str_replace('_', '-', $app->getLanguage()->getTag());
    $authorName = null;

    if (!empty($article->created_by)) {
        $uQuery = $db->getQuery(true)
            ->select($db->quoteName('name'))
            ->from($db->quoteName('#__users'))
            ->where($db->quoteName('id') . ' = ' . (int) $article->created_by);
        $db->setQuery($uQuery);
        $authorName = $db->loadResult() ?: null;
    }

    $siteUrl    = rtrim(\Joomla\CMS\Uri\Uri::root(), '/');
    $allChunks  = $chunks;
    $outChunks  = array_slice($allChunks, 0, $limit);

    send_json([
        'schema'    => 'openfeeder/1.0',
        'url'       => $siteUrl . '/' . ltrim($url, '/'),
        'title'     => $article->title,
        'author'    => $authorName,
        'published' => to_iso8601($article->publish_up),
        'updated'   => to_iso8601($article->modified),
        'language'  => $language,
        'summary'   => generate_summary($article->introtext),
        'chunks'    => $outChunks,
        'meta'      => [
            'total_chunks'      => count($allChunks),
            'returned_chunks'   => count($outChunks),
            'cached'            => false,
            'cache_age_seconds' => null,
        ],
    ]);
}

// ── Search mode ────────────────────────────────────────────────────────

function handle_search($app, string $q, int $page, int $limit): void
{
    $db      = \Joomla\CMS\Factory::getDbo();
    $perPage = 20;
    $search  = $db->quote('%' . $db->escape($q, true) . '%', false);

    $matchWhere = '(' .
        $db->quoteName('title') . ' LIKE ' . $search . ' OR ' .
        $db->quoteName('introtext') . ' LIKE ' . $search .
    ')';

    // Count
    $countQuery = $db->getQuery(true)
        ->select('COUNT(*)')
        ->from($db->quoteName('#__content'))
        ->where($db->quoteName('state') . ' = 1')
        ->where($matchWhere);
    $db->setQuery($countQuery);
    $total      = (int) $db->loadResult();
    $totalPages = max(1, (int) ceil($total / $perPage));
    $offset     = ($page - 1) * $perPage;

    // Relevance scoring: title match = 1.0, body match = 0.5
    $titleCase = 'CASE WHEN ' . $db->quoteName('title') . ' LIKE ' . $search . ' THEN 1.0 ELSE 0.0 END';
    $bodyCase  = 'CASE WHEN ' . $db->quoteName('introtext') . ' LIKE ' . $search . ' THEN 0.5 ELSE 0.0 END';

    $query = $db->getQuery(true)
        ->select([
            $db->quoteName('id'),
            $db->quoteName('title'),
            $db->quoteName('alias'),
            $db->quoteName('catid'),
            $db->quoteName('publish_up'),
            $db->quoteName('introtext'),
            '(' . $titleCase . ' + ' . $bodyCase . ') AS relevance',
        ])
        ->from($db->quoteName('#__content'))
        ->where($db->quoteName('state') . ' = 1')
        ->where($matchWhere)
        ->order('relevance DESC, ' . $db->quoteName('publish_up') . ' DESC');
    $db->setQuery($query, $offset, $perPage);
    $articles = $db->loadObjectList();

    $items = [];
    foreach ($articles as $article) {
        $items[] = [
            'url'       => build_article_path($db, $article),
            'title'     => $article->title,
            'published' => to_iso8601($article->publish_up),
            'summary'   => generate_summary($article->introtext),
            'relevance' => (float) $article->relevance,
        ];
    }

    send_json([
        'schema'      => 'openfeeder/1.0',
        'type'        => 'index',
        'page'        => $page,
        'total_pages' => $totalPages,
        'items'       => $items,
    ]);
}

// ── Helpers ─────────────────────────────────────────────────────────────

function load_article_by_alias($db, string $alias): ?object
{
    $query = $db->getQuery(true)
        ->select('*')
        ->from($db->quoteName('#__content'))
        ->where($db->quoteName('state') . ' = 1')
        ->where($db->quoteName('alias') . ' = ' . $db->quote($alias));
    $db->setQuery($query, 0, 1);
    $article = $db->loadObject();

    return $article ?: null;
}

function extract_alias(string $url): string
{
    $url = trim($url, '/');
    if (strpos($url, '/') !== false) {
        $segments = explode('/', $url);
        return end($segments);
    }
    return $url;
}

function build_article_path($db, object $article): string
{
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

function generate_summary(string $introtext): string
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

function to_iso8601(?string $datetime): ?string
{
    if (empty($datetime) || $datetime === '0000-00-00 00:00:00') {
        return null;
    }
    return (new \DateTime($datetime, new \DateTimeZone('UTC')))->format('c');
}

/**
 * Chunk content at ~500 chars on paragraph boundaries.
 */
function chunk_content(string $html, string $url): array
{
    $targetChars = 500;

    // Clean HTML
    $text = preg_replace('/\{[^}]*\}/', '', $html);   // CMS shortcodes
    $text = strip_tags($text);
    $text = html_entity_decode($text, ENT_QUOTES, 'UTF-8');
    $text = preg_replace('/[ \t]+/', ' ', $text);
    $text = preg_replace('/\n{3,}/', "\n\n", $text);
    $text = trim($text);

    if ($text === '') {
        return [];
    }

    // Split on paragraph boundaries
    $paragraphs = preg_split('/\n{2,}/', $text);
    $paragraphs = array_values(array_filter(array_map('trim', $paragraphs)));

    $rawChunks    = [];
    $currentChunk = '';
    $idPrefix     = md5($url);

    foreach ($paragraphs as $paragraph) {
        $combined = trim($currentChunk . "\n\n" . $paragraph);

        if ($currentChunk !== '' && mb_strlen($combined) > $targetChars) {
            $rawChunks[]  = $currentChunk;
            $currentChunk = $paragraph;
        } else {
            $currentChunk = $currentChunk === '' ? $paragraph : $combined;
        }
    }

    if (trim($currentChunk) !== '') {
        $rawChunks[] = $currentChunk;
    }

    $chunks = [];
    foreach ($rawChunks as $index => $chunkText) {
        $chunks[] = [
            'id'        => $idPrefix . '_' . $index,
            'text'      => $chunkText,
            'type'      => detect_chunk_type($chunkText),
            'relevance' => null,
        ];
    }

    return $chunks;
}

function detect_chunk_type(string $text): string
{
    $lines      = explode("\n", trim($text));
    $totalLines = count($lines);

    // Heading: single line, under 15 words
    if ($totalLines === 1 && str_word_count($text) < 15) {
        return 'heading';
    }

    // List: majority of lines start with bullet/number patterns
    $listLines = 0;
    foreach ($lines as $line) {
        if (preg_match('/^(\d+[\.\)]\s|[-*+]\s)/', trim($line))) {
            $listLines++;
        }
    }
    if ($totalLines > 0 && ($listLines / $totalLines) >= 0.5) {
        return 'list';
    }

    return 'paragraph';
}

// ── JSON response helpers ──────────────────────────────────────────────

function send_json(array $data): void
{
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    header('X-OpenFeeder: 1.0');

    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

function send_error(string $code, string $message, int $httpStatus): void
{
    http_response_code($httpStatus);
    header('Content-Type: application/json; charset=utf-8');
    header('X-OpenFeeder: 1.0');

    echo json_encode([
        'schema' => 'openfeeder/1.0',
        'error'  => [
            'code'    => $code,
            'message' => $message,
        ],
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}
