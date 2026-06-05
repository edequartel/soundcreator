<?php
declare(strict_types=1);

require __DIR__ . '/auth_guard.php';

audiocreator_require_json_auth();

function json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['ok' => false, 'error' => 'Use POST for git pull.'], 405);
}

$projectDir = __DIR__;
$gitDir = $projectDir . DIRECTORY_SEPARATOR . '.git';
if (!is_dir($gitDir)) {
    json_response([
        'ok' => false,
        'error' => 'This folder is not a Git checkout yet.',
        'output' => 'Run git init, add a remote, and push/pull this folder before using the Git Pull button.',
    ], 409);
}

$command = ['git', '-C', $projectDir, 'pull', '--ff-only'];
$descriptorSpec = [
    0 => ['pipe', 'r'],
    1 => ['pipe', 'w'],
    2 => ['pipe', 'w'],
];
$process = proc_open($command, $descriptorSpec, $pipes);
if (!is_resource($process)) {
    json_response(['ok' => false, 'error' => 'Could not start git pull.'], 500);
}

fclose($pipes[0]);
$stdout = stream_get_contents($pipes[1]);
$stderr = stream_get_contents($pipes[2]);
fclose($pipes[1]);
fclose($pipes[2]);
$exitCode = proc_close($process);
$output = trim((string)$stdout . "\n" . (string)$stderr);

json_response([
    'ok' => $exitCode === 0,
    'exit_code' => $exitCode,
    'output' => $output,
    'error' => $exitCode === 0 ? null : 'git pull failed.',
], $exitCode === 0 ? 200 : 500);
