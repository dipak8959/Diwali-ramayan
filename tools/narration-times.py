#!/usr/bin/env python3
"""Measure how long the narrator takes to say every line, and write wall/src/narration-times.js.
The story uses these times so that each scene, its text and its narration play together.
Usage: node tools/narration-texts.js > texts.json && python3 tools/narration-times.py texts.json --models <folder with the Kokoro files> [--cache DIR]"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voice
ap = argparse.ArgumentParser(); ap.add_argument('texts'); ap.add_argument('--models', default='.'); ap.add_argument('--cache', default='.narration-cache'); a = ap.parse_args()
nar = voice.Narrator(a.models, a.cache); out = {}
for t in json.load(open(a.texts)): out[t] = round(len(nar.say(t)) / nar.SR, 2)
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'wall', 'src')
open(os.path.join(root, 'narration-times.js'), 'w').write('// How long the narrator takes to say each line, in seconds (made by tools/narration-times.py).\nwindow.NARR_TIMES = ' + json.dumps(out, indent=0, ensure_ascii=False) + ';\n')
print(len(out), 'lines, total', round(sum(out.values()) / 60, 1), 'minutes of speech')
