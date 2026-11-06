const CACHE_NAME = "crm-familiar-shell-v5";
const PRECACHE_URLS = ["/", "/manifest.webmanifest", "/pwa-icon-192.png", "/pwa-icon.png"];
const PRODUCTION_VERCEL_HOSTS = new Set([
  "crm-familiar-web.vercel.app",
  "crm-familiar.vercel.app",
]);

const OFFLINE_HTML = `<!doctype html>
<html lang="pt-BR">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sem conexão — CRM Familiar</title>
  <body style="font:16px system-ui,sans-serif;padding:2rem;color:#173d2b">
    <h1>Sem conexão</h1>
    <p>Não foi possível carregar o CRM Familiar. Verifique sua conexão e tente novamente.</p>
  </body>
</html>`;

function isVercelPreviewHost() {
  const hostname = self.location.hostname.toLowerCase();
  return hostname.endsWith(".vercel.app") && !PRODUCTION_VERCEL_HOSTS.has(hostname);
}

function isAuthOrApiPath(pathname) {
  return (
    pathname.startsWith("/api/") ||
    pathname === "/api" ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/")
  );
}

function isPublicStaticAsset(pathname) {
  return (
    pathname === "/" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/pwa-icon-192.png" ||
    pathname === "/pwa-icon.png" ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/_expo/") ||
    pathname.startsWith("/assets/")
  );
}

function isCacheableResponse(response, requestUrl) {
  if (!response || !response.ok || response.bodyUsed || response.redirected || response.type !== "basic") {
    return false;
  }

  try {
    const finalUrl = response.url ? new URL(response.url) : new URL(requestUrl);
    if (finalUrl.origin !== self.location.origin) return false;
  } catch {
    return false;
  }

  const cacheControl = response.headers.get("cache-control") || "";
  return !/(?:^|[,\s])(?:private|no-store)(?:$|[,\s])/i.test(cacheControl);
}

async function cacheResponseSafely(cacheKey, response, requestUrl) {
  if (!isCacheableResponse(response, requestUrl)) return;

  // Clone synchronously, before awaiting Cache Storage or returning the original
  // response to the browser. Cache failures must not fail the network response.
  let cacheCopy;
  try {
    cacheCopy = response.clone();
  } catch {
    return;
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(cacheKey, cacheCopy);
  } catch {
    // Caching is opportunistic; a successful network response remains usable.
  }
}

function registerCacheLifetime(event) {
  let resolveLifetime;
  let finished = false;
  const lifetime = new Promise((resolve) => {
    resolveLifetime = resolve;
  });
  event.waitUntil(lifetime);

  return () => {
    if (finished) return;
    finished = true;
    resolveLifetime();
  };
}

function cacheResponseInBackground(cacheKey, response, requestUrl, finishCacheLifetime) {
  if (!isCacheableResponse(response, requestUrl)) {
    finishCacheLifetime();
    return;
  }

  // Clone before returning the network response. The write can then finish
  // asynchronously without reading a body the browser has already consumed.
  let cacheCopy;
  try {
    cacheCopy = response.clone();
  } catch {
    finishCacheLifetime();
    return;
  }

  let settled = false;
  const finishOnce = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutId);
    finishCacheLifetime();
  };
  const timeoutId = setTimeout(finishOnce, 1000);

  try {
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.put(cacheKey, cacheCopy))
      .then(finishOnce, finishOnce);
  } catch {
    finishOnce();
  }
}

async function cachedResponse(cacheKey) {
  try {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(cacheKey);
  } catch {
    return undefined;
  }
}

function offlineNavigationResponse() {
  return new Response(OFFLINE_HTML, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function offlineAssetResponse() {
  return new Response("Recurso indisponível sem conexão.", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // Vercel preview URLs are protected by the platform. Do not precache their
      // SSO redirects or interfere with share-link and team-auth requests.
      if (!isVercelPreviewHost()) {
        await Promise.all(
          PRECACHE_URLS.map(async (pathname) => {
            const requestUrl = new URL(pathname, self.location.origin).href;
            try {
              const response = await fetch(new Request(requestUrl, { cache: "reload" }));
              await cacheResponseSafely(pathname, response, requestUrl);
            } catch {
              // A missing/offline asset must not prevent the worker from installing.
            }
          }),
        );
      }

      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Let Vercel handle preview protection normally. Also leave auth/API paths,
  // query-bearing URLs (OAuth state, invite tokens, share links), and explicit
  // Authorization requests completely outside the public asset cache.
  if (
    isVercelPreviewHost() ||
    isAuthOrApiPath(url.pathname) ||
    url.search !== "" ||
    request.headers.has("authorization")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    const finishCacheLifetime = registerCacheLifetime(event);
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          cacheResponseInBackground("/", response, request.url, finishCacheLifetime);
          return response;
        } catch {
          finishCacheLifetime();
          return (await cachedResponse("/")) || offlineNavigationResponse();
        }
      })(),
    );
    return;
  }

  if (!isPublicStaticAsset(url.pathname)) return;

  const finishCacheLifetime = registerCacheLifetime(event);
  event.respondWith(
    (async () => {
      const cached = await cachedResponse(request);
      if (cached) {
        finishCacheLifetime();
        return cached;
      }

      try {
        const response = await fetch(request);
        cacheResponseInBackground(request, response, request.url, finishCacheLifetime);
        return response;
      } catch {
        finishCacheLifetime();
        return offlineAssetResponse();
      }
    })(),
  );
});
