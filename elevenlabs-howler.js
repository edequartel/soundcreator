// file: elevenlabs-howler.js
/* global Howl, JSZip, createFFmpegCore */

(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    authSection: $("authSection"),
    authLoggedOut: $("authLoggedOut"),
    authLoggedIn: $("authLoggedIn"),
    protectedContent: $("protectedContent"),
    email: $("email"),
    password: $("password"),
    btnSignIn: $("btnSignIn"),
    btnSignOut: $("btnSignOut"),
    btnTogglePassword: $("btnTogglePassword"),
    authMsg: $("authMsg"),
    userEmail: $("userEmail"),
    btnGitPull: $("btnGitPull"),
    btnGitPullLabel: $("btnGitPullLabel"),
    btnToggleLog: $("btnToggleLog"),
    btnToggleLogLabel: $("btnToggleLogLabel"),
    btnCopyLog: $("btnCopyLog"),
    btnCopyLogLabel: $("btnCopyLogLabel"),
    btnClearLog: $("btnClearLog"),
    logPanel: $("logPanel"),
    log: $("log"),
    voiceId: $("voiceId"),
    text: $("text"),
    modelId: $("modelId"),
    outputFormat: $("outputFormat"),
    mergeGapMs: $("mergeGapMs"),
    chkRememberModel: $("chkRememberModel"),
    btnVoiceInfo: $("btnVoiceInfo"),
    voiceInfoName: $("voiceInfoName"),
    voiceInfoLanguage: $("voiceInfoLanguage"),
    voiceInfoId: $("voiceInfoId"),
    voiceInfoLink: $("voiceInfoLink"),
    voiceInfoModal: $("voiceInfoModal"),
    btnPlay: $("btnPlay"),
    btnStop: $("btnStop"),
    btnClearText: $("clearTextBtn"), // <-- added
    btnDownload: $("btnDownload"),
    btnProduceMergedJwt: $("btnProduceMergedJwt"),
    btnPlayMerged: $("btnPlayMerged"),
    btnDownloadMergedFile: $("btnDownloadMergedFile"),
    btnDownloadSplitFiles: $("btnDownloadSplitFiles"),
    btnDownloadSplitZip: $("btnDownloadSplitZip"),
    btnRefreshCredits: $("btnRefreshCredits"),
    creditSummary: $("creditSummary"),
    creditUsed: $("creditUsed"),
    creditRemaining: $("creditRemaining"),
    creditLimit: $("creditLimit"),
    creditTier: $("creditTier"),
    creditMeta: $("creditMeta"),
  };

  let currentHowl = null;
  let currentObjectUrl = null;
  let currentAbort = null;
  let lastAudioBlob = null;
  let lastAudioFilename = null;
  let mergedAudio = null;
  let mergedAudioVersion = "";
  let sb = null;
  let sbConfig = null;
  let savedVoiceIdPref = "";
  let preparedMergedSources = [];
  const voiceInfoById = new Map();
  const FIXED_OUTPUT_FORMAT = "mp3_44100_128";
  const BRAILLE_AUDIO_BASE_URL = "https://www.tastenbraille.com/braillestudio";
  const MIXED_MERGE_OUTPUT_DIR = "/sounds/nl/out/";
  const MIXED_MERGE_OUTPUT_FILENAME = "merged.mp3";
  const MIXED_MERGE_PARTS_PATH = "sounds/nl/instruction/_parts";
  const SPEECH_BASE_PATH = "/sounds/nl/speech/";
  const GENERAL_BASE_PATH = "/sounds/general/";
  const DOWNLOAD_MERGED_API_URL = "https://www.tastenbraille.com/api/download_merged.php";
  const LOCAL_ELEVENLABS_API_URL = "./elevenlabs_tts.php";
  const LOCAL_AUDIO_PROXY_URL = "./audio_proxy.php";
  const LOCAL_FFMPEG_WASM_URL = "./ffmpeg/ffmpeg-core.wasm";
  const requiresAuth = !!(els.authSection || els.protectedContent);
  let publicMergedObjectUrl = null;
  let localFfmpegPromise = null;
  const STORAGE = Object.freeze({
    rememberModel: "elevenlabs.remember.modelId",
    voiceId: "elevenlabs.voiceId",
    voiceName: "elevenlabs.voiceName",
    modelId: "elevenlabs.modelId",
    mergeGapMs: "mixedmerge.gapMs",
  });

  function msg(el, text, ok = true) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("error", !ok && !!text);
    el.classList.toggle("success", ok && !!text);
  }

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch {}
  }
  function storageDel(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  async function initSupabaseClient() {
    const CONFIG_URL_LOCAL = "../supabase-config.js";
    const LOCAL_SUPABASE_CONFIG = Object.freeze({
      url: "https://zrcdyzcfsdlmqqwdhctk.supabase.co",
      anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyY2R5emNmc2RsbXFxd2RoY3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxOTgyNzUsImV4cCI6MjA4Mzc3NDI3NX0.voT1eh_FbBkrv7ZMN7B8VRRbrab7tyx3eV6JuXy4ySs"
    });
    const CONFIG_URLS_REMOTE = [
      "https://www.tastenbraille.com/braillestudio/api/supabase-config",
    ];
    let cfg = LOCAL_SUPABASE_CONFIG;
    try {
      const mod = await import(CONFIG_URL_LOCAL);
      cfg = mod?.supabaseConfig || mod?.default || LOCAL_SUPABASE_CONFIG;
    } catch {
      cfg = LOCAL_SUPABASE_CONFIG;
    }
    if (!cfg?.url || !cfg?.anonKey) {
      let lastError = null;
      for (const url of CONFIG_URLS_REMOTE) {
        try {
          const res = await fetch(url);
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`Failed to load supabase-config from ${url} (${res.status}). ${body}`.trim());
          }
          const json = await res.json();
          if (json?.url && json?.anonKey) {
            cfg = json;
            break;
          }
          throw new Error(`Supabase config missing url/anonKey from ${url}.`);
        } catch (e) {
          lastError = e;
        }
      }
      if (!cfg?.url || !cfg?.anonKey) {
        throw lastError || new Error("Supabase config missing url/anonKey.");
      }
    }
    sbConfig = cfg;
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm");
    return createClient(cfg.url, cfg.anonKey);
  }

  function setAuthUiVisible(loggedIn, session = null) {
    if (els.authLoggedOut) els.authLoggedOut.hidden = !!loggedIn;
    if (els.authLoggedIn) els.authLoggedIn.hidden = !loggedIn;
    if (els.protectedContent) els.protectedContent.hidden = !loggedIn;
    if (els.userEmail) els.userEmail.textContent = session?.user?.email || "";
  }

  function setSignedOutState() {
    setAuthUiVisible(false);
    if (hasCreditsUi()) {
      setCreditsFields();
      setCreditsSummary("Login vereist", "Log eerst in om ElevenLabs-credits en audiofuncties te gebruiken.");
    }
    if (els.voiceId) {
      els.voiceId.innerHTML = "<option value=\"\">Log eerst in</option>";
    }
  }

  async function refreshAuthUI(passedSession = null) {
    if (!sb) sb = await initSupabaseClient();
    let session = passedSession;
    if (!session) {
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      session = data?.session ?? null;
    }

    const loggedIn = !!session?.user;
    setAuthUiVisible(loggedIn, session);

    if (!loggedIn) {
      setSignedOutState();
      return null;
    }

    msg(els.authMsg, "");
    await loadVoicesFromSupabase();
    await loadElevenLabsCredits();
    return session;
  }

  async function signIn() {
    try {
      if (!sb) sb = await initSupabaseClient();
      msg(els.authMsg, "");
      const email = (els.email?.value || "").trim();
      const password = els.password?.value || "";
      if (!email || !password) {
        throw new Error("Vul e-mail en wachtwoord in.");
      }
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      msg(els.authMsg, "Ingelogd.");
      await refreshAuthUI(data?.session ?? null);
      log(`Signed in as ${data?.session?.user?.email || email}.`);
    } catch (e) {
      msg(els.authMsg, e?.message || String(e), false);
      log(`Sign-in failed: ${e?.message || e}`);
    }
  }

  async function signOut() {
    try {
      if (!sb) sb = await initSupabaseClient();
      msg(els.authMsg, "");
      await sb.auth.signOut();
      setSignedOutState();
      log("Signed out.");
    } catch (e) {
      msg(els.authMsg, e?.message || String(e), false);
      log(`Sign-out failed: ${e?.message || e}`);
    }
  }

  function wirePasswordToggle() {
    const input = els.password;
    const btn = els.btnTogglePassword;
    if (!input || !btn) return;
    const eye = btn.querySelector(".icon-eye");
    const eyeOff = btn.querySelector(".icon-eye-off");
    const setVisible = (visible) => {
      input.type = visible ? "text" : "password";
      btn.setAttribute("aria-pressed", visible ? "true" : "false");
      btn.setAttribute("aria-label", visible ? "Verberg wachtwoord" : "Toon wachtwoord");
      if (eye) eye.classList.toggle("hidden", visible);
      if (eyeOff) eyeOff.classList.toggle("hidden", !visible);
    };
    setVisible(false);
    btn.addEventListener("click", () => setVisible(input.type === "password"));
  }

  function getSupabaseFunctionUrl(functionName) {
    const baseUrl = (sbConfig?.url || "").trim();
    if (!baseUrl) throw new Error("Supabase config URL missing.");
    return `${baseUrl}/functions/v1/${functionName}`;
  }

  async function getFreshSupabaseAccessToken(forceRefresh = false) {
    if (!sb) sb = await initSupabaseClient();
    const { data: sessionData, error: sessionError } = await sb.auth.getSession();
    if (sessionError) throw sessionError;

    let session = sessionData?.session ?? null;
    const expiresAt = Number(session?.expires_at || 0);
    const now = Math.floor(Date.now() / 1000);
    const shouldRefresh = forceRefresh || !session || (expiresAt > 0 && expiresAt - now < 30);

    if (shouldRefresh) {
      const { data: refreshed, error: refreshError } = await sb.auth.refreshSession();
      if (refreshError) throw refreshError;
      session = refreshed?.session ?? session;
    }

    const token = (session?.access_token || "").trim();
    if (!token) throw new Error("No active Supabase session. Sign in first.");
    return token;
  }

  async function fetchWithJwtRetry(functionName, init) {
    let jwt = await getFreshSupabaseAccessToken(false);
    let res = await fetch(getSupabaseFunctionUrl(functionName), {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${jwt}`,
      },
    });

    if (res.status === 401) {
      jwt = await getFreshSupabaseAccessToken(true);
      res = await fetch(getSupabaseFunctionUrl(functionName), {
        ...init,
        headers: {
          ...(init?.headers || {}),
          Authorization: `Bearer ${jwt}`,
        },
      });
    }

    return res;
  }

  function setVoiceOptions(rows) {
    if (!els.voiceId) return;
    voiceInfoById.clear();
    els.voiceId.innerHTML = "";
    if (!rows.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No voices found";
      els.voiceId.appendChild(option);
      refreshVoiceInfoButton();
      return;
    }
    for (const row of rows) {
      const option = document.createElement("option");
      option.value = (row.voice_id || "").trim();
      const labelName = (row.name || row.voice_id || "").trim();
      const labelLanguage = (row.language || "").trim();
      option.textContent = `${labelName}${labelLanguage ? ` - ${labelLanguage}` : ""}`;
      if (!option.value || !option.textContent) continue;
      const voiceLink = (row.voice_link || "").trim();
      voiceInfoById.set(option.value, {
        name: labelName,
        language: labelLanguage,
        voiceId: option.value,
        link: voiceLink,
      });
      els.voiceId.appendChild(option);
    }
    refreshVoiceInfoButton();
  }

  function applySavedVoiceSelection() {
    if (!els.voiceId) return;
    const options = Array.from(els.voiceId.options);
    if (!options.length) return;
    if (savedVoiceIdPref && options.some((opt) => opt.value === savedVoiceIdPref)) {
      els.voiceId.value = savedVoiceIdPref;
    } else {
      els.voiceId.selectedIndex = 0;
    }
    refreshVoiceInfoButton();
  }

  function refreshVoiceInfoButton() {
    if (!els.btnVoiceInfo) return;
    const voiceId = (els.voiceId?.value || "").trim();
    const info = voiceInfoById.get(voiceId) || null;
    els.btnVoiceInfo.disabled = !info;
    els.btnVoiceInfo.title = info ? `Show information for ${info.name}` : "No voice selected";
  }

  function onVoiceInfoClick() {
    const voiceId = (els.voiceId?.value || "").trim();
    const info = voiceInfoById.get(voiceId);
    if (!info) return;
    if (els.voiceInfoName) els.voiceInfoName.textContent = info.name || "-";
    if (els.voiceInfoLanguage) els.voiceInfoLanguage.textContent = info.language || "-";
    if (els.voiceInfoId) els.voiceInfoId.textContent = info.voiceId || "-";
    if (els.voiceInfoLink) {
      els.voiceInfoLink.hidden = !info.link;
      els.voiceInfoLink.href = info.link || "#";
    }
    if (els.voiceInfoModal?.showModal) {
      els.voiceInfoModal.showModal();
    }
  }

  async function loadVoicesFromSupabase() {
    if (!els.voiceId) return;
    els.voiceId.innerHTML = "<option value=\"\">Loading voices...</option>";
    try {
      if (!sb) sb = await initSupabaseClient();
      const { data, error } = await sb
        .from("voices")
        .select("name, language, voice_id, voice_link")
        .order("name", { ascending: true });
      if (error) throw error;
      const rows = (data || []).filter((r) => (r?.voice_id || "").trim());
      setVoiceOptions(rows);
      applySavedVoiceSelection();
      persistVoiceId();
      log(`Loaded ${rows.length} voices from Supabase.`);
    } catch (e) {
      els.voiceId.innerHTML = "<option value=\"\">Could not load voices</option>";
      refreshVoiceInfoButton();
      const msgParts = [
        e?.message || String(e || "Unknown error"),
        e?.code ? `code=${e.code}` : "",
        e?.hint ? `hint=${e.hint}` : "",
        e?.details ? `details=${e.details}` : "",
      ].filter(Boolean);
      log(`ERROR loading voices: ${msgParts.join(" | ")}`);
    }
  }

  async function loadVoicesFromLocalConfig() {
    if (!els.voiceId) return;
    els.voiceId.innerHTML = "<option value=\"\">Loading voices...</option>";
    try {
      const res = await fetch(`${LOCAL_ELEVENLABS_API_URL}?action=voices`, {
        headers: { "Accept": "application/json" },
        cache: "no-store",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || `Local voice config failed (${res.status}).`);
      }
      const rows = (body?.voices || []).filter((r) => (r?.voice_id || "").trim());
      setVoiceOptions(rows);
      applySavedVoiceSelection();
      persistVoiceId();
      log(`Loaded ${rows.length} voices from local config.`);
    } catch (e) {
      els.voiceId.innerHTML = "<option value=\"\">Could not load voices</option>";
      refreshVoiceInfoButton();
      log(`ERROR loading local voices: ${e?.message || e}`);
    }
  }

  function isRememberModelEnabled() {
    if (!els.chkRememberModel) return false;
    return !!els.chkRememberModel.checked;
  }

  function persistRememberFlags() {
    if (els.chkRememberModel) storageSet(STORAGE.rememberModel, isRememberModelEnabled() ? "1" : "0");
  }

  function persistVoiceId(valueRaw) {
    if (!els.voiceId) return;
    const value = (valueRaw ?? els.voiceId.value ?? "").trim();
    const selectedName = (els.voiceId?.selectedOptions?.[0]?.textContent || "").trim();

    if (!value) {
      storageDel(STORAGE.voiceId);
      storageDel(STORAGE.voiceName);
      return;
    }
    storageSet(STORAGE.voiceId, value);
    if (selectedName) storageSet(STORAGE.voiceName, selectedName);
    else storageDel(STORAGE.voiceName);
  }

  function persistModelId(valueRaw) {
    if (!els.modelId) return;
    const value = (valueRaw ?? els.modelId.value ?? "").trim();

    if (!isRememberModelEnabled()) {
      storageDel(STORAGE.modelId);
      return;
    }

    if (!value) storageDel(STORAGE.modelId);
    else storageSet(STORAGE.modelId, value);
  }

  function persistMergeGapMs(valueRaw) {
    if (!els.mergeGapMs) return;
    const raw = (valueRaw ?? els.mergeGapMs.value ?? "").trim();
    const n = Number.parseInt(raw, 10);
    const gap = Number.isFinite(n) ? Math.min(5000, Math.max(0, n)) : 500;
    els.mergeGapMs.value = String(gap);
    storageSet(STORAGE.mergeGapMs, String(gap));
  }

  function loadPrefs() {
    const rememberModel = storageGet(STORAGE.rememberModel);

    if (els.chkRememberModel) {
      els.chkRememberModel.checked = rememberModel == null ? true : rememberModel === "1";
    }

    savedVoiceIdPref = (storageGet(STORAGE.voiceId) || "").trim();

    if (isRememberModelEnabled()) {
      const savedModelId = storageGet(STORAGE.modelId);
      if (savedModelId && els.modelId) els.modelId.value = savedModelId;
    }

    const savedMergeGapMs = storageGet(STORAGE.mergeGapMs);
    if (els.mergeGapMs) {
      els.mergeGapMs.value = (savedMergeGapMs || "500").trim() || "500";
      persistMergeGapMs(els.mergeGapMs.value);
    }
  }

  function setStatus() {
  }

  function hasCreditsUi() {
    return !!(els.creditSummary || els.creditUsed || els.creditRemaining || els.creditLimit || els.creditTier || els.creditMeta);
  }

  function setCreditsSummary(summary, meta = "") {
    if (els.creditSummary) els.creditSummary.textContent = summary;
    if (els.creditMeta) els.creditMeta.textContent = meta;
  }

  function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    return new Intl.NumberFormat("nl-NL").format(n);
  }

  function formatUnixDate(unixSeconds) {
    const n = Number(unixSeconds);
    if (!Number.isFinite(n) || n <= 0) return "";
    try {
      return new Intl.DateTimeFormat("nl-NL", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(n * 1000));
    } catch {
      return "";
    }
  }

  function setCreditsFields({ used = "-", remaining = "-", limit = "-", tier = "-" } = {}) {
    if (els.creditUsed) els.creditUsed.textContent = used;
    if (els.creditRemaining) els.creditRemaining.textContent = remaining;
    if (els.creditLimit) els.creditLimit.textContent = limit;
    if (els.creditTier) els.creditTier.textContent = tier;
  }

  async function fetchElevenLabsSubscription() {
    const res = await fetchWithJwtRetry("elevenlabs-subscription", {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    const bodyText = await res.text().catch(() => "");
    let body = null;
    try { body = bodyText ? JSON.parse(bodyText) : null; } catch {}

    if (!res.ok) {
      const detail = body?.error || body?.details || bodyText || res.statusText;
      throw new Error(`elevenlabs-subscription failed (${res.status}). ${String(detail).trim()}`);
    }

    return body || {};
  }

  async function loadElevenLabsCredits() {
    if (!hasCreditsUi()) return;

    if (els.btnRefreshCredits) els.btnRefreshCredits.disabled = true;
    setCreditsSummary("Credits laden...", "Bezig met ophalen via beveiligde server-call.");

    try {
      const body = await fetchElevenLabsSubscription();
      const used = Number(body?.character_count || 0);
      const limit = Number(body?.character_limit || 0);
      const remaining = Math.max(0, limit - used);
      const tier = String(body?.tier || body?.status || "-").trim() || "-";
      const resetAt = formatUnixDate(body?.next_character_count_reset_unix);

      setCreditsFields({
        used: formatNumber(used),
        remaining: formatNumber(remaining),
        limit: formatNumber(limit),
        tier,
      });
      setCreditsSummary(
        `${formatNumber(remaining)} credits beschikbaar`,
        resetAt ? `Reset op ${resetAt}.` : "Actuele stand opgehaald via beveiligde server-call."
      );
      log(`ElevenLabs credits loaded: used=${used}, remaining=${remaining}, limit=${limit}, tier=${tier}.`);
    } catch (e) {
      setCreditsFields();
      setCreditsSummary("Credits niet beschikbaar", e?.message || String(e));
      log(`ERROR loading ElevenLabs credits: ${e?.message || e}`);
    } finally {
      if (els.btnRefreshCredits) els.btnRefreshCredits.disabled = false;
    }
  }

  function safeFilenamePart(s) {
    return String(s || "")
      .trim()
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  function setLastAudio(blob, { voiceId, modelId } = {}) {
    lastAudioBlob = blob || null;
    if (!lastAudioBlob) {
      lastAudioFilename = null;
      if (els.btnDownload) els.btnDownload.disabled = true;
      return;
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const voicePart = safeFilenamePart(voiceId) || "voice";
    const modelPart = safeFilenamePart(modelId) || "model";
    lastAudioFilename = `elevenlabs-${voicePart}-${modelPart}-${ts}.mp3`;
    if (els.btnDownload) els.btnDownload.disabled = false;
  }

  function clearLastAudio() {
    setLastAudio(null);
  }

  function log(msg) {
    if (!els.log) return;
    const ts = new Date().toISOString().slice(11, 19);
    els.log.textContent += `[${ts}] ${msg}\n`;
    els.log.scrollTop = els.log.scrollHeight;
  }

  function cleanupAudio({ abortFetch = true } = {}) {
    try {
      if (abortFetch && currentAbort) currentAbort.abort();
    } catch {}
    if (abortFetch) currentAbort = null;

    try {
      if (currentHowl) {
        currentHowl.stop();
        currentHowl.unload();
      }
    } catch {}
    currentHowl = null;

    if (currentObjectUrl) {
      try { URL.revokeObjectURL(currentObjectUrl); } catch {}
      currentObjectUrl = null;
    }
  }

  function buildAudioUrl(path) {
    const p = String(path || "").trim();
    if (!p) return "";
    if (/^https?:\/\//i.test(p)) return p;
    return `${BRAILLE_AUDIO_BASE_URL}${p.startsWith("/") ? p : `/${p}`}`;
  }

  // IMPORTANT:
  // - eleven_v3 rejects legacy "stability" values like 0.6 and expects ttd_stability in {0.0, 0.5, 1.0}.
  // - For non-v3 models, stability/similarity_boost are fine.
  function buildBody(text, modelIdRaw) {
    const modelId = (modelIdRaw || "").trim();

    // Minimal baseline
    const body = { text };

    if (modelId) body.model_id = modelId;

    // Voice settings per model
    if (modelId === "eleven_v3") {
      // Allowed: 0.0, 0.5, 1.0
      body.voice_settings = {
        ttd_stability: 0.5, // Natural
      };
      // Note: do NOT send "stability" or "similarity_boost" here for v3.
    } else {
      body.voice_settings = {
        stability: 0.6,
        similarity_boost: 0.8,
      };
    }

    return body;
  }

  async function synthesizeTextToMp3BlobViaTtsProxy({ voiceId, text, modelId, outputFormat }) {
    const body = buildBody(text, modelId);
    const payload = {
      text,
      voiceId,
      modelId: typeof body.model_id === "string" ? body.model_id : "",
      outputFormat,
      voice_settings: body.voice_settings,
    };

    const res = requiresAuth ? await fetchWithJwtRetry("tts-proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify(payload),
    }) : await fetch(LOCAL_ELEVENLABS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`TTS proxy failed (${res.status}). ${errText}`.trim());
    }

    return res.blob();
  }

  async function fetchSpeechTokenMp3Blob(token) {
    const normalized = String(token || "").replace(/\.mp3$/i, "").trim();
    if (!normalized) throw new Error("Speech token is empty.");
    const relPath = `${SPEECH_BASE_PATH}${normalized}.mp3`;
    const res = await fetchOnlineAudioBlobResponse(relPath);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Speech token fetch failed (${res.status}) for ${relPath}. ${body}`.trim());
    }
    return res.blob();
  }

  async function fetchOnlineAudioBlobResponse(path) {
    if (requiresAuth) {
      return fetch(buildAudioUrl(path), { cache: "no-store" });
    }
    return fetch(`${LOCAL_AUDIO_PROXY_URL}?path=${encodeURIComponent(path)}`, { cache: "no-store" });
  }

  async function fetchGeneralTokenMp3Blob(token) {
    const normalized = String(token || "").replace(/\.mp3$/i, "").trim();
    if (!normalized) throw new Error("General token is empty.");
    const relPath = `${GENERAL_BASE_PATH}${normalized}.mp3`;
    const res = await fetchOnlineAudioBlobResponse(relPath);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`General token fetch failed (${res.status}) for ${relPath}. ${body}`.trim());
    }
    return res.blob();
  }

  async function getLocalFfmpeg() {
    if (localFfmpegPromise) return localFfmpegPromise;
    if (typeof createFFmpegCore !== "function") {
      throw new Error("Local ffmpeg-core is not loaded.");
    }

    log("Loading local ffmpeg...");
    localFfmpegPromise = createFFmpegCore({
      locateFile: (path) => path.endsWith(".wasm") ? LOCAL_FFMPEG_WASM_URL : path,
      logger: ({ type, message }) => {
        if (type === "stderr" && /error|invalid|failed/i.test(message)) log(`ffmpeg: ${message}`);
      },
    }).then((ffmpeg) => {
      log("Local ffmpeg loaded.");
      return ffmpeg;
    }).catch((error) => {
      localFfmpegPromise = null;
      throw error;
    });
    return localFfmpegPromise;
  }

  function unlinkFfmpegFile(ffmpeg, filename) {
    try { ffmpeg.FS.unlink(filename); } catch {}
  }

  async function mergeAudioBlobsLocally(blobs) {
    if (!blobs.length) throw new Error("No audio parts to merge.");
    if (blobs.length === 1) return blobs[0];

    const ffmpeg = await getLocalFfmpeg();
    const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const inputNames = [];
    const outputName = `merged-${runId}.mp3`;

    try {
      for (let index = 0; index < blobs.length; index += 1) {
        const inputName = `part-${runId}-${index}.mp3`;
        inputNames.push(inputName);
        ffmpeg.FS.writeFile(inputName, new Uint8Array(await blobs[index].arrayBuffer()));
      }

      const args = [];
      for (const inputName of inputNames) args.push("-i", inputName);

      const filters = [];
      const concatInputs = [];
      const gapSeconds = getMergeGapMs() / 1000;
      for (let index = 0; index < inputNames.length; index += 1) {
        filters.push(`[${index}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono[a${index}]`);
        concatInputs.push(`[a${index}]`);
        if (gapSeconds > 0 && index < inputNames.length - 1) {
          filters.push(`aevalsrc=0:d=${gapSeconds}:s=44100,aformat=sample_fmts=fltp:channel_layouts=mono[g${index}]`);
          concatInputs.push(`[g${index}]`);
        }
      }
      filters.push(`${concatInputs.join("")}concat=n=${concatInputs.length}:v=0:a=1[out]`);

      log(`Merging ${blobs.length} audio parts locally with ffmpeg.`);
      ffmpeg.reset();
      const result = ffmpeg.exec(
        ...args,
        "-filter_complex", filters.join(";"),
        "-map", "[out]",
        "-codec:a", "libmp3lame",
        "-b:a", "128k",
        outputName
      );
      if (result !== 0) throw new Error(`Local ffmpeg merge failed with exit code ${result}.`);

      const output = ffmpeg.FS.readFile(outputName);
      return new Blob([output.slice().buffer], { type: "audio/mpeg" });
    } finally {
      for (const inputName of inputNames) unlinkFfmpegFile(ffmpeg, inputName);
      unlinkFfmpegFile(ffmpeg, outputName);
    }
  }

  async function buildLocalMixedAudioBlob(segments, { voiceId, modelId, outputFormat }) {
    const blobs = [];
    for (const seg of segments) {
      if (seg.type === "speech") {
        log(`Using online speech MP3: ${seg.value}`);
        blobs.push(await fetchSpeechTokenMp3Blob(seg.value));
      } else if (seg.type === "general") {
        log(`Using online general MP3: ${seg.value}`);
        blobs.push(await fetchGeneralTokenMp3Blob(seg.value));
      } else {
        log(`Creating ElevenLabs MP3: ${seg.value}`);
        blobs.push(await synthesizeTextToMp3BlobViaTtsProxy({ voiceId, text: seg.value, modelId, outputFormat }));
      }
    }
    return mergeAudioBlobsLocally(blobs);
  }

  function parseMixedTextSegments(rawInput) {
    const raw = String(rawInput || "").trim();
    if (!raw) throw new Error("Text is empty.");

    const segments = [];
    const re = /<([^>]+)>|\{([^}]+)\}/g;
    let cursor = 0;
    let match;

    while ((match = re.exec(raw)) !== null) {
      const textBefore = raw.slice(cursor, match.index).replace(/\s+/g, " ").trim();
      if (textBefore) segments.push({ type: "tts", value: textBefore });

      const isSpeechToken = typeof match[1] === "string" && match[1] !== "";
      const tokenType = isSpeechToken ? "speech" : "general";
      const tokenRaw = (match[1] || match[2] || "").replace(/\s+/g, " ").trim();
      if (tokenRaw) {
        const tokenParts = tokenRaw.split(",").map((s) => s.trim()).filter(Boolean);
        for (const token of tokenParts) segments.push({ type: tokenType, value: token });
      }
      cursor = re.lastIndex;
    }

    const textAfter = raw.slice(cursor).replace(/\s+/g, " ").trim();
    if (textAfter) segments.push({ type: "tts", value: textAfter });

    if (!segments.length) {
      throw new Error("No valid segments found. Use text and optionally <speech-token> or {general-token} tags.");
    }
    return segments;
  }

  function getMergeGapMs() {
    const raw = (els.mergeGapMs?.value || storageGet(STORAGE.mergeGapMs) || "500").trim();
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return 500;
    return Math.min(5000, Math.max(0, n));
  }

  function parseHashSeparatedGroups(rawInput) {
    const raw = String(rawInput || "");
    const groups = raw
      .split("#")
      .map((part) => part.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (!groups.length) {
      throw new Error("No # segments found. Separate each download with #.");
    }
    return groups;
  }

  async function uploadBlobToStoryEndpoint(blob, { path, audiofile }) {
    const form = new FormData();
    form.append("path", path);
    form.append("audiofile", audiofile);
    form.append("file", blob, audiofile);

    const res = await fetchWithJwtRetry("upload-mp3-proxy", {
      method: "POST",
      headers: {
        "Accept": "application/json",
      },
      body: form,
    });

    const body = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`MP3 upload failed (${res.status}). ${body}`.trim());
    try { return JSON.parse(body); } catch { return { ok: true, raw: body }; }
  }

  function isProbablyIOS() {
    const ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  async function saveAudioBlobToFiles(blob, filename) {
    // Best UX on iOS: Share Sheet -> "Save to Files"
    try {
      const file = new File([blob], filename, { type: blob.type || "audio/mpeg" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
          text: "Audio file",
        });
        return { method: "share" };
      }
    } catch {
      // continue to fallback
    }

    // Fallback: classic download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "elevenlabs.mp3";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch {}
    }, 0);

    return { method: "anchor" };
  }

  function downloadBlobViaAnchor(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "elevenlabs.mp3";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch {}
    }, 0);
  }

  function notifyDownloadFinished(filename, destination = "Downloads folder") {
    const fileText = filename ? `\nFile: ${filename}` : "";
    window.alert(`Download finished.${fileText}\nFolder: ${destination}`);
  }

  function browserDownloadDestination() {
    return "Downloads folder (or your browser's configured download folder)";
  }

  function buildSplitFilename(index, rawText) {
    const textPart = safeFilenamePart(rawText).slice(0, 40) || "part";
    return `elevenlabs-part-${String(index).padStart(3, "0")}-${textPart}.mp3`;
  }

  async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchAudioBlobViaProxy(url) {
    const res = await fetchWithJwtRetry("audio-download-proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Audio download proxy failed (${res.status}). ${body}`.trim());
    }

    return res.blob();
  }

  async function mergeSourcesToBlob(sources, outputFilename) {
    const mergeRes = await fetchWithJwtRetry("merge-proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        outputDir: MIXED_MERGE_OUTPUT_DIR,
        sources,
        outputFilename,
        gapMs: getMergeGapMs(),
        debug: true,
        tryCopyFirst: false,
      }),
    });

    const mergeBodyText = await mergeRes.text().catch(() => "");
    let mergeBody = null;
    try { mergeBody = mergeBodyText ? JSON.parse(mergeBodyText) : null; } catch {}
    if (!mergeRes.ok || mergeBody?.ok === false) {
      throw new Error(`Mixed merge failed (${mergeRes.status}). ${mergeBodyText}`.trim());
    }

    const outputUrlRaw = mergeBody?.outputUrl || mergeBody?.url || `${MIXED_MERGE_OUTPUT_DIR}${outputFilename}`;
    const outputUrl = buildAudioUrl(outputUrlRaw);

    let lastError = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        log(`Split merged fetch attempt ${attempt}: ${outputUrl}`);
        const proxiedUrl = `${outputUrl}${outputUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
        return await fetchAudioBlobViaProxy(proxiedUrl);
      } catch (e) {
        lastError = e;
        if (attempt < 5) {
          await sleep(500 * attempt);
        }
      }
    }

    throw lastError || new Error("Merged audio fetch failed.");
  }

  async function buildBlobForMixedGroup(groupText, { voiceId, modelId, outputFormat, stem }) {
    const segments = parseMixedTextSegments(groupText);
    if (!requiresAuth) {
      return {
        kind: "blob",
        value: await buildLocalMixedAudioBlob(segments, { voiceId, modelId, outputFormat }),
      };
    }

    if (segments.length === 1) {
      const seg = segments[0];
      if (seg.type === "speech") {
        log(`Split group uses speech token: ${seg.value}`);
        return { kind: "blob", value: await fetchSpeechTokenMp3Blob(seg.value) };
      }
      if (seg.type === "general") {
        log(`Split group uses general token: ${seg.value}`);
        return { kind: "blob", value: await fetchGeneralTokenMp3Blob(seg.value) };
      }
      return {
        kind: "blob",
        value: await synthesizeTextToMp3BlobViaTtsProxy({ voiceId, text: seg.value, modelId, outputFormat }),
      };
    }

    const sources = [];
    let partNo = 1;
    for (const seg of segments) {
      if (seg.type === "speech") {
        const normalized = seg.value.replace(/\.mp3$/i, "");
        log(`Split merge source [speech]: ${normalized}`);
        sources.push(`${SPEECH_BASE_PATH}${normalized}.mp3`);
        continue;
      }
      if (seg.type === "general") {
        const normalized = seg.value.replace(/\.mp3$/i, "");
        log(`Split merge source [general]: ${normalized}`);
        sources.push(`${GENERAL_BASE_PATH}${normalized}.mp3`);
        continue;
      }
      log(`Split merge source [tts]: ${seg.value}`);
      const blob = await synthesizeTextToMp3BlobViaTtsProxy({ voiceId, text: seg.value, modelId, outputFormat });
      const partFilename = `${stem}-part-${String(partNo).padStart(3, "0")}.mp3`;
      log(`Split upload part -> ${MIXED_MERGE_PARTS_PATH}/${partFilename}`);
      await uploadBlobToStoryEndpoint(blob, {
        path: MIXED_MERGE_PARTS_PATH,
        audiofile: partFilename,
      });
      sources.push(`/${MIXED_MERGE_PARTS_PATH}/${partFilename}`);
      partNo += 1;
    }

    log(`Split merge call with ${sources.length} sources -> ${stem}.mp3`);
    return { kind: "blob", value: await mergeSourcesToBlob(sources, `${stem}.mp3`) };
  }

  function setDownloadSplitFilesButtonBusy(busy, label = "Produce & download MP3s") {
    if (!els.btnDownloadSplitFiles) return;
    els.btnDownloadSplitFiles.disabled = !!busy;
    els.btnDownloadSplitFiles.textContent = busy ? label : "Produce & download MP3s";
  }

  function setDownloadSplitZipButtonBusy(busy, label = "Produce & download ZIP") {
    if (!els.btnDownloadSplitZip) return;
    els.btnDownloadSplitZip.disabled = !!busy;
    els.btnDownloadSplitZip.textContent = busy ? label : "Produce & download ZIP";
  }

  async function buildSplitDownloads({ voiceId, text, modelId, outputFormat }) {
    const groups = parseHashSeparatedGroups(text);
    log(`Preparing ${groups.length} split download${groups.length === 1 ? "" : "s"} from # separators.`);

    const readyDownloads = [];
    let completed = 0;
    let index = 1;
    for (const groupText of groups) {
      try {
        const stem = `split-${Date.now()}-${String(index).padStart(3, "0")}`;
        const filename = buildSplitFilename(index, groupText);
        const result = await buildBlobForMixedGroup(groupText, { voiceId, modelId, outputFormat, stem });
        readyDownloads.push({ filename, blob: result.value, index });
        log(`Split bestand klaar [deel ${index}]: ${filename}`);
        completed += 1;
      } catch (e) {
        log(`Split download failed [deel ${index}] "${groupText}": ${e?.message || e}`);
      }
      index += 1;
    }

    if (!completed) {
      throw new Error("No split downloads succeeded.");
    }
    return { groups, readyDownloads, completed };
  }

  async function onDownloadSplitFiles() {
    const voiceId = (els.voiceId?.value || "").trim();
    const text = (els.text?.value || "").trim();
    const modelId = "eleven_v3";
    const outputFormat = FIXED_OUTPUT_FORMAT;

    persistRememberFlags();
    persistVoiceId(voiceId);
    persistModelId(modelId);

    if (!voiceId || !text) {
      log("Missing required fields for split download: Voice ID and Text are required.");
      setStatus("Missing input");
      return;
    }

    setDownloadSplitFilesButtonBusy(true, "Producing MP3s...");
    try {
      setStatus("Preparing split downloads…");
      const { groups, readyDownloads, completed } = await buildSplitDownloads({ voiceId, text, modelId, outputFormat });
      for (const item of readyDownloads) {
        downloadBlobViaAnchor(item.blob, item.filename);
        log(`Download started [deel ${item.index}]: ${item.filename}`);
        await sleep(750);
      }
      log(`Split download klaar: ${completed}/${groups.length} bestanden gestart.`);
      notifyDownloadFinished(
        `${completed}/${groups.length} MP3 files`,
        browserDownloadDestination()
      );
      setStatus("Idle");
    } catch (e) {
      log(`Split download failed: ${e?.message || e}`);
      setStatus("Error");
    } finally {
      setDownloadSplitFilesButtonBusy(false);
    }
  }

  async function onDownloadSplitZip() {
    const voiceId = (els.voiceId?.value || "").trim();
    const text = (els.text?.value || "").trim();
    const modelId = "eleven_v3";
    const outputFormat = FIXED_OUTPUT_FORMAT;

    persistRememberFlags();
    persistVoiceId(voiceId);
    persistModelId(modelId);

    if (!voiceId || !text) {
      log("Missing required fields for split ZIP: Voice ID and Text are required.");
      setStatus("Missing input");
      return;
    }
    if (typeof JSZip === "undefined") {
      log("Split ZIP failed: JSZip not loaded.");
      setStatus("Error");
      return;
    }

    setDownloadSplitZipButtonBusy(true, "Producing ZIP...");
    try {
      setStatus("Preparing ZIP…");
      const { groups, readyDownloads, completed } = await buildSplitDownloads({ voiceId, text, modelId, outputFormat });
      const zip = new JSZip();
      for (const item of readyDownloads) {
        zip.file(item.filename, item.blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipFilename = `elevenlabs-split-${String(groups.length).padStart(3, "0")}-files.zip`;
      downloadBlobViaAnchor(zipBlob, zipFilename);
      log(`ZIP download started: ${zipFilename} (${completed}/${groups.length} bestanden).`);
      notifyDownloadFinished(zipFilename, browserDownloadDestination());
      setStatus("Idle");
    } catch (e) {
      log(`Split ZIP failed: ${e?.message || e}`);
      setStatus("Error");
    } finally {
      setDownloadSplitZipButtonBusy(false);
    }
  }

  async function onPlay() {
    const voiceId = (els.voiceId?.value || "").trim();
    const text = (els.text?.value || "").trim();
    const modelId = "eleven_v3";
    const outputFormat = FIXED_OUTPUT_FORMAT;

    persistRememberFlags();
    persistVoiceId(voiceId);
    persistModelId(modelId);
    clearLastAudio();

    if (!voiceId || !text) {
      log("Missing required fields: Voice ID and Text are required.");
      setStatus("Missing input");
      return;
    }

    // Stop anything currently playing and abort any current fetch
    cleanupAudio({ abortFetch: true });

    // Create controller for this play
    currentAbort = new AbortController();

    els.btnPlay && (els.btnPlay.disabled = true);
    els.btnStop && (els.btnStop.disabled = false);

    try {
      log("Using secured TTS proxy for playback.");
      setStatus("Downloading…");
      const blob = await synthesizeTextToMp3BlobViaTtsProxy({ voiceId, text, modelId, outputFormat });
      setLastAudio(blob, { voiceId, modelId });
      const url = URL.createObjectURL(blob);
      currentObjectUrl = url;
      await new Promise((resolve, reject) => {
        setStatus("Playing…");
        currentHowl = new Howl({
          src: [url],
          html5: true,
          format: ["mp3"],
          onplay: () => log("Howler: play"),
          onend: () => {
            log("Howler: end");
            setStatus("Idle");
            resolve();
          },
          onloaderror: (_id, err) => reject(new Error(`Howler load error: ${err}`)),
          onplayerror: (_id, err) => reject(new Error(`Howler play error: ${err}`)),
        });
        currentHowl.play();
      });
    } catch (e) {
      const msg = e?.message || String(e);
      if (/aborted/i.test(msg) || (e?.name && String(e.name).toLowerCase().includes("abort"))) {
        log("Fetch aborted (likely Stop pressed).");
        setStatus("Idle");
      } else {
        log(`ERROR: ${msg}`);
        setStatus("Error");
      }
    } finally {
      els.btnPlay && (els.btnPlay.disabled = false);
      els.btnStop && (els.btnStop.disabled = false);
    }
  }

  function onStop() {
    log("Stop pressed.");
    cleanupAudio({ abortFetch: true });
    stopMergedPlayback();
    setStatus("Idle");
    els.btnPlay && (els.btnPlay.disabled = false);
    els.btnStop && (els.btnStop.disabled = true);
  }

  function onClearText() {
    if (!els.text) return;
    els.text.value = "";
    els.text.focus();
    log("Text cleared.");
  }

  function setLogVisible(visible) {
    if (!els.logPanel) return;
    els.logPanel.hidden = !visible;
    els.btnToggleLog?.setAttribute("aria-expanded", visible ? "true" : "false");
    els.btnToggleLog?.setAttribute("aria-label", visible ? "Hide logging" : "Show logging");
    if (els.btnToggleLogLabel) {
      els.btnToggleLogLabel.textContent = visible ? "Hide logging" : "Show logging";
    }
  }

  function onToggleLog() {
    setLogVisible(!!els.logPanel?.hidden);
  }

  function onClearLog() {
    if (els.log) els.log.textContent = "";
    log("Log cleared.");
  }

  function setCopyLogLabel(text) {
    if (els.btnCopyLogLabel) {
      els.btnCopyLogLabel.textContent = text;
    } else if (els.btnCopyLog) {
      els.btnCopyLog.textContent = text;
    }
  }

  async function onCopyLog() {
    if (!els.log) return;
    const text = els.log.textContent || "";
    if (!text.trim()) {
      setCopyLogLabel("Empty");
      window.setTimeout(() => setCopyLogLabel("Copy"), 1200);
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopyLogLabel("Copied");
    } catch (e) {
      log(`Copy log failed: ${e?.message || e}`);
      setCopyLogLabel("Copy failed");
    } finally {
      window.setTimeout(() => setCopyLogLabel("Copy"), 1200);
    }
  }

  function setGitPullLabel(text) {
    if (els.btnGitPullLabel) {
      els.btnGitPullLabel.textContent = text;
    } else if (els.btnGitPull) {
      els.btnGitPull.textContent = text;
    }
  }

  function logGitPullMessage(message, output = "") {
    const cleanOutput = String(output || "").trim();
    log(cleanOutput ? `${message}\n${cleanOutput}` : message);
  }

  async function onGitPull() {
    if (!els.btnGitPull) return;
    els.btnGitPull.disabled = true;
    setGitPullLabel("Pulling...");
    logGitPullMessage("Git pull started.");
    try {
      const res = await fetch("./git_pull.php", {
        method: "POST",
        headers: { "Accept": "application/json" },
      });
      const body = await res.json().catch(() => null);
      const output = String(body?.output || "").trim();
      if (!res.ok || body?.ok === false) {
        const error = body?.error || `Git pull failed (${res.status}).`;
        logGitPullMessage(error, output);
        throw new Error(output ? `${error}\n${output}` : error);
      }
      logGitPullMessage("Git pull finished successfully.", output || "Already up to date.");
      setGitPullLabel("Pulled");
    } catch (e) {
      const error = e?.message || String(e);
      logGitPullMessage("Git pull failed.", error);
      setGitPullLabel("Pull failed");
    } finally {
      window.setTimeout(() => {
        els.btnGitPull.disabled = false;
        setGitPullLabel("Git Pull");
      }, 1400);
    }
  }

  async function onDownload() {
    if (!lastAudioBlob) {
      log("No audio available to download yet.");
      return;
    }

    const filename = lastAudioFilename || "elevenlabs.mp3";

    try {
      setStatus("Preparing download…");

      const { method } = await saveAudioBlobToFiles(lastAudioBlob, filename);

      if (method === "share") {
        log(`Opened Share Sheet for: ${filename} (use "Save to Files").`);
        notifyDownloadFinished(filename, "selected folder in Save to Files");
        setStatus("Idle");
        return;
      }

      // Anchor fallback
      if (isProbablyIOS()) {
        log(`Download link triggered for: ${filename}. If iOS does not save it automatically, use the Share button in the opened audio view to "Save to Files".`);
      } else {
        log(`Download started: ${filename}`);
      }

      notifyDownloadFinished(filename, browserDownloadDestination());
      setStatus("Idle");
    } catch (e) {
      log(`Download failed: ${e?.message || e}`);
      setStatus("Error");
    }
  }

  function setProduceMergedJwtButtonBusy(busy, label = "Produce") {
    if (!els.btnProduceMergedJwt) return;
    els.btnProduceMergedJwt.disabled = !!busy;
    els.btnProduceMergedJwt.textContent = busy ? label : "Produce";
    updateProducedAudioButtons(!!busy);
    updateSplitDownloadButtons(!!busy);
  }

  function hasProducedAudio() {
    return !!(publicMergedObjectUrl || mergedAudioVersion);
  }

  function updateProducedAudioButtons(isProducing = false) {
    const canUseAudio = hasProducedAudio() && !isProducing;
    if (els.btnPlayMerged) els.btnPlayMerged.disabled = !canUseAudio;
    if (els.btnDownloadMergedFile) els.btnDownloadMergedFile.disabled = !canUseAudio;
  }

  function updateSplitDownloadButtons(isProducing = false) {
    if (els.btnDownloadSplitFiles) els.btnDownloadSplitFiles.disabled = !!isProducing;
    if (els.btnDownloadSplitZip) els.btnDownloadSplitZip.disabled = !!isProducing;
  }

  function clearProducedAudioForNewRun() {
    stopMergedPlayback();
    if (publicMergedObjectUrl) {
      try { URL.revokeObjectURL(publicMergedObjectUrl); } catch {}
      publicMergedObjectUrl = null;
    }
    mergedAudioVersion = "";
    clearLastAudio();
    setMergedPlayButtonText(false);
    updateProducedAudioButtons(true);
  }

  function getMergedAudioUrl() {
    if (publicMergedObjectUrl) return publicMergedObjectUrl;
    const base = buildAudioUrl(`${MIXED_MERGE_OUTPUT_DIR}${MIXED_MERGE_OUTPUT_FILENAME}`);
    if (!mergedAudioVersion) return base;
    return `${base}${base.includes("?") ? "&" : "?"}v=${encodeURIComponent(mergedAudioVersion)}`;
  }

  function setMergedPlayButtonText(isPlaying) {
    if (!els.btnPlayMerged) return;
    els.btnPlayMerged.textContent = isPlaying ? "Pause" : "Play";
  }

  function stopMergedPlayback() {
    if (!mergedAudio) return;
    try { mergedAudio.pause(); } catch {}
    try { mergedAudio.currentTime = 0; } catch {}
    setMergedPlayButtonText(false);
  }

  function ensureMergedAudio() {
    if (mergedAudio) return mergedAudio;
    mergedAudio = new Audio();
    mergedAudio.preload = "none";
    mergedAudio.addEventListener("ended", () => setMergedPlayButtonText(false));
    return mergedAudio;
  }

  function onPlayMerged() {
    const player = ensureMergedAudio();
    const nextUrl = getMergedAudioUrl();
    const currentNoHash = (player.src || "").split("#")[0];
    if (!currentNoHash || currentNoHash !== nextUrl) {
      player.src = nextUrl;
    }
    if (!player.paused) {
      player.pause();
      setMergedPlayButtonText(false);
      return;
    }
    player.play()
      .then(() => setMergedPlayButtonText(true))
      .catch((e) => {
        log(`Play merged failed: ${e?.message || e}`);
        setStatus("Error");
        setMergedPlayButtonText(false);
      });
  }

  async function onDownloadMergedFile() {
    try {
      if (publicMergedObjectUrl && lastAudioBlob) {
        downloadBlobViaAnchor(lastAudioBlob, lastAudioFilename || "elevenlabs.mp3");
        log(`Download started: ${lastAudioFilename || "elevenlabs.mp3"}`);
        notifyDownloadFinished(lastAudioFilename || "elevenlabs.mp3", browserDownloadDestination());
        return;
      }
      setStatus("Downloading merged…");
      const url = `${DOWNLOAD_MERGED_API_URL}?t=${Date.now()}`;
      window.location.assign(url);
      log(`Download requested via API: ${url}`);
      notifyDownloadFinished("merged.mp3", browserDownloadDestination());
      setStatus("Idle");
    } catch (e) {
      log(`Download merged failed: ${e?.message || e}`);
      setStatus("Error");
    }
  }

  async function onMakePartsMergedJwt() {
    const voiceId = (els.voiceId?.value || "").trim();
    const text = (els.text?.value || "").trim();
    const modelId = "eleven_v3";
    const outputFormat = FIXED_OUTPUT_FORMAT;
    if (!voiceId || !text) {
      log("Missing required fields for JWT parts: Voice, Text.");
      setStatus("Missing input");
      return;
    }

    setProduceMergedJwtButtonBusy(true, "JWT-delen...");
    try {
      setStatus("Preparing JWT parts…");
      const segments = parseMixedTextSegments(text);
      const sources = [];
      const stem = `merged-${Date.now()}`;
      let partNo = 1;
      for (const seg of segments) {
        if (seg.type === "speech") {
          const normalized = seg.value.replace(/\.mp3$/i, "");
          sources.push(`${SPEECH_BASE_PATH}${normalized}.mp3`);
          continue;
        }
        if (seg.type === "general") {
          const normalized = seg.value.replace(/\.mp3$/i, "");
          sources.push(`${GENERAL_BASE_PATH}${normalized}.mp3`);
          continue;
        }
        const blob = await synthesizeTextToMp3BlobViaTtsProxy({ voiceId, text: seg.value, modelId, outputFormat });
        const partFilename = `${stem}-part-${String(partNo).padStart(3, "0")}.mp3`;
        await uploadBlobToStoryEndpoint(blob, {
          path: MIXED_MERGE_PARTS_PATH,
          audiofile: partFilename,
        });
        sources.push(`/${MIXED_MERGE_PARTS_PATH}/${partFilename}`);
        partNo += 1;
      }

      preparedMergedSources = sources;
      log(`JWT parts ready: ${sources.length} source${sources.length === 1 ? "" : "s"}.`);
      setStatus("Idle");
    } catch (e) {
      log(`Maak delen JWT failed: ${e?.message || e}`);
      setStatus("Error");
    } finally {
      setProduceMergedJwtButtonBusy(false);
    }
  }

  async function onMergeMergedJwt() {
    if (!preparedMergedSources.length) {
      log("No prepared sources yet. Click 'Maak delen JWT' first.");
      setStatus("Missing input");
      return;
    }

    setProduceMergedJwtButtonBusy(true, "Merging...");
    try {
      setStatus("Merging via JWT…");
      const mergeRes = await fetchWithJwtRetry("merge-proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          outputDir: MIXED_MERGE_OUTPUT_DIR,
          sources: preparedMergedSources,
          outputFilename: MIXED_MERGE_OUTPUT_FILENAME,
          gapMs: getMergeGapMs(),
          debug: true,
          tryCopyFirst: false,
        }),
      });

      const mergeBodyText = await mergeRes.text().catch(() => "");
      let mergeBody = null;
      try { mergeBody = mergeBodyText ? JSON.parse(mergeBodyText) : null; } catch {}
      if (!mergeRes.ok || mergeBody?.ok === false) {
        throw new Error(`Mixed merge failed (${mergeRes.status}). ${mergeBodyText}`.trim());
      }

      const outputUrl = mergeBody?.outputUrl || mergeBody?.url || buildAudioUrl(`${MIXED_MERGE_OUTPUT_DIR}${MIXED_MERGE_OUTPUT_FILENAME}`);
      mergedAudioVersion = String(Date.now());
      stopMergedPlayback();
      updateProducedAudioButtons(false);
      log(`Merged file produced: ${outputUrl}`);
      setStatus("Idle");
    } catch (e) {
      log(`Merge JWT failed: ${e?.message || e}`);
      setStatus("Error");
    } finally {
      setProduceMergedJwtButtonBusy(false);
    }
  }

  async function onProduceMergedJwt() {
    clearProducedAudioForNewRun();
    setProduceMergedJwtButtonBusy(true, "Producing...");
    try {
      if (!requiresAuth) {
        await onProduceLocalTts();
        return;
      }
      await onMakePartsMergedJwt();
      if (!preparedMergedSources.length) {
        throw new Error("No prepared sources after parts step.");
      }
      await onMergeMergedJwt();
    } catch (e) {
      log(`Produce failed: ${e?.message || e}`);
      setStatus("Error");
    } finally {
      setProduceMergedJwtButtonBusy(false);
    }
  }

  async function onProduceLocalTts() {
    const voiceId = (els.voiceId?.value || "").trim();
    const text = (els.text?.value || "").trim();
    const modelId = "eleven_v3";
    const outputFormat = FIXED_OUTPUT_FORMAT;

    persistRememberFlags();
    persistVoiceId(voiceId);
    persistModelId(modelId);

    if (!voiceId || !text) {
      log("Missing required fields: Voice ID and Text are required.");
      setStatus("Missing input");
      return;
    }

    const segments = parseMixedTextSegments(text);

    setStatus("Producing...");
    const blob = await buildLocalMixedAudioBlob(segments, { voiceId, modelId, outputFormat });
    setLastAudio(blob, { voiceId, modelId });
    publicMergedObjectUrl = URL.createObjectURL(blob);
    stopMergedPlayback();
    updateProducedAudioButtons(false);
    log(`Local ElevenLabs audio produced: ${lastAudioFilename || "elevenlabs.mp3"}`);
    setStatus("Idle");
  }

  // Wire up
  els.btnPlay?.addEventListener("click", onPlay);
  els.btnStop?.addEventListener("click", onStop);
  els.btnClearText?.addEventListener("click", onClearText); // <-- added
  els.btnToggleLog?.addEventListener("click", onToggleLog);
  els.btnCopyLog?.addEventListener("click", () => { void onCopyLog(); });
  els.btnClearLog?.addEventListener("click", onClearLog);
  els.btnGitPull?.addEventListener("click", onGitPull);
  els.btnDownload?.addEventListener("click", onDownload);
  els.btnProduceMergedJwt?.addEventListener("click", onProduceMergedJwt);
  els.btnPlayMerged?.addEventListener("click", onPlayMerged);
  els.btnDownloadMergedFile?.addEventListener("click", onDownloadMergedFile);
  els.btnDownloadSplitFiles?.addEventListener("click", onDownloadSplitFiles);
  els.btnDownloadSplitZip?.addEventListener("click", onDownloadSplitZip);
  els.btnRefreshCredits?.addEventListener("click", () => { void loadElevenLabsCredits(); });
  els.btnVoiceInfo?.addEventListener("click", onVoiceInfoClick);
  els.btnSignIn?.addEventListener("click", () => { void signIn(); });
  els.btnSignOut?.addEventListener("click", () => { void signOut(); });
  els.email?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void signIn();
  });
  els.password?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void signIn();
  });
  els.voiceId?.addEventListener("change", () => {
    persistVoiceId();
    refreshVoiceInfoButton();
  });
  els.modelId?.addEventListener("change", () => persistModelId());
  els.mergeGapMs?.addEventListener("change", () => persistMergeGapMs());

  els.chkRememberModel?.addEventListener("change", () => {
    persistRememberFlags();
    persistModelId();
  });

  // Init
  if (els.btnStop) els.btnStop.disabled = true;
  if (els.btnDownload) els.btnDownload.disabled = true;
  updateProducedAudioButtons(false);

  loadPrefs();
  wirePasswordToggle();
  if (requiresAuth) setSignedOutState();
  setLogVisible(false);

  void (async () => {
    try {
      if (requiresAuth) {
        if (!sb) sb = await initSupabaseClient();
        sb.auth.onAuthStateChange((_event, session) => {
          void refreshAuthUI(session ?? null);
        });
        await refreshAuthUI();
      } else {
        await loadVoicesFromLocalConfig();
      }
    } catch (e) {
      const err = e?.message || String(e);
      msg(els.authMsg, err, false);
      log(`Auth init failed: ${err}`);
      if (requiresAuth) setSignedOutState();
    }
  })();

  setStatus("Idle");
  log("Ready.");
})();
