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
      navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(function () {});
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

await writeFile(indexPath, html);
