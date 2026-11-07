// The ending, after the story: what Diwali means, what the Ramayana teaches, the ten avatars of Vishnu,
// the Ram Mandir in Ayodhya and Ram Lalla (real photos, if they are in wall/photos/), and Jai Shri Ram.
// Each card stays up as long as a slow young reader needs (the same rule as the story's captions).
window.VishnuOutro = (function () {
  const NT = window.NARR_TIMES || {}, wc = (t) => (t ? t.split(/\s+/).length : 0), speak = (t) => (t ? NT[t] || wc(t) / 2.3 : 0), readT = (t) => (t ? .6 + speak(t) + 1.2 : 0);   // timed by the narrator's voice
  const AV = [
    ['Matsya, the fish', 'saved the good king Manu and all living things from a great flood.'],
    ['Kurma, the tortoise', 'held up the mountain on his back when the gods and demons churned the ocean.'],
    ['Varaha, the boar', 'lifted the Earth out of the deep ocean on his tusks.'],
    ['Narasimha, the man-lion', 'came out of a pillar to protect the young devotee Prahlada.'],
    ['Vamana, the small boy', 'grew giant and covered the whole world in three steps.'],
    ['Parashurama, the warrior sage', 'stood up against cruel and unjust kings.'],
    ['Rama, the prince of Ayodhya', 'the hero of our story, who always did what was right.'],
    ['Krishna, the cowherd', 'played the flute and guided his friend Arjuna in the Mahabharata.'],
    ['Balarama, the strong one', "Krishna's elder brother, who carries a plough."],
    ['Kalki, the rider on a white horse', 'who, the stories say, will come at the end of this age to bring back goodness.'],
  ];
  const H_DIWALI = { book: 'EPILOGUE', name: 'THE FESTIVAL OF LIGHTS', sub: '' }, H_LESSONS = { book: 'EPILOGUE', name: 'WHAT THE RAMAYANA TEACHES US', sub: '' },
    H_AV = { book: 'EPILOGUE', name: 'THE TEN AVATARS OF VISHNU', sub: '' }, H_AYO = { book: 'EPILOGUE', name: 'AYODHYA TODAY', sub: '' };
  const P = () => window.PHOTOS || {};
  const CARDS = [
    { k: 'diwali', h: H_DIWALI, en: 'Why do we light lamps on Diwali? When Ram, Sita and Lakshman came home, Ayodhya glowed with lamps to welcome them.' },
    { k: 'diwali', h: H_DIWALI, en: 'Every Diwali, we light diyas to remember: light wins over darkness, and good wins over evil.' },
    { k: 'lessons', h: H_LESSONS, en: 'Keep your promises, like Ram. Be a true friend, like Hanuman. Love your family, like Lakshman and Bharata.' },
    { k: 'lessons', h: H_LESSONS, en: 'Be brave and truthful, like Sita. Be kind, even to people who are unkind. And always choose what is right.' },
    { k: 'avatars', h: H_AV, en: 'Ram is one of the ten avatars of Vishnu. An avatar is a form Vishnu takes to come and help the world. Here they are.' },
    ...AV.map(([name, what], i) => ({ k: 'avatar', i, h: H_AV, en: `${i + 1}. ${name}, ${what}` })),
    { k: 'mandir', h: H_AYO, en: "This is the Ram Mandir in Ayodhya, Ram's city. Its doors opened to everyone in January 2024.", credit: 'mandir' },
    { k: 'lalla', h: H_AYO, en: 'Inside is Ram Lalla: Ram as a little child, carved in dark stone.', credit: 'lalla' },
    { k: 'final', h: null, en: '', dur: 10 },
  ];
  let t0 = 0; for (const c of CARDS) { c.t0 = t0; c.dur = c.dur || readT(c.en) + 1.8; t0 += c.dur; }
  const DUR = t0;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), ss = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const at = (t) => CARDS.find(c => t >= c.t0 && t < c.t0 + c.dur) || CARDS[CARDS.length - 1];
  function caption(t) {
    const c = at(t), u = t - c.t0, a = ss(0, .9, u) * (1 - ss(c.dur - .9, c.dur, u)), ph = P();
    const credit = c.credit && ph[c.credit] ? 'Photo: ' + ph[c.credit].credit : '';
    const kSeg = CARDS.filter(x => x.h === c.h), k0 = kSeg.length ? kSeg[0].t0 : 0, k1 = kSeg.length ? kSeg[kSeg.length - 1].t0 + kSeg[kSeg.length - 1].dur : 0;
    return { en: c.en, moral: credit, a, am: credit ? a : 0, age: u, rate: c.en ? wc(c.en) / speak(c.en) : 3, kanda: c.h ? Object.assign({ age: t - k0, a: ss(k0, k0 + 1.2, t) * (1 - ss(k1 - 1, k1, t)) }, c.h) : null, final: c.k === 'final' ? u : undefined };
  }
  // ---- drawing ----
  function diyas(c, w, H, t, n, y, scale, alpha) {   // a row of clay lamps with flickering flames
    for (let k = 0; k < n; k++) {
      const x = (k + .5) * w / n, s = scale * (.85 + .15 * Math.sin(k * 2.3)), fl = .8 + .2 * Math.sin(t * 9 + k * 1.7) * Math.sin(t * 5.3 + k);
      c.save(); c.globalAlpha = alpha; const g = c.createRadialGradient(x, y - s * .9, 1, x, y - s * .9, s * 2.4); g.addColorStop(0, 'rgba(255,190,80,.55)'); g.addColorStop(1, 'rgba(255,120,20,0)'); c.fillStyle = g; c.fillRect(x - s * 2.5, y - s * 3.4, s * 5, s * 5);
      c.fillStyle = '#b4501a'; c.beginPath(); c.ellipse(x, y, s * .9, s * .32, 0, 0, Math.PI); c.fill(); c.fillStyle = '#e07a2a'; c.beginPath(); c.ellipse(x, y, s * .9, s * .14, 0, 0, 6.283); c.fill();
      const fh = s * .9 * fl; c.fillStyle = '#ffd36a'; c.beginPath(); c.moveTo(x - s * .16, y - s * .05); c.quadraticCurveTo(x, y - fh * 1.2, x + s * .02, y - fh); c.quadraticCurveTo(x + s * .05, y - fh * .5, x + s * .16, y - s * .05); c.fill();
      c.fillStyle = '#fff6d8'; c.beginPath(); c.ellipse(x, y - fh * .35, s * .06, fh * .18, 0, 0, 6.283); c.fill(); c.restore();
    }
  }
  function sparks(c, w, H, t, n, alpha) { c.save(); for (let k = 0; k < n; k++) { const x = ((k * 97.3 + t * 12 * (1 + k % 3)) % w), y = H * (1 - ((k * 37.1 + t * 18 * (1 + k % 4)) % H) / H), a = (.4 + .6 * Math.sin(t * 3 + k)) * alpha; c.globalAlpha = Math.max(0, a) * .8; c.fillStyle = k % 3 ? '#ffd27a' : '#ffffff'; c.beginPath(); c.arc(x, y, 1 + (k % 3), 0, 6.283); c.fill(); } c.restore(); }
  function cover(c, im, x, y, w, h, contain) { const r = im.width / im.height, R = w / h; let dw = w, dh = h; if (contain ? r > R : r < R) dh = w / r; else dw = h * r; c.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); }
  const imgs = {};
  function photo(key) { const p = P()[key]; if (!p) return null; if (!imgs[key]) { const im = new Image(); im.src = p.src; imgs[key] = im; } return imgs[key].complete && imgs[key].naturalWidth ? imgs[key] : null; }
  function temple(c, cx, by, hh) {   // a drawn stand-in for the temple, used when no photo has been added
    c.save(); const g = c.createLinearGradient(0, by - hh, 0, by); g.addColorStop(0, '#ffe2b0'); g.addColorStop(1, '#c88a50'); c.fillStyle = g;
    const w = hh * 2.2; c.fillRect(cx - w / 2, by - hh * .35, w, hh * .35);
    for (const [dx, sh] of [[-.32, .55], [0, 1], [.32, .55]]) { const x = cx + dx * w, s = hh * sh; c.beginPath(); c.moveTo(x - s * .3, by - hh * .35); c.quadraticCurveTo(x - s * .28, by - hh * .35 - s * .7, x, by - hh * .35 - s * .95); c.quadraticCurveTo(x + s * .28, by - hh * .35 - s * .7, x + s * .3, by - hh * .35); c.fill(); }
    c.fillStyle = '#ff9a1a'; c.beginPath(); c.moveTo(cx, by - hh * 1.32); c.lineTo(cx + hh * .14, by - hh * 1.26); c.lineTo(cx, by - hh * 1.2); c.fill(); c.restore();
  }
  function lotus(c, cx, cy, r, t) {   // a glowing lotus with soft rays
    c.save(); const g = c.createRadialGradient(cx, cy, 2, cx, cy, r * 2.4); g.addColorStop(0, 'rgba(255,220,150,.55)'); g.addColorStop(1, 'rgba(255,160,60,0)'); c.fillStyle = g; c.fillRect(cx - r * 2.5, cy - r * 2.5, r * 5, r * 5);
    for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283 + t * .1; c.globalAlpha = .18; c.strokeStyle = '#ffe2a0'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * r * 1.1, cy + Math.sin(a) * r * 1.1); c.lineTo(cx + Math.cos(a) * r * 2.2, cy + Math.sin(a) * r * 2.2); c.stroke(); }
    c.globalAlpha = 1; for (const [n, sc, col] of [[9, 1, '#ff8ab4'], [7, .75, '#ffb0cc'], [5, .5, '#ffe0ea']]) for (let k = 0; k < n; k++) { const a = Math.PI + (k + .5) / n * Math.PI; c.save(); c.translate(cx, cy + r * .5); c.rotate(a + Math.PI / 2); c.fillStyle = col; c.beginPath(); c.ellipse(0, -r * .55 * sc, r * .18 * sc, r * .55 * sc, 0, 0, 6.283); c.fill(); c.restore(); }
    c.fillStyle = '#ffd24a'; c.beginPath(); c.arc(cx, cy + r * .45, r * .14, 0, 6.283); c.fill(); c.restore();
  }
  function drawBand(c, w, h, t, s, stills) {
    c.save(); c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.scale(1, s); const H = h / s, card = at(t), u = t - card.t0, fade = ss(0, .8, u) * (1 - ss(card.dur - .8, card.dur, u));
    if (card.k === 'diwali' || card.k === 'final' || card.k === 'lessons') { diyas(c, w, H, t, Math.max(6, Math.round(w / H * 2.2)), H * .9, H * .14, 1); sparks(c, w, H * .8, t, 60, card.k === 'lessons' ? .5 : 1); }
    if (card.k === 'lessons' && stills) { const im = stills[6], ph = H * .78, pw = ph * .75; c.globalAlpha = fade; c.drawImage(im, w / 2 - pw / 2, H * .02, pw, ph); c.globalAlpha = 1; }
    if (card.k === 'avatars' && stills) { const q = w / 10, ph = Math.min(H * .9, q / .75 * .96), pw = ph * .75; for (let k = 0; k < 10; k++) { c.globalAlpha = ss(k * .25, k * .25 + .6, u) * fade; c.drawImage(stills[k], q * (k + .5) - pw / 2, (H - ph) / 2, pw, ph); } c.globalAlpha = 1; }
    if (card.k === 'avatar' && stills) {   // the avatar large in the middle, its neighbours small and dim
      const ph = H * .94, pw = ph * .75; for (let d = -4; d <= 4; d++) { const j = card.i + d; if (j < 0 || j > 9 || d === 0) continue; const sc = .55 - Math.abs(d) * .06, x = w / 2 + d * pw * .62 * (1 + Math.abs(d) * .05); c.globalAlpha = .35 * fade; c.drawImage(stills[j], x - pw * sc / 2, (H - ph * sc) / 2, pw * sc, ph * sc); }
      c.globalAlpha = fade; const g = c.createRadialGradient(w / 2, H / 2, 10, w / 2, H / 2, ph * .8); g.addColorStop(0, 'rgba(255,200,120,.25)'); g.addColorStop(1, 'rgba(255,200,120,0)'); c.fillStyle = g; c.fillRect(0, 0, w, H);
      c.drawImage(stills[card.i], w / 2 - pw / 2, (H - ph) / 2, pw, ph); c.strokeStyle = 'rgba(255,214,140,.7)'; c.lineWidth = 2; c.strokeRect(w / 2 - pw / 2, (H - ph) / 2, pw, ph); c.globalAlpha = 1;
    }
    if (card.k === 'mandir' || card.k === 'lalla') {
      const im = photo(card.k === 'mandir' ? 'mandir' : 'lalla'), ph = H * .94; c.globalAlpha = fade;
      if (im) { const pw = Math.min(w * .92, ph * im.width / im.height), x = w / 2 - pw / 2, y = (H - ph) / 2; c.save(); c.shadowColor = 'rgba(255,190,90,.8)'; c.shadowBlur = 30; c.fillStyle = '#000'; c.fillRect(x, y, pw, ph); c.restore(); cover(c, im, x, y, pw, ph, true); c.strokeStyle = '#f0c870'; c.lineWidth = 3; c.strokeRect(x, y, pw, ph); }
      else if (card.k === 'mandir') temple(c, w / 2, H * .92, H * .62); else lotus(c, w / 2, H * .62, H * .3, t);   // until a real photo is added: a drawn temple, or a glowing lotus (never a made-up murti)
      c.globalAlpha = 1; diyas(c, w, H, t, Math.max(6, Math.round(w / H * 2.2)), H * .97, H * .08, .8 * fade);
    }
    if (card.k === 'final') { const a = ss(0, 1.2, u) * (1 - ss(card.dur - 1.2, card.dur, u)); c.globalAlpha = a; c.textAlign = 'center'; c.textBaseline = 'middle'; const fs = Math.min(H * .5, w * .12);
      const g = c.createLinearGradient(0, H * .3, 0, H * .7); g.addColorStop(0, '#fff6d8'); g.addColorStop(.5, '#ffcf6a'); g.addColorStop(1, '#ff8a20'); c.fillStyle = g; c.shadowColor = 'rgba(255,160,40,.9)'; c.shadowBlur = fs * .35;
      c.font = `700 ${fs}px Cinzel, Georgia, serif`; c.fillText('JAI SHRI RAM', w / 2, H * .45, w * .9); c.globalAlpha = 1; }
    c.restore();
  }
  function drawFinalText(c, w, h, u) {   // in the story-text area: Jai Shri Ram, and Happy Diwali
    const a = ss(0, 1.2, u) * (1 - ss(8.8, 10, u)); c.save(); c.globalAlpha = a; c.textAlign = 'center'; c.textBaseline = 'middle';
    const g = c.createLinearGradient(0, h * .2, 0, h * .7); g.addColorStop(0, '#fff6d8'); g.addColorStop(.5, '#ffcf6a'); g.addColorStop(1, '#ff8a20'); c.fillStyle = g; c.shadowColor = 'rgba(255,160,40,.9)'; c.shadowBlur = h * .08;
    c.font = `700 ${Math.min(h * .34, w * .1)}px Cinzel, Georgia, serif`; c.fillText('Jai Shri Ram', w / 2, h * .42); c.shadowBlur = 0;
    c.globalAlpha = a * ss(1.5, 2.5, u); c.fillStyle = '#9adfff'; c.font = `italic 600 ${h * .14}px "Cormorant Garamond", Georgia, serif`; c.fillText('Happy Diwali', w / 2, h * .78); c.restore();
  }
  return { DUR, CARDS, caption, drawBand, drawFinalText };
})();
