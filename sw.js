const CACHE_NAME="notora-shell-v6";
const APP_SHELL=["/","/index.html","/styles.css?v=6","/app.js?v=6","/manifest.json","/icon.svg","/offline.html","/data/catalog/universities.json","/data/catalog/programs.json","/data/catalog/offers.json"];
self.addEventListener("install",(event)=>{event.waitUntil(caches.open(CACHE_NAME).then((cache)=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",(event)=>{event.waitUntil(caches.keys().then((keys)=>Promise.all(keys.filter((key)=>key!==CACHE_NAME).map((key)=>caches.delete(key))).then(()=>self.clients.claim())))});
self.addEventListener("fetch",(event)=>{
  if(event.request.method!=="GET") return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;
  if(event.request.mode==="navigate"){
    event.respondWith(fetch(event.request).catch(()=>caches.match("/offline.html")));
    return;
  }
  const networkFirst =
    url.pathname === "/" ||
    url.pathname === "/index.html" ||
    url.pathname === "/app.js" ||
    url.pathname === "/styles.css" ||
    url.pathname.startsWith("/data/catalog/");
  if (networkFirst) {
    event.respondWith(
      fetch(event.request)
        .then((response)=>{
          const copy=response.clone();
          caches.open(CACHE_NAME).then((cache)=>cache.put(event.request,copy));
          return response;
        })
        .catch(()=>caches.match(event.request))
    );
    return;
  }
  event.respondWith(caches.match(event.request).then((cached)=>cached||fetch(event.request).then((response)=>{
    const copy=response.clone();
    caches.open(CACHE_NAME).then((cache)=>cache.put(event.request,copy));
    return response;
  })));
});