/* Estradas Sucuriú – funciona sem internet.
   O app e os mapas ficam guardados no celular. Com sinal, busca a versão nova sozinho. */
const VERSAO="v1-2026-10-08c";
const ARQS=["./","index.html","manifest.webmanifest","dados/mapas.json","icones/icone-192.png","icones/icone-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(VERSAO).then(c=>c.addAll(ARQS)));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSAO).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("message",e=>{if(e.data==="ativar")self.skipWaiting();});
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method!=="GET"||u.origin!==location.origin)return;
  /* mapas: rede quando tiver (com limite de tempo), senão o que está guardado */
  if(u.pathname.endsWith("/dados/mapas.json")){
    e.respondWith((async()=>{const c=await caches.open(VERSAO);
      try{const r=await Promise.race([fetch(e.request,{cache:"no-store"}),new Promise((_,x)=>setTimeout(()=>x(0),6000))]);if(r&&r.ok){c.put("dados/mapas.json",r.clone());return r;}}catch(x){}
      return (await c.match("dados/mapas.json"))||Response.error();})());return;}
  /* app: o que está guardado primeiro (abre na hora, sem sinal) */
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).catch(()=>caches.match("index.html"))));
});
