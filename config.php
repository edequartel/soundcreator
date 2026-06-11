<?php
declare(strict_types=1);

const BASE_URL = 'https://www.tastenbraille.com/braillestudio';
const DATA_BASE_URL = 'https://www.tastenbraille.com/braillestudio-data';
const SOUNDS_BASE_URL = 'https://www.tastenbraille.com/braillestudio-data/sounds';

function url_base(string $path = ''): string
{
    return BASE_URL . url_path($path);
}

function url_data(string $path = ''): string
{
    return DATA_BASE_URL . url_path($path);
}

function url_sound(string $filename = ''): string
{
    return SOUNDS_BASE_URL . url_path($filename);
}

function url_path(string $path): string
{
    $path = trim($path, '/');

    return $path === '' ? '' : '/' . $path;
}
