/* Botão ⟳ Atualizar: busca a versão nova do app (com internet) e recarrega. */
window.atualizarApp=async function(avisar){
  const av=avisar||(t=>alert(t));
  if(!navigator.onLine){av("Sem internet agora. Com Wi‑Fi ou dados, toque de novo.");return;}
  av("Buscando atualização…");
  try{
    const reg=navigator.serviceWorker&&await navigator.serviceWorker.getRegistration();
    if(reg){await reg.update();
      const w=reg.installing||reg.waiting;
      if(w){await new Promise(ok=>{if(w.state==="activated")return ok();w.addEventListener("statechange",()=>{if(w.state==="activated")ok();});setTimeout(ok,15000);});
        av("App atualizado. Abrindo a versão nova…");setTimeout(()=>location.reload(),600);return;}}
    /* sem versão nova do app: recarrega mesmo assim para pegar a situação dos trechos mais recente */
    av("Já está na versão mais nova. Atualizando os dados…");setTimeout(()=>location.reload(),900);
  }catch(e){av("Não consegui atualizar agora. Tente de novo.");}
};
