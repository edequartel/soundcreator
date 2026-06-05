<?php
declare(strict_types=1);

const AUDIOCREATOR_PASSWORD = 'bartimeus';
const AUDIOCREATOR_SESSION_KEY = 'audiocreator_authenticated';

function audiocreator_start_session(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
}

function audiocreator_is_authenticated(): bool
{
    audiocreator_start_session();
    return !empty($_SESSION[AUDIOCREATOR_SESSION_KEY]);
}

function audiocreator_check_password(string $password): bool
{
    return hash_equals(AUDIOCREATOR_PASSWORD, $password);
}

function audiocreator_login(string $password): bool
{
    audiocreator_start_session();
    if (!audiocreator_check_password($password)) {
        return false;
    }

    session_regenerate_id(true);
    $_SESSION[AUDIOCREATOR_SESSION_KEY] = true;
    return true;
}

function audiocreator_logout(): void
{
    audiocreator_start_session();
    unset($_SESSION[AUDIOCREATOR_SESSION_KEY]);
}

function audiocreator_require_json_auth(): void
{
    if (audiocreator_is_authenticated()) {
        return;
    }

    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['ok' => false, 'error' => 'Authentication required.'], JSON_UNESCAPED_SLASHES);
    exit;
}
