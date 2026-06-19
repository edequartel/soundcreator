<?php
declare(strict_types=1);

require __DIR__ . '/auth_guard.php';

const ELEVENLABS_CONFIG_PATH = '/Users/ericdequartel/Library/Containers/com.eltima.cmd1.mas/Data/.COVolumes/_Bluehost/private/elevenlabs_config.php';

if (!audiocreator_is_authenticated()) {
    header('Location: ./index.php');
    exit;
}
if (!audiocreator_is_developer()) {
    http_response_code(403);
    exit('Ontwikkelaarstoegang vereist.');
}

audiocreator_start_session();
if (empty($_SESSION['add_voice_csrf'])) {
    $_SESSION['add_voice_csrf'] = bin2hex(random_bytes(32));
}

function add_voice_escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function add_voice_load_config(): array
{
    if (!is_readable(ELEVENLABS_CONFIG_PATH)) {
        throw new RuntimeException('Het ElevenLabs-configuratiebestand kan niet worden gelezen.');
    }

    $config = require ELEVENLABS_CONFIG_PATH;
    if (!is_array($config)) {
        throw new RuntimeException('Het ElevenLabs-configuratiebestand bevat geen geldige lijst.');
    }
    if (!isset($config['voices']) || !is_array($config['voices'])) {
        $config['voices'] = [];
    }

    return $config;
}

function add_voice_save_config(array $config): void
{
    $directory = dirname(ELEVENLABS_CONFIG_PATH);
    if (!is_writable(ELEVENLABS_CONFIG_PATH) || !is_writable($directory)) {
        throw new RuntimeException('Het ElevenLabs-configuratiebestand is niet schrijfbaar.');
    }

    $backupPath = ELEVENLABS_CONFIG_PATH . '.backup-' . date('Ymd-His');
    if (!copy(ELEVENLABS_CONFIG_PATH, $backupPath)) {
        throw new RuntimeException('De reservekopie van de configuratie kon niet worden gemaakt.');
    }

    $contents = "<?php\n";
    $contents .= "declare(strict_types=1);\n\n";
    $contents .= 'return ' . var_export($config, true) . ";\n";

    $temporaryPath = tempnam($directory, 'elevenlabs-config-');
    if ($temporaryPath === false) {
        throw new RuntimeException('Er kon geen tijdelijk configuratiebestand worden gemaakt.');
    }

    try {
        if (file_put_contents($temporaryPath, $contents, LOCK_EX) === false) {
            throw new RuntimeException('De nieuwe configuratie kon niet worden opgeslagen.');
        }

        $permissions = fileperms(ELEVENLABS_CONFIG_PATH);
        if ($permissions !== false) {
            chmod($temporaryPath, $permissions & 0777);
        }

        if (!rename($temporaryPath, ELEVENLABS_CONFIG_PATH)) {
            throw new RuntimeException('De nieuwe configuratie kon niet worden geactiveerd.');
        }
    } finally {
        if (is_file($temporaryPath)) {
            unlink($temporaryPath);
        }
    }
}

$values = [
    'slug' => '',
    'name' => '',
    'voice_id' => '',
    'language' => 'Nederlands',
    'voice_link' => '',
];
$error = '';
$success = '';

try {
    $config = add_voice_load_config();
} catch (Throwable $exception) {
    $config = ['voices' => []];
    $error = $exception->getMessage();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $error === '') {
    $values = [
        'slug' => strtolower(trim((string)($_POST['slug'] ?? ''))),
        'name' => trim((string)($_POST['name'] ?? '')),
        'voice_id' => trim((string)($_POST['voice_id'] ?? '')),
        'language' => trim((string)($_POST['language'] ?? '')),
        'voice_link' => trim((string)($_POST['voice_link'] ?? '')),
    ];
    $makeDefault = isset($_POST['make_default']);
    $csrf = (string)($_POST['csrf'] ?? '');

    if (!hash_equals((string)$_SESSION['add_voice_csrf'], $csrf)) {
        $error = 'Het formulier is verlopen. Vernieuw de pagina en probeer opnieuw.';
    } elseif (!preg_match('/^[a-z0-9][a-z0-9_-]{1,49}$/', $values['slug'])) {
        $error = 'De sleutel moet 2 tot 50 kleine letters, cijfers, streepjes of liggende streepjes bevatten.';
    } elseif ($values['name'] === '') {
        $error = 'Naam is verplicht.';
    } elseif (!preg_match('/^[A-Za-z0-9_-]{10,100}$/', $values['voice_id'])) {
        $error = 'Het ElevenLabs-stem-ID is ongeldig.';
    } elseif ($values['language'] === '') {
        $error = 'Taal is verplicht.';
    } elseif ($values['voice_link'] !== '' && filter_var($values['voice_link'], FILTER_VALIDATE_URL) === false) {
        $error = 'De ElevenLabs-link is ongeldig.';
    } elseif (isset($config['voices'][$values['slug']])) {
        $error = 'Deze sleutel bestaat al.';
    } else {
        foreach ($config['voices'] as $voice) {
            if (is_array($voice) && hash_equals((string)($voice['voice_id'] ?? ''), $values['voice_id'])) {
                $error = 'Dit stem-ID bestaat al.';
                break;
            }
        }
    }

    if ($error === '') {
        $voice = [
            'name' => $values['name'],
            'voice_id' => $values['voice_id'],
            'language' => $values['language'],
        ];
        if ($values['voice_link'] !== '') {
            $voice['voice_link'] = $values['voice_link'];
        }

        $config['voices'][$values['slug']] = $voice;
        if ($makeDefault) {
            $config['default_voice_id'] = $values['voice_id'];
        }

        try {
            add_voice_save_config($config);
            $success = 'De stem is toegevoegd aan de ElevenLabs-configuratie.';
            $values = [
                'slug' => '',
                'name' => '',
                'voice_id' => '',
                'language' => 'Nederlands',
                'voice_link' => '',
            ];
            $config = add_voice_load_config();
        } catch (Throwable $exception) {
            $error = $exception->getMessage();
        }
    }
}
?>
<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Stem toevoegen - audiocreator</title>
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
            <i class="ti ti-microphone"></i>
          </span>
          Stem toevoegen
        </div>
        <div class="ms-auto">
          <a class="btn btn-primary" href="./index.php">
            <i class="ti ti-arrow-left me-1"></i>
            Terug naar audiocreator
          </a>
        </div>
      </div>
    </header>

    <div class="page-wrapper">
      <div class="page-body">
        <main class="container-xl">
          <div class="card audio-card">
            <div class="card-header">
              <h1 class="card-title">Nieuwe ElevenLabs-stem</h1>
            </div>
            <form method="post" autocomplete="off">
              <input type="hidden" name="csrf" value="<?= add_voice_escape((string)$_SESSION['add_voice_csrf']) ?>" />
              <div class="card-body">
                <?php if ($error !== ''): ?>
                  <div class="alert alert-danger" role="alert"><?= add_voice_escape($error) ?></div>
                <?php endif; ?>
                <?php if ($success !== ''): ?>
                  <div class="alert alert-success" role="status"><?= add_voice_escape($success) ?></div>
                <?php endif; ?>

                <div class="row g-3">
                  <div class="col-12 col-md-6">
                    <label class="form-label" for="slug">Sleutel</label>
                    <input id="slug" class="form-control" name="slug" value="<?= add_voice_escape($values['slug']) ?>" placeholder="bijvoorbeeld: ruth" required />
                    <div class="form-hint">Unieke korte naam met kleine letters, cijfers, - of _.</div>
                  </div>
                  <div class="col-12 col-md-6">
                    <label class="form-label" for="name">Weergavenaam</label>
                    <input id="name" class="form-control" name="name" value="<?= add_voice_escape($values['name']) ?>" placeholder="Bijvoorbeeld: Ruth" required />
                  </div>
                  <div class="col-12">
                    <label class="form-label" for="voice_id">ElevenLabs-stem-ID</label>
                    <input id="voice_id" class="form-control" name="voice_id" value="<?= add_voice_escape($values['voice_id']) ?>" required />
                  </div>
                  <div class="col-12 col-md-6">
                    <label class="form-label" for="language">Taal</label>
                    <input id="language" class="form-control" name="language" value="<?= add_voice_escape($values['language']) ?>" required />
                  </div>
                  <div class="col-12 col-md-6">
                    <label class="form-label" for="voice_link">ElevenLabs-link</label>
                    <input id="voice_link" class="form-control" type="url" name="voice_link" value="<?= add_voice_escape($values['voice_link']) ?>" placeholder="https://elevenlabs.io/..." />
                  </div>
                  <div class="col-12">
                    <label class="form-check">
                      <input class="form-check-input" type="checkbox" name="make_default" value="1" />
                      <span class="form-check-label">Deze stem als standaardstem instellen</span>
                    </label>
                  </div>
                </div>
              </div>
              <div class="card-footer text-end">
                <button class="btn btn-primary" type="submit">
                  <i class="ti ti-device-floppy me-1"></i>
                  Stem opslaan
                </button>
              </div>
            </form>
          </div>

          <div class="card audio-card mt-3">
            <div class="card-header">
              <h2 class="card-title">Bestaande stemmen</h2>
            </div>
            <div class="table-responsive">
              <table class="table table-vcenter card-table">
                <thead>
                  <tr>
                    <th>Sleutel</th>
                    <th>Naam</th>
                    <th>Taal</th>
                    <th>Stem-ID</th>
                  </tr>
                </thead>
                <tbody>
                  <?php foreach ($config['voices'] as $slug => $voice): ?>
                    <?php if (is_array($voice)): ?>
                      <tr>
                        <td><code><?= add_voice_escape((string)$slug) ?></code></td>
                        <td><?= add_voice_escape((string)($voice['name'] ?? '')) ?></td>
                        <td><?= add_voice_escape((string)($voice['language'] ?? '')) ?></td>
                        <td><code><?= add_voice_escape((string)($voice['voice_id'] ?? '')) ?></code></td>
                      </tr>
                    <?php endif; ?>
                  <?php endforeach; ?>
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  </div>
</body>
</html>
