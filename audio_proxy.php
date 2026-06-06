<?php
declare(strict_types=1);

require __DIR__ . '/auth_guard.php';

audiocreator_require_json_auth();

const AUDIO_BASE_URL = 'https://www.tastenbraille.com/braillestudio';

function audio_proxy_error(string $message, int $status): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_SLASHES);
    exit;
}

function requested_audio_url(): string
{
    $path = trim((string)($_GET['path'] ?? ''));
    if ($path === '' || str_contains($path, "\0")) {
        audio_proxy_error('Audio path is required.', 400);
    }

    $normalized = '/' . ltrim($path, '/');
    if (
        str_contains($normalized, '..')
        || !preg_match('#^/sounds/(?:nl/speech|general)/[A-Za-z0-9._/-]+\.mp3$#', $normalized)
    ) {
        audio_proxy_error('Audio path is not allowed.', 400);
    }

    return AUDIO_BASE_URL . $normalized;
}

function fetch_audio(string $url): array
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_USERAGENT => 'soundcreator-audio-proxy/1.0',
        ]);
        $body = curl_exec($ch);
        if ($body === false) {
            $error = curl_error($ch);
            audio_proxy_error('Could not download audio: ' . $error, 502);
        }
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $contentType = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        return ['status' => $status, 'content_type' => $contentType, 'body' => (string)$body];
    }

    $context = stream_context_create([
        'http' => [
            'timeout' => 30,
            'ignore_errors' => true,
            'header' => "User-Agent: soundcreator-audio-proxy/1.0\r\n",
        ],
    ]);
    $body = file_get_contents($url, false, $context);
    $status = 0;
    foreach (($http_response_header ?? []) as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d+)/', $header, $match)) {
            $status = (int)$match[1];
            break;
        }
    }
    return ['status' => $status, 'content_type' => 'audio/mpeg', 'body' => $body !== false ? $body : ''];
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    audio_proxy_error('Use GET for audio downloads.', 405);
}

$response = fetch_audio(requested_audio_url());
if ($response['status'] < 200 || $response['status'] >= 300 || $response['body'] === '') {
    audio_proxy_error('Online audio could not be downloaded.', 502);
}

header('Content-Type: audio/mpeg');
header('Content-Length: ' . strlen($response['body']));
header('Cache-Control: private, max-age=300');
echo $response['body'];
