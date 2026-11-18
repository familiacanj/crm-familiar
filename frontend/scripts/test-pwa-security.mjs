import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");
const postbuild = await readFile(new URL("./pwa-postbuild.mjs", import.meta.url), "utf8");
const indexRoute = await readFile(new URL("../app/index.tsx", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));

assert.match(worker, /crm-familiar-shell-v7/);
assert.match(worker, /function isAuthOrApiPath/);
assert.match(worker, /pathname\.startsWith\("\/api\/"\)/);
assert.match(worker, /pathname === "\/auth"/);
assert.match(worker, /url\.search !== ""/);
assert.match(worker, /request\.headers\.has\("authorization"\)/);
assert.match(worker, /private\|no-store/);
assert.match(worker, /keys\.filter\(\(key\) => key !== CACHE_NAME\)/);
assert.match(postbuild, /updateViaCache: "none"/);
assert.match(indexRoute, /params\.report_recovery/);
assert.match(indexRoute, /pathname: "\/report-password-reset"/);
assert.match(indexRoute, /params: \{ report_recovery: recoveryNonce \}/);
assert.equal(manifest.lang, "pt-BR");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "/");
assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));

console.log("PWA manifest, update invalidation, private-response cache, and recovery redirect checks passed.");
