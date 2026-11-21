/* Cofre: abre os dados da empresa (mapas.json, regiao.json, situacao.json…) que ficam trancados (AES-GCM, chave PBKDF2-SHA256).
   A chave vem do servidor quando a pessoa entra com usuário liberado para "mapas" (ou, por enquanto, da senha da equipe).
   Arquivo ainda sem tranca passa direto (compatível com o que já existe). Sem chave: erro "sem-chave"; chave errada: erro "chave". */
(function () {
  "use strict";
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const K = {};
  const COFRE = {
    chave() { try { return localStorage.getItem("painel_senha") || ""; } catch (e) { return ""; } },
    trancado(j) { return !!(j && typeof j === "object" && j.ct && j.iv && j.salt); },
    async abrir(j, senha) {
      if (!COFRE.trancado(j)) return j;
      senha = senha || COFRE.chave(); if (!senha) { const e = new Error("sem-chave"); e.chave = 1; throw e; }
      const id = j.salt + "|" + senha + "|" + (j.it || 150000);
      if (!K[id]) {
        const k0 = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveKey"]);
        K[id] = crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(j.salt), iterations: j.it || 150000, hash: "SHA-256" }, k0, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      }
      let txt;
      try { txt = new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(j.iv) }, await K[id], b64(j.ct))); }
      catch (e) { delete K[id]; const x = new Error("chave"); x.chave = 1; throw x; }
      return JSON.parse(txt);
    },
    async json(r, senha) { return COFRE.abrir(await r.json(), senha); }
  };
  window.COFRE = COFRE;
})();
