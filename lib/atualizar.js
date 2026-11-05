/* ⟳ Atualizar o app: só quando a pessoa pede e confirma. Nada roda sozinho em segundo plano (não gasta bateria).
   Sem internet (ou sinal fraco) não recarrega nada: quem está navegando nos mapas guardados continua. */
(function(){
  function perguntar(){return new Promise(ok=>{const d=document.createElement("div");
    d.setAttribute("style","position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);display:grid;place-items:center;padding:20px");
    d.innerHTML='<div style="background:#262C27;color:#E8EAE4;border:1px solid #353C36;border-radius:16px;padding:18px;max-width:360px;width:100%;display:grid;gap:12px;font:15px/1.4 system-ui,sans-serif">'+
      '<b style="font-size:18px">Deseja atualizar o app?</b><div style="color:#A3AAA2;font-size:14px">Precisa de internet (de preferência Wi‑Fi). Seus mapas guardados e suas anotações continuam no celular.</div>'+
      '<button data-r="1" style="min-height:48px;border-radius:12px;border:0;background:#2E8B57;color:#fff;font-weight:700;font-size:16px">Sim, atualizar</button>'+
      '<button data-r="0" style="min-height:44px;border-radius:12px;border:1px solid #353C36;background:transparent;color:inherit;font-size:15px">Agora não</button></div>';
    d.addEventListener("click",e=>{const b=e.target.closest("[data-r]");if(b||e.target===d){d.remove();ok(!!(b&&b.dataset.r==="1"));}});document.body.appendChild(d);});}
  window.atualizarApp=async function(avisar){
    const av=avisar||(t=>{try{toast(t)}catch(e){}});
    if(!(await perguntar()))return;
    if(!navigator.onLine){av("Sem internet agora. Nada foi mudado; os mapas guardados continuam funcionando.");return;}
    av("Buscando atualização…");
    const ok=await Promise.race([fetch("manifest.webmanifest?t="+Date.now(),{cache:"no-store"}).then(r=>r.ok).catch(()=>false),new Promise(r=>setTimeout(()=>r(false),6000))]);
    if(!ok){av("Sinal fraco: não deu para buscar. Nada foi mudado.");return;}
    try{
      const reg=navigator.serviceWorker&&await navigator.serviceWorker.getRegistration();
      if(!reg){av("Já está na versão mais nova.");return;}
      await reg.update();
      let w=reg.waiting||reg.installing;
      if(!w){av("Já está na versão mais nova.");return;}
      /* espera terminar de baixar e então ativa */
      const pronto=await new Promise(r=>{const ch=()=>{if(w.state==="installed"||w.state==="activated")r(true);else if(w.state==="redundant")r(false);};ch();w.addEventListener("statechange",ch);setTimeout(()=>r(false),30000);});
      if(!pronto){av("A atualização não terminou de baixar. Nada foi mudado; tente de novo com Wi‑Fi.");return;}
      window.__atualizando=true;av("App atualizado. Abrindo a versão nova…");
      navigator.serviceWorker.addEventListener("controllerchange",()=>location.reload(),{once:true});
      (reg.waiting||w).postMessage("ativar");setTimeout(()=>location.reload(),4000);
    }catch(e){av("Não deu para atualizar agora. Nada foi mudado.");}
  };
})();
