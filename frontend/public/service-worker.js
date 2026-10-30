const CACHE_NAME = "crm-familiar-shell-v4";
const PRECACHE_URLS = ["/", "/manifest.webmanifest", "/pwa-icon-192.png", "/pwa-icon.png"];

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

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
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

  // Never cache API responses, authentication callbacks, or URLs carrying OAuth state.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("/auth") ||
    url.searchParams.has("code") ||
    url.searchParams.has("error")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            void caches.open(CACHE_NAME).then((cache) => cache.put("/", response.clone()));
          }
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  if (!isPublicStaticAsset(url.pathname)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        }
        return response;
      });
    }),
  );
});
