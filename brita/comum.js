/* Entrega de brita – funções comuns (app do motorista, gestão e app de mapas) */
(function () {
  "use strict";
  const LSK = "brita_servidor";
  function servidor() {
    try { const q = new URLSearchParams(location.search).get("s"); if (q && /^https:\/\/script\.google\.com\//.test(q)) localStorage.setItem(LSK, q); } catch (e) {}
    let s = ""; try { s = localStorage.getItem(LSK) || ""; } catch (e) {}
    return s || window.BRITA_SERVIDOR || "";
  }
  async function get(params) {
    const s = servidor(); if (!s) throw new Error("servidor não configurado");
    const r = await fetch(s + "?" + new URLSearchParams(params), { cache: "no-store" });
    const j = await r.json(); if (!j.ok) throw new Error(j.erro || "erro no servidor"); return j;
  }
  /* corpo em texto simples: o Google aceita sem pedir permissão extra ao navegador */
  async function post(obj, ms) {
    const s = servidor(); if (!s) throw new Error("servidor não configurado");
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms || 60000);
    try {
      const r = await fetch(s, { method: "POST", body: JSON.stringify(obj), signal: ctl.signal });
      const j = await r.json(); if (!j.ok) throw new Error(j.erro || "erro no servidor"); return j;
    } finally { clearTimeout(t); }
  }
  function dist(a1, o1, a2, o2) {
    const R = 6371008.8, r = Math.PI / 180, p1 = a1 * r, p2 = a2 * r, dp = p2 - p1, dl = (o2 - o1) * r;
    return 2 * R * Math.asin(Math.sqrt(Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2));
  }
  function pontosDe(d) { return [{ lat: d.lat, lon: d.lon, nome: d.id }].concat(d.extensoes || []); }
  function distDep(lat, lon, d) { let m = Infinity, onde = null; pontosDe(d).forEach(p => { const x = dist(lat, lon, +p.lat, +p.lon); if (x < m) { m = x; onde = p; } }); return { m, onde }; }
  /* lista de depósitos ativos ordenada pela distância */
  function ordenar(lat, lon, deps) {
    return (deps || []).filter(d => d.ativo !== false).map(d => { const r = distDep(lat, lon, d); return { d, m: r.m, onde: r.onde, dentro: r.m <= (d.raio_m || 150) }; }).sort((a, b) => a.m - b.m);
  }
  const fM = m => !isFinite(m) ? "—" : m < 1000 ? Math.round(m) + " m" : (m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km";
  const fT = t => (+t || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " t";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const hoje = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const dataLocal = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const foto = id => id ? "https://drive.google.com/thumbnail?id=" + encodeURIComponent(id) + "&sz=w1200" : "";
  const fotoAbrir = id => id ? "https://drive.google.com/file/d/" + encodeURIComponent(id) + "/view" : "";
  /* link que abre o ponto no app de mapas (mesmo mapa da equipe) */
  const verNoMapa = (lat, lon, rot) => new URL("../#ver=" + (+lat).toFixed(6) + "," + (+lon).toFixed(6) + (rot ? "," + encodeURIComponent(rot) : ""), location.href).href;
  window.BRITA = { servidor, get, post, dist, distDep, ordenar, pontosDe, fM, fT, esc, hoje, dataLocal, foto, fotoAbrir, verNoMapa };
})();
