#!/usr/bin/env python3
"""The narrator's voice, shared by tools/narrate.py and tools/narration-times.py.

Names from the Ramayana are said the Indian way: each one is written here in Devanagari and turned into
sounds with the Hindi rules of espeak-ng, so 'Dasharatha' is said 'Dashrath' and 'Ayodhya' is said 'Ayodhyaa',
not as an American reader would guess them. Everything else is read as English.
Each sentence is spoken on its own, with a calm pause after it, at one unhurried speed.

Check how a line will be said:  python3 tools/voice.py "Ram's friend Guha welcomed them."
"""
import hashlib, os, re
import numpy as np

SPEED = .8              # one calm speed for every line; the story is timed to it
SENTENCE_PAUSE = .55    # silence after each sentence (seconds)
VERSION = 'v2'          # change this to make the cache say every line again

# Each name: its Devanagari spelling (said with Hindi sounds), or '/' and the exact sounds.
# A trailing '+z' or '+s' adds an English plural ending.
HI = {
    'Aditya Hridayam': 'आदित्य हृदयम्', 'Agastya': 'अगस्त्य', 'Agni': 'अग्नि', 'Ahalya': '/ʌhˈʌljaː', 'Angada': 'अंगद', 'Arjuna': 'अर्जुन',
    'Ayodhya': 'अयोध्या', 'Balarama': 'बलराम', 'Bharata': 'भरत', 'Brahma': 'ब्रह्मा', 'Chitrakoot': 'चित्रकूट', 'Dandaka': 'दंडक',
    'Dasharatha': 'दशरथ', 'Dashavatara': 'दशावतार', 'Deepotsav': 'दीपोत्सव', 'Diwali': 'दीवाली', 'Dushana': 'दूषण',
    'Ganga': 'गंगा', 'Garuda': 'गरुड', 'Godavari': 'गोदावरी', 'Guha': 'गुह', 'Hanuman': 'हनुमान', 'Himalaya': 'हिमालय',
    'Himalayas': 'हिमालय+z', 'Indra': 'इंद्र', 'Indrajit': 'इंद्रजीत', 'Jai': 'जय', 'Janaka': 'जनक', 'Jatayu': 'जटायु',
    'Kabandha': 'कबंध', 'Kaikeyi': 'कैकेयी', 'Kalki': 'कल्कि', 'Kanda': 'कांड', 'Kausalya': 'कौसल्या', 'Khara': 'खर',
    'Kishkindha': 'किष्किंधा', 'Krishna': 'कृष्ण', 'Kumbhakarna': 'कुंभकर्ण', 'Kurma': 'कूर्म', 'Lakshman': 'लक्ष्मण',
    'Lakshmana': 'लक्ष्मण', 'Lalla': '/lˈʌllaː', 'Lanka': 'लंका', 'Mahabharata': '/məhaːbʰˈaːɾət', 'Mandir': 'मंदिर',
    'Mandodari': 'मंदोदरी', 'Manthara': 'मंथरा', 'Manu': 'मनु', 'Maricha': 'मारीच', 'Matali': 'मातलि', 'Matsya': 'मत्स्य',
    'Mithila': 'मिथिला', 'Nala': 'नल', 'Nandigrama': 'नंदीग्राम', 'Narasimha': 'नरसिम्हा', 'Panchavati': 'पंचवटी',
    'Parashurama': 'परशुराम', 'Prahlada': 'प्रह्लाद', 'Pushpaka': 'पुष्पक', 'Ram': 'राम', 'Rama': 'राम', 'Rajya': 'राज्य',
    'Ramayana': 'रामायण', 'Ravan': 'रावण', 'Ravana': 'रावण', 'Rishyamukha': 'ऋष्यमूक', 'Rishyasringa': 'ऋष्यशृंग',
    'Sabari': 'शबरी', 'Sampati': 'संपाति', 'Samudra': 'समुद्र', 'Sanjivani': 'संजीवनी', 'Saryu': 'सरयू',
    'Shatrughna': 'शत्रुघ्न', 'Shiva': 'शिव', 'Shravana': 'श्रवण', 'Shri': 'श्री', 'Sita': 'सीता', 'Subahu': 'सुबाहु',
    'Sudarshana': 'सुदर्शन', 'Sugriva': 'सुग्रीव', 'Sumantra': 'सुमंत्र', 'Sumitra': 'सुमित्रा', 'Surasa': 'सुरसा',
    'Surpanakha': 'शूर्पणखा', 'Sushena': 'सुषेण', 'Tataka': 'ताटका', 'Vali': 'वाली', 'Valmiki': 'वाल्मीकि', 'Vamana': 'वामन',
    'Varaha': 'वराह', 'Vasishtha': 'वशिष्ठ', 'Vibhishana': 'विभीषण', 'Vishnu': 'विष्णु', 'Vishwakarma': 'विश्वकर्मा',
    'Vishwamitra': 'विश्वामित्र', 'yakshini': 'यक्षिणी', 'diya': 'दीया', 'diyas': 'दीया+z', 'avatar': 'अवतार', 'avatars': 'अवतार+z',
    'Avatar': 'अवतार', 'Avatars': 'अवतार+z', 'rangoli': 'रंगोली', 'murti': 'मूर्ति', 'dharma': 'धर्म', 'ashram': 'आश्रम',
}
_NAME = re.compile(r'(?<![A-Za-z])(' + '|'.join(re.escape(k) for k in sorted(HI, key=len, reverse=True)) + r")('s|s'|')?(?![A-Za-z])")
_VOICELESS = set('ptkfθʈcʰ')

_tk = None
def tokenizer():
    global _tk
    if _tk is None:
        import json, kokoro_onnx
        from kokoro_onnx.tokenizer import Tokenizer
        cfg = json.load(open(os.path.join(os.path.dirname(kokoro_onnx.__file__), 'config.json')))
        _tk = Tokenizer(vocab=cfg['vocab'])
    return _tk

def clean(t):
    return t.replace('’', "'").replace('‘', "'").replace('—', ', ').replace('–', ', ').replace('“', '"').replace('”', '"')

def _name(key, ending):
    v = HI[key]; plural = ''
    if v[-2:] in ('+z', '+s'): v, plural = v[:-2], v[-1]
    p = v[1:] if v[0] == '/' else tokenizer().phonemize(v, 'hi')
    p = p.replace('.', '')   # espeak marks some Hindi sounds with a dot; to the voice a dot means 'end of sentence'
    if ending in ("'s", "s'"):
        plural = 's' if p.rstrip('ː')[-1:] in _VOICELESS else 'z'
    return p + plural

def phonemes(text):
    """The sounds the voice is given: Indian names with Hindi rules, the rest with American English rules."""
    t, out, i = clean(text), [], 0
    for m in _NAME.finditer(t):
        out.append(('en', t[i:m.start()])); out.append(('hi', _name(m.group(1), m.group(2)))); i = m.end()
    out.append(('en', t[i:]))
    s = ''
    for kind, x in out:
        if kind == 'hi':
            if s and s[-1] not in ' "(': s += ' '
            s += x; continue
        if not x: continue
        lead = re.match(r'^[\s"\']*([,.!?;:…]*)', x).group(1)   # punctuation straight after a name stays with it
        body = x[len(re.match(r'^[\s"\']*[,.!?;:…]*', x).group(0)):]
        s += lead
        if re.search(r'[A-Za-z]', body):
            if s and s[-1] != ' ': s += ' '
            s += tokenizer().phonemize(body.strip(), 'en-us')
        else:
            s += ''.join(c for c in body if c in ',.!?;:…')
    s = re.sub(r'\s+', ' ', s).strip()
    return s if s[-1:] in '.!?…' else s + '.'   # every line ends like a sentence, so the voice comes down gently

def sentences(text):
    parts = re.split(r'(?<=[.!?…])["\']?\s+', clean(text).strip())
    return [p for p in parts if re.search(r'[A-Za-zऀ-ॿ]', p)]

class Narrator:
    def __init__(self, models, cache):
        from kokoro_onnx import Kokoro
        self.k = Kokoro(os.path.join(models, 'kokoro-v1.0.onnx'), os.path.join(models, 'voices-v1.0.bin'))
        self.voice = .6 * self.k.get_voice_style('hm_omega') + .4 * self.k.get_voice_style('am_onyx')   # a synthetic narrator, not any real person
        self.cache = cache; os.makedirs(cache, exist_ok=True); self.SR = 24000

    def _sentence(self, ph, speed):
        import soundfile as sf
        f = os.path.join(self.cache, hashlib.sha1(f'{VERSION}|{speed}|{ph}'.encode()).hexdigest()[:16] + '.wav')
        if not os.path.exists(f):
            s, sr = self.k.create(ph, voice=self.voice, speed=speed, is_phonemes=True, trim=True); sf.write(f, s, sr)
        s, _ = sf.read(f, dtype='float32'); return s

    def say(self, text, speed=SPEED):
        """The whole line: each sentence with soft edges and a calm pause between them."""
        out = []
        for i, sen in enumerate(sentences(text)):
            s = self._sentence(phonemes(sen), speed).copy()
            a, b = int(.012 * self.SR), int(.06 * self.SR)
            s[:a] *= np.linspace(0, 1, a); s[-b:] *= np.linspace(1, 0, b)
            if i: out.append(np.zeros(int(SENTENCE_PAUSE * self.SR), dtype=np.float32))
            out.append(s)
        return np.concatenate(out) if out else np.zeros(1, dtype=np.float32)

if __name__ == '__main__':
    import sys
    for line in sys.argv[1:]:
        for sen in sentences(line): print(sen, '\n   ', phonemes(sen))
