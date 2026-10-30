/* Estradas Sucuriú – funciona sem internet.
   Com internet: busca sempre a versão mais nova (app e mapas) e guarda no celular.
   Sem internet: abre o que está guardado. */
const VERSAO="v1-2026-10-30a";
const ARQS=["./","index.html","manifest.webmanifest","dados/mapas.json","dados/situacao.json","dados/rodovias/MS.json","dados/regiao.json","dados/estradas.json","painel.html","dados/painel_base.json","icones/icone-192.png","icones/icone-512.png","lib/xlsx.full.min.js","lib/jszip.min.js","lib/mapa.js"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(VERSAO).then(c=>c.addAll(ARQS.map(u=>new Request(u,{cache:"reload"})))));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSAO&&k!=="camadas-folha-2").map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("message",e=>{if(e.data==="ativar")self.skipWaiting();});
const comLimite=(p,ms)=>Promise.race([p,new Promise((_,x)=>setTimeout(()=>x(new Error("tempo")),ms))]);
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method!=="GET"||u.origin!==location.origin)return;
  /* apps separados (entrega de brita, fotos) têm o próprio controle */
  if(/\/(brita|fotos)\//.test(u.pathname))return;
  const ehPainel=u.pathname.endsWith("painel.html");
  const pagina=ehPainel||e.request.mode==="navigate"||u.pathname.endsWith("/")||u.pathname.endsWith("index.html");
  const dado=u.pathname.match(/\/dados\/(mapas|situacao|painel_base)\.json$/);
  if(pagina||dado){const chave=ehPainel?"painel.html":pagina?"index.html":"dados/"+dado[1]+".json";
    e.respondWith((async()=>{const c=await caches.open(VERSAO);
      try{const r=await comLimite(fetch(e.request,{cache:"no-store"}),pagina?4000:6000);if(r&&r.ok){c.put(chave,r.clone());return r;}}catch(x){}
      return (await c.match(chave))||(await caches.match(e.request,{ignoreSearch:true}))||Response.error();})());return;}
  /* mapas oficiais: guardados num cache próprio que sobrevive às atualizações do app; "?atualizar=" força buscar de novo */
  if(u.pathname.includes("/dados/camadas/")){const limpo=location.origin+u.pathname;e.respondWith((async()=>{const c=await caches.open("camadas-folha-2");
    if(!u.searchParams.has("atualizar")){const h=await c.match(limpo);if(h)return h;}
    const r=await fetch(limpo,{cache:"no-store"});if(r&&r.ok&&!u.searchParams.has("atualizar"))await c.put(limpo,r.clone());return r;})());return;}
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)));
});
