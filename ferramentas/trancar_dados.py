"""Tranca os dados da empresa que o app baixa (AES-GCM, chave PBKDF2-SHA256 da chave dos mapas), no mesmo formato que lib/cofre.js abre.
Uso (na raiz do repositório):  PAINEL_SENHA=... python3 -I ferramentas/trancar_dados.py [arquivos...]
Sem arquivos: tranca dados/mapas.json, dados/regiao.json, dados/situacao.json e dados/talhoes.json (se existirem).
Arquivo que já está trancado com a mesma chave fica como está (para não gerar commit à toa). Mantém "versao"/"em" fora da tranca (não são sigilosos)."""
import os, sys, json, base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

IT = 150000
senha = os.environ["PAINEL_SENHA"].encode()
arqs = sys.argv[1:] or [p for p in ("dados/mapas.json", "dados/regiao.json", "dados/situacao.json", "dados/talhoes.json") if os.path.exists(p)]
b = lambda x: base64.b64encode(x).decode()
d = lambda s: base64.b64decode(s)
chave = lambda salt, it: PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=it).derive(senha)
mudou = 0
for p in arqs:
    j = json.load(open(p, encoding="utf-8"))
    if isinstance(j, dict) and "ct" in j and "iv" in j and "salt" in j:
        try:  # já trancado: confere se abre com a chave atual; se abrir, não mexe
            AESGCM(chave(d(j["salt"]), j.get("it", IT))).decrypt(d(j["iv"]), d(j["ct"]), None)
            print("já trancado:", p); continue
        except Exception:
            print("ERRO: trancado com outra chave:", p, file=sys.stderr); sys.exit(2)
    raw = json.dumps(j, ensure_ascii=False, separators=(",", ":")).encode()
    salt, iv = os.urandom(16), os.urandom(12)
    out = {"v": 1, "it": IT, "salt": b(salt), "iv": b(iv), "ct": b(AESGCM(chave(salt, IT)).encrypt(iv, raw, None))}
    for k in ("versao", "em"):
        if isinstance(j, dict) and k in j: out[k] = j[k]
    json.dump(out, open(p, "w", encoding="utf-8"), ensure_ascii=False)
    mudou += 1; print("trancado:", p)
print("arquivos trancados agora:", mudou)
