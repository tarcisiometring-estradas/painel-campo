/* Botão ⟳ Atualizar: só troca de página se houver versão nova E internet de verdade.
   Sem internet (ou sinal fraco) não recarrega nada: quem está navegando nos mapas guardados continua. */
window.atualizarApp=async function(avisar){
  const av=avisar||(t=>{try{toast(t)}catch(e){}});
  if(!navigator.onLine){av("Sem internet agora. Nada foi mudado; os mapas guardados continuam funcionando.");return;}
  av("Buscando atualização…");
  /* confere se a internet responde mesmo (até 6 s) */
  const ok=await Promise.race([fetch("manifest.webmanifest?t="+Date.now(),{cache:"no-store"}).then(r=>r.ok).catch(()=>false),new Promise(r=>setTimeout(()=>r(false),6000))]);
  if(!ok){av("Sinal fraco: não deu para buscar. Nada foi mudado.");return;}
  try{
    const reg=navigator.serviceWorker&&await navigator.serviceWorker.getRegistration();
    if(!reg){av("Já está na versão mais nova.");return;}
    await reg.update();
    const w=reg.installing||reg.waiting;
    if(!w){av("Já está na versão mais nova.");return;}
    const pronto=await new Promise(r=>{if(w.state==="activated")return r(true);w.addEventListener("statechange",()=>{if(w.state==="activated")r(true);if(w.state==="redundant")r(false);});setTimeout(()=>r(false),20000);});
    if(!pronto){av("A atualização não terminou de baixar. Nada foi mudado; tente de novo com Wi‑Fi.");return;}
    window.__atualizando=true;av("App atualizado. Abrindo a versão nova…");setTimeout(()=>location.reload(),600);
  }catch(e){av("Não deu para atualizar agora. Nada foi mudado.");}
};
