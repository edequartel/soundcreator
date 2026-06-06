<?php
declare(strict_types=1);

require __DIR__ . '/auth_guard.php';

$loginError = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = (string)($_POST['action'] ?? 'login');
    if ($action === 'logout') {
        audiocreator_logout();
    } elseif (audiocreator_login((string)($_POST['password'] ?? ''))) {
        header('Location: ' . strtok((string)($_SERVER['REQUEST_URI'] ?? 'index.php'), '?'));
        exit;
    } else {
        $loginError = 'Wrong password.';
    }
}

$isAuthenticated = audiocreator_is_authenticated();
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>audiocreator</title>
  <link rel="stylesheet" href="./tabler/core/dist/css/tabler.min.css" />
  <link rel="stylesheet" href="./tabler/icons-webfont/dist/tabler-icons.min.css" />
  <link rel="stylesheet" href="./elevenlabs-howler.css" />
</head>
<body>
<?php if (!$isAuthenticated): ?>
  <div class="page page-center">
    <div class="container-tight py-4">
      <form class="card card-md" method="post" autocomplete="off">
        <input type="hidden" name="action" value="login" />
        <div class="card-body">
          <div class="text-center mb-4">
            <span class="avatar avatar-lg bg-primary-lt">
              <i class="ti ti-wave-sine"></i>
            </span>
          </div>
          <h1 class="h2 text-center mb-4">audiocreator</h1>
          <?php if ($loginError !== ''): ?>
            <div class="alert alert-danger" role="alert"><?= htmlspecialchars($loginError, ENT_QUOTES, 'UTF-8') ?></div>
          <?php endif; ?>
          <div class="mb-3">
            <label class="form-label" for="password">Password</label>
            <input id="password" class="form-control" type="password" name="password" autofocus required />
          </div>
          <button class="btn btn-primary w-100" type="submit">Open</button>
        </div>
      </form>
    </div>
  </div>
<?php else: ?>
  <div class="page">
    <header class="navbar navbar-expand-md d-print-none">
      <div class="container-xl">
        <div class="navbar-brand navbar-brand-autodark">
          <span class="avatar avatar-sm bg-primary-lt me-2">
            <i class="ti ti-wave-sine"></i>
          </span>
          audiocreator
        </div>
        <div class="ms-auto d-flex gap-2">
          <a class="btn" href="./instructions.php">
            <i class="ti ti-book-2 me-1"></i>
            Instructions
          </a>
          <button id="btnGitPull" type="button" class="btn">
            <i class="ti ti-git-pull-request me-1"></i>
            <span id="btnGitPullLabel">Git Pull</span>
          </button>
          <form method="post">
            <input type="hidden" name="action" value="logout" />
            <button type="submit" class="btn btn-icon" aria-label="Logout">
              <i class="ti ti-logout"></i>
            </button>
          </form>
        </div>
      </div>
    </header>

    <div class="page-wrapper">
      <div class="page-body">
        <main class="container-xl">
          <div class="card audio-card">
            <div class="card-body">
              <div class="row g-3">
                <div class="col-12 col-md-8">
                  <label class="form-label" for="voiceId">Voice</label>
                  <div class="input-group">
                    <select id="voiceId" class="form-select">
                      <option value="">Loading voices...</option>
                    </select>
                    <button id="btnVoiceInfo" type="button" class="btn" disabled>
                      <i class="ti ti-info-circle me-1"></i>
                      Info
                    </button>
                  </div>
                </div>

                <div class="col-12 col-md-4">
                  <label class="form-label" for="mergeGapMs">Merge gap</label>
                  <div class="input-group">
                    <input id="mergeGapMs" class="form-control" type="number" min="0" max="5000" step="50" value="500" />
                    <span class="input-group-text">ms</span>
                  </div>
                </div>

                <div class="col-12">
                  <label class="form-label" for="text">Text</label>
                  <textarea id="text" class="form-control audio-textarea" rows="8" placeholder="Type text to speak..."></textarea>
                </div>

                <div class="col-12">
                  <div class="audio-toolbar">
                    <button id="clearTextBtn" class="btn" type="button">
                      <i class="ti ti-eraser me-1"></i>
                      Clear text
                    </button>
                    <button id="btnToggleLog" class="btn btn-icon" type="button" aria-label="Show logging" aria-controls="logPanel" aria-expanded="false">
                      <i class="ti ti-terminal-2"></i>
                    </button>

                    <div class="btn-list audio-actions">
                      <button id="btnProduceMergedJwt" class="btn btn-primary" type="button">
                        <i class="ti ti-player-record-filled me-1"></i>
                        Produce
                      </button>
                      <button id="btnPlayMerged" class="btn" type="button">
                        <i class="ti ti-player-play me-1"></i>
                        Play
                      </button>
                      <button id="btnDownloadMergedFile" class="btn" type="button">
                        <i class="ti ti-download me-1"></i>
                        Download
                      </button>
                      <button id="btnDownloadSplitFiles" class="btn" type="button">
                        <i class="ti ti-files me-1"></i>
                        Download # MP3s
                      </button>
                      <button id="btnDownloadSplitZip" class="btn" type="button">
                        <i class="ti ti-file-zip me-1"></i>
                        Download # ZIP
                      </button>
                    </div>
                  </div>
                </div>

                <div id="logPanel" class="col-12" hidden>
                  <div class="card bg-dark-lt">
                    <div class="card-header py-2">
                      <h3 class="card-title">
                        <i class="ti ti-terminal-2 me-2"></i>
                        Logging
                      </h3>
                      <div class="card-actions">
                        <button id="btnCopyLog" class="btn btn-sm" type="button">
                          <i class="ti ti-copy me-1"></i>
                          <span id="btnCopyLogLabel">Copy</span>
                        </button>
                        <button id="btnClearLog" class="btn btn-sm" type="button">
                          <i class="ti ti-trash me-1"></i>
                          Clear
                        </button>
                      </div>
                    </div>
                    <div class="card-body p-0">
                      <pre id="log" class="audio-log" aria-live="polite"></pre>
                    </div>
                  </div>
                </div>

                <div class="col-12">
                  <div class="audio-preferences">
                    <label class="form-check form-switch">
                      <input id="chkRememberVoice" class="form-check-input" type="checkbox" checked />
                      <span class="form-check-label">Remember selected voice</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  </div>

  <dialog class="voice-info-dialog" id="voiceInfoModal" aria-labelledby="voiceInfoTitle">
    <div class="modal-content">
      <form method="dialog">
        <div class="modal-header">
          <h2 class="modal-title" id="voiceInfoTitle">Voice information</h2>
          <button type="submit" class="btn-close" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <dl class="row mb-0">
            <dt class="col-4">Name</dt>
            <dd class="col-8" id="voiceInfoName">-</dd>
            <dt class="col-4">Language</dt>
            <dd class="col-8" id="voiceInfoLanguage">-</dd>
            <dt class="col-4">Voice ID</dt>
            <dd class="col-8"><code id="voiceInfoId">-</code></dd>
          </dl>
        </div>
        <div class="modal-footer">
          <a id="voiceInfoLink" class="btn" href="#" target="_blank" rel="noreferrer" hidden>
            <i class="ti ti-external-link me-1"></i>
            Open ElevenLabs voice
          </a>
          <button type="submit" class="btn btn-primary">Close</button>
        </div>
      </form>
    </div>
  </dialog>

<?php endif; ?>

  <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/howler@2.2.4/dist/howler.min.js"></script>
  <script src="./tabler/core/dist/js/tabler.min.js"></script>
<?php if ($isAuthenticated): ?>
  <script src="./ffmpeg/ffmpeg-core.js?v=<?= (int)filemtime(__DIR__ . '/ffmpeg/ffmpeg-core.js') ?>"></script>
  <script src="./elevenlabs-howler.js?v=<?= (int)filemtime(__DIR__ . '/elevenlabs-howler.js') ?>"></script>
<?php endif; ?>
</body>
</html>
