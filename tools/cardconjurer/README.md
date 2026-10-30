# Catalogo cornici da Card Conjurer

Rigenera `web/packs/` dalle immagini del repo open source di Card Conjurer (https://github.com/Investigamer/cardconjurer).

1. `GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/Investigamer/cardconjurer ~/investigamer/cardconjurer`
2. `node scan.js` — esegue i file `js/frames/pack*.js` in una sandbox e salva cornici, geometria dei testi e zona dell'arte.
3. `python3 build.py` — converte le cornici a 745×1040 WebP (e le caselle F/C).
4. `python3 post.py` — scrive `pack.json`, miniature e `index.json`; poi copia `out/packs` in `web/packs`.

I percorsi sono quelli usati la prima volta (`/tmp/claude-0/cc2`, `/home/claude/investigamer/cardconjurer`): cambiali in cima agli script.
