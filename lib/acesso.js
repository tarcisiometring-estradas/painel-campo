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
    if (b) b.innerHTML = s ? `<div class="muted" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">👤 ${esc(s.nome || s.usuario)}${s.papel === "admin" ? ` · <a class="btn" href="usuarios.html" style="min-height:36px;text-decoration:none">Usuários e acessos</a>` : ""}<button class="btn" id="ac-sair" style="min-height:36px">Sair</button></div>`
      : `<div style="margin-top:8px"><button class="btn" id="ac-entrar" style="min-height:36px">👤 Entrar</button></div>`;
    const sa = document.getElementById("ac-sair"); if (sa) sa.onclick = () => ACESSO.sair();
    const en = document.getElementById("ac-entrar"); if (en) en.onclick = () => tela(false);
  }
  const esc = t => String(t == null ? "" : t).replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));

  /* tela de entrar */
  function tela(obrigatoria) {
    let d = document.getElementById("ac-tela"); if (d) d.remove();
    d = document.createElement("div"); d.id = "ac-tela";
    d.setAttribute("style", "position:fixed;inset:0;z-index:9998;background:var(--bg,#1F2420);display:grid;place-items:center;padding:20px;overflow:auto");
    d.innerHTML = `<form style="width:100%;max-width:360px;display:grid;gap:12px;font:15px/1.4 system-ui,sans-serif;color:var(--ink,#E8EAE4)">
      <div><div class="eyebrow">Estradas · Projeto Sucuriú</div><h1 style="margin:4px 0 0">Entrar</h1></div>
      <div class="muted">Entre com seu usuário e senha. Primeira vez? Toque em Criar meu cadastro. Cada usuário funciona em um celular só.</div>
      <label style="display:grid;gap:4px;font-weight:600">Usuário<input id="ac-u" class="btn" autocapitalize="none" autocomplete="username" style="text-align:left" required></label>
      <label style="display:grid;gap:4px;font-weight:600">Senha<div style="position:relative"><input id="ac-s" class="btn" type="password" autocomplete="current-password" style="text-align:left;width:100%;padding-right:52px" required><button type="button" class="btn" id="ac-olho" aria-label="Mostrar a senha" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);min-height:36px;border:0;background:transparent">👁</button></div></label>
      <button class="btn pri" style="min-height:50px">Entrar</button>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" id="ac-cad" style="flex:1">Criar meu cadastro</button><button type="button" class="btn" id="ac-esq" style="flex:1">Esqueci a senha</button></div>
      ${obrigatoria ? "" : `<button type="button" class="btn" id="ac-x">Cancelar</button>`}
      <div class="muted" id="ac-m"></div></form>`;
    document.body.appendChild(d);
    d.querySelector("#ac-olho").onclick = () => { const i = d.querySelector("#ac-s"); i.type = i.type === "password" ? "text" : "password"; };
    const x = d.querySelector("#ac-x"); if (x) x.onclick = () => d.remove();
    d.querySelector("#ac-cad").onclick = () => cadastro(obrigatoria);
    d.querySelector("#ac-esq").onclick = () => esqueci(obrigatoria);
    d.querySelector("form").onsubmit = async e => {
      e.preventDefault(); const m = d.querySelector("#ac-m");
      if (!navigator.onLine) { m.textContent = "Para entrar a primeira vez precisa de internet."; return; }
      m.textContent = "Conferindo…";
      try {
        const r = await post({ a: "entrar", usuario: d.querySelector("#ac-u").value, senha: d.querySelector("#ac-s").value, aparelho: aparelho(), nomeAparelho: nomeAparelho() });
        S("acesso", { usuario: r.usuario, nome: r.nome, papel: r.papel, perms: r.perms, token: r.token, em: Date.now() });
        if (r.chaveMapas) { try { localStorage.setItem("painel_senha", r.chaveMapas); } catch (x) {} }
        d.remove(); aplicar(); if (typeof window.aviso === "function") window.aviso("Bem-vindo, " + (r.nome || r.usuario) + ".");
      } catch (er) { m.textContent = er.name === "AbortError" ? "Sem resposta do servidor. Tente de novo." : er.message; }
    };
  }

  /* formulário simples dentro da mesma tela */
  function caixa(titulo, corpo, obrigatoria) {
    let d = document.getElementById("ac-tela"); if (d) d.remove();
    d = document.createElement("div"); d.id = "ac-tela";
    d.setAttribute("style", "position:fixed;inset:0;z-index:9998;background:var(--bg,#1F2420);display:grid;place-items:center;padding:20px;overflow:auto");
    d.innerHTML = `<form style="width:100%;max-width:360px;display:grid;gap:12px;font:15px/1.4 system-ui,sans-serif;color:var(--ink,#E8EAE4)"><div><div class="eyebrow">Estradas · Projeto Sucuriú</div><h1 style="margin:4px 0 0">${titulo}</h1></div>${corpo}
      <button type="button" class="btn" id="ac-volta">‹ Voltar para Entrar</button><div class="muted" id="ac-m"></div></form>`;
    document.body.appendChild(d); d.querySelector("#ac-volta").onclick = () => tela(obrigatoria); return d;
  }
  const campo = (id, rot, tipo, extra) => `<label style="display:grid;gap:4px;font-weight:600">${rot}<input id="${id}" class="btn" type="${tipo || "text"}" style="text-align:left" ${extra || ""}></label>`;
  function cadastro(obrigatoria) {
    const d = caixa("Criar meu cadastro", `<div class="muted">Depois de enviar, o supervisor confere e libera o seu acesso.</div>
      ${campo("cd-n", "Seu nome", "text", 'autocomplete="name" required')}
      ${campo("cd-e", "Seu e-mail (para recuperar a senha)", "email", 'autocomplete="email" required')}
      ${campo("cd-u", "Usuário (sem espaço, ex.: joao.silva)", "text", 'autocapitalize="none" autocomplete="username" required')}
      ${campo("cd-s", "Senha (mín. 6)", "password", 'autocomplete="new-password" required')}
      ${campo("cd-s2", "Repita a senha", "password", 'autocomplete="new-password" required')}
      <label style="display:grid;gap:4px;font-weight:600">Sua função<select id="cd-f" class="btn" style="text-align:left"><option value="tecnico">Técnico</option><option value="supervisor">Supervisor</option></select></label>
      <button class="btn pri" style="min-height:50px">Enviar cadastro</button>`, obrigatoria);
    d.querySelector("form").onsubmit = async e => { e.preventDefault(); const m = d.querySelector("#ac-m"); const v = id => d.querySelector(id).value;
      if (v("#cd-s") !== v("#cd-s2")) { m.textContent = "As duas senhas não são iguais."; return; }
      if (!navigator.onLine) { m.textContent = "Precisa de internet para se cadastrar."; return; }
      m.textContent = "Enviando…";
      try { const r = await post({ a: "cadastrar", nome: v("#cd-n"), email: v("#cd-e"), usuario: v("#cd-u"), senha: v("#cd-s"), funcao: v("#cd-f"), aparelho: aparelho(), nomeAparelho: nomeAparelho() });
        caixa(r.status === "ativo" ? "Cadastro feito" : "Cadastro enviado", `<div>${r.status === "ativo" ? "Seu acesso já está liberado. Volte e entre com seu usuário e senha." : "Pronto! Agora o supervisor precisa liberar o seu acesso. Quando ele avisar, volte aqui e toque em Entrar."}</div>`, obrigatoria);
      } catch (er) { m.textContent = er.name === "AbortError" ? "Sem resposta do servidor. Tente de novo." : er.message; } };
  }
  function esqueci(obrigatoria) {
    const d = caixa("Esqueci a senha", `<div class="muted">Mandamos um código de 6 números para o e-mail do seu cadastro.</div>
      ${campo("es-q", "Seu usuário ou e-mail", "text", 'autocapitalize="none" required')}
      <button class="btn pri" style="min-height:50px">Mandar código</button>`, obrigatoria);
    d.querySelector("form").onsubmit = async e => { e.preventDefault(); const m = d.querySelector("#ac-m"), q = d.querySelector("#es-q").value.trim();
      if (!navigator.onLine) { m.textContent = "Precisa de internet."; return; } m.textContent = "Enviando…";
      try { await post({ a: "senha_esqueci", quem: q });
        const d2 = caixa("Nova senha", `<div class="muted">Se o cadastro existir, o código chegou no e-mail (olhe também o Spam). Vale 30 minutos.</div>
          ${campo("ns-c", "Código de 6 números", "text", 'inputmode="numeric" maxlength="6" required')}
          ${campo("ns-s", "Nova senha (mín. 6)", "password", 'autocomplete="new-password" required')}
          <button class="btn pri" style="min-height:50px">Trocar a senha</button>`, obrigatoria);
        d2.querySelector("form").onsubmit = async e2 => { e2.preventDefault(); const m2 = d2.querySelector("#ac-m"); m2.textContent = "Conferindo…";
          try { await post({ a: "senha_nova", quem: q, codigo: d2.querySelector("#ns-c").value, senha: d2.querySelector("#ns-s").value });
            caixa("Senha trocada", `<div>Pronto. Volte e entre com a senha nova.</div>`, obrigatoria); } catch (er) { m2.textContent = er.message; } };
      } catch (er) { m.textContent = er.message; } };
  }

  /* ao abrir com internet: confere se continua liberado e traz o que pode ver (uma vez por abertura) */
  async function conferir() {
    if (!navigator.onLine || !srv()) return;
    try {
      const c = await fetch(srv() + "?a=acesso_cfg", { cache: "no-store" }).then(r => r.json()); if (c && c.ok) S("acesso_exigir", !!c.exigir);
      const s = ACESSO.sessao;
      if (s && s.token) {
        const r = await post({ a: "sessao", token: s.token }, 15000);
        if (!r.valido) { S("acesso", null); try { localStorage.removeItem("painel_senha"); } catch (x) {}
          if (typeof window.aviso === "function") window.aviso(r.motivo === "bloqueado" ? "Seu acesso foi bloqueado." : r.motivo === "aparelho" ? "Seu usuário foi liberado em outro celular." : "Entre de novo com seu usuário.", 6000); }
        else { S("acesso", Object.assign({}, s, { nome: r.nome || s.nome, papel: r.papel || s.papel, perms: r.perms || s.perms })); if (r.chaveMapas) { try { localStorage.setItem("painel_senha", r.chaveMapas); } catch (x) {} } }
      }
    } catch (e) { /* sem resposta: continua com o que tinha */ }
    aplicar(); if (ACESSO.exigir && !ACESSO.sessao) tela(true);
  }
  function iniciar() { aplicar(); if (ACESSO.exigir && !ACESSO.sessao) tela(true); conferir(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
  window.ACESSO_post = post;
})();
