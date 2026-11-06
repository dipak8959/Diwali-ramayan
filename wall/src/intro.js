// The opening titles: a fast flip-book of Vishnu's ten avatars (the Dashavatara), in the style of a superhero studio intro,
// ending on a red title box with VISHNU, then "presents The Ramayana". Drawn in 2D, in comic-book style.
window.VishnuIntro = (function () {
  const DUR = 16;
  const AV = [
    ['MATSYA', 'the fish', ['#0a6a9a', '#05223a'], '#7af0ff'], ['KURMA', 'the tortoise', ['#1a8a6a', '#062a22'], '#9affd0'],
    ['VARAHA', 'the boar', ['#3a4ab0', '#0c0f3a'], '#a8b8ff'], ['NARASIMHA', 'the man-lion', ['#e0501a', '#3a0a04'], '#ffd070'],
    ['VAMANA', 'the dwarf', ['#e0a020', '#4a2a04'], '#fff0a0'], ['PARASHURAMA', 'the warrior sage', ['#b01a2a', '#2a0408'], '#ffb0a0'],
    ['RAMA', 'the prince of Ayodhya', ['#ff9a1a', '#4a1a00'], '#ffe8a0'], ['KRISHNA', 'the cowherd', ['#5a2ab0', '#14062e'], '#c8a8ff'],
    ['BALARAMA', 'the ploughman', ['#7a90b0', '#141c2a'], '#eef4ff'], ['KALKI', 'the one who is to come', ['#4a1a6a', '#0a0414'], '#e0b0ff'],
  ];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ss = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const PW = 300, PH = 400, cache = [];
  // ---- a simple figure, drawn as one shape so it can be lit from behind (rim light) ----
  function seg(c, p, q, w1, w2) {   // a tapered limb from p to q
    const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    c.beginPath(); c.moveTo(p[0] + nx * w1 / 2, p[1] + ny * w1 / 2); c.lineTo(q[0] + nx * w2 / 2, q[1] + ny * w2 / 2); c.lineTo(q[0] - nx * w2 / 2, q[1] - ny * w2 / 2); c.lineTo(p[0] - nx * w1 / 2, p[1] - ny * w1 / 2); c.fill();
    c.beginPath(); c.arc(p[0], p[1], w1 / 2, 0, 6.283); c.arc(q[0], q[1], w2 / 2, 0, 6.283); c.fill();
  }
  function figure(c, o) {
    const { x, y, h } = o, at = (fx, fy) => [x + fx * h, y - fy * h], hand = [];
    const legs = o.legs || [.06, -.06];
    for (const [k, sx] of [[0, -1], [1, 1]]) { const hip = at(sx * .05, .5), knee = [hip[0] + Math.sin(legs[k]) * .25 * h, hip[1] + Math.cos(legs[k]) * .25 * h], ank = [knee[0] + Math.sin(legs[k] * .4) * .22 * h, knee[1] + Math.cos(legs[k] * .4) * .22 * h];
      seg(c, hip, knee, .1 * h, .07 * h); seg(c, knee, ank, .07 * h, .045 * h); c.beginPath(); c.ellipse(ank[0] + .035 * h, ank[1] + .01 * h, .05 * h, .02 * h, 0, 0, 6.283); c.fill(); }
    // dhoti, flaring to the knees, and the torso: broad shoulders, narrow waist
    c.beginPath(); const W = at(0, .56); c.moveTo(W[0] - .1 * h, W[1]); c.bezierCurveTo(W[0] - .12 * h, W[1] + .1 * h, W[0] - .13 * h, W[1] + .2 * h, W[0] - .12 * h, W[1] + .28 * h); c.lineTo(W[0] + .12 * h, W[1] + .28 * h); c.bezierCurveTo(W[0] + .13 * h, W[1] + .2 * h, W[0] + .12 * h, W[1] + .1 * h, W[0] + .1 * h, W[1]); c.fill();
    const S = at(0, .79); c.beginPath(); c.moveTo(W[0] - .09 * h, W[1]); c.bezierCurveTo(W[0] - .085 * h, W[1] - .1 * h, S[0] - .15 * h, S[1] + .07 * h, S[0] - .13 * h, S[1]); c.quadraticCurveTo(S[0], S[1] - .03 * h, S[0] + .13 * h, S[1]); c.bezierCurveTo(S[0] + .15 * h, S[1] + .07 * h, W[0] + .085 * h, W[1] - .1 * h, W[0] + .09 * h, W[1]); c.fill();
    const arm = (sh, a1, a2, len) => { const el = [sh[0] + Math.sin(a1) * len, sh[1] + Math.cos(a1) * len], wr = [el[0] + Math.sin(a2) * len * .95, el[1] + Math.cos(a2) * len * .95]; seg(c, sh, el, .075 * h, .058 * h); seg(c, el, wr, .058 * h, .042 * h); c.beginPath(); c.arc(wr[0], wr[1], .032 * h, 0, 6.283); c.fill(); return wr; };
    const arms = o.arms || [[.25, .1], [-.25, -.1]];
    hand.push(arm(at(-.12, .77), arms[0][0], arms[0][1], .2 * h)); hand.push(arm(at(.12, .77), arms[1][0], arms[1][1], .2 * h));
    if (o.arms4) { hand.push(arm(at(-.12, .74), o.arms4[0][0], o.arms4[0][1], .18 * h)); hand.push(arm(at(.12, .74), o.arms4[1][0], o.arms4[1][1], .18 * h)); }
    seg(c, at(0, .79), at(0, .85), .06 * h, .055 * h);
    const hd = at(o.headDx || 0, .905), r = .062 * h * (o.headScale || 1);
    if (o.head === 'boar') { c.beginPath(); c.ellipse(hd[0] + r * .6, hd[1] + r * .1, r * 1.6, r * 1.05, -.3, 0, 6.283); c.fill(); for (const e of [-1, 1]) { c.beginPath(); c.moveTo(hd[0] + e * r * .5 - r * .3, hd[1] - r * .7); c.lineTo(hd[0] + e * r * .4, hd[1] - r * 1.9); c.lineTo(hd[0] + e * r * .5 + r * .3, hd[1] - r * .6); c.fill(); } }
    else if (o.head === 'lion') { c.beginPath(); for (let k = 0; k <= 30; k++) { const a = k / 30 * 6.283, rr = r * (k % 2 ? 1.35 : 2.1); c.lineTo(hd[0] + Math.cos(a) * rr, hd[1] + Math.sin(a) * rr); } c.fill(); }
    else { c.beginPath(); c.ellipse(hd[0], hd[1], r * .88, r * 1.08, 0, 0, 6.283); c.fill(); c.beginPath(); c.ellipse(hd[0] + r * .2, hd[1] + r * .35, r * .55, r * .7, 0, 0, 6.283); c.fill(); }
    if (o.crown) { const tall = o.crown === 'tall' ? 1 : .7, b = hd[1] - r * .7; c.beginPath(); c.moveTo(hd[0] - r * 1.05, b); c.lineTo(hd[0] + r * 1.05, b); c.lineTo(hd[0] + r * .8, b - r * .9 * tall); c.lineTo(hd[0] + r * .95, b - r * 1.05 * tall); c.lineTo(hd[0] + r * .5, b - r * 2 * tall); c.lineTo(hd[0] + r * .6, b - r * 2.15 * tall); c.lineTo(hd[0], b - r * 3.4 * tall); c.lineTo(hd[0] - r * .6, b - r * 2.15 * tall); c.lineTo(hd[0] - r * .5, b - r * 2 * tall); c.lineTo(hd[0] - r * .95, b - r * 1.05 * tall); c.lineTo(hd[0] - r * .8, b - r * .9 * tall); c.closePath(); c.fill(); }
    if (o.bun) { c.beginPath(); c.arc(hd[0] - r * .1, hd[1] - r * 1.25, r * .6, 0, 6.283); c.fill(); }
    if (o.hair) { c.beginPath(); c.moveTo(hd[0] - r * .8, hd[1] - r * .2); c.quadraticCurveTo(hd[0] - r * 1.6, hd[1] + r * 1.5, hd[0] - r * 1.1, hd[1] + r * 2.6); c.lineTo(hd[0] - r * .3, hd[1] + r * 1.2); c.fill(); }
    return { hand, hd, r };
  }
  function lit(c, paint, rim, dark) {   // rim light: the shape in a bright colour, then again in dark, a little offset
    c.save(); c.shadowColor = rim; c.shadowBlur = 18; c.fillStyle = c.strokeStyle = rim; paint(c); c.restore();
    c.save(); c.translate(3, 2.4); c.fillStyle = c.strokeStyle = dark || '#0c0712'; paint(c); c.restore();
  }
  function art(i, c) {
    const [, , bg, rim] = AV[i], W = PW, H = PH, g = c.createRadialGradient(W * .5, H * .38, 10, W * .5, H * .5, H * .75); g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.save(); c.globalAlpha = .18; c.strokeStyle = rim; c.lineWidth = 1.2; for (let k = 0; k < 40; k++) { const a = k / 40 * 6.283; c.beginPath(); c.moveTo(W / 2, H * .4); c.lineTo(W / 2 + Math.cos(a) * H, H * .4 + Math.sin(a) * H); c.stroke(); } c.restore();   // speed lines
    const P = (fn) => lit(c, fn, rim);
    if (i === 0) {   // Matsya: a great horned fish leaping from the flood
      c.save(); c.globalAlpha = .7; c.strokeStyle = '#9ae8ff'; c.lineWidth = 4; for (let k = 0; k < 4; k++) { c.beginPath(); for (let x = 0; x <= W; x += 6) c.lineTo(x, H * .8 + k * 16 + Math.sin(x * .05 + k) * 7); c.stroke(); } c.restore();
      P((c) => { c.beginPath(); c.moveTo(60, 300); c.bezierCurveTo(70, 150, 230, 110, 250, 150); c.bezierCurveTo(230, 210, 120, 250, 60, 300); c.fill(); c.beginPath(); c.moveTo(70, 290); c.lineTo(20, 330); c.lineTo(40, 270); c.fill(); c.beginPath(); c.moveTo(70, 290); c.lineTo(40, 345); c.lineTo(95, 300); c.fill(); c.beginPath(); c.moveTo(232, 140); c.lineTo(262, 92); c.lineTo(244, 146); c.fill(); });
    } else if (i === 1) {   // Kurma: the tortoise bearing the churning mountain
      P((c) => { c.beginPath(); c.ellipse(150, 330, 120, 46, 0, Math.PI, 0); c.fill(); c.fillRect(30, 326, 240, 14); c.beginPath(); c.ellipse(278, 330, 24, 16, 0, 0, 6.283); c.fill(); c.beginPath(); c.moveTo(80, 300); c.lineTo(150, 80); c.lineTo(220, 300); c.fill(); });
      c.save(); c.strokeStyle = '#3affb0'; c.lineWidth = 7; c.shadowColor = '#3affb0'; c.shadowBlur = 12; c.beginPath(); for (let t = 0; t <= 1; t += .02) c.lineTo(110 + 80 * t + Math.sin(t * 18) * 26 * (1 - t * .4), 280 - t * 170); c.stroke(); c.restore();
    } else if (i === 2) {   // Varaha: the boar lifting the Earth
      P((c) => { const q = figure(c, { x: 150, y: 332, h: 250, head: 'boar', legs: [.3, -.25], arms: [[2.5, 2.9], [-2.5, -2.9]] }); void q; });
      c.save(); c.fillStyle = '#2a7aff'; c.shadowColor = '#7ab0ff'; c.shadowBlur = 16; c.beginPath(); c.arc(150, 46, 34, 0, 6.283); c.fill(); c.fillStyle = '#3ad07a'; c.beginPath(); c.ellipse(140, 40, 14, 9, .5, 0, 6.283); c.ellipse(164, 58, 9, 6, -.4, 0, 6.283); c.fill(); c.restore();
    } else if (i === 3) {   // Narasimha: the man-lion bursting from the pillar
      c.save(); c.fillStyle = 'rgba(255,220,160,.25)'; c.fillRect(20, 40, 40, 360); c.fillRect(240, 40, 40, 360); c.restore();
      P((c) => figure(c, { x: 150, y: 332, h: 270, head: 'lion', headScale: 1.25, arms: [[-2.3, -2.9], [2.3, 2.9]], arms4: [[-1.3, -2.1], [1.3, 2.1]], legs: [.35, -.35] }));
    } else if (i === 4) {   // Vamana: the boy with the parasol, and the giant stride
      c.save(); c.globalAlpha = .35; c.fillStyle = rim; c.beginPath(); c.ellipse(210, 90, 70, 34, -.5, 0, 6.283); c.fill(); c.restore();
      P((c) => { const q = figure(c, { x: 140, y: 332, h: 170, bun: true, arms: [[2.6, 3], [.4, .2]] }); c.lineWidth = 4; c.beginPath(); c.moveTo(q.hand[0][0], q.hand[0][1]); c.lineTo(q.hand[0][0], q.hand[0][1] - 90); c.stroke(); c.beginPath(); c.arc(q.hand[0][0], q.hand[0][1] - 88, 56, Math.PI, 0); c.fill(); c.beginPath(); c.arc(q.hand[1][0], q.hand[1][1] + 6, 12, 0, 6.283); c.fill(); });
    } else if (i === 5) {   // Parashurama: the sage with the axe
      P((c) => { const q = figure(c, { x: 150, y: 332, h: 270, bun: true, hair: true, legs: [.3, -.2], arms: [[-2.6, -3.0], [.5, .2]] }); c.lineWidth = 7; c.beginPath(); c.moveTo(q.hand[0][0], q.hand[0][1] + 40); c.lineTo(q.hand[0][0], q.hand[0][1] - 70); c.stroke(); c.beginPath(); c.moveTo(q.hand[0][0], q.hand[0][1] - 70); c.quadraticCurveTo(q.hand[0][0] - 60, q.hand[0][1] - 60, q.hand[0][0] - 54, q.hand[0][1] - 20); c.lineTo(q.hand[0][0], q.hand[0][1] - 34); c.fill(); });
    } else if (i === 6) {   // Rama: the archer prince
      P((c) => { const q = figure(c, { x: 120, y: 332, h: 270, crown: 'tall', arms: [[-1.75, 1.45], [1.57, 1.57]], legs: [.3, -.25] }); c.lineWidth = 6; c.beginPath(); c.moveTo(q.hand[1][0] - 6, q.hand[1][1] - 110); c.quadraticCurveTo(q.hand[1][0] + 60, q.hand[1][1], q.hand[1][0] - 6, q.hand[1][1] + 110); c.stroke(); c.lineWidth = 2; c.beginPath(); c.moveTo(q.hand[1][0] - 6, q.hand[1][1] - 110); c.lineTo(q.hand[0][0] - 20, q.hand[0][1]); c.lineTo(q.hand[1][0] - 6, q.hand[1][1] + 110); c.stroke(); c.lineWidth = 3; c.beginPath(); c.moveTo(q.hand[0][0] - 20, q.hand[0][1]); c.lineTo(q.hand[1][0] + 60, q.hand[1][1]); c.stroke(); });
      c.save(); c.fillStyle = '#fff2b0'; c.shadowColor = '#ffb040'; c.shadowBlur = 20; c.beginPath(); c.arc(266, 228, 6, 0, 6.283); c.fill(); c.restore();
    } else if (i === 7) {   // Krishna: the flute, the peacock feather and the discus
      c.save(); c.strokeStyle = '#ffd86a'; c.lineWidth = 5; c.shadowColor = '#ffd86a'; c.shadowBlur = 16; c.beginPath(); c.arc(236, 92, 34, 0, 6.283); c.stroke(); for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; c.beginPath(); c.moveTo(236 + Math.cos(a) * 34, 92 + Math.sin(a) * 34); c.lineTo(236 + Math.cos(a) * 46, 92 + Math.sin(a) * 46); c.stroke(); } c.restore();
      P((c) => { const q = figure(c, { x: 130, y: 332, h: 270, crown: true, arms: [[2.2, 1.3], [1.0, 2.3]], legs: [.05, -.35] }); c.lineWidth = 5; c.beginPath(); c.moveTo(q.hd[0] - 10, q.hd[1] + 18); c.lineTo(q.hd[0] + 90, q.hd[1] + 30); c.stroke(); c.beginPath(); c.ellipse(q.hd[0] + 8, q.hd[1] - 44, 10, 24, .4, 0, 6.283); c.fill(); });
      c.save(); c.fillStyle = '#3ad0b0'; c.shadowColor = '#3ad0b0'; c.shadowBlur = 10; c.beginPath(); c.arc(150, 112, 7, 0, 6.283); c.fill(); c.fillStyle = '#1a3aff'; c.beginPath(); c.arc(150, 112, 3.5, 0, 6.283); c.fill(); c.restore();
    } else if (i === 8) {   // Balarama: the plough over the shoulder
      P((c) => { const q = figure(c, { x: 150, y: 332, h: 270, crown: true, legs: [.2, -.2], arms: [[2.7, 3.0], [-.4, -.1]] }); c.lineWidth = 7; c.beginPath(); c.moveTo(q.hand[0][0] - 50, q.hand[0][1] + 80); c.lineTo(q.hand[0][0] + 40, q.hand[0][1] - 70); c.stroke(); c.beginPath(); c.moveTo(q.hand[0][0] + 40, q.hand[0][1] - 70); c.quadraticCurveTo(q.hand[0][0] + 80, q.hand[0][1] - 70, q.hand[0][0] + 70, q.hand[0][1] - 20); c.lineTo(q.hand[0][0] + 52, q.hand[0][1] - 40); c.fill(); });
    } else {   // Kalki: the rider on the white horse, sword raised
      c.save(); c.strokeStyle = '#e0c0ff'; c.lineWidth = 3; c.shadowColor = '#c080ff'; c.shadowBlur = 14; c.beginPath(); c.moveTo(240, 10); c.lineTo(210, 70); c.lineTo(232, 74); c.lineTo(200, 140); c.stroke(); c.restore();
      lit(c, (c) => {
        c.beginPath(); c.moveTo(70, 330); c.bezierCurveTo(60, 280, 110, 236, 170, 226); c.bezierCurveTo(200, 222, 214, 206, 222, 180); c.bezierCurveTo(228, 150, 246, 128, 268, 132);   // back, neck
        c.bezierCurveTo(284, 136, 292, 150, 290, 160); c.lineTo(270, 168); c.bezierCurveTo(258, 178, 252, 196, 250, 214); c.bezierCurveTo(246, 244, 220, 270, 196, 286); c.bezierCurveTo(160, 304, 120, 320, 70, 330); c.fill();   // head, chest, belly
        c.beginPath(); c.moveTo(232, 140); c.quadraticCurveTo(206, 150, 196, 196); c.lineTo(214, 190); c.quadraticCurveTo(218, 160, 240, 146); c.fill();   // mane
        c.beginPath(); c.moveTo(262, 132); c.lineTo(258, 112); c.lineTo(270, 128); c.fill();   // ear
        seg(c, [214, 250], [246, 222], 18, 12); seg(c, [246, 222], [262, 252], 12, 9); seg(c, [196, 266], [232, 244], 18, 12); seg(c, [232, 244], [244, 276], 12, 9);   // front legs, raised
        seg(c, [92, 312], [70, 360], 22, 13); seg(c, [70, 360], [84, 392], 13, 10); seg(c, [120, 316], [118, 362], 20, 13); seg(c, [118, 362], [132, 394], 13, 10);   // hind legs
        c.beginPath(); c.moveTo(72, 300); c.quadraticCurveTo(30, 300, 26, 350); c.quadraticCurveTo(48, 322, 78, 318); c.fill();   // tail
        const q = figure(c, { x: 168, y: 300, h: 150, crown: true, legs: [.9, .6], arms: [[-2.6, -2.9], [.6, 1.2]] }); c.lineWidth = 3; }, '#f4eeff', '#1a1028');
      c.save(); c.strokeStyle = '#ffffff'; c.lineWidth = 4; c.shadowColor = '#a0e0ff'; c.shadowBlur = 16; c.beginPath(); c.moveTo(200, 168); c.lineTo(232, 70); c.stroke(); c.restore();
    }
    // halftone dots and a comic frame
    c.save(); c.globalAlpha = .12; c.fillStyle = '#000'; for (let yy = 4; yy < H; yy += 8) for (let xx = (yy / 8 % 2) * 4; xx < W; xx += 8) { c.beginPath(); c.arc(xx, yy, 1.6 + 1.6 * (yy / H), 0, 6.283); c.fill(); } c.restore();
    c.lineWidth = 8; c.strokeStyle = '#05030a'; c.strokeRect(4, 4, W - 8, H - 8);
  }
  const named = [];
  function still(i) {   // the picture alone: the 3D render if available, else the 2D art
    if (window.R3 && R3.avatarStills) { try { return R3.avatarStills()[i]; } catch (e) { /* fall back to 2D */ } }
    if (cache[i]) return cache[i]; const cv = document.createElement('canvas'); cv.width = PW; cv.height = PH; art(i, cv.getContext('2d')); return (cache[i] = cv);
  }
  function panel(i) {   // the picture with the avatar's name, for the line-up
    if (named[i] && named[i].ready === !!window.FONTS_READY) return named[i];
    const im = still(i), cv = document.createElement('canvas'); cv.width = 360; cv.height = 480; const c = cv.getContext('2d'); c.drawImage(im, 0, 0, 360, 480);
    const g = c.createLinearGradient(0, 360, 0, 480); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.85)'); c.fillStyle = g; c.fillRect(0, 360, 360, 120);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.font = '700 34px Cinzel, Georgia, serif'; if ('letterSpacing' in c) c.letterSpacing = '4px'; c.fillText(AV[i][0], 180, 430);
    c.font = 'italic 600 19px "Cormorant Garamond", Georgia, serif'; if ('letterSpacing' in c) c.letterSpacing = '0px'; c.fillStyle = AV[i][3]; c.fillText(AV[i][1], 180, 458);
    c.strokeStyle = 'rgba(255,220,150,.5)'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, 357, 477);
    cv.ready = !!window.FONTS_READY; return (named[i] = cv);
  }
  // which avatar a flipping panel shows at time t: slow at first, then faster and faster
  const flipIndex = (t, k) => { const ph = 1.6 * t + 3.2 * Math.max(0, t - 3) ** 1.8; return ((Math.floor(ph + k * 3.7) % 10) + 10) % 10; };
  const flipPhase = (t, k) => { const ph = 1.6 * t + 3.2 * Math.max(0, t - 3) ** 1.8 + k * 3.7; return ph - Math.floor(ph); };
  // ---- the long band above the doors ----
  function drawBand(c, w, h, t, s) {
    c.save(); c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.scale(1, s); const H = h / s;   // H: the height as seen on the wall
    const n = Math.max(3, Math.min(30, Math.round(w / H / .8))), pw = w / n, ph = Math.min(H * .92, pw / .75 * .98), pW = ph * .75, y0 = (H - ph) / 2;
    const flash = ss(8, 8.5, t) * (1 - ss(8.6, 9.4, t));
    if (t < 9) {
      const z = 1.25 - .25 * ss(.6, 8, t) + .4 * ss(8.2, 9, t), a = ss(.4, 1.2, t) * (1 - ss(8.6, 9, t));
      c.globalAlpha = a; c.translate(w / 2, H / 2); c.scale(z, z); c.translate(-w / 2, -H / 2);
      for (let k = 0; k < n; k++) { const i = flipIndex(t, k), f = flipPhase(t, k), turn = Math.max(0, (f - .78) / .22), sq = Math.cos(turn * Math.PI / 2), cx = pw * (k + .5);
        c.save(); c.translate(cx, y0 + ph / 2); c.globalAlpha = a * .35; c.drawImage(still((i + 9) % 10), -pW / 2 - pW * .06, -ph / 2, pW, ph); c.globalAlpha = a;
        c.transform(Math.max(.02, sq), -.12 * turn, 0, 1, 0, 0); c.drawImage(still(i), -pW / 2, -ph / 2, pW, ph);
        if (turn > 0) { c.fillStyle = `rgba(255,236,200,${(.7 * turn).toFixed(3)})`; c.fillRect(pW / 2 - 4, -ph / 2, 4, ph); } c.restore(); }
      c.setTransform(1, 0, 0, 1, 0, 0); c.scale(1, s);
    } else {   // the ten avatars in order, with Rama glowing
      const nn = 10, q = w / nn, P2 = Math.min(H * .9, q / .75 * .96), P2w = P2 * .75, yy = (H - P2) / 2, out = 1 - ss(14.4, 15.4, t);
      for (let k = 0; k < nn; k++) { const a = ss(9 + k * .12, 9.5 + k * .12, t) * out * (k === 6 ? 1 : 1 - .75 * ss(12.6, 13.4, t)), cx = q * (k + .5);
        c.globalAlpha = a; c.drawImage(panel(k), cx - P2w / 2, yy, P2w, P2);
        if (k === 6) { c.save(); c.globalAlpha = a * ss(12.4, 13.2, t); c.strokeStyle = '#ffd070'; c.shadowColor = '#ffb040'; c.shadowBlur = 30; c.lineWidth = 4; c.strokeRect(cx - P2w / 2, yy, P2w, P2); c.restore(); } }
      const sw = ((t - 9.4) / 2.4) * (w + 400) - 200; c.globalAlpha = .5 * ss(9.4, 9.8, t) * (1 - ss(11.6, 12, t)); const g = c.createLinearGradient(sw - 120, 0, sw + 120, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,240,210,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(sw - 120, 0, 240, H);
    }
    c.globalAlpha = 1; if (flash > 0) { c.fillStyle = `rgba(220,20,30,${(.85 * flash).toFixed(3)})`; c.fillRect(0, 0, w, H); }
    c.restore();
  }
  // ---- the title, in the story-text area (drawn in the caller's coordinates: never reset the transform here) ----
  function drawTitle(c, w, h, t) {
    const cx = w / 2, cy = h / 2;
    if (t < 8.8) {   // one big panel flipping through the avatars, faster and faster, pushing in, with two more beside it
      const i = flipIndex(t, 0), f = flipPhase(t, 0), sq = Math.abs(Math.cos(f * Math.PI)) * .6 + .4, ph = h * (.86 + .3 * ss(.6, 8.6, t)), pw = ph * .75, a = ss(.5, 1.3, t);
      for (const side of [-1, 1]) for (let m = 1; m <= 3; m++) { const j = flipIndex(t, side * 2 * m + 5), pw2 = pw * (.78 - m * .1); c.save(); c.globalAlpha = a * (.5 - m * .1); c.drawImage(still(j), cx + side * (pw * .5 + (m - .45) * pw2 * 1.05) - pw2 / 2, cy - pw2 / .75 / 2, pw2, pw2 / .75); c.restore(); }
      c.save(); c.globalAlpha = a; c.translate(cx, cy); c.scale(sq, 1); c.drawImage(still(i), -pw / 2, -ph / 2, pw, ph); c.restore();
      const cut = f < .08 && t > 3 ? 1 - f / .08 : 0; if (cut > 0) { c.save(); c.fillStyle = `rgba(255,245,225,${(.35 * cut * a).toFixed(3)})`; c.fillRect(0, 0, w, h); c.restore(); }
    }
    if (t >= 8.4 && t < 12.8) {   // the title: a crimson panel framed in gold with VISHNU, a spinning discus, and DASHAVATARA
      const red = ss(8.4, 9, t), logo = ss(8.8, 9.3, t) * (1 - ss(12.2, 12.8, t));
      c.save(); c.fillStyle = `rgba(0,0,0,${red.toFixed(3)})`; c.fillRect(0, 0, w, h);
      const bw = Math.min(w * .4, h * 1.6), bh = bw * .34, total = bw * 2.3, sc = 1 + .5 * (1 - ss(8.8, 9.6, t));
      c.translate(cx, cy); c.scale(sc, sc); const left = -total / 2 + bh * .6, tx = left + bw / 2;
      c.globalAlpha = logo; const g = c.createLinearGradient(0, -bh / 2, 0, bh / 2); g.addColorStop(0, '#c4121e'); g.addColorStop(1, '#7a0610'); c.fillStyle = g; c.fillRect(left, -bh / 2, bw, bh);
      c.strokeStyle = '#f0c060'; c.lineWidth = Math.max(1.5, bh * .035); c.strokeRect(left + bh * .06, -bh / 2 + bh * .06, bw - bh * .12, bh * .88);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `700 ${bh * .6}px Cinzel, Georgia, serif`; if ('letterSpacing' in c) c.letterSpacing = (bh * .04).toFixed(1) + 'px';
      c.save(); c.beginPath(); c.rect(left, -bh / 2, bw, bh); c.clip(); const tg = c.createLinearGradient(0, -bh * .3, 0, bh * .3); tg.addColorStop(0, '#ffffff'); tg.addColorStop(1, '#ffe2a0'); c.fillStyle = tg; c.fillText('VISHNU', tx, bh * .05, bw * .86);
      const fill = ss(9.5, 10.3, t); if (fill < 1) { c.globalCompositeOperation = 'source-atop'; c.globalAlpha = logo * (1 - fill); c.drawImage(still(flipIndex(t * 3, 1)), left, -bh * 1.5, bw, bh * 3); }   // the avatars flicker inside the letters, then they settle
      c.restore();
      const cr = bh * .38, ccx = left - cr * 1.5; c.save(); c.translate(ccx, 0); c.rotate(t * 2.2); c.globalAlpha = logo; c.strokeStyle = '#ffd24a'; c.shadowColor = '#ffb020'; c.shadowBlur = bh * .2; c.lineWidth = Math.max(1.5, cr * .16); c.beginPath(); c.arc(0, 0, cr, 0, 6.283); c.stroke();
      for (let k = 0; k < 12; k++) { const an = k / 12 * 6.283; c.beginPath(); c.moveTo(Math.cos(an) * cr, Math.sin(an) * cr); c.lineTo(Math.cos(an + .2) * cr * 1.35, Math.sin(an + .2) * cr * 1.35); c.stroke(); } c.restore();   // Vishnu's discus, the Sudarshana
      c.globalAlpha = logo * ss(10, 10.8, t); c.fillStyle = '#f0c870'; c.textAlign = 'left'; c.font = `600 ${bh * .32}px Cinzel, Georgia, serif`; if ('letterSpacing' in c) c.letterSpacing = (bh * .08).toFixed(1) + 'px';
      c.fillText('DASHAVATARA', left + bw * 1.08, -bh * .04, total - bw * 1.1); c.font = `italic 600 ${bh * .2}px "Cormorant Garamond", Georgia, serif`; if ('letterSpacing' in c) c.letterSpacing = '0px'; c.fillStyle = '#d8b880'; c.fillText('the ten avatars of Vishnu', left + bw * 1.1, bh * .3);
      c.restore();
    }
    if (t >= 12.4) {   // Vishnu presents ... THE RAMAYANA
      const a1 = ss(12.6, 13.2, t) * (1 - ss(15.2, 15.9, t)); c.save(); c.globalAlpha = a1; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#e8c890'; c.font = `italic 600 ${h * .11}px "Cormorant Garamond", Georgia, serif`; c.fillText('Vishnu presents', cx, h * .2);
      const g = c.createLinearGradient(0, h * .32, 0, h * .66); g.addColorStop(0, '#fff6d8'); g.addColorStop(.5, '#ffd27a'); g.addColorStop(1, '#ff9e3a');
      c.fillStyle = g; c.shadowColor = 'rgba(255,170,60,.9)'; c.shadowBlur = h * .06; c.font = `700 ${Math.min(h * .26, w * .085)}px Cinzel, Georgia, serif`;
      c.fillText('THE RAMAYANA', cx, h * .5 + (1 - ss(12.6, 13.6, t)) * h * .05); c.shadowBlur = 0;
      c.globalAlpha = a1 * ss(13.4, 14, t); c.fillStyle = '#9adfff'; c.font = `italic 600 ${h * .1}px "Cormorant Garamond", Georgia, serif`; c.fillText('as told by the sage Valmiki', cx, h * .78);
      c.restore();
    }
  }
  return { DUR, drawBand, drawTitle, AV };
})();
