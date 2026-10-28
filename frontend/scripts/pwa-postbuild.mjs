import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const indexPath = resolve("dist", "index.html");
let html = await readFile(indexPath, "utf8");

const pwaHead = `
<meta name="theme-color" content="#3B825C" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="CRM Família" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
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

if (!html.includes('id="crm-pwa-register"')) {
  html = html.replace("</body>", `${serviceWorkerRegistration}</body>`);
}

await writeFile(indexPath, html);
