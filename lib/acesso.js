/* Acesso por usuário: cada pessoa tem usuário e senha (criados pelo administrador) e fica presa a 1 celular.
   O que cada um vê vem do servidor (planilha "Entregas de Brita", aba Usuarios). Sem internet, vale o último liberado.
   Enquanto o administrador não ligar "Exigir login", o app funciona como antes. */
(function () {
  "use strict";
  const J = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const S = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const srv = () => { try { return localStorage.getItem("brita_servidor") || window.BRITA_SERVIDOR || ""; } catch (e) { return window.BRITA_SERVIDOR || ""; } };
  function aparelho() { let a = J("aparelho_id", ""); if (!a) { a = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); S("aparelho_id", a); } return a; }
  function nomeAparelho() { const m = /Android[^;)]*;\s*([^;)]+)/.exec(navigator.userAgent); return (m ? m[1] : /iPhone/.test(navigator.userAgent) ? "iPhone" : "Computador").trim().slice(0, 40); }
  async function post(o, ms) {
    const s = srv(); if (!s) throw new Error("Servidor não configurado.");
    const c = new AbortController(), t = setTimeout(() => c.abort(), ms || 20000);
    try { const r = await fetch(s, { method: "POST", body: JSON.stringify(o), signal: c.signal }); const j = await r.json(); if (!j.ok) throw new Error(j.erro || "Erro no servidor."); return j; }
    finally { clearTimeout(t); }
  }
  /* avisa a página que o acesso mudou (entrou, foi bloqueado, perdeu os mapas) */
  function mudou() { try { window.dispatchEvent(new Event("acesso-mudou")); } catch (e) {} }
  /* bloqueado ou sem permissão de mapas: apaga deste celular as cópias dos mapas oficiais que foram para Meus mapas */
  function limparOficiais() {
    try { const q = indexedDB.open("meusmapas"); q.onsuccess = () => { const db = q.result; if (!db.objectStoreNames.contains("mapas")) return;
      const st = db.transaction("mapas", "readwrite").objectStore("mapas"); const g = st.getAll();
      g.onsuccess = () => (g.result || []).forEach(m => { if (m && (m.oficial || String(m.hash || "").startsWith("oficial:"))) st.delete(m.id); }); }; } catch (e) {}
    try { caches.keys().then(ks => ks.filter(k => /^camadas/.test(k)).forEach(k => caches.delete(k))); } catch (e) {}
  }
  const ACESSO = {
    get sessao() { return J("acesso", null); },
    get exigir() { return !!J("acesso_exigir", false); },
    pode(k) { const s = this.sessao; if (!s) return !this.exigir; if (s.papel === "admin") return true; return !!(s.perms && s.perms[k]); },
    sair() { S("acesso", null); try { localStorage.removeItem("painel_senha"); } catch (e) {} aplicar(); if (ACESSO.exigir) tela(true); }
  };
  window.ACESSO = ACESSO;

  /* esconde o que não está liberado */
  const ALVOS = { mapas: ["#h-mapa", "#h-cam", "#h-pontos", "#h-et", "#h-fz"], meus: ["#h-meus"], painel: ["#h-painel", 'a[href*="claude.ai/artifact"]'], brita: ["#h-brita"] };
  function aplicar() {
    const s = ACESSO.sessao;
    for (const k in ALVOS) ALVOS[k].forEach(sel => document.querySelectorAll(sel).forEach(el => { el.style.display = ACESSO.pode(k) ? "" : "none"; }));
    document.querySelectorAll('.eyebrow').forEach(e => { if (/^Fazendas/.test(e.textContent)) e.style.display = ACESSO.pode("mapas") ? "" : "none"; });
    let b = document.getElementById("h-usu");
    const hw = document.querySelector("#home .hw");
    if (hw && !b) { b = document.createElement("div"); b.id = "h-usu"; hw.appendChild(b); }
    if (b) b.innerHTML = s ? `<div class="muted" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">👤 ${esc(s.nome || s.usuario)}${s.papel === "admin" ? ` · <a class="btn" href="usuarios.html" style="min-height:36px;text-decoration:none">Usuários e acessos<span id="ac-pend" style="display:none;margin-left:6px;background:#E0A100;color:#000;border-radius:999px;padding:0 8px;font-weight:800"></span></a>` : ""}<button class="btn" id="ac-sair" style="min-height:36px">Sair</button></div>`
      : `<div style="margin-top:8px"><button class="btn" id="ac-entrar" style="min-height:36px">👤 Entrar</button></div>`;
    const sa = document.getElementById("ac-sair"); if (sa) sa.onclick = () => ACESSO.sair();
    const en = document.getElementById("ac-entrar"); if (en) en.onclick = () => tela(false);
  }
  const esc = t => String(t == null ? "" : t).replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));

  /* ===== telas de entrar / cadastro (visual próprio, igual no claro e no escuro) ===== */
  const ICONE = "icones/icone-192.png";
  /* usuário: sem acento, minúsculo, espaço vira ponto (o servidor só aceita a-z 0-9 . _ -) */
  const limpaUsu = u => String(u || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "");
  function estilo() {
    if (document.getElementById("ac-css")) return;
    const c = document.createElement("style"); c.id = "ac-css";
    c.textContent = `
#ac-tela{position:fixed;inset:0;z-index:9998;overflow:auto;background:linear-gradient(180deg,#F6E7C4 0%,#F3EBDD 38%,#EEF1EA 100%);color:#1E2A20;font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
#ac-tela .ac-wrap{box-sizing:border-box;min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 18px 32px}
#ac-tela .ac-top{display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:18px;text-align:center}
#ac-tela .ac-top img{width:84px;height:84px;border-radius:22px;box-shadow:0 8px 24px rgba(70,45,20,.25)}
#ac-tela .ac-top h1{margin:0;font-size:28px;letter-spacing:-.3px;color:#2C3B25}
#ac-tela .ac-top p{margin:0;color:#6B5B45;font-size:14px}
#ac-tela form{box-sizing:border-box;width:100%;max-width:380px;background:#fff;border-radius:22px;padding:22px 18px 18px;box-shadow:0 10px 34px rgba(60,45,25,.14);display:grid;gap:14px}
#ac-tela h2{margin:0 0 2px;font-size:21px;color:#2C3B25}
#ac-tela .ac-sub{margin:-6px 0 2px;color:#6E6E66;font-size:14px}
#ac-tela label{display:grid;gap:6px;font-weight:600;font-size:14px;color:#3B4636}
#ac-tela .ac-in{position:relative}
#ac-tela input,#ac-tela select{width:100%;box-sizing:border-box;min-height:52px;border:1.5px solid #D8D3C6;border-radius:14px;padding:12px 14px;font:inherit;font-weight:500;color:#1E2A20;background:#FBFAF6;outline:none;appearance:none;-webkit-appearance:none}
#ac-tela input:focus,#ac-tela select:focus{border-color:#A4572B;background:#fff;box-shadow:0 0 0 3px rgba(164,87,43,.15)}
#ac-tela input.erro{border-color:#C0392B;background:#FFF6F5}
#ac-tela .ac-olho{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:44px;height:44px;border:0;background:transparent;border-radius:10px;font-size:20px;color:#6B6B60;cursor:pointer}
#ac-tela .ac-dica{font-weight:400;font-size:12.5px;color:#7A7A70}
#ac-tela .ac-dica b{color:#A4572B}
#ac-tela .ac-pri{min-height:54px;border:0;border-radius:14px;background:#A4572B;color:#fff;font:inherit;font-weight:700;font-size:17px;cursor:pointer;box-shadow:0 4px 12px rgba(164,87,43,.3)}
#ac-tela .ac-pri:disabled{opacity:.6}
#ac-tela .ac-sec{min-height:48px;border:1.5px solid #D8D3C6;border-radius:14px;background:#fff;color:#2C3B25;font:inherit;font-weight:600;cursor:pointer}
#ac-tela .ac-link{border:0;background:none;color:#A4572B;font:inherit;font-weight:600;padding:8px;cursor:pointer}
#ac-tela .ac-linha{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
#ac-tela .ac-msg{min-height:0;font-size:14px;border-radius:12px;padding:0}
#ac-tela .ac-msg.on{padding:10px 12px}
#ac-tela .ac-msg.erro{background:#FDECEA;color:#9E2A1E}
#ac-tela .ac-msg.ok{background:#EAF5E6;color:#2E6B22}
#ac-tela .ac-msg.info{background:#F3EFE6;color:#5C5242}
#ac-tela .ac-rodape{margin-top:16px;color:#8A8070;font-size:12.5px;text-align:center;max-width:380px}`;
    document.head.appendChild(c);
  }
  const OLHO = `<button type="button" class="ac-olho" aria-label="Mostrar a senha">👁</button>`;
  function moldura(corpo) {
    estilo();
    let d = document.getElementById("ac-tela"); if (d) d.remove();
    d = document.createElement("div"); d.id = "ac-tela";
    d.innerHTML = `<div class="ac-wrap"><div class="ac-top"><img src="${ICONE}" alt=""><h1>MalhaMaps</h1><p>Estradas de terra, do mapa ao campo</p></div>
      <form novalidate>${corpo}<div class="ac-msg" id="ac-m" role="status"></div></form>
      <div class="ac-rodape">Cada usuário funciona em um celular só.</div></div>`;
    document.body.appendChild(d);
    d.querySelectorAll(".ac-olho").forEach(b => b.onclick = () => { const i = b.previousElementSibling; const mostra = i.type === "password"; i.type = mostra ? "text" : "password"; b.textContent = mostra ? "🙈" : "👁"; b.setAttribute("aria-label", mostra ? "Esconder a senha" : "Mostrar a senha"); });
    d.querySelectorAll("input").forEach(i => i.addEventListener("input", () => i.classList.remove("erro")));
    return d;
  }
  function msg(d, texto, tipo) { const m = d.querySelector("#ac-m"); m.className = "ac-msg" + (texto ? " on " + (tipo || "info") : ""); m.innerHTML = texto || ""; }
  function marcaErro(d, id) { const i = d.querySelector(id); if (i) { i.classList.add("erro"); i.focus(); } }
  const erroRede = er => er && er.name === "AbortError" ? "O servidor não respondeu. Confira a internet e tente de novo." : /Failed to fetch|NetworkError|Load failed/i.test(String(er && er.message)) ? "Sem conexão com o servidor. Confira a internet e tente de novo." : (er && er.message) || "Deu um erro. Tente de novo.";

  function tela(obrigatoria) {
    const d = moldura(`<div><h2>Entrar</h2><div class="ac-sub">Use o usuário e a senha do seu cadastro.</div></div>
      <label>Usuário<input id="ac-u" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username" placeholder="ex.: joao.silva"></label>
      <label>Senha<div class="ac-in"><input id="ac-s" type="password" autocomplete="current-password" placeholder="sua senha">${OLHO}</div></label>
      <button class="ac-pri" id="ac-ok">Entrar</button>
      <div class="ac-linha"><button type="button" class="ac-link" id="ac-cad">Primeira vez? Criar cadastro</button><button type="button" class="ac-link" id="ac-esq">Esqueci a senha</button></div>
      ${obrigatoria ? "" : `<button type="button" class="ac-sec" id="ac-x">Agora não</button>`}`);
    const x = d.querySelector("#ac-x"); if (x) x.onclick = () => d.remove();
    d.querySelector("#ac-cad").onclick = () => cadastro(obrigatoria);
    d.querySelector("#ac-esq").onclick = () => esqueci(obrigatoria);
    d.querySelector("form").onsubmit = async e => {
      e.preventDefault();
      const u = limpaUsu(d.querySelector("#ac-u").value), s = d.querySelector("#ac-s").value;
      if (!u) { msg(d, "Digite seu usuário.", "erro"); marcaErro(d, "#ac-u"); return; }
      if (!s) { msg(d, "Digite sua senha.", "erro"); marcaErro(d, "#ac-s"); return; }
      if (!navigator.onLine) { msg(d, "Para entrar a primeira vez precisa de internet.", "erro"); return; }
      const bt = d.querySelector("#ac-ok"); bt.disabled = true; msg(d, "Conferindo…", "info");
      try {
        const r = await post({ a: "entrar", usuario: u, senha: s, aparelho: aparelho(), nomeAparelho: nomeAparelho() });
        S("acesso", { usuario: r.usuario, nome: r.nome, papel: r.papel, perms: r.perms, token: r.token, em: Date.now() });
        if (r.chaveMapas) { try { localStorage.setItem("painel_senha", r.chaveMapas); } catch (x) {} }
        if (r.admin) { try { localStorage.setItem("brita_chave", JSON.stringify(s)); } catch (x) {} }
        d.remove(); aplicar(); pendentes(); mudou(); if (typeof window.aviso === "function") window.aviso("Bem-vindo, " + (r.nome || r.usuario) + ".");
      } catch (er) { bt.disabled = false; msg(d, erroRede(er), "erro"); }
    };
  }
  /* telas secundárias (cadastro, esqueci) com o mesmo visual */
  function caixa(titulo, corpo, obrigatoria, sub) {
    const d = moldura(`<div><h2>${titulo}</h2>${sub ? `<div class="ac-sub">${sub}</div>` : ""}</div>${corpo}<button type="button" class="ac-link" id="ac-volta">‹ Voltar para Entrar</button>`);
    d.querySelector("#ac-volta").onclick = () => tela(obrigatoria); return d;
  }
  const campo = (id, rot, tipo, extra, dica) => `<label>${rot}${tipo === "password" ? `<div class="ac-in"><input id="${id}" type="password" ${extra || ""}>${OLHO}</div>` : `<input id="${id}" type="${tipo || "text"}" ${extra || ""}>`}${dica ? `<span class="ac-dica" id="${id}-d">${dica}</span>` : ""}</label>`;
  function cadastro(obrigatoria) {
    const d = caixa("Criar cadastro", `
      ${campo("cd-n", "Seu nome", "text", 'autocomplete="name" placeholder="Nome e sobrenome"')}
      ${campo("cd-e", "Seu e-mail", "email", 'autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="voce@gmail.com"', "É por ele que você recupera a senha.")}
      ${campo("cd-u", "Usuário", "text", 'autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username" placeholder="ex.: joao.silva"', "Sem acento e sem espaço.")}
      ${campo("cd-s", "Senha", "password", 'autocomplete="new-password" placeholder="mínimo 6 caracteres"', "Mínimo 6 caracteres.")}
      ${campo("cd-s2", "Repita a senha", "password", 'autocomplete="new-password" placeholder="a mesma senha"')}
      <label>Sua função<select id="cd-f"><option value="tecnico">Técnico</option><option value="supervisor">Supervisor</option></select></label>
      <button class="ac-pri" id="cd-ok">Enviar cadastro</button>`, obrigatoria, "O supervisor confere e libera o seu acesso.");
    const v = id => d.querySelector(id).value;
    const du = d.querySelector("#cd-u-d"), ds = d.querySelector("#cd-s-d");
    /* mostra na hora como o usuário vai ficar e se a senha já tem o tamanho certo */
    d.querySelector("#cd-u").addEventListener("input", () => { const l = limpaUsu(v("#cd-u")); du.innerHTML = l && l !== v("#cd-u") ? `Vai ficar: <b>${esc(l)}</b>` : "Sem acento e sem espaço."; });
    d.querySelector("#cd-n").addEventListener("blur", () => { if (!v("#cd-u") && v("#cd-n").trim()) { const p = limpaUsu(v("#cd-n")).split(".").filter(Boolean); if (p.length) { d.querySelector("#cd-u").value = p.length > 1 ? p[0] + "." + p[p.length - 1] : p[0]; du.innerHTML = "Sugestão pelo seu nome. Pode trocar."; } } });
    d.querySelector("#cd-s").addEventListener("input", () => { const n = v("#cd-s").length; ds.innerHTML = n >= 6 ? "✓ Tamanho bom." : `Mínimo 6 caracteres (faltam ${6 - n}).`; });
    d.querySelector("form").onsubmit = async e => { e.preventDefault();
      const nome = v("#cd-n").trim(), email = v("#cd-e").trim().toLowerCase(), usu = limpaUsu(v("#cd-u")), s1 = v("#cd-s"), s2 = v("#cd-s2");
      if (!nome) { msg(d, "Digite seu nome.", "erro"); marcaErro(d, "#cd-n"); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg(d, "Confira o e-mail. Exemplo: voce@gmail.com", "erro"); marcaErro(d, "#cd-e"); return; }
      if (usu.length < 3 || usu.length > 30) { msg(d, "O usuário precisa ter de 3 a 30 letras ou números.", "erro"); marcaErro(d, "#cd-u"); return; }
      if (s1.length < 6) { msg(d, "A senha precisa ter pelo menos 6 caracteres.", "erro"); marcaErro(d, "#cd-s"); return; }
      if (s1 !== s2) { msg(d, "As duas senhas não estão iguais. Toque no 👁 para conferir.", "erro"); marcaErro(d, "#cd-s2"); return; }
      if (!navigator.onLine) { msg(d, "Precisa de internet para se cadastrar.", "erro"); return; }
      const bt = d.querySelector("#cd-ok"); bt.disabled = true; msg(d, "Enviando…", "info");
      try { const r = await post({ a: "cadastrar", nome, email, usuario: usu, senha: s1, funcao: v("#cd-f"), aparelho: aparelho(), nomeAparelho: nomeAparelho() });
        const ok = caixa(r.status === "ativo" ? "Cadastro feito ✓" : "Cadastro enviado ✓", `<div>${r.status === "ativo" ? "Seu acesso já está liberado." : "Agora o supervisor precisa liberar o seu acesso. Quando ele avisar, é só entrar."}</div><div class="ac-msg on info">Seu usuário: <b>${esc(usu)}</b></div><button type="button" class="ac-pri" id="ok-ent">Ir para Entrar</button>`, obrigatoria);
        ok.querySelector("#ok-ent").onclick = () => { tela(obrigatoria); const i = document.querySelector("#ac-u"); if (i) i.value = usu; };
      } catch (er) { bt.disabled = false; const t = erroRede(er);
        if (/e-mail já tem cadastro/i.test(t)) { msg(d, `Esse e-mail já tem cadastro. <button type="button" class="ac-link" id="cd-esq" style="padding:0">Recuperar a senha</button>`, "erro"); const b = d.querySelector("#cd-esq"); if (b) b.onclick = () => esqueci(obrigatoria, email); marcaErro(d, "#cd-e"); }
        else if (/usuário já existe/i.test(t)) { msg(d, "Esse usuário já existe. Escolha outro (ex.: acrescente o sobrenome).", "erro"); marcaErro(d, "#cd-u"); }
        else msg(d, t, "erro"); } };
  }
  function esqueci(obrigatoria, pre) {
    const d = caixa("Esqueci a senha", `${campo("es-q", "Seu usuário ou e-mail", "text", 'autocapitalize="none" autocorrect="off" spellcheck="false"')}
      <button class="ac-pri" id="es-ok">Mandar código</button>`, obrigatoria, "Mandamos um código de 6 números para o e-mail do cadastro.");
    if (pre) d.querySelector("#es-q").value = pre;
    d.querySelector("form").onsubmit = async e => { e.preventDefault(); const q = d.querySelector("#es-q").value.trim();
      if (!q) { msg(d, "Digite seu usuário ou e-mail.", "erro"); marcaErro(d, "#es-q"); return; }
      if (!navigator.onLine) { msg(d, "Precisa de internet.", "erro"); return; } msg(d, "Enviando…", "info");
      const quem = q.includes("@") ? q.toLowerCase() : limpaUsu(q);
      try { await post({ a: "senha_esqueci", quem });
        const d2 = caixa("Nova senha", `${campo("ns-c", "Código de 6 números", "text", 'inputmode="numeric" maxlength="6" autocomplete="one-time-code"')}
          ${campo("ns-s", "Nova senha", "password", 'autocomplete="new-password" placeholder="mínimo 6 caracteres"')}
          <button class="ac-pri">Trocar a senha</button>`, obrigatoria, "Se o cadastro existir, o código chegou no e-mail (olhe também o Spam). Vale 30 minutos.");
        d2.querySelector("form").onsubmit = async e2 => { e2.preventDefault(); const c = d2.querySelector("#ns-c").value.trim(), ns = d2.querySelector("#ns-s").value;
          if (!/^\d{6}$/.test(c)) { msg(d2, "O código tem 6 números.", "erro"); marcaErro(d2, "#ns-c"); return; }
          if (ns.length < 6) { msg(d2, "A senha precisa ter pelo menos 6 caracteres.", "erro"); marcaErro(d2, "#ns-s"); return; }
          msg(d2, "Conferindo…", "info");
          try { await post({ a: "senha_nova", quem, codigo: c, senha: ns });
            const ok = caixa("Senha trocada ✓", `<div>Pronto. Agora entre com a senha nova.</div><button type="button" class="ac-pri" id="ok-ent">Ir para Entrar</button>`, obrigatoria);
            ok.querySelector("#ok-ent").onclick = () => tela(obrigatoria);
          } catch (er) { msg(d2, erroRede(er), "erro"); } };
      } catch (er) { msg(d, erroRede(er), "erro"); } };
  }

  /* ao abrir com internet: confere se continua liberado e traz o que pode ver (uma vez por abertura) */
  async function conferir() {
    if (!navigator.onLine || !srv()) return;
    try {
      const c = await fetch(srv() + "?a=acesso_cfg", { cache: "no-store" }).then(r => r.json()); if (c && c.ok) S("acesso_exigir", !!c.exigir);
      const s = ACESSO.sessao;
      if (s && s.token) {
        const r = await post({ a: "sessao", token: s.token }, 15000);
        if (!r.valido) { S("acesso", null); try { localStorage.removeItem("painel_senha"); } catch (x) {} limparOficiais(); mudou();
          if (typeof window.aviso === "function") window.aviso(r.motivo === "bloqueado" ? "Seu acesso foi bloqueado." : r.motivo === "aparelho" ? "Seu usuário foi liberado em outro celular." : "Entre de novo com seu usuário.", 6000); }
        else { S("acesso", Object.assign({}, s, { nome: r.nome || s.nome, papel: r.papel || s.papel, perms: r.perms || s.perms }));
          if (r.chaveMapas) { try { localStorage.setItem("painel_senha", r.chaveMapas); } catch (x) {} }
          else if (r.perms && !r.perms.mapas && r.papel !== "admin") { try { localStorage.removeItem("painel_senha"); } catch (x) {} limparOficiais(); }
          mudou(); }
      }
    } catch (e) { /* sem resposta: continua com o que tinha */ }
    aplicar(); if (ACESSO.exigir && !ACESSO.sessao) tela(true);
  }
  /* administrador: mostra quantos cadastros estão esperando liberação (só quando abre o app com internet) */
  async function pendentes() { const s = ACESSO.sessao; if (!s || s.papel !== "admin" || !navigator.onLine) return; let k = ""; try { k = JSON.parse(localStorage.getItem("brita_chave") || '""'); } catch (e) {} if (!k) return;
    try { const r = await post({ a: "usuarios", chave: k }, 15000); const n = (r.usuarios || []).filter(u => u.status === "aguardando").length; const e = document.getElementById("ac-pend"); if (e) { e.textContent = n; e.style.display = n ? "inline-block" : "none"; } } catch (e) {} }
  function iniciar() { aplicar(); if (ACESSO.exigir && !ACESSO.sessao) tela(true); conferir().then(pendentes); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
  window.ACESSO_post = post; window.ACESSO_tela = tela;
})();
