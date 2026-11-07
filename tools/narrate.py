#!/usr/bin/env python3
"""Make the voice narration for the wall video and add it to the MP4.

Usage: python3 tools/narrate.py <schedule.json> <video.mp4> <out.mp4> [--models DIR] [--wav out.wav] [--report placed.json]
       python3 tools/narrate.py <schedule.json> - wall/audio/narration.m4a   (no video: the soundtrack alone, for the web page)
  schedule.json  from: node tools/caption-schedule.js schedule.json
  The narrator (tools/voice.py) is a deep blend of Kokoro's Hindi male 'hm_omega' and 'am_onyx'; names are said with Hindi sounds.
Needs: pip install kokoro-onnx soundfile; ffmpeg; the Kokoro v1.0 model files (Apache-2.0) in --models:
  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
The voice is a synthetic narrator. It is not, and does not imitate, any real person.
"""
import argparse, json, os, subprocess, sys
import numpy as np, soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voice   # the narrator: names said the Indian way, one calm speed, a pause after every sentence
SPEED = voice.SPEED
CAP_IN, MORAL_GAP, LINE_GAP = .45, .9, .8   # the voice starts just after its text appears; it never rushes to catch up

def intro_sfx(sr, dur):
    """Sound for the opening titles: page flips that speed up, a rising whoosh, a deep boom and a shimmering chord."""
    n = int(dur * sr); out = np.zeros(n, dtype=np.float32); rng = np.random.default_rng(7); t = np.arange(n) / sr
    ph = lambda x: 1.6 * x + 3.2 * max(0.0, x - 3) ** 1.8
    last = int(ph(.8))
    for x in np.arange(.8, 8.4, 1 / 200):
        if int(ph(x)) != last:
            last = int(ph(x)); i0 = int(x * sr); L = int(.03 * sr); b = rng.standard_normal(L).astype(np.float32); b = np.diff(b, prepend=0) * np.exp(-np.linspace(0, 6, L))
            out[i0:i0 + L] += b[: max(0, min(L, n - i0))] * (.05 + .1 * x / 8.4)
    w0, w1 = int(6.2 * sr), int(8.8 * sr); wn = rng.standard_normal(w1 - w0).astype(np.float32); k = np.linspace(0, 1, w1 - w0)
    sm = np.zeros_like(wn); a = 0.0
    for i in range(len(wn)): a += (wn[i] - a) * (.02 + .5 * k[i] ** 2); sm[i] = a
    out[w0:w1] += sm * (k ** 2) * .5
    b0 = int(8.85 * sr); L = int(3 * sr); tt = np.arange(L) / sr; f = 30 + 30 * np.exp(-tt * 3)
    boom = np.sin(2 * np.pi * np.cumsum(f) / sr) * np.exp(-tt * 1.6) * .45 + rng.standard_normal(L) * np.exp(-tt * 18) * .1   # soft, so it does not startle small children
    out[b0:b0 + L] += boom[: n - b0].astype(np.float32)
    c0 = int(9.1 * sr); L = int(4.6 * sr); tt = np.arange(L) / sr; env = np.minimum(1, tt / 1.2) * np.exp(-np.maximum(0, tt - 2.6) * 1.2)
    chord = sum(np.sin(2 * np.pi * fr * tt) * g for fr, g in [(146.8, .5), (220, .4), (293.7, .35), (370, .25), (440, .2), (587.3, .12)])
    out[c0:c0 + L] += (chord * env * .12)[: n - c0].astype(np.float32)
    return out

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('sched'); ap.add_argument('video'); ap.add_argument('out')
    ap.add_argument('--models', default='.'); ap.add_argument('--wav'); ap.add_argument('--cache', default='.narration-cache'); ap.add_argument('--report')
    a = ap.parse_args()
    nar = voice.Narrator(a.models, a.cache); SR = nar.SR
    d = json.load(open(a.sched)); loop = d['loop']; ev = d['ev']
    track = np.zeros(int((loop + 2) * SR), dtype=np.float32)
    caps = [e for e in ev if e['type'] == 'cap']
    if d.get('intro'):   # the opening titles: sound, and the narrator's first line
        sfx = intro_sfx(SR, d['intro']); track[: len(sfx)] += sfx
        s = nar.say('Vishnu presents. The Ramayana, as told by the sage Valmiki.'); t_in = min(12.6, d['intro'] - 1.0 - len(s) / SR); i0 = int(t_in * SR); track[i0:i0 + len(s)] += s[: len(track) - i0]; intro_end = t_in + len(s) / SR   # said before the story begins
    else: intro_end = 0.0
    busy = intro_end; report = []; said = set(); placed = []
    for i, e in enumerate(ev):
        e.setdefault('en', '')
        if e['type'] not in ('kanda', 'final') and e['en'] in said: continue
        said.add(e['en'])
        if e['type'] == 'kanda': continue   # book headings are shown, not read, so every caption's voice starts with its text
        if e['type'] == 'moral' and e['en'].startswith('Photo: '): continue   # photo credits are shown, not read
        if e['type'] == 'cap': text, want, gap = e['en'], e['t'] + CAP_IN, LINE_GAP
        elif e['type'] == 'final': text, want, gap = 'Jai Shri Ram! Happy Diwali!', e['t'] + .8, LINE_GAP
        else: text, want, gap = e['en'], e['t'] + .1, MORAL_GAP
        nxt = next((c['t'] for c in caps if c['t'] > e['t'] + .01), loop)
        start = max(want, busy + gap)   # never on top of the line before, and never sped up
        s = nar.say(text); dur = len(s) / SR
        i0 = int(start * SR); seg = s[: max(0, min(len(s), len(track) - i0))]; track[i0:i0 + len(seg)] += seg; busy = start + dur
        placed.append({'type': e['type'], 'shown': round(e['t'], 2), 'until': round(e.get('end', nxt), 2), 'start': round(start, 2), 'end': round(start + dur, 2), 'en': e['en'][:50]})
        if start - want > .3: report.append(('late', round(want, 1), round(start - want, 1), text[:50]))
        if e['type'] == 'cap' and start + dur > nxt: report.append(('runs into the next caption', round(e['t'], 1), round(start + dur - nxt, 1), text[:50]))
    if a.report: json.dump(placed, open(a.report, 'w'), indent=1)
    wav = a.wav or os.path.splitext(a.out)[0] + '-narration.wav'
    sf.write(wav, track[: int(loop * SR)], SR)
    for r in report: print(*r)
    fx = 'highpass=f=70,bass=g=3:f=140,acompressor=threshold=-20dB:ratio=3:attack=5:release=150,aecho=0.8:0.6:45|90:0.12|0.07,loudnorm=I=-16:TP=-1.5:LRA=9'
    if a.video == '-':   # the soundtrack alone, small enough for the web page: mono AAC, which every browser (and Safari on iPad) can play
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-filter:a', fx, '-ac', '1', '-c:a', 'aac', '-b:a', '56k', '-ar', '44100', '-movflags', '+faststart', a.out], check=True)
        json.dump({'loop': loop}, open(os.path.splitext(a.out)[0] + '.json', 'w'))
    else:
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', a.video, '-i', wav, '-filter:a', fx, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', a.out], check=True)
    print('wrote', a.out)

if __name__ == '__main__': main()
