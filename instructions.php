<?php
declare(strict_types=1);

require __DIR__ . '/auth_guard.php';

if (!audiocreator_is_authenticated()) {
    header('Location: ./index.php');
    exit;
}

$instructions = file_get_contents(__DIR__ . '/readme.md');
if ($instructions === false) {
    $instructions = 'Instructions could not be loaded.';
}

function render_inline_markdown(string $text): string
{
    $escaped = htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $escaped = preg_replace('/`([^`]+)`/', '<code>$1</code>', $escaped) ?? $escaped;
    return preg_replace('/\*\*([^*]+)\*\*/', '<strong>$1</strong>', $escaped) ?? $escaped;
}

function render_markdown(string $markdown): string
{
    $html = [];
    $paragraph = [];
    $listType = null;
    $inCodeBlock = false;
    $codeLines = [];

    $flushParagraph = static function () use (&$html, &$paragraph): void {
        if ($paragraph === []) {
            return;
        }
        $html[] = '<p>' . render_inline_markdown(implode(' ', $paragraph)) . '</p>';
        $paragraph = [];
    };

    $closeList = static function () use (&$html, &$listType): void {
        if ($listType === null) {
            return;
        }
        $html[] = '</' . $listType . '>';
        $listType = null;
    };

    foreach (preg_split('/\R/', $markdown) ?: [] as $line) {
        if (preg_match('/^```/', $line)) {
            $flushParagraph();
            $closeList();
            if ($inCodeBlock) {
                $html[] = '<pre><code>' . htmlspecialchars(implode("\n", $codeLines), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</code></pre>';
                $codeLines = [];
                $inCodeBlock = false;
            } else {
                $inCodeBlock = true;
            }
            continue;
        }

        if ($inCodeBlock) {
            $codeLines[] = $line;
            continue;
        }

        if (trim($line) === '') {
            $flushParagraph();
            $closeList();
            continue;
        }

        if (preg_match('/^(#{1,6})\s+(.+)$/', $line, $matches)) {
            $flushParagraph();
            $closeList();
            $level = strlen($matches[1]);
            $html[] = sprintf('<h%d>%s</h%d>', $level, render_inline_markdown($matches[2]), $level);
            continue;
        }

        if (preg_match('/^\d+\.\s+(.+)$/', $line, $matches)) {
            $flushParagraph();
            if ($listType !== 'ol') {
                $closeList();
                $html[] = '<ol>';
                $listType = 'ol';
            }
            $html[] = '<li>' . render_inline_markdown($matches[1]) . '</li>';
            continue;
        }

        if (preg_match('/^-\s+(.+)$/', $line, $matches)) {
            $flushParagraph();
            if ($listType !== 'ul') {
                $closeList();
                $html[] = '<ul>';
                $listType = 'ul';
            }
            $html[] = '<li>' . render_inline_markdown($matches[1]) . '</li>';
            continue;
        }

        $paragraph[] = trim($line);
    }

    if ($inCodeBlock) {
        $html[] = '<pre><code>' . htmlspecialchars(implode("\n", $codeLines), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</code></pre>';
    }
    $flushParagraph();
    $closeList();

    return implode("\n", $html);
}

$instructionsHtml = render_markdown($instructions);
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Instructions - audiocreator</title>
  <link rel="stylesheet" href="./tabler/core/dist/css/tabler.min.css" />
  <link rel="stylesheet" href="./tabler/icons-webfont/dist/tabler-icons.min.css" />
  <link rel="stylesheet" href="./elevenlabs-howler.css?v=<?= (int)filemtime(__DIR__ . '/elevenlabs-howler.css') ?>" />
</head>
<body>
  <div class="page">
    <header class="navbar navbar-expand-md d-print-none">
      <div class="container-xl">
        <div class="navbar-brand navbar-brand-autodark">
          <span class="avatar avatar-sm bg-primary-lt me-2">
            <i class="ti ti-book-2"></i>
          </span>
          audiocreator instructions
        </div>
        <div class="ms-auto">
          <a class="btn btn-primary" href="./index.php">
            <i class="ti ti-arrow-left me-1"></i>
            Back to audiocreator
          </a>
        </div>
      </div>
    </header>

    <div class="page-wrapper">
      <div class="page-body">
        <main class="container-xl">
          <div class="card instructions-card">
            <div class="card-body">
              <article class="instructions-content"><?= $instructionsHtml ?></article>
            </div>
          </div>
        </main>
      </div>
    </div>
  </div>
</body>
</html>
