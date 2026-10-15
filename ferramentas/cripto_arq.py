"""Criptografa arquivos (camadas de mapa) com a senha da equipe. Uso: PAINEL_SENHA=... python3 ferramentas/cripto_arq.py entrada saida.bin"""
import os, sys, json, base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
src, out = sys.argv[1], sys.argv[2]
salt, iv, it = os.urandom(16), os.urandom(12), 150000
k = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=it).derive(os.environ["PAINEL_SENHA"].encode())
ct = AESGCM(k).encrypt(iv, open(src, "rb").read(), None)
b = lambda x: base64.b64encode(x).decode()
json.dump({"v": 1, "it": it, "salt": b(salt), "iv": b(iv), "ct": b(ct)}, open(out, "w"))
