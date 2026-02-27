<?php
/**
 * OpenFeeder for Joomla
 *
 * Dual-mode file:
 *  - Installed via Extension Manager → loaded as plugin stub (safe, no output)
 *  - Copied to webroot → runs as standalone endpoint (reads DB directly)
 */

// When included by Joomla as a plugin, _JEXEC is defined — bail out safely.
// The .htaccess rules route /.well-known/openfeeder.json and /openfeeder
// directly to this file in the webroot (bypassing Joomla bootstrap).
if (defined('_JEXEC')) {
    // Joomla 4+ uses services/provider.php — nothing to do here.
    return;
}

// ── Standalone endpoint ───────────────────────────────────────

// Load Joomla config — search in current dir and common Joomla locations
$configPaths = [
    __DIR__ . '/configuration.php',
    dirname(__DIR__) . '/configuration.php',
    '/var/www/html/configuration.php',
    '/var/www/configuration.php',
];
$configFile = null;
foreach ($configPaths as $p) {
    if (file_exists($p)) { $configFile = $p; break; }
}
if (!$configFile) {
    $docRoot = $_SERVER['DOCUMENT_ROOT'] ?? '';
    if ($docRoot && file_exists($docRoot . '/configuration.php')) {
        $configFile = $docRoot . '/configuration.php';
    }
}
if (!$configFile) {
    http_response_code(500);
    echo json_encode(['error' => 'Joomla configuration.php not found. Place openfeeder.php in your Joomla webroot.']);
    exit;
}
require_once $configFile;
$config = new JConfig();

header('Content-Type: application/json; charset=utf-8');
header('X-OpenFeeder: 1.0');
header('Access-Control-Allow-Origin: *');

// Connect to DB using PDO
try {
    $host   = $config->host;
    $dbname = $config->db;
    $user   = $config->user;
    $pass   = $config->password;
    $prefix = $config->dbprefix;
    $dsn    = "mysql:host={$host};dbname={$dbname};charset=utf8mb4";
    $pdo    = new PDO($dsn, $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'DB connection failed']);
    exit;
}

$siteUrl  = rtrim((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'localhost'), '/');
$siteName = $config->sitename ?? 'Joomla Site';
$path     = strtok($_SERVER['REQUEST_URI'] ?? '/', '?');

// ── Discovery ─────────────────────────────────────────────────
if (strpos($path, 'openfeeder.json') !== false) {
    echo json_encode([
        'version'      => '1.0.1',
        'site'         => ['name' => $siteName, 'url' => $siteUrl, 'language' => 'en', 'description' => ''],
        'feed'         => ['endpoint' => '/openfeeder', 'type' => 'paginated'],
        'capabilities' => [],
        'contact'      => null,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

// ── Content endpoint ──────────────────────────────────────────

/**
 * Sanitize the ?url= parameter: extract pathname only, reject path traversal.
 * Absolute URLs are stripped to pathname. Returns null on invalid input.
 */
function sanitize_url_param_joomla(string $raw): ?string {
    $raw = trim($raw);
    if (empty($raw)) return null;
    $parsed = parse_url($raw);
    $path = rtrim($parsed['path'] ?? '/', '/') ?: '/';
    if (str_contains($path, '..')) return null;
    return $path;
}

$table  = $prefix . 'content';
$rawUrl = $_GET['url'] ?? null;
$url    = $rawUrl !== null ? sanitize_url_param_joomla((string)$rawUrl) : null;
$page   = max(1, (int)($_GET['page']  ?? 1));
$limit  = min(50, max(1, (int)($_GET['limit'] ?? 10)));
$offset = ($page - 1) * $limit;

if ($rawUrl !== null && $url === null) {
    http_response_code(400);
    echo json_encode(['schema' => 'openfeeder/1.0', 'error' => ['code' => 'INVALID_URL', 'message' => 'The ?url= parameter must be a valid relative path.']]);
    exit;
}

if ($url) {
    $alias = basename(rtrim($url, '/'));
    $stmt  = $pdo->prepare("SELECT id, title, introtext, `fulltext`, created, alias FROM `{$table}` WHERE state=1 AND alias=? LIMIT 1");
    $stmt->execute([$alias]);
    $art = $stmt->fetch(PDO::FETCH_OBJ);

    if (!$art) {
        http_response_code(404);
        echo json_encode(['schema' => 'openfeeder/1.0', 'error' => ['code' => 'NOT_FOUND', 'message' => 'Not found']]);
        exit;
    }

    $text   = strip_tags($art->introtext . ' ' . $art->fulltext);
    $chunks = chunk_text($text, (int)$art->id);
    echo json_encode([
        'schema'    => 'openfeeder/1.0',
        'url'       => $url,
        'title'     => $art->title,
        'author'    => null,
        'published' => $art->created,
        'updated'   => null,
        'language'  => 'en',
        'summary'   => mb_substr(strip_tags($art->introtext), 0, 300),
        'chunks'    => $chunks,
        'meta'      => ['total_chunks' => count($chunks), 'returned_chunks' => count($chunks), 'cached' => false, 'cache_age_seconds' => null],
    ], JSON_PRETTY_PRINT);
    exit;
}

// Index
$total      = (int) $pdo->query("SELECT COUNT(*) FROM `{$table}` WHERE state=1")->fetchColumn();
$totalPages = max(1, (int) ceil($total / $limit));

$catTable = $prefix . 'categories';
$stmt = $pdo->prepare("SELECT a.id, a.title, a.created, a.alias, a.introtext, c.alias AS cat_alias FROM `{$table}` a LEFT JOIN `{$catTable}` c ON a.catid = c.id WHERE a.state=1 ORDER BY a.created DESC LIMIT ? OFFSET ?");
$stmt->bindValue(1, $limit, PDO::PARAM_INT);
$stmt->bindValue(2, $offset, PDO::PARAM_INT);
$stmt->execute();
$articles = $stmt->fetchAll(PDO::FETCH_OBJ);

$items = array_map(fn($a) => [
    'url'       => '/' . ($a->cat_alias ?? 'uncategorised') . '/' . $a->alias,
    'title'     => $a->title,
    'published' => $a->created,
    'summary'   => mb_substr(strip_tags($a->introtext), 0, 200),
], $articles);

echo json_encode(['schema' => 'openfeeder/1.0', 'type' => 'index', 'page' => $page, 'total_pages' => $totalPages, 'items' => $items], JSON_PRETTY_PRINT);

function chunk_text(string $text, int $article_id = 0, int $size = 500): array {
    $paragraphs = preg_split('/\n{2,}/', trim($text));
    $chunks = []; $i = 0;
    foreach ($paragraphs as $p) {
        $p = trim($p);
        if (strlen($p) < 20) continue;
        $chunks[] = ['id' => 'c-' . substr(md5($article_id . '-' . $i), 0, 12), 'text' => $p, 'type' => 'paragraph', 'relevance' => null];
        $i++;
    }
    return $chunks ?: [['id' => 'c-' . substr(md5($article_id . '-0'), 0, 12), 'text' => mb_substr($text, 0, $size), 'type' => 'paragraph', 'relevance' => null]];
}
