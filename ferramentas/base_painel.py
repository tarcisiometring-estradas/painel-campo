"""Gera dados/painel_base.json: cópia do banco do Painel de Campo, criptografada (AES-GCM, chave PBKDF2-SHA256 da senha da equipe).
Uso: PAINEL_SENHA=... python3 ferramentas/base_painel.py <pasta_com_colecoes> [saida]
A pasta tem uma subpasta por coleção (os, lanc, rdo, config, mapas, marcas, trechos, novas) com um JSON por documento."""
import json, os, sys, glob, base64, datetime
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
COLS = ["os", "lanc", "rdo", "config", "mapas", "marcas", "trechos", "novas"]
FORA = {("config", "situacao_app")}
src = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else "dados/painel_base.json"
senha = os.environ["PAINEL_SENHA"].encode()
docs = {}
for c in COLS:
    docs[c] = {}
    for f in glob.glob(os.path.join(src, c, "*.json")):
        i = os.path.basename(f)[:-5]
        if (c, i) in FORA: continue
        d = json.load(open(f)); d.pop("id", None); docs[c][i] = d
em = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
txt = json.dumps({"em": em, "docs": docs}, ensure_ascii=False, separators=(",", ":")).encode()
salt, iv, it = os.urandom(16), os.urandom(12), 150000
k = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=it).derive(senha)
ct = AESGCM(k).encrypt(iv, txt, None)
b = lambda x: base64.b64encode(x).decode()
json.dump({"v": 1, "em": em, "it": it, "salt": b(salt), "iv": b(iv), "ct": b(ct)}, open(out, "w"))
print(out, em, {c: len(v) for c, v in docs.items()}, round(len(ct) / 1024), "KB")
