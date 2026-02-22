<?php
/**
 * OpenFeeder standalone endpoint for Joomla
 * Reads Joomla config directly, queries DB without full app bootstrap.
 */

// Load Joomla config to get DB credentials
if (!file_exists(__DIR__ . '/configuration.php')) {
    http_response_code(500);
    echo json_encode(['error' => 'Joomla configuration.php not found']);
    exit;
}

require_once __DIR__ . '/configuration.php';
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

$siteUrl  = rtrim(isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'
    ? 'https://' : 'http://' . ($_SERVER['HTTP_HOST'] ?? 'localhost'), '/');
$siteName = $config->sitename ?? 'Joomla Site';

$path = strtok($_SERVER['REQUEST_URI'] ?? '/', '?');

// ── Discovery ─────────────────────────────────────────────────
if (strpos($path, 'openfeeder.json') !== false) {
    echo json_encode([
        'version'      => '1.0',
        'site'         => ['name' => $siteName, 'url' => $siteUrl, 'language' => 'en', 'description' => ''],
        'feed'         => ['endpoint' => '/openfeeder', 'type' => 'paginated'],
        'capabilities' => ['search'],
        'contact'      => null,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

// ── Content endpoint ──────────────────────────────────────────
$table  = $prefix . 'content';
$url    = $_GET['url']   ?? null;
$q      = $_GET['q']     ?? null;
$page   = max(1, (int)($_GET['page']  ?? 1));
$limit  = min(50, max(1, (int)($_GET['limit'] ?? 10)));
$offset = ($page - 1) * $limit;

if ($url) {
    $alias = basename(rtrim(parse_url($url, PHP_URL_PATH) ?? '', '/'));
    $stmt  = $pdo->prepare("SELECT id, title, introtext, fulltext, created, alias FROM `{$table}` WHERE state=1 AND alias=? LIMIT 1");
    $stmt->execute([$alias]);
    $art = $stmt->fetch(PDO::FETCH_OBJ);

    if (!$art) { http_response_code(404); echo json_encode(['schema'=>'openfeeder/1.0','error'=>['code'=>'NOT_FOUND','message'=>'Not found']]); exit; }

    $text   = strip_tags($art->introtext . ' ' . $art->fulltext);
    $chunks = chunk_text($text);
    echo json_encode([
        'schema'=>'openfeeder/1.0','url'=>$url,'title'=>$art->title,'author'=>null,
        'published'=>$art->created,'updated'=>null,'language'=>'en',
        'summary'=>mb_substr(strip_tags($art->introtext), 0, 300),
        'chunks'=>$chunks,
        'meta'=>['total_chunks'=>count($chunks),'returned_chunks'=>count($chunks),'cached'=>false,'cache_age_seconds'=>null],
    ], JSON_PRETTY_PRINT);
    exit;
}

// Index
$total      = (int) $pdo->query("SELECT COUNT(*) FROM `{$table}` WHERE state=1")->fetchColumn();
$totalPages = max(1, (int) ceil($total / $limit));

$stmt = $pdo->prepare("SELECT id, title, created, alias, introtext FROM `{$table}` WHERE state=1 ORDER BY created DESC LIMIT ? OFFSET ?");
$stmt->execute([$limit, $offset]);
$articles = $stmt->fetchAll(PDO::FETCH_OBJ);

$items = array_map(fn($a) => [
    'url'       => '/article/' . $a->alias,
    'title'     => $a->title,
    'published' => $a->created,
    'summary'   => mb_substr(strip_tags($a->introtext), 0, 200),
], $articles);

echo json_encode(['schema'=>'openfeeder/1.0','type'=>'index','page'=>$page,'total_pages'=>$totalPages,'items'=>$items], JSON_PRETTY_PRINT);

function chunk_text(string $text, int $size = 500): array {
    $paragraphs = preg_split('/\n{2,}/', trim($text));
    $chunks = []; $i = 0;
    foreach ($paragraphs as $p) {
        $p = trim($p);
        if (strlen($p) < 20) continue;
        $chunks[] = ['id'=>'c'.(++$i),'text'=>$p,'type'=>'paragraph','relevance'=>null];
    }
    return $chunks ?: [['id'=>'c1','text'=>mb_substr($text,0,$size),'type'=>'paragraph','relevance'=>null]];
}
