import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const indexPath = resolve("dist", "index.html");
let html = await readFile(indexPath, "utf8");

// Expo's static exporter currently writes the generated document as English,
// even though the application itself is Portuguese. Keep the browser locale
// and the fallback message aligned with the product language.
html = html.replace(/<html\b[^>]*>/i, '<html lang="pt-BR">');
html = html.replace(
  /<noscript>\s*You need to enable JavaScript to run this app\.\s*<\/noscript>/i,
  "<noscript>Ative o JavaScript para usar este aplicativo.</noscript>",
);

html = html.replace(
  /<meta name="viewport"[^>]*>/i,
  '<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />',
);

const pwaHead = `
<link rel="preconnect" href="https://iougyvryqotidbhloazg.supabase.co" />
<link rel="preconnect" href="https://crm-familiar.vercel.app" />
<link rel="dns-prefetch" href="https://iougyvryqotidbhloazg.supabase.co" />
<link rel="dns-prefetch" href="https://crm-familiar.vercel.app" />
<meta name="theme-color" content="#3B825C" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="CRM Família" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
`;

const socialHead = `
<meta name="description" content="Organização financeira para a sua família" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="CRM Familiar" />
<meta property="og:locale" content="pt_BR" />
<meta property="og:title" content="CRM Familiar" />
<meta property="og:description" content="Organização financeira para a sua família" />
<meta property="og:image" content="https://crm-familiar-web.vercel.app/pwa-icon.png" />
<meta property="og:image:secure_url" content="https://crm-familiar-web.vercel.app/pwa-icon.png" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="512" />
<meta property="og:image:height" content="512" />
<meta property="og:image:alt" content="Ícone do CRM Familiar" />
<meta property="og:url" content="https://crm-familiar-web.vercel.app/" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="CRM Familiar" />
<meta name="twitter:description" content="Organização financeira para a sua família" />
<meta name="twitter:image" content="https://crm-familiar-web.vercel.app/pwa-icon.png" />
`;

const serviceWorkerRegistration = `
<script id="crm-pwa-register">
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register("/service-worker.js", { scope: "/", updateViaCache: "none" })
        .then(function (registration) { return registration.update(); })
        .catch(function () {});
    });
  }
</script>
`;

if (!html.includes('rel="manifest"')) {
  html = html.replace("</head>", `${pwaHead}</head>`);
}

if (!html.includes('property="og:title"')) {
  html = html.replace("</head>", `${socialHead}</head>`);
}

if (!html.includes('id="crm-pwa-register"')) {
  html = html.replace("</body>", `${serviceWorkerRegistration}</body>`);
}

// The OAuth diagnostic bootstrap is generated only for Vercel Preview builds.
// Production builds never receive the script, even if this branch is merged later.
if (process.env.VERCEL_ENV === "preview" && !html.includes('id="crm-oauth-diagnostic-bootstrap"')) {
  const oauthDiagnosticBootstrap = `
<script id="crm-oauth-diagnostic-bootstrap">
(function () {
  var version = "CRM-OAUTH-DIAG-2026-10-30-V1";
  var productionHosts = ["crm-familiar-web.vercel.app", "crm-familiar.vercel.app"];
  var host = window.location.hostname.toLowerCase();
  var isVercelPreview = host.endsWith(".vercel.app") && productionHosts.indexOf(host) === -1;
  var enabledKey = "crm.oauth.diag.enabled.v1";
  var eventsKey = "crm.oauth.diag.events.v1";
  var startedKey = "crm.oauth.diag.started.v1";
  var allowedCodes = [
    "DIAGNOSTIC_LOADED", "MODE_BROWSER", "MODE_STANDALONE", "SERVICE_WORKER_CONTROLLED",
    "SERVICE_WORKER_UNCONTROLLED", "TOUCH_RECEIVED", "PRESS_RECEIVED", "LOGIN_HANDLER_ENTERED",
    "AUTH_FUNCTION_ENTERED", "LOGIN_DUPLICATE_IGNORED", "LOGIN_WAIT_MARKER_4500MS",
    "PENDING_INVITE_WRITE_STARTED", "PENDING_INVITE_WRITE_RESOLVED", "PENDING_INVITE_WRITE_FAILED",
    "PENDING_INVITE_REMOVE_STARTED", "PENDING_INVITE_REMOVE_RESOLVED", "PENDING_INVITE_REMOVE_FAILED",
    "SESSION_GET_STARTED", "SESSION_GET_RESOLVED", "SESSION_GET_REJECTED",
    "AUTH_STORAGE_READ_STARTED", "AUTH_STORAGE_READ_RESOLVED", "AUTH_STORAGE_READ_FAILED",
    "AUTH_STORAGE_WRITE_STARTED", "AUTH_STORAGE_WRITE_RESOLVED", "AUTH_STORAGE_WRITE_FAILED",
    "AUTH_STORAGE_REMOVE_STARTED", "AUTH_STORAGE_REMOVE_RESOLVED", "AUTH_STORAGE_REMOVE_FAILED",
    "OAUTH_CALL_STARTED", "OAUTH_PROMISE_RETURNED", "OAUTH_CALL_THROWN", "OAUTH_TIMEOUT_ARMED",
    "OAUTH_PROMISE_RESOLVED_WITH_URL", "OAUTH_PROMISE_RESOLVED_WITHOUT_URL", "OAUTH_PROMISE_REJECTED",
    "OAUTH_RESOLVED_AFTER_TIMEOUT", "OAUTH_REJECTED_AFTER_TIMEOUT", "OAUTH_TIMEOUT_FIRED",
    "OAUTH_ERROR_RETURNED", "AUTH_FETCH_STARTED", "AUTH_FETCH_RESPONDED", "AUTH_FETCH_REJECTED",
    "REDIRECT_ATTEMPTED", "REDIRECT_ASSIGN_FAILED", "REDIRECT_NO_PAGEHIDE_AFTER_3000MS",
    "REDIRECT_BLOCKED_CALLBACK_MISMATCH", "PAGEHIDE", "JAVASCRIPT_ERROR", "UNHANDLED_REJECTION",
    "DIAGNOSTIC_COPIED", "DIAGNOSTIC_CLEARED"
  ];
  var storageAvailable = false;
  var memoryEvents = [];

  try {
    if (isVercelPreview && new URLSearchParams(window.location.search).get("oauth_diag") === "1") {
      window.sessionStorage.setItem(enabledKey, "1");
    }
    storageAvailable = isVercelPreview && window.sessionStorage.getItem(enabledKey) === "1";
  } catch (_) {}
  if (!storageAvailable) return;

  var startedAt = 0;
  try {
    startedAt = Number(window.sessionStorage.getItem(startedKey));
    if (!Number.isFinite(startedAt) || startedAt <= 0) {
      startedAt = Date.now();
      window.sessionStorage.setItem(startedKey, String(startedAt));
    }
  } catch (_) { startedAt = Date.now(); }

  function readEvents() {
    try {
      var parsed = JSON.parse(window.sessionStorage.getItem(eventsKey) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (event) {
        return event && allowedCodes.indexOf(event.code) !== -1 && Number.isFinite(event.elapsedMs);
      }).map(function (event) {
        var safeEvent = { elapsedMs: Math.max(0, Math.min(86400000, Math.round(event.elapsedMs))), code: event.code };
        if (Number.isFinite(event.durationMs)) safeEvent.durationMs = Math.max(0, Math.min(600000, Math.round(event.durationMs)));
        if (Number.isInteger(event.httpStatus) && event.httpStatus >= 100 && event.httpStatus <= 599) safeEvent.httpStatus = event.httpStatus;
        return safeEvent;
      });
    } catch (_) { return memoryEvents; }
  }

  function record(code, durationMs, httpStatus) {
    if (allowedCodes.indexOf(code) === -1) return;
    var event = { elapsedMs: Math.max(0, Date.now() - startedAt), code: code };
    if (Number.isFinite(durationMs)) event.durationMs = Math.max(0, Math.min(600000, Math.round(durationMs)));
    if (Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599) event.httpStatus = httpStatus;
    var events = readEvents();
    events.push(event);
    memoryEvents = events.slice(-80);
    try { window.sessionStorage.setItem(eventsKey, JSON.stringify(memoryEvents)); } catch (_) {}
    window.dispatchEvent(new Event("crm-oauth-diagnostic-update"));
  }

  window.__CRM_OAUTH_DIAGNOSTICS__ = {
    enabled: true,
    version: version,
    navigationStarted: false,
    record: record,
    read: readEvents,
    clear: function () {
      startedAt = Date.now();
      try { window.sessionStorage.setItem(startedKey, String(startedAt)); } catch (_) {}
      memoryEvents = [];
      try { window.sessionStorage.removeItem(eventsKey); } catch (_) {}
      window.dispatchEvent(new Event("crm-oauth-diagnostic-update"));
    }
  };

  window.onerror = function () {
    record("JAVASCRIPT_ERROR");
    return true;
  };
  window.addEventListener("unhandledrejection", function (event) {
    record("UNHANDLED_REJECTION");
    if (event && event.cancelable) event.preventDefault();
  });
  window.addEventListener("pagehide", function () {
    window.__CRM_OAUTH_DIAGNOSTICS__.navigationStarted = true;
    record("PAGEHIDE");
  });
  record("DIAGNOSTIC_LOADED");
})();
</script>
`;
  html = html.replace("</head>", `${oauthDiagnosticBootstrap}</head>`);
}

await writeFile(indexPath, html);
