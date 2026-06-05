<?php
declare(strict_types=1);

const LOCAL_ELEVENLABS_CONFIG_PATH = '/Users/ericdequartel/Library/Containers/com.eltima.cmd1.mas/Data/.COVolumes/_Bluehost/private/elevenlabs_config.php';

function json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function candidate_config_paths(): array
{
    $paths = [];

    $envPath = getenv('ELEVENLABS_CONFIG_PATH');
    if (is_string($envPath) && trim($envPath) !== '') {
        $paths[] = trim($envPath);
    }

    $serverEnvPath = $_SERVER['ELEVENLABS_CONFIG_PATH'] ?? '';
    if (is_string($serverEnvPath) && trim($serverEnvPath) !== '') {
        $paths[] = trim($serverEnvPath);
    }

    $documentRoot = realpath((string)($_SERVER['DOCUMENT_ROOT'] ?? ''));
    if ($documentRoot !== false) {
        $paths[] = dirname($documentRoot) . '/private/elevenlabs_config.php';
    }

    $paths[] = dirname(__DIR__, 2) . '/private/elevenlabs_config.php';
    $paths[] = dirname(__DIR__) . '/private/elevenlabs_config.php';

    if (PHP_OS_FAMILY === 'Darwin') {
        $paths[] = LOCAL_ELEVENLABS_CONFIG_PATH;
    }

    return array_values(array_unique($paths));
}

function resolve_config_path(): string
{
    foreach (candidate_config_paths() as $path) {
        if (is_readable($path)) {
            return $path;
        }
    }

    json_response(['error' => 'ElevenLabs config is not readable from the private server path.'], 500);
}

function load_config(): array
{
    $config = require resolve_config_path();
    if (!is_array($config)) {
        json_response(['error' => 'ElevenLabs config must return an array.'], 500);
    }

    return $config;
}

function require_api_key(array $config): string
{
    $apiKey = trim((string)($config['api_key'] ?? ''));
    if ($apiKey === '' || $apiKey === '?') {
        json_response(['error' => 'ElevenLabs API key is missing in the private config.'], 500);
    }

    return $apiKey;
}

function configured_voices(array $config): array
{
    $voices = [];
    foreach (($config['voices'] ?? []) as $slug => $voice) {
        if (!is_array($voice)) {
            continue;
        }
        $voiceId = trim((string)($voice['voice_id'] ?? ''));
        if ($voiceId === '') {
            continue;
        }
        $voices[] = [
            'slug' => (string)$slug,
            'name' => trim((string)($voice['name'] ?? $slug)),
            'voice_id' => $voiceId,
            'language' => trim((string)($voice['language'] ?? '')),
            'voice_link' => trim((string)($voice['voice_link'] ?? '')),
        ];
    }
    return $voices;
}

function assert_allowed_voice(string $voiceId, array $config): void
{
    foreach (configured_voices($config) as $voice) {
        if (hash_equals($voice['voice_id'], $voiceId)) {
            return;
        }
    }

    $defaultVoiceId = trim((string)($config['default_voice_id'] ?? ''));
    if ($defaultVoiceId !== '' && hash_equals($defaultVoiceId, $voiceId)) {
        return;
    }

    json_response(['error' => 'Voice is not allowed by the private config.'], 400);
}

function request_json(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw !== false ? $raw : '', true);
    if (!is_array($data)) {
        json_response(['error' => 'Expected JSON body.'], 400);
    }
    return $data;
}

function elevenlabs_request(string $url, array $headers, string $body): array
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADER => true,
            CURLOPT_TIMEOUT => 60,
        ]);
        $response = curl_exec($ch);
        if ($response === false) {
            $error = curl_error($ch);
            curl_close($ch);
            json_response(['error' => 'ElevenLabs request failed.', 'details' => $error], 502);
        }
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $headerSize = (int)curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        curl_close($ch);
        return [
            'status' => $status,
            'body' => substr((string)$response, $headerSize),
        ];
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => implode("\r\n", $headers),
            'content' => $body,
            'timeout' => 60,
            'ignore_errors' => true,
        ],
    ]);
    $response = file_get_contents($url, false, $context);
    $status = 0;
    foreach (($http_response_header ?? []) as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d+)/', $header, $m)) {
            $status = (int)$m[1];
            break;
        }
    }
    return [
        'status' => $status,
        'body' => $response !== false ? $response : '',
    ];
}

$config = load_config();

if ($_SERVER['REQUEST_METHOD'] === 'GET' && ($_GET['action'] ?? '') === 'voices') {
    json_response([
        'default_voice_id' => trim((string)($config['default_voice_id'] ?? '')),
        'voices' => configured_voices($config),
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['error' => 'Use POST for text-to-speech.'], 405);
}

$apiKey = require_api_key($config);
$payload = request_json();
$text = trim((string)($payload['text'] ?? ''));
$voiceId = trim((string)($payload['voiceId'] ?? $payload['voice_id'] ?? $config['default_voice_id'] ?? ''));
$modelId = trim((string)($payload['modelId'] ?? $payload['model_id'] ?? 'eleven_v3'));
$outputFormat = trim((string)($payload['outputFormat'] ?? $payload['output_format'] ?? 'mp3_44100_128'));

if ($text === '') {
    json_response(['error' => 'Text is required.'], 400);
}
$textLength = function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);
if ($textLength > 5000) {
    json_response(['error' => 'Text is too long. Maximum is 5000 characters.'], 400);
}
if ($voiceId === '') {
    json_response(['error' => 'Voice ID is required.'], 400);
}

assert_allowed_voice($voiceId, $config);

$elevenlabsPayload = [
    'text' => $text,
    'model_id' => $modelId,
];
if (isset($payload['voice_settings']) && is_array($payload['voice_settings'])) {
    $elevenlabsPayload['voice_settings'] = $payload['voice_settings'];
}

$url = sprintf(
    'https://api.elevenlabs.io/v1/text-to-speech/%s?output_format=%s',
    rawurlencode($voiceId),
    rawurlencode($outputFormat)
);
$body = json_encode($elevenlabsPayload, JSON_UNESCAPED_SLASHES);
if ($body === false) {
    json_response(['error' => 'Could not encode ElevenLabs payload.'], 500);
}

$response = elevenlabs_request($url, [
    'Accept: audio/mpeg',
    'Content-Type: application/json',
    'xi-api-key: ' . $apiKey,
], $body);

if ($response['status'] < 200 || $response['status'] >= 300) {
    json_response([
        'error' => 'ElevenLabs API request failed.',
        'status' => $response['status'],
        'details' => trim((string)$response['body']),
    ], 502);
}

header('Content-Type: audio/mpeg');
header('Cache-Control: no-store');
echo $response['body'];
