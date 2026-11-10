"""
MR VISUALS — change l'adresse publique du site dans toutes les pages (nom de domaine).

Exemple, pour passer de github.io à mrvisuals.fr :
    python tools/set_domain.py https://mathisrouvreau-droid.github.io/Site_Photo https://mrvisuals.fr

Remplace l'ancienne adresse par la nouvelle dans les pages, le plan du site et robots.txt,
met à jour tools/site_config.py (BASE_URL), puis régénère les pages de collection et le plan du site.
Ajouter --dry-run pour voir ce qui changerait sans rien écrire.
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = (".html", ".xml", ".txt", ".js", ".json")
SKIP_DIRS = {"node_modules", ".git", ".wrangler", "instagram", "images", "videos", "tools", "analytics"}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    if len(args) != 2:
        sys.exit(__doc__)
    old, new = args[0].rstrip("/"), args[1].rstrip("/")
    total = 0
    for dp, dns, fns in os.walk(ROOT):
        dns[:] = [d for d in dns if d not in SKIP_DIRS]
        for fn in fns:
            if not fn.endswith(EXT):
                continue
            path = os.path.join(dp, fn)
            with open(path, encoding="utf-8") as f:
                text = f.read()
            n = text.count(old)
            if n:
                total += n
                print(f"{os.path.relpath(path, ROOT)} : {n}")
                if not dry:
                    with open(path, "w", encoding="utf-8", newline="\n") as f:
                        f.write(text.replace(old, new))
    cfg = os.path.join(ROOT, "tools", "site_config.py")
    with open(cfg, encoding="utf-8") as f:
        c = f.read()
    if not dry:
        c = re.sub(r'BASE_URL = "[^"]*"', f'BASE_URL = "{new}"', c)
        with open(cfg, "w", encoding="utf-8", newline="\n") as f:
            f.write(c)
        subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_collections.py")], cwd=os.path.join(ROOT, "tools"), check=True)
    print(f"{total} remplacement(s)" + (" (simulation)" if dry else ""))


if __name__ == "__main__":
    main()
