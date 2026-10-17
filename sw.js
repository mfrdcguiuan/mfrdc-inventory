// Service worker: makes the site installable and keeps the app available.
// - Network-first, so staff always get the newest version when it is online.
// - If the hosting page is unavailable (for example the host has paused the site),
//   the last saved copy of the app is used instead. Data lives in Supabase and is unaffected.
// - Data requests to Supabase are never cached.
const CACHE = "mfrdc-inventory-v2";
const SHELL = ["./", "index.html", "config.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];
const SUPA_LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@";
const MARKER = "MFRDC Inventory and Borrowing System";   // present in the real index.html only

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Is this a genuine response from our app (and not a host "site not available" page)?
async function genuine(req, res) {
  if (!res) return false;
  if (res.type === "opaque") return true;            // the Supabase library from the CDN
  if (!res.ok) return false;
  const type = res.headers.get("content-type") || "";
  if (req.mode === "navigate" || type.includes("text/html")) {
    return (await res.clone().text()).includes(MARKER);
  }
  return true;
}

async function saved(req) {
  return (await caches.match(req)) ||
    (req.mode === "navigate" ? await caches.match("index.html") || await caches.match("./") : undefined);
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const ours = url.origin === self.location.origin;
  if (!ours && !req.url.startsWith(SUPA_LIB)) return;   // leave Supabase and everything else alone
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (await genuine(req, res)) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }
      return (await saved(req)) || res;                   // paused or error page: use the saved copy if we have one
    } catch (err) {
      return (await saved(req)) || Response.error();      // offline
    }
  })());
});
