"""
MR VISUALS — petit serveur pour voir le site sur son ordinateur : http://127.0.0.1:3000

Pourquoi pas « python -m http.server » ? Il met en ligne TOUT le dossier, y compris analytics/MOT-DE-PASSE.txt,
pour tous les appareils du réseau (Wi-Fi de la maison, bureau…). Celui-ci :
  - n'écoute que sur cet ordinateur (127.0.0.1) : invisible depuis le réseau ;
  - refuse les dossiers analytics/, instagram/, tools/, .git/… et tous les fichiers cachés ou de mot de passe ;
  - n'affiche pas la liste des dossiers ;
  - renvoie la page 404.html pour une page inexistante, comme GitHub Pages.

    python tools/serve_local.py          # port 3000
    python tools/serve_local.py 3001     # autre port
"""
import http.server
import os
import sys
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLOCKED_DIRS = {"analytics", "instagram", "tools", "node_modules", ".git", ".github", ".wrangler"}


def is_blocked(raw_path):
    path = urllib.parse.unquote(raw_path.split("?")[0].split("#")[0]).replace("\\", "/")
    parts = [p for p in path.split("/") if p]
    if parts and parts[0] in BLOCKED_DIRS:
        return True
    if any(p.startswith(".") or p == ".." for p in parts):
        return True
    low = path.lower()
    return "mot-de-passe" in low or ".dev.vars" in low or ".env" in low


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_path(self, path):
        if is_blocked(path):
            return os.path.join(ROOT, "__refuse__")      # n'existe pas : 404
        return super().translate_path(path)

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_error(self, code, message=None, explain=None):
        if code == 404:
            try:
                with open(os.path.join(ROOT, "404.html"), "rb") as f:
                    body = f.read()
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(body)
                return
            except OSError:
                pass
        super().send_error(code, message, explain)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Site visible sur http://127.0.0.1:{port} (uniquement sur cet ordinateur). Ctrl+C pour arrêter.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
