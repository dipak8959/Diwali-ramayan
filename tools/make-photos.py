#!/usr/bin/env python3
"""Embed the real photos in wall/photos/ for the ending (so the page works offline).
  ram-mandir.jpg / mandir-night.jpg / mandir-day.jpg   the Ram Mandir in Ayodhya
  ram-lalla.jpg / lalla-sanctum.jpg / lalla-close.jpg  the murti of Ram Lalla
  deepotsav.jpg                                       Diwali lamps on the river Saryu in Ayodhya
Credits (optional) go in wall/photos/credits.json, e.g. {"mandir-night.jpg": "Name, licence"}; they are shown under the photo.
By default this writes wall/vendor/photos.local.js, which is not committed: photos often belong to their photographers.
Build a page with them using: python3 tools/bundle-wall.py --local  (writes wall/index.local.html, for making your own video).
Use --public only for photos you own or that are freely licensed: it writes wall/vendor/photos.js, which is published."""
import base64, glob, json, os, subprocess, sys
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'wall'); pd = os.path.join(root, 'photos')
credits = {}
try: credits = json.load(open(os.path.join(pd, 'credits.json')))
except Exception: pass
out = {}
for f in sorted(glob.glob(os.path.join(pd, '*.jpg')) + glob.glob(os.path.join(pd, '*.jpeg')) + glob.glob(os.path.join(pd, '*.png'))):
    key = os.path.splitext(os.path.basename(f))[0]
    small = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-vf', "scale='min(1600,iw)':-2", '-q:v', '3', '-f', 'mjpeg', '-'], capture_output=True, check=True).stdout
    out[key] = {'src': 'data:image/jpeg;base64,' + base64.b64encode(small).decode(), 'credit': credits.get(os.path.basename(f), '')}
name = 'photos.js' if '--public' in sys.argv else 'photos.local.js'
open(os.path.join(root, 'vendor', name), 'w').write('// Real photos for the ending, made by tools/make-photos.py from wall/photos/.\nwindow.PHOTOS = ' + json.dumps(out) + ';\n')
print(name + ':', ', '.join(f"{k} ({len(v['src']) // 1024} KB)" for k, v in out.items()) or 'no photos')
