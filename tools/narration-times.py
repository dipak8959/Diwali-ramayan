#!/usr/bin/env python3
"""Measure how long the narrator takes to say every line, and write wall/src/narration-times.js.
The story uses these times so that each scene, its text and its narration play together.
Usage: node tools/narration-texts.js > texts.json && python3 tools/narration-times.py texts.json --models <folder with the Kokoro files> [--cache DIR]"""
import argparse, hashlib, json, os, sys
import soundfile as sf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import narrate
ap = argparse.ArgumentParser(); ap.add_argument('texts'); ap.add_argument('--models', default='.'); ap.add_argument('--cache', default='.narration-cache'); a = ap.parse_args()
from kokoro_onnx import Kokoro
k = Kokoro(os.path.join(a.models, 'kokoro-v1.0.onnx'), os.path.join(a.models, 'voices-v1.0.bin'))
voice = .6 * k.get_voice_style('hm_omega') + .4 * k.get_voice_style('am_onyx'); os.makedirs(a.cache, exist_ok=True)
out = {}
for t in json.load(open(a.texts)):
    text = narrate.speakable(t); key = hashlib.sha1(f'narrator|{narrate.SPEED}|{text}'.encode()).hexdigest()[:16]; f = os.path.join(a.cache, key + '.wav')
    if not os.path.exists(f): s, sr = k.create(text, voice=voice, speed=narrate.SPEED, lang='en-us'); sf.write(f, s, sr)
    out[t] = round(sf.info(f).duration, 2)
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'wall', 'src')
open(os.path.join(root, 'narration-times.js'), 'w').write('// How long the narrator takes to say each line, in seconds (made by tools/narration-times.py).\nwindow.NARR_TIMES = ' + json.dumps(out, indent=0, ensure_ascii=False) + ';\n')
print(len(out), 'lines, total', round(sum(out.values()) / 60, 1), 'minutes of speech')
