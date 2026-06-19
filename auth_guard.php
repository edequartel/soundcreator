<?php
declare(strict_types=1);

const AUDIOCREATOR_PASSWORD = 'bartimeus';
const AUDIOCREATOR_DEVELOPER_PASSWORD = 'developer';
const AUDIOCREATOR_SESSION_KEY = 'audiocreator_authenticated';
const AUDIOCREATOR_ROLE_SESSION_KEY = 'audiocreator_role';
const AUDIOCREATOR_ROLE_USER = 'user';
const AUDIOCREATOR_ROLE_DEVELOPER = 'developer';

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
    return audiocreator_role_for_password($password) !== null;
}

function audiocreator_role_for_password(string $password): ?string
{
    if (hash_equals(AUDIOCREATOR_DEVELOPER_PASSWORD, $password)) {
        return AUDIOCREATOR_ROLE_DEVELOPER;
    }
    if (hash_equals(AUDIOCREATOR_PASSWORD, $password)) {
        return AUDIOCREATOR_ROLE_USER;
    }

    return null;
}

function audiocreator_current_role(): ?string
{
    if (!audiocreator_is_authenticated()) {
        return null;
    }

    $role = (string)($_SESSION[AUDIOCREATOR_ROLE_SESSION_KEY] ?? AUDIOCREATOR_ROLE_USER);
    return $role === AUDIOCREATOR_ROLE_DEVELOPER
        ? AUDIOCREATOR_ROLE_DEVELOPER
        : AUDIOCREATOR_ROLE_USER;
}

function audiocreator_is_developer(): bool
{
    return audiocreator_current_role() === AUDIOCREATOR_ROLE_DEVELOPER;
}

function audiocreator_login(string $password): bool
{
    audiocreator_start_session();
    $role = audiocreator_role_for_password($password);
    if ($role === null) {
        return false;
    }

    session_regenerate_id(true);
    $_SESSION[AUDIOCREATOR_SESSION_KEY] = true;
    $_SESSION[AUDIOCREATOR_ROLE_SESSION_KEY] = $role;
    return true;
}

function audiocreator_logout(): void
{
    audiocreator_start_session();
    unset(
        $_SESSION[AUDIOCREATOR_SESSION_KEY],
        $_SESSION[AUDIOCREATOR_ROLE_SESSION_KEY]
    );
}

function audiocreator_require_json_auth(): void
{
    if (audiocreator_is_authenticated()) {
        return;
    }

    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['ok' => false, 'error' => 'Aanmelding vereist.'], JSON_UNESCAPED_SLASHES);
    exit;
}

function audiocreator_require_json_developer(): void
{
    audiocreator_require_json_auth();
    if (audiocreator_is_developer()) {
        return;
    }

    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['ok' => false, 'error' => 'Ontwikkelaarstoegang vereist.'], JSON_UNESCAPED_SLASHES);
    exit;
}
