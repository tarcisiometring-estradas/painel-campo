/* Entrega de Brita – abre sem sinal. Com sinal, busca a versão nova. */
const VERSAO="brita-v1-2026-10-23";
const ARQS=["./","index.html","comum.js","config.js","manifest.webmanifest","icone-192.png","icone-512.png"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(VERSAO).then(c=>c.addAll(ARQS.map(u=>new Request(u,{cache:"reload"})))));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("brita-")&&k!==VERSAO).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method!=="GET"||u.origin!==location.origin||!u.pathname.includes("/brita/"))return;
  e.respondWith((async()=>{const c=await caches.open(VERSAO);
    try{const r=await Promise.race([fetch(e.request,{cache:"no-store"}),new Promise((_,x)=>setTimeout(()=>x(0),5000))]);if(r&&r.ok){c.put(e.request,r.clone());return r;}}catch(x){}
    return (await c.match(e.request,{ignoreSearch:true}))||(e.request.mode==="navigate"?await c.match("index.html"):Response.error());})());});
