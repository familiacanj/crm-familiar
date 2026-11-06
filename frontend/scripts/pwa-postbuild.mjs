import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const indexPath = resolve("dist", "index.html");
let html = await readFile(indexPath, "utf8");

// Capture the browser's install event before the React login screen mounts.
// The event is held only in memory and is consumed by an explicit user tap.
const installBootstrap = `
<script id="crm-install-bootstrap">
(function () {
  var state = { prompt: null, installed: false };
  window.__CRM_PWA_INSTALL__ = state;
  function notify() { window.dispatchEvent(new Event("crm-pwa-install-change")); }
  window.addEventListener("beforeinstallprompt", function (event) {
    if (typeof event.prompt !== "function") return;
    event.preventDefault();
    state.prompt = event;
    notify();
  });
  window.addEventListener("appinstalled", function () {
    state.prompt = null;
    state.installed = true;
    notify();
  });
})();
</script>`;
if (!html.includes('id="crm-install-bootstrap"')) {
  html = html.replace(/<head([^>]*)>/i, `<head$1>${installBootstrap}`);
}

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
<meta name="apple-mobile-web-app-title" content="CRM Familiar" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
`;

const startupHead = `
<link rel="preload" as="image" href="/crm-startup.gif" />
<style id="crm-startup-splash-style">
  #crm-startup-splash {
    position: fixed; inset: 0; z-index: 2147483647;
    display: flex; align-items: center; justify-content: center;
    padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom));
    box-sizing: border-box; background: #FDFBF7; opacity: 1;
    transition: opacity 220ms ease;
  }
  #crm-startup-splash > img {
    display: block; width: min(72vw, 300px); max-height: min(38vh, 240px);
    height: auto; object-fit: contain;
  }
  #crm-startup-splash.crm-startup-splash-hidden { opacity: 0; pointer-events: none; }
  #crm-startup-splash #crm-startup-recovery {
    position: absolute; inset: 0; padding: 24px; align-items: center;
    justify-content: center; flex-direction: column; gap: 16px;
    background: #FDFBF7; color: #183B2B; text-align: center;
    font: 600 16px/1.5 system-ui, sans-serif;
  }
  #crm-startup-splash.crm-startup-splash-failed > img { display: none; }
  #crm-startup-splash.crm-startup-splash-failed #crm-startup-recovery[hidden] { display: none; }
  #crm-startup-splash.crm-startup-splash-failed #crm-startup-recovery:not([hidden]) { display: flex; }
  #crm-startup-recovery button {
    border: 0; border-radius: 24px; padding: 12px 24px;
    background: #3B825C; color: white; font: 700 16px system-ui, sans-serif;
  }
  @media (prefers-reduced-motion: reduce) {
    #crm-startup-splash { transition-duration: 1ms; }
  }
</style>
<script id="crm-startup-splash-controller">
(function () {
  var settled = false;
  function getSplash() { return document.getElementById("crm-startup-splash"); }
  function removeSplash() {
    var splash = getSplash();
    if (settled || !splash) return;
    settled = true;
    splash.classList.add("crm-startup-splash-hidden");
    splash.addEventListener("transitionend", function () { splash.remove(); }, { once: true });
    setTimeout(function () { if (splash.isConnected) splash.remove(); }, 320);
  }
  function showRecovery() {
    var splash = getSplash();
    var recovery = document.getElementById("crm-startup-recovery");
    if (settled || !splash || !recovery) return;
    recovery.hidden = false;
    splash.classList.add("crm-startup-splash-failed");
    splash.setAttribute("aria-hidden", "false");
  }
  function watchImage() {
    var splash = getSplash();
    var image = splash && splash.querySelector("img");
    if (image && image.complete && image.naturalWidth === 0) showRecovery();
    else if (image) image.addEventListener("error", showRecovery, { once: true });
  }
  window.addEventListener("crm-app-ready", removeSplash, { once: true });
  window.setTimeout(showRecovery, 30000);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchImage, { once: true });
  else watchImage();
})();
</script>
`;

const startupMarkup = `
<div id="crm-startup-splash" aria-hidden="true">
  <img src="/crm-startup.gif" alt="" />
  <div id="crm-startup-recovery" hidden>
    <p>Não foi possível iniciar o CRM Familiar. Verifique sua conexão e tente novamente.</p>
    <button type="button" onclick="window.location.reload()">Tentar novamente</button>
  </div>
</div>
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

if (!html.includes('id="crm-startup-splash-style"')) {
  html = html.replace("</head>", `${startupHead}</head>`);
}

if (!html.includes('property="og:title"')) {
  html = html.replace("</head>", `${socialHead}</head>`);
}

if (!html.includes('id="crm-pwa-register"')) {
  html = html.replace("</body>", `${serviceWorkerRegistration}</body>`);
}

if (!html.includes('id="crm-startup-splash"')) {
  html = html.replace("</body>", `${startupMarkup}</body>`);
}

await writeFile(indexPath, html);
