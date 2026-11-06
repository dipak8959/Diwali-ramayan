/* R3: the 3D Ramayan journey (Three.js).
 * One continuous walk along a ledge on the wall: no scene cuts. Everything is a function of time T (seconds),
 * except the particles, which are started by one-time triggers.
 * Units are roughly centimetres: Ram is about 165 tall. The stage runs from x = 0 (Ayodhya) to x = 6000 (Ayodhya again).
 */
window.R3 = (function () {
  'use strict';
  const THREE = window.THREE;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const LOOP = 225, WORLD = 6000, YAW = 1.12;

  // ---------- renderer, camera, post-processing ----------
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 100, 8000);
  camera.position.set(0, 0, 3000);
  const composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));
  const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 64), .55, .45, .78);
  composer.addPass(bloom);
  const streakShader = {   // an anamorphic streak: bright lights stretch sideways, as in a film lens
    uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1 / 256, 1 / 64) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: ['uniform sampler2D tDiffuse; uniform vec2 uTexel; varying vec2 vUv;', 'void main(){', '  vec3 c = texture2D(tDiffuse, vUv).rgb, s = vec3(0.);',
      '  for (int i = -24; i <= 24; i++) { float f = float(i); vec3 t = texture2D(tDiffuse, vUv + vec2(f * uTexel.x * 3., 0.)).rgb; s += max(t - .72, 0.) * exp(-abs(f) * .13); }',
      '  gl_FragColor = vec4(c + s * vec3(.55, .75, 1.) * .09, 1.);', '}'].join('\n'),
  };
  const streakPass = new THREE.ShaderPass(streakShader); composer.addPass(streakPass);
  const gradeShader = {
    uniforms: { tDiffuse: { value: null }, uSpot: { value: new THREE.Vector2(.5, 10) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform vec2 uSpot; varying vec2 vUv;',
      'void main(){',
      '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
      '  c *= 1. - smoothstep(uSpot.y * .5, uSpot.y, abs(vUv.x - uSpot.x));',   // only the part of the wall near the walkers is lit
      '  float l = dot(c, vec3(.299,.587,.114));',
      '  vec3 teal = vec3(-.02,.05,.09), warm = vec3(.09,.035,-.03);',      // cool shadows, warm highlights
      '  c += mix(teal, warm, smoothstep(.1,.75,l)) * (.2 + l * .6);',
      '  c = mix(vec3(dot(c, vec3(.299,.587,.114))), c, 1.18);',             // a little more colour
      '  c = (c * (2.51 * c + .03)) / (c * (2.43 * c + .59) + .14);',        // filmic curve
      '  gl_FragColor = vec4(clamp(c, 0., 1.), 1.);',
      '}'].join('\n'),
  };
  const gradePass = new THREE.ShaderPass(gradeShader); composer.addPass(gradePass);

  // ---------- helpers: materials ----------
  const std = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .55, metalness: .05 }, o || {}));
  const glowMat = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  function gradient(geo, c1, c2, axis, a, b) {     // vertex-colour gradient along an axis
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), A = new THREE.Color(c1), B = new THREE.Color(c2), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { const v = axis === 0 ? pos.getX(i) : axis === 1 ? pos.getY(i) : pos.getZ(i), t = clamp((v - a) / (b - a)); c.copy(A).lerp(B, t); col.set([c.r, c.g, c.b], i * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); return geo;
  }
  const GOLD = std(0xffc94a, { metalness: .75, roughness: .3, emissive: 0x7a5200, emissiveIntensity: .35 });
  const RUBY = std(0xff2a45, { emissive: 0xff1530, emissiveIntensity: .7 });
  const EMER = std(0x35e0a0, { emissive: 0x10b070, emissiveIntensity: .9 });
  const WHITE = std(0xfffaf0, { roughness: .35, emissive: 0x55504a });
  const DARK = std(0x1a0f20, { roughness: .4 });
  const mesh = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); if (parent) parent.add(m); return m; };
  const G = { sph: new THREE.SphereGeometry(1, 24, 18), sphLow: new THREE.SphereGeometry(1, 10, 8), cyl: new THREE.CylinderGeometry(1, 1, 1, 14) };

  // ---------- characters ----------
  const SPEC = {
    ram:      { skin: 0x4f9be0, hair: 0x1c2470, dress: [0xffe066, 0xff9d1c], sash: 0xe8503a, crown: true, quiver: true },
    lakshman: { skin: 0xe9a26b, hair: 0x3a2214, dress: [0xfff3d6, 0xe8c48a], sash: 0x35c46a, crown: true, quiver: true },
    sita:     { skin: 0xf0b58c, hair: 0x2c170e, dress: [0x3fe08a, 0x0d8a55], sash: 0xffd23a, female: true },
    ravan:    { skin: 0xc9482f, hair: 0x120508, dress: [0x9a4be0, 0x3a1470], sash: 0xffc94a, crown: true, evil: true },
    hanuman:  { skin: 0xf2a03a, hair: 0x7a4a1a, dress: [0xff4a2a, 0xb01a10], sash: 0xffd23a, crown: true, monkey: true },
    vanara:   { skin: 0xc09050, hair: 0x5a3a18, dress: [0x3a9aff, 0x1040a0], sash: 0xffd23a, monkey: true },
    sage:     { skin: 0xd9a077, hair: 0xf4f4f4, dress: [0xff8a1a, 0xc05a00], sash: 0xffd23a, beard: true },
    dasharatha: { skin: 0xd9a077, hair: 0xececec, dress: [0xc03a3a, 0x701818], sash: 0xffd23a, crown: true, beard: true },
    kaikeyi:  { skin: 0xf0b58c, hair: 0x2c170e, dress: [0x7a5be8, 0x30188a], sash: 0xffd23a, female: true, tiara: true },
    bharata:  { skin: 0xe9a26b, hair: 0x3a2214, dress: [0xffffff, 0xd8c8a0], sash: 0xff9d1c, crown: true },
    sugriva:  { skin: 0xd9a14a, hair: 0x7a4a1a, dress: [0x2a8aff, 0x1040a0], sash: 0xffd23a, crown: true, monkey: true },
    vali:     { skin: 0xc4572a, hair: 0x6a2a10, dress: [0xb01a1a, 0x601010], sash: 0xffd23a, crown: true, monkey: true },
    tataka:   { skin: 0x4a9a6a, hair: 0x120508, dress: [0x8a2a8a, 0x2a0a2a], sash: 0xffc94a, female: true, evil: true, horns: true },
    indrajit: { skin: 0x7a5ac0, hair: 0x120508, dress: [0x1a1a6a, 0x0a0a30], sash: 0x35e0ff, crown: true, evil: true },
    sabari:   { skin: 0xc99a70, hair: 0xf0f0f0, dress: [0xe6cf98, 0x8a7040], sash: 0xff9d1c, female: true },
    vibhishana: { skin: 0xd9b090, hair: 0x2a2a3a, dress: [0xf2f6ff, 0x8ab0ff], sash: 0x8ab0ff, crown: true },
    surpanakha: { skin: 0x9a6ad0, hair: 0x120508, dress: [0xd02a7a, 0x701040], sash: 0xffc94a, female: true, evil: true },
    hermit:   { skin: 0xb88a60, hair: 0xcccccc, dress: [0x8a4a1a, 0x3a1c08], sash: 0x6a3a14, beard: true },
    agni:     { skin: 0xff8a2a, hair: 0xff4a10, dress: [0xff7a10, 0xc01800], sash: 0xffe060, crown: true },
    janaka:   { skin: 0xd9a077, hair: 0x5a5a5a, dress: [0x2a9a74, 0x104a3a], sash: 0xffd23a, crown: true, beard: true },
    ahalya:   { skin: 0xe8b08a, hair: 0x2a1a10, dress: [0xd06ac0, 0x701a70], sash: 0xffd23a, female: true },
    angada:   { skin: 0xe8b04a, hair: 0x7a4a1a, dress: [0xffe060, 0xc08a00], sash: 0x35e0ff, crown: true, monkey: true },
    kumbha:   { skin: 0x5e9a62, hair: 0x120508, dress: [0x8a3a2a, 0x2a120a], sash: 0xc0392b, crown: true, evil: true },
  };

  function makeHead(sp, scale) {
    const g = new THREE.Group(), skin = std(sp.skin, { roughness: .5, emissive: new THREE.Color(sp.skin).multiplyScalar(.05) });
    const head = mesh(G.sph, skin, 0, 0, 0, g); head.scale.set(8.4, 10.4, 9);
    const jaw = mesh(G.sph, skin, 0, -6.4, 1.4, g); jaw.scale.set(6.2, 5.6, 7);
    const eyes = [], brows = []; let nose;
    if (sp.monkey) {   // a pink face with a broad muzzle
      const faceM = std(0xe8957c, { roughness: .55 });
      mesh(G.sph, faceM, 0, -.8, 6, g).scale.set(6.8, 7.6, 4.8);
      nose = mesh(G.sph, faceM, 0, -3.6, 8.9, g); nose.scale.set(4.6, 3.6, 3.6);
      for (const s of [-1, 1]) mesh(G.sphLow, DARK, s * 1.3, -2.6, 12, g).scale.setScalar(.7);
    } else { nose = mesh(new THREE.ConeGeometry(1.7, 4.8, 12), skin, 0, -1.4, 9.6, g); nose.rotation.x = Math.PI / 2 - .25; }
    for (const s of [-1, 1]) {
      const ew = mesh(G.sph, WHITE, s * 3.7, 1.4, 8.1, g); ew.scale.set(1.9, 1.15, .7); ew.userData.by = 1.15; eyes.push(ew);
      const pu = mesh(G.sph, sp.evil ? std(0xff3b1f, { emissive: 0xff2a10, emissiveIntensity: 2 }) : DARK, s * 3.7, 1.4, 8.7, g); pu.scale.set(.85, .85, .5); pu.userData.by = .85; eyes.push(pu);
      const br = mesh(new THREE.BoxGeometry(3.6, .55, .7), DARK, s * 3.9, 3.7, 8.3, g); br.rotation.z = s * (sp.evil ? -.35 : .12); br.userData = { base: br.rotation.z, s }; brows.push(br);
      const ear = mesh(G.sph, skin, s * 8.5, -.2, -.4, g); ear.scale.set(sp.monkey ? 2.2 : 1.1, sp.monkey ? 3.4 : 2.5, 1.6);
      mesh(G.sph, GOLD, s * 8.9, -3.2, -.4, g).scale.setScalar(sp.female ? 1.5 : 1.1);
    }
    const lips = mesh(G.sph, std(0xb5403d, { roughness: .4 }), 0, -5.2, 8.4, g); lips.scale.set(2.5, .75, .8); g.userData.eyes = eyes; g.userData.lips = lips; g.userData.brows = brows;
    mesh(new THREE.BoxGeometry(.9, 2.4, .5), RUBY, 0, 5.6, 8.9, g);                      // tilak
    if (sp.evil) { const mo = mesh(new THREE.TorusGeometry(3.2, .55, 6, 14, Math.PI), DARK, 0, -3.8, 8.6, g); mo.rotation.z = Math.PI; mo.scale.set(1.3, .7, 1); }
    const hair = mesh(new THREE.SphereGeometry(1, 20, 14, 0, 6.283, 0, Math.PI * .62), std(sp.hair, { roughness: .8 }), 0, 1.2, -1.4, g); hair.scale.set(9, 11, 10);
    const cb = g.children.length;
    if (sp.crown) {
      const prof = [[0, 0], [9.2, 0], [10, 2.4], [8.4, 5.6], [8, 8], [9.2, 10.4], [7, 13.4], [5.2, 14.4], [6, 17.6], [4.2, 20.6], [2.8, 24], [3.4, 26.6], [1.6, 29.4], [.3, 33], [0, 34]].map(p => new THREE.Vector2(p[0], p[1]));
      const crown = mesh(new THREE.LatheGeometry(prof, 18), GOLD, 0, 8.6, -.4, g); crown.scale.set(1, 1, .96);
      for (const a of [-.95, 0, .95]) { const sp2 = mesh(new THREE.ConeGeometry(1.7, 8, 8), GOLD, Math.sin(a) * 9, 11.6, Math.cos(a) * 3.2 - .4, g); sp2.rotation.z = -a * .35; }
      mesh(new THREE.TorusGeometry(9.3, 1.1, 8, 22), std(0xff9d1c, { metalness: .6, roughness: .3, emissive: 0x7a3a00 }), 0, 9.2, -.4, g).rotation.x = Math.PI / 2;
      mesh(G.sphLow, RUBY, 0, 15, 8.4, g).scale.setScalar(2); mesh(G.sphLow, RUBY, 0, 24, 5, g).scale.setScalar(1.5); mesh(G.sphLow, GOLD, 0, 35, -.4, g).scale.setScalar(1.6);
      for (const s of [-1, 1]) mesh(G.sphLow, EMER, s * 5, 12, 7.2, g).scale.setScalar(1.15);
    g.userData.crownParts = g.children.slice(cb);
    const jt = mesh(G.sph, std(sp.hair, { roughness: .8 }), 0, 12.5, -1.5, g); jt.scale.set(5.2, 6.4, 5.2); jt.visible = false; g.userData.jata = jt;   // a hermit's matted top-knot
    } else if (sp.female) {
      mesh(G.sph, std(sp.hair, { roughness: .8 }), -1, 9.6, -6.4, g).scale.set(5, 5, 5);   // bun
      for (const a of [0, 1.2, 2.4, 3.6, 4.8]) mesh(G.sphLow, WHITE, Math.cos(a) * 5 - 1, 9.6 + Math.sin(a) * 5, -6.4 + 3.5, g).scale.setScalar(1.1);
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -2, -9), new THREE.Vector3(0, -14, -12), new THREE.Vector3(0, -34, -11), new THREE.Vector3(0, -50, -9)]);
      g.userData.braid = mesh(new THREE.TubeGeometry(curve, 16, 2.4, 8), std(sp.hair, { roughness: .7 }), 0, 0, 0, g);
      mesh(G.sphLow, RUBY, 0, 6.2, 8.9, g).scale.setScalar(1.2);                         // bindi / maang tikka
      const mt = mesh(new THREE.TorusGeometry(5, .3, 4, 12, Math.PI), GOLD, 0, 8.4, 6.2, g); mt.rotation.x = .5;
    }
    if (sp.beard) { const bm = std(sp.hair, { roughness: .9 }), bd = mesh(new THREE.ConeGeometry(6.8, 17, 12), bm, 0, -13, 5.2, g); bd.rotation.x = Math.PI; bd.scale.z = .62;
      for (const s of [-1, 1]) { const mo = mesh(G.sph, bm, s * 2.8, -4.3, 8.6, g); mo.scale.set(3, .9, 1); mo.rotation.z = s * .25; } }
    if (sp.horns) for (const s of [-1, 1]) { const hn = mesh(new THREE.ConeGeometry(2, 11, 8), std(0xe8e0c0, { roughness: .5 }), s * 5.5, 12, 1, g); hn.rotation.z = -s * .35; }
    if (sp.tiara) { const tr = mesh(new THREE.TorusGeometry(8.6, .9, 6, 18, Math.PI), GOLD, 0, 3.2, 0, g); tr.rotation.x = .45; tr.rotation.z = Math.PI; tr.position.set(0, 4.4, 1); for (const a of [-.9, 0, .9]) mesh(new THREE.ConeGeometry(1.2, 5, 6), GOLD, Math.sin(a) * 8.4, 10.6 + Math.cos(a) * 1.5, Math.cos(a) * 3, g); mesh(G.sphLow, RUBY, 0, 12, 4.4, g).scale.setScalar(1.3); }
    g.scale.setScalar(scale || 1); return g;
  }

  function makeArm(sp, side, big) {
    const skin = std(sp.skin, { roughness: .5, emissive: new THREE.Color(sp.skin).multiplyScalar(.04) });
    const sh = new THREE.Group(), el = new THREE.Group();
    const u = new THREE.CylinderGeometry(3.4, 2.8, 24, 10); u.translate(0, -12, 0); sh.add(new THREE.Mesh(u, skin));
    mesh(G.sphLow, skin, 0, 0, 0, sh).scale.setScalar(3.9);
    const f = new THREE.CylinderGeometry(2.8, 2.1, 22, 10); f.translate(0, -11, 0); el.add(new THREE.Mesh(f, skin));
    el.position.set(0, -24, 0); sh.add(el); mesh(G.sphLow, skin, 0, 0, 0, el).scale.setScalar(2.9);
    const hand = mesh(G.sphLow, skin, 0, -24, 0, el); hand.scale.set(2.8, 3.1, 2.4);
    const ar = mesh(new THREE.TorusGeometry(3.6, .9, 6, 14), GOLD, 0, -8, 0, sh); ar.rotation.x = Math.PI / 2;
    const bg = mesh(new THREE.TorusGeometry(2.9, .6, 6, 14), GOLD, 0, -19, 0, el); bg.rotation.x = Math.PI / 2;
    sh.userData = { el, hand }; return sh;
  }

  function makeHuman(name, opts) {
    opts = opts || {};
    const sp = SPEC[name], fem = !!sp.female, root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const skin = std(sp.skin, { roughness: .5, emissive: new THREE.Color(sp.skin).multiplyScalar(.04) });
    const hipY = 78; body.position.y = hipY;
    const H = { name, root, body, legs: [], knees: [], arms: [], sp };
    // legs
    for (const s of [1, -1]) {
      const hip = new THREE.Group(); hip.position.set(s * 5.6, 0, 0); body.add(hip);
      const th = new THREE.CylinderGeometry(5.2, 3.8, 38, 10); th.translate(0, -19, 0); hip.add(new THREE.Mesh(th, skin));
      const knee = new THREE.Group(); knee.position.set(0, -38, 0); hip.add(knee);
      mesh(G.sphLow, skin, 0, 0, 0, knee).scale.setScalar(3.9);
      const sh = new THREE.CylinderGeometry(3.7, 2.5, 36, 10); sh.translate(0, -18, 0); knee.add(new THREE.Mesh(sh, skin));
      const foot = mesh(G.sph, skin, 0, -36.5, 3.2, knee); foot.scale.set(3.6, 2.2, 6.6);
      const an = mesh(new THREE.TorusGeometry(2.9, .55, 6, 12), GOLD, 0, -31, 0, knee); an.rotation.x = Math.PI / 2;
      H.legs.push(hip); H.knees.push(knee);
    }
    // dhoti or saree
    const pr = fem ? [[12, 2], [13.6, -8], [16, -30], [19, -60], [19.6, -77]] : [[12, 2], [13.6, -8], [15.4, -26], [15.4, -42], [14.2, -50]];
    const dg = new THREE.LatheGeometry(pr.map(p => new THREE.Vector2(p[0], p[1])), 40);
    const dp = dg.attributes.position;
    for (let i = 0; i < dp.count; i++) { const x = dp.getX(i), z = dp.getZ(i), th = Math.atan2(z, x), k = 1 + .045 * Math.sin(th * 9); dp.setX(i, x * k); dp.setZ(i, z * k); }
    gradient(dg, sp.dress[0], sp.dress[1], 1, fem ? -77 : -50, 2); dg.computeVertexNormals();
    const dress = mesh(dg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55, side: THREE.DoubleSide, emissive: 0x201008 }), 0, 0, 0, body);
    H.dress = dress;
    const hem = mesh(new THREE.TorusGeometry(fem ? 19.4 : 14.4, 1.2, 6, 40), GOLD, 0, fem ? -76.6 : -49.6, 0, body); hem.rotation.x = Math.PI / 2;
    const belt = mesh(new THREE.TorusGeometry(11.9, 1.5, 8, 30), GOLD, 0, 1.2, 0, body); belt.rotation.x = Math.PI / 2; mesh(G.sphLow, RUBY, 0, 1.2, 11.8, body).scale.setScalar(1.8);
    // torso
    const tp = [[10.4, 1], [11.6, 8], [13.6, 20], [14.6, 30], [12.4, 36], [6, 40.5], [4.2, 43]].map(p => new THREE.Vector2(p[0], p[1]));
    const tg = new THREE.LatheGeometry(tp, 30); tg.scale(1, 1, .64);
    const torso = new THREE.Group(); torso.position.y = 0; body.add(torso); H.torso = torso;
    if (fem) {
      const mid = mesh(tg, skin, 0, 0, 0, torso);
      const choli = new THREE.LatheGeometry([[10.7, 12], [13.6, 20], [14.7, 30], [12.5, 36], [6.2, 40.5]].map(p => new THREE.Vector2(p[0] + .25, p[1])), 30); choli.scale(1, 1, .66);
      mesh(choli, std(0xff6a3a, { roughness: .5, emissive: 0x401400 }), 0, 0, 0, torso);
      // pallu draped over the shoulder and trailing behind
      const cl = new THREE.PlaneGeometry(22, 62, 4, 10); cl.translate(0, -31, 0);
      H.cloth = mesh(cl, new THREE.MeshStandardMaterial({ color: sp.dress[0], roughness: .6, side: THREE.DoubleSide, emissive: 0x0a3a20 }), -9, 40, -10, torso);
      H.cloth.userData.base = Float32Array.from(cl.attributes.position.array);
      const sash = mesh(new THREE.TorusGeometry(14.8, 1.8, 8, 26, Math.PI * .95), std(sp.dress[0], { roughness: .55 }), 0, 24, 0, torso); sash.rotation.set(0, 0, -.9); sash.scale.set(1, 1, .66);
    } else {
      mesh(tg, skin, 0, 0, 0, torso);
      const sash = mesh(new THREE.TorusGeometry(14.9, 1.9, 8, 26, Math.PI * .95), std(sp.sash, { roughness: .5, emissive: 0x300800 }), 0, 24, 0, torso); sash.rotation.set(0, 0, -.9); sash.scale.set(1, 1, .66);
      const gar = mesh(new THREE.TorusGeometry(8.6, 1.5, 6, 30), std(0xff9d1c, { emissive: 0xff6a00, emissiveIntensity: .8, roughness: .7 }), 0, 28, 8.2, torso); gar.scale.set(1, 1.5, .5); gar.rotation.x = -.3;
    }
    const nl = mesh(new THREE.TorusGeometry(7.4, .7, 6, 24), GOLD, 0, 37, 2.6, torso); nl.rotation.x = Math.PI / 2 - .3;
    mesh(G.sphLow, RUBY, 0, 29, 8.6, torso).scale.setScalar(1.7);
    // quiver
    if (sp.quiver) {
      const q = new THREE.Group(); q.position.set(-6, 26, -11); q.rotation.z = .2; torso.add(q);
      mesh(new THREE.CylinderGeometry(3.3, 3, 40, 10), std(0x8a4b1c, { roughness: .8 }), 0, 0, 0, q);
      mesh(new THREE.TorusGeometry(3.3, .7, 6, 12), GOLD, 0, 10, 0, q).rotation.x = Math.PI / 2;
      for (const x of [-1.5, 0, 1.5]) mesh(new THREE.BoxGeometry(.5, 9, 3), WHITE, x, 24, 0, q);
      H.quiver = q;
    }
    // neck and head
    mesh(new THREE.CylinderGeometry(3.5, 4, 8, 10), skin, 0, 44, 0, torso);
    const head = makeHead(sp, opts.headScale || 1.32); head.position.set(0, 57, 0); torso.add(head); H.head = head;
    // arms
    for (const s of [1, -1]) { const a = makeArm(sp, s); a.position.set(s * 15, 37, 0); torso.add(a); H.arms.push(a); }
    if (sp.monkey) {   // a long tail and a mace
      const tc = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 2, -9), new THREE.Vector3(0, -4, -24), new THREE.Vector3(0, 14, -38), new THREE.Vector3(0, 44, -30), new THREE.Vector3(0, 58, -20)]);
      H.tail = mesh(new THREE.TubeGeometry(tc, 28, 2, 8), skin, 0, 0, 0, body);
      const tip = mesh(G.sph, glowMat(0xffa030), 0, 58, -20, body); tip.scale.setScalar(5); tip.visible = false; H.tailTip = tip;
      const mace = new THREE.Group(); mesh(new THREE.CylinderGeometry(1.5, 1.5, 44, 8), std(0x8a5a2a), 0, -16, 0, mace); mesh(G.sph, GOLD, 0, 8, 0, mace).scale.setScalar(8); mace.position.set(0, -24, 2); mace.rotation.x = -.2; H.arms[0].userData.el.add(mace); H.mace = mace;
    }
    // soft ground shadow
    const sh = mesh(new THREE.CircleGeometry(1, 24), shadowMat(), 0, -hipY + .6, 0, body); sh.rotation.x = -Math.PI / 2; sh.scale.set(26, 14, 1); H.shadow = sh;
    root.rotation.y = YAW; return H;
  }
  let _sm = null;
  function shadowMat() {
    if (_sm) return _sm;
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,.85)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return (_sm = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  }

  // walking and aiming. o: { ph (walk phase), s (0..1 how much walking), t, draw (bow), arrow, raise, wave }
  function pose(H, o) {
    const ph = o.ph, s = o.s, t = o.t, idle = Math.sin(t * 1.6 + H.root.id) * .5 + .5;
    H.body.position.y = 78 + Math.abs(Math.cos(ph)) * 2.2 * s + idle * .35 * (1 - s);
    H.body.rotation.z = Math.sin(ph) * .025 * s; H.torso.rotation.y = Math.sin(ph) * .12 * s - .08 + (1 - s) * Math.sin(t * .7) * .04;
    H.torso.rotation.x = .04 * s;
    for (let i = 0; i < 2; i++) {
      const p = ph + i * Math.PI, sw = Math.sin(p);
      H.legs[i].rotation.x = -sw * .46 * s;
      H.knees[i].rotation.x = (Math.max(0, Math.cos(p)) * .7 + .04) * s;
      const arm = H.arms[i];
      arm.rotation.x = sw * .36 * s + (1 - s) * .03; arm.rotation.z = (i ? -1 : 1) * (.06 + (1 - s) * .03);
      arm.userData.el.rotation.x = -(.18 + Math.max(0, -sw) * .3) * s - (1 - s) * .12;
    }
    H.head.rotation.y = -.05 + Math.sin(t * .9 + H.root.id) * .06 * (1 - s); H.head.rotation.x = Math.sin(ph * 2) * .03 * s;
    if (H.dress) { H.dress.rotation.z = Math.sin(ph) * .05 * s; H.dress.rotation.x = Math.sin(ph + 1) * .04 * s; }
    if (H.head.userData.braid) H.head.userData.braid.rotation.x = Math.sin(ph * 1) * .22 * s;
    if (H.cloth) {
      const pa = H.cloth.geometry.attributes.position, b = H.cloth.userData.base;
      for (let i = 0; i < pa.count; i++) { const y = b[i * 3 + 1], k = clamp(-y / 62); pa.setZ(i, -Math.sin(t * 3 + y * .09) * 3.2 * k * (.4 + s) - k * k * 10 * (.3 + s)); }
      pa.needsUpdate = true;
    }
    if (o.aim !== undefined) {   // bow raised: front arm out, back arm drawing the string
      const d = o.draw || 0, a = o.aim;
      const f = H.arms[0], b = H.arms[1];
      f.rotation.x = lerp(f.rotation.x, -1.5, a); f.rotation.z = lerp(f.rotation.z, .05, a); f.userData.el.rotation.x = lerp(f.userData.el.rotation.x, -.08, a);
      b.rotation.x = lerp(b.rotation.x, -1.45, a); b.rotation.z = lerp(b.rotation.z, -.02, a); b.userData.el.rotation.x = lerp(b.userData.el.rotation.x, -.1 - 2.45 * d, a);
      H.torso.rotation.y = lerp(H.torso.rotation.y, -.25, a);
    }
    const hd = H.head.userData;
    if (hd.eyes) { const bl = Math.pow(Math.max(0, Math.sin((t * .9 + H.root.id * 1.7) * 2.1)), 40); hd.eyes.forEach(e => { e.scale.y = e.userData.by * (1 - .92 * bl); }); }
    if (hd.lips) hd.lips.scale.y = .75 * (1 + (o.talk ? .9 * Math.abs(Math.sin(t * 9 + H.root.id)) : 0));
    if (hd.brows) hd.brows.forEach(b => { b.rotation.z = b.userData.base + b.userData.s * (.5 * (o.angry || 0) - .4 * (o.sad || 0)); });
    if (o.look) H.head.rotation.y += o.look;
    if (o.join) { const k = o.join; for (const i of [0, 1]) { H.arms[i].rotation.x = lerp(H.arms[i].rotation.x, -.95, k); H.arms[i].rotation.z = lerp(H.arms[i].rotation.z, (i ? 1 : -1) * .42, k); H.arms[i].userData.el.rotation.x = lerp(H.arms[i].userData.el.rotation.x, -1.7, k); } }
    if (o.point) { const k = o.point; H.arms[0].rotation.x = lerp(H.arms[0].rotation.x, -1.45, k); H.arms[0].rotation.z = lerp(H.arms[0].rotation.z, .12, k); H.arms[0].userData.el.rotation.x = lerp(H.arms[0].userData.el.rotation.x, -.05, k); }
    if (o.kneel) { const k = o.kneel; H.body.position.y -= 34 * k; H.legs[0].rotation.x = -1.35 * k; H.knees[0].rotation.x = 2.3 * k; H.legs[1].rotation.x = -.15 * k; H.knees[1].rotation.x = 1.6 * k; H.torso.rotation.x += .35 * k; for (const i of [0, 1]) { H.arms[i].rotation.x = lerp(H.arms[i].rotation.x, -1.1, k); H.arms[i].userData.el.rotation.x = lerp(H.arms[i].userData.el.rotation.x, -1.4, k); } }
    if (o.sit) { const k = o.sit; H.body.position.y = lerp(H.body.position.y, 50, k); for (const i of [0, 1]) { H.legs[i].rotation.x = lerp(H.legs[i].rotation.x, -1.5, k); H.knees[i].rotation.x = lerp(H.knees[i].rotation.x, 1.5, k); H.arms[i].rotation.x = lerp(H.arms[i].rotation.x, -.35, k); } H.torso.rotation.x = lerp(H.torso.rotation.x, -.04, k); }
    if (o.fly) { const f = o.fly; H.legs[0].rotation.x = lerp(H.legs[0].rotation.x, .7, f); H.legs[1].rotation.x = lerp(H.legs[1].rotation.x, .5, f); H.knees[0].rotation.x = lerp(H.knees[0].rotation.x, .9, f); H.knees[1].rotation.x = lerp(H.knees[1].rotation.x, .5, f); H.arms[0].rotation.x = lerp(H.arms[0].rotation.x, -2.9, f); H.arms[1].rotation.x = lerp(H.arms[1].rotation.x, -2.4, f); H.torso.rotation.x = lerp(H.torso.rotation.x, .5, f); }
    if (o.cheer) { const c = o.cheer, w = Math.sin(t * 7) * .15; for (const i of [0, 1]) { H.arms[i].rotation.x = lerp(H.arms[i].rotation.x, -2.9 + w * (i ? -1 : 1), c); H.arms[i].userData.el.rotation.x = lerp(H.arms[i].userData.el.rotation.x, -.2, c); } }
    if (H.tail) { H.tail.rotation.x = Math.sin(t * 3 + H.root.id) * .06 + (o.fly ? .25 * o.fly : 0); H.tail.rotation.z = Math.sin(t * 2.3 + H.root.id) * .08; }
    if (o.victory) { const v = o.victory; for (const i of [0, 1]) { H.arms[i].rotation.x = lerp(H.arms[i].rotation.x, -2.8, v); H.arms[i].userData.el.rotation.x = lerp(H.arms[i].userData.el.rotation.x, -.25, v); } }
  }

  // Ravan: the same figure, larger, with ten heads and six arms
  function makeRavan() {
    const H = makeHuman('ravan', { headScale: 1.0 }); const sp = SPEC.ravan, root = H.root, torso = H.torso;
    root.scale.setScalar(1.1);
    H.head.visible = false;
    const heads = [];
    for (let k = 0; k < 10; k++) {
      const h = makeHead(sp, k === 0 ? 1.1 : .86);
      if (k === 0) h.position.set(0, 55, 0);
      else { const th = Math.PI * (.12 + (k - 1) / 8 * .76); h.position.set(Math.cos(th) * 44, 52 + Math.sin(th) * 40, -2 - k * .4); h.rotation.z = (Math.cos(th)) * -.35; }
      torso.add(h); heads.push(h);
    }
    H.heads = heads;
    // four extra arms with swords
    for (const [s, y, rz] of [[1, 28, -.5], [-1, 28, .5], [1, 18, -.9], [-1, 18, .9]]) {
      const a = makeArm(sp, s, true); a.position.set(s * 14, y, 0); a.rotation.z = rz; a.rotation.x = -.3; torso.add(a);
      const sw = mesh(new THREE.BoxGeometry(2.4, 40, .8), std(0xe8eef5, { metalness: .9, roughness: .2, emissive: 0x334455 }), 0, -26, 4, a.userData.el); sw.position.y = -34;
      mesh(new THREE.BoxGeometry(8, 1.6, 2), GOLD, 0, -26, 4, a.userData.el);
    }
    H.root.userData.eyeLights = []; return H;
  }

  // ---------- the golden deer ----------
  function makeDeer() {
    const g = new THREE.Group(), m = std(0xffc95a, { emissive: 0xc27a10, emissiveIntensity: 1.1, roughness: .4, metalness: .2 });
    const body = mesh(G.sph, m, 0, 40, 0, g); body.scale.set(11, 9, 28);
    const neck = mesh(new THREE.CylinderGeometry(3, 4.6, 24, 8), m, 0, 56, 22, g); neck.rotation.x = .75;
    const head = mesh(G.sph, m, 0, 68, 31, g); head.scale.set(4, 4.6, 8.5);
    for (const s of [-1, 1]) { mesh(G.sphLow, DARK, s * 3, 70, 36, g).scale.setScalar(.9);
      const a = mesh(new THREE.TorusGeometry(7, .7, 5, 12, Math.PI * 1.2), GOLD, s * 3, 78, 28, g); a.rotation.set(0, s * .4, s * .5 + 1.3);
      const b = mesh(new THREE.TorusGeometry(4.5, .6, 5, 10, Math.PI), GOLD, s * 6.5, 86, 26, g); b.rotation.set(.3, s * .4, s * .8); }
    g.legs = [];
    for (const [x, z] of [[-5, 16], [5, 16], [-5, -16], [5, -16]]) { const p = new THREE.Group(); p.position.set(x, 38, z); const l = new THREE.CylinderGeometry(1.8, 1.1, 38, 6); l.translate(0, -19, 0); p.add(new THREE.Mesh(l, m)); g.add(p); g.legs.push(p); }
    mesh(G.sphLow, std(0xfff6c8, { emissive: 0xffee88 }), 0, 50, 6, g).scale.setScalar(2.2);
    g.rotation.y = Math.PI / 2 - .25; return g;
  }

  // ---------- the stage ----------
  const lights = {
    amb: new THREE.AmbientLight(0x4a5a9a, .42),
    key: new THREE.DirectionalLight(0xffb878, .95),
    rimT: new THREE.DirectionalLight(0x2de2ff, .95),
    rimM: new THREE.DirectionalLight(0xff3fa0, .8),
    fill: new THREE.DirectionalLight(0x6a8cff, .22),
    flash: new THREE.PointLight(0xffd8a0, 0, 900, 1.5),
  };
  lights.key.position.set(900, 700, 1200); lights.rimT.position.set(-1000, 400, -900); lights.rimM.position.set(1000, 500, -800); lights.fill.position.set(-600, 100, 900);
  for (const k in lights) scene.add(lights[k]);

  // the ledge the characters walk on, with a modern gradient edge
  (function ledge() {
    const L = WORLD + 1600, deck = mesh(new THREE.BoxGeometry(L, 14, 90), std(0x0b0b14, { roughness: .28, metalness: .7 }), WORLD / 2, -7, 0, scene);
    const strip = new THREE.BoxGeometry(L, 2.2, 3, 240, 1, 1); strip.translate(0, 0, 0);
    const pos = strip.attributes.position, col = new Float32Array(pos.count * 3), stops = [[0, 0x20e0ff], [.28, 0x7a4dff], [.55, 0xff3fa0], [.8, 0xff9a3a], [1, 0xffd84a]], c = new THREE.Color(), c2 = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const u = clamp(pos.getX(i) / L + .5); let j = 0; while (j < stops.length - 2 && u > stops[j + 1][0]) j++;
      c.setHex(stops[j][1]); c2.setHex(stops[j + 1][1]); c.lerp(c2, clamp((u - stops[j][0]) / (stops[j + 1][0] - stops[j][0]))).multiplyScalar(1.15); col.set([c.r, c.g, c.b], i * 3);
    }
    strip.setAttribute('color', new THREE.BufferAttribute(col, 3));
    mesh(strip, new THREE.MeshBasicMaterial({ vertexColors: true }), WORLD / 2, .2, 44, scene);
    const top = mesh(new THREE.PlaneGeometry(L, 90), new THREE.MeshBasicMaterial({ color: 0x120a22, transparent: true, opacity: .75 }), WORLD / 2, .1, 0, scene); top.rotation.x = -Math.PI / 2;
  })();

  function makePalace(sc) {
    const g = new THREE.Group(), stone = std(0x6b4224, { roughness: .8, emissive: 0x1a0c04 }), win = new THREE.MeshBasicMaterial({ color: 0xffcf70 });
    mesh(new THREE.BoxGeometry(360, 84, 60), stone, 180, 42, -80, g);
    for (let k = 0; k < 18; k++) mesh(new THREE.BoxGeometry(12, 8, 12), stone, 12 + k * 20, 88, -52, g);
    for (const tx of [43, 317]) { mesh(new THREE.BoxGeometry(34, 150, 34), stone, tx, 75, -80, g); const d = mesh(new THREE.SphereGeometry(21, 18, 10, 0, 6.283, 0, 1.6), std(0xc9892a, { metalness: .6, roughness: .35, emissive: 0x4a2a00 }), tx, 150, -80, g); }
    mesh(new THREE.BoxGeometry(80, 175, 40), stone, 180, 87, -80, g);
    mesh(new THREE.SphereGeometry(46, 22, 12, 0, 6.283, 0, 1.6), std(0xd6992e, { metalness: .6, roughness: .35, emissive: 0x5a3400 }), 180, 175, -80, g);
    mesh(new THREE.CylinderGeometry(1.2, 1.2, 38, 6), GOLD, 180, 240, -80, g);
    for (let k = 0; k < 8; k++) if (k !== 3 && k !== 4) mesh(new THREE.BoxGeometry(11, 22, 1), win, 20 + k * 45, 50, -49, g);
    for (const [x, y] of [[180, 150], [160, 110], [200, 110]]) mesh(new THREE.BoxGeometry(11, 22, 1), win, x, y, -59, g);
    g.userData.win = win; g.scale.setScalar(sc); return g;
  }
  function makeTree(h, leafColor, leafEmissive) {
    const g = new THREE.Group(); mesh(new THREE.CylinderGeometry(3.4, 5.2, h * .55, 8), std(0x2a1a10, { roughness: .9 }), 0, h * .27, 0, g);
    const leaf = std(leafColor || 0x0e5a52, { roughness: .6, emissive: leafEmissive || 0x052a26 });
    for (let k = 0; k < 4; k++) { const c = mesh(new THREE.ConeGeometry(34 - k * 6, h * .42, 10), leaf, 0, h * .5 + k * h * .17, 0, g); }
    return g;
  }
  function makePillars() {
    const g = new THREE.Group(), st = std(0x8a5a8a, { roughness: .5, emissive: 0x1a0a2a });
    for (let k = 0; k < 6; k++) { mesh(new THREE.CylinderGeometry(7, 8, 215, 12), st, k * 220, 107, -100, g); if (k < 5) { const a = mesh(new THREE.TorusGeometry(110, 7, 8, 24, Math.PI), st, k * 220 + 110, 214, -100, g); } }
    return g;
  }
  function makeLanka() {
    const g = new THREE.Group();
    for (let k = 0; k < 14; k++) { const bh = 80 + ((k * 53) % 110), b = mesh(new THREE.BoxGeometry(38, bh, 30), std(0x2c0c14, { roughness: .8, emissive: 0x1c0408 }), k * 48, bh / 2, -90, g); for (let w = 0; w < 3; w++) mesh(new THREE.BoxGeometry(5, 8, 1), new THREE.MeshBasicMaterial({ color: 0xff7a2a }), k * 48 - 10 + w * 10, 16 + w * 28 % bh, -74, g);
      if (k % 3 === 0) mesh(new THREE.SphereGeometry(19, 12, 8, 0, 6.283, 0, 1.6), std(0x5a1818, { emissive: 0x240604 }), k * 48, bh, -90, g); }
    return g;
  }

  const world = { diyas: [], lanterns: [], trees: [] };
  const lotus = new THREE.Group(); lotus.position.set(330, 0, 10); scene.add(lotus);
  const petals = [];
  (function () {
    const pm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .4, emissive: 0x802050, emissiveIntensity: .7 });
    for (const [ring, n, len] of [[0, 9, 34], [1, 7, 28], [2, 5, 22]]) for (let k = 0; k < n; k++) {
      const geo = new THREE.SphereGeometry(1, 14, 10); gradient(geo, 0xff5fa0, 0xffe8b0, 1, -1, 1); geo.translate(0, 1, 0);
      const p = new THREE.Mesh(geo, pm); p.scale.set(8 - ring * 1.2, len / 2, 3); const a = k / n * 6.283 + ring * .4; p.userData = { a, ring, len }; lotus.add(p); petals.push(p);
    }
    mesh(new THREE.CylinderGeometry(44, 40, 4, 30), std(0x120a2a, { roughness: .1, metalness: .8, emissive: 0x1a1a5a }), 0, 2, 0, lotus);   // pond
    mesh(new THREE.TorusGeometry(44, .9, 6, 40), new THREE.MeshBasicMaterial({ color: 0x35e0ff }), 0, 4.2, 0, lotus).rotation.x = Math.PI / 2;
  })();
  const baby = new THREE.Group(); scene.add(baby);
  (function () {
    mesh(G.sph, glowMat(0xfff1c2), 0, 0, 0, baby).scale.set(6, 6, 6); const halo = mesh(G.sph, glowMat(0xffc86a), 0, 0, 0, baby); halo.scale.set(16, 16, 16); halo.material.opacity = .25;
    baby.visible = false;
  })();
  const babyLight = new THREE.PointLight(0xffd9a0, 0, 500, 1.5); scene.add(babyLight);

  const dash2 = makeHuman('dasharatha', { headScale: 1.25 }); dash2.root.visible = false; scene.add(dash2.root);
  const bowl = new THREE.Group(); mesh(new THREE.CylinderGeometry(9, 5, 7, 16), GOLD, 0, 0, 0, bowl); mesh(G.sph, glowMat(0xffe6a0), 0, 6, 0, bowl).scale.set(10, 5, 10); { const bg = mesh(G.sph, glowMat(0xffc860), 0, 4, 0, bowl); bg.scale.setScalar(26); bg.material.opacity = .3; } bowl.visible = false; scene.add(bowl);
  const palaceL = makePalace(.9); palaceL.position.set(-60, 0, 0); scene.add(palaceL);
  const palace2 = makePalace(.9); palace2.position.set(2230, 0, 0); scene.add(palace2);
  const court = makePillars(); court.position.set(1100, 0, 0); scene.add(court);
  for (const [x, h] of [[2720, 215], [2900, 250], [3070, 200], [3430, 240], [3620, 210], [3790, 250], [3980, 200], [2620, 190]]) { const t = makeTree(h); t.position.set(x, 0, rnd(-70, -30)); scene.add(t); world.trees.push(t); }
  const lanka = makeLanka(); lanka.position.set(5150, 0, 0); scene.add(lanka);
  const moon = mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0xfff1d0 }), 540, 215, -300, scene); moon.scale.setScalar(26);
  const redMoon = mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0xff4a2a }), 5400, 215, -300, scene); redMoon.scale.setScalar(26);

  // Shiva's bow on a pedestal
  const pedestal = mesh(new THREE.BoxGeometry(70, 26, 26), std(0x3a2a4a, { roughness: .4, metalness: .4 }), 1700, 13, 0, scene);
  function bowCurve(h, belly) { return new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, h, 0), new THREE.Vector3(belly * 2, 0, 0), new THREE.Vector3(0, -h, 0)); }
  const bowMat = std(0xc58a3a, { metalness: .5, roughness: .35, emissive: 0x5a3200, emissiveIntensity: .8 });
  const bigBow = new THREE.Group(), bigBowMesh = new THREE.Mesh(new THREE.TubeGeometry(bowCurve(78, 24), 24, 2.6, 8), bowMat); bigBow.add(bigBowMesh);
  const bigString = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xfff0c0 }));
  bigBow.add(bigString); scene.add(bigBow);
  const halves = [0, 1].map(i => { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 78 * (i ? -1 : 1), 0), new THREE.Vector3(24, 40 * (i ? -1 : 1), 0), new THREE.Vector3(24, 0, 0)), 12, 2.6, 8), bowMat); m.visible = false; scene.add(m); return m; });
  // Ram's own bow and arrow
  const bow = new THREE.Group(); bow.add(new THREE.Mesh(new THREE.TubeGeometry(bowCurve(38, 13), 20, 1.5, 8), bowMat));
  const bowString = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xfff0c0 }));
  bow.add(bowString); scene.add(bow);
  const arrow = new THREE.Group(); mesh(new THREE.CylinderGeometry(.7, .7, 60, 6), std(0xf4e6c2), 0, 0, 0, arrow).rotation.z = Math.PI / 2;
  mesh(new THREE.ConeGeometry(2.4, 9, 8), GOLD, 33, 0, 0, arrow).rotation.z = -Math.PI / 2; mesh(new THREE.BoxGeometry(10, 5, .5), RUBY, -28, 0, 0, arrow);
  const ag = mesh(G.sph, glowMat(0xffb04a), 36, 0, 0, arrow); ag.scale.set(10, 10, 10); ag.material.opacity = .5; arrow.visible = false; scene.add(arrow);

  // characters
  const ram = makeHuman('ram'), sita = makeHuman('sita'), lak = makeHuman('lakshman'), rav = makeRavan(); rav.root.position.set(5560, 0, -10);
  const deer = makeDeer(); scene.add(deer); deer.visible = false;
  for (const h of [ram, sita, lak, rav]) scene.add(h.root);
  ram.root.visible = lak.root.visible = sita.root.visible = rav.root.visible = false;

  // diyas along the last stretch and near the start
  const diyaGeo = new THREE.LatheGeometry([[0, 0], [4.4, 1.2], [6, 4.4], [5.2, 5.6], [0, 4.6]].map(p => new THREE.Vector2(p[0], p[1])), 12), diyaMat = std(0xb85a1c, { roughness: .6, emissive: 0x3a1204 });
  const flameGeo = new THREE.ConeGeometry(2.1, 9, 8); flameGeo.translate(0, 4.5, 0);
  for (const x of [...Array.from({ length: 70 }, (_, k) => 70 + k * 84), 100, 160, 220, 280, 380, 440, 500, 560]) {
    const d = new THREE.Group(); d.position.set(x, 0, 36 + (x % 3) * 3); d.add(new THREE.Mesh(diyaGeo, diyaMat));
    const fl = new THREE.Mesh(flameGeo, glowMat(0xffb24a)); fl.position.set(0, 5.6, 0); d.add(fl); const gl = mesh(G.sph, glowMat(0xff8a2a), 0, 8, 0, d); gl.scale.setScalar(10); gl.material.opacity = .0;
    d.userData = { x, fl, gl, ph: Math.random() * 10 }; scene.add(d); world.diyas.push(d);
  }
  // lanterns for the homecoming
  const lanMat = std(0xff9a3c, { emissive: 0xff7a18, emissiveIntensity: 1.3, roughness: .6 });
  for (let k = 0; k < 14; k++) { const l = mesh(new THREE.CylinderGeometry(9, 6, 22, 10), lanMat, 0, 0, 0, scene); l.userData = { x: 80 + k * 90 + rnd(-30, 30), y0: rnd(40, 130), sp: rnd(7, 14), ph: rnd(0, 6) }; l.visible = false; world.lanterns.push(l); }
  // greeting text
  const label = (function () {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const x = c.getContext('2d');
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = 'rgba(255,170,60,1)'; x.shadowBlur = 24; x.fillStyle = '#ffe9b0';
    x.font = '700 120px Georgia,serif'; x.fillText('Happy Diwali', 512, 128);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(400, 100), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(900, 205, 20); m.material.opacity = 0; scene.add(m); return m;
  })();

  // ---------- more of the story's cast and props ----------
  const han = makeHuman('hanuman', { headScale: 1.2 }), kum = makeHuman('kumbha');
  scene.add(han.root, kum.root); han.root.visible = kum.root.visible = false;
  const vanaras = Array.from({ length: 6 }, () => { const v = makeHuman('vanara', { headScale: 1.2 }); v.root.scale.setScalar(.58); v.root.visible = false; scene.add(v.root); return v; });
  function makeJatayu(bodyHex, wingHex) {
    const g = new THREE.Group(), m = std(bodyHex || 0x9a6a44, { roughness: .7, emissive: new THREE.Color(bodyHex || 0x9a6a44).multiplyScalar(.15) });
    mesh(G.sph, m, 0, 0, 0, g).scale.set(22, 10, 9);
    const neck = mesh(new THREE.CylinderGeometry(3, 4.5, 16, 8), m, 24, 6, 0, g); neck.rotation.z = -1.0;
    mesh(G.sph, m, 32, 13, 0, g).scale.set(6, 5, 5);
    const beak = mesh(new THREE.ConeGeometry(2.4, 10, 8), std(0xffc94a, { emissive: 0x6a4a00 }), 40, 11, 0, g); beak.rotation.z = -Math.PI / 2 - .2;
    mesh(G.sphLow, WHITE, 34, 15, 4, g).scale.setScalar(1.3); mesh(G.sphLow, DARK, 35, 15, 5, g).scale.setScalar(.7);
    mesh(new THREE.BoxGeometry(22, 2, 12), m, -26, 2, 0, g);
    g.userData.wings = [-1, 1].map(s => { const w = new THREE.Group(); w.position.set(2, 4, s * 6); const f = mesh(G.sph, std(wingHex || 0xb88a5a, { roughness: .7, emissive: new THREE.Color(wingHex || 0xb88a5a).multiplyScalar(.15) }), -2, 0, s * 26, w); f.scale.set(11, 1.6, 30); g.add(w); return w; });
    g.rotation.y = -.45; return g;
  }
  const jat = makeJatayu(); jat.visible = false; scene.add(jat);
  function makeChariot() {   // the flying chariot, Pushpaka
    const g = new THREE.Group(), mat = std(0xffd23a, { metalness: .7, roughness: .3, emissive: 0x6a4a00, emissiveIntensity: .6 }); g.userData.mat = mat;
    mesh(new THREE.BoxGeometry(96, 12, 56), mat, 0, 14, 0, g); mesh(new THREE.BoxGeometry(100, 4, 60), GOLD, 0, 21, 0, g);
    for (const [x, z] of [[-44, -24], [44, -24], [-44, 24], [44, 24]]) mesh(new THREE.CylinderGeometry(2.4, 2.4, 70, 8), mat, x, 56, z, g);
    const dome = mesh(new THREE.SphereGeometry(54, 24, 12, 0, 6.283, 0, 1.45), mat, 0, 90, 0, g); dome.scale.set(1, .55, .62);
    mesh(new THREE.CylinderGeometry(1.4, 1.4, 22, 6), GOLD, 0, 128, 0, g); mesh(G.sphLow, RUBY, 0, 142, 0, g).scale.setScalar(3);
    g.userData.wheels = [-1, 1].map(s => mesh(new THREE.TorusGeometry(15, 2.4, 8, 20), std(0x35e0ff, { emissive: 0x10b0d0, emissiveIntensity: 1.2 }), s * 30, 10, 30, g));
    const jet = mesh(G.sph, glowMat(0x35c0ff), 0, 2, 0, g); jet.scale.set(52, 8, 30); jet.material.opacity = .35;
    g.visible = false; return g;
  }
  const chariot = makeChariot(); scene.add(chariot);
  // the hut at Panchavati
  const hut = new THREE.Group(); hut.position.set(3250, 0, -50); scene.add(hut);
  mesh(new THREE.CylinderGeometry(42, 46, 60, 16), std(0x6a4a2a, { roughness: .9, emissive: 0x1a1008 }), 0, 30, 0, hut);
  mesh(new THREE.ConeGeometry(62, 46, 16), std(0x8a6a3a, { roughness: .9, emissive: 0x2a1a08 }), 0, 83, 0, hut);
  mesh(new THREE.BoxGeometry(16, 30, 2), new THREE.MeshBasicMaterial({ color: 0xffc070 }), 0, 17, 46, hut);
  // the sea between the forest and Lanka, and the bridge of stones
  const seaGeo = new THREE.PlaneGeometry(900, 18, 90, 2); gradient(seaGeo, 0x1b4fff, 0x20e0ff, 0, -450, 450);
  const seaBase = Float32Array.from(seaGeo.attributes.position.array);
  mesh(seaGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .85 }), 4575, 9, 46, scene);
  const seaTop = mesh(new THREE.PlaneGeometry(900, 90), new THREE.MeshBasicMaterial({ color: 0x0a2a6a, transparent: true, opacity: .55 }), 4575, .8, 0, scene); seaTop.rotation.x = -Math.PI / 2;
  const stones = Array.from({ length: 16 }, (_, k) => { const m = mesh(new THREE.BoxGeometry(44, 14, 60), std(0xd8c09a, { roughness: .6, emissive: 0x4a3a18 }), 4170 + k * 52, 7, 6, scene); m.userData = { t: 119 + k * .85 }; m.scale.setScalar(.001); return m; });
  const mount = new THREE.Group();
  { const mg = new THREE.IcosahedronGeometry(34, 1); gradient(mg, 0x0a5a3a, 0x1fe08a, 1, -34, 34);
    const mm = mesh(mg, std(0xffffff, { roughness: .5, emissive: 0x108a50, emissiveIntensity: .9 }), 0, 0, 0, mount); mm.material.vertexColors = true;
    const mh = mesh(G.sph, glowMat(0x20ff90), 0, 0, 0, mount); mh.scale.setScalar(54); mh.material.opacity = .22; mount.visible = false; scene.add(mount); }
  const ash = makeTree(190, 0xff7ab0, 0x5a1030); ash.position.set(5700, 0, -40); scene.add(ash);   // Sita's tree in Lanka

  // ---------- the second wave of the cast: sages, kings, queens, monkeys, demons ----------
  function addNew(name, scale, opts) { const h = makeHuman(name, opts || {}); h.root.scale.setScalar(scale || 1); h.root.visible = false; scene.add(h.root); return h; }
  const sage = addNew('sage', 1, { headScale: 1.25 }), tataka = addNew('tataka', 1.5), dash = addNew('dasharatha', 1, { headScale: 1.25 }), kaik = addNew('kaikeyi', 1);
  const bharat = addNew('bharata', 1), sugr = addNew('sugriva', 1, { headScale: 1.2 }), vali = addNew('vali', 1.25, { headScale: 1.2 }), indra = addNew('indrajit', 1.1);
  { const staff = new THREE.Group(); mesh(new THREE.CylinderGeometry(1.6, 1.8, 140, 8), std(0x8a5a2a, { roughness: .8 }), 0, -8, 0, staff); mesh(G.sph, GOLD, 0, 62, 0, staff).scale.setScalar(5); staff.position.set(0, -24, 4); sage.arms[0].userData.el.add(staff); }
  { const club = new THREE.Group(); mesh(new THREE.CylinderGeometry(2, 3, 60, 8), std(0x3a2a20, { roughness: .8 }), 0, -16, 0, club); const hd = mesh(G.sph, std(0x2a2020, { roughness: .6 }), 0, 18, 0, club); hd.scale.setScalar(11);
    for (let k = 0; k < 8; k++) { const sp = mesh(new THREE.ConeGeometry(2.2, 8, 6), std(0xcfd6e0, { metalness: .8, roughness: .3 }), 0, 18, 0, club); sp.position.set(Math.cos(k * .785) * 11, 18 + Math.sin(k * 1.1) * 7, Math.sin(k * .785) * 11); sp.lookAt(sp.position.clone().multiplyScalar(2)); sp.rotateX(Math.PI / 2); }
    club.position.set(0, -24, 2); tataka.arms[0].userData.el.add(club); }
  // Ram's sandals, which Bharata will keep on the throne
  const sandals = new THREE.Group();
  for (const z of [-5, 5]) { mesh(G.sph, GOLD, 0, 0, z, sandals).scale.set(11, 1.8, 4.2); mesh(G.sphLow, RUBY, 5, 3, z, sandals).scale.setScalar(1.8); }
  { const sg = mesh(G.sph, glowMat(0xffd070), 0, 3, 0, sandals); sg.scale.setScalar(16); sg.material.opacity = .35; }
  sandals.visible = false; scene.add(sandals);
  // divine weapons given by the sage
  const orbs = [0, 1, 2].map(i => { const o = mesh(G.sph, glowMat([0xffc94a, 0x35e0ff, 0xff4aa0][i]), 0, 0, 0, scene); o.scale.setScalar(6); o.visible = false; return o; });
  // Garuda, the divine eagle, and the eagle Jatayu share a builder
  const garuda = makeJatayu(0xe8b02a, 0xffd860); garuda.scale.setScalar(2.6); garuda.visible = false; scene.add(garuda);
  // the little squirrel that helped build the bridge
  const squirrel = new THREE.Group();
  { const m = std(0xb88a5a, { roughness: .8, emissive: 0x3a2410 });
    mesh(G.sph, m, 0, 0, 0, squirrel).scale.set(7, 4.5, 3.6); mesh(G.sph, m, 8, 4, 0, squirrel).scale.set(3.4, 3.2, 3); mesh(G.sphLow, DARK, 10.5, 5.2, 1.6, squirrel).scale.setScalar(.7);
    for (const z of [-1.6, 0, 1.6]) mesh(new THREE.BoxGeometry(11, .5, .6), std(0x3a2410), -.5, 4.3, z * 1.2, squirrel).rotation.z = -.15;
    const tc = new THREE.CatmullRomCurve3([new THREE.Vector3(-6, 1, 0), new THREE.Vector3(-14, 6, 0), new THREE.Vector3(-14, 15, 0), new THREE.Vector3(-8, 20, 0)]);
    mesh(new THREE.TubeGeometry(tc, 12, 2.2, 6), m, 0, 0, 0, squirrel); const peb = mesh(G.sphLow, std(0xd8d0c0), 10, 0, 0, squirrel); peb.scale.setScalar(2.2); squirrel.userData.pebble = peb; }
  squirrel.visible = false; scene.add(squirrel);
  // serpent arrows and the coils that bind Ram and Lakshman
  const snakeMat = std(0x30ff90, { emissive: 0x10c060, emissiveIntensity: 1.4, roughness: .4 });
  const serpents = Array.from({ length: 6 }, () => { const g = new THREE.Group(); const pts = []; for (let k = 0; k <= 12; k++) pts.push(new THREE.Vector3(-k * 5, Math.sin(k * 1.1) * 3.5, 0));
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 1.8, 6), snakeMat, 0, 0, 0, g); mesh(G.sph, snakeMat, 3, 0, 0, g).scale.set(4.5, 2.6, 2.6); const sg2 = mesh(G.sph, glowMat(0x40ff90), 0, 0, 0, g); sg2.scale.set(20, 8, 8); sg2.material.opacity = .3; g.visible = false; scene.add(g); return g; });
  const coils = [0, 1].map(() => { const pts = []; for (let k = 0; k <= 60; k++) { const a = k / 60 * Math.PI * 7; pts.push(new THREE.Vector3(Math.cos(a) * 15, 6 + k / 60 * 140, Math.sin(a) * 13)); }
    const g = new THREE.Group(); mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 2.6, 6), snakeMat, 0, 0, 0, g); g.visible = false; scene.add(g); return g; });
  // fireflies in the forest, sparkles on the sea
  const MAXF = 170, ffInst = new THREE.InstancedMesh(G.sphLow, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), MAXF); ffInst.frustumCulled = false; scene.add(ffInst);
  const ffs = Array.from({ length: MAXF }, (_, i) => ({ sea: i >= 120, x: i < 120 ? rnd(2650, 4000) : rnd(4170, 5000), y: i < 120 ? rnd(20, 190) : rnd(10, 16), z: i < 120 ? rnd(-70, 40) : rnd(30, 50), ph: rnd(0, 10), sp: rnd(.6, 1.6) }));
  { const c = new THREE.Color(); ffs.forEach((f, i) => { c.setHex(f.sea ? 0xaee8ff : 0xdcff70); ffInst.setColorAt(i, c); }); }
  // grass and tiny flowers along the ledge
  { const gi = new THREE.InstancedMesh(new THREE.ConeGeometry(1.6, 11, 5), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .7, emissive: 0x0a3a30 }), 520); const d = new THREE.Object3D(), c = new THREE.Color();
    for (let i = 0; i < 520; i++) { d.position.set(rnd(-200, 6200), 5, rnd(30, 43)); d.rotation.set(rnd(-.2, .2), 0, rnd(-.25, .25)); d.scale.set(1, rnd(.6, 1.6), 1); d.updateMatrix(); gi.setMatrixAt(i, d.matrix); c.setHSL(rnd(.38, .5), .7, rnd(.22, .4)); gi.setColorAt(i, c); } scene.add(gi);
    const fl = new THREE.InstancedMesh(G.sphLow, new THREE.MeshBasicMaterial({ color: 0xffffff }), 110);
    for (let i = 0; i < 110; i++) { d.position.set(rnd(-200, 6200), rnd(9, 15), rnd(32, 43)); d.rotation.set(0, 0, 0); d.scale.setScalar(rnd(1.4, 2.4)); d.updateMatrix(); fl.setMatrixAt(i, d.matrix); c.setHex([0xff8ac0, 0xffd060, 0xffffff, 0xb08aff][i % 4]); fl.setColorAt(i, c); } scene.add(fl); }

  // ---------- the third wave: more people and props ----------
  const sabari = addNew('sabari', .96), vibh = addNew('vibhishana', 1, { headScale: 1.2 }), surp = addNew('surpanakha', 1.1), hermit = addNew('hermit', 1, { headScale: 1.22 }), agni = addNew('agni', 1.5);
  agni.root.traverse(o => { if (o.material && o.material.emissive) { o.material = o.material.clone(); o.material.emissive.setHex(0xff5a10); o.material.emissiveIntensity = 1.5; } });
  { const bk = new THREE.Group(); mesh(new THREE.CylinderGeometry(9, 6, 8, 12, 1, true), std(0x8a5a2a, { roughness: .9, side: THREE.DoubleSide }), 0, 0, 0, bk);
    for (let k = 0; k < 9; k++) mesh(G.sphLow, std(0xd02a5a, { emissive: 0x801030, emissiveIntensity: .8 }), Math.cos(k * 2.4) * 4, 4.5 + (k % 3) * 1.3, Math.sin(k * 2.4) * 4, bk).scale.setScalar(2.2);
    bk.position.set(0, -24, 4); sabari.arms[0].userData.el.add(bk); sabari.arms[1].userData.el.add(bk.clone()); }
  const sitaGlow = mesh(G.sph, glowMat(0xffe0a0), 0, 0, 0, scene); sitaGlow.visible = false;
  const berry = mesh(G.sphLow, std(0xd02a5a, { emissive: 0xc01040, emissiveIntensity: 1 }), 0, 0, 0, scene); berry.scale.setScalar(3); berry.visible = false;
  // Lakshman's protective line, drawn around the hut
  const rekha = mesh(new THREE.TorusGeometry(74, 1.5, 6, 70), new THREE.MeshBasicMaterial({ color: 0xffa030 }), 3250, 1.6, 0, scene); rekha.rotation.x = Math.PI / 2; rekha.visible = false;
  const rekhaGlow = mesh(new THREE.TorusGeometry(74, 6, 6, 70), glowMat(0xff8020), 3250, 1.6, 0, scene); rekhaGlow.rotation.x = Math.PI / 2; rekhaGlow.visible = false;
  // the fire of Sita's trial
  const fireGlow = mesh(G.sph, glowMat(0xff7020), 5400, 60, 0, scene); fireGlow.scale.set(80, 70, 40); fireGlow.material.opacity = .0; fireGlow.visible = false;
  // the golden throne for Ram's coronation
  const throne = new THREE.Group();
  { const gm = std(0xffc94a, { metalness: .8, roughness: .28, emissive: 0x6a4a00, emissiveIntensity: .6 });
    mesh(new THREE.BoxGeometry(260, 14, 80), gm, 0, 7, 0, throne); mesh(new THREE.BoxGeometry(220, 10, 70), gm, 0, 19, 0, throne);
    for (const x of [-30, 30]) { mesh(new THREE.BoxGeometry(56, 26, 40), std(0xb01a2a, { roughness: .6, emissive: 0x300508 }), x, 32, -4, throne); mesh(new THREE.BoxGeometry(56, 70, 8), gm, x, 66, -24, throne); }
    const arc = mesh(new THREE.TorusGeometry(88, 4, 8, 40, Math.PI), gm, 0, 90, -30, throne); arc.scale.set(1, 1.1, 1);
    const halo = mesh(G.sph, glowMat(0xffd070), 0, 150, -34, throne); halo.scale.set(54, 54, 5); halo.material.opacity = .28;
    for (let k = 0; k < 9; k++) { const a = k / 8 * Math.PI; mesh(new THREE.ConeGeometry(2, 22, 6), gm, Math.cos(a) * 66, 150 + Math.sin(a) * 66, -34, throne).rotation.z = a - Math.PI / 2; }
    const um = mesh(new THREE.CylinderGeometry(1.6, 1.6, 150, 8), gm, -92, 95, -6, throne); const cone = mesh(new THREE.ConeGeometry(58, 24, 20), std(0xb01a2a, { emissive: 0x400808 }), -92, 178, -6, throne); mesh(new THREE.TorusGeometry(56, 2, 6, 24), GOLD, -92, 168, -6, throne).rotation.x = Math.PI / 2; }
  throne.visible = false; scene.add(throne);
  // low mist along the ledge
  const mistTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(.5, 'rgba(255,255,255,.3)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const MAXM = 40, mistInst = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), MAXM); mistInst.frustumCulled = false; scene.add(mistInst);
  const mists = Array.from({ length: MAXM }, (_, i) => ({ x: i * 155 + rnd(-40, 40), y: rnd(5, 16), z: rnd(10, 50), sx: rnd(70, 130), ph: rnd(0, 10) }));
  { const c = new THREE.Color(); mists.forEach((m, i) => { c.setHex([0x1a5a70, 0x3a2a6a, 0x167a60][i % 3]).multiplyScalar(.5); mistInst.setColorAt(i, c); }); }

  // ---------- the fourth wave ----------
  const janaka = addNew('janaka', 1, { headScale: 1.25 }), ahalya = addNew('ahalya', 1), angada = addNew('angada', 1, { headScale: 1.2 });
  const tower = new THREE.Group(); mesh(new THREE.CylinderGeometry(22, 28, 60, 10), std(0x6b4224, { roughness: .8, emissive: 0x1a0c04 }), 0, 30, 0, tower); mesh(new THREE.SphereGeometry(24, 14, 8, 0, 6.283, 0, 1.6), std(0xd6992e, { metalness: .6, roughness: .35, emissive: 0x5a3400 }), 0, 60, 0, tower); tower.visible = false; scene.add(tower);
  const stone = new THREE.Group(); { const ash = mesh(G.sph, std(0x9a9aa4, { roughness: 1, emissive: 0x181820 }), 0, 4, 0, stone); ash.scale.set(46, 8, 30); const sh = mesh(G.sph, glowMat(0xc8d8ff), 0, 40, 0, stone); sh.scale.set(18, 44, 10); sh.material.opacity = .16; }   // a mound of ashes and a faint shimmer: she lives unseen, in penance
  stone.visible = false; scene.add(stone);
  const heartTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.shadowColor = 'rgba(255,120,160,1)'; x.shadowBlur = 14; x.fillStyle = '#ff7aa8';
    x.beginPath(); x.moveTo(64, 112); x.bezierCurveTo(10, 72, 14, 24, 46, 24); x.bezierCurveTo(58, 24, 64, 34, 64, 40); x.bezierCurveTo(64, 34, 70, 24, 82, 24); x.bezierCurveTo(114, 24, 118, 72, 64, 112); x.fill(); x.shadowBlur = 0;
    x.fillStyle = '#5aa0ff'; x.beginPath(); x.arc(50, 56, 7, 0, 6.3); x.fill(); x.fillRect(44, 62, 12, 26); x.fillStyle = '#3fe08a'; x.beginPath(); x.arc(78, 56, 7, 0, 6.3); x.fill(); x.fillRect(72, 62, 12, 26);
    return new THREE.CanvasTexture(c); })();
  const heart = mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: heartTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0, 0, scene); heart.visible = false;
  [[ram, 0x5aa0ff], [sita, 0xffd070], [lak, 0xffe0a0], [han, 0xff9a40]].forEach(([h, c]) => { const a = mesh(G.sph, glowMat(c), 0, 100, -14, h.root); a.scale.set(30, 66, 8); a.material.opacity = .09; });   // a soft divine aura

  // ---------- particles ----------
  const MAXP = 3200, pGeo = new THREE.SphereGeometry(1, 6, 4);
  const pMat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const pInst = new THREE.InstancedMesh(pGeo, pMat, MAXP); pInst.frustumCulled = false; pInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(pInst);
  pInst.setColorAt(0, new THREE.Color(0)); const dummy = new THREE.Object3D(), tmpC = new THREE.Color();
  let parts = [];
  const petalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: .5, emissive: 0x401020, vertexColors: false });
  const MAXPET = 500, petInst = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, .6), petalMat, MAXPET); petInst.frustumCulled = false; scene.add(petInst);
  petInst.setColorAt(0, new THREE.Color(0)); let pets = [];
  function burst(x, y, z, hue, n, speed) {
    speed = speed || rnd(110, 180);
    for (let i = 0; i < n; i++) {
      const u = rnd(-1, 1), a = rnd(0, 6.283), r = Math.sqrt(1 - u * u), v = speed * rnd(.55, 1);
      parts.push({ x, y, z, vx: Math.cos(a) * r * v, vy: u * v, vz: Math.sin(a) * r * v * .5, life: rnd(1.4, 2.3), age: 0, hue: hue + rnd(-.03, .03), r: rnd(1.4, 2.6), drag: .36, g: 55 });
    }
  }
  function flame(x, y, z, k) { k = k || 1; parts.push({ x: x + rnd(-8, 8) * k, y, z: z + rnd(-6, 6), vx: rnd(-8, 8), vy: rnd(55, 110) * k, vz: 0, life: rnd(.5, 1.1), age: 0, hue: .11, hue2: .0, r: rnd(1.8, 3.6) * k, sy: 2.6, drag: .5, g: -30, lt: .36 }); }
  function ember(x, y, z, big) { parts.push({ x: x + rnd(-4, 4), y, z, vx: rnd(-14, 14), vy: rnd(35, 90), vz: rnd(-6, 6), life: rnd(.7, 1.6), age: 0, hue: rnd(.04, .1), r: big ? rnd(2.4, 5) : rnd(1.2, 2.6), drag: .9, g: -20 }); }
  function petalRain(x0, x1, n, top, cols) { cols = cols || [0xffb3c7, 0xff9d1c, 0xffd9a0, 0xff7a9c]; for (let i = 0; i < n; i++) pets.push({ x: rnd(x0, x1), y: top + rnd(-30, 30), z: rnd(-20, 40), vy: -rnd(22, 46), ph: rnd(0, 6.3), rot: rnd(0, 6.3), age: 0, life: 12, col: cols[i % cols.length] }); }
  function stepParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.age += dt; if (p.age > p.life) { parts.splice(i, 1); continue; }
      const d = Math.pow(p.drag, dt); p.vx *= d; p.vz *= d; p.vy = p.vy * d - p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 0 && p.g > 0) { p.y = 0; p.vy *= -.3; }
    }
    for (let i = pets.length - 1; i >= 0; i--) { const p = pets[i]; p.age += dt; p.y += p.vy * dt; p.x += Math.sin(p.age * 2.2 + p.ph) * 22 * dt; p.rot += dt * 2.4; if (p.y < 1 || p.age > p.life) pets.splice(i, 1); }
  }
  function drawParts() {
    const n = Math.min(parts.length, MAXP);
    for (let i = 0; i < n; i++) {
      const p = parts[i], k = 1 - p.age / p.life; dummy.position.set(p.x, p.y, p.z); const rr = p.r * (.4 + k); dummy.scale.set(rr, rr * (p.sy || 1), rr); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); pInst.setMatrixAt(i, dummy.matrix);
      tmpC.setHSL(((((p.hue2 !== undefined ? lerp(p.hue2, p.hue, k) : p.hue) % 1) + 1) % 1), 1, p.lt !== undefined ? p.lt + k * .08 : .5 + k * .18).multiplyScalar(Math.max(0, k * (k < .3 ? .6 + Math.random() * .4 : 1))); pInst.setColorAt(i, tmpC);
    }
    pInst.count = n; pInst.instanceMatrix.needsUpdate = true; if (pInst.instanceColor) pInst.instanceColor.needsUpdate = true;
    const m = Math.min(pets.length, MAXPET);
    for (let i = 0; i < m; i++) { const p = pets[i]; dummy.position.set(p.x, p.y, p.z); dummy.scale.set(7, 7, 7); dummy.rotation.set(p.rot, p.rot * .6, p.rot * .3); dummy.updateMatrix(); petInst.setMatrixAt(i, dummy.matrix); tmpC.setHex(p.col); petInst.setColorAt(i, tmpC); }
    petInst.count = m; petInst.instanceMatrix.needsUpdate = true; if (petInst.instanceColor) petInst.instanceColor.needsUpdate = true;
  }

  // ---------- the story, as a function of time ----------
  const LOOP_T = 225;
  const seg = (T, t0, t1, x0, x1) => T <= t0 ? x0 : T >= t1 ? x1 : lerp(x0, x1, ease((T - t0) / (t1 - t0)));
  // A path through [time, value] keys at an even pace: a short ease in and out (under a second), steady speed in between.
  const K = (T, keys) => {
    if (T <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) if (T < keys[i + 1][0]) {
      const a = keys[i], b = keys[i + 1], D = b[0] - a[0], d = b[1] - a[1], u = T - a[0];
      if (d === 0) return a[1];
      const ac = Math.min(.9, D * .25), v = d / (D - ac);   // speed in the middle
      if (u < ac) return a[1] + v * u * u / (2 * ac);
      if (u > D - ac) return b[1] - v * (D - u) * (D - u) / (2 * ac);
      return a[1] + v * (u - ac / 2);
    }
    return keys[keys.length - 1][1];
  };
  const RAM_K = [[6, 430], [9, 470], [22, 1380], [26, 1560], [41, 1560], [43, 1640], [53, 2250], [60, 2250], [61, 2300], [70, 3050], [77, 3560], [80.5, 3560], [88, 3330], [90, 3330], [98, 3900], [119, 3900], [121, 4000], [136, 4950], [150, 4950], [152, 5050], [183, 5050], [185.5, 5160]];
  const chX = (T) => T < 91 ? K(T, [[82.5, 3330], [91, 5560]]) : K(T, [[182, 5130], [186, 5130], [205, 560]]);
  const chY = (T) => T < 91 ? (T < 82.5 ? 0 : 36 + 150 * Math.sin(Math.PI * clamp((T - 82.5) / 8.5))) : (T < 186 ? 0 : (T < 205 ? 30 + 130 * Math.sin(Math.PI * clamp((T - 186) / 19)) : 0));
  const ramX = (T) => T < 185.5 ? K(T, RAM_K) : T < 205 ? chX(T) + 30 : K(T, [[205, 590], [212, 720]]);
  const sitaX = (T) => T < 32 ? 2000 : T < 38 ? K(T, [[32, 2000], [38, 1660]]) : T < 70 ? Math.max(1660, ramX(T) - 100) : T < 75 ? K(T, [[70, 2950], [75, 3250]]) : T < 82.5 ? 3250 : T < 91 ? chX(T) : T < 94 ? K(T, [[91, 5560], [94, 5700]]) : T < 176 ? 5700 : T < 185 ? K(T, [[176, 5400], [185, 5130]]) : T < 205 ? chX(T) : ramX(T) - 30;
  const LAK_K = [[69, ramX(69) - 95], [74, 3180], [77, 3180], [81, 3480], [88, 3235], [90, 3235], [98, 3805]];
  const lakX = (T) => T < 69 ? ramX(T) - 95 : T < 98 ? K(T, LAK_K) : T < 152 ? ramX(T) - 95 : T < 168 ? K(T, [[152, 4955], [155.5, 5110], [164, 5110], [168, 4955]]) : T < 185 ? K(T, [[168, 4955], [185, 5100]]) : T < 205 ? chX(T) - 30 : ramX(T) - 60;
  const deerX = (T) => K(T, [[66, 3150], [77, 3640]]);
  // Hanuman: meets Ram, leaps the sea, finds Sita, burns Lanka, leaps back, brings the healing mountain
  function hanPos(T) {
    const o = { x: 4350, y: 0, vis: T >= 96, fly: 0, kneel: 0, tail: 0, mount: 0 };
    if (T < 96) return o;
    if (T < 101) o.x = K(T, [[96, 4350], [101, 3990]]);
    else if (T < 108) { o.x = 3990; o.kneel = sstep(101, 102, T) * (1 - sstep(103.6, 104.6, T)); }
    else if (T < 112) { const u = (T - 108) / 4; o.x = lerp(3990, 5620, ease(u)); o.y = 215 * Math.sin(Math.PI * u); o.fly = 1; }
    else if (T < 116) { o.x = 5620; o.kneel = sstep(112.4, 113.2, T) * (1 - sstep(115, 116, T)); }
    else if (T < 121) { o.x = T < 118 ? K(T, [[116, 5620], [118, 5780]]) : K(T, [[118, 5780], [121, 5300]]); o.y = 96 + Math.sin(T * 9) * 4; o.tail = 1; }
    else if (T < 125) { const u = (T - 121) / 4; o.x = lerp(5300, 4300, ease(u)); o.y = 170 * Math.sin(Math.PI * u); o.fly = 1; }
    else if (T < 146) o.x = T < 126 ? lerp(4300, ramX(126) + 170, T - 125) : ramX(T) + 170;
    else if (T < 149) { const u = (T - 146) / 3; o.x = lerp(ramX(146) + 170, 3300, ease(u)); o.y = 250 * Math.sin(Math.PI * u); o.fly = 1; }
    else if (T < 152) o.vis = false;
    else if (T < 156) { const u = (T - 152) / 4; o.x = lerp(3300, 4900, ease(u)); o.y = 40 + 190 * Math.sin(Math.PI * u); o.fly = 1; o.mount = 1; }
    else if (T < 185.5) { o.x = K(T, [[156, 4900], [183, 4900], [185.5, 5070]]); o.mount = 1 - sstep(157.4, 158.2, T); }
    else if (T < 205) { o.x = chX(T) - 62; o.y = chY(T) + 16; }
    else o.x = ramX(T) - 92;
    return o;
  }
  const WIN = [[26.2, 31, 28.4, 31], [74.2, 76.9, 75, 76], [144.3, 147.2, 145.2, 146.6], [164.8, 168.2, 165.6, 167.6]];   // raise, release, start of draw, shot
  const SHOTS = [[76.0, .9, 3640, 64], [146.6, 1.0, 5255, 150], [167.6, 1.0, 5510, 150]];
  const FOC = [[0, 380], [9, 520], [22, 1250], [30, 1650], [41, 1700], [53, 2250], [62, 2500], [69, 3000], [77, 3450], [86, 3700], [93, 3600], [100, 3900], [108, 4500], [112, 5300], [118, 5450], [124, 4600], [130, 4500], [140, 4900], [150, 5150], [160, 5250], [170, 5350], [177, 5300], [184, 5100]];
  const follow = (T) => T < 185 ? K(T, FOC) : T < 205 ? chX(T) : K(T, [[205, 560], [212, 600], [225, 450]]);
  const vel = (f, T) => (f(T + .06) - f(T - .06)) / .12;
  const STEP = 58;   // length of one stride


  // ---------- extra scenes, inserted into the story ----------
  // Each insert freezes the main story at story time s0 and plays for n seconds, so the long walk is never rushed.
  const INS = [
    { id: 'tataka', s0: 14.5, n: 12, fx: 1020, cap: 'On the road, the yakshini Tataka attacks. Urged by the sage, Ram shoots her to protect the forest and its hermits. The sage then gives him divine weapons', moral: 'Duty can mean doing a hard thing to protect the innocent' },
    { id: 'ahalya', s0: 22, n: 11, fx: 1480, cap: 'Near Mithila, Ram and Lakshman bow at the feet of Ahalya, who was cursed to live unseen in penance. Ram\'s arrival frees her', moral: 'Compassion can free anyone from the weight of the past' },
    { id: 'boons', s0: 53, n: 12, fx: 2400, cap: 'Manthara poisons Queen Kaikeyi\'s mind. She claims two old boons: Bharata crowned, and Ram exiled for 14 years. The king faints, but Ram calmly accepts to keep his father\'s word', moral: 'Keeping a promise matters more than a crown' },
    { id: 'sandals', s0: 60, n: 10, fx: 2200, cap: 'Later, at Chitrakoot hill, Bharata begs Ram to return and rule. Ram will not break his father\'s word, so he gives Bharata his sandals to rule in his name', moral: 'Real leaders serve with humility, and love does not cling to power' },
    { id: 'surp', s0: 70, n: 12, fx: 3120, cap: "Ravan's sister Surpanakha tries to win Ram, then Lakshman. When she rushes at Sita, Lakshman wounds her. Her brothers Khara and Dushana attack with 14,000 demons, but Ram defeats them alone. Furious, she goes to Ravan", moral: 'Anger and desire without wisdom lead to ruin' },
    { id: 'rekha', s0: 81, n: 12, fx: 3230, cap: "Dying, Maricha cries out in Ram's voice: 'Ha Sita! Ha Lakshmana!' Afraid for Ram, Sita sharply urges Lakshman to go. Reluctantly he leaves her. Ravan arrives disguised as a hermit, asking for alms", moral: 'Words spoken in fear can lead to harm' },
    { id: 'sabari', s0: 98, n: 10, fx: 3780, cap: 'The demon Kabandha tells them to seek Sugriva. On the way, the ascetic Sabari honours Ram with wild fruits, as her teachers had foretold', moral: 'Devotion matters more than status or perfection' },
    { id: 'vali', s0: 104.6, n: 14, fx: 4050, cap: 'Ram and Sugriva swear friendship before the sacred fire. Vali, who took Sugriva\'s kingdom and wife, is shot by Ram from behind a tree. Sugriva becomes king', moral: 'Be true to a friend who has been wronged' },
    { id: 'vib', s0: 119, n: 10, fx: 3950, cap: "Ravan insults his brother Vibhishana for urging him to return Sita. Vibhishana joins Ram, who at once crowns him king of Lanka with sea water", moral: 'Doing right sometimes means standing apart from your own family' },
    { id: 'angada', s0: 136, n: 12, fx: 5330, cap: 'Ram sends Angada to give Ravan a last chance for peace. Ravan orders him seized, but Angada leaps to the roof with four demons, hurls them down and breaks the palace tower', moral: 'Peace must always be offered first' },
    { id: 'indra', s0: 137, n: 16, fx: 5100, cap: "The war begins. The invisible Indrajit binds Ram and Lakshman with serpent arrows. The divine eagle Garuda comes and frees them", moral: 'Even heroes need friends and help' },
    { id: 'agni', s0: 176, n: 11, fx: 5420, cap: 'Ram asks Sita to prove her purity to the world. She enters the fire, and the fire god Agni brings her out unharmed and vouches for her', moral: 'Truth shines brightest when it is tested' },
    { id: 'darbar', s0: 213, n: 12, fx: 760, cap: 'Sage Vasishtha crowns Ram king of Ayodhya, with Sita beside him. Ram Rajya, a rule of justice and peace, lasts for many years', moral: 'A good ruler cares for every person' },
  ];
  let accIns = 0; INS.forEach(a => { a.t0 = a.s0 + accIns; accIns += a.n; });
  const TOTAL = 225 + accIns;
  function mapT(Tr) {
    for (let i = 0; i < INS.length; i++) { const a = INS[i]; if (Tr < a.t0) return { S: Tr - (a.t0 - a.s0), i: -1 }; if (Tr < a.t0 + a.n) return { S: a.s0, i, u: Tr - a.t0 }; }
    return { S: Tr - accIns, i: -1 };
  }
  const sToT = (S) => S + INS.reduce((a, b) => a + (b.s0 < S ? b.n : 0), 0);
  const CAP = [   // story time windows [from, to, what is happening and why, (optional) lesson, (optional) when the lesson appears]
    [0, 9, "From Valmiki's Ramayana: King Dasharatha's sacred fire ritual brings four sons: Ram, Bharata, Lakshman and Shatrughna. Ram is Vishnu born to defeat Ravan"],
    [9, 14.5, 'Sage Vishwamitra asks the king for Ram\'s help against demons, and the king agrees'],
    [14.5, 22, 'The sage leads the brothers toward Mithila, where King Janaka\'s great contest awaits'],
    [22, 31, "Mithila: King Janaka will give his daughter Sita to whoever can string Shiva's great bow. Ram, with the sage's blessing, lifts it"],
    [31, 40.5, 'Ram strings the bow and it snaps in two with a thunderous crack! Janaka offers Sita to Ram, and King Dasharatha comes for the wedding', 'Strength joined with humility wins hearts', 36.5],
    [40.5, 53, 'In Ayodhya, King Dasharatha wants to crown Ram as heir. But Queen Kaikeyi holds an old promise'],
    [53, 60, 'Ram leaves the palace in bark robes. Sita and Lakshman insist on going with him, out of love'],
    [60, 70, 'The three live as hermits in the Dandaka forest, and settle at Panchavati by the river Godavari'],
    [70, 77.5, 'The demon Maricha becomes a golden deer. Lakshman warns it is a trick, but Sita begs for it. Ram goes after it and tells Lakshman to guard her'],
    [81, 92, 'Ravan shows his true form and carries Sita off in his chariot. The old vulture Jatayu fights him until Ravan cuts off his wings'],
    [92, 98, 'Ram and Lakshman find the empty hut and search. The dying Jatayu tells them Ravan took Sita south. Ram performs his funeral rites', 'Do what is right, even when you cannot win', 95],
    [98, 104.6, 'At Rishyamukha hill, Hanuman, disguised as a hermit, meets Ram on behalf of Sugriva, the exiled monkey king. He bows and takes them to him'],
    [104.6, 115, "Sugriva's monkeys search all directions. The vulture Sampati reveals Sita is in Lanka. Hanuman, carrying Ram's ring, leaps across the sea and finds her in the Ashoka grove", 'With devotion and humility, nothing is impossible', 111],
    [115, 124, "Captured by the demons, Hanuman has his tail set alight. He burns Lanka's towers and leaps back to tell Ram where Sita is"],
    [124, 136, 'Ram prays to the Sea for a way across. Nala, son of the divine builder Vishwakarma, leads the monkeys to build a bridge of rocks and trees in five days', 'Working together builds what seems impossible', 131],
    [137, 150, "Ravan's giant brother Kumbhakarna, woken from sleep, fights the monkey army until Ram's arrow ends him"],
    [150, 160, "Indrajit's Brahma weapon fells Ram, Lakshman and the army. Hanuman flies to the Himalayas and brings a mountain of healing herbs", 'Loyal friends bring help even when it seems impossible', 155],
    [160, 168.6, 'At last Ram and Ravan meet in single combat. Whenever a head is cut off, another grows'],
    [168.6, 176, "Ram's Brahma weapon, given by the sage Agastya, ends Ravan. Good wins over evil", 'Pride and wrongdoing destroy even the mightiest', 171.5],
    [176, 186, 'Vibhishana is crowned. His gift, the flying chariot Pushpaka, carries Ram, Sita, Lakshman and Hanuman home as the fourteen years end'],
    [186, 205, 'Ayodhya greets Ram with joy and decorations. By tradition people lit lamps, and this is remembered as Diwali', 'Light always returns after darkness', 198],
    [205, 213, 'Bharata, who ruled in Ram\'s name with the sandals on the throne, welcomes him home'],
    [213, 225, 'Diwali, the festival of lights, remembers Ram\'s homecoming: be a light in someone\'s life', 'Be the light', 218],
  ];
  function captionAt(Tr) {
    const m = mapT(Tr);
    if (m.i >= 0) { const a = INS[m.i], f = sstep(0, .9, m.u) * (1 - sstep(a.n - .9, a.n, m.u)); return { en: a.cap, moral: a.moral || '', a: f, am: a.moral ? sstep(a.n * .55, a.n * .55 + .8, m.u) * (1 - sstep(a.n - .9, a.n, m.u)) : 0 }; }
    for (const [a, b, en, moral, ms] of CAP) if (m.S >= a && m.S < b) {
      let k = sstep(a, a + .9, m.S) * (1 - sstep(b - .9, b, m.S)); for (const q of INS) k *= sstep(0, .8, Math.abs(m.S - q.s0));
      const mm = ms === undefined ? b - 3.6 : ms; return { en, moral: moral || '', a: k, am: moral ? sstep(mm, mm + .8, m.S) * (1 - sstep(b - .9, b, m.S)) * sstep(0, .8, Math.abs(m.S - 0)) : 0 };
    }
    return null;
  }
  const chapters = [0, 9, 22, 31, 40.5, 53, 60, 70, 81, 92, 98, 104.6, 115, 124, 137, 150, 160, 168.6, 176, 186, 205, 213].map(sToT).concat(INS.map(a => a.t0)).sort((a, b) => a - b);

  // the aim and the arrow of an inserted scene (the actors themselves are posed later)
  function insertParams(id, u, rx) {
    const out = { aw: null, shot: null }, win = (a0, a1, d0, d1) => ({ aim: sstep(a0, a0 + 1.2, u) * (1 - sstep(a1, a1 + .6, u)), draw: sstep(d0, d1, u) * (u < d1 + .05 ? 1 : 0), big: false });
    if (id === 'tataka') { if (u >= 3.6 && u < 7.4) out.aw = win(3.6, 6.8, 4.6, 5.9); const p = (u - 5.9) / .8; if (p >= 0 && p < 1) out.shot = { p, x0: rx + 62, y0: 128, x1: 1130, y1: 110 }; }
    if (id === 'vali') { if (u >= 5.6 && u < 9.2) out.aw = win(5.6, 8.6, 6.2, 7.3); const p = (u - 7.3) / .9; if (p >= 0 && p < 1) out.shot = { p, x0: rx + 62, y0: 128, x1: 4110, y1: 125 }; }
    return out;
  }
  const hide = (...hs) => hs.forEach(h => { h.root.visible = false; });
  const showAt = (h, x, y, z, ry, sc) => { h.root.visible = true; h.root.position.set(x, y, z); h.root.rotation.set(0, ry, 0); h.root.scale.setScalar(sc); };
  const pop = (a, b, u, sc) => sc * (.2 + .8 * ease(sstep(a, a + 1.1, u))) * (1 - sstep(b - 1.1, b, u) * .97);   // scale in at a, out at b
  function insertActors(ins, Tr, rx, base) {
    hide(tataka, dash, kaik, bharat, sugr, vali, indra, sabari, vibh, surp, hermit, agni, ahalya, angada); tower.visible = false; stone.visible = false; heart.visible = false;
    garuda.visible = false; sandals.visible = false; berry.visible = false; throne.visible = false; fireGlow.visible = false; orbs.forEach(o => { o.visible = false; }); serpents.forEach(g => { g.visible = false; }); coils.forEach(g => { g.visible = false; });
    if (ins.i < 0) return;
    const id = INS[ins.i].id, u = ins.u, face = -YAW;
    if (id === 'tataka') {   // Vishwamitra's ritual: Tataka charges and falls
      const tx = u < 4 ? lerp(1290, 1130, sstep(.4, 4, u)) : 1130, tf = sstep(6.3, 7.6, u), td = sstep(8.2, 9.6, u);
      if (u > .4 && u < 9.7) { showAt(tataka, tx, 12 * tf, -6, face, 1.5 * (1 - .6 * td) + .001); pose(tataka, { ph: tx * Math.PI / STEP, s: u < 4 ? .75 : 0, t: Tr, cheer: sstep(4, 4.6, u) * (1 - sstep(6, 6.4, u)), talk: u > 4 && u < 6.2, angry: 1 }); tataka.root.rotation.z = -1.5 * tf; if (td > 0 && Math.random() < .8) ember(tx + rnd(-30, 30), rnd(10, 130), 0, true); }
      once('i0a', u >= .4, () => { flashV = .5; burst(1290, 80, 0, .3, 70, 80); });
      once('i0b', u >= 6.7, () => { flashV = .7; burst(1130, 100, 0, .02, 120, 130); });
      once('i0c', u >= 9.3, () => { for (let k = 0; k < 30; k++) ember(1130 + rnd(-20, 20), rnd(20, 100), 0, true); });
      sage.root.rotation.y = YAW; pose(sage, { ph: 0, s: 0, t: Tr, cheer: sstep(8.6, 9.6, u) * (1 - sstep(10.4, 11, u)), talk: u > 8.6 && u < 10.4, look: .3 });
      orbs.forEach((o, i) => { const a = sstep(9, 9.8, u) * (1 - sstep(10.4, 11, u)); o.visible = a > .02; const an = u * 2.6 + i * 2.09; o.position.set(rx + 20 + Math.cos(an) * 34, 130 + Math.sin(an * 1.3) * 18, 10 + Math.sin(an) * 20); o.scale.setScalar(6 * a + .01); });
    }
    if (id === 'ahalya') {   // Ahalya, freed from stone
      const sf = ease(sstep(.2, 1.2, u)) * (1 - sstep(4.6, 6, u));
      stone.visible = sf > .02; stone.position.set(1475, 0, 4); stone.scale.setScalar(sf + .001);
      if (u > 4.8 && u < 9.9) { showAt(ahalya, 1475, 0, 4, face, pop(4.8, 9.9, u, 1)); pose(ahalya, { ph: 0, s: 0, t: Tr, join: sstep(6.4, 7.2, u) * (1 - sstep(9, 9.8, u)), talk: u > 8.6 && u < 9.8 }); }
      sage.root.rotation.y = YAW; pose(sage, { ph: 0, s: 0, t: Tr, point: sstep(.8, 1.6, u) * (1 - sstep(3.6, 4.2, u)), talk: u > .8 && u < 3.6 });
      base.ram.kneel = sstep(5.4, 6.2, u) * (1 - sstep(7.6, 8.4, u)); base.lak.kneel = base.ram.kneel; base.ram.join = 1;
      once('i11a', u >= 4.4, () => { flashV = .9; burst(1475, 60, 0, .55, 120, 100); burst(1475, 60, 0, .13, 80, 80); });
      if (u > 4.4 && u < 6.4) for (let k = 0; k < 3; k++) ember(1475 + rnd(-30, 30), rnd(10, 60), 0, true);
    }
    if (id === 'angada') {   // Angada's message to Ravan (Valmiki, Yuddha Kanda)
      const ax0 = u < 3 ? lerp(5200, 5410, ease(u / 3)) : 5410, jump = sstep(6.4, 7.6, u) * (1 - sstep(7.6, 8.4, u)), fling = sstep(7.5, 8.9, u), ax = ax0 + 30 * sstep(6.4, 7.6, u) - 30 * sstep(9.2, 10.4, u) * 0;
      const ay = 190 * Math.sin(Math.PI * clamp((u - 6.4) / 2.0));
      if (u > .2 && u < 10.7) { const back = sstep(9, 10.4, u); showAt(angada, ax - 60 * back, u > 6.4 && u < 8.4 ? ay : 0, 6, back > 0 ? -YAW : YAW, pop(.2, 10.7, u, 1)); pose(angada, { ph: ax * Math.PI / STEP, s: u < 3 || back > 0 ? .8 : 0, t: Tr, point: sstep(3, 3.6, u) * (1 - sstep(4.6, 5.2, u)), talk: (u > 3 && u < 5) || u > 9.4, angry: .5, fly: u > 6.4 && u < 8.4 ? .7 : 0 }); }
      // Ravan on his seat of state, furious; four demons seize Angada
      rav.root.visible = true; rav.root.position.set(5600, 0, -10); pose(rav, { ph: 0, s: 0, t: Tr });
      const demons = [[kum, 1.9, -50, 0], [indra, 1.1, -26, 1], [tataka, 1.3, 8, 2], [surp, 1.2, 34, 3]];
      demons.forEach(([h, sc, off, k]) => { const a = 4.6 + k * .35, come = ease(sstep(a, a + 1.2, u)), hang = sstep(6.2, 6.5, u), x0 = 5640 - k * 18, x1 = ax + off * .6 + 0;
        const x = lerp(x0, x1, come) , flingX = fling * (60 + k * 40) * (k % 2 ? 1 : -1), flingY = fling * (u < 8.9 ? 40 : 0) - (u > 7.6 ? 190 * clamp((u - 7.6) / 1.4) ** 2 * 0 : 0);
        const px = u < 7.5 ? x : ax + off * .5 + flingX * (u - 7.5), py = u < 7.5 ? (hang > 0 ? lerp(0, ay, hang) : 0) : Math.max(0, ay * (1 - fling) + 60 * Math.sin(Math.PI * clamp((u - 7.5) / 1.4)) - 120 * clamp((u - 7.5) / 1.4) ** 2 * 0);
        if (u > a && u < 9.6) { showAt(h, px, Math.max(0, py * (u < 7.5 ? 1 : 1 - clamp((u - 7.5) / 1.4))), 4 + k * 3, face, sc); pose(h, { ph: 0, s: 0, t: Tr, cheer: hang * (1 - sstep(7.5, 7.9, u)), angry: 1 }); h.root.rotation.z = u > 7.5 ? -1.5 * sstep(8.4, 9, u) : 0; } });
      // the tower of the palace breaks as Angada lands on it
      const tw = 1 - sstep(7.6, 8.1, u); tower.visible = u > 3 && u < 9.5 && tw > .02; tower.position.set(5640, 150, -40); tower.scale.setScalar(tw + .01);
      once('i12a', u >= 6.4, () => { flashV = .4; burst(ax, 30, 0, .13, 60, 60); });
      once('i12b', u >= 7.6, () => { flashV = .9; burst(5640, 220, -30, .08, 130, 150); for (let k = 0; k < 20; k++) ember(5640 + rnd(-40, 40), rnd(150, 230), 0, true); });
    }
    if (id === 'boons') {   // Kaikeyi's boons
      if (u > .2 && u < 10.9) { const kf = sstep(.2, 1.4, u) * (1 - sstep(9.8, 10.9, u));
        showAt(dash, 2450, 10 * sstep(5.6, 6.8, u), 0, face, kf + .001); pose(dash, { ph: 0, s: 0, t: Tr, kneel: sstep(4.2, 5.4, u), talk: u > 2.2 && u < 4.4, sad: 1 }); dash.root.rotation.z = -1.4 * sstep(5.6, 6.8, u);
        showAt(kaik, 2515, 0, -10, face, kf + .001); pose(kaik, { ph: 0, s: 0, t: Tr, talk: u > 1.8 && u < 5, point: sstep(2.2, 3, u) * (1 - sstep(4.8, 5.4, u)), angry: .6 }); }
      once('i1', u >= .2, () => { flashV = .4; burst(2480, 110, 0, .78, 60, 70); });
      base.ram.kneel = sstep(7, 8.2, u) * (1 - sstep(9.6, 10.6, u)); base.ram.sad = .8;
    }
    if (id === 'sandals') {   // Bharata and the sandals
      const bx = u < 4 ? lerp(1850, 2150, ease(u / 4)) : (u < 6.2 ? 2150 : lerp(2150, 1950, (u - 6.2) / 2.4));
      if (u > .2 && u < 8.7) { showAt(bharat, bx, 0, 4, u < 6.5 ? YAW : -YAW, pop(.2, 8.7, u, 1)); pose(bharat, { ph: bx * Math.PI / STEP, s: (u < 4 || u > 6.2) ? .85 : 0, t: Tr, kneel: sstep(4, 5, u) * (1 - sstep(6.2, 7, u)), talk: u > 1 && u < 4, sad: 1 }); }
      const sp = clamp((u - 5.2) / 1.6), hx = bx, hy = 165;
      sandals.visible = u > 5.2 && u < 8.8; if (sandals.visible) { sandals.position.set(u < 6.8 ? lerp(rx + 12, hx, ease(sp)) : hx, u < 6.8 ? lerp(98, hy, ease(sp)) + Math.sin(Math.PI * sp) * 18 : hy + Math.sin(u * 4) * 1.5, 8); sandals.rotation.y = u * 1.5; sandals.scale.setScalar(1 - sstep(8.2, 8.8, u)); }
      base.ram.point = sstep(4.4, 5.2, u) * (1 - sstep(6, 6.8, u));
      once('i2', u >= 5.4, () => { flashV = .3; burst(rx + 14, 100, 0, .12, 50, 60); });
    }
    if (id === 'surp') {   // Surpanakha
      const sx = u < 3 ? lerp(3560, 3250, ease(u / 3)) : (u < 6 ? 3250 : lerp(3250, 3900, ease(sstep(6, 8.6, u))));
      if (u > .2 && u < 8.8) { showAt(surp, sx, 0, 6, u < 6 ? face : YAW, pop(.2, 8.8, u, 1.1)); pose(surp, { ph: sx * Math.PI / STEP, s: (u < 3 || u > 6) ? .9 : 0, t: Tr, talk: u > 3 && u < 6, angry: sstep(4.4, 5, u), look: -.15 }); if (u > 6) ember(sx + 20, 90, 0, true); }
      base.ram.look = -.35; base.ram.talk = u > 3.4 && u < 4.4; base.lak.point = sstep(5, 5.8, u) * (1 - sstep(8, 9, u)); base.lak.angry = sstep(5, 5.8, u);
      once('i3a', u >= 6, () => { flashV = .5; burst(3250, 100, 0, .85, 80, 90); });
    }
    if (id === 'rekha') {   // the hermit at the hut: Ravan in disguise
      const hx = u < 3.5 ? lerp(3020, 3150, ease(u / 3.5)) : 3150, rv = sstep(7.6, 8.2, u);
      rekha.visible = rekhaGlow.visible = false;
      if (u < 7.9) { rav.root.visible = false; showAt(hermit, hx, 0, 6, YAW, pop(.1, 99, u, 1)); pose(hermit, { ph: hx * Math.PI / STEP, s: u < 3.5 ? .7 : 0, t: Tr, talk: u > 3.6 && u < 7, sad: .7 }); }
      else { rav.root.visible = true; rav.root.position.set(3150, 0, 0); rav.root.scale.set(1.1 * (.5 + .5 * ease(rv)), 1.1 * (.5 + .5 * ease(rv)), 1.1); rav.root.rotation.y = YAW - .4; pose(rav, { ph: 0, s: 0, t: Tr }); }
      base.sita.look = -.2; base.sita.sad = .5; base.sita.talk = u > 4 && u < 7;
      once('i4a', u >= 6.2, () => { flashV = .6; burst(3178, 40, 0, .02, 80, 90); });
      once('i4b', u >= 7.8, () => { flashV = 1; burst(3150, 140, 0, .78, 140, 150); });
    }
    if (id === 'sabari') {   // Sabari's berries
      const bx = u < 4 ? lerp(3460, 3640, ease(u / 4)) : 3640, d = sstep(8, 9, u);
      if (u > .2 && u < 9) { showAt(sabari, bx, 0, 6, YAW, pop(.2, 9, u, .96)); pose(sabari, { ph: bx * Math.PI / STEP, s: u < 4 ? .55 : 0, t: Tr, talk: u > 4.2 && u < 7.6, point: sstep(4.2, 5, u) * (1 - sstep(6, 6.6, u)) }); sabari.torso.rotation.x += .22; if (d > 0) for (let k = 0; k < 2; k++) ember(bx + rnd(-15, 15), rnd(20, 150), 0, true); }
      const bp = clamp((u - 5) / 1.6); berry.visible = u > 5 && u < 7.4; if (berry.visible) berry.position.set(lerp(bx + 28, rx + 18, ease(bp)), lerp(98, 128, ease(bp)) + Math.sin(Math.PI * bp) * 12, 8);
      base.ram.look = -.25; base.ram.talk = u > 6.8 && u < 8;
      once('i5', u >= 7.4, () => { flashV = .5; burst(rx + 14, 125, 0, .13, 80, 70); });
    }
    if (id === 'vali') {   // Sugriva and Vali
      const sw = Math.sin(u * 2.6), duel = u > .8 && u < 6, sx = duel ? 4040 + 14 * sw : (u < .8 ? 4040 : 4030), vx = duel ? 4125 - 14 * sw : 4125;
      const vf = sstep(8.2, 9.6, u), vf2 = 1 - sstep(11.6, 12.8, u);
      if (u > .3 && u < 13) { const f = sstep(.3, 1.4, u);
        showAt(sugr, sx, 0, 6, YAW, f + .001); pose(sugr, { ph: sx * Math.PI / STEP, s: 0, t: Tr, kneel: sstep(9.8, 10.8, u) * (1 - sstep(10.8, 11.6, u)), angry: u < 8.2 ? 1 : 0 });
        if (u < 8.2) { sugr.arms[0].rotation.x = -1.5 + Math.sin(u * 7) * .6; sugr.arms[1].rotation.x = -1.2 + Math.sin(u * 7 + 2) * .6; sugr.torso.rotation.y = Math.sin(u * 7) * .25; } }
      if (u > .3 && u < 12.9) { showAt(vali, vx, 10 * vf, -4, face, vf2 * (.2 + .8 * ease(sstep(.3, 1.4, u))) + .001); pose(vali, { ph: 0, s: 0, t: Tr, talk: u > 9.4 && u < 11.6, angry: u < 8.2 ? 1 : 0, sad: u > 8.4 ? 1 : 0 }); if (u < 8.2) { vali.arms[0].rotation.x = -1.5 + Math.sin(u * 7 + 1) * .6; vali.arms[1].rotation.x = -1.2 + Math.sin(u * 7 + 3) * .6; vali.torso.rotation.y = -Math.sin(u * 7 + 1) * .25; } vali.root.rotation.z = -1.4 * vf; }
      once('i3a', u >= .3, () => { flashV = .5; burst(4090, 90, 0, .02, 80, 90); });
      once('i3b', u >= 8.2, () => { flashV = .8; burst(4125, 120, 0, .02, 120, 130); });
      once('i3c', u >= 11, () => { flashV = .7; burst(4030, 150, 0, .12, 100, 110); });
    }
    if (id === 'vib') {   // Vibhishana joins Ram
      const bx = u < 4 ? lerp(4330, 3990, ease(u / 4)) : 3990;
      if (u > .2 && u < 8.8) { showAt(vibh, bx, 0, 6, face, pop(.2, 8.8, u, 1)); pose(vibh, { ph: bx * Math.PI / STEP, s: u < 4 ? .85 : 0, t: Tr, kneel: sstep(4, 5, u) * (1 - sstep(6.4, 7.2, u)), join: sstep(4, 5, u) * (1 - sstep(6.4, 7.2, u)), talk: u > 5 && u < 6.4 }); }
      if (u > 6.4 && u < 8.4) { for (let k = 0; k < 3; k++) parts.push({ x: rx + 24, y: 118, z: 8, vx: rnd(10, 40), vy: rnd(-10, 10), vz: 0, life: rnd(.8, 1.4), age: 0, hue: .55, r: rnd(1.2, 2.2), drag: .6, g: 25 }); }
      base.ram.point = sstep(5.8, 6.4, u) * (1 - sstep(8, 8.8, u)); base.ram.look = .25;
      once('i7', u >= 7, () => { flashV = .5; burst(3990, 160, 0, .55, 90, 80); });
    }
    if (id === 'indra') {   // Indrajit's serpent arrows and Garuda
      const cx = u < 12.5 ? lerp(5750, 5330, ease(sstep(.2, 1.8, u))) : lerp(5330, 5900, sstep(12.5, 15.5, u)), cy = 150 + Math.sin(u * 2) * 5;
      chariot.visible = u > .1 && u < 15.9; chariot.position.set(cx, cy, 0); chariot.scale.setScalar(1); chariot.userData.mat.color.setHex(0x3a1a6a); chariot.userData.mat.emissive.setHex(0x1a0a40); chariot.userData.wheels.forEach(w => { w.rotation.z = Tr * 4; });
      if (u > .1 && u < 15.9) { showAt(indra, cx - 10, cy + 16, 0, face, 1.1); pose(indra, { ph: 0, s: 0, t: Tr, aim: sstep(1.4, 2.2, u) * (1 - sstep(4.4, 5, u)), draw: sstep(1.6, 3, u) * (u < 4.2 ? 1 : 0), talk: u > 5 && u < 8, angry: 1 }); if (Math.random() < .5) ember(cx + rnd(-30, 30), cy + 4, 0, true); }
      const tgt = [[rx, 105], [rx - 95, 105]];
      serpents.forEach((g, i) => { const t0 = 1.8 + i * .38, p = (u - t0) / .9, tg = tgt[i % 2]; g.visible = p >= 0 && p < 1; if (g.visible) { g.position.set(lerp(cx - 30, tg[0], p), lerp(cy + 40, tg[1], p) + Math.sin(p * 9) * 5, 8); g.rotation.z = Math.atan2(tg[1] - cy - 40, tg[0] - cx + 30) + Math.PI; for (let k = 0; k < 2; k++) ember(g.position.x + 14, g.position.y, 8, false); } });
      const cf = (a) => sstep(a, a + 1.2, u) * (1 - sstep(10, 11, u));
      coils[0].visible = cf(3.2) > .02; coils[0].position.set(rx, 0, 6); coils[0].scale.set(1, .05 + .95 * cf(3.2), 1); coils[0].rotation.y = u * .4;
      coils[1].visible = cf(3.6) > .02; coils[1].position.set(rx - 95, 0, 2); coils[1].scale.set(1, .05 + .95 * cf(3.6), 1); coils[1].rotation.y = -u * .4;
      const rf = sstep(4.2, 5.2, u) * (1 - sstep(11, 12.6, u));
      base.ram.fall = rf; base.lak.fall = rf; base.ram.sad = rf; base.lak.sad = rf;
      once('i4a', u >= 4.2, () => { flashV = .7; burst(rx, 110, 0, .38, 90, 100); burst(rx - 95, 110, 0, .38, 90, 100); });
      const gv = u > 8 && u < 15.6; garuda.visible = gv;
      if (gv) { const gx = u < 10.5 ? lerp(5950, 5050, ease((u - 8) / 2.5)) : (u < 13 ? 5050 : lerp(5050, 4250, ease((u - 13) / 2.6))), gy = u < 10.5 ? lerp(320, 200, ease((u - 8) / 2.5)) : (u < 13 ? 200 + Math.sin(u * 3) * 6 : lerp(200, 360, ease((u - 13) / 2.6)));
        garuda.position.set(gx, gy, -30); garuda.rotation.y = Math.PI - .45; const fl = Math.sin(u * 11) * .6; garuda.userData.wings.forEach((w, i) => { w.rotation.x = (i ? -1 : 1) * fl; }); if (Math.random() < .7) ember(gx + rnd(-30, 30), gy - 10, -30, true); }
      once('i4b', u >= 10.4, () => { flashV = 1; burst(5050, 190, 0, .12, 130, 150); });
      once('i4c', u >= 12.6, () => { flashV = .6; burst(5330, 150, 0, .78, 90, 100); });
    }
    if (id === 'agni') {   // Sita's trial by fire
      const sx = u < 4.4 ? lerp(5700, 5445, ease(u / 4.4)) : (u < 5.6 ? 5445 : (u < 6.6 ? lerp(5445, 5400, u - 5.6) : 5400)), inFire = sstep(5.6, 6.6, u) * (1 - sstep(8.4, 9, u)), g = sstep(8.6, 9.4, u);
      base.sitaOverride = { x: sx, y: 0, face: YAW - .6, ph: sx * Math.PI / STEP + 1.4, s: u < 4.4 ? .75 : 0, join: sstep(4.4, 5.2, u) * (1 - sstep(8.6, 9.2, u)), look: -.1 };
      fireGlow.visible = u > 4.8 && u < 9.4; fireGlow.material.opacity = .22 * sstep(4.8, 6, u) * (1 - sstep(8.6, 9.4, u));
      if (u > 4.8 && u < 9.2) for (let k = 0; k < 3; k++) flame(5400 + rnd(-46, 46), 2, rnd(-6, 20), 1 + inFire * .4);
      if (u > 6.2 && u < 9) { showAt(agni, 5330, 0, -8, YAW, pop(6.2, 9, u, 1.5)); pose(agni, { ph: 0, s: 0, t: Tr, cheer: sstep(7.2, 8, u) * (1 - sstep(8.6, 9, u)), look: .3 }); if (Math.random() < .5) flame(5330 + rnd(-14, 14), rnd(20, 200), -8, .8); }
      if (g > 0) { sitaGlow.visible = true; sitaGlow.position.set(5400, 90, 20); sitaGlow.scale.setScalar(70 * g * (1 + .08 * Math.sin(u * 8)) + .01); sitaGlow.material.opacity = .35 * (1 - sstep(9.6, 10, u)); }
      once('i9a', u >= 6.2, () => { flashV = .9; burst(5400, 100, 0, .08, 140, 140); });
      once('i9b', u >= 8.6, () => { flashV = 1; burst(5400, 110, 0, .13, 150, 150); });
    } else sitaGlow.visible = false;
    if (id === 'darbar') {   // the coronation tableau
      const f = ease(sstep(.4, 1.6, u)), out = 1 - sstep(10.6, 11.8, u), k = f * out;
      label.material.opacity = 0; throne.visible = true; throne.position.set(760, 0, -20); throne.scale.setScalar(.01 + k);
      const seat = (h, x, sy, ry, s) => { h.root.position.set(x, 14 + sy, 2); h.root.rotation.set(0, ry, 0); h.root.scale.setScalar(Math.max(.01, s * k)); };
      seat(ram, 730, 22, .18, 1); seat(sita, 790, 22, -.18, 1);
      base.ram.sit = 1; base.sita.sit = 1; base.lak.look = -.2; base.ram.fall = undefined; base.lak.fall = undefined;
      seat(lak, 672, 0, .35, 1);
      showAt(bharat, 862, 14, 4, -.35, pop(.3, 11.8, u, 1)); pose(bharat, { ph: 0, s: 0, t: Tr, look: .2, cheer: .0 });
      seat(han, 706, 0, .3, 1); han.root.position.z = 18; pose(han, { ph: 0, s: 0, t: Tr, kneel: 1, join: 1, look: .25 });
      { const hh = 0; heart.visible = false; if (heart.visible) { han.torso.getWorldPosition(wp); heart.position.set(wp.x + 6, wp.y + 30, wp.z + 16); heart.scale.setScalar(30 * hh * (1 + .07 * Math.sin(u * 7))); } }
      if (Math.random() < .12) petalRain(560, 960, 1, 280);
      once('i10', u >= .5, () => { flashV = 1; burst(760, 140, 0, .12, 160, 160); petalRain(560, 960, 50, 260); });
      base.hold = true;
    }
  }

  // the colour of the light follows the story: warm in Ayodhya, green in the forest, red at Lanka, gold at the homecoming
  const MOOD = [[0, 0xffc08a, 0x4a5a9a, 0xff3fa0], [22, 0xffd0a0, 0x4a5a9a, 0xff3fa0], [40, 0xffa070, 0x5a4a8a, 0xff6a60], [56, 0xa8ffd0, 0x3a6a7a, 0x40ffb0], [96, 0xffd8a8, 0x4a5a8a, 0xff7ac0],
    [114, 0xff8060, 0x6a3a5a, 0xff4030], [138, 0xff5a40, 0x6a2a3a, 0xff2a20], [172, 0xff9a50, 0x5a3a4a, 0xff6a30], [186, 0x9ad0ff, 0x3a5a9a, 0x6a8aff], [205, 0xffe0a0, 0x5a5a8a, 0xffa070], [225, 0xffd890, 0x5a5a8a, 0xffa070]];
  const _mk = new THREE.Color(), _ma = new THREE.Color(), _mr = new THREE.Color(), _c2 = new THREE.Color(), moodOut = { key: _mk, amb: _ma, rim: _mr };
  function moodAt(S) {
    let i = 0; while (i < MOOD.length - 2 && S >= MOOD[i + 1][0]) i++;
    const a = MOOD[i], b = MOOD[i + 1], f = sstep(a[0], b[0], S);
    _mk.setHex(a[1]).lerp(_c2.setHex(b[1]), f); _ma.setHex(a[2]).lerp(_c2.setHex(b[2]), f); _mr.setHex(a[3]).lerp(_c2.setHex(b[3]), f);
    return moodOut;
  }
  // In exile (and only then) Ram, Lakshman and Sita wear bark robes, and the men have matted hair instead of crowns.
  function setAscetic(H, on) {
    if (H.asc === on) return; H.asc = on; const hd = H.head.userData;
    if (hd.crownParts) hd.crownParts.forEach(m => { m.visible = !on; }); if (hd.jata) hd.jata.visible = on;
    if (H.dress) H.dress.material.color.setHex(on ? 0x9a7a50 : 0xffffff);
  }
  // A character faces the way it is walking or flying (right: +1, left: -1), turning smoothly; at rest it keeps its last direction.
  function turn(H, vx, dt, mag, extra) {
    if (Math.abs(vx) > 6) H.dir = vx > 0 ? 1 : -1; else if (H.dir === undefined) H.dir = 1;
    const target = H.dir * ((mag || YAW) + (extra || 0));
    let d = target - H.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); H.root.rotation.y += d * (1 - Math.exp(-dt * 7));
  }
  const fired = {}; let lastTr = -1, flashV = 0, camC = 380;
  const once = (k, c, fn) => { if (c && !fired[k]) { fired[k] = 1; fn(); } };
  function resetAll() { for (const k in fired) delete fired[k]; parts = []; pets = []; flashV = 0; }
  const wp = new THREE.Vector3();

  function update(Tr, dt) {
    const ins = mapT(Tr), T = ins.S, frozen = ins.i >= 0, fz = frozen ? 0 : 1;   // T is story time; during an inserted scene it stands still
    if (Tr < lastTr - .0001) resetAll();
    lastTr = Tr; flashV = Math.max(0, flashV - dt * 1.7);
    camC += ((frozen ? INS[ins.i].fx : follow(T)) - camC) * (1 - Math.exp(-dt * 2.2));
    const wide = Math.max(sstep(104, 110, T) * (1 - sstep(124, 128, T)), sstep(134, 140, T) * (1 - sstep(184, 187, T)), sstep(185, 188, T) * (1 - sstep(204, 206, T)));
    spotC = camC + 80; spotH = lerp(950, 1300, wide);
    const rx = ramX(T), vR = fz * vel(ramX, T);

    // 1. birth: a lotus, and a baby of light who becomes Ram (and his brother Lakshman)
    lotus.visible = false; const open = 0;
    petals.forEach(p => { const d = p.userData, ang = lerp(.1, 1.12 - d.ring * .25, open); p.position.set(Math.cos(d.a) * (2 + d.ring * 2), 3, Math.sin(d.a) * (2 + d.ring * 2) * .8); p.rotation.set(0, -d.a, 0); p.rotateZ(-ang); });
    baby.visible = false;
    if (false) { const u = sstep(3, 6, T); baby.position.set(330, 34 + u * 70 + Math.sin(T * 3) * 2, 10); baby.scale.setScalar(1 + sstep(5.4, 6.4, T) * 3); babyLight.position.copy(baby.position); babyLight.intensity = 1.6 * sstep(3, 4, T); } else babyLight.intensity = 0;
    // King Dasharatha's sacred fire ritual: a divine being rises from the flames with a golden bowl of sacred pudding
    if (T < 7.6 && !frozen) { for (let k = 0; k < 2; k++) flame(330 + rnd(-16, 16), 4, 8, 1.5); }
    bowl.visible = T > 2.2 && T < 6.2; if (bowl.visible) { const bu = ease(sstep(2.2, 5.6, T)); bowl.position.set(330, lerp(24, 118, bu) + Math.sin(Tr * 3) * 1.5, 10); bowl.scale.setScalar(.4 + .6 * sstep(2.2, 3.4, T) + .6 * sstep(5.4, 6.2, T)); babyLight.position.set(330, 118, 40); babyLight.intensity = 1.5 * sstep(3, 4, T) * (1 - sstep(5.6, 6.4, T)); } else babyLight.intensity = 0;
    dash2.root.visible = T < 10 && !frozen; if (dash2.root.visible) { dash2.root.position.set(215, 0, 6); dash2.root.rotation.y = YAW; dash2.root.scale.setScalar(.2 + .8 * ease(sstep(0, 1.2, T)) * (1 - sstep(8.4, 10, T) * .97)); pose(dash2, { ph: 0, s: 0, t: Tr, join: sstep(1, 2, T) * (1 - sstep(7, 8, T)), talk: false }); }
    once('birth', T >= 6.0, () => { flashV = 1; burst(380, 100, 10, .12, 150, 150); burst(330, 118, 10, .1, 90, 120); petalRain(60, 900, 40, 260); });
    ram.root.visible = T >= 6.0; ram.root.scale.setScalar(.2 + .8 * ease(sstep(6.0, 7.2, T)));
    lak.root.visible = T >= 6.3; lak.root.scale.setScalar(.2 + .8 * ease(sstep(6.3, 7.5, T)));

    // Ram: walking, aiming, cheering
    let aw = null;
    for (const [a0, a1, d0, d1] of WIN) if (T >= a0 && T < a1 + .6) aw = { aim: sstep(a0, a0 + 1.2, T) * (1 - sstep(a1, a1 + .6, T)), draw: sstep(d0, d1, T) * (T < d1 + .05 ? 1 : 0), big: a0 < 30 };
    let insShot = null; const base = { ram: {}, lak: {}, sita: {} };
    if (frozen) { const r = insertParams(INS[ins.i].id, ins.u, rx); if (!aw) aw = r.aw; insShot = r.shot; }
    const rider = T >= 185.5 && T < 205;
    ram.root.position.set(rx, rider ? chY(T) + 16 : 0, 6);
    const po = { ph: rx * Math.PI / STEP, s: rider ? 0 : clamp(Math.abs(vR) / 85), t: Tr };
    if (aw) { po.aim = aw.aim; po.draw = aw.draw; }
    if (T >= 31 && T < 34) po.victory = sstep(31.1, 31.8, T) * (1 - sstep(33, 34, T));
    if (T >= 168.8 && T < 172) po.victory = sstep(168.9, 169.6, T) * (1 - sstep(171, 172, T));
    pose(ram, po); const chV = fz * vel(chX, T); if (!frozen) turn(ram, rider ? chV : vR, dt);

    // Lakshman
    const lx = lakX(T), vL = fz * vel(lakX, T), lfall = sstep(155.5, 156.4, T) * (1 - sstep(164.5, 166, T));
    lak.root.position.set(lx, T >= 185.5 && T < 205 ? chY(T) + 16 : 12 * lfall, 2);
    pose(lak, { ph: lx * Math.PI / STEP + 2.6, s: (T >= 185.5 && T < 205) ? 0 : clamp(Math.abs(vL) / 85), t: Tr });
    lak.root.rotation.z = -1.45 * lfall; ram.root.rotation.z = -1.45 * lfall; ram.root.position.y = 12 * lfall; if (!frozen) turn(lak, (T >= 185.5 && T < 205) ? chV : vL, dt);

    // Sita
    const sx = sitaX(T), vS = fz * vel(sitaX, T), captive = T >= 91 && T < 176, sRide = (T >= 82.5 && T < 91) || (T >= 185 && T < 205);
    sita.root.visible = T >= 25.5; sita.root.scale.setScalar(.2 + .8 * ease(sstep(25.5, 26.7, T)));
    sita.root.position.set(sx, sRide ? chY(T) + 16 : 0, 22);
    pose(sita, { ph: sx * Math.PI / STEP + 1.4, s: sRide ? 0 : clamp(Math.abs(vS) / 85), t: Tr, kneel: captive ? .85 * sstep(91.5, 92.5, T) * (1 - sstep(174.5, 176, T)) : 0 });
    if (!frozen) turn(sita, sRide ? chV : vS, dt, YAW, (T < 32 || captive) ? .55 : 0);

    // Hanuman and the vanaras
    const hp = hanPos(T); han.root.visible = hp.vis;
    if (hp.vis) {
      han.root.position.set(hp.x, hp.y, 10); const hv = fz * (hanPos(T + .06).x - hanPos(T - .06).x) / .12;
      if (!frozen) turn(han, (T >= 185.5 && T < 205) ? chV : hv, dt, hp.fly ? 1.4 : YAW);
      pose(han, { ph: hp.x * Math.PI / STEP, s: hp.fly ? 0 : clamp(Math.abs(hv) / 85), t: Tr, kneel: hp.kneel, fly: hp.fly, cheer: sstep(176, 177, T) * (1 - sstep(182, 183, T)) });
      han.tailTip.visible = hp.tail > 0;
      if (hp.tail) { han.tailTip.getWorldPosition(wp); for (let i = 0; i < 4; i++) ember(wp.x, wp.y, wp.z, true); }
    }
    mount.visible = hp.vis && hp.mount > .02; if (mount.visible) { mount.position.set(hp.x, hp.y + 150, 10); mount.scale.setScalar(hp.mount); mount.rotation.y = T * .8; }
    vanaras.forEach((v, i) => {
      const vis = T >= 119 && T < 185; v.root.visible = vis; if (!vis) return;
      const f = (t) => (t < 152 ? ramX(t) : ramX(152)) - 130 - i * 44, x = f(T), vv = fz * (f(T + .06) - f(T - .06)) / .12;
      v.root.position.set(x, 0, 14 + (i % 2) * 14); pose(v, { ph: x * Math.PI / STEP + i, s: clamp(Math.abs(vv) / 85), t: Tr, cheer: sstep(176, 177, T) * (1 - sstep(182, 183, T)) }); if (!frozen) turn(v, vv, dt);
    });

    // 3. Shiva's bow: lifted, bent, snapped; then Sita's garland
    const handAt = new THREE.Vector3(), rt = ram.arms[0].userData.hand; ram.root.updateMatrixWorld(true);
    if (T < 26.2) { bigBow.position.set(1700, 40 + Math.sin(T * 2) * 2, 4); bigBow.rotation.set(0, 0, Math.PI / 2); bigBow.scale.setScalar(.95); }
    else if (T < 31.0) { rt.getWorldPosition(handAt); bigBow.position.copy(handAt).add(new THREE.Vector3(7, 0, 0)); bigBow.rotation.set(0, 0, 0); bigBow.scale.setScalar(1); }
    bigBow.visible = T < 31.0;
    if (bigBow.visible) {
      const d = T >= 28.4 ? sstep(28.4, 31, T) : 0, curve = bowCurve(78 - d * 8, 24 + d * 8);
      bigBowMesh.geometry.dispose(); bigBowMesh.geometry = new THREE.TubeGeometry(curve, 24, 2.6, 8);
      const sp = bigString.geometry.attributes.position; sp.setXYZ(0, 0, 78 - d * 8, 0); sp.setXYZ(1, -d * 34, 0, 0); sp.setXYZ(2, 0, -(78 - d * 8), 0); sp.needsUpdate = true;
    }
    once('snap', T >= 31.0, () => { flashV = 1; burst(1590, 130, 12, .12, 160, 170); petalRain(1100, 2100, 70, 280); halves.forEach(h => { h.visible = true; h.userData = { t0: T }; h.position.set(1595, 130, 10); }); });
    halves.forEach((h, i) => { if (!h.visible) return; const a = T - h.userData.t0, g = i ? -1 : 1; h.position.set(1595 + g * a * 90, 130 - 170 * a * a, 10); h.rotation.z = g * a * 3; if (a > 2.2 || h.position.y < 6) h.visible = false; });
    { const jv = T >= 31 && T < 41; janaka.root.visible = jv && !(frozen && INS[ins.i].id !== 'xx');
      if (jv && !frozen) { janaka.root.position.set(1860, 0, 8); janaka.root.rotation.y = -YAW; janaka.root.scale.setScalar(.2 + .8 * ease(sstep(31, 32.4, T)) * (1 - sstep(39.6, 41, T) * .97)); pose(janaka, { ph: 0, s: 0, t: Tr, talk: T > 34 && T < 37.5, join: sstep(37.6, 38.6, T) * (1 - sstep(40, 41, T)) }); } }
    once('wedding', T >= 38.6, () => { burst(1700, 150, 12, .1, 80, 90); petalRain(1500, 1900, 40, 260); });
    palace2.userData.win.color.setRGB(1, .81, .44).multiplyScalar(1 - .88 * sstep(44, 60, T) * (1 - sstep(190, 200, T)) * (T < 200 ? 1 : 0));

    // Ram's bow: slung on the back, in hand to shoot
    const bowOn = aw && !aw.big;
    bow.visible = T >= 43;
    if (bowOn) {
      const f = ram.arms[0].userData.hand, b = ram.arms[1].userData.hand, fp = new THREE.Vector3(), bp = new THREE.Vector3(); f.getWorldPosition(fp); b.getWorldPosition(bp);
      bow.position.copy(fp); bow.rotation.set(0, 0, 0); bow.scale.setScalar(1.3); bow.updateMatrixWorld(true);
      const bl = bow.worldToLocal(bp.clone()), sp = bowString.geometry.attributes.position; sp.setXYZ(0, 0, 38, 0); sp.setXYZ(1, bl.x, bl.y, bl.z); sp.setXYZ(2, 0, -38, 0); sp.needsUpdate = true;
      arrow.visible = aw.draw > .05 && !insShot && !SHOTS.some(([t0, d]) => T >= t0 && T < t0 + d + .1); if (arrow.visible) { arrow.position.copy(bp).add(new THREE.Vector3(30, 0, 0)); arrow.rotation.set(0, 0, 0); }
    } else if (T >= 43) {
      bow.position.set(rx - 22, 112, -14); bow.rotation.set(0, .5, .3); bow.scale.setScalar(1.25);
      const sp = bowString.geometry.attributes.position; sp.setXYZ(0, 0, 38, 0); sp.setXYZ(1, 0, 0, 0); sp.setXYZ(2, 0, -38, 0); sp.needsUpdate = true; arrow.visible = false;
    }
    if (rider) bow.visible = false;
    // arrows in flight
    SHOTS.forEach(([t0, dur, tx, ty], i) => {
      const p = (T - t0) / dur; if (p < 0 || p >= 1) return;
      const x0 = rx + 62, y0 = 128; arrow.visible = true;
      arrow.position.set(lerp(x0, tx, p), lerp(y0, ty, p) + Math.sin(Math.PI * p) * 8, 10); arrow.rotation.set(0, 0, Math.atan2(ty - y0, tx - x0));
      for (let k = 0; k < 3; k++) ember(arrow.position.x - 18, arrow.position.y, 10, true);
    });
    if (insShot) { const q = insShot; arrow.visible = true; arrow.position.set(lerp(q.x0, q.x1, q.p), lerp(q.y0, q.y1, q.p) + Math.sin(Math.PI * q.p) * 8, 10); arrow.rotation.set(0, 0, Math.atan2(q.y1 - q.y0, q.x1 - q.x0)); for (let k = 0; k < 3; k++) ember(arrow.position.x - 18, arrow.position.y, 10, true); }
    if (!insShot && !SHOTS.some(([t0, d]) => T >= t0 && T < t0 + d) && !(bowOn && aw.draw > .05)) arrow.visible = false;

    // 6. the golden deer, and the arrow that ends the illusion
    const dv = T >= 66 && T < 77 && !frozen;
    deer.visible = dv;
    if (dv) { const dx = deerX(T), hop = Math.abs(Math.sin(Tr * 4.2)) * 26; deer.position.set(dx, hop, -26); deer.legs.forEach((l, i) => { l.rotation.x = Math.sin(Tr * 8.4 + (i % 2) * 2.4 + (i > 1 ? 1.4 : 0)) * .9; }); deer.scale.setScalar(.85 + sstep(66, 68, T) * .15); if (Math.random() < .6) ember(dx, 60 + hop, -26, false); }
    once('deerhit', T >= 76.9, () => { flashV = .6; burst(3640, 70, 0, .12, 110, 120); });

    // 7. Ravan comes to the hut, takes Sita in his flying chariot; Jatayu fights him and falls
    const rp = T < 81 ? null : T < 82.5 ? { x: 3150, y: 0 } : T < 91 ? { x: chX(T) - 14, y: chY(T) + 18 } : { x: 5560, y: 0 };
    const burn = sstep(168.6, 177, T), ravS = 1.1 * (1 - .5 * burn);
    rav.root.visible = rp !== null && burn < .985;
    if (rp) {
      rav.root.scale.set(1.1 * (1 + burn * .1), ravS, 1.1);
      rav.root.position.set(rp.x + (T > 168.6 && T < 175 ? Math.sin(T * 60) * 2.5 * (1 - burn) : 0), rp.y, -10);
      pose(rav, { ph: 0, s: 0, t: Tr }); if (!frozen) turn(rav, T < 91 ? chV : -10, dt, YAW - .1); rav.heads.forEach((h, i) => { h.rotation.y = Math.sin(Tr * 1.1 + i) * .18; });
    }
    once('abduct', T >= 81, () => { flashV = 1; burst(3150, 110, 10, .78, 120, 130); });
    const cv = (T >= 82.5 && T < 92) || (T >= 182 && T < 213);
    chariot.visible = cv;
    if (cv) {
      chariot.position.set(chX(T), chY(T), 0); const pushpak = T > 100; chariot.userData.mat.color.setHex(pushpak ? 0xffd23a : 0x8a1a2a); chariot.userData.mat.emissive.setHex(pushpak ? 0x6a4a00 : 0x400610);
      chariot.userData.wheels.forEach(w => { w.rotation.z = T * 4; });
      chariot.scale.setScalar(pushpak ? sstep(182, 183.4, T) * (1 - sstep(210, 212.5, T)) + .001 : 1);
      if (T > 83 && T < 91 || (T > 186 && T < 205)) for (let i = 0; i < 2; i++) ember(chX(T) + rnd(-40, 40), chY(T) + 4, 0, true);
    }
    once('chariotfly', T >= 82.5, () => { flashV = .5; });
    const jv = T >= 83.5 && T < 100; jat.visible = jv;
    if (jv) {
      let jx, jy, rot = 0;
      if (T < 86.4) { const u = (T - 83.5) / 2.9; jx = lerp(3050, 3720, ease(u)); jy = 200 - 40 * u; }
      else if (T < 89.2) { const u = (T - 86.4) / 2.8; jx = lerp(3720, 3930, u); jy = lerp(160, 8, u * u); rot = u * 1.3; }
      else { jx = 3930; jy = 8; rot = 1.3; }
      jat.position.set(jx, jy, -20); jat.rotation.z = rot; const flap = T < 86.4 ? Math.sin(T * 14) * .7 : (T < 89.2 ? Math.sin(T * 6) * .4 : 0); jat.userData.wings.forEach((w, i) => { w.rotation.x = (i ? -1 : 1) * flap; });
    }
    once('jhit', T >= 86.4, () => { flashV = .5; burst(3720, 150, 0, .02, 90, 120); });
    once('jspirit', T >= 100, () => { burst(3930, 40, 0, .13, 90, 90); for (let i = 0; i < 20; i++) ember(3930 + rnd(-20, 20), 20, 0, true); });

    // 8. Hanuman meets Ram; the sea and the bridge of stones
    once('hmeet', T >= 104.6, () => { burst(3990, 150, 0, .1, 60, 80); });
    once('leap', T >= 108, () => { flashV = .4; burst(3990, 40, 0, .08, 80, 110); });
    once('ring', T >= 113.4, () => { burst(5640, 120, 0, .13, 70, 70); });
    if (T > 116 && T < 121) for (let i = 0; i < 6; i++) { ember(rnd(5170, 5810), rnd(40, 190), rnd(-30, 10), true); if (i < 4) flame(rnd(5170, 5810), rnd(60, 150), rnd(-40, 10), 1.3); }
    once('lankaburn', T >= 116, () => { flashV = .5; });
    if (hp.fly && hp.vis) ember(hp.x - 20, hp.y + 60, 10, false);
    stones.forEach(m => { const a = clamp((T - m.userData.t) / .7), sc = a <= 0 ? .001 : (a < 1 ? 1 + .35 * Math.sin(Math.PI * a) : 1); m.scale.setScalar(sc * (a > 0 ? 1 : .001)); if (a > 0 && a < 1 && Math.random() < .6) ember(m.position.x, 16, 10, false); });
    const sp = seaGeo.attributes.position; for (let i = 0; i < sp.count; i++) { const x = seaBase[i * 3], y = seaBase[i * 3 + 1]; sp.setY(i, y + Math.sin(x * .045 + Tr * 2.2) * 2.6 + Math.sin(x * .11 - Tr * 3) * 1.1); } sp.needsUpdate = true;

    // 11. Kumbhakarna, Lakshman struck down, the healing mountain
    kum.root.visible = T >= 138 && T < 155.5;
    if (kum.root.visible) { const f = sstep(148, 150.5, T); kum.root.position.set(5320, 14 * f, -10); if (!frozen) turn(kum, -10, dt, YAW - .1); kum.root.rotation.z = -1.5 * f; kum.root.scale.setScalar(1.9 * (1 - .9 * sstep(153, 155.5, T))); pose(kum, { ph: 0, s: 0, t: Tr }); }
    once('khit', T >= 147.6, () => { flashV = .8; burst(5255, 150, 0, .02, 130, 160); });
    once('lakhit', T >= 155.5, () => { flashV = .6; burst(5110, 110, 0, .02, 80, 110); });
    once('mount', T >= 158, () => { flashV = .9; burst(4900, 120, 0, .38, 130, 150); burst(5110, 60, 0, .38, 90, 100); });
    // 12. Ravan falls
    once('hit', T >= 168.6, () => { flashV = 1; burst(5560, 150, 0, .02, 170, 190); });
    for (const [k, t, dx, y, h] of [['r2', 169.2, -60, 250, .12], ['r3', 169.9, 70, 210, .9], ['r4', 170.8, 10, 120, .55], ['r5', 171.8, -300, 230, .12], ['r6', 172.8, 250, 250, .08], ['r7', 174, -120, 260, .8]]) once(k, T >= t, () => burst(5560 + dx, y, 20, h, 125));
    if (T > 168.6 && T < 177) for (let i = 0; i < 6; i++) { ember(rav.root.position.x + rnd(-45, 45), rnd(5, 230) * ravS, rnd(0, 20), true); if (i < 3) flame(rav.root.position.x + rnd(-40, 40), rnd(5, 150) * ravS, rnd(0, 20), 1.2); }
    once('freed', T >= 176, () => { burst(5700, 100, 0, .13, 90, 90); });
    once('board', T >= 185.5, () => { flashV = .6; });
    once('land', T >= 205, () => { flashV = .7; burst(560, 110, 0, .1, 100, 110); petalRain(100, 1100, 60, 280); });

    // 13–14. diyas light as the chariot flies home; lanterns, fireworks and the greeting
    world.diyas.forEach(d => { const u = d.userData, chp = chX(T), lit = Math.max(u.x < 700 ? sstep(7, 9, T) : 0, T >= 186 ? sstep(chp - 30, chp + 120, u.x) : 0), fl = .85 + .15 * Math.sin(Tr * 12 + u.ph); u.fl.visible = lit > .02; u.fl.scale.set(1, (.6 + .4 * lit) * fl, 1); u.gl.material.opacity = .55 * lit * fl; });
    world.lanterns.forEach(l => { const u = l.userData, a = sstep(205, 209, T); l.visible = a > 0 && T < 225; l.position.set(u.x + Math.sin(T * .6 + u.ph) * 14, u.y0 + (T - 205) * u.sp, -10 + Math.sin(u.ph) * 20); l.scale.setScalar(.8 + (u.ph % 1) * .5); });
    for (let k = 0; k < 12; k++) once('fw' + k, T >= 206 + k * 1.4, () => burst(150 + (k * 173) % 1100, 150 + (k * 47) % 110, rnd(-30, 20), [.1, .92, .55, .35, .02, .78][k % 6], 120));
    once('petal2', T >= 207, () => petalRain(100, 1200, 60, 260));
    label.material.opacity = sstep(208, 211, T) * (1 - sstep(221, 223.5, T));
    { const asc = T >= 53.4 && T < 185.5; setAscetic(ram, asc); setAscetic(lak, asc); setAscetic(sita, asc); }
    // the sage who guides the princes, and the inserted scenes
    const sv = T >= 10 && T < 26; sage.root.visible = sv;
    if (sv) { const sxx = ramX(T) + 130, vs = fz * vel(ramX, T); sage.root.position.set(sxx, 0, 4); if (!frozen) turn(sage, vs, dt); sage.root.scale.setScalar(.2 + .8 * ease(sstep(10, 11.2, T)) * (1 - sstep(24.4, 26, T) * .97)); pose(sage, { ph: sxx * Math.PI / STEP, s: clamp(Math.abs(vs) / 85), t: Tr }); }
    if (!(frozen && INS[ins.i].id === 'rekha')) { const rv = false; rekha.visible = rekhaGlow.visible = rv; if (rv) { const rs = ease(sstep(77.2, 78.8, T)) * (1 - sstep(84.5, 86, T)) + .001; rekha.scale.setScalar(rs); rekhaGlow.scale.setScalar(rs); rekha.material.color.setRGB(1, .63, .19); rekhaGlow.material.opacity = .25; } }
    insertActors(ins, Tr, rx, base);
    if (frozen) {   // re-pose the main cast for the inserted scene (kneeling, pointing, fallen, seated)
      const rp = Object.assign({ ph: rx * Math.PI / STEP, s: 0, t: Tr }, base.ram); if (aw) { rp.aim = aw.aim; rp.draw = aw.draw; }
      pose(ram, rp); pose(lak, Object.assign({ ph: lx * Math.PI / STEP + 2.6, s: 0, t: Tr }, base.lak));
      if (base.sitaOverride) { const o = base.sitaOverride; sita.root.position.set(o.x, o.y, 22); sita.root.rotation.y = o.face; pose(sita, { ph: o.ph, s: o.s, t: Tr, join: o.join, look: o.look }); }
      else pose(sita, Object.assign({ ph: sx * Math.PI / STEP + 1.4, s: 0, t: Tr }, base.sita));
      if (base.ram.fall !== undefined || base.lak.fall !== undefined || INS[ins.i].id === 'indra') { ram.root.rotation.z = -1.45 * (base.ram.fall || 0); ram.root.position.y = 12 * (base.ram.fall || 0); lak.root.rotation.z = -1.45 * (base.lak.fall || 0); lak.root.position.y = 12 * (base.lak.fall || 0); }
    }
    // a little squirrel carries pebbles to the bridge
    const sqv = false; squirrel.visible = false;
    if (sqv) { const q = sstep(132, 134, T), qx = ramX(T) + 60 + Math.sin(T * 1.7) * 38 * (1 - q) - 22 * q, hop = Math.abs(Math.sin(T * 7)) * 6 * (1 - q); squirrel.position.set(qx, 14 + hop, 22); squirrel.rotation.y = Math.cos(T * 1.7) > 0 ? 0 : Math.PI; if (q > .5) squirrel.rotation.y = Math.PI; squirrel.userData.pebble.visible = q < .5; if (q > .9) once('sq', true, () => { flashV = .3; burst(qx, 40, 0, .12, 50, 40); }); }
    // footsteps raise a little dust
    for (const [h, x, s2, vis] of [[ram, rx, clamp(Math.abs(vR) / 85), ram.root.visible], [lak, lx, clamp(Math.abs(vL) / 85), lak.root.visible], [sita, sx, clamp(Math.abs(vS) / 85), sita.root.visible]]) {
      if (!vis || s2 < .25 || frozen) continue; const sg = Math.sin(x * Math.PI / STEP + (h === ram ? 0 : h === lak ? 2.6 : 1.4)) > 0 ? 1 : -1;
      if (h.lastSg !== undefined && sg !== h.lastSg) for (let k = 0; k < 3; k++) parts.push({ x: x + rnd(-8, 8), y: 2, z: rnd(6, 26), vx: rnd(-14, 14), vy: rnd(6, 20), vz: 0, life: rnd(.5, .9), age: 0, hue: .09, r: rnd(1, 1.8), drag: .25, g: 20 });
      h.lastSg = sg;
    }
    // falling leaves in the forest, fireflies and sea sparkles
    if (T >= 56 && T < 100 && Math.random() < dt * 3) petalRain(camC - 500, camC + 500, 1, 280, [0x6ac040, 0xd0a030, 0x40a070, 0xe08030]);
    { const d = new THREE.Object3D(); for (let i = 0; i < MAXF; i++) { const f = ffs[i], a = f.sea ? .35 + .65 * Math.max(0, Math.sin(Tr * f.sp * 4 + f.ph)) : .25 + .75 * Math.max(0, Math.sin(Tr * f.sp + f.ph)); d.position.set(f.x + Math.sin(Tr * .4 + f.ph) * (f.sea ? 0 : 14), f.y + (f.sea ? 0 : Math.sin(Tr * .7 + f.ph) * 8), f.z); d.scale.setScalar((f.sea ? 1.6 : 2.2) * a + .01); d.updateMatrix(); ffInst.setMatrixAt(i, d.matrix); } ffInst.instanceMatrix.needsUpdate = true; if (ffInst.instanceColor) ffInst.instanceColor.needsUpdate = true; }
    { const d = new THREE.Object3D(); for (let i = 0; i < MAXM; i++) { const m = mists[i]; d.position.set(m.x + Math.sin(Tr * .12 + m.ph) * 40, m.y + Math.sin(Tr * .5 + m.ph) * 2, m.z); d.scale.set(m.sx * 1.6 * (1 + .12 * Math.sin(Tr * .3 + m.ph)), 46, 1); d.updateMatrix(); mistInst.setMatrixAt(i, d.matrix); } mistInst.instanceMatrix.needsUpdate = true; if (mistInst.instanceColor) mistInst.instanceColor.needsUpdate = true; }
    { const mc = moodAt(T); lights.key.color.copy(mc.key); lights.amb.color.copy(mc.amb); lights.rimM.color.copy(mc.rim); }
    lights.flash.intensity = flashV * 2.6; if (flashV > 0) lights.flash.position.set(camC, 150, 200);
    stepParts(dt);
  }

  // ---------- view and render ----------
  let vw = 0, vh = 0, spotC = 400, spotH = 950;
  function setView(x0, x1, yTop, yBottom, pxW, pxH, sx, sy) {
    pxW = Math.max(16, Math.round(pxW)); pxH = Math.max(8, Math.round(pxH));
    if (pxW !== vw || pxH !== vh) { vw = pxW; vh = pxH; renderer.setSize(pxW, pxH, false); composer.setSize(pxW, pxH); streakPass.uniforms.uTexel.value.set(1 / pxW, 1 / pxH); }
    const cx = (x0 + x1) / 2;
    camera.left = x0 - cx; camera.right = x1 - cx; camera.top = yTop; camera.bottom = yBottom; camera.position.set(cx, 0, 3000); camera.lookAt(cx, 0, 0);
    camera.updateProjectionMatrix();
    gradePass.uniforms.uSpot.value.set((spotC - x0) / (x1 - x0), spotH / (x1 - x0));
    // an oblique projection: things farther back are drawn slightly higher, so the ledge and the figures show a little depth
    const kx = sx || 0, ky = sy === undefined ? -.3 : sy;
    const shear = new THREE.Matrix4().set(1, 0, kx, kx * 3000, 0, 1, ky, ky * 3000, 0, 0, 1, 0, 0, 0, 0, 1);
    camera.projectionMatrix.multiply(shear); camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  function render() { drawParts(); composer.render(); return canvas; }
  return { canvas, setView, update, render, LOOP: TOTAL, WORLD, ramX, sitaX, lakX, follow: () => camC, caption: captionAt, chapters, bloom };
})();
