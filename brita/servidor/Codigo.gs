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
    return json({ ok: false, erro: "acao desconhecida" });
  } catch (x) { return json({ ok: false, erro: String(x.message || x) }); }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    var d = JSON.parse(e.postData.contents);
    if (d.a === "entrega") return json(salvarEntrega(d));
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
function exigirChave(c) { if (String(c || "") !== CHAVE_GESTAO) throw new Error("senha da gestão errada"); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* Rode UMA vez pelo editor (botão ▶ Executar) para criar as abas e liberar o acesso ao Drive. */
function instalar() {
  aba(ABA_DEP, COL_DEP); aba(ABA_ENT, COL_ENT); pastaRaiz();
  Logger.log("Pronto. Agora: Implantar > Nova implantação > App da Web.");
}
