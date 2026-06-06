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
            <div class="card-header">
              <h1 class="card-title">README.md</h1>
            </div>
            <div class="card-body">
              <pre class="instructions-content"><?= htmlspecialchars($instructions, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></pre>
            </div>
          </div>
        </main>
      </div>
    </div>
  </div>
</body>
</html>
