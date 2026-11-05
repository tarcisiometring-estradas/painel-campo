/* ============================================================
   ENTREGA DE BRITA – servidor (Google Apps Script)
   Guarda as entregas numa planilha do Google e as fotos numa pasta do Drive.
   Instalação: veja o arquivo LEIA-ME.md ao lado.
   ============================================================ */

/* >>> TROQUE pela senha da gestão (supervisor/técnico). O motorista NÃO usa senha. <<< */
var CHAVE_GESTAO = "troque-esta-senha";

/* raio padrão (m) em volta de um depósito/extensão para a carga contar como "no lugar" */
var RAIO_PADRAO = 150;

var ABA_DEP = "Depositos";
var ABA_ENT = "Entregas";
var COL_DEP = ["id", "nome", "projeto", "referencia", "lat", "lon", "raio_m", "planejado_t", "mapa", "obs", "ativo", "extensoes", "criado_em", "criado_por", "alterado_em"];
var COL_ENT = ["id", "recebido_em", "descarga_em", "motorista", "telefone", "pedreira", "placa", "nf", "toneladas",
  "lat", "lon", "precisao_m", "deposito_id", "deposito_nome", "projeto", "referencia", "escolha", "distancia_m", "alerta",
  "obs", "foto_nf", "foto_carga", "conferencia", "conf_toneladas", "conf_obs", "conf_por", "conf_em"];

/* ---------------- entrada ---------------- */
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.a === "depositos") return json({ ok: true, depositos: lerDepositos(), em: new Date().toISOString() });
    if (p.a === "entregas") { exigirChave(p.chave); return json({ ok: true, entregas: lerEntregas(p.de, p.ate) }); }
    if (p.a === "teste") return json({ ok: true, msg: "Servidor da entrega de brita funcionando." });
    if (p.a === "acesso_cfg") return json({ ok: true, exigir: prop("EXIGIR_LOGIN") === "1" });
    return json({ ok: false, erro: "acao desconhecida" });
  } catch (x) { return json({ ok: false, erro: String(x.message || x) }); }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    var d = JSON.parse(e.postData.contents);
    if (d.a === "entrega") return json(salvarEntrega(d));
    if (d.a === "entrar") return json(entrar(d));
    if (d.a === "cadastrar") return json(cadastrar(d));
    if (d.a === "senha_esqueci") return json(senhaEsqueci(d));
    if (d.a === "senha_nova") return json(senhaNova(d));
    if (d.a === "sessao") return json(sessao(d));
    if (d.a === "usuarios") { exigirChave(d.chave); return json(listarUsuarios()); }
    if (d.a === "usuario_salvar") { exigirChave(d.chave); return json(salvarUsuario(d.u)); }
    if (d.a === "aparelho_liberar") { exigirChave(d.chave); return json(liberarAparelho(d.usuario)); }
    if (d.a === "acesso_config") { exigirChave(d.chave); return json(salvarConfigAcesso(d)); }
    exigirChave(d.chave);
    if (d.a === "deposito") return json(salvarDeposito(d.dep, d.por));
    if (d.a === "extensao") return json(addExtensao(d.id, d.ext, d.por));
    if (d.a === "conferir") return json(conferir(d));
    if (d.a === "vincular") return json(vincular(d));
    if (d.a === "chave") return json({ ok: true });
    return json({ ok: false, erro: "acao desconhecida" });
  } catch (x) {
    return json({ ok: false, erro: String(x.message || x) });
  } finally { try { lock.releaseLock(); } catch (y) {} }
}

/* ---------------- planilha ---------------- */
function planilha() { return SpreadsheetApp.getActiveSpreadsheet(); }
function aba(nome, cols) {
  var ss = planilha(), sh = ss.getSheetByName(nome);
  if (!sh) { sh = ss.insertSheet(nome); sh.appendRow(cols); sh.setFrozenRows(1); sh.getRange(1, 1, 1, cols.length).setFontWeight("bold"); }
  return sh;
}
function linhas(sh, cols) {
  var v = sh.getDataRange().getValues(); var out = [];
  for (var i = 1; i < v.length; i++) { var o = { _linha: i + 1 }; for (var j = 0; j < cols.length; j++) o[cols[j]] = v[i][j]; if (o.id !== "") out.push(o); }
  return out;
}
function gravar(sh, cols, linha, o) {
  var row = cols.map(function (c) { return o[c] === undefined || o[c] === null ? "" : o[c]; });
  if (linha) sh.getRange(linha, 1, 1, cols.length).setValues([row]); else sh.appendRow(row);
}

/* ---------------- depósitos ---------------- */
function lerDepositos() {
  return linhas(aba(ABA_DEP, COL_DEP), COL_DEP).map(function (o) {
    var ext = []; try { ext = o.extensoes ? JSON.parse(o.extensoes) : []; } catch (x) {}
    return { id: String(o.id), nome: String(o.nome), projeto: String(o.projeto), referencia: String(o.referencia),
      lat: +o.lat, lon: +o.lon, raio_m: +o.raio_m || RAIO_PADRAO, planejado_t: +o.planejado_t || 0, mapa: String(o.mapa),
      obs: String(o.obs), ativo: o.ativo !== false && String(o.ativo).toUpperCase() !== "NAO" && String(o.ativo).toUpperCase() !== "FALSE", extensoes: ext };
  });
}
function proximoId(lista) {
  var n = 0; lista.forEach(function (d) { var m = /^D(\d+)$/i.exec(d.id); if (m) n = Math.max(n, +m[1]); });
  return "D" + (n + 1);
}
function salvarDeposito(dep, por) {
  if (!dep || !isFinite(+dep.lat) || !isFinite(+dep.lon)) throw new Error("coordenada do depósito faltando");
  var sh = aba(ABA_DEP, COL_DEP), L = linhas(sh, COL_DEP), agora = new Date().toISOString();
  var atual = dep.id ? L.filter(function (o) { return String(o.id) === String(dep.id); })[0] : null;
  var o = atual || { id: proximoId(L), criado_em: agora, criado_por: por || "", extensoes: "[]", ativo: "SIM" };
  ["nome", "projeto", "referencia", "lat", "lon", "raio_m", "planejado_t", "mapa", "obs"].forEach(function (k) { if (dep[k] !== undefined) o[k] = dep[k]; });
  if (dep.ativo !== undefined) o.ativo = dep.ativo ? "SIM" : "NAO";
  if (dep.extensoes) o.extensoes = JSON.stringify(dep.extensoes);
  if (!o.nome) o.nome = o.id;
  if (!o.raio_m) o.raio_m = RAIO_PADRAO;
  o.alterado_em = agora;
  gravar(sh, COL_DEP, atual ? atual._linha : 0, o);
  return { ok: true, id: o.id, depositos: lerDepositos() };
}
function addExtensao(id, ext, por) {
  var D = lerDepositos().filter(function (d) { return d.id === id; })[0];
  if (!D) throw new Error("depósito " + id + " não existe");
  var letra = String.fromCharCode(66 + D.extensoes.length); /* B, C, D... (A é o ponto original) */
  D.extensoes.push({ nome: ext.nome || (D.id + "-" + letra), lat: +ext.lat, lon: +ext.lon, em: new Date().toISOString(), por: por || "" });
  return salvarDeposito({ id: id, extensoes: D.extensoes }, por);
}

/* qual depósito fica mais perto (considerando as extensões) */
function maisPerto(lat, lon, deps) {
  var best = null;
  deps.forEach(function (d) {
    if (!d.ativo) return;
    var pts = [{ lat: d.lat, lon: d.lon }].concat(d.extensoes || []);
    pts.forEach(function (p) { var m = distancia(lat, lon, +p.lat, +p.lon); if (!best || m < best.m) best = { d: d, m: m }; });
  });
  return best;
}
function distanciaAoDeposito(lat, lon, d) {
  var pts = [{ lat: d.lat, lon: d.lon }].concat(d.extensoes || []), m = Infinity;
  pts.forEach(function (p) { m = Math.min(m, distancia(lat, lon, +p.lat, +p.lon)); });
  return m;
}
function distancia(a1, o1, a2, o2) {
  var R = 6371008.8, r = Math.PI / 180, p1 = a1 * r, p2 = a2 * r, dp = p2 - p1, dl = (o2 - o1) * r;
  return 2 * R * Math.asin(Math.sqrt(Math.pow(Math.sin(dp / 2), 2) + Math.cos(p1) * Math.cos(p2) * Math.pow(Math.sin(dl / 2), 2)));
}

/* ---------------- entregas ---------------- */
function salvarEntrega(d) {
  if (!d.id) throw new Error("entrega sem id");
  if (!(+d.toneladas > 0)) throw new Error("toneladas faltando");
  var sh = aba(ABA_ENT, COL_ENT);
  var ja = linhas(sh, COL_ENT).filter(function (o) { return String(o.id) === String(d.id); })[0];
  if (ja) return { ok: true, id: d.id, repetida: true }; /* já recebida antes (o celular reenviou) */

  var deps = lerDepositos(), dep = d.deposito_id ? deps.filter(function (x) { return x.id === d.deposito_id; })[0] : null;
  /* motorista descarregou num lugar sem depósito (desvio, emergência…): cria depósito PROVISÓRIO ali, ou usa um provisório a menos de 150 m */
  var novoDep = false;
  if (!dep && d.escolha === "novo" && isFinite(+d.lat) && isFinite(+d.lon)) {
    var prov = deps.filter(function (x) { return /^PROVIS/i.test(x.obs) && distanciaAoDeposito(+d.lat, +d.lon, x) < RAIO_PADRAO; })[0];
    if (prov) dep = prov;
    else {
      var nv = d.novo || {};
      var r = salvarDeposito({ nome: "Provisório – " + (nv.motivo || "lugar novo"), projeto: "", referencia: "", lat: +d.lat, lon: +d.lon,
        obs: "PROVISÓRIO – criado pelo motorista " + (d.motorista || "") + " (" + (d.placa || "") + "). Motivo: " + (nv.motivo || "") + ". Mandou: " + (nv.quem || "") + ". Aprovar ou vincular na gestão." }, "motorista " + (d.placa || ""));
      dep = r.depositos.filter(function (x) { return x.id === r.id; })[0]; novoDep = true;
    }
  }
  var lat = +d.lat, lon = +d.lon, temGps = isFinite(lat) && isFinite(lon) && (lat || lon);
  var dist = dep && temGps ? distanciaAoDeposito(lat, lon, dep) : "";
  var alerta = [];
  if (!temGps) alerta.push("sem GPS");
  if (dep && temGps && dist > (dep.raio_m || RAIO_PADRAO)) alerta.push("longe do " + dep.id + " (" + Math.round(dist) + " m)");
  if (!dep) alerta.push("sem depósito – conferir");
  if (d.escolha === "novo") alerta.push((novoDep ? "depósito novo criado pelo motorista" : "lugar provisório") + " – aprovar (" + ((d.novo && d.novo.motivo) || "") + ", mandou: " + ((d.novo && d.novo.quem) || "?") + ")");
  if (+d.precisao_m > 50) alerta.push("GPS fraco (±" + Math.round(+d.precisao_m) + " m)");
  var nfRep = d.nf ? linhas(sh, COL_ENT).filter(function (o) { return String(o.nf) === String(d.nf) && String(o.pedreira) === String(d.pedreira); })[0] : null;
  if (nfRep) alerta.push("NF repetida (já entregue em " + Utilities.formatDate(new Date(nfRep.descarga_em), "America/Campo_Grande", "dd/MM HH:mm") + ")");

  var pasta = pastaDoMes(d.descarga_em);
  var base = (d.descarga_em || new Date().toISOString()).slice(0, 10) + "_" + (d.placa || "placa") + "_" + d.id;
  var fNf = d.foto_nf ? salvarFoto(pasta, d.foto_nf, base + "_NF.jpg") : "";
  var fCg = d.foto_carga ? salvarFoto(pasta, d.foto_carga, base + "_carga.jpg") : "";

  gravar(sh, COL_ENT, 0, {
    id: d.id, recebido_em: new Date().toISOString(), descarga_em: d.descarga_em || "", motorista: d.motorista || "", telefone: d.telefone || "",
    pedreira: d.pedreira || "", placa: String(d.placa || "").toUpperCase(), nf: d.nf || "", toneladas: +d.toneladas,
    lat: temGps ? lat : "", lon: temGps ? lon : "", precisao_m: d.precisao_m ? Math.round(+d.precisao_m) : "",
    deposito_id: dep ? dep.id : "", deposito_nome: dep ? dep.nome : "", projeto: dep ? dep.projeto : "", referencia: dep ? dep.referencia : "",
    escolha: d.escolha || "", distancia_m: dist === "" ? "" : Math.round(dist), alerta: alerta.join("; "), obs: d.obs || "",
    foto_nf: fNf, foto_carga: fCg, conferencia: "", conf_toneladas: "", conf_obs: "", conf_por: "", conf_em: ""
  });
  return { ok: true, id: d.id, alerta: alerta.join("; ") };
}
function pastaDoMes(iso) {
  var raiz = pastaRaiz(), mes = (iso || new Date().toISOString()).slice(0, 7);
  var it = raiz.getFoldersByName(mes); return it.hasNext() ? it.next() : raiz.createFolder(mes);
}
function pastaRaiz() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty("PASTA");
  if (id) { try { return DriveApp.getFolderById(id); } catch (x) {} }
  var f = DriveApp.createFolder("Entregas de brita – fotos"); props.setProperty("PASTA", f.getId()); return f;
}
function salvarFoto(pasta, dataUrl, nome) {
  var b64 = String(dataUrl).replace(/^data:[^,]+,/, "");
  var f = pasta.createFile(Utilities.newBlob(Utilities.base64Decode(b64), "image/jpeg", nome));
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (x) {}
  return f.getId();
}
function lerEntregas(de, ate) {
  var L = linhas(aba(ABA_ENT, COL_ENT), COL_ENT);
  return L.filter(function (o) {
    var dia = String(o.descarga_em instanceof Date ? o.descarga_em.toISOString() : o.descarga_em).slice(0, 10);
    return (!de || dia >= de) && (!ate || dia <= ate);
  }).map(function (o) { delete o._linha; ["recebido_em", "descarga_em", "conf_em"].forEach(function (k) { if (o[k] instanceof Date) o[k] = o[k].toISOString(); }); return o; });
}
function acharEntrega(id) {
  var sh = aba(ABA_ENT, COL_ENT), o = linhas(sh, COL_ENT).filter(function (x) { return String(x.id) === String(id); })[0];
  if (!o) throw new Error("entrega não encontrada"); return { sh: sh, o: o };
}
/* técnico confere a carga no campo */
function conferir(d) {
  var r = acharEntrega(d.id), o = r.o;
  o.conferencia = d.status || ""; o.conf_toneladas = d.toneladas === undefined || d.toneladas === "" ? "" : +d.toneladas;
  o.conf_obs = d.obs || ""; o.conf_por = d.por || ""; o.conf_em = new Date().toISOString();
  gravar(r.sh, COL_ENT, o._linha, o); return { ok: true };
}
/* carga que caiu fora: o técnico diz a qual depósito ela pertence (e, se quiser, vira extensão) */
function vincular(d) {
  var r = acharEntrega(d.id), o = r.o, deps = lerDepositos(), dep = deps.filter(function (x) { return x.id === d.deposito_id; })[0];
  if (!dep) throw new Error("depósito não existe");
  if (d.extensao && o.lat !== "" && o.lon !== "") { addExtensao(dep.id, { lat: o.lat, lon: o.lon }, d.por); dep = lerDepositos().filter(function (x) { return x.id === dep.id; })[0]; }
  o.deposito_id = dep.id; o.deposito_nome = dep.nome; o.projeto = dep.projeto; o.referencia = dep.referencia; o.escolha = "gestão";
  if (o.lat !== "") o.distancia_m = Math.round(distanciaAoDeposito(+o.lat, +o.lon, dep));
  o.alerta = String(o.alerta || "").split("; ").filter(function (a) { return a && !/^longe do|^sem depósito/.test(a); }).concat(["vinculada ao " + dep.id + " por " + (d.por || "gestão")]).join("; ");
  gravar(r.sh, COL_ENT, o._linha, o); return { ok: true };
}

/* ---------------- utilidades ---------------- */
/* ================= usuários do app (cada um com usuário e senha; 1 celular por usuário) ================= */
var ABA_USU = "Usuarios";
var COL_USU = ["id", "nome", "papel", "salt", "hash", "perms", "aparelho", "aparelho_nome", "pedido_aparelho", "bloqueado", "criado_em", "ultimo_acesso", "email", "status", "reset_codigo", "reset_ate", "reset_tent"];
var PADRAO = { tecnico: { mapas: true, meus: true, painel: true, brita: true, depositos: true }, supervisor: { mapas: true, meus: true, painel: true, micro: true, corrigir: true, brita: true, depositos: true, rdo: true } };
/* aba de usuários sempre com todas as colunas (acrescenta as que faltarem no cabeçalho) */
function abaUsu() { var sh = aba(ABA_USU, COL_USU); var h = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  if (h.length < COL_USU.length || COL_USU.some(function (c, i) { return h[i] !== c; })) sh.getRange(1, 1, 1, COL_USU.length).setValues([COL_USU]).setFontWeight("bold"); return sh; }
function emailAdmin() { var e = prop("EMAIL_ADMIN"); if (!e) { try { e = Session.getEffectiveUser().getEmail(); if (e) setProp("EMAIL_ADMIN", e); } catch (x) {} } return e || ""; }
function mandarEmail(para, assunto, texto) { try { if (para) MailApp.sendEmail({ to: para, subject: assunto, body: texto, name: "Estradas Sucuriú" }); } catch (x) {} }
var PERMS = ["mapas", "meus", "painel", "micro", "corrigir", "brita", "depositos", "rdo"];
function prop(k) { return PropertiesService.getScriptProperties().getProperty(k) || ""; }
function setProp(k, v) { PropertiesService.getScriptProperties().setProperty(k, String(v)); }
function segredo() { var s = prop("SEGREDO"); if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); setProp("SEGREDO", s); } return s; }
function b64(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ""); }
function hashSenha(senha, salt) { var h = salt + "|" + senha; for (var i = 0; i < 300; i++) h = b64(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt)); return h; }
function assinar(txt) { return b64(Utilities.computeHmacSha256Signature(txt, segredo())); }
function normUsu(u) { return String(u || "").trim().toLowerCase().replace(/\s+/g, "."); }
function lerUsuarios() { return linhas(abaUsu(), COL_USU).filter(function (o) { return String(o.id) !== ""; }); }
function permsDe(o) { var p = {}; try { p = JSON.parse(o.perms || "{}"); } catch (x) {} return p; }
function publico(o) { return { usuario: String(o.id), nome: String(o.nome), email: String(o.email || ""), status: String(o.status || "ativo"), papel: String(o.papel || "tecnico"), perms: permsDe(o), aparelho: String(o.aparelho_nome || (o.aparelho ? "1 celular" : "")), pedido: String(o.pedido_aparelho || ""), bloqueado: String(o.bloqueado) === "SIM", ultimo: o.ultimo_acesso ? String(o.ultimo_acesso) : "" }; }
function resposta(o, aparelho) {
  var tok = String(o.id) + "|" + aparelho + "|" + Date.now();
  return { ok: true, token: tok + "." + assinar(tok), usuario: String(o.id), nome: String(o.nome), papel: String(o.papel || "tecnico"), perms: permsDe(o), chaveMapas: prop("CHAVE_MAPAS") };
}
function entrar(d) {
  var usu = normUsu(d.usuario), senha = String(d.senha || ""), ap = String(d.aparelho || "");
  if (!usu || !senha || !ap) throw new Error("Preencha usuário e senha.");
  /* administrador: usuário "admin" + senha da gestão */
  if (usu === "admin") { if (senha !== CHAVE_GESTAO) throw new Error("Usuário ou senha errados."); var a = { id: "admin", nome: "Administrador", papel: "admin", perms: JSON.stringify(PERMS.reduce(function (m, k) { m[k] = true; return m; }, {})) }; var r = resposta(a, ap); r.admin = true; return r; }
  var sh = abaUsu(), o = lerUsuarios().filter(function (x) { return String(x.id) === usu; })[0];
  if (!o || hashSenha(senha, String(o.salt)) !== String(o.hash)) throw new Error("Usuário ou senha errados.");
  if (String(o.bloqueado) === "SIM") throw new Error("Seu acesso está bloqueado. Fale com o supervisor.");
  if (String(o.status) === "aguardando") throw new Error("Seu cadastro está aguardando a liberação do supervisor.");
  if (String(o.status) === "recusado") throw new Error("Seu cadastro não foi liberado. Fale com o supervisor.");
  if (!o.aparelho) { o.aparelho = ap; o.aparelho_nome = String(d.nomeAparelho || "celular"); o.pedido_aparelho = ""; }
  else if (String(o.aparelho) !== ap) { o.pedido_aparelho = String(d.nomeAparelho || "outro celular") + " · " + new Date().toLocaleString("pt-BR"); gravar(sh, COL_USU, o._linha, o);
    throw new Error("Este usuário já está liberado em outro celular. Peça ao supervisor para liberar este aparelho."); }
  o.ultimo_acesso = new Date().toISOString(); gravar(sh, COL_USU, o._linha, o);
  return resposta(o, ap);
}
function sessao(d) {
  var t = String(d.token || ""), i = t.lastIndexOf("."); if (i < 0) return { ok: true, valido: false };
  var corpo = t.slice(0, i); if (assinar(corpo) !== t.slice(i + 1)) return { ok: true, valido: false };
  var partes = corpo.split("|"), usu = partes[0], ap = partes[1];
  if (usu === "admin") return { ok: true, valido: true, admin: true, papel: "admin", perms: PERMS.reduce(function (m, k) { m[k] = true; return m; }, {}), chaveMapas: prop("CHAVE_MAPAS"), exigir: prop("EXIGIR_LOGIN") === "1" };
  var o = lerUsuarios().filter(function (x) { return String(x.id) === usu; })[0];
  if (!o || String(o.bloqueado) === "SIM" || String(o.status) === "aguardando" || String(o.status) === "recusado" || String(o.aparelho) !== ap) return { ok: true, valido: false, motivo: !o ? "removido" : String(o.bloqueado) === "SIM" ? "bloqueado" : "aparelho" };
  return { ok: true, valido: true, nome: String(o.nome), papel: String(o.papel || "tecnico"), perms: permsDe(o), chaveMapas: prop("CHAVE_MAPAS"), exigir: prop("EXIGIR_LOGIN") === "1" };
}
function listarUsuarios() { return { ok: true, usuarios: lerUsuarios().map(publico), exigir: prop("EXIGIR_LOGIN") === "1", auto: prop("AUTO_APROVAR") === "1", temChaveMapas: !!prop("CHAVE_MAPAS"), emailAdmin: emailAdmin(), perms: PERMS }; }
/* a própria pessoa se cadastra; fica AGUARDANDO até o administrador liberar (ou libera sozinho se "liberar automático" estiver ligado) */
function cadastrar(d) {
  var usu = normUsu(d.usuario), senha = String(d.senha || ""), email = String(d.email || "").trim().toLowerCase(), papel = d.funcao === "supervisor" ? "supervisor" : "tecnico";
  if (!usu || usu === "admin" || !/^[a-z0-9._-]{3,30}$/.test(usu)) throw new Error("Usuário: de 3 a 30 letras ou números, sem espaço.");
  if (senha.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Digite um e-mail válido (é por ele que você recupera a senha).");
  if (!String(d.nome || "").trim()) throw new Error("Digite seu nome.");
  var L = lerUsuarios();
  if (L.some(function (x) { return String(x.id) === usu; })) throw new Error("Esse usuário já existe. Escolha outro.");
  if (L.some(function (x) { return String(x.email).toLowerCase() === email; })) throw new Error("Esse e-mail já tem cadastro. Use Esqueci a senha.");
  var auto = prop("AUTO_APROVAR") === "1", salt = Utilities.getUuid();
  var o = { id: usu, nome: String(d.nome).trim(), papel: papel, email: email, salt: salt, hash: hashSenha(senha, salt), perms: JSON.stringify(auto ? PADRAO[papel] : {}), status: auto ? "ativo" : "aguardando",
    aparelho: String(d.aparelho || ""), aparelho_nome: String(d.nomeAparelho || "celular"), bloqueado: "NAO", criado_em: new Date().toISOString() };
  gravar(abaUsu(), COL_USU, 0, o);
  mandarEmail(emailAdmin(), "Estradas Sucuriú: novo cadastro " + (auto ? "liberado" : "aguardando liberação"), o.nome + " (" + usu + ", " + email + ") se cadastrou como " + papel + ".\nAbra o app › Usuários e acessos para " + (auto ? "conferir." : "liberar ou recusar."));
  return { ok: true, status: o.status };
}
/* esqueci a senha: manda um código de 6 números para o e-mail cadastrado (vale 30 min, 5 tentativas) */
function senhaEsqueci(d) {
  var q = String(d.quem || "").trim().toLowerCase(), sh = abaUsu();
  var o = lerUsuarios().filter(function (x) { return String(x.id) === normUsu(q) || String(x.email).toLowerCase() === q; })[0];
  if (o && o.email) { var c = String(Math.floor(100000 + Math.random() * 900000)); o.reset_codigo = c; o.reset_ate = Date.now() + 30 * 60000; o.reset_tent = 0; gravar(sh, COL_USU, o._linha, o);
    mandarEmail(String(o.email), "Estradas Sucuriú: código para trocar a senha", "Seu código: " + c + "\nVale por 30 minutos. Seu usuário: " + o.id + "\nSe não foi você, ignore este e-mail."); }
  return { ok: true, msg: "Se o usuário existir, mandamos um código para o e-mail cadastrado." };
}
function senhaNova(d) {
  var q = String(d.quem || "").trim().toLowerCase(), sh = abaUsu();
  var o = lerUsuarios().filter(function (x) { return String(x.id) === normUsu(q) || String(x.email).toLowerCase() === q; })[0];
  if (!o || !o.reset_codigo || Date.now() > +o.reset_ate) throw new Error("Código vencido. Peça um novo.");
  if (+o.reset_tent >= 5) { o.reset_codigo = ""; gravar(sh, COL_USU, o._linha, o); throw new Error("Muitas tentativas. Peça um novo código."); }
  if (String(d.codigo || "").trim() !== String(o.reset_codigo)) { o.reset_tent = (+o.reset_tent || 0) + 1; gravar(sh, COL_USU, o._linha, o); throw new Error("Código errado."); }
  if (String(d.senha || "").length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
  o.salt = Utilities.getUuid(); o.hash = hashSenha(String(d.senha), o.salt); o.reset_codigo = ""; o.reset_ate = ""; o.reset_tent = 0; gravar(sh, COL_USU, o._linha, o);
  return { ok: true, usuario: String(o.id) };
}
function salvarUsuario(u) {
  var usu = normUsu(u.usuario); if (!usu || usu === "admin") throw new Error("Usuário inválido.");
  var sh = abaUsu(), o = lerUsuarios().filter(function (x) { return String(x.id) === usu; })[0];
  var novo = !o; if (novo) o = { id: usu, criado_em: new Date().toISOString(), bloqueado: "NAO" };
  if (u.nome !== undefined) o.nome = String(u.nome);
  if (u.papel !== undefined) o.papel = String(u.papel);
  if (u.perms !== undefined) o.perms = JSON.stringify(u.perms);
  if (u.bloqueado !== undefined) o.bloqueado = u.bloqueado ? "SIM" : "NAO";
  if (u.email !== undefined) o.email = String(u.email).trim().toLowerCase();
  if (u.status !== undefined) { o.status = String(u.status); if (u.status === "ativo" && u.perms === undefined && (!o.perms || o.perms === "{}")) o.perms = JSON.stringify(PADRAO[o.papel === "supervisor" ? "supervisor" : "tecnico"]); }
  if (novo && !o.status) o.status = "ativo";
  if (u.senha) { o.salt = Utilities.getUuid(); o.hash = hashSenha(String(u.senha), o.salt); }
  if (novo && !o.hash) throw new Error("Usuário novo precisa de senha.");
  gravar(sh, COL_USU, novo ? 0 : o._linha, o);
  return listarUsuarios();
}
function liberarAparelho(usuario) {
  var sh = abaUsu(), o = lerUsuarios().filter(function (x) { return String(x.id) === normUsu(usuario); })[0];
  if (!o) throw new Error("Usuário não encontrado.");
  o.aparelho = ""; o.aparelho_nome = ""; o.pedido_aparelho = ""; gravar(sh, COL_USU, o._linha, o); return listarUsuarios();
}
function salvarConfigAcesso(d) {
  if (d.exigir !== undefined) setProp("EXIGIR_LOGIN", d.exigir ? "1" : "0");
  if (d.chaveMapas) setProp("CHAVE_MAPAS", String(d.chaveMapas));
  if (d.auto !== undefined) setProp("AUTO_APROVAR", d.auto ? "1" : "0");
  return listarUsuarios();
}

function exigirChave(c) { if (String(c || "") !== CHAVE_GESTAO) throw new Error("senha da gestão errada"); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* Rode UMA vez pelo editor (botão ▶ Executar) para criar as abas e liberar o acesso ao Drive. */
function instalar() {
  aba(ABA_DEP, COL_DEP); aba(ABA_ENT, COL_ENT); abaUsu(); segredo(); emailAdmin(); pastaRaiz();
  /* pede a permissão de mandar e-mail (código de recuperação de senha e aviso de cadastro novo) */
  MailApp.getRemainingDailyQuota();
  Logger.log("Pronto. Agora: Implantar > Nova implantação > App da Web.");
}
