<?php
/**
 * PUSH — global high score API. Plain PHP, no database: data lives in small
 * files that start with "<?php exit;" so they can never be downloaded.
 *
 *   GET  scores.php?player=ID                → { scores: [...], me }  (top 25, best per player)
 *   POST scores.php {action:"start"}         → { token }          (call when a game starts)
 *   POST scores.php {action:"submit", token, player, name, points, rounds}
 *                                            → { scores, me }
 *   POST scores.php {action:"rename", player, name} → { scores, me }
 *
 * Anti-cheat is deliberately light: a signed one-time game token, a check
 * that the game lasted long enough for its number of rounds, score limits
 * per round, and a rate limit per IP. Good against casual tampering.
 */

declare(strict_types=1);

const TOP_N = 25;
const MAX_ROUNDS = 1000;
const MIN_SECONDS_PER_ROUND = 0.45;
const TOKEN_TTL = 7200;            // a game may last at most 2 hours
const SUBMITS_PER_HOUR = 40;       // per IP
const STARTS_PER_HOUR = 200;       // per IP

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

/* ---------------- storage ---------------- */

function data_dir(): string {
    static $dir = null;
    if ($dir) return $dir;
    // Prefer a folder outside the public web root; fall back to one next to this file.
    $candidates = [dirname(__DIR__, 2) . '/push-data', __DIR__ . '/data'];
    foreach ($candidates as $d) {
        if ((is_dir($d) || @mkdir($d, 0750, true)) && is_writable($d)) {
            if ($d === __DIR__ . '/data' && !file_exists("$d/.htaccess")) {
                @file_put_contents("$d/.htaccess", "Require all denied\nDeny from all\n");
            }
            return $dir = $d;
        }
    }
    fail(500, 'Storage is not writable on the server.');
}

/** Read-modify-write a data file under an exclusive lock. */
function with_store(string $name, callable $fn) {
    $path = data_dir() . "/$name.php";
    $fh = fopen($path, 'c+');
    if (!$fh) fail(500, 'Could not open storage.');
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $data = json_decode((string) preg_replace('/^<\?php exit; \?>\n/', '', (string) $raw), true) ?: [];
    $result = $fn($data);
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, "<?php exit; ?>\n" . json_encode($data, JSON_UNESCAPED_UNICODE));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return $result;
}

function read_store(string $name): array {
    $path = data_dir() . "/$name.php";
    if (!is_file($path)) return [];
    $fh = fopen($path, 'r');
    flock($fh, LOCK_SH);
    $raw = stream_get_contents($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return json_decode((string) preg_replace('/^<\?php exit; \?>\n/', '', (string) $raw), true) ?: [];
}

function secret(): string {
    return with_store('secret', function (array &$d) {
        if (empty($d['key'])) $d['key'] = bin2hex(random_bytes(32));
        return $d['key'];
    });
}

/* ---------------- helpers ---------------- */

function fail(int $code, string $message): void {
    http_response_code($code);
    echo json_encode(['error' => $message]);
    exit;
}

function ok(array $body): void {
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

function client_key(): string {
    return hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|push');
}

function rate_limit(string $bucket, int $perHour): void {
    $allowed = with_store('limits', function (array &$d) use ($bucket, $perHour) {
        $now = time();
        foreach ($d as $k => $hits) {                       // prune old entries
            $d[$k] = array_values(array_filter($hits, fn($t) => $t > $now - 3600));
            if (!$d[$k]) unset($d[$k]);
        }
        $key = $bucket . ':' . client_key();
        $d[$key] = $d[$key] ?? [];
        if (count($d[$key]) >= $perHour) return false;
        $d[$key][] = $now;
        return true;
    });
    if (!$allowed) fail(429, 'Too many requests. Try again later.');
}

function clean_name($name): string {
    $name = is_string($name) ? $name : '';
    $name = preg_replace('/[\p{C}<>]/u', '', $name) ?? '';  // no control chars or tags
    $name = trim(preg_replace('/\s+/u', ' ', $name) ?? '');
    if (mb_strlen($name) > 16) $name = mb_substr($name, 0, 16);
    if ($name === '') fail(400, 'Please enter a name.');
    return $name;
}

function clean_player($id): string {
    if (!is_string($id) || !preg_match('/^[a-f0-9-]{16,40}$/i', $id)) fail(400, 'Invalid player.');
    return strtolower($id);
}

/** Top list: best score per player, never exposes player ids. */
function leaderboard(?string $me = null): array {
    $players = read_store('scores');
    uasort($players, fn($a, $b) => $b['points'] <=> $a['points'] ?: $a['at'] <=> $b['at']);
    $out = [];
    foreach (array_slice($players, 0, TOP_N, true) as $id => $p) {
        $row = ['name' => $p['name'], 'points' => $p['points'], 'rounds' => $p['rounds'], 'at' => $p['at']];
        if ($me !== null && $id === $me) $row['me'] = true;
        $out[] = $row;
    }
    return $out;
}

/** The caller's own best, so the app can show it below a top list it isn't in. */
function me_row(?string $player): ?array {
    if ($player === null) return null;
    $p = read_store('scores')[$player] ?? null;
    if (!$p) return null;
    return ['name' => $p['name'], 'points' => $p['points'], 'rounds' => $p['rounds'], 'at' => $p['at'], 'rank' => rank_of($player)];
}

function rank_of(string $player): int {
    $players = read_store('scores');
    if (!isset($players[$player])) return 0;
    $mine = $players[$player];
    $rank = 1;
    foreach ($players as $id => $p) {
        if ($id === $player) continue;
        if ($p['points'] > $mine['points'] || ($p['points'] === $mine['points'] && $p['at'] < $mine['at'])) $rank++;
    }
    return $rank;
}

/* ---------------- routes ---------------- */

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $me = isset($_GET['player']) && preg_match('/^[a-f0-9-]{16,40}$/i', $_GET['player']) ? strtolower($_GET['player']) : null;
    ok(['scores' => leaderboard($me), 'me' => me_row($me)]);
}

if ($method !== 'POST') fail(405, 'Method not allowed.');

$in = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($in)) fail(400, 'Invalid request.');

switch ($in['action'] ?? '') {
    case 'start': {
        rate_limit('start', STARTS_PER_HOUR);
        $payload = time() . '.' . bin2hex(random_bytes(8));
        ok(['token' => $payload . '.' . hash_hmac('sha256', $payload, secret())]);
    }

    case 'submit': {
        rate_limit('submit', SUBMITS_PER_HOUR);
        $player = clean_player($in['player'] ?? null);
        $name = clean_name($in['name'] ?? null);
        $points = filter_var($in['points'] ?? null, FILTER_VALIDATE_INT);
        $rounds = filter_var($in['rounds'] ?? null, FILTER_VALIDATE_INT);
        if ($points === false || $rounds === false || $rounds < 1 || $rounds > MAX_ROUNDS) fail(400, 'Invalid score.');
        // Each round is worth 10–20 points.
        if ($points < $rounds * 10 || $points > $rounds * 20) fail(400, 'Invalid score.');

        // Verify the one-time game token.
        $parts = explode('.', (string) ($in['token'] ?? ''));
        if (count($parts) !== 3) fail(400, 'Invalid game.');
        [$issued, $nonce, $sig] = $parts;
        if (!hash_equals(hash_hmac('sha256', "$issued.$nonce", secret()), $sig)) fail(400, 'Invalid game.');
        $elapsed = time() - (int) $issued;
        if ($elapsed > TOKEN_TTL) fail(400, 'Game expired.');
        if ($elapsed + 1 < $rounds * MIN_SECONDS_PER_ROUND) fail(400, 'Invalid score.');
        $fresh = with_store('nonces', function (array &$d) use ($nonce) {
            $now = time();
            $d = array_filter($d, fn($t) => $t > $now - TOKEN_TTL);
            if (isset($d[$nonce])) return false;
            $d[$nonce] = $now;
            return true;
        });
        if (!$fresh) fail(400, 'Score already submitted.');

        with_store('scores', function (array &$d) use ($player, $name, $points, $rounds) {
            $prev = $d[$player] ?? null;
            if (!$prev || $points > $prev['points']) {
                $d[$player] = ['name' => $name, 'points' => $points, 'rounds' => $rounds, 'at' => time()];
            } else {
                $d[$player]['name'] = $name;  // keep best score, follow name changes
            }
        });
        ok(['scores' => leaderboard($player), 'me' => me_row($player)]);
    }

    case 'rename': {
        rate_limit('submit', SUBMITS_PER_HOUR);
        $player = clean_player($in['player'] ?? null);
        $name = clean_name($in['name'] ?? null);
        with_store('scores', function (array &$d) use ($player, $name) {
            if (isset($d[$player])) $d[$player]['name'] = $name;
        });
        ok(['scores' => leaderboard($player), 'me' => me_row($player)]);
    }

    default:
        fail(400, 'Unknown action.');
}
