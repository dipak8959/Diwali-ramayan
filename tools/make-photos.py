#!/usr/bin/env python3
"""Write wall/vendor/photos.js from the real photos in wall/photos/ (embedded, so the page works offline).
Put the files there with these names, and their credit lines in wall/photos/credits.json:
  ram-mandir.jpg   the Ram Mandir in Ayodhya
  ram-lalla.jpg    the murti of Ram Lalla
Use only photos you took yourself or that are freely licensed (for example from Wikimedia Commons), and keep the credit.
Without them, the ending draws a simple temple picture instead."""
import base64, io, json, os, subprocess
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'wall')
pd = os.path.join(root, 'photos'); credits = {}
try: credits = json.load(open(os.path.join(pd, 'credits.json')))
except Exception: pass
out = {}
for key, fn in [('mandir', 'ram-mandir.jpg'), ('lalla', 'ram-lalla.jpg')]:
    f = os.path.join(pd, fn)
    if not os.path.exists(f): continue
    small = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-vf', "scale='min(1600,iw)':-2", '-q:v', '4', '-f', 'mjpeg', '-'], capture_output=True, check=True).stdout
    out[key] = {'src': 'data:image/jpeg;base64,' + base64.b64encode(small).decode(), 'credit': credits.get(fn, '')}
js = '// Real photos for the ending, made by tools/make-photos.py from wall/photos/. Credits are shown on screen.\nwindow.PHOTOS = ' + json.dumps(out) + ';\n'
open(os.path.join(root, 'vendor', 'photos.js'), 'w').write(js)
print('photos.js:', ', '.join(f"{k} ({len(v['src']) // 1024} KB)" for k, v in out.items()) or 'no photos yet (a drawn temple is used)')
