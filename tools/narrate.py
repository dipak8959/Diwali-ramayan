#!/usr/bin/env python3
"""Make the voice narration for the wall video and add it to the MP4.

Usage: python3 tools/narrate.py <schedule.json> <video.mp4> <out.mp4> [--voice NAME] [--models DIR] [--wav out.wav]
  schedule.json  from: node tools/caption-schedule.js schedule.json
  voices: narrator (default: a deep blend of Kokoro's Hindi male 'hm_omega' and 'am_onyx'), or any Kokoro voice name.
Needs: pip install kokoro-onnx soundfile; ffmpeg; the Kokoro v1.0 model files (Apache-2.0) in --models:
  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
The voice is a synthetic narrator. It is not, and does not imitate, any real person.
"""
import argparse, hashlib, json, os, re, subprocess, sys
import numpy as np, soundfile as sf

# Spellings that make an English text-to-speech voice say the Sanskrit names more naturally.
SAY = {
    'Ramayana': 'Raamaayan', 'Ram Rajya': 'Raam Raajya', "Ram's": "Raam's", 'Ram': 'Raam', "Ravan's": "Raavan's", 'Ravan': 'Raavan', 'Sita': 'Seeta',
    'Lakshmana': 'Lukshmuna', 'Lakshman': 'Lukshmun', 'Dasharatha': 'Dusharuth', 'Kaikeyi': 'Kaikayee', 'Kausalya': 'Kowshulya', 'Sumitra': 'Soomitra',
    'Bharata': 'Bharut', 'Shatrughna': 'Shatrughn', 'Hanuman': 'Hunoomaan', 'Vishwamitra': 'Vishvaamitra', 'Vasishtha': 'Vashisht',
    'Kumbhakarna': 'Kumbhakarn', 'Vibhishana': 'Vibheeshun', 'Surpanakha': 'Shoorpunakha', 'Jatayu': 'Jutaayu', 'Sugriva': 'Sugreev', 'Vali': 'Vaali',
    'Valmiki': 'Vaalmeeki', 'Aditya Hridayam': 'Aaditya Hriduyum', 'Matali': 'Maatali', 'Pushpaka': 'Pushpak', 'Rishyasringa': 'Rishyashring',
    'Shravana': 'Shravun', 'Tataka': 'Taadaka', 'Maricha': 'Maareech', 'Subahu': 'Subaahu', 'Janaka': 'Junuk', 'Parashurama': 'Purushuraam',
    'Manthara': 'Munthura', 'Dandaka': 'Dundak', 'Nandigrama': 'Nundigraam', 'Kabandha': 'Kubundh', 'Sabari': 'Shubari', 'Rishyamukha': 'Rishyamook',
    'Angada': 'Ungud', 'Nala': 'Nul', 'Vishwakarma': 'Vishvakarma', 'Garuda': 'Garud', 'Diwali': 'Deewaali', 'Surasa': 'Surusaa', 'Sampati': 'Sumpaati',
    'Mandodari': 'Mundodari', 'Agastya': 'Ugustya', 'Indrajit': 'Indrajeet', 'Kishkindha': 'Kishkindha', 'Ayodhya': 'Ayodhya', 'Sumantra': 'Sumuntra',
    'Chitrakoot': 'Chitrakoot', 'Ganga': 'Gunga', 'Guha': 'Guh', 'Ahalya': 'Uhulya', 'Mithila': 'Mithila', 'Lanka': 'Lunka', 'Shiva': 'Shiv',
    'Brahma': 'Brumha', 'Vishnu': 'Vishnu', 'Agni': 'Ugni', 'Kanda': 'Kaand', 'Bala': 'Baal', 'Aranya': 'Arunya', 'Sundara': 'Sundar', 'Yuddha': 'Yuddh',
    'yakshini': 'yukshini', 'Panchavati': 'Panchavati', 'Godavari': 'Godaavari', 'Khara': 'Khur', 'Dushana': 'Dooshun', 'Samudra': 'Samudra',
}
def speakable(t):
    t = t.replace('’', "'").replace('—', ', ')
    for k in sorted(SAY, key=len, reverse=True): t = re.sub(r'(?<![A-Za-z])' + re.escape(k) + r'(?![A-Za-z])', SAY[k], t)
    return t

def heading(t):   # 'BOOK TWO. AYODHYA KANDA. THE EXILE' -> 'Book Two. Ayodhya Kaand. The Exile.'
    return speakable(' '.join(w.capitalize() for w in t.split(' ')).replace("'S", "'s")) + '.'

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
    ap.add_argument('--voice', default='narrator'); ap.add_argument('--models', default='.'); ap.add_argument('--wav'); ap.add_argument('--cache', default='.narration-cache')
    a = ap.parse_args()
    from kokoro_onnx import Kokoro
    k = Kokoro(os.path.join(a.models, 'kokoro-v1.0.onnx'), os.path.join(a.models, 'voices-v1.0.bin'))
    voice = .6 * k.get_voice_style('hm_omega') + .4 * k.get_voice_style('am_onyx') if a.voice == 'narrator' else a.voice
    os.makedirs(a.cache, exist_ok=True)
    def say(text, speed):
        key = hashlib.sha1(f'{a.voice}|{speed}|{text}'.encode()).hexdigest()[:16]; f = os.path.join(a.cache, key + '.wav')
        if not os.path.exists(f):
            s, sr = k.create(text, voice=voice, speed=speed, lang='en-us'); sf.write(f, s, sr)
        s, sr = sf.read(f, dtype='float32'); return s, sr
    d = json.load(open(a.sched)); loop = d['loop']; ev = d['ev']; SR = 24000
    track = np.zeros(int((loop + 2) * SR), dtype=np.float32)
    caps = [e for e in ev if e['type'] == 'cap']
    if d.get('intro'):   # the opening titles: sound, and the narrator's first line
        sfx = intro_sfx(SR, d['intro']); track[: len(sfx)] += sfx
        s, sr = say(speakable('Vishnu presents. The Ramayana, as told by the sage Valmiki.'), .82); i0 = int(12.7 * SR); track[i0:i0 + len(s)] += s[: len(track) - i0]; intro_end = 12.7 + len(s) / sr
    else: intro_end = 0.0
    busy = intro_end; report = []; said = set()
    for i, e in enumerate(ev):
        if e['type'] != 'kanda' and e['en'] in said: continue
        said.add(e['en'])
        if e['type'] == 'kanda': text, speed, want = heading(e['en']), .82, e['t'] + .15
        elif e['type'] == 'cap': text, speed, want = speakable(e['en']), .86, e['t'] + .45
        else: text, speed, want = speakable(e['en']), .84, e['t'] + .3
        nxt = next((c['t'] for c in caps if c['t'] > e['t'] + .01), loop)
        start = max(want, busy + (.35 if e['type'] == 'moral' else .5))
        s, sr = say(text, speed); dur = len(s) / sr
        if e['type'] == 'cap':   # too long for its moment (with its lesson): say it a little faster
            m = next((x for x in ev if x['type'] == 'moral' and e['t'] <= x['t'] < nxt), None)
            md = len(say(speakable(m['en']), .84)[0]) / SR + .35 if m else 0
            for sp in (.95, 1.0, 1.06, 1.12):
                if start + dur + md <= nxt + (1.6 if m else .8): break
                s, sr = say(text, sp); dur = len(s) / sr
        if e['type'] == 'moral' and start + dur > nxt + 1.6: report.append(('skipped lesson', round(e['t'], 1), e['en'])); continue
        if e['type'] == 'kanda' and start + dur > nxt + 2.5: continue
        i0 = int(start * SR); seg = s[: max(0, min(len(s), len(track) - i0))]; track[i0:i0 + len(seg)] += seg; busy = start + dur
        if start - want > 2: report.append(('late', round(want, 1), round(start - want, 1), text[:50]))
    wav = a.wav or os.path.splitext(a.out)[0] + '-narration.wav'
    sf.write(wav, track[: int(loop * SR)], SR)
    for r in report: print(*r)
    fx = 'highpass=f=70,bass=g=3:f=140,acompressor=threshold=-20dB:ratio=3:attack=5:release=150,aecho=0.8:0.6:45|90:0.12|0.07,loudnorm=I=-16:TP=-1.5:LRA=9'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', a.video, '-i', wav, '-filter:a', fx, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', a.out], check=True)
    print('wrote', a.out)

if __name__ == '__main__': main()
