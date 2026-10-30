#!/usr/bin/env python3
"""Prepara i pacchetti a partire da web/:
   dist/coglio-proxy-archive.html   pagina unica (anteprima / uso immediato)
   electron/web  e  capacitor/www   copie dei file web per i wrapper
"""
import os, shutil, re
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
web = os.path.join(root, 'web')
rd = lambda f: open(os.path.join(web, f), encoding='utf-8').read()
css, core, app = rd('style.css'), rd('core.js'), rd('app.js')
extra = {n: rd(n) for n in ('version.js', 'changelog.js', 'pdf.js', 'proxy.js', 'builder.js')}
for name, src in [('core.js', core), ('app.js', app)] + list(extra.items()):
    assert '</script' not in src.lower(), name
fonts = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Manrope:wght@400;500;600;700;800&family=Syne:wght@700;800&display=swap'
single = f'''<title>Coglio Proxy Archive</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="{fonts}">
<style>
{css}
</style>
<div id="app"></div>
<div id="toast" role="status" aria-live="polite" hidden></div>
<script>
{extra['version.js']}
</script>
<script>
{extra['changelog.js']}
</script>
<script>
{core}
</script>
<script>
{extra['pdf.js']}
</script>
<script>
{extra['proxy.js']}
</script>
<script>
{app}
</script>
<script>
{extra['builder.js']}
</script>
'''
os.makedirs(os.path.join(root, 'dist'), exist_ok=True)
open(os.path.join(root, 'dist', 'coglio-proxy-archive.html'), 'w', encoding='utf-8').write(single)
for dest in ('electron/web', 'capacitor/www'):
    d = os.path.join(root, dest)
    shutil.rmtree(d, ignore_errors=True)
    shutil.copytree(web, d)
print('build ok:', len(single), 'byte nella pagina unica')
