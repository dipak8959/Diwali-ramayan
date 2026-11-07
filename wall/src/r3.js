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
  const SLOW = 1.6, SPDN = 60 * SLOW;   // everything lasts 1.6 times longer; walking speed is measured against that

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
    uniforms: { tDiffuse: { value: null }, uSpot: { value: new THREE.Vector2(.5, 10) }, uFade: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform vec2 uSpot; uniform float uFade; varying vec2 vUv;',
      'void main(){',
      '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
      '  c *= 1. - smoothstep(uSpot.y * .5, uSpot.y, abs(vUv.x - uSpot.x));',   // only the part of the wall near the walkers is lit
      '  float l = dot(c, vec3(.299,.587,.114));',
      '  vec3 teal = vec3(-.02,.05,.09), warm = vec3(.09,.035,-.03);',      // cool shadows, warm highlights
      '  c += mix(teal, warm, smoothstep(.1,.75,l)) * (.2 + l * .6);',
      '  c = mix(vec3(dot(c, vec3(.299,.587,.114))), c, 1.18);',             // a little more colour
      '  c = (c * (2.51 * c + .03)) / (c * (2.43 * c + .59) + .14);',        // filmic curve
      '  gl_FragColor = vec4(clamp(c, 0., 1.) * uFade, 1.);',
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
  const IRIS = std(0x3a1e0c, { roughness: .2, emissive: 0x120804 }), HILITE = new THREE.MeshBasicMaterial({ color: 0xffffff }), BLUSH = new THREE.MeshBasicMaterial({ color: 0xff7a8a, transparent: true, opacity: .16, depthWrite: false });
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
    maricha:  { skin: 0x4a8a9a, hair: 0x120508, dress: [0xd8752a, 0x7a3410], sash: 0x8a4a1a, evil: true, beard: true },   // a demon who lives as a forest hermit
    hermit:   { skin: 0xb88a60, hair: 0xcccccc, dress: [0x8a4a1a, 0x3a1c08], sash: 0x6a3a14, beard: true },
    agni:     { skin: 0xff8a2a, hair: 0xff4a10, dress: [0xff7a10, 0xc01800], sash: 0xffe060, crown: true },
    brahma:   { skin: 0xf0c890, hair: 0xffffff, dress: [0xfff0b0, 0xffc050], sash: 0xffd23a, crown: true, beard: true },
    vishnu:   { skin: 0x4f9be0, hair: 0x1c2470, dress: [0xffe066, 0xff9d1c], sash: 0xe8503a, crown: true },
    youngdash: { skin: 0xd9a077, hair: 0x2a1a10, dress: [0xc03a3a, 0x701818], sash: 0xffd23a, crown: true },
    shravan:  { skin: 0xc89060, hair: 0x2a1a10, dress: [0xd8c090, 0x8a6a40], sash: 0x8a6a40 },
    blinda:   { skin: 0xc89868, hair: 0xeeeeee, dress: [0xd8c8a0, 0x8a7a50], sash: 0x8a7a50, beard: true },
    blindb:   { skin: 0xd0a078, hair: 0xeeeeee, dress: [0xe0d0a8, 0x8a7a50], sash: 0x8a7a50, female: true },
    rishya:   { skin: 0xd8a070, hair: 0x3a2a1a, dress: [0xffffff, 0xe0b070], sash: 0xff9d1c, horns: true },
    kausalya: { skin: 0xf0b58c, hair: 0x2c170e, dress: [0xf5f0e0, 0xd8b870], sash: 0xffd23a, female: true, tiara: true },
    sumitra:  { skin: 0xf0b58c, hair: 0x2c170e, dress: [0x3a9a6a, 0x105a3a], sash: 0xffd23a, female: true, tiara: true },
    vasishtha: { skin: 0xd9a077, hair: 0xf8f8f8, dress: [0xffffff, 0xd0c0a0], sash: 0xff9d1c, beard: true },
    parashurama: { skin: 0xb88060, hair: 0x1a100a, dress: [0xc07030, 0x603010], sash: 0x8a3a14, beard: true },
    mandodari: { skin: 0xf0b58c, hair: 0x2c170e, dress: [0xe8e0f8, 0xa080d0], sash: 0xffd23a, female: true, tiara: true },
    matali:   { skin: 0xe0a878, hair: 0x3a2a1a, dress: [0x6a8aff, 0x2a3aa0], sash: 0xffd23a },
    shatrughna: { skin: 0xe9a26b, hair: 0x3a2214, dress: [0xff9d1c, 0xb05a10], sash: 0xffd23a, crown: true },
    urmila:   { skin: 0xf0b58c, hair: 0x2c170e, dress: [0xe83a6a, 0x8a1036], sash: 0xffd23a, female: true, tiara: true },
    mandavi:  { skin: 0xf0b58c, hair: 0x2c170e, dress: [0x3a8ae8, 0x103a8a], sash: 0xffd23a, female: true, tiara: true },
    shrutakirti: { skin: 0xf0b58c, hair: 0x2c170e, dress: [0xe8a03a, 0x8a4a10], sash: 0xffd23a, female: true, tiara: true },
    kushadhvaja: { skin: 0xd9a077, hair: 0x5a5a5a, dress: [0x2a6ab0, 0x10304a], sash: 0xffd23a, crown: true, beard: true },
    janaka:   { skin: 0xd9a077, hair: 0x5a5a5a, dress: [0x2a9a74, 0x104a3a], sash: 0xffd23a, crown: true, beard: true },
    ahalya:   { skin: 0xe8b08a, hair: 0x2a1a10, dress: [0xd06ac0, 0x701a70], sash: 0xffd23a, female: true },
    angada:   { skin: 0xe8b04a, hair: 0x7a4a1a, dress: [0xffe060, 0xc08a00], sash: 0x35e0ff, crown: true, monkey: true },
    agastya:  { skin: 0xc8905a, hair: 0xf8f8f8, dress: [0xff9a2a, 0xc05a00], sash: 0xffd23a, beard: true },
    guha:     { skin: 0x8a5a36, hair: 0x1a1008, dress: [0xb0462a, 0x5a1a10], sash: 0xffc94a, beard: true },
    samudra:  { skin: 0x3aa0c8, hair: 0x0a2a5a, dress: [0x30e0c0, 0x0a5a8a], sash: 0xf4f4ff, crown: true },
    sushena:  { skin: 0xd8b48a, hair: 0xf0f0f0, dress: [0x2a9a6a, 0x0a5a3a], sash: 0xffd23a, monkey: true, beard: true },
    varaha:   { skin: 0x4f9be0, hair: 0x1c2470, dress: [0xffe066, 0xff9d1c], sash: 0xe8503a, crown: true },
    narasimha: { skin: 0xe0a040, hair: 0xb06010, dress: [0xffd040, 0xc06000], sash: 0xe8503a, crown: true },
    vamana:   { skin: 0xd9a077, hair: 0x2a1a10, dress: [0xfff6e0, 0xf0c070], sash: 0xff9d1c },
    krishna:  { skin: 0x3f7fd0, hair: 0x101830, dress: [0xffe066, 0xffb01c], sash: 0xff3a6a, crown: true },
    balarama: { skin: 0xf2d0b0, hair: 0x3a2a1a, dress: [0x3a6aff, 0x10208a], sash: 0xffd23a, crown: true },
    kalki:    { skin: 0xd9a077, hair: 0x2a1a10, dress: [0xffffff, 0xd0d8f0], sash: 0xffd23a, crown: true },
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
    } else { nose = mesh(new THREE.ConeGeometry(1.4, 4.2, 12), skin, 0, -1.2, 9.4, g); nose.rotation.x = Math.PI / 2 - .3; mesh(G.sph, skin, 0, -2.6, 10.2, g).scale.set(1.25, .95, .9); }
    for (const s of [-1, 1]) {
      const ew = mesh(G.sph, WHITE, s * 3.6, 1.3, 7.9, g); ew.scale.set(2.25, 1.55, .8); ew.userData.by = 1.55; eyes.push(ew);
      const ir = mesh(G.sph, sp.evil ? std(0xff3b1f, { emissive: 0xff2a10, emissiveIntensity: 2 }) : IRIS, s * 3.5, 1.2, 8.55, g); ir.scale.set(1.12, 1.12, .45); ir.userData.by = 1.12; eyes.push(ir);
      const pu = mesh(G.sph, DARK, s * 3.5, 1.2, 8.85, g); pu.scale.set(.58, .58, .3); pu.userData.by = .58; eyes.push(pu);
      const hl = mesh(G.sphLow, HILITE, s * 3.5 + .42, 1.72, 9.05, g); hl.scale.setScalar(.3); hl.userData.by = .3; eyes.push(hl);
      if (sp.female) { const la = mesh(new THREE.TorusGeometry(2.3, .28, 4, 10, Math.PI * .8), DARK, s * 3.6, 1.1, 8.3, g); la.rotation.z = Math.PI * .1; }
      const br = mesh(new THREE.TorusGeometry(2.6, .42, 5, 12, Math.PI * .62), sp.beard && !sp.evil ? std(sp.hair, { roughness: .8 }) : DARK, s * 3.7, 2.2, 8.2, g); br.rotation.z = Math.PI * .19 + s * (sp.evil ? -.35 : .06); br.userData = { base: br.rotation.z, s }; brows.push(br);
      { const bl = mesh(G.sph, BLUSH, s * 5.2, -2.6, 6.8, g); bl.scale.set(1.9, 1.1, .6); }
      const ear = mesh(G.sph, skin, s * 8.5, -.2, -.4, g); ear.scale.set(sp.monkey ? 2.2 : 1.1, sp.monkey ? 3.4 : 2.5, 1.6);
      mesh(G.sph, GOLD, s * 8.9, -3.2, -.4, g).scale.setScalar(sp.female ? 1.5 : 1.1);
    }
    const lips = mesh(G.sph, std(0xb5403d, { roughness: .4 }), 0, -5.2, 8.4, g); lips.scale.set(2.5, .75, .8); g.userData.eyes = eyes; g.userData.lips = lips; g.userData.brows = brows;
    mesh(new THREE.BoxGeometry(.9, 2.4, .5), RUBY, 0, 5.6, 8.9, g);                      // tilak
    if (sp.evil) { const mo = mesh(new THREE.TorusGeometry(3.2, .55, 6, 14, Math.PI), DARK, 0, -3.8, 8.6, g); mo.rotation.z = Math.PI; mo.scale.set(1.3, .7, 1); }
    const hair = mesh(new THREE.SphereGeometry(1, 20, 14, 0, 6.283, 0, Math.PI * .62), std(sp.hair, { roughness: .8 }), 0, 1.2, -1.4, g); hair.scale.set(9, 11, 10);
    if (sp.crown && !sp.monkey && !sp.female) { const hm = std(sp.hair, { roughness: .7 }); for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const x0 = s * (5.6 + k * 1.3), c = new THREE.CatmullRomCurve3([new THREE.Vector3(x0, 2, -5 - k), new THREE.Vector3(x0 + s * 1.6, -8, -7 - k), new THREE.Vector3(x0 + s * 2.6, -18, -6 - k * .6), new THREE.Vector3(x0 + s * 2.2, -27 + k * 2, -4)]); mesh(new THREE.TubeGeometry(c, 10, 1.5 - k * .2, 6), hm, 0, 0, 0, g); } }
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
      if (!sp.monkey) { const cl = new THREE.PlaneGeometry(16, 54, 3, 10); cl.translate(0, -27, 0); gradient(cl, new THREE.Color(sp.sash).multiplyScalar(.55).getHex(), sp.sash, 1, -54, 0);
        H.cloth = mesh(cl, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6, side: THREE.DoubleSide, emissive: 0x100404 }), 8, 40, -10, torso); H.cloth.rotation.z = -.12; H.cloth.userData.base = Float32Array.from(cl.attributes.position.array); }
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

  // Ravan: the same figure, larger, with ten heads and two arms
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
    H.xarms = [];   // two arms, like everyone else: Valmiki mostly calls him the ten-headed one, and two arms are gentler for small children
    heads.forEach(h => { h.userData.base = h.position.clone(); h.userData.bs = h.scale.x; h.userData.bz = h.rotation.z; });
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

  // ---------- architecture: Ayodhya, Mithila, the forest, Lanka ----------
  let _seed = 7; const srnd = (a, b) => { _seed = (_seed * 16807) % 2147483647; return a + (_seed / 2147483647) * (b - a); };   // repeatable randomness for the scenery
  const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg || 20);
  const ONION = [[0, 0], [.92, 0], [1.06, .22], [1.02, .48], [.8, .78], [.46, 1.02], [.2, 1.16], [.08, 1.32], [.03, 1.5], [0, 1.52]];
  const SHIKHARA = [[0, 0], [1, 0], [1, .08], [.92, .1], [.95, .3], [.86, .34], [.86, .52], [.74, .56], [.7, .74], [.56, .8], [.44, .92], [.3, .98], [.34, 1.02], [.12, 1.08], [.05, 1.2], [0, 1.22]];
  const archShape = (w, h) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(-w / 2, h - w / 2); s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true); s.lineTo(w / 2, 0); s.lineTo(-w / 2, 0); return s; };
  const ARCH = new THREE.ShapeGeometry(archShape(1, 1.7), 8);
  function stoneMat(c1, c2, y0, y1) { return { c1, c2, y0, y1 }; }
  function gradBox(w, h, d, c1, c2) { const g = new THREE.BoxGeometry(w, h, d); gradient(g, c1, c2, 1, -h / 2, h / 2); return g; }
  const VC = (o) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: .75, metalness: .05 }, o || {}));
  const domeMat = std(0xe0a53a, { metalness: .75, roughness: .28, emissive: 0x5a3400, emissiveIntensity: .45 });
  function dome(parent, x, y, z, r, mat, profile) { const d = mesh(lathe(profile || ONION, 22), mat || domeMat, x, y, z, parent); d.scale.set(r, r, r);
    const k = mesh(lathe([[0, 0], [.18, 0], [.22, .1], [.1, .18], [.16, .3], [.05, .42], [0, .5]], 10), GOLD, x, y + r * (profile ? 1.2 : 1.5), z, parent); k.scale.setScalar(r * .7); return d; }
  function chhatri(parent, x, y, z, r, stone) {   // a small domed pavilion on four pillars
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(new THREE.CylinderGeometry(r * .09, r * .11, r * 1.1, 6), stone, x + a * r * .62, y + r * .55, z + b * r * .5, parent);
    mesh(new THREE.BoxGeometry(r * 1.6, r * .14, r * 1.3), stone, x, y + r * 1.14, z, parent); dome(parent, x, y + r * 1.2, z, r * .72);
  }
  function windowsRow(parent, x0, x1, y, z, n, w, h, mat) { for (let k = 0; k < n; k++) { const m = mesh(ARCH, mat, lerp(x0, x1, n === 1 ? .5 : k / (n - 1)), y, z, parent); m.scale.set(w, h / 1.7, 1); } }
  const FLAGS = [];
  function flag(parent, x, y, z, col) { mesh(new THREE.CylinderGeometry(.7, .7, 34, 5), GOLD, x, y + 17, z, parent); const g = new THREE.PlaneGeometry(22, 11, 8, 1); g.translate(11, 0, 0);
    const f = mesh(g, std(col, { side: THREE.DoubleSide, emissive: new THREE.Color(col).multiplyScalar(.35), roughness: .7 }), x, y + 28, z, parent); f.userData.base = Float32Array.from(g.attributes.position.array); FLAGS.push(f); }
  // Ayodhya: a cream sandstone palace with arcades, onion domes, pavilions and flags
  function makePalace(sc) {
    const g = new THREE.Group(), win = new THREE.MeshBasicMaterial({ color: 0xffcf70 }), s1 = VC(), C1 = 0x8a6440, C2 = 0xd8b07a;
    const st = std(0xc89a68, { roughness: .8, emissive: 0x2a1808 });
    mesh(gradBox(420, 14, 80, 0x6a4a30, 0x9a7650), s1, 180, 7, -70, g);                         // plinth
    mesh(gradBox(380, 70, 56, C1, C2), s1, 180, 49, -80, g);                                    // ground floor
    mesh(new THREE.BoxGeometry(392, 5, 64), GOLD, 180, 86, -80, g);                             // cornice
    mesh(gradBox(300, 46, 48, C1, C2), s1, 180, 111, -84, g);                                   // upper floor
    mesh(new THREE.BoxGeometry(310, 4, 54), GOLD, 180, 135, -84, g);
    for (let k = 0; k < 24; k++) mesh(new THREE.BoxGeometry(6, 7, 6), st, 36 + k * 12.5, 140, -60, g);  // parapet
    windowsRow(g, 30, 330, 22, -51.5, 9, 13, 34, win); windowsRow(g, 52, 308, 96, -59.5, 7, 10, 24, win);
    for (let k = 0; k < 10; k++) mesh(new THREE.CylinderGeometry(2.2, 2.6, 66, 8), st, 14 + k * 37, 48, -50, g);   // pillars of the arcade
    for (const tx of [6, 354]) { mesh(gradBox(40, 170, 40, C1, C2), s1, tx, 85, -80, g); mesh(new THREE.BoxGeometry(46, 5, 46), GOLD, tx, 170, -80, g); windowsRow(g, tx, tx, 120, -59.5, 1, 10, 26, win); dome(g, tx, 172, -80, 24); }
    mesh(gradBox(96, 196, 52, C1, C2), s1, 180, 98, -80, g); mesh(new THREE.BoxGeometry(104, 6, 58), GOLD, 180, 196, -80, g);
    windowsRow(g, 180, 180, 150, -53.5, 1, 18, 36, win); windowsRow(g, 156, 204, 110, -53.5, 2, 10, 22, win);
    dome(g, 180, 199, -80, 48);
    for (const cx of [90, 270]) chhatri(g, cx, 137, -80, 22, st);
    for (const fx of [6, 180, 354]) flag(g, fx, fx === 180 ? 272 : 208, -80, fx === 180 ? 0xff8a1a : 0xffc030);
    // the great gate in front
    mesh(gradBox(70, 60, 14, C1, C2), s1, 180, 30, -40, g); { const a = mesh(ARCH, new THREE.MeshBasicMaterial({ color: 0x3a1a08 }), 180, 0, -32.5, g); a.scale.set(30, 30, 1); }
    g.userData.win = win; g.scale.setScalar(sc); return g;
  }
  // Mithila: King Janaka's hall of red sandstone, carved pillars, scalloped arches, lamps and marigold garlands
  function makePillars() {
    const g = new THREE.Group(), st = VC({ roughness: .6 }), lamp = glowMat(0xffb24a), mari = std(0xff8a10, { emissive: 0xa04000, emissiveIntensity: .8, roughness: .8 });
    const colG = lathe([[0, 0], [11, 0], [11, 8], [8.5, 10], [8.5, 16], [7, 18], [6.4, 30], [7.4, 32], [6.4, 34], [6, 150], [7.6, 154], [6.2, 158], [6.2, 168], [9, 174], [12, 182], [13, 190], [0, 190]], 14);
    gradient(colG, 0x7a3a2a, 0xd88a60, 1, 0, 190);
    const N = 5;
    for (let k = 0; k < N; k++) {
      const x = k * 180; mesh(colG, st, x, 0, -100, g);
      if (k < N - 1) {   // a multifoil arch between two pillars
        const pts = []; for (let i = 0; i <= 60; i++) { const t = i / 60, a = Math.PI * (1 - t), r = 82 + 6 * Math.abs(Math.sin(t * Math.PI * 7)); pts.push(new THREE.Vector3(x + 90 + Math.cos(a) * r, 190 + Math.sin(a) * r * .42, 0)); }
        const ag = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 3.4, 6); mesh(ag, std(0xd88a60, { roughness: .6, emissive: 0x2a0c04 }), 0, 0, -100, g);
        const lp = mesh(G.sph, lamp, x + 90, 160, -96, g); lp.scale.set(5, 7, 5); mesh(new THREE.CylinderGeometry(.4, .4, 28, 4), GOLD, x + 90, 182, -96, g);
        const gp = []; for (let i = 0; i <= 20; i++) { const t = i / 20; gp.push(new THREE.Vector3(x + 14 + t * 152, 176 - Math.sin(t * Math.PI) * 26, -88)); }
        mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(gp), 40, 2.6, 6), mari, 0, 0, 0, g);
      }
    }
    return g;
  }
  // the forest: banyan and sal trees with soft layered crowns, a few palms by the sea
  const LEAF_GEO = new THREE.IcosahedronGeometry(1, 2);
  function makeTree(h, leafColor, leafEmissive, flowers) {
    const g = new THREE.Group(), bark = std(0x3a2414, { roughness: .95, emissive: 0x0a0402 });
    const tr = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(srnd(-6, 6), h * .25, 0), new THREE.Vector3(srnd(-8, 8), h * .5, 0), new THREE.Vector3(srnd(-6, 6), h * .62, 0)]), 10, 6.5, 7);
    mesh(tr, bark, 0, 0, 0, g); for (const s of [-1, 1]) { const r = mesh(new THREE.ConeGeometry(4, 30, 5), bark, s * 8, 8, 0, g); r.rotation.z = s * .9; }
    for (let b = 0; b < 3; b++) { const a = srnd(-1, 1), br = mesh(new THREE.CylinderGeometry(1.6, 3, h * .32, 5), bark, a * 14, h * (.52 + b * .05), 0, g); br.rotation.z = -a * 1.1; }
    const base = new THREE.Color(leafColor || 0x135a3a), top = base.clone().offsetHSL(-.02, 0, .08), lm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, emissive: leafEmissive || 0x020a06 });
    const lg = LEAF_GEO.clone(); gradient(lg, base.getHex(), top.getHex(), 1, -1, 1);
    for (let k = 0; k < 15; k++) { const a = k / 15 * 6.283 * 2 + srnd(0, .5), r = srnd(10, 42), sx = srnd(17, 30); const c = mesh(lg, lm, Math.cos(a) * r, h * .66 + srnd(-10, 30) + (k === 0 ? 30 : 0), Math.sin(a) * r * .5, g); c.scale.set(sx, sx * srnd(.55, .75), sx * .8); c.rotation.y = srnd(0, 3); }
    if (flowers) { const fm = new THREE.MeshStandardMaterial({ color: flowers, emissive: flowers, emissiveIntensity: .9, roughness: .5 }); for (let k = 0; k < 26; k++) { const a = srnd(0, 6.283), r = srnd(10, 46); mesh(G.sphLow, fm, Math.cos(a) * r, h * .62 + srnd(0, 50), Math.sin(a) * r * .5 + 14, g).scale.setScalar(srnd(2.4, 4.2)); } }
    return g;
  }
  function makePalm(h) {
    const g = new THREE.Group(), bark = std(0x5a3a1c, { roughness: .9 }), lean = srnd(-.25, .25);
    const pts = [0, .33, .66, 1].map(t => new THREE.Vector3(Math.sin(t * 1.4) * h * lean, t * h, 0)); mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 3.2, 6), bark, 0, 0, 0, g);
    const fm = std(0x1a8a4a, { side: THREE.DoubleSide, emissive: 0x04301a, roughness: .7 }), top = pts[3];
    for (let k = 0; k < 8; k++) { const fg = new THREE.PlaneGeometry(48, 9, 6, 1); fg.translate(24, 0, 0); const p = fg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) * (1 - x / 52) - (x * x) * .012); } fg.computeVertexNormals();
      const f = mesh(fg, fm, top.x, top.y, top.z, g); f.rotation.set(srnd(-.2, .2), k / 8 * 6.283, .15); }
    return g;
  }
  // Panchavati: a leaf hut on bamboo poles, with a glowing doorway
  function makeHut() {
    const g = new THREE.Group(), bam = std(0x9a7a3a, { roughness: .8, emissive: 0x1a1004 });
    for (let k = 0; k < 18; k++) { const a = k / 18 * 6.283; mesh(new THREE.CylinderGeometry(2, 2.2, 58, 5), bam, Math.cos(a) * 42, 29, Math.sin(a) * 30, g); }
    mesh(new THREE.CylinderGeometry(41, 41, 54, 18, 1, true), std(0x6a5a2a, { roughness: .95, side: THREE.DoubleSide, emissive: 0x100c04 }), 0, 28, 0, g).scale.z = .72;
    const th = lathe([[0, 0], [64, 0], [60, 6], [50, 18], [36, 32], [20, 44], [8, 52], [0, 56]], 24); const tp = th.attributes.position;
    for (let i = 0; i < tp.count; i++) { const n = .9 + .1 * Math.sin(i * 12.9898) * Math.sin(i * 78.233); tp.setX(i, tp.getX(i) * n); tp.setZ(i, tp.getZ(i) * n); } th.computeVertexNormals(); gradient(th, 0x6a5020, 0xc8a050, 1, 0, 56);
    const roof = mesh(th, VC({ roughness: .95, flatShading: true }), 0, 54, 0, g); roof.scale.z = .74;
    const door = mesh(ARCH, new THREE.MeshBasicMaterial({ color: 0xffc070 }), 0, 0, 31, g); door.scale.set(18, 20, 1);
    for (let k = 0; k < 9; k++) mesh(new THREE.CylinderGeometry(1, 1, 18, 4), bam, -90 + k * 10, 9, 44, g);
    mesh(new THREE.BoxGeometry(90, 1.6, 1.6), bam, -50, 14, 44, g);
    return g;
  }
  // Lanka: the golden city on the three-peaked mountain Trikuta, behind a wall with a great gate
  function makeLanka() {
    const g = new THREE.Group(), win = new THREE.MeshBasicMaterial({ color: 0xff8a3a });
    const mg = new THREE.PlaneGeometry(1300, 260, 120, 1), mp = mg.attributes.position;
    for (let i = 0; i < mp.count; i++) { const x = mp.getX(i), u = (x + 650) / 1300; if (mp.getY(i) > 0) { const pk = Math.max(Math.exp(-((u - .3) ** 2) / .006) * 1, Math.exp(-((u - .55) ** 2) / .008) * 1.15, Math.exp(-((u - .8) ** 2) / .005) * .9); mp.setY(i, -130 + 60 + 190 * pk + 6 * Math.sin(x * .05)); } }
    gradient(mg, 0x020104, 0x12060f, 1, -130, 130); mesh(mg, new THREE.MeshBasicMaterial({ vertexColors: true }), 330, 130, -300, g);
    const s1 = VC({ roughness: .5, metalness: .35 }), gold = std(0xe8a83a, { metalness: .8, roughness: .25, emissive: 0x6a3000, emissiveIntensity: .5 }), red = std(0x7a1420, { roughness: .6, emissive: 0x2a0408 });
    for (let k = 0; k < 13; k++) {
      const x = k * 54 + srnd(-8, 8), h = 70 + srnd(0, 1) ** .7 * 120 + (k === 6 ? 40 : 0), w = srnd(30, 44), z = -110 - (k % 2) * 30;
      mesh(gradBox(w, h, 30, 0x4a1018, 0xb8762a), s1, x, h / 2, z, g);
      mesh(new THREE.BoxGeometry(w + 6, 4, 36), gold, x, h, z, g);
      const t2 = h * .32; mesh(gradBox(w * .7, t2, 24, 0x8a3a18, 0xe8b040), s1, x, h + t2 / 2, z, g); mesh(new THREE.BoxGeometry(w * .7 + 5, 3, 28), gold, x, h + t2, z, g);
      for (let r = 0; r < Math.floor(h / 34); r++) windowsRow(g, x - w * .28, x + w * .28, 14 + r * 34, z + 15.5, 2, 6, 14, win);
      if (k % 3 === 1) dome(g, x, h + t2, z, w * .38, gold); else { const sh = mesh(lathe(SHIKHARA, 16), gold, x, h + t2, z, g); sh.scale.set(w * .32, w * .9, w * .32); }
    }
    for (let k = 0; k < 26; k++) mesh(new THREE.BoxGeometry(14, 10, 10), red, -20 + k * 28, 64, -56, g);
    mesh(gradBox(740, 60, 16, 0x3a0a10, 0x8a3a20), s1, 330, 30, -60, g); mesh(new THREE.BoxGeometry(744, 4, 20), gold, 330, 60, -60, g);
    for (const gx of [150, 520]) { mesh(gradBox(56, 110, 26, 0x4a1018, 0xb8762a), s1, gx, 55, -54, g); dome(g, gx, 110, -54, 22, gold); const a = mesh(ARCH, new THREE.MeshBasicMaterial({ color: 0x1a0206 }), gx, 0, -40.5, g); a.scale.set(26, 34, 1); }
    g.userData.win = win; return g;
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
  for (const [x, h, c] of [[2620, 190, 0x3a5a1a], [2720, 215, 0x2f5a16], [2900, 250, 0x2a4a18], [3070, 200, 0x406a1c], [3430, 240, 0x34561a], [3620, 210, 0x2f5a16], [3790, 250, 0x2a4a18], [3980, 200, 0x4a6a1e]]) { const t = makeTree(h, c); t.position.set(x, 0, srnd(-80, -40)); scene.add(t); world.trees.push(t); }
  for (const [x, h] of [[4140, 170], [4200, 140], [5060, 160], [5110, 130]]) { const t = makePalm(h); t.position.set(x, 0, srnd(-70, -40)); scene.add(t); }
  { const rk = std(0x3a3028, { roughness: .95, flatShading: true, emissive: 0x060402 }); for (let k = 0; k < 9; k++) { const r = mesh(new THREE.DodecahedronGeometry(1, 0), rk, 3880 + k * 34 + srnd(-10, 10), srnd(10, 40), -120 + srnd(-20, 10), scene); r.scale.set(srnd(26, 50), srnd(24, 60), srnd(20, 40)); r.rotation.set(srnd(0, 3), srnd(0, 3), srnd(0, 3)); } }   // Rishyamukha hill
  // a starry sky, faint far hills and a halo round the moon
  { const N = 420, sg = new THREE.InstancedMesh(G.sphLow, new THREE.MeshBasicMaterial({ color: 0xdfe8ff }), N), d = new THREE.Object3D(), c = new THREE.Color();
    for (let i = 0; i < N; i++) { d.position.set(srnd(-400, WORLD + 400), srnd(90, 300), -700); d.scale.setScalar(srnd(.5, 1.5) * (i % 17 === 0 ? 2 : 1)); d.updateMatrix(); sg.setMatrixAt(i, d.matrix); c.setHSL(srnd(.55, .65), .4, srnd(.25, .7)); sg.setColorAt(i, c); }
    scene.add(sg); world.stars = sg;
    const hg = new THREE.PlaneGeometry(WORLD + 1200, 120, 300, 1), hp = hg.attributes.position; for (let i = 0; i < hp.count; i++) if (hp.getY(i) > 0) hp.setY(i, -60 + 30 + 40 * (.5 + .5 * Math.sin(hp.getX(i) * .006)) * (.6 + .4 * Math.sin(hp.getX(i) * .017 + 1)));
    gradient(hg, 0x020208, 0x0e0e26, 1, -60, 60); mesh(hg, new THREE.MeshBasicMaterial({ vertexColors: true }), WORLD / 2, 60, -600, scene); }
  const lanka = makeLanka(); lanka.position.set(5150, 0, 0); scene.add(lanka);
  const moon = mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0xfff1d0 }), 540, 215, -300, scene); moon.scale.setScalar(26);
  const redMoon = mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0xff4a2a }), 5400, 215, -300, scene); redMoon.scale.setScalar(26);
  const haloTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(.25, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  for (const [mo, col] of [[moon, 0xffe8c0], [redMoon, 0xff5a2a]]) { const h = mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: haloTex, color: col, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false }), mo.position.x, mo.position.y, mo.position.z - 2, scene); h.scale.setScalar(170); }

  // Shiva's bow on a pedestal
  const pedestal = mesh(new THREE.BoxGeometry(70, 26, 26), std(0x3a2a4a, { roughness: .4, metalness: .4 }), 1700, 21, 0, scene);   // an iron chest on a cart with eight wheels
  pedestal.userData.wheels = [];
  for (const wz of [14, -14]) for (const wx of [-27, -9, 9, 27]) { const w = new THREE.Group(); w.position.set(wx, -13, wz); pedestal.add(w); pedestal.userData.wheels.push(w);
    mesh(new THREE.TorusGeometry(7, 1.6, 6, 16), GOLD, 0, 0, 0, w); mesh(new THREE.BoxGeometry(13, 1.4, 1.4), GOLD, 0, 0, 0, w); mesh(new THREE.BoxGeometry(1.4, 13, 1.4), GOLD, 0, 0, 0, w); }
  const plough = new THREE.Group(); { const wd = std(0x8a5a2a, { roughness: .8, emissive: 0x2a1404 }); const beam = mesh(new THREE.CylinderGeometry(2.2, 2.2, 76, 8), wd, 0, 0, 0, plough); beam.rotation.z = .6;   // a wooden plough with a golden blade
    const blade = mesh(new THREE.ConeGeometry(5, 18, 8), GOLD, 23, -33, 0, plough); blade.rotation.z = 2.4; mesh(new THREE.BoxGeometry(16, 3, 3), wd, -20, 30, 0, plough); } plough.visible = false; scene.add(plough);
  const furrow = mesh(new THREE.BoxGeometry(1, 1.2, 5), std(0x3a2410, { roughness: 1 }), 0, .6, 16, scene); furrow.visible = false;
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
  const hut = makeHut(); hut.position.set(3250, 0, -50); scene.add(hut);
  // the sea between the forest and Lanka, and the bridge of stones
  const seaGeo = new THREE.PlaneGeometry(900, 18, 90, 2); gradient(seaGeo, 0x1b4fff, 0x20e0ff, 0, -450, 450);
  const seaBase = Float32Array.from(seaGeo.attributes.position.array);
  mesh(seaGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .85 }), 4575, 9, 46, scene);
  const seaTop = mesh(new THREE.PlaneGeometry(900, 90), new THREE.MeshBasicMaterial({ color: 0x0a2a6a, transparent: true, opacity: .55 }), 4575, .8, 0, scene); seaTop.rotation.x = -Math.PI / 2;
  const stones = Array.from({ length: 16 }, (_, k) => { const m = mesh(new THREE.BoxGeometry(44, 14, 60), std(0xd8c09a, { roughness: .6, emissive: 0x4a3a18 }), 4170 + k * 52, 7, 6, scene); m.userData = { t: 126.6 + k * .3 }; m.scale.setScalar(.001); return m; });
  const mount = new THREE.Group();
  { const mg = new THREE.IcosahedronGeometry(34, 1); gradient(mg, 0x0a5a3a, 0x1fe08a, 1, -34, 34);
    const mm = mesh(mg, std(0xffffff, { roughness: .5, emissive: 0x108a50, emissiveIntensity: .9 }), 0, 0, 0, mount); mm.material.vertexColors = true;
    const mh = mesh(G.sph, glowMat(0x20ff90), 0, 0, 0, mount); mh.scale.setScalar(54); mh.material.opacity = .22; mount.visible = false; scene.add(mount); }
  const ash = makeTree(200, 0x1a5a2a, 0x04140a, 0xff5a1a); ash.position.set(5760, 0, -50); scene.add(ash);   // the Ashoka tree in Lanka, with its orange-red flowers, where Sita is kept

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
  const sabari = addNew('sabari', .96), vibh = addNew('vibhishana', 1, { headScale: 1.2 }), surp = addNew('surpanakha', 1.1), hermit = addNew('hermit', 1, { headScale: 1.22 }), agni = addNew('agni', 1.5), marich = addNew('maricha', 1.1, { headScale: 1.15 });
  const mhut = makeHut(); mhut.visible = false; scene.add(mhut);   // Maricha's hermitage by the sea
  agni.root.traverse(o => { if (o.material && o.material.emissive) { o.material = o.material.clone(); o.material.emissive.setHex(0xff5a10); o.material.emissiveIntensity = 1.5; } });
  { const bk = new THREE.Group(); mesh(new THREE.CylinderGeometry(9, 6, 8, 12, 1, true), std(0x8a5a2a, { roughness: .9, side: THREE.DoubleSide }), 0, 0, 0, bk);
    for (let k = 0; k < 9; k++) mesh(G.sphLow, std(0xd02a5a, { emissive: 0x801030, emissiveIntensity: .8 }), Math.cos(k * 2.4) * 4, 4.5 + (k % 3) * 1.3, Math.sin(k * 2.4) * 4, bk).scale.setScalar(2.2);
    bk.position.set(0, -24, 4); sabari.arms[0].userData.el.add(bk); sabari.arms[1].userData.el.add(bk.clone()); }
  const sitaGlow = mesh(G.sph, glowMat(0xffe0a0), 0, 0, 0, scene); sitaGlow.visible = false;
  const berry = mesh(G.sphLow, std(0xd02a5a, { emissive: 0xc01040, emissiveIntensity: 1 }), 0, 0, 0, scene); berry.scale.setScalar(3); berry.visible = false;
  // Lakshman's protective line, drawn around the hut
  const REK = { x: 3250, rx: 80, rz: 40 }, rekPt = (a) => [REK.x + REK.rx * Math.cos(Math.PI + a), REK.rz * Math.sin(Math.PI + a)];   // an oval on the ground around Sita and the hut, starting at its left end
  const rekCurve = new THREE.CatmullRomCurve3(Array.from({ length: 48 }, (_, i) => { const [x, z] = rekPt(i / 48 * 6.2832); return new THREE.Vector3(x, 1.6, z); }), true);
  const rekha = new THREE.Mesh(new THREE.TubeGeometry(rekCurve, 120, 2.4, 6, true), new THREE.MeshBasicMaterial({ color: 0xffb040 })); rekha.visible = false; scene.add(rekha);
  const rekhaGlow = new THREE.Mesh(new THREE.TubeGeometry(rekCurve, 120, 8, 6, true), glowMat(0xff8020)); rekhaGlow.visible = false; scene.add(rekhaGlow);
  function setRekha(k, glow) {   // k: how much of the line is drawn (0 to 1); glow: how brightly it shines
    rekha.visible = rekhaGlow.visible = k > .002;
    for (const m of [rekha, rekhaGlow]) { const n = m.geometry.index.count, seg = 6 * 6; m.geometry.setDrawRange(0, Math.min(n, Math.ceil(k * n / seg) * seg)); }
    rekhaGlow.material.opacity = .36 * glow; rekha.material.color.setRGB(1, .55 + .25 * Math.min(1, glow), .2);
  }
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
  const shatru = addNew('shatrughna', 1), urmila = addNew('urmila', 1), mandavi = addNew('mandavi', 1), shruta = addNew('shrutakirti', 1), kusha = addNew('kushadhvaja', 1, { headScale: 1.25 });
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

  // ---------- the fifth wave: the family and the gods before Ram, and the great war ----------
  const brahma = addNew('brahma', 1.05, { headScale: 1.25 }), vishnu = addNew('vishnu', 1.1, { headScale: 1.2 }), youngd = addNew('youngdash', 1), shravan = addNew('shravan', .8);
  const blindA = addNew('blinda', .95, { headScale: 1.2 }), blindB = addNew('blindb', .95), rishya = addNew('rishya', 1), kausalya = addNew('kausalya', 1), sumitra = addNew('sumitra', 1);
  const vasishtha = addNew('vasishtha', 1, { headScale: 1.25 }), parashu = addNew('parashurama', 1.05, { headScale: 1.2 }), mandodari = addNew('mandodari', 1), matali = addNew('matali', 1);
  // Vishnu has four arms, holding a discus and a conch
  for (const s of [1, -1]) { const a = makeArm(SPEC.vishnu, s); a.position.set(s * 13, 40, -3); a.rotation.z = s * .95; a.rotation.x = -.2; vishnu.torso.add(a);
    if (s === 1) { const ch = mesh(new THREE.TorusGeometry(9, 1.4, 6, 24), glowMat(0xffe070), 0, -26, 0, a.userData.el); ch.rotation.y = Math.PI / 2; } else { mesh(G.sph, std(0xfff4e0, { emissive: 0x806040 }), 0, -27, 0, a.userData.el).scale.set(5, 4, 4); } }
  // Parashurama's axe
  { const axe = new THREE.Group(); mesh(new THREE.CylinderGeometry(1.5, 1.5, 62, 8), std(0x5a3a1a, { roughness: .8 }), 0, -6, 0, axe); const bl = mesh(new THREE.BoxGeometry(2, 16, 22), std(0xd8e0ea, { metalness: .9, roughness: .2, emissive: 0x334455 }), 0, 22, 9, axe); axe.position.set(0, -24, 3); parashu.arms[0].userData.el.add(axe); }
  const river = mesh(G.sph, glowMat(0x4a90ff), 0, 2, 12, scene); river.visible = false;
  const pot = new THREE.Group(); mesh(new THREE.CylinderGeometry(5, 4, 9, 12), std(0x9a5a2a, { roughness: .8 }), 0, 0, 0, pot); pot.visible = false; scene.add(pot);
  // a second bow, for the other archers
  function makeBowObj() { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.TubeGeometry(bowCurve(38, 13), 20, 1.5, 8), bowMat));
    const string = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xfff0c0 })); g.add(string); g.visible = false; scene.add(g); return { g, string }; }
  const bowL = makeBowObj();
  function aimBow(bo, H, draw, sc) {
    H.root.updateMatrixWorld(true); const f = H.arms[0].userData.hand, b = H.arms[1].userData.hand, fp = new THREE.Vector3(), bp = new THREE.Vector3(); f.getWorldPosition(fp); b.getWorldPosition(bp);
    bo.g.visible = true; bo.g.position.copy(fp); bo.g.rotation.set(0, 0, 0); bo.g.scale.setScalar(sc || 1.3); bo.g.updateMatrixWorld(true);
    const bl = bo.g.worldToLocal(bp.clone()), sp = bo.string.geometry.attributes.position; sp.setXYZ(0, 0, 38, 0); sp.setXYZ(1, bl.x, bl.y, bl.z); sp.setXYZ(2, 0, -38, 0); sp.needsUpdate = true;
  }
  // Indra's chariot, which carries Ram in the last duel
  const indraCh = makeChariot(); indraCh.userData.mat.color.setHex(0xf4f0ff); indraCh.userData.mat.emissive.setHex(0x40508a); scene.add(indraCh);
  // four lights for the four sons, a feast, and a glowing Brahma weapon
  const birthOrbs = [0x5aa0ff, 0xffd070, 0xff9a60, 0x9aff9a].map(c => { const o = mesh(G.sph, glowMat(c), 0, 0, 0, scene); o.scale.setScalar(6); o.visible = false; return o; });
  const feast = new THREE.Group(); for (let k = 0; k < 10; k++) mesh(G.sphLow, std([0xd02a5a, 0xffc94a, 0x9ad04a, 0xff8a3a][k % 4], { emissive: 0x402010, emissiveIntensity: .6 }), Math.cos(k * 2.4) * 16, 4 + (k % 3) * 3, Math.sin(k * 2.4) * 10, feast).scale.setScalar(4.5); feast.visible = false; scene.add(feast);
  const astra = mesh(G.sph, glowMat(0xffd8a0), 0, 0, 0, scene); astra.scale.setScalar(9); astra.visible = false;
  // a head or an arm of Ravan is cut off at time tc, flies away, and a new one grows at time tr
  function cutPart(h, tc, tr, u, away) {
    const b = h.userData.base, bs = h.userData.bs, bz = h.userData.bz || 0;
    if (!b) { const k = u < tc ? 1 : (u < tr ? 0 : ease(sstep(tr, tr + .9, u))); h.scale.setScalar(k + .001); return; }
    if (away === 0) { h.visible = u < tc + .5 || u >= tr; h.position.copy(b); h.rotation.z = bz; h.scale.setScalar(bs * (u < tc ? 1 : u < tc + .5 ? 1 - ease((u - tc) / .5) + .001 : .001 + ease(sstep(tr, tr + .9, u)))); return; }   // for children: a soft dissolve into light
    if (u < tc) { h.visible = true; h.position.copy(b); h.scale.setScalar(bs); h.rotation.z = bz; }
    else if (u < tc + 1) { const p = u - tc; h.visible = true; h.position.set(b.x + away * 46 * p, b.y + 70 * p - 95 * p * p, b.z + 30 * p); h.rotation.z = bz + away * p * 5; h.scale.setScalar(bs); }
    else if (u < tr) h.visible = false;
    else { h.visible = true; h.position.copy(b); h.rotation.z = bz; h.scale.setScalar(bs * (.001 + ease(sstep(tr, tr + .9, u)))); }
  }

  // ---------- the sixth wave: Guha, Agastya, the Ocean, Surasa, and the props of the new scenes ----------
  const agastya = addNew('agastya', .92, { headScale: 1.3 }), guha = addNew('guha', 1.05, { headScale: 1.22 }), samudra = addNew('samudra', 1.25, { headScale: 1.2 });
  const boat = new THREE.Group(); { const hull = mesh(new THREE.SphereGeometry(1, 24, 10, 0, 6.283, Math.PI / 2, Math.PI / 2), std(0x6a3a1a, { roughness: .8, emissive: 0x140804, side: THREE.DoubleSide }), 0, 12, 0, boat); hull.scale.set(80, 16, 21);
    mesh(new THREE.BoxGeometry(150, 2, 30), std(0x8a5a2a, { roughness: .8 }), 0, 11, 0, boat); { const rim = mesh(new THREE.TorusGeometry(80, 1.4, 6, 40), GOLD, 0, 12, 0, boat); rim.rotation.x = Math.PI / 2; rim.scale.set(1, .26, 1); }
    const oar = mesh(new THREE.CylinderGeometry(1, 1, 80, 5), std(0x9a6a3a), -60, 40, 18, boat); oar.rotation.z = .6; boat.userData.oar = oar; } boat.visible = false; scene.add(boat);
  const bed = new THREE.Group(); { mesh(new THREE.BoxGeometry(200, 10, 50), std(0x7a1a2a, { roughness: .6, emissive: 0x200408 }), 0, 24, 0, bed); mesh(new THREE.BoxGeometry(206, 3, 54), GOLD, 0, 30, 0, bed);
    for (const [x, z] of [[-94, -20], [94, -20], [-94, 20], [94, 20]]) mesh(new THREE.CylinderGeometry(3, 2.4, 22, 8), GOLD, x, 11, z, bed); mesh(G.sph, std(0xf4e8d0, { roughness: .7 }), 88, 34, 0, bed).scale.set(16, 6, 18); } bed.visible = false; scene.add(bed);
  const grass = mesh(new THREE.ConeGeometry(.9, 34, 4), std(0x5aff6a, { emissive: 0x1a8a2a, emissiveIntensity: .9 }), 0, 0, 0, scene); grass.visible = false;
  const ring = mesh(new THREE.TorusGeometry(2.6, .9, 8, 18), std(0xffd24a, { metalness: .8, roughness: .2, emissive: 0xc08000, emissiveIntensity: 1.2 }), 0, 0, 0, scene); ring.visible = false;
  const jewel = new THREE.Group(); mesh(G.sph, std(0xbff4ff, { emissive: 0x60d0ff, emissiveIntensity: 1.4, roughness: .1, metalness: .3 }), 0, 0, 0, jewel).scale.setScalar(3.2); { const jg = mesh(G.sph, glowMat(0x7ae0ff), 0, 0, 0, jewel); jg.scale.setScalar(12); jg.material.opacity = .45; } jewel.visible = false; scene.add(jewel);
  const memGlow = mesh(G.sph, glowMat(0x9ab8ff), 0, 0, 0, scene); memGlow.visible = false; memGlow.material.opacity = .16;
  const divGlow = mesh(G.sph, glowMat(0xffe6a8), 0, 0, 0, scene); divGlow.visible = false; divGlow.material.opacity = .22;
  // god rays: a soft cone of light from the sky
  const rayTex = (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 256; const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.2, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 8, 256); return new THREE.CanvasTexture(c); })();
  const rays = [0, 1].map(() => { const m = mesh(new THREE.CylinderGeometry(16, 90, 320, 24, 1, true), new THREE.MeshBasicMaterial({ map: rayTex, color: 0xffe2a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 0, 0, 0, scene); m.visible = false; return m; });
  function godRay(i, x, y, a, col) { const r = rays[i]; r.visible = a > .01; if (!r.visible) return; r.position.set(x, y + 150, -30); r.material.opacity = .32 * a; r.material.color.setHex(col || 0xffe2a0); r.rotation.y = lastTr * .2; }
  // the Sun, for the hymn Aditya Hridayam
  const sun = new THREE.Group(); { mesh(new THREE.CircleGeometry(48, 48), new THREE.MeshBasicMaterial({ color: 0xffc040 }), 0, 0, 0, sun); const h = mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: haloTex, color: 0xffa020, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0, -1, sun); h.scale.setScalar(330);
    for (let k = 0; k < 16; k++) { const r = mesh(new THREE.PlaneGeometry(6, 70), new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false }), Math.cos(k / 16 * 6.283) * 92, Math.sin(k / 16 * 6.283) * 92, -.5, sun); r.rotation.z = k / 16 * 6.283 - Math.PI / 2; } }
  sun.visible = false; scene.add(sun);
  // Surasa, mother of serpents: a great coiled body rising from the sea, with a head whose jaws open wide
  const surasa = new THREE.Group(); { const sk = std(0x2aa05a, { roughness: .4, metalness: .2, emissive: 0x0a4020, emissiveIntensity: .8 }), belly = std(0xd8e070, { roughness: .5, emissive: 0x4a4a10 });
    const pts = [[90, -40], [60, 10], [20, 30], [40, 70], [10, 110], [0, 140]].map(([x, y]) => new THREE.Vector3(x, y, -10)); mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 13, 10), sk, 0, 0, 0, surasa);
    const head = new THREE.Group(); head.position.set(0, 150, -6); surasa.add(head); surasa.userData.head = head;
    mesh(G.sph, sk, 0, 6, 0, head).scale.set(26, 13, 18); const jaw = new THREE.Group(); head.add(jaw); mesh(G.sph, belly, -6, -4, 0, jaw).scale.set(24, 7, 15); surasa.userData.jaw = jaw;
    const mouth = mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0x2a0410 }), -8, 0, 0, head); mouth.scale.set(20, 5, 13); surasa.userData.mouth = mouth;
    for (const s of [-1, 1]) { mesh(G.sphLow, std(0xffe040, { emissive: 0xffc000, emissiveIntensity: 1.6 }), -12, 14, s * 9, head).scale.setScalar(2.6); const hd = mesh(new THREE.ConeGeometry(4, 16, 6), sk, 6, 20, s * 10, head); hd.rotation.z = .8; }
    const crown = mesh(new THREE.TorusGeometry(14, 2, 6, 18, Math.PI), GOLD, 8, 18, 0, head); crown.rotation.set(0, Math.PI / 2, .4); }
  surasa.visible = false; scene.add(surasa);

  // ---------- the seventh wave: Sushena, Ravan's spear, Indrajit's storm cloud and the Himalayas ----------
  const sushena = addNew('sushena', .95, { headScale: 1.2 });
  const spear = new THREE.Group(); { mesh(new THREE.CylinderGeometry(1.1, 1.1, 120, 6), std(0x3a2a1a, { roughness: .6 }), 0, 0, 0, spear); const hd = mesh(new THREE.ConeGeometry(4, 22, 6), std(0xffe0a0, { emissive: 0xff8a20, emissiveIntensity: 1.6, metalness: .6 }), 0, 70, 0, spear); const g = mesh(G.sph, glowMat(0xff7a20), 0, 70, 0, spear); g.scale.set(12, 20, 12); g.material.opacity = .5; hd.rotation.z = 0; }
  spear.rotation.z = Math.PI; spear.visible = false; scene.add(spear);   // the shaft points along +y; the scenes turn it
  const herb = mesh(G.sph, glowMat(0x7aff9a), 0, 0, 0, scene); herb.visible = false;
  const cloud = new THREE.Group(); { const cm = std(0x1a1028, { roughness: 1, emissive: 0x0c0614 }); for (let k = 0; k < 11; k++) { const c = mesh(G.sph, cm, (k - 5) * 34 + srnd(-10, 10), srnd(-12, 12), srnd(-20, 10), cloud); c.scale.set(srnd(34, 56), srnd(18, 28), srnd(24, 36)); }
    for (const s of [-1, 1]) mesh(G.sphLow, new THREE.MeshBasicMaterial({ color: 0xff3020 }), s * 9, -4, 34, cloud).scale.set(3.2, 1.6, 1); }
  cloud.visible = false; scene.add(cloud);
  const himalaya = new THREE.Group(); { const snow = (h, r) => { const g = new THREE.ConeGeometry(r, h, 14, 6), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < h / 2 - 1) { const n = 1 + .16 * Math.sin(i * 12.9898) * Math.sin(i * 4.1414); p.setX(i, p.getX(i) * n); p.setZ(i, p.getZ(i) * n); p.setY(i, y + 6 * Math.sin(i * 7.3)); } } g.computeVertexNormals(); gradient(g, 0x2a3a5a, 0xf4f8ff, 1, -h / 2, h / 2); return g; }, sm = VC({ roughness: .9, flatShading: true });
    for (const [x, h, r, z] of [[-560, 240, 120, -140], [-380, 160, 90, -60], [-240, 200, 100, -120], [-700, 180, 100, -200], [-120, 130, 80, -180]]) mesh(snow(h, r), sm, x, h / 2, z, himalaya); }
  himalaya.visible = false; scene.add(himalaya);

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
  const RAM_K = [[6, 430], [9, 470], [22, 1380], [26, 1560], [41, 1560], [43, 1640], [53, 2250], [60, 2250], [61, 2300], [70, 3050], [77, 3560], [80.5, 3560], [88, 3330], [90, 3330], [98, 3900], [119, 3900], [121, 4000], [126.5, 4100], [136, 4950], [150, 4950], [152, 5050], [183, 5050], [185.5, 5160]];
  const chX = (T) => T < 91 ? K(T, [[82.5, 3200], [91, 5560]]) : K(T, [[182, 5130], [186, 5130], [205, 560]]);
  const chY = (T) => T < 91 ? (T < 82.5 ? 0 : 36 + 150 * Math.sin(Math.PI * clamp((T - 82.5) / 8.5))) : (T < 186 ? 0 : (T < 205 ? 30 + 130 * Math.sin(Math.PI * clamp((T - 186) / 19)) : 0));
  const ramX = (T) => T < 185.5 ? K(T, RAM_K) : T < 205 ? chX(T) + 30 : K(T, [[205, 590], [212, 720]]);
  const sitaX = (T) => T < 32 ? 2000 : T < 38 ? K(T, [[32, 2000], [38, 1660]]) : T < 70 ? Math.max(1660, ramX(T) - 100) : T < 75 ? K(T, [[70, 2950], [75, 3250]]) : T < 82.5 ? (T > 81 ? 3165 : 3250) : T < 91 ? chX(T) : T < 94 ? K(T, [[91, 5560], [94, 5700]]) : T < 176 ? 5700 : T < 185 ? K(T, [[176, 5400], [185, 5130]]) : T < 205 ? chX(T) : ramX(T) - 30;
  const LAK_K = [[69, ramX(69) - 95], [74, 3180], [81, 3180], [81.0001, 3480], [88, 3235], [90, 3235], [98, 3805]];
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
    else if (T < 150) o.x = K(T, [[146, ramX(146) + 170], [150, 4880]]);
    else if (T < 185.5) o.x = K(T, [[150, 4880], [183, 4880], [185.5, 5070]]);
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
    // ---- before Ram's birth: the dots that explain everything that follows ----
    { id: 'ravanborn', s0: 0, n: 12, fx: 5500, cut: true, cap: "Long, long ago, the wise sage Vishrava had a son who was born with ten heads! So he was named Dashagriva, which means 'the one with ten heads'. He grew up very clever and very strong. We know him as Ravan, king of golden Lanka.", moral: '' },
    { id: 'ravan_boon', s0: 0, n: 14, fx: 430, cap: "Ravan wanted to be the strongest of all. He prayed to the god Brahma for thousands of years, and gave his heads to the holy fire, one by one. Before the last one, Brahma appeared, gave all his heads back, and gave him a gift: no god or demon could ever defeat him. But Ravan was so arrogant that he forgot about humans.", moral: 'Being arrogant makes us careless' },
    { id: 'gods', s0: 0, n: 12, fx: 520, cap: "Ravan became a bully to the gods, the sages and the whole world. They asked the god Vishnu for help. Vishnu promised to be born on Earth as Ram, son of King Dasharatha.", moral: '' },
    { id: 'curse', s0: 0, n: 14, fx: 560, cap: "Long before, young Prince Dasharatha went hunting at night. By mistake, his arrow hit Shravana, a boy fetching water for his blind parents. In sorrow they said: 'One day you too will miss your son.'", moral: 'Think before you act' },
    { id: 'kboon', s0: 0, n: 12, fx: 480, cap: "In a great battle, Dasharatha was hurt. His brave queen Kaikeyi drove him to safety and saved his life. To thank her, he promised her two wishes, whenever she asked.", moral: '' },
    { id: 'yajna', s0: 0, n: 16, fx: 440, cap: "King Dasharatha had no children. He held a great fire prayer. From the fire rose a shining being with a golden bowl of sweet pudding, and the king shared it with his three queens.", moral: '' },
    // ---- the childhood and the road to Mithila ----
    { id: 'court', s0: 9, n: 14, fx: 400, cap: "When Ram was sixteen, the sage Vishwamitra asked for his help against demons. The king was worried, but the wise sage Vasishtha told him to let Ram go. So Ram and Lakshman went with Vishwamitra.", moral: '' },
    { id: 'tataka', s0: 14.5, n: 12, fx: 1020, cap: "On the way, the demon Tataka attacked. The sage said a prince must protect people, so Ram stopped her with his arrow. Then the sage taught him special weapons.", moral: 'Be brave to protect others' },
    { id: 'siddha', s0: 14.5, n: 14, fx: 1050, cap: "At the sage's forest home, Ram guarded the fire prayer for six nights. When the demons Subahu and Maricha attacked, Ram defeated Subahu and blew Maricha far away over the sea.", moral: '' },
    { id: 'ahalya', s0: 22, n: 11, fx: 1480, cap: "Near Mithila lived Ahalya, under a curse, hidden in prayer. When Ram arrived, the curse ended, and Ram and Lakshman bowed to her with respect.", moral: '' },
    { id: 'sitaearth', s0: 22, n: 13, fx: 1600, cut: true, cap: "King Janaka of Mithila had a very special daughter. One day, while ploughing a field for a holy prayer, he found a baby girl in the earth! He named her Sita and loved her as his own. So Sita is called the daughter of Mother Earth.", moral: '' },
    { id: 'bowstory', s0: 22, n: 13, fx: 1560, cut: true, cap: "King Janaka showed them a very special bow: the bow of the god Shiva himself! It was so heavy that five thousand strong men pulled it on a cart with eight wheels. No god, demon or king had ever been able even to lift it. Whoever could string it would marry Princess Sita.", moral: '' },
    { id: 'vivah', s0: 41, n: 14, fx: 1730, cap: "Then all four brothers were married. Ram married Sita, and Lakshman married her sister Urmila; both were daughters of King Janaka. Bharata married Mandavi, and Shatrughna married Shrutakirti, the daughters of Janaka's brother, King Kushadhvaja.", moral: '' },
    { id: 'parashu', s0: 41, n: 12, fx: 1720, cap: "On the way home, the fiery sage Parashurama came, angry that Shiva's bow had broken. He asked Ram to string Vishnu's bow. Ram did it easily, and Parashurama calmed down.", moral: 'Stay calm when others are angry' },
    // ---- exile ----
    { id: 'boons', s0: 53, n: 12, fx: 2400, cap: "The maid Manthara made Queen Kaikeyi jealous. Kaikeyi used her two wishes: make Bharata king, and send Ram to the forest for fourteen years. Ram calmly agreed, to keep his father's promise.", moral: 'Always keep your promises' },
    { id: 'guha', s0: 55, n: 13, fx: 2440, cut: true, cap: "At the river Ganga, Ram's friend Guha, chief of the boatmen, welcomed them. Ram hugged him like a brother. Guha's boat carried Ram, Sita and Lakshman across the river.", moral: 'Friends are equal, whoever they are' },
    { id: 'death', s0: 57, n: 13, fx: 2390, cut: true, cap: "Back in Ayodhya, King Dasharatha missed Ram very much. He remembered the boy Shravana and the parents' sad words. Calling 'Ram, Ram', the old king passed away.", moral: '' },
    { id: 'sandals', s0: 60, n: 12, fx: 2200, cap: "Prince Bharata did not want the throne. He went to the forest and begged Ram to come home. Ram kept his promise to stay, and gave Bharata his sandals to place on the throne.", moral: 'Love is greater than power' },
    { id: 'agastya', s0: 64, n: 11, fx: 2640, cap: "Deep in the forest, the great sage Agastya gave Ram special gifts: the bow of Vishnu, arrows that never run out, and an arrow made by the god Brahma. Ram would need it at the very end.", moral: '' },
    { id: 'surp', s0: 70, n: 12, fx: 3120, cap: "Ravan's sister Surpanakha wanted to marry Ram, then Lakshman. When she rushed at Sita, Lakshman stopped her. Her demon brothers attacked with a huge army, but Ram won alone. Angry, she ran to Ravan.", moral: 'Anger only makes things worse' },
    { id: 'lanka1', s0: 70, n: 12, fx: 5500, cut: true, cap: "In golden Lanka, Surpanakha told her brother Ravan about Ram, and about Princess Sita. 'She should be your queen!' she said. Ravan wanted Sita for himself. But he knew he could not beat Ram in a fair fight, so he made a trick plan.", moral: '' },
    { id: 'maricha', s0: 70, n: 14, fx: 4250, cut: true, cap: "Ravan flew to Maricha, the demon Ram once blew far over the sea. 'Become a golden deer,' said Ravan, 'and lead Ram far away from Sita.' Maricha was afraid: 'Ram is too strong!' But Ravan made him do it, so Maricha became a golden deer.", moral: '' },
    { id: 'cry', s0: 81, n: 12, fx: 3430, cap: "As he fell, Maricha played Ravan's last trick. He shouted in Ram's own voice: 'Oh Sita! Oh Lakshmana! Help me!' He wanted Sita to think Ram was hurt, so that Lakshman would leave her alone. Far away, Ram knew it was a trick.", moral: '' },
    { id: 'rekha', s0: 81, n: 13, fx: 3260, cap: "Sita heard the voice and thought Ram was in danger! 'It is a trick,' said Lakshman. 'No one can hurt Ram.' But Sita was so worried that she begged him to go. Before he left, Lakshman drew a glowing line around the hut. 'Please stay inside this line,' he said. 'It will keep you safe.'", moral: '' },
    { id: 'bhiksha', s0: 81, n: 13, fx: 3220, cap: "Then Ravan came, dressed as a holy man, asking for food. When he stepped on the line, it burst into flames and stopped him! So he asked Sita to come out. Kind Sita stepped over the line to give him food.", moral: 'Be careful with strangers, even kind-looking ones' },
    { id: 'sabari', s0: 98, n: 10, fx: 3780, cap: "Ram met Sabari, a kind old lady who had waited for him for many years. With love, she offered him fruits from the forest, and Ram happily accepted them.", moral: 'Love matters more than riches' },
    { id: 'vali', s0: 104.6, n: 14, fx: 4050, cap: "Ram and the monkey prince Sugriva became friends. Sugriva's brother Vali had taken his kingdom. Ram defeated Vali with his arrow, and Sugriva became king.", moral: '' },
    { id: 'surasa', s0: 110, n: 13, fx: 4900, cap: "Flying over the sea, Hanuman met Surasa, a giant sea serpent. 'Come into my mouth!' she said. Hanuman grew bigger, then became tiny, zipped in and out, and bowed. She smiled and blessed him.", moral: 'Being clever is better than fighting' },
    { id: 'ashoka', s0: 112.2, n: 16, fx: 5660, cap: "In a garden in Lanka, Ravan tried to scare Sita, but she would not even look at him. Then Hanuman, hiding in a tree, sang Ram's story, gave Sita Ram's ring, and took her hair jewel for Ram.", moral: 'Be brave, even when you feel alone' },
    // ---- the war ----
    { id: 'chudamani', s0: 125.6, n: 11, fx: 4150, cap: "Back across the sea, Hanuman gave Sita's jewel to Ram and said, 'I have seen Sita!' Ram held it to his heart and cried. Then he said: now we go to Lanka!", moral: '' },
    { id: 'vib', s0: 126.5, n: 10, fx: 4170, cap: "Ravan's brother Vibhishana told him to give Sita back. Ravan grew angry, so Vibhishana flew across the sea to join Ram. Ram welcomed him as a friend and crowned him king of Lanka.", moral: 'Do what is right, even when it is hard' },
    { id: 'samudra', s0: 126.5, n: 13, fx: 4230, cap: "At the sea, Ram prayed to the Ocean for three days, but there was no answer. When Ram raised his bow, the Ocean god appeared and said: 'Nala can build a bridge, and I will hold it up.'", moral: '' },
    { id: 'angada', s0: 136, n: 12, fx: 5330, cap: "Before any fighting, Ram sent Angada to ask Ravan for peace. Ravan's guards grabbed him, but Angada jumped up onto the palace roof, and the tower broke.", moral: 'Always try peace first' },
    { id: 'indra', s0: 137, n: 16, fx: 5100, cap: "The battle began. Ravan's son Indrajit, hiding in the clouds, tied up Ram and Lakshman with magic snake arrows. Then the great eagle Garuda flew in and set them free.", moral: '' },
    { id: 'crown', s0: 138, n: 12, fx: 5250, cap: "Ravan came to fight. Ram's arrow knocked off his crown. Ram said kindly, 'You are tired. Go home, rest, and come back tomorrow.'", moral: 'Be kind, even to an enemy' },
    { id: 'wake', s0: 139, n: 14, fx: 5330, cap: "Ravan woke his giant brother Kumbhakarna, who sleeps for months. It took drums and lots of noise! Kumbhakarna said Ravan was wrong, but still went to fight for him.", moral: 'Don\'t help anyone do wrong' },
    { id: 'niku', s0: 160, n: 14, fx: 5250, cap: "Indrajit started a secret fire prayer to become unbeatable. Vibhishana showed Lakshman the place, and Lakshman defeated Indrajit before he could finish.", moral: '' },
    { id: 'shakti', s0: 162, n: 11, fx: 5240, cap: "In the battle, Ravan threw a magic spear at Lakshman, and Lakshman fell down. Ram pulled out the spear and held his brother. 'I can never find another brother like you,' he cried.", moral: '' },
    { id: 'sushena', s0: 162, n: 10, fx: 4980, cap: "The monkey doctor Sushena checked Lakshman. 'He is still alive!' he said. 'Hanuman, quick, bring the healing herbs from the Himalaya mountains.' Hanuman bowed and flew into the sky.", moral: '' },
    { id: 'himalaya', s0: 162, n: 10, fx: -380, cut: true, cap: "Hanuman reached the snowy Himalayas. The mountain glowed with herbs, but which one was right? So Hanuman lifted the whole mountaintop and flew back with it!", moral: '' },
    { id: 'herbs', s0: 162, n: 12, fx: 4980, cut: true, cap: "Hanuman landed with the mountain. Sushena gave Lakshman the healing herb to smell, and Lakshman woke up, well again! Ram hugged his brother, and everyone cheered for Hanuman.", moral: 'True friends help in hard times' },
    { id: 'aditya', s0: 164, n: 12, fx: 5170, cap: "Indra sent his own chariot for Ram. Ram was tired, so the sage Agastya taught him a prayer to the Sun, the Aditya Hridayam. Ram said it three times and felt strong again.", moral: 'Prayer and faith give us strength' },
    { id: 'headcut', s0: 164, n: 18, fx: 5300, cap: "Ram's arrows knocked off Ravan's heads, but magic made new ones grow back! Then Matali, the charioteer, reminded Ram of the special arrow of Brahma, the gift from the sage Agastya.", moral: '' },
    { id: 'mando', s0: 176, n: 14, fx: 5500, cap: "Ravan's wife Mandodari was very sad. Ram told Vibhishana to give Ravan a proper farewell: 'Our fight is over now.' Then Vibhishana was crowned king of Lanka.", moral: '' },
    { id: 'agni', s0: 176, n: 11, fx: 5420, cap: "To show everyone that she was pure and true, Sita stepped into a fire. The fire god Agni carried her out, safe and shining, and told everyone she was good and true.", moral: '' },
    { id: 'heaven', s0: 176, n: 12, fx: 5200, cap: "Then King Dasharatha appeared from heaven, shining with light. He blessed his sons and Sita. Ram asked him to forgive Kaikeyi and Bharata, and he did. The fallen monkeys came back to life!", moral: 'Forgiving makes hearts light' },
    { id: 'bharatmeet', s0: 206, n: 12, fx: 720, cap: "Near Ayodhya, Bharata came carrying Ram's sandals on his head. He placed them on Ram's feet and gave back the kingdom. The brothers hugged, and Ram bowed to his three mothers.", moral: '' },
    { id: 'darbar', s0: 213, n: 12, fx: 760, cap: "The sage Vasishtha crowned Ram king of Ayodhya, with Sita beside him. Ram ruled with kindness and fairness, and everyone was happy for many, many years.", moral: '' },
  ];
  const CAP = [   // story time windows [from, to, what is happening, (optional) lesson, (optional) when the lesson appears]; written for children
    [0, 9, 'Months later, four baby boys were born: Ram, Bharata, and the twins Lakshman and Shatrughna. Ram was Vishnu himself, born on Earth.'],
    [9, 14.5, 'Ram and Lakshman said goodbye to their parents and left with the sage.'],
    [14.5, 22, 'The sage led the brothers toward Mithila, where King Janaka had a special contest.'],
    [22, 31, 'With a smile, Ram lifted the mighty bow as easily as a toy, and began to string it.'],
    [31, 41, 'Crack! The bow broke in two, with a sound like thunder! King Janaka happily gave Sita to Ram.'],
    [41, 53, 'Back in Ayodhya, Ram and Sita lived happily for twelve years. Then the old king decided to make Ram the next king.'],
    [53, 55, 'Ram left for the forest with Sita and Lakshman.'],
    [55, 57, 'The charioteer went back to Ayodhya alone.'],
    [57, 60, 'Prince Bharata was called home to Ayodhya.'],
    [60, 64, 'Ram, Sita and Lakshman walked deeper into the forest, helping the sages there.'],
    [64, 70, 'They built a little hut at Panchavati, by the river Godavari, and lived there happily.'],
    [70, 77.5, 'Soon a golden deer with silver spots played near the hut. It was really Maricha! Sita loved it, so Ram went to catch it, and asked Lakshman to guard Sita.'],
    [77.5, 81, "Ram's arrow found the deer, and it turned back into Maricha."],
    [81, 92, 'Ravan showed his true form and took Sita away in his flying chariot. The brave old bird Jatayu fought him, but Ravan cut his wings.'],
    [92, 98, 'Ram and Lakshman searched everywhere. Jatayu told them Ravan went south, and Ram gave the brave bird a loving farewell.', 'Always try to help someone in trouble', 95],
    [98, 104.6, 'In the hills, Hanuman met Ram and Lakshman and took them to his king, Sugriva.'],
    [104.6, 110, "The monkeys searched everywhere for Sita. They learned she was in Lanka, across the sea. Hanuman took Ram's ring and leaped across!"],
    [110, 112.2, 'Hanuman reached Lanka and searched for Sita.'],
    [112.2, 115, 'Sita cried with joy to hear about Ram.'],
    [115, 121, "Ravan's guards set Hanuman's tail on fire! But Hanuman jumped from roof to roof and set Lanka's towers alight."],
    [121, 125.6, 'Then he leaped back across the sea with the good news.'],
    [126.5, 136, 'Nala and the monkeys built a bridge of rocks across the sea in five days!', 'Working together makes anything possible', 131],
    [136, 139, 'The army crossed to Lanka. Ram offered peace, but Ravan said no.'],
    [139, 150, "Kumbhakarna fought fiercely, until Ram's arrow stopped him."],
    [150, 160, 'Indrajit hid in the clouds and shot arrows at the army. Vibhishana knew his secret: a hidden fire prayer that would make him unbeatable.'],
    [160, 162, 'Ravan came out to fight, angry and sad.'],
    [162, 164, 'Lakshman, well again, stood with Ram. The last battle began.'],
    [164, 168.6, 'Ram took aim with the arrow of Brahma, the gift from the sage Agastya.'],
    [168.6, 176, 'The arrow struck Ravan. Good won over evil!', 'Goodness wins in the end', 171.5],
    [176, 186, 'The fourteen years were over. Vibhishana gave Ram the flying chariot Pushpaka, and they flew home.'],
    [186, 206, 'On the way, Ram showed Sita the places of their journey. Ayodhya was full of joy. By tradition, people lit lamps everywhere, and we remember it at Diwali!', 'Light always wins over darkness', 198],
    [206, 213, 'The whole city danced and sang. The brothers were together again!'],
    [213, 225, "Happy Diwali! Be a light in someone's life."],
  ];
  // ---------- time to read: every caption stays up long enough for a young child to read it, and to think about it ----------
  const NT = window.NARR_TIMES || {}, wc = (t) => (t ? t.split(/\s+/).length : 0), speak = (t) => (t ? NT[t] || wc(t) / 2.3 : 0);   // how long the narrator takes to say a line
  const VOICE_IN = .6, AFTER = 2.0, MORAL_GAP = .9;   // the voice starts this long after its text appears; an unhurried pause after it finishes, and before a lesson
  const readT = (t) => VOICE_IN + speak(t) + AFTER, moralT = (t) => (t ? MORAL_GAP + speak(t) + AFTER : 0), moralAt = (t) => (VOICE_IN + speak(t) + MORAL_GAP) / SLOW;   // seconds (moralAt: story time)
  INS.forEach(a => {   // a scene plays slower (its own animation stretched) when its text needs more time than the scene
    a.n0 = a.n; a.mAt = moralAt(a.cap);   // the lesson appears as the narrator finishes the caption
    a.n = Math.max(a.n0, readT(a.cap) / SLOW + .9, a.moral ? a.mAt + moralT(a.moral) / SLOW + .9 : 0);
  });
  for (const [A, B, en, moral, ms] of CAP) {   // the story pauses (everyone stands still) while a long caption is read
    const cuts = [A, ...INS.map(q => q.s0).filter(x => x > A + .01 && x < B - .01), B].sort((x, y) => x - y); let best = 0, bi = 0;
    for (let q = 0; q < cuts.length - 1; q++) if (cuts[q + 1] - cuts[q] > best) { best = cuts[q + 1] - cuts[q]; bi = q; }
    const need = readT(en) / SLOW + 1.8 + (moral ? moralT(moral) / SLOW : 0);   // the voice, and the text, must fit in this piece of the window
    if (best < 2.2 && need > best + .2) INS.push({ id: 'hold', own: true, s0: (cuts[bi] + cuts[bi + 1]) / 2, n: need, n0: need, fx: null, cap: '', moral: '' });   // a short gap between scenes: the caption is shown only in its own pause
    else if (need > best + .2) INS.push({ id: 'hold', s0: Math.max(cuts[bi] + .95, cuts[bi + 1] - .95), n: need - best, n0: need - best, fx: null, cap: '', moral: '' });
  }
  INS.sort((x, y) => x.s0 - y.s0);
  let accIns = 0; INS.forEach(a => { a.t0 = a.s0 + accIns; accIns += a.n; });
  const TOTAL = 225 + accIns;
  function mapT(Tr) {
    const t = Tr / SLOW;
    for (let i = 0; i < INS.length; i++) { const a = INS[i]; if (t < a.t0) return { S: t - (a.t0 - a.s0), i: -1 }; if (t < a.t0 + a.n) return { S: a.s0, i, u: (t - a.t0) * a.n0 / a.n, ur: t - a.t0 }; }
    return { S: t - accIns, i: -1 };
  }
  const sToT = (S) => S + INS.reduce((a, b) => a + (b.s0 < S ? b.n : 0), 0);
  // the seven books (kandas) of Valmiki's Ramayana, shown as a running heading over the story text
  const KANDA = [['PROLOGUE', 'THE BOON AND THE PROMISE', ''], ['BOOK ONE', 'BALA KANDA', 'CHILDHOOD'], ['BOOK TWO', 'AYODHYA KANDA', 'THE EXILE'], ['BOOK THREE', 'ARANYA KANDA', 'THE FOREST'],
    ['BOOK FOUR', 'KISHKINDHA KANDA', 'THE MONKEY KINGDOM'], ['BOOK FIVE', 'SUNDARA KANDA', "HANUMAN'S JOURNEY"], ['BOOK SIX', 'YUDDHA KANDA', 'THE WAR'], ['EPILOGUE', 'THE FESTIVAL OF LIGHTS', '']];
  const PRO = { ravanborn: 1, ravan_boon: 1, gods: 1, curse: 1, kboon: 1 };
  function kandaOf(m) {
    const id = m.i >= 0 ? INS[m.i].id : '', S = m.i >= 0 ? INS[m.i].s0 : m.S;
    if (PRO[id]) return 0; if (id === 'parashu' || id === 'vivah') return 1; if (id === 'sabari') return 3; if (id === 'darbar') return 6;
    return S < 41 ? 1 : S < 62 ? 2 : S < 98 ? 3 : S < 108 ? 4 : S < 126.5 ? 5 : S < 213 ? 6 : 7;
  }
  const KSEG = [];   // [kanda, real start, real end]
  for (let tr = 0; tr < TOTAL * SLOW; tr += .1) { const k = kandaOf(mapT(tr)); if (!KSEG.length || KSEG[KSEG.length - 1][0] !== k) KSEG.push([k, tr, TOTAL * SLOW]); if (KSEG.length > 1) KSEG[KSEG.length - 2][2] = KSEG[KSEG.length - 1][1]; }
  function captionAt(Tr) {
    const m = mapT(Tr); let out = null;
    const seg = KSEG.find(q => Tr >= q[1] && Tr < q[2]) || KSEG[KSEG.length - 1], K0 = KANDA[seg[0]];
    const kanda = { book: K0[0], name: K0[1], sub: K0[2], age: Tr - seg[1], a: sstep(seg[1], seg[1] + 1.4, Tr) * (1 - sstep(seg[2] - 1.2, seg[2], Tr)) };
    if (m.i >= 0 && INS[m.i].id === 'hold') {   // a reading pause: the caption of this moment stays, fully shown
      const h = INS[m.i], c = CAP.find(([a, b]) => h.s0 >= a && h.s0 < b);
      if (c) { const [a, , en, moral] = c, sofar = h.own ? m.ur : h.s0 - a + m.ur, mm = moralAt(en), fa = h.own ? sstep(0, .5, m.ur) * (1 - sstep(h.n - .6, h.n, m.ur)) : 1;
        out = { en, moral: moral || '', a: fa, age: sofar * SLOW, rate: wc(en) / speak(en), am: moral ? sstep(mm, mm + .8, sofar) * fa : 0 }; }
    }
    else if (m.i >= 0) { const a = INS[m.i], f = sstep(0, .9, m.ur) * (1 - sstep(a.n - .9, a.n, m.ur)); out = { en: a.cap, moral: a.moral || '', a: f, age: m.ur * SLOW, rate: wc(a.cap) / speak(a.cap), am: a.moral ? sstep(a.mAt, a.mAt + .8, m.ur) * (1 - sstep(a.n - .9, a.n, m.ur)) : 0 }; }
    else for (const [a, b, en, moral, ms] of CAP) if (m.S >= a && m.S < b) {
      let k = sstep(a, a + .9, m.S) * (1 - sstep(b - .9, b, m.S)); for (const q of INS) if (q.id !== 'hold') k *= sstep(0, .8, Math.abs(m.S - q.s0));
      { let lo = a, hi = b; for (const q of INS) { if (q.id === 'hold') continue; if (q.s0 <= m.S && q.s0 > lo) lo = q.s0; if (q.s0 > m.S && q.s0 < hi) hi = q.s0; } if (hi - lo < 1.5 || INS.some(q => q.own && q.s0 > lo && q.s0 < hi)) k = 0; }   // short gaps: the caption appears only in its own pause   // no flicker of text in the short gaps between scenes
      const mm = a + moralAt(en); out = { en, moral: moral || '', a: k, age: (m.S - a) * SLOW, rate: wc(en) / speak(en), am: moral ? sstep(mm, mm + .8, m.S) * (1 - sstep(b - .9, b, m.S)) * sstep(0, .8, Math.abs(m.S - 0)) : 0 }; break;
    }
    if (!out) out = { en: '', moral: '', a: 0, am: 0, age: 0 };
    out.kanda = kanda; return out;
  }
  const chapters = [0, 9, 14.5, 22, 31, 41, 53, 60, 64, 70, 81, 92, 98, 104.6, 110, 115, 121, 126.5, 136, 139, 150, 160, 164, 168.6, 176, 186, 206, 213].map(sToT).concat(INS.filter(a => a.id !== 'hold').map(a => a.t0)).sort((a, b) => a - b).filter((x, i, v) => !i || x - v[i - 1] > .5).map(x => x * SLOW);

  // the aim and the arrow of an inserted scene (the actors themselves are posed later)
  function insertParams(id, u, rx, lx) {
    const out = { aw: null, shot: null }, win = (a0, a1, d0, d1) => ({ aim: sstep(a0, a0 + 1.2, u) * (1 - sstep(a1, a1 + .6, u)), draw: sstep(d0, d1, u) * (u < d1 + .05 ? 1 : 0), big: false });
    const wins = (l) => { for (const [a0, a1, d0, d1] of l) if (u >= a0 && u < a1 + .6) out.aw = win(a0, a1, d0, d1); };
    const shoot = (t, dur, x0, y0, x1, y1) => { const p = (u - t) / dur; if (p >= 0 && p < 1) out.shot = { p, x0, y0, x1, y1 }; };
    if (id === 'tataka') { wins([[3.6, 6.8, 4.6, 5.9]]); shoot(5.9, .8, rx + 62, 128, 1130, 110); }
    if (id === 'vali') { wins([[5.6, 8.6, 6.2, 7.3]]); shoot(7.3, .9, rx + 62, 128, 4110, 125); }
    if (id === 'siddha') { wins([[2.8, 5.6, 3.4, 4.6], [6, 8.6, 6.5, 7.6]]); shoot(4.6, .8, rx + 62, 128, 1190, 140); shoot(7.6, .8, rx + 62, 128, 1150, 160); }
    if (id === 'parashu') { wins([[6, 9.4, 7, 8.4]]); shoot(8.4, .9, rx + 62, 128, 1960, 260); }
    if (id === 'crown') { wins([[2, 7, 3, 4.4]]); shoot(4.4, 1.0, rx + 62, 128, 5530, 215); }
    if (id === 'headcut') { wins([[1.2, 3.6, 1.8, 2.8], [4, 6.2, 4.4, 5.2], [6.6, 8.8, 7, 7.8], [9.2, 11.4, 9.6, 10.4]]); [[2.8, 215], [5.2, 150], [7.8, 225], [10.4, 220]].forEach(([t, y]) => shoot(t, .8, rx + 62, 128, 5540, y)); }
    if (id === 'samudra') wins([[3.2, 6.4, 3.8, 6.3]]);
    if (id === 'curse') shoot(3.4, .8, 392, 118, 560, 50);
    if (id === 'niku') shoot(8.2, .8, lx + 62, 128, 5430, 100);
    return out;
  }
  const hide = (...hs) => hs.forEach(h => { h.root.visible = false; });
  const showAt = (h, x, y, z, ry, sc) => { h.root.visible = sc > .02; h.root.position.set(x, y, z); h.root.rotation.set(0, ry, 0); h.root.scale.setScalar(sc); };
  const pop = (a, b, u, sc) => u < a ? 0 : u >= b ? 0 : sc * (.2 + .8 * ease(sstep(a, a + 1.1, u))) * (1 - sstep(b - 1.1, b, u) * .97);   // scale in at a, out at b
  function insertActors(ins, Tr, rx, base) {
    hide(shatru, urmila, mandavi, shruta, kusha, tataka, dash, kaik, bharat, sugr, vali, indra, sabari, vibh, surp, hermit, marich, agni, ahalya, angada, brahma, vishnu, youngd, shravan, blindA, blindB, rishya, kausalya, sumitra, vasishtha, parashu, mandodari); pot.visible = false; mhut.visible = false; furrow.visible = false; marich.root.rotation.z = 0; bowL.g.visible = false; feast.visible = false; astra.visible = false; astra.scale.setScalar(9); river.visible = false; hide(agastya, guha, samudra, sushena); spear.visible = herb.visible = himalaya.visible = false; spear.scale.setScalar(1); boat.visible = bed.visible = grass.visible = ring.visible = jewel.visible = memGlow.visible = divGlow.visible = sun.visible = surasa.visible = false; rays.forEach(r => { r.visible = false; }); redMoon.visible = true; palace2.visible = true; palaceL.visible = true; court.visible = true; river.material.color.setHex(0x4a90ff); seaAmp = 1; tower.visible = false; stone.visible = false; heart.visible = false;
    garuda.visible = false; sandals.visible = false; berry.visible = false; throne.visible = false; fireGlow.visible = false; orbs.forEach(o => { o.visible = false; }); serpents.forEach(g => { g.visible = false; }); coils.forEach(g => { g.visible = false; });
    if (ins.i < 0) { if (ins.S >= 77.1 && ins.S < 81) { showAt(marich, 3640, 0, 6, -YAW, 1.1 * ease(sstep(77.1, 78, ins.S)) + .001); pose(marich, { ph: 0, s: 0, t: Tr, kneel: 1, sad: 1 }); } return; }   // the deer turns back into Maricha, who falls where it stood
    const id = INS[ins.i].id, u = ins.u, face = -YAW;
    if (id === 'tataka') {   // Vishwamitra's ritual: Tataka charges and falls
      const tx = u < 4 ? lerp(1290, 1130, sstep(.4, 4, u)) : 1130, tf = sstep(6.3, 7.6, u), td = sstep(8.2, 9.6, u);
      if (u > .4 && u < 9.7) { showAt(tataka, tx, 12 * tf, -6, face, 1.5 * (1 - .6 * td) + .001); pose(tataka, { ph: tx * Math.PI / STEP, s: u < 4 ? .75 : 0, t: Tr, cheer: sstep(4, 4.6, u) * (1 - sstep(6, 6.4, u)), talk: u > 4 && u < 6.2, angry: 1 }); tataka.root.rotation.z = -1.5 * tf; if (td > 0 && Math.random() < .8) ember(tx + rnd(-30, 30), rnd(10, 130), 0, true); }
      once('i0a', u >= .4, () => { flashV = .5; burst(1290, 80, 0, .3, 70, 80); });
      once('i0b', u >= 6.7, () => { flashV = .7; burst(1130, 100, 0, .12, 120, 130); });
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
    const R = YAW, L = -YAW, spd = (a, b, k) => (u > a && u < b) ? (k || .85) : 0, wk = (a, b, u0, u1) => lerp(a, b, ease(clamp((u - u0) / (u1 - u0))));
    const act = (h, x, y, z, ry, sc, o) => { showAt(h, x, y, z, ry, sc); pose(h, Object.assign({ ph: x * Math.PI / STEP, s: 0, t: Tr }, o || {})); };
    const fire = (x, a, b, k) => { if (u > a && u < b) for (let q = 0; q < 2; q++) flame(x + rnd(-14, 14), 4, 8, k || 1.3); };
    const T = ins.S;
    // ---- Lakshman, the Shakti, and the healing herbs (Yuddha Kanda 100–101), told in four clear steps ----
    const LAK_DOWN = (h, k) => { h.root.rotation.z = 1.45 * k; h.root.position.y = 12 * k; };   // falls backwards, head away from Ravan
    const closeEyes = (h, k) => { const ey = h.head.userData.eyes; if (ey && k > 0) ey.forEach(e => { e.scale.y = e.userData.by * lerp(1, .06, k); }); };
    if (id === 'shakti') {   // Ravan's spear strikes Lakshman
      rav.root.visible = true; rav.root.position.set(5560, 0, -10); rav.root.scale.set(1.1, 1.1, 1.1); rav.root.rotation.y = -(YAW - .1);
      pose(rav, { ph: 0, s: 0, t: Tr, angry: 1, point: sstep(.6, 1.6, u) * (1 - sstep(2.4, 2.9, u)), talk: u < 2.4 });
      const fly = clamp((u - 2.2) / .8), stuck = u >= 3 && u < 6.9;
      spear.visible = u > .6 && u < 7.6;
      if (u < 2.2) { rav.root.updateMatrixWorld(true); rav.arms[0].userData.hand.getWorldPosition(wp); spear.position.copy(wp); spear.rotation.set(0, 0, Math.PI - .15); }
      else if (u < 3) { spear.position.set(lerp(5520, 5126, fly), lerp(175, 108, fly) + Math.sin(fly * Math.PI) * 26, 14); spear.rotation.set(0, 0, Math.PI - .17); if (Math.random() < .9) flame(spear.position.x + 40, spear.position.y, 14, .6); }
      else if (stuck) { spear.position.set(5110 - 20, 22, 18); spear.rotation.set(0, 0, Math.PI / 2 + .3); }
      else { const b = ease(sstep(6.9, 7.6, u)); spear.position.set(5040 + 30 * b, 110 + 40 * b, 18); spear.rotation.set(0, 0, Math.PI / 2 + b * 2.4); spear.scale.setScalar(1 - b * .9); }
      if (u < 6.9) spear.scale.setScalar(1);
      once('nsh_a', u >= 3, () => { flashV = 1; burst(5110, 110, 10, .12, 120, 140); burst(5110, 110, 10, .12, 60, 90); });
      once('nsh_b', u >= 7.2, () => { flashV = .5; burst(5060, 130, 18, .08, 50, 70); });
      const down = ease(sstep(3, 3.8, u)); LAK_DOWN(lak, down); base.lak.sad = 1; closeEyes(lak, down);
      const rx2 = lerp(rx, 5036, ease(sstep(3.4, 4.4, u))); ram.root.position.x = rx2; ram.root.rotation.y = lerp(YAW, -YAW, ease(sstep(3.6, 4.4, u)));
      base.ram.ph = rx2 * Math.PI / STEP; base.ram.s = spd(3.4, 4.4); base.ram.kneel = sstep(4.2, 5, u); base.ram.sad = sstep(4, 5, u); base.ram.angry = sstep(3, 3.4, u) * (1 - sstep(4, 4.6, u));
      base.ram.point = sstep(6.2, 6.7, u) * (1 - sstep(7.4, 8, u)); base.ram.talk = u > 8.2 && u < 10.4; base.ram.join = sstep(8, 8.8, u);
      if (u > 8.6 && u < 10.6 && Math.random() < .2) parts.push({ x: 5030, y: 112, z: 30, vx: 0, vy: -8, vz: 0, life: .8, age: 0, hue: .55, r: .8, drag: .9, g: 40 });   // tears
    }
    if (id === 'sushena') {   // the physician Sushena; Hanuman is sent to the Himalayas
      LAK_DOWN(lak, 1); closeEyes(lak, 1); base.lak.sad = 1;
      ram.root.position.x = 5036; ram.root.rotation.y = -YAW; base.ram.ph = 5036 * Math.PI / STEP; base.ram.kneel = 1; base.ram.sad = 1; base.ram.join = 1 - sstep(4, 4.6, u); base.ram.look = sstep(4, 5, u) * -.3;
      const sx = wk(4760, 4958, .3, 2.4);
      act(sushena, sx, 0, 26, R, pop(.1, 99, u, .95), { s: spd(.3, 2.4, .7), kneel: sstep(2.4, 3, u), point: sstep(3, 3.6, u) * (1 - sstep(4, 4.4, u)), talk: u > 4.4 && u < 6.6, look: .1 });
      const hb = hanPos(T).x, go = ease(sstep(7.4, 9.6, u)), hx = u < 7.4 ? wk(hb, 4905, 3.6, 5) : lerp(4905, 4300, go), hy = u < 7.4 ? 0 : 280 * go;
      han.root.position.set(hx, hy, 6); han.root.rotation.y = u < 5 ? YAW : (u < 7.2 ? YAW * .4 : -1.4);
      pose(han, { ph: hx * Math.PI / STEP, s: spd(3.6, 5), t: Tr, join: sstep(5.4, 6, u) * (1 - sstep(6.8, 7.2, u)), kneel: sstep(5.4, 6, u) * (1 - sstep(6.8, 7.2, u)) * .6, fly: sstep(7.2, 7.6, u), talk: u > 6.2 && u < 6.9 });
      once('nsu2_a', u >= 7.4, () => { flashV = .6; burst(4905, 30, 6, .08, 90, 110); });
      if (u > 7.4 && u < 9.6) ember(hx + 20, hy + 60, 6, false);
    }
    if (id === 'himalaya') {   // the mountain of herbs
      himalaya.visible = true; mount.visible = true; palaceL.visible = false;
      const land = ease(sstep(.3, 2.6, u)), lift = ease(sstep(5.8, 7.2, u)), away = ease(sstep(7.6, 9.8, u));
      const hx = u < 7.6 ? lerp(-60, -300, land) : lerp(-300, 120, away), hy = u < 7.6 ? 230 * (1 - land) + 20 * Math.sin(land * Math.PI) : 60 + 200 * away;
      const grow = 1 + .5 * sstep(5.2, 6, u) * (1 - sstep(9.4, 10, u));
      han.root.visible = true; han.root.position.set(hx, hy, 20); han.root.scale.setScalar(grow); han.root.rotation.y = u < 2.6 ? -1.4 : (u < 7.6 ? -YAW + Math.sin(u * 2.4) * .5 * sstep(2.6, 3, u) * (1 - sstep(5, 5.4, u)) : 1.4);
      pose(han, { ph: 0, s: 0, t: Tr, fly: u < 2.4 || u > 7.6 ? 1 : 0, cheer: sstep(5.6, 6.2, u) * (u < 7.6 ? 1 : 0), look: u > 2.8 && u < 5.2 ? Math.sin(u * 2.4) * .5 : 0, talk: u > 3 && u < 4.6 });
      const top = new THREE.Vector3(-380, 150, -20);
      if (u < 5.8) mount.position.copy(top); else { const hold = new THREE.Vector3(hx - 4, hy + 175 * grow + 30, 10); mount.position.lerpVectors(top, hold, lift); }
      mount.scale.setScalar(1); mount.rotation.y = Tr * .3;
      const fl = u > 2.6 && u < 5.6 ? .5 + .5 * Math.sin(Tr * 9) : 1; mount.children[1].material.opacity = .22 * fl;   // the herbs flicker and hide
      if (u > 6 && Math.random() < .6) ember(mount.position.x + rnd(-30, 30), mount.position.y - 20, 10, false);
      once('nhi_a', u >= 6.2, () => { flashV = .7; burst(-380, 150, 0, .38, 110, 120); });
    }
    if (id === 'herbs') {   // Lakshman healed
      const land = ease(sstep(.2, 3.2, u)), hx = lerp(4560, 4860, land), hy = 240 * (1 - land) + 30 * Math.sin(land * Math.PI);
      han.root.position.set(hx, hy, 8); han.root.rotation.y = u < 3.4 ? 1.4 : YAW; han.root.scale.setScalar(1 + .5 * (1 - sstep(3.4, 4.2, u)));
      pose(han, { ph: 0, s: 0, t: Tr, fly: 1 - sstep(2.8, 3.4, u), cheer: 1 - sstep(3.4, 4, u), join: sstep(9.2, 9.8, u) * (1 - sstep(11, 11.6, u)), kneel: sstep(9.2, 9.8, u) * (1 - sstep(11, 11.6, u)) * .5 });
      mount.visible = u < 11.8; const set = ease(sstep(3.2, 4.2, u)); mount.position.set(lerp(hx - 4, 4800, set), lerp(hy + 260, 70, set), lerp(10, -40, set)); mount.rotation.y = Tr * .3;
      mount.scale.setScalar(1 - sstep(10.8, 11.8, u) * .95); mount.children[1].material.opacity = .22;
      act(sushena, 4958, 0, 26, R, .95, { kneel: 1, point: sstep(4.6, 5.2, u) * (1 - sstep(6.2, 6.8, u)) });
      const hp2 = ease(sstep(4.4, 5.6, u)); herb.visible = u > 4.4 && u < 6.6; if (herb.visible) { herb.position.set(lerp(4810, 4952, hp2), lerp(70, 34, hp2) + Math.sin(hp2 * Math.PI) * 18, 28); herb.scale.setScalar(5 * (1 - sstep(6.2, 6.6, u)) + .01); }
      const rise = ease(sstep(6.6, 8, u)); LAK_DOWN(lak, 1 - rise); closeEyes(lak, 1 - sstep(6.2, 6.8, u)); base.lak.cheer = sstep(8.4, 9, u) * (1 - sstep(9.8, 10.4, u)) * .6; base.lak.join = sstep(10, 10.6, u);
      ram.root.position.x = lerp(5036, 5050, rise); ram.root.rotation.y = lerp(-YAW, YAW, ease(sstep(8, 8.8, u))); base.ram.ph = ram.root.position.x * Math.PI / STEP;
      base.ram.kneel = 1 - sstep(7.2, 8, u); base.ram.sad = 1 - sstep(6.8, 7.6, u); base.ram.point = sstep(8, 8.6, u) * (1 - sstep(9.4, 10, u)); base.ram.talk = u > 9.6 && u < 10.8; base.ram.join = sstep(10, 10.6, u);
      vanaras.forEach((v, i) => { pose(v, { ph: 0, s: 0, t: Tr + i, cheer: sstep(8 + i * .1, 8.6 + i * .1, u) * (1 - sstep(10.6, 11.2, u)) }); });
      once('nhe_a', u >= 3.2, () => { flashV = .8; burst(4800, 70, -20, .38, 120, 130); });
      once('nhe_b', u >= 6.4, () => { flashV = .9; burst(4990, 40, 20, .38, 110, 110); burst(4990, 40, 20, .13, 60, 80); });
      for (let q = 0; q < 2; q++) if (u > 3.4 && u < 10.8 && Math.random() < .5) parts.push({ x: 4800 + rnd(-40, 40), y: rnd(40, 110), z: -20, vx: rnd(5, 25), vy: rnd(5, 20), vz: 0, life: rnd(1, 2), age: 0, hue: .38, r: rnd(.8, 1.6), drag: .7, g: -5 });   // the healing scent drifts over the field
    }
    if (id === 'guha') {   // Guha ferries the exiles across the Ganga (Ayodhya Kanda 50–52)
      palace2.visible = false; court.visible = false;
      river.visible = true; river.position.set(2445, 3, 30); river.scale.set(200, 5, 22); river.material.color.setHex(0x2a7aff); river.material.opacity = .55 + .08 * Math.sin(Tr * 2);
      if (Math.random() < .5) parts.push({ x: rnd(2260, 2630), y: 6, z: rnd(10, 30), vx: rnd(-6, 6), vy: rnd(2, 8), vz: 0, life: rnd(.6, 1.2), age: 0, hue: .55, r: rnd(.8, 1.6), drag: .6, g: 0 });
      const bx = wk(2330, 2560, 6.4, 10.6), row = spd(6.4, 10.6, 1);
      boat.visible = true; boat.position.set(bx, 4 + Math.sin(Tr * 2) * 1.2, 18); boat.rotation.z = Math.sin(Tr * 1.6) * .02; boat.userData.oar.rotation.z = .6 + Math.sin(Tr * 3) * .35 * row;
      const gx = u < 6 ? wk(2640, 2335, .3, 3) : bx - 58;
      act(guha, gx, u < 6 ? 0 : 10, u < 6 ? 4 : 22, u < 6.2 ? L : R, pop(.1, 99, u, 1.05), { s: spd(.3, 3), kneel: sstep(3.2, 3.9, u) * (1 - sstep(4.8, 5.4, u)), join: sstep(3.2, 3.9, u) * (1 - sstep(5.4, 5.9, u)), talk: u > 3.4 && u < 4.8, point: u > 6.2 ? .7 : 0 });
      const board = ease(sstep(4.8, 6.2, u)), off = ease(sstep(10.8, 12.4, u)), ws = spd(4.8, 6.2) || spd(10.8, 12.4);
      const place = (h, x0, dx, z, who) => { const inB = bx + dx, x = u < 6.2 ? lerp(x0, inB, board) : u < 10.8 ? inB : lerp(inB, bx + 130 + dx, off); h.root.position.set(x, 10 * board * (1 - off), z); h.root.rotation.y = R; who.ph = x * Math.PI / STEP; who.s = ws; };
      place(sita, sitaX(T), -25, 24, base.sita); place(ram, rx, 12, 20, base.ram); place(lak, lakX(T), 46, 16, base.lak); [sita, ram, lak].forEach(h => { h.root.position.y += 6 * board * (1 - off); });
      base.ram.point = sstep(4.2, 4.7, u) * (1 - sstep(5.2, 5.7, u)); base.ram.talk = u > 3.8 && u < 4.8; base.sita.look = .2;
      once('ng_g', u >= 4.4, () => { flashV = .3; burst(2320, 130, 8, .1, 30, 50); });
    }
    if (id === 'death') {   // Dasharatha dies of grief, remembering the curse (Ayodhya Kanda 63–64)
      ram.root.visible = lak.root.visible = sita.root.visible = false;   // they are far away, in the forest
      bed.visible = true; bed.position.set(2400, 0, 10);
      const dead = sstep(9.4, 10.4, u);
      showAt(dash, 2316, 46, 12, 0, 1); dash.root.rotation.set(0, 0, -Math.PI / 2 + .04); pose(dash, { ph: 0, s: 0, t: Tr, sad: 1, talk: (u > 2 && u < 8.6) || (u > 8.8 && u < 9.4) });
      const ey = dash.head.userData.eyes; if (ey && dead > 0) ey.forEach(e => { e.scale.y = e.userData.by * lerp(1, .06, dead); });
      act(kausalya, 2455, 0, -16, -.3, 1, { kneel: .8, sad: 1, join: sstep(.6, 1.4, u) * (1 - sstep(9.6, 10.2, u)), talk: u > 10.6 && u < 12.4, look: .2 });
      act(sumitra, 2520, 0, -24, -.5, 1, { sad: 1, join: sstep(10.2, 11, u) });
      // the memory: the boy by the river, and the blind parents
      const mv = sstep(3, 4, u) * (1 - sstep(7.6, 8.6, u)); memGlow.visible = mv > .02; memGlow.position.set(2250, 105, -30); memGlow.scale.set(95 * mv + .01, 60 * mv + .01, 10); memGlow.material.opacity = .16 * mv;
      if (mv > .02) { act(shravan, 2215, 78, -26, R, .42 * mv, { kneel: .6, sad: 1 }); act(blindA, 2270, 78, -26, L, .42 * mv, { sad: 1, point: .7 }); act(blindB, 2298, 78, -26, L, .42 * mv, { sad: 1 }); }
      const sp = ease(sstep(9.8, 12.4, u)); astra.visible = u > 9.6 && u < 12.6; if (astra.visible) { astra.position.set(2420, lerp(60, 250, sp), 20); astra.scale.setScalar(6 * (1 - sp * .5)); if (Math.random() < .6) ember(2420 + rnd(-4, 4), astra.position.y, 20, false); }
      once('nd_a', u >= 9.6, () => { flashV = .5; burst(2420, 60, 20, .12, 60, 70); });
    }
    if (id === 'agastya') {   // the sage Agastya gives Ram divine weapons (Aranya Kanda 12)
      const ax = rx + 150; fire(rx + 106, .2, 10.4, .9);
      act(agastya, ax, 0, 4, L, pop(.1, 10.8, u, .92), { talk: u > 1.2 && u < 4.4, point: sstep(4.4, 5.2, u) * (1 - sstep(7.8, 8.4, u)) });
      const bp = ease(sstep(4.8, 6.6, u));
      if (u > 4.4 && u < 7.4) { bowL.g.visible = true; bowL.g.position.set(lerp(ax - 34, rx + 26, bp), 104 + Math.sin(bp * Math.PI) * 34, 14); bowL.g.rotation.set(0, 0, 0); bowL.g.scale.setScalar(1.6 * (1 - sstep(6.8, 7.4, u)) + .01);
        const s2 = bowL.string.geometry.attributes.position; s2.setXYZ(0, 0, 38, 0); s2.setXYZ(1, 0, 0, 0); s2.setXYZ(2, 0, -38, 0); s2.needsUpdate = true; if (Math.random() < .7) ember(bowL.g.position.x + 10, bowL.g.position.y, 14, false); }
      const ap = ease(sstep(7.4, 9, u)); astra.visible = u > 7.2 && u < 9.4; if (astra.visible) { astra.position.set(lerp(ax - 30, rx - 10, ap), 118 + Math.sin(ap * Math.PI) * 26, 14); astra.scale.set(20, 3.6, 3.6); }
      godRay(0, rx, 0, sstep(5.6, 6.4, u) * (1 - sstep(8.8, 9.8, u)));
      base.ram.kneel = sstep(5, 5.8, u) * (1 - sstep(9, 9.8, u)); base.ram.join = base.ram.kneel; base.lak.join = sstep(1, 2, u) * (1 - sstep(9.4, 10.2, u)); base.sita.join = base.lak.join; base.ram.talk = u > 9.6 && u < 10.4;
      once('na_a', u >= 6.6, () => { flashV = .7; burst(rx + 20, 110, 12, .12, 90, 90); });
      once('na_b', u >= 9, () => { flashV = .6; burst(rx - 10, 118, 12, .58, 70, 80); });
    }
    if (id === 'surasa') {   // Surasa tests Hanuman over the ocean (Sundara Kanda 1)
      const hp0 = hanPos(T), sx = hp0.x + 165, rise = ease(sstep(.4, 2.6, u)) * (1 - ease(sstep(11.2, 12.8, u)));
      surasa.visible = rise > .01; surasa.position.set(sx, -170 * (1 - rise), -20); surasa.scale.setScalar(1);
      const hs = 1 + .5 * sstep(4.6, 6.6, u); surasa.userData.head.scale.setScalar(hs); surasa.userData.jaw.rotation.z = -(.12 + .45 * sstep(2.6, 3.6, u) + .35 * sstep(4.6, 6.6, u)) * (1 - sstep(9.2, 10, u)); surasa.userData.head.rotation.z = Math.sin(Tr * 1.3) * .05;
      const hy = u < 11.6 ? lerp(hp0.y, 132, ease(sstep(0, 1.4, u))) : lerp(132, hp0.y, ease(sstep(11.6, 13, u)));
      const dart = ease(sstep(7.5, 8.1, u)) * (1 - ease(sstep(8.5, 9.1, u))), mx = sx - 14 * hs, my = 150 * 1 + 6;
      const bigK = sstep(4, 5.6, u) * (1 - sstep(6.8, 7.3, u)), hx = lerp(hp0.x, mx, dart), hyy = lerp(hy - 70 * bigK, my, dart), big = 1 + 1.1 * bigK, tiny = 1 - .85 * sstep(6.8, 7.3, u) * (1 - sstep(9.1, 9.8, u));
      han.root.visible = !(u > 8.1 && u < 8.5); han.root.position.set(hx, hyy, 10); han.root.scale.setScalar(big * tiny);
      pose(han, { ph: 0, s: 0, t: Tr, fly: 1 - sstep(9.8, 10.4, u) * (1 - sstep(11.2, 11.6, u)), join: sstep(9.8, 10.4, u) * (1 - sstep(11.2, 11.6, u)), talk: u > 3 && u < 4.2 });
      once('nsu_a', u >= .6, () => { flashV = .5; burst(sx, 20, 0, .55, 120, 120); });
      once('nsu_b', u >= 8.5, () => { flashV = .6; burst(mx, my, 0, .12, 60, 90); });
      once('nsu_c', u >= 10.6, () => { flashV = .7; burst(sx - 10, 170, 0, .3, 90, 90); });
      if (rise > .05 && Math.random() < .5) parts.push({ x: sx + rnd(-30, 90), y: 10, z: rnd(-10, 20), vx: rnd(-10, 10), vy: rnd(30, 70), vz: 0, life: rnd(.6, 1.1), age: 0, hue: .55, r: rnd(1, 2), drag: .5, g: 60 });
    }
    if (id === 'ashoka') {   // the Ashoka grove: Ravan's threat, the blade of grass, the ring and the hair jewel (Sundara Kanda 20–38)
      const down = ease(sstep(8.6, 10, u)), back = ease(sstep(14.6, 15.8, u));
      const hx = u < 8.6 ? 5772 : u < 14.6 ? lerp(5772, 5640, down) : lerp(5640, 5620, back), hy = u < 8.6 ? 150 : lerp(150, 0, down) + Math.sin(down * Math.PI) * 26 * (u < 14.6 ? 1 : 0);
      han.root.position.set(hx, hy, u < 8.6 ? -24 : 10); han.root.rotation.y = u < 14.6 ? L : R; han.root.scale.setScalar(u < 8.6 ? .8 : 1);
      pose(han, { ph: 0, s: spd(14.6, 15.8, .7), t: Tr, kneel: u < 8.6 ? .9 : sstep(10, 10.6, u) * (1 - sstep(14.2, 14.8, u)), join: sstep(10.2, 10.8, u) * (1 - sstep(11, 11.4, u)), point: sstep(11, 11.6, u) * (1 - sstep(12.4, 13, u)), talk: (u > 7.2 && u < 8.6) || (u > 10.4 && u < 11.2) });
      const rvx = u < 2.6 ? wk(5560, 5628, .4, 2.6) : u < 5.8 ? 5628 : wk(5628, 5560, 5.8, 7.8);
      rav.root.visible = true; rav.root.position.set(rvx, 0, -10); rav.root.scale.set(1.1, 1.1, 1.1); rav.root.rotation.y = u < 5.8 ? YAW - .1 : -(YAW - .1);
      pose(rav, { ph: rvx * Math.PI / STEP, s: spd(.4, 2.6, .6) || spd(5.8, 7.8, .6), t: Tr, talk: u > 2.6 && u < 5.6, point: sstep(3, 3.6, u) * (1 - sstep(5, 5.6, u)), angry: 1 });
      grass.visible = u > 2.4 && u < 6.6; grass.position.set(5672, 22, 34); grass.rotation.z = -.25;
      base.sita.look = u > 2.4 && u < 6.6 ? -.7 : (u > 8.8 ? .2 : 0); base.sita.sad = u < 11.4 ? 1 : 0; base.sita.talk = (u > 4.2 && u < 5.4) || (u > 12 && u < 13.4); base.sita.join = sstep(12, 12.6, u) * (1 - sstep(13, 13.4, u));
      const rp = ease(sstep(11.2, 12.4, u)); ring.visible = u > 11.2 && u < 12.8; if (ring.visible) { ring.position.set(lerp(hx - 18, 5694, rp), lerp(76, 66, rp) + Math.sin(rp * Math.PI) * 10, 30); ring.rotation.y = Tr * 3; }
      const jp = ease(sstep(13.2, 14.4, u)); jewel.visible = u > 13 && u < 14.8; if (jewel.visible) { jewel.position.set(lerp(5694, hx - 16, jp), lerp(70, 82, jp) + Math.sin(jp * Math.PI) * 10, 30); jewel.scale.setScalar(1 - sstep(14.4, 14.8, u) * .9); }
      once('nas_a', u >= 12.4, () => { flashV = .5; burst(5694, 70, 30, .13, 60, 60); });
      once('nas_b', u >= 14.4, () => { flashV = .5; burst(hx - 16, 82, 30, .55, 60, 60); });
    }
    if (id === 'chudamani') {   // Hanuman gives Sita's jewel to Ram (Sundara Kanda 65–66)
      const hb = hanPos(T).x, hx = u < 2.6 ? wk(hb, rx + 78, .2, 2.4) : u < 9.4 ? rx + 78 : wk(rx + 78, hb, 9.4, 10.8);
      han.root.position.set(hx, 0, 10); han.root.rotation.y = u < 9.4 ? L : R;
      pose(han, { ph: hx * Math.PI / STEP, s: spd(.2, 2.4) || spd(9.4, 10.8), t: Tr, kneel: sstep(2.4, 3, u) * (1 - sstep(8.8, 9.4, u)), join: sstep(2.6, 3.2, u) * (1 - sstep(3.6, 4, u)), point: sstep(3.6, 4.2, u) * (1 - sstep(5, 5.6, u)), talk: u > 3 && u < 4.6 });
      const jp = ease(sstep(3.8, 5.2, u)); jewel.visible = u > 3.8 && u < 8.8;
      if (jewel.visible) { jewel.position.set(u < 5.6 ? lerp(hx - 14, rx + 22, jp) : rx + 12, u < 5.6 ? lerp(72, 104, jp) : 116 + Math.sin(Tr * 3) * 1.5, 26); jewel.scale.setScalar((1 + .15 * Math.sin(Tr * 6)) * (1 - sstep(8.4, 8.8, u)) + .01); }
      base.ram.join = sstep(5.4, 6, u) * (1 - sstep(8.2, 8.8, u)); base.ram.sad = sstep(5.6, 6.4, u) * (1 - sstep(8.4, 9, u)); base.ram.point = sstep(8.8, 9.4, u) * (1 - sstep(10.2, 10.8, u)); base.ram.angry = sstep(8.6, 9.2, u) * .5; base.ram.talk = u > 8.8 && u < 10;
      if (u > 6.2 && u < 8 && Math.random() < .25) parts.push({ x: rx + 9, y: 152, z: 30, vx: 0, vy: -10, vz: 0, life: .9, age: 0, hue: .55, r: .8, drag: .9, g: 40 });
      vanaras.forEach((v, i) => { pose(v, { ph: 0, s: 0, t: Tr + i, cheer: sstep(9.2 + i * .1, 9.8 + i * .1, u) * (1 - sstep(10.4, 11, u)) }); });
      once('nch_a', u >= 5.2, () => { flashV = .5; burst(rx + 22, 104, 26, .55, 60, 60); });
    }
    if (id === 'samudra') {   // Ram and the Ocean (Yuddha Kanda 21–22)
      const sx = 4470, rise = ease(sstep(6, 8, u)) * (1 - ease(sstep(11.4, 12.8, u)));
      seaAmp = 1 + 3.5 * sstep(3.6, 5, u) * (1 - sstep(7, 8.4, u));
      base.ram.kneel = sstep(.3, 1, u) * (1 - sstep(2.6, 3.2, u)); base.ram.join = base.ram.kneel; base.ram.angry = sstep(3.2, 4, u) * (1 - sstep(6.6, 7.4, u)); base.ram.talk = u > 9 && u < 10;
      if (u > 3.8 && u < 6.4) for (let q = 0; q < 2; q++) flame(rx + 74, 124, 10, .5);
      if (rise > .02) act(samudra, sx, -150 * (1 - rise), -4, L, 1.25, { join: sstep(7, 7.8, u) * (1 - sstep(8.6, 9, u)), talk: u > 8.6 && u < 11, point: sstep(9.6, 10.2, u) * (1 - sstep(10.8, 11.4, u)) });
      once('nsa_a', u >= 6, () => { flashV = .8; burst(sx, 30, 0, .55, 140, 150); });
      if (rise > .02 && rise < .98 && Math.random() < .8) parts.push({ x: sx + rnd(-40, 40), y: 10, z: rnd(-10, 20), vx: rnd(-20, 20), vy: rnd(40, 90), vz: 0, life: rnd(.6, 1.2), age: 0, hue: .55, r: rnd(1, 2.2), drag: .5, g: 80 });
      if (u > 3.6 && u < 8 && Math.random() < .6) parts.push({ x: rnd(4180, 4900), y: 12, z: rnd(20, 50), vx: rnd(-10, 10), vy: rnd(20, 60), vz: 0, life: .8, age: 0, hue: .52, r: rnd(1, 2), drag: .5, g: 60 });
      pose(vanaras[0], { ph: 0, s: 0, t: Tr, cheer: sstep(10, 10.6, u) * (1 - sstep(11.6, 12.2, u)) });
    }
    if (id === 'aditya') {   // the sage Agastya teaches Ram the hymn to the Sun (Yuddha Kanda 105)
      const ds = 1 - ease(sstep(0, 1.6, u));
      indraCh.position.y = 10 + 190 * ds; ram.root.position.y = 26 + 190 * ds; matali.root.position.y = 26 + 190 * ds;
      act(agastya, rx + 100, 0, 14, L, pop(1.6, 10.8, u, .92), { talk: u > 2.6 && u < 6.4, point: sstep(3, 3.6, u) * (1 - sstep(5.6, 6.2, u)) });
      once('nad_a', u >= 1.6, () => { flashV = .6; burst(rx + 100, 100, 14, .12, 70, 80); });
      const sr = ease(sstep(2.4, 8, u)), sf = 1 - sstep(10.6, 12, u); sun.visible = sf > .02 && u > 2.4; sun.position.set(rx + 280, lerp(-30, 150, sr), -520); sun.scale.setScalar((.7 + .4 * sr) * sf + .01); sun.rotation.z = Tr * .05; redMoon.visible = !sun.visible;
      godRay(0, rx, 26, sstep(6, 7, u) * (1 - sstep(10.4, 11.6, u)), 0xffd890);
      const dg = sstep(7, 9, u) * (1 - sstep(10.4, 11.6, u)); divGlow.visible = dg > .02; divGlow.position.set(rx, 120, 0); divGlow.scale.set(60 * dg + .01, 100 * dg + .01, 20); divGlow.material.opacity = .2 * dg;
      base.ram.join = sstep(6, 6.8, u) * (1 - sstep(10, 10.8, u)); base.ram.talk = u > 6.6 && u < 10; base.ram.look = .1;
      once('nad_b', u >= 8.6, () => { flashV = .7; burst(rx, 130, 10, .12, 110, 100); });
    }
    if (id === 'heaven') {   // Dasharatha appears from heaven; Ram asks him to forgive Kaikeyi and Bharata (Yuddha Kanda 119–120)
      const dy = 270 - 200 * ease(sstep(.3, 3, u)) + 220 * ease(sstep(9.8, 11.8, u)), cx = 5240;
      indraCh.visible = true; indraCh.position.set(cx, dy, -46); indraCh.scale.setScalar(1); indraCh.userData.wheels.forEach(w => { w.rotation.z = Tr * 2; });
      showAt(dash2, cx, dy + 16, 4, L, 1); dash2.root.rotation.z = 0; pose(dash2, { ph: 0, s: 0, t: Tr, talk: u > 3.4 && u < 6.2, point: sstep(4, 4.6, u) * (1 - sstep(5.6, 6.2, u)), join: sstep(8.6, 9.2, u) * (1 - sstep(10, 10.6, u)), look: .1 });
      divGlow.visible = true; divGlow.position.set(cx, dy + 100, -10); divGlow.scale.set(80, 120, 20); divGlow.material.opacity = .2 * (1 - sstep(10.4, 11.8, u));
      godRay(0, cx, dy, sstep(.3, 1.2, u) * (1 - sstep(10.6, 11.8, u)), 0xfff0c8);
      base.ram.kneel = sstep(3, 3.8, u) * (1 - sstep(6.2, 6.8, u)); base.ram.join = sstep(3, 3.8, u) * (1 - sstep(10, 10.6, u)); base.ram.talk = u > 6.6 && u < 8.6;
      base.lak.kneel = base.ram.kneel; base.lak.join = base.ram.join; base.sita.join = base.ram.join;
      vanaras.forEach((v, i) => { pose(v, { ph: 0, s: 0, t: Tr + i, cheer: sstep(10.4 + i * .1, 11 + i * .1, u) }); });
      once('nh_a', u >= .6, () => { flashV = .8; burst(cx, 220, 0, .12, 120, 120); });
      once('nh_b', u >= 10.6, () => { flashV = .6; for (const v of vanaras) burst(v.root.position.x, 60, 10, .3, 30, 50); });
    }
    if (id === 'bharatmeet') {   // Bharata returns the sandals (Yuddha Kanda 127)
      const bx = u < 3.2 ? wk(1000, rx + 72, .2, 3.2) : rx + 72, kn = sstep(3.2, 3.9, u) * (1 - sstep(6.6, 7.4, u));
      act(bharat, bx, 0, 8, L, pop(.1, 99, u, 1), { s: spd(.2, 3.2, .7), kneel: kn, sad: u < 7 ? .4 : 0, talk: u > 4 && u < 6.2, join: sstep(7.4, 8, u) * (1 - sstep(9, 9.6, u)) });
      const sp = ease(sstep(4.2, 5.6, u)); sandals.visible = u < 11.6;
      sandals.position.set(u < 4.2 ? bx : lerp(bx - 10, rx + 10, sp), u < 4.2 ? 178 - 34 * kn : lerp(150, 4, sp) + Math.sin(sp * Math.PI) * 14, 14); sandals.rotation.y = u < 4.2 ? 0 : sp * 3; sandals.scale.setScalar(1 - sstep(11, 11.6, u) * .95);
      base.ram.point = sstep(6.2, 6.8, u) * (1 - sstep(8.2, 8.8, u)); base.ram.talk = u > 6.4 && u < 7.6;
      [[kausalya, 150], [sumitra, 205], [kaik, 260]].forEach(([h, dx], i) => { const a = 6.4 + i * .3, x = lerp(1050 + i * 40, rx + dx, ease(sstep(a, a + 2.6, u))); act(h, x, 0, 4 - i * 2, L, pop(a - .2, 99, u, 1), { s: spd(a, a + 2.6, .7), join: sstep(9.4, 10, u), sad: h === kaik ? .8 : 0 }); });
      base.ram.kneel = sstep(9.4, 10, u) * (1 - sstep(11, 11.6, u)); base.ram.join = base.ram.kneel;
      { const sp2 = ease(sstep(.2, 1.6, u)) * (1 - ease(sstep(10.6, 11.9, u))); sita.root.position.x -= 70 * sp2; lak.root.position.x -= 105 * sp2; han.root.position.x -= 125 * sp2; }
      once('nbm_a', u >= 5.6, () => { flashV = .6; burst(rx + 10, 20, 14, .12, 70, 70); });
      once('nbm_b', u >= 7.4, () => { petalRain(rx - 200, rx + 300, 40, 260); });
    }
    if (id === 'ravanborn') {   // Ravan is born with ten heads, and grows up to be king of golden Lanka (Valmiki, Uttara Kanda 9)
      const born = ease(sstep(.3, 1.3, u)), grow = ease(sstep(3.6, 8, u)), sc = 1.15 * (.32 + .68 * grow) * (.2 + .8 * born);
      rav.root.visible = true; rav.root.position.set(5560, 0, -10); rav.root.scale.setScalar(sc); rav.root.rotation.set(0, -.35, 0);
      pose(rav, { ph: 0, s: 0, t: Tr, cheer: sstep(8.6, 9.2, u) * (1 - sstep(10.4, 11, u)), talk: u > 9.4 && u < 11 });
      const baby = 1 - grow; rav.heads.forEach((h, i) => { h.rotation.y = Math.sin(Tr * (1.1 + 1.6 * baby) + i) * (.18 + .2 * baby); });   // the baby's ten heads look around
      once('rb0', u >= .3, () => { flashV = .6; burst(5560, 60, 0, .1, 110, 90); });
      if (u > 3.6 && u < 8) for (let k = 0; k < 2; k++) ember(5560 + rnd(-40, 40), rnd(10, 40 + 200 * grow), 0, false);
      once('rb1', u >= 8.6, () => { flashV = .4; burst(5560, 220, 0, .12, 90, 110); });
    }
    if (id === 'ravan_boon') {   // Ravan offers his heads to the fire; Brahma restores them (Valmiki, Uttara Kanda)
      fire(400, .2, 12.8, 1.5);
      const rs = 1.1 * (.2 + .8 * ease(sstep(.2, 1.4, u)));
      rav.root.visible = true; rav.root.position.set(540, 0, -4); rav.root.scale.set(rs, rs, rs); rav.root.rotation.set(0, -.55, 0);
      pose(rav, { ph: 0, s: 0, t: Tr, kneel: sstep(.8, 1.8, u) * (1 - sstep(9.8, 10.8, u)), join: sstep(1.4, 2.2, u) * (1 - sstep(9.6, 10.4, u)), sad: .3, talk: u > 11.2 && u < 12.6 });
      for (let k = 1; k < 10; k++) { const tc = 2.2 + (k - 1) * .85; cutPart(rav.heads[k], tc, 10.2, u, 0); once('nb' + k, u >= tc, () => { rav.root.updateMatrixWorld(true); rav.heads[k].getWorldPosition(wp); burst(wp.x, wp.y, wp.z + 10, .12, 26, 50); }); }
      act(brahma, 300, 0, 0, R, pop(9.2, 14.2, u, 1.05), { point: sstep(10.6, 11.4, u) * (1 - sstep(12.6, 13.2, u)), talk: u > 10 && u < 12.8 });
      once('nb_a', u >= 9.2, () => { flashV = 1; burst(300, 120, 0, .13, 140, 140); });
      once('nb_b', u >= 10.2, () => { flashV = .9; burst(540, 130, 8, .12, 130, 120); });
    }
    if (id === 'gods') {   // the gods plead; Vishnu promises to be born as a man
      rav.root.visible = true; { const s = .62 * (.2 + .8 * ease(sstep(.2, 1.3, u))); rav.root.position.set(790, 0, -10); rav.root.scale.set(s, s, s); rav.root.rotation.set(0, -.8, 0); pose(rav, { ph: 0, s: 0, t: Tr, angry: 1, talk: u < 3 }); rav.heads.forEach((h, i) => { h.rotation.y = Math.sin(Tr * 1.1 + i) * .18; }); }
      if (u > .4 && u < 11) { if (Math.random() < .6) flame(790 + rnd(-40, 40), 6, 6, 1.4); if (Math.random() < .25) ember(790 + rnd(-30, 30), rnd(20, 120), 0, true); }
      act(agni, 330, 0, -4, R, pop(.2, 11.8, u, 1.3), { kneel: sstep(1.4, 2.2, u), join: sstep(1.6, 2.4, u), sad: 1 });
      act(brahma, 410, 0, 2, R, pop(.2, 11.8, u, 1.05), { kneel: sstep(1.4, 2.2, u) * (1 - sstep(6.6, 7.4, u)), join: sstep(1.6, 2.4, u) * (1 - sstep(6.6, 7.4, u)), sad: 1, talk: u > 2.4 && u < 5.4 });
      act(vishnu, 590, 0, 0, L, pop(2.6, 11.8, u, 1.1), { talk: u > 4.8 && u < 9, point: sstep(9, 9.8, u) * (1 - sstep(10.6, 11.2, u)), look: .1 });
      once('ng_a', u >= 2.6, () => { flashV = 1; burst(590, 120, 0, .58, 150, 140); burst(590, 120, 0, .12, 80, 100); });
      const o = birthOrbs[0], a = sstep(9.4, 10, u) * (1 - sstep(11.2, 11.8, u)); o.visible = a > .02; const op = ease(clamp((u - 9.4) / 2)); o.position.set(lerp(560, 330, op), lerp(120, 210, op) + Math.sin(op * 6) * 8, 12); o.scale.setScalar(9 * a + .01);
    }
    if (id === 'curse') {   // young Dasharatha and Shravana (Ayodhya Kanda, 63)
      river.visible = true; river.position.set(560, 2, 12); river.scale.set(120, 4, 14); river.material.opacity = .2 + .06 * Math.sin(Tr * 3);
      const yx = u < 5.4 ? wk(180, 330, .2, 1.8) : u < 9 ? wk(330, 520, 5.4, 7.4) : wk(520, 690, 9, 11), ws = spd(.2, 1.8) || spd(5.4, 7.4) || spd(9, 11);
      const aim = sstep(1.8, 3, u) * (1 - sstep(4.4, 5, u)), draw = sstep(2.2, 3.3, u) * (u < 3.4 ? 1 : 0);
      const sk = sstep(10.4, 11.2, u);
      act(youngd, yx, 0, 4, R, pop(.1, 99, u, 1), { s: ws, aim: aim > 0 ? aim : undefined, draw, kneel: Math.max(sstep(7.4, 8.2, u) * (1 - sstep(8.8, 9.4, u)) * .8, sk), join: sk, sad: u > 4.4 ? 1 : 0, talk: u > 7.6 && u < 8.8 });
      if (aim > .02) aimBow(bowL, youngd, draw, 1.3);
      const fall = sstep(4.2, 5, u);
      act(shravan, 560, 10 * fall, 6, L, pop(.2, 13.6, u, .8), { kneel: .65 * (1 - fall), talk: u > 5.2 && u < 7.4, sad: fall }); shravan.root.rotation.z = -1.4 * fall;
      pot.visible = true; if (u < 4.2) pot.position.set(542, 14, 10); else if (u < 9) pot.position.set(536, 8, 10); else pot.position.set(yx + 32, 66, 10);
      act(blindA, 745, 0, 4, L, pop(6.4, 14.2, u, .95), { look: .15, sad: 1, angry: sstep(10.4, 11, u), talk: u > 9.8 && u < 12.6, point: sstep(10.6, 11.4, u) * (1 - sstep(12.6, 13.2, u)) });
      act(blindB, 800, 0, 2, L, pop(6.4, 14.2, u, .95), { look: -.1, sad: 1, talk: u > 11 && u < 12.6 });
      once('nc_a', u >= 3.4, () => { burst(392, 110, 8, .12, 20, 50); });
      once('nc_b', u >= 4.2, () => { flashV = .6; burst(556, 60, 8, .12, 60, 80); });
      once('nc_c', u >= 10.6, () => { flashV = .7; burst(745, 100, 8, .6, 60, 70); });
      if (u > 4.2 && u < 8.8) for (let q = 0; q < 1; q++) parts.push({ x: 560 + rnd(-8, 8), y: 20, z: 10, vx: rnd(-8, 8), vy: rnd(20, 40), vz: 0, life: rnd(1, 1.6), age: 0, hue: .6, r: 1.6, drag: .6, g: -10 });
    }
    if (id === 'kboon') {   // Kaikeyi saves the wounded king; two boons
      const cx = u < 1.6 ? 330 : wk(330, 640, 1.6, 6.6), mv = spd(1.6, 6.6, 1) ? 1 : 0;
      chariot.visible = true; chariot.position.set(cx, 10, -46); chariot.scale.setScalar(1); chariot.userData.mat.color.setHex(0xe8b830); chariot.userData.mat.emissive.setHex(0x6a4a00); chariot.userData.wheels.forEach(w => { w.rotation.z = -cx * .09; });
      if (mv && Math.random() < .5) ember(cx - 50, 14, 0, true);
      act(dash2, cx - 24, 26, 4, R, pop(.2, 11.8, u, 1), { kneel: .55 * (1 - sstep(7.4, 8.4, u)), sad: 1 - sstep(7.4, 8.4, u), join: sstep(8.2, 9, u), talk: u > 8 && u < 9.6 }); dash2.root.rotation.z = -.3 * (1 - sstep(6.6, 7.8, u));
      act(kaik, cx + 22, 26, 12, R, pop(.2, 11.8, u, 1), { point: sstep(1.4, 2, u), talk: u > 9.4 && u < 10.8, look: .1 });
      const ks = 1.7 * (.2 + .8 * ease(sstep(0, 1.1, u))) * (1 - sstep(3.4, 4.4, u) * .97);
      if (u < 4.4) { act(kum, 190, 0, 0, R, ks, { cheer: .5, angry: 1 }); if (u < 3.2 && Math.random() < .5) ember(215, rnd(60, 160), 0, true); if (u < 3.2 && Math.random() < .3) flame(250 + rnd(0, 40), rnd(60, 130), 8, 1); }
      once('nk_a', u >= 1.5, () => { flashV = .6; burst(300, 100, 8, .12, 60, 90); });
      birthOrbs.slice(0, 2).forEach((o, i) => { const a = sstep(9.8 + i * .5, 10.6 + i * .5, u) * (1 - sstep(11.2, 11.9, u)); o.visible = a > .02; o.position.set(cx + 22 + (i ? 30 : 4), 100 + 36 * ease(sstep(9.8, 11.4, u)) + Math.sin(Tr * 4 + i) * 3, 12); o.scale.setScalar(7 * a + .01); });
    }
    if (id === 'yajna') {   // Dasharatha's putrakameshti (Bala Kanda 14–16)
      fire(340, .2, 15, 1.7);
      const turnR = ease(sstep(9.4, 10.2, u));
      act(rishya, 245, 0, 4, R, pop(.2, 15.8, u, 1), { cheer: .6 * sstep(.8, 1.8, u) * (1 - sstep(9, 10, u)), talk: u > 1 && u < 9 });
      act(dash2, 440, 0, 6, lerp(L, R, turnR), pop(.2, 15.8, u, 1), { join: sstep(.6, 1.4, u) * (1 - sstep(8.4, 9.2, u)), talk: u > 12 && u < 14 });
      [[kausalya, 545], [sumitra, 612], [kaik, 680]].forEach(([h, qx], i) => { const a = 2 + i * .5, x = qx + 260 * (1 - ease(sstep(a, a + 2.6, u))); act(h, x, 0, 6 - i, L, pop(a - 1.6, 15.8, u, 1), { s: spd(a, a + 2.6), join: sstep(a + 2.8, a + 3.6, u) * (1 - sstep(9.4 + i, 10.2 + i, u)) }); });
      const dv = pop(5, 9.8, u, 1.5); act(agni, 340, 36 * (1 - ease(sstep(5, 6.4, u))), -6, R, dv, { cheer: .0, look: .2, point: sstep(6.4, 7.2, u) * (1 - sstep(8.2, 8.8, u)) });
      if (u > 5 && u < 9) flame(340 + rnd(-10, 10), rnd(10, 100), -6, .8);
      once('ny_a', u >= 5, () => { flashV = 1; burst(340, 120, 4, .13, 130, 140); });
      const WP = [[5.8, 352, 110], [8.2, 352, 110], [9.8, 436, 96], [10.4, 436, 96], [11.4, 527, 90], [11.9, 527, 90], [12.9, 594, 88], [13.2, 594, 88], [14.2, 662, 88]], vis = u > 5.8 && u < 14.8;
      let bx = 352, by = 110; for (let i = 0; i < WP.length - 1; i++) if (u >= WP[i][0] && u < WP[i + 1][0]) { const p = ease((u - WP[i][0]) / (WP[i + 1][0] - WP[i][0])); bx = lerp(WP[i][1], WP[i + 1][1], p); by = lerp(WP[i][2], WP[i + 1][2], p) + 8 * Math.sin(p * Math.PI) * (WP[i][1] !== WP[i + 1][1] ? 1 : 0); } if (u >= WP[WP.length - 1][0]) { bx = 662; by = 88; }
      bowl.visible = vis; bowl.position.set(bx, by + Math.sin(Tr * 3) * 1.5, 12); bowl.scale.setScalar(1.15); babyLight.position.set(bx, by + 20, 40); babyLight.intensity = vis ? 1.3 : 0;
      [[10.9, 545, 0], [12.4, 612, 1], [13.7, 680, 2]].forEach(([t, x, i]) => { once('ny_b' + i, u >= t, () => { flashV = .6; burst(x, 90, 8, .12, 50, 70); }); const o = birthOrbs[i], a = sstep(t, t + .8, u) * (1 - sstep(15.2, 15.9, u)); o.visible = a > .02; o.position.set(x + 4, 62 + 8 * Math.sin(Tr * 3 + i), 16); o.scale.setScalar(5 * a + .01); });
    }
    if (id === 'court') {   // Vishwamitra asks for Ram (Bala Kanda 18–20)
      const sx = wk(760, 320, .3, 3.4), st = spd(.3, 3.4);
      act(dash2, 215, 0, 6, R, 1, { talk: u > 4.4 && u < 6.4, sad: sstep(4.6, 5.4, u) * (1 - sstep(9, 10, u)), join: sstep(10, 10.8, u) });
      act(vasishtha, 150, 0, 4, R, pop(.2, 13.8, u, 1), { talk: u > 7 && u < 10, point: sstep(7.4, 8.2, u) * (1 - sstep(9.4, 10, u)) });
      act(sage, sx, 0, 4, u < 4.2 || u > 6.6 ? L : R, pop(.1, 13.8, u, 1), { s: st, talk: u > 3.6 && u < 6.6, point: sstep(4.6, 5.4, u) * (1 - sstep(6.4, 7, u)), cheer: sstep(11, 11.8, u) * (1 - sstep(13, 13.8, u)) * .5 });
      ram.root.rotation.y = lerp(R, L, ease(sstep(9.2, 10, u))) + (u > 12.4 ? (R - L) * ease(sstep(12.4, 13.2, u)) : 0); lak.root.rotation.y = ram.root.rotation.y;
      base.ram.kneel = sstep(10.4, 11.2, u) * (1 - sstep(12, 12.8, u)); base.ram.join = base.ram.kneel; base.lak.kneel = base.ram.kneel; base.lak.join = base.ram.kneel;
      once('nco_a', u >= 11.2, () => { flashV = .5; burst(300, 120, 8, .12, 50, 60); petalRain(150, 600, 20, 240); });
    }
    if (id === 'siddha') {   // Siddhashrama: Ram guards the sage's ritual (Bala Kanda 29–30)
      fire(1070, .2, 11.4, 1.7);
      act(sage, 1010, 0, 4, R, 1, { cheer: .3 * sstep(.6, 1.4, u) * (1 - sstep(10.6, 11.4, u)), talk: u < 10.6 });
      if (u > .6 && u < 8.2 && Math.random() < .5) parts.push({ x: rnd(1100, 1300), y: 280, z: rnd(0, 20), vx: rnd(-6, 6), vy: -rnd(60, 110), vz: 0, life: 1.8, age: 0, hue: .78, r: 2.2, drag: .9, g: 20 });   // the demons' dark magic falls from the sky as purple sparks
      { const sub = u < 5.2; if (u > 1.4 && u < 6) { const f = sstep(1.4, 2.6, u), fl = sstep(4.6, 5.8, u); act(kum, lerp(1320, 1190, ease(sstep(1.4, 3, u))) + 60 * fl, lerp(200, 105, f) * (1 - fl) + 8 * fl, -4, L, 1.35 * (1 - .6 * sstep(5.2, 6, u)), { fly: 1 - fl, angry: 1, cheer: 0 }); kum.root.rotation.z = -1.5 * fl; if (u > 5.2) ember(1250, rnd(10, 60), 0, true); } }
      if (u > 2.2 && u < 9.6) { const f = sstep(2.2, 3.4, u), th = sstep(7.8, 8.4, u); const mx = u < 7.7 ? lerp(1360, 1150, ease(sstep(2.2, 4, u))) : 1150 + 600 * ease(sstep(7.7, 9.4, u)), my = u < 7.7 ? lerp(210, 120, f) : 120 + 120 * ease(sstep(7.7, 9.4, u)); act(marich, mx, my, -2, L, 1.1, { fly: 1, angry: 1 }); marich.root.rotation.z = th * u * 3; if (u > 7.7 && Math.random() < .8) ember(mx, my, 0, true); }
      once('ns_a', u >= 5.2, () => { flashV = .8; burst(1230, 110, 0, .12, 110, 130); });
      once('ns_b', u >= 7.9, () => { flashV = .8; burst(1150, 160, 0, .55, 100, 110); });
      once('ns_c', u >= 11.4, () => { flashV = .6; burst(1070, 130, 0, .13, 90, 90); petalRain(900, 1300, 25, 250); });
      base.ram.look = .2;
    }
    if (id === 'sitaearth') {   // long before: Janaka finds baby Sita in a furrow while ploughing (Bala Kanda 66)
      ram.root.visible = lak.root.visible = sage.root.visible = false;   // a memory of long ago
      const jx = u < 4 ? lerp(1480, 1620, sstep(.3, 4, u)) : 1620, kn = sstep(5.6, 6.4, u) * (1 - sstep(7.4, 8, u));
      act(janaka, jx, 0, 8, R, pop(.1, 99, u, 1), { s: spd(.3, 4, .6), kneel: kn, join: kn, cheer: sstep(9, 9.6, u) * (1 - sstep(11.4, 12, u)), talk: u > 9.6 && u < 11.4 });
      court.visible = false;   // an open field
      plough.visible = u < 5.4; plough.position.set(jx + 30, 36, 14); furrow.visible = true; furrow.position.x = (1470 + jx + 50) / 2; furrow.scale.x = Math.max(1, jx + 50 - 1470);
      if (u > .3 && u < 4 && Math.random() < .6) parts.push({ x: jx + 6 + rnd(-6, 6), y: 2, z: 14, vx: rnd(-20, 0), vy: rnd(8, 22), vz: 0, life: .9, age: 0, hue: .08, r: rnd(1, 1.8), drag: .3, g: 20 });   // the furrow
      const gl = sstep(3.6, 4.4, u) * (1 - sstep(8, 9, u)); divGlow.visible = gl > .02; divGlow.position.set(1668, 20, 10); divGlow.scale.set(40 * gl + .01, 60 * gl + .01, 20); divGlow.material.opacity = .3 * gl;
      once('se0', u >= 4, () => { flashV = .5; burst(1668, 10, 10, .11, 90, 80); });
      const up = ease(sstep(4.2, 5.6, u)), lift = ease(sstep(7.6, 9, u));   // the baby rises from the earth, and Janaka lifts her up
      if (u > 4.2) { sita.root.visible = true; sita.root.scale.setScalar(.34); base.sitaOverride = { x: lerp(1668, jx + 14, lift), y: lerp(-40, 0, up) + 52 * lift, face: 0, ph: 0, s: 0, join: 0, look: 0 }; }
      if (u > 4 && u < 9 && Math.random() < .6) ember(1668 + rnd(-14, 14), rnd(4, 50), 10, false);
      once('se1', u >= 9.2, () => petalRain(1450, 1800, 30, 240));
    }
    if (id === 'bowstory') {   // Shiva's bow, on its cart with eight wheels (Bala Kanda 66–67)
      const cx = lerp(1900, 1700, ease(sstep(.5, 4.5, u)));
      pedestal.visible = bigBow.visible = true; pedestal.position.x = cx; bigBow.position.set(cx, 40, 4); bigBow.rotation.set(0, 0, Math.PI / 2);
      pedestal.userData.wheels.forEach(w => { w.rotation.z = -(cx - 1700) / 7; });
      if (u > .5 && u < 4.5 && Math.random() < .8) parts.push({ x: cx + rnd(-36, 36), y: 2, z: rnd(0, 20), vx: rnd(10, 40), vy: rnd(6, 20), vz: 0, life: rnd(.6, 1.1), age: 0, hue: .08, r: rnd(1.2, 2.2), drag: .3, g: 20 });   // heavy: dust under the wheels
      const sh = sstep(5, 6, u) * (1 - sstep(11.4, 12.4, u)); memGlow.visible = sh > .02; memGlow.position.set(cx, 52, 0); memGlow.scale.set(100 * sh + .01, 40 * sh + .01, 10); memGlow.material.opacity = .2 * sh;   // the glow of Shiva's bow
      if (sh > .2 && Math.random() < .5) ember(cx + rnd(-70, 70), rnd(40, 70), 6, false);
      const turn = sstep(5, 5.4, u) * (1 - sstep(8.4, 8.8, u));
      act(janaka, 1590, 0, 8, turn > .5 ? R : L, pop(.1, 99, u, 1), { talk: (u > .6 && u < 4.8) || (u > 8.8 && u < 11.6), point: sstep(5.4, 5.9, u) * (1 - sstep(8, 8.4, u)) });
      base.ram.look = .25 * sh; base.lak.look = .25 * sh;
      once('bs0', u >= 5, () => { flashV = .3; burst(cx, 60, 6, .58, 70, 70); });
    }
    if (id === 'vivah') {   // the four weddings in Mithila (Bala Kanda 72–73)
      const at = (t) => ease(sstep(t, t + .8, u)), named = (t) => sstep(t, t + .6, u) * (1 - sstep(t + 2.6, t + 3.4, u)), turnIn = .35;
      ram.root.position.x = 1515; ram.root.rotation.y = turnIn; Object.assign(base.ram, { ph: 1515 * Math.PI / STEP, join: named(2.1) });
      base.sitaOverride = { x: 1560, y: 0, face: -turnIn, ph: 1560 * Math.PI / STEP + 1.4, s: 0, join: named(2.1), look: 0 };
      lak.root.position.x = 1625; lak.root.rotation.y = turnIn; Object.assign(base.lak, { ph: 1625 * Math.PI / STEP + 2.6, join: named(3.6) });
      act(urmila, 1670, 0, 22, -turnIn, 1 * at(.2) + .001, { join: named(3.6) });
      act(bharat, 1735, 0, 2, turnIn, at(.2) + .001, { join: named(6) });
      act(mandavi, 1780, 0, 22, -turnIn, at(.2) + .001, { join: named(6) });
      act(shatru, 1845, 0, 2, turnIn, at(.2) + .001, { join: named(7.2) });
      act(shruta, 1890, 0, 22, -turnIn, at(.2) + .001, { join: named(7.2) });
      act(dash, 1440, 0, 4, R, at(.2) + .001, { cheer: .6 * sstep(10.4, 11, u) });   // the grooms' father
      act(janaka, 1960, 0, 4, L, at(.2) + .001, { point: named(5.4) * .8, cheer: .6 * sstep(10.4, 11, u) });   // the fathers of the brides
      act(kusha, 2020, 0, 4, L, at(.2) + .001, { point: named(9.4) * .8, cheer: .6 * sstep(10.4, 11, u) });
      if (u < 13.4) for (let q = 0; q < 2; q++) flame(1702 + rnd(-6, 6), 2, 46, .9);   // the sacred wedding fire
      for (const [t, x] of [[2.1, 1538], [3.6, 1648], [6, 1758], [7.2, 1868]]) once('vv' + t, u >= t, () => { flashV = .2; burst(x, 130, 14, .11, 50, 60); });
      once('vv_end', u >= 10.4, () => { flashV = .4; petalRain(1400, 2060, 60, 280); });
    }
    if (id === 'parashu') {   // Parashurama challenges Ram with Vishnu's bow (Bala Kanda 74–76)
      const px = wk(2250, 1860, .3, 3.2), humble = sstep(9.8, 10.8, u);
      act(parashu, px, 0, 4, L, pop(.1, 11.8, u, 1.05), { s: spd(.3, 3.2), angry: 1 - humble, sad: humble, talk: u > 3.4 && u < 6.4, point: sstep(3.8, 4.6, u) * (1 - sstep(5.8, 6.4, u)), kneel: humble * .6, join: humble });
      if (u < 6.2) aimBow(bowL, parashu, 0, 1.6);
      once('np_a', u >= 6.2, () => { flashV = .8; burst(1700, 120, 8, .12, 90, 100); });
      once('np_b', u >= 9.3, () => { flashV = 1; burst(1960, 250, 0, .13, 140, 150); });
      base.ram.look = -.0; base.ram.talk = u > 6.4 && u < 7;
    }
    if (id === 'crown') {   // Ram shatters Ravan's crown and shows mercy (Yuddha Kanda 59)
      const cr = rav.heads[0].userData.crownParts; if (cr) cr.forEach(m => { m.visible = u < 5.4; });
      const rx2 = 5560 + 100 * ease(sstep(9.4, 11.8, u)), flip = ease(sstep(8.6, 9.6, u));
      rav.root.visible = true; rav.root.position.set(rx2 + (u > 5.4 && u < 6.4 ? Math.sin(u * 40) * 2 : 0), 0, -10); rav.root.scale.set(1.1, 1.1, 1.1); rav.root.rotation.y = lerp(-(YAW - .1), YAW - .1, flip);
      pose(rav, { ph: 0, s: flip * 0, t: Tr, angry: 1 - sstep(5.4, 6, u), sad: sstep(5.6, 6.4, u), talk: u < 2 }); rav.heads.forEach((h, i) => { h.rotation.y = Math.sin(Tr * 1.1 + i) * .18 + (u > 5.4 ? .25 * sstep(5.4, 6.4, u) : 0); });
      once('ncr_a', u >= 5.4, () => { flashV = 1; burst(5530, 220, 14, .12, 150, 150); for (let q = 0; q < 24; q++) parts.push({ x: 5530 + rnd(-14, 14), y: 215 + rnd(-8, 8), z: 14, vx: rnd(-90, 90), vy: rnd(10, 90), vz: rnd(-10, 10), life: rnd(1, 1.8), age: 0, hue: .12, r: rnd(1.5, 3), drag: .5, g: 80 }); });
      if (u < 4.4 && Math.random() < .5) flame(5560 + rnd(-40, 40), rnd(10, 100), -8, 1.4);
      base.ram.talk = u > 6.6 && u < 9.2; base.ram.look = .1;
    }
    if (id === 'wake') {   // Kumbhakarna is woken and goes out to fight (Yuddha Kanda 61–62)
      const sl = 1 - ease(sstep(5.4, 7.4, u));
      act(kum, 5320 - 90 * sl, 14 * sl, -10, R - .1, 1.9, { talk: u > 10 && u < 13, sad: u > 10 ? .5 : 0 }); kum.root.rotation.z = -1.5 * sl;
      const ey = kum.head.userData.eyes; if (ey) ey.forEach(e => { e.scale.y = e.userData.by * lerp(1, .06, 1 - sstep(5.6, 6.6, u)); });
      if (u < 5.4 && Math.random() < .05) parts.push({ x: 5370, y: 40, z: 10, vx: 6, vy: 20, vz: 0, life: 1.8, age: 0, hue: .58, r: 2.4, drag: .9, g: -4 });
      act(tataka, 5200, 0, 8, R, pop(.6, 12.2, u, 1.3), { cheer: .7 * sstep(1, 1.6, u) * (1 - sstep(5.2, 6, u)), angry: 1, talk: u > 1 && u < 5.4 });
      act(surp, 5445, 0, 8, L, pop(.6, 12.2, u, 1.1), { cheer: .7 * sstep(1.2, 1.8, u) * (1 - sstep(5.2, 6, u)), angry: 1, talk: u > 1 && u < 5.4 });
      for (let k = 0; k < 5; k++) once('nw' + k, u >= 1.2 + k * 1.0, () => { flashV = .3; burst(5320, 40, 20, .09, 26, 90); });
      feast.visible = u > 7.6 && u < 10; feast.position.set(5320 + 74, 104 + Math.sin(Tr * 6) * 3, 14); feast.scale.setScalar(1.3 * sstep(7.6, 8.2, u) * (1 - sstep(9.4, 10, u)) + .01);
      once('nw_a', u >= 6.4, () => { flashV = .7; burst(5320, 130, 0, .06, 70, 90); });
      base.hold = false;
    }
    if (id === 'niku') {   // Lakshman kills Indrajit at his fire ritual (Yuddha Kanda 85–90)
      const lx2 = 5110, dead = sstep(9, 10, u);
      fireGlow.visible = u < 9.4; fireGlow.position.set(5420, 60, 0); fireGlow.material.opacity = .22 * sstep(0, 1, u) * (1 - sstep(8.8, 9.4, u));
      if (u < 9) { for (let q = 0; q < 2; q++) flame(5420 + rnd(-30, 30), 4, rnd(-6, 20), 1.8); }
      const rise = ease(sstep(5.4, 7, u));
      act(indra, 5470, 10 * dead, 0, L, pop(.1, 13.2, u, 1.1), { kneel: (1 - rise) * .85 * (1 - dead), join: (1 - rise) * (1 - dead), angry: rise, talk: u > 7 && u < 8.4, sad: dead }); indra.root.rotation.z = -1.5 * dead;
      act(vibh, 4985, 0, 4, R, pop(2, 13.2, u, 1), { point: sstep(2.4, 3.2, u) * (1 - sstep(5, 5.8, u)), talk: u > 2.4 && u < 5, cheer: sstep(10.6, 11.4, u) * (1 - sstep(12.6, 13.2, u)) });
      base.lak.aim = sstep(5, 6.2, u) * (1 - sstep(9.8, 10.4, u)); base.lak.draw = sstep(6, 8, u) * (u < 8.2 ? 1 : 0); base.lak.bow = true; base.lak.angry = 1; base.lak.talk = u > 4.2 && u < 5.2;
      base.lak.cheer = sstep(10.8, 11.6, u) * (1 - sstep(13, 13.8, u));
      once('nn_a', u >= 9, () => { flashV = 1; burst(5430, 120, 8, .12, 150, 150); for (let q = 0; q < 20; q++) ember(5430 + rnd(-30, 30), rnd(20, 100), 0, true); });
      if (u > 9.6 && u < 12.6) ember(5470 + rnd(-14, 14), rnd(10, 70), 0, true);
    }
    if (id === 'headcut') {   // the duel: heads and arms cut off, and grow again (Yuddha Kanda 102–108)
      const ds = 0;
      indraCh.visible = true; indraCh.position.set(rx - 6, 10 + 190 * ds, -46); indraCh.scale.setScalar(1); indraCh.userData.wheels.forEach(w => { w.rotation.z = Tr * 3; });
      ram.root.position.y = 26 + 190 * ds; matali.root.position.y = 26 + 190 * ds;
      matali.root.visible = true; pose(matali, { ph: 0, s: 0, t: Tr, point: .6, talk: u > 12.8 && u < 15.4 });
      rav.root.visible = true; rav.root.position.set(5560, 0, -10); rav.root.scale.set(1.1, 1.1, 1.1); rav.root.rotation.y = -(YAW - .1);
      const cuts = [[3.6, 5.8, [1, 2, 3], []], [6.0, 8.2, [4, 5], []], [8.6, 10.8, [6, 7, 8, 9], []], [11.2, 13.6, [0], []]];
      const lastCut = u > 3.6;
      pose(rav, { ph: 0, s: 0, t: Tr, angry: 1, talk: (u > 3.6 && u < 4.4) || (u > 6 && u < 6.8) || (u > 8.6 && u < 9.4) || (u > 11.2 && u < 12) });
      rav.heads.forEach((h, i) => { h.rotation.y = Math.sin(Tr * 1.1 + i) * .18; });
      rav.xarms.forEach((a, i) => { a.rotation.x = a.userData.rx - (Math.sin(Tr * 2.2 + i) * .5 + .5) * .4; });
      cuts.forEach(([tc, tr, hs, as]) => {
        hs.forEach(k => cutPart(rav.heads[k], tc, tr, u, 0));
        as.forEach(k => cutPart(rav.xarms[k], tc, tr, u, 0));
        once('nh_c' + tc, u >= tc, () => { flashV = .8; burst(5545, 190, 14, .12, 100, 130); for (let q = 0; q < 14; q++) ember(5530 + rnd(-50, 50), rnd(90, 230), 8, true); });
        once('nh_r' + tr, u >= tr, () => { flashV = .6; burst(5560, 150, 10, .12, 70, 90); });
      });
      const gl = sstep(14.2, 15.2, u) * (1 - sstep(17, 17.8, u)); astra.visible = gl > .02;
      if (astra.visible) { ram.root.updateMatrixWorld(true); const hh = ram.arms[0].userData.hand; hh.getWorldPosition(wp); astra.position.set(wp.x + 28, wp.y + 4, 14); astra.scale.setScalar(5 + 9 * gl + 2 * Math.sin(Tr * 12)); if (Math.random() < .8) ember(astra.position.x, astra.position.y, 12, false); }
      once('nh_d', u >= 14.2, () => { flashV = 1; burst(5120, 170, 14, .12, 90, 100); });
      base.ram.look = 0;
    }
    if (id === 'mando') {   // Ravan's funeral and Vibhishana's coronation (Yuddha Kanda 109–112)
      const fade = 1 - sstep(9.4, 12.2, u);
      rav.root.visible = fade > .02; rav.root.position.set(5560, 12, -10); rav.root.scale.set(1.1 * (.4 + .6 * fade), 1.1 * fade + .01, 1.1); rav.root.rotation.set(0, -(YAW - .1), -1.45); pose(rav, { ph: 0, s: 0, t: Tr, sad: 1 });
      if (u < 12.2) { if (Math.random() < .5) ember(5560 + rnd(-60, 60), rnd(5, 60), 0, true); if (u > 9.4 && Math.random() < .4) flame(5560 + rnd(-60, 60), rnd(5, 40), 0, 1.2); }
      const mx = wk(5800, 5660, .3, 3.6);
      base.sitaOverride = { x: 5870, y: 0, face: L, ph: 0, s: 0, join: 0, look: 0 };
      act(mandodari, mx, 0, 4, L, pop(.1, 13.8, u, 1), { s: spd(.3, 3.6, .7), kneel: sstep(3.8, 4.6, u) * .8, sad: 1, talk: u > 5 && u < 8.4, look: .15 });
      const vx = wk(5210, 5470, 2, 5);
      act(vibh, vx, 0, 4, R, pop(1.8, 13.8, u, 1), { s: spd(2, 5, .8), kneel: sstep(5.4, 6.2, u) * (1 - sstep(8.6, 9.4, u)) * .7, sad: 1 - sstep(10.6, 11.4, u), talk: u > 9.2 && u < 10.6, join: sstep(9.8, 10.8, u) * (1 - sstep(12, 12.6, u)) });
      base.ram.talk = u > 6.4 && u < 9; base.ram.look = .2; base.ram.point = sstep(8.8, 9.4, u) * (1 - sstep(10.4, 11, u));
      once('nm_a', u >= 10.8, () => { flashV = .7; burst(5470, 170, 0, .12, 110, 110); petalRain(5300, 5700, 30, 260); });
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
      once('v3a', u >= 6, () => { flashV = .5; burst(3250, 100, 0, .85, 80, 90); });
    }
    if (id === 'lanka1') {   // in golden Lanka, Surpanakha tells Ravan about Ram and Sita (Aranya Kanda 32–35)
      const sx = wk(5280, 5465, .2, 3), back = sstep(4.6, 5, u) * (1 - sstep(6.8, 7.2, u));   // she runs in, then turns to point back, toward the forest
      act(surp, sx, 0, 8, back > .5 ? L : R, pop(.2, 99, u, 1.1), { s: spd(.2, 3), talk: u > 3.2 && u < 7.8, angry: 1 - .7 * sstep(8.6, 9.4, u), point: sstep(5, 5.5, u) * (1 - sstep(6.6, 7, u)), cheer: .7 * sstep(10.2, 10.8, u) });
      if (u < 3 && Math.random() < .6) ember(sx - 20, 90, 8, true);
      const decide = sstep(9.4, 10, u);
      rav.root.visible = true; rav.root.position.set(5610, 0, -10); rav.root.scale.setScalar(1.15 * (1 + .1 * decide)); rav.root.rotation.y = L + .1;
      pose(rav, { ph: 0, s: 0, t: Tr, talk: u > 8 && u < 9.6, angry: decide, point: sstep(9.8, 10.3, u) * (1 - sstep(11.3, 11.8, u)) });
      rav.heads.forEach((h, i) => { h.rotation.y = lerp(Math.sin(Tr * 1.1 + i) * .18, -.5, sstep(5, 6, u)); });   // all ten heads turn to listen
      once('lk1', u >= 9.9, () => { flashV = .35; burst(5610, 230, 0, .78, 90, 100); });
    }
    if (id === 'maricha') {   // Ravan flies to Maricha's hermitage by the sea, and makes him become a golden deer (Aranya Kanda 35–42)
      mhut.visible = true; mhut.position.set(4110, 0, -60); mhut.scale.setScalar(.75);
      rav.heads.forEach((h, i) => { h.rotation.y = Math.sin(Tr * 1.1 + i) * .18; });
      const fly = ease(sstep(.2, 3.2, u)), go = ease(sstep(12, 14, u)), cx = u < 12 ? lerp(4730, 4360, fly) : lerp(4360, 3780, go), cy = u < 12 ? lerp(190, 10, fly) : lerp(10, 160, go);
      chariot.visible = true; chariot.position.set(cx, cy, -20); chariot.scale.setScalar(1); chariot.userData.mat.color.setHex(0x8a1a2a); chariot.userData.mat.emissive.setHex(0x400610); chariot.userData.wheels.forEach(w => { w.rotation.z = Tr * 4; });
      const onCh = u < 3.6 || u > 11.6, wx = u < 8 ? wk(4346, 4290, 3.6, 4.6) : wk(4290, 4346, 10.8, 11.6), big = sstep(7.8, 8.6, u) * (1 - sstep(10, 10.8, u));
      rav.root.visible = true; rav.root.position.set(onCh ? cx - 14 : wx, onCh ? cy + 18 : 0, -10); rav.root.scale.setScalar(1.1 * (1 + .2 * big)); rav.root.rotation.y = L + .1;
      pose(rav, { ph: wx * Math.PI / STEP, s: spd(3.6, 4.6, .7) || spd(10.8, 11.6, .7), t: Tr, talk: (u > 4.8 && u < 6.4) || (u > 8.2 && u < 9.4), point: sstep(5, 5.6, u) * (1 - sstep(6.2, 6.8, u)), angry: sstep(7.6, 8.2, u), cheer: sstep(10.4, 11, u) * (1 - sstep(11.6, 12.2, u)) });
      if (big > .1 && Math.random() < .7) ember(wx + rnd(-40, 40), rnd(60, 220), 0, true);
      const tf = sstep(9.6, 10.4, u);   // Maricha: praying, then afraid, then he changes into the deer
      if (u < 10.4) act(marich, 4190, 0, 6, R, 1.1 * (1 - .97 * tf) + .001, { kneel: 1 - sstep(4.6, 5.4, u), join: Math.max(1 - sstep(4.6, 5.4, u), sstep(6.4, 7, u) * (1 - sstep(9, 9.6, u))), talk: u > 6.4 && u < 7.8, sad: sstep(6, 6.6, u) });
      if (u > 9.4 && u < 10.8) for (let k = 0; k < 3; k++) ember(4190 + rnd(-24, 24), rnd(10, 110), 6, false);
      once('mr1', u >= 9.8, () => { flashV = .7; burst(4190, 70, 6, .12, 120, 110); });
      if (u > 9.8) {   // the golden deer, with silver spots, bounds off toward Ram's hut
        const run = sstep(11, 13.8, u), dx = lerp(4190, 3700, ease(run)), hop = u > 11 ? Math.abs(Math.sin(Tr * 4.2)) * 26 : 0;
        deer.visible = true; deer.position.set(dx, hop, -6); deer.rotation.y = -Math.PI / 2 + .25; deer.scale.setScalar(.95 * ease(sstep(9.8, 10.8, u)) + .01);
        deer.legs.forEach((l, i) => { l.rotation.x = u > 11 ? Math.sin(Tr * 8.4 + (i % 2) * 2.4 + (i > 1 ? 1.4 : 0)) * .9 : 0; }); if (Math.random() < .6) ember(dx, 60 + hop, -6, false);
      }
    }
    if (id === 'cry') {   // Maricha's last trick: he cries for help in Ram's voice, so that Lakshman will leave Sita (Aranya Kanda 44)
      rav.root.visible = false;   // Ravan is still hiding
      const fade = sstep(9.4, 10.8, u), shout = u > 1.4 && u < 6.6;
      if (u < 10.8) { act(marich, 3640, 0, 6, -YAW, 1.1 * (1 - .97 * fade) + .001, { kneel: 1 - .5 * sstep(1, 1.6, u), cheer: shout ? .8 : 0, talk: shout, sad: 1 - sstep(1, 1.6, u) }); }
      if (shout && Math.random() < .8) parts.push({ x: 3615, y: rnd(110, 130), z: 10, vx: -rnd(140, 190), vy: rnd(-10, 10), vz: 0, life: 2.6, age: 0, hue: .58, r: rnd(1.6, 2.8), drag: .05, g: 0 });   // Ram's voice (blue) carries to the hut
      if (shout) for (const t0 of [1.6, 3, 4.4]) once('cr' + t0, u >= t0, () => burst(3620, 120, 10, .58, 40, 60));
      if (fade > 0 && fade < 1) for (let k = 0; k < 2; k++) ember(3640 + rnd(-20, 20), rnd(10, 90), 6, false);
      base.sita.sad = sstep(3.2, 4, u); base.sita.look = .3 * sstep(3.2, 4, u); base.lak.look = .3 * sstep(3.4, 4.2, u);   // at the hut, they hear it
      base.ram.look = -.35 * sstep(6.4, 7.2, u); base.ram.talk = u > 7 && u < 8.8; base.ram.sad = sstep(7.4, 8.2, u);   // Ram knows it is a trick, and worries for Sita
    }
    if (id === 'rekha') {   // Maricha's false cry; Lakshman draws a line of protection around the hut, then goes to help Ram (the Lakshman Rekha of later tellings)
      rav.root.visible = false;   // Ravan has not come yet
      base.sita.sad = 1 - .5 * sstep(9.6, 10.4, u); base.sita.talk = u > 2.2 && u < 4.4; base.sita.join = Math.max(sstep(2.4, 2.9, u) * (1 - sstep(3.8, 4.2, u)), sstep(9.6, 10, u) * (1 - sstep(11.4, 12, u))); base.sita.point = sstep(4, 4.4, u) * (1 - sstep(4.8, 5.2, u));   // she begs him to go
      const lxx = u < 9.6 ? wk(3180, 3152, 4.6, 5.4) : wk(3152, 3480, 9.8, 12.6);
      lak.root.position.x = lxx; lak.root.rotation.y = R;
      Object.assign(base.lak, { ph: lxx * Math.PI / STEP + 2.6, s: spd(4.6, 5.4, .5) || spd(9.8, 12.6), talk: (u > .3 && u < 2.2) || (u > 8.2 && u < 9.4), point: sstep(5.5, 6, u) * (1 - sstep(8, 8.4, u)), join: sstep(9, 9.3, u) * (1 - sstep(9.6, 9.9, u)) });
      const k = ease(sstep(5.8, 8, u)); setRekha(k, 1);
      if (k > 0 && k < 1) { const [px, pz] = rekPt(k * 6.2832); for (let q = 0; q < 3; q++) ember(px, 3, pz, false); }   // the line draws itself from Lakshman's hand
      once('rk1', u >= 8, () => { flashV = .25; burst(3250, 10, 0, .1, 60, 50); });
    }
    if (id === 'bhiksha') {   // Ravan comes as a holy man; the line flames up and stops him; Sita steps out to give him food
      lak.root.position.x = 3480; lak.root.rotation.y = R; base.lak.ph = 3480 * Math.PI / STEP + 2.6;   // Lakshman has gone to Ram
      const flare = sstep(6.1, 6.4, u) * (1 - sstep(7.4, 8.4, u)), out = sstep(9.6, 10.4, u);
      setRekha(1, (1 + 2 * flare) * (1 - .6 * out));
      const hx = u < 5.4 ? wk(2980, 3130, 0, 3.4) : u < 6.25 ? wk(3130, 3166, 5.4, 6.2) : wk(3166, 3126, 6.3, 6.9);
      if (u < 11.2) { act(hermit, hx, 0, 6, R, pop(.1, 99, u, 1), { s: spd(0, 3.4, .7) || spd(5.4, 6.2, .5), talk: (u > 3.6 && u < 5.2) || (u > 7.4 && u < 9), join: Math.max(sstep(3.8, 4.4, u) * (1 - sstep(5.2, 5.6, u)), sstep(7.6, 8, u) * (1 - sstep(9, 9.4, u))), sad: .6 }); }
      if (flare > .05) for (let q = 0; q < 3; q++) { const [fx2, fz2] = rekPt(rnd(-.9, .9)); flame(fx2, 2, fz2, 1.5 * flare); }
      once('bk1', u >= 6.2, () => { flashV = .5; burst(3172, 30, 0, .08, 90, 110); });
      const sxx = wk(3250, 3160, 8.8, 10.6);   // Sita, with a bowl of food, steps over the line
      base.sitaOverride = { x: sxx, y: 0, face: L, ph: sxx * Math.PI / STEP + 1.4, s: spd(8.8, 10.6, .6), join: 0, look: 0 };
      pot.visible = u > 8 && u < 11.6; pot.position.set(sxx - 18, 66, 30); pot.scale.setScalar(1.3);
      if (u >= 11.2) { const rv = sstep(11.2, 11.8, u); rav.root.visible = true; rav.root.position.set(3150, 0, -10); rav.root.scale.set(1.1 * (.5 + .5 * ease(rv)), 1.1 * (.5 + .5 * ease(rv)), 1.1); rav.root.rotation.y = R - .4; pose(rav, { ph: 0, s: 0, t: Tr }); }
      else rav.root.visible = false;
      once('bk2', u >= 11.2, () => { flashV = 1; burst(3140, 140, 0, .78, 140, 150); });
      base.sita.sad = 0;
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
      once('v3a', u >= .3, () => { flashV = .5; burst(4090, 90, 0, .12, 80, 90); });
      once('v3b', u >= 8.2, () => { flashV = .8; burst(4125, 120, 0, .12, 120, 130); });
      once('v3c', u >= 11, () => { flashV = .7; burst(4030, 150, 0, .12, 100, 110); });
    }
    if (id === 'vib') {   // Vibhishana crosses the sea to join Ram (Yuddha Kanda 17–19)
      const tx = rx + 92, f = ease(sstep(.2, 3.6, u)), bx = lerp(4560, tx, f), by = 170 * (1 - f) + 30 * Math.sin(Math.PI * f);
      if (u > .2 && u < 8.8) { showAt(vibh, bx, by, 6, face, pop(.2, 8.8, u, 1)); pose(vibh, { ph: 0, s: 0, t: Tr, fly: 1 - sstep(3.2, 3.8, u), kneel: sstep(4, 5, u) * (1 - sstep(6.4, 7.2, u)), join: sstep(4, 5, u) * (1 - sstep(6.4, 7.2, u)), talk: u > 5 && u < 6.4 }); if (u < 3.6) ember(bx + 10, by + 60, 6, false); }
      if (u > 6.4 && u < 8.4) { for (let k = 0; k < 3; k++) parts.push({ x: rx + 24, y: 118, z: 8, vx: rnd(10, 40), vy: rnd(-10, 10), vz: 0, life: rnd(.8, 1.4), age: 0, hue: .55, r: rnd(1.2, 2.2), drag: .6, g: 25 }); }
      base.ram.point = sstep(5.8, 6.4, u) * (1 - sstep(8, 8.8, u)); base.ram.look = .25;
      once('i7', u >= 7, () => { flashV = .5; burst(tx, 160, 0, .55, 90, 80); });
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
      once('g4a', u >= 4.2, () => { flashV = .7; burst(rx, 110, 0, .38, 90, 100); burst(rx - 95, 110, 0, .38, 90, 100); });
      const gv = u > 8 && u < 15.6; garuda.visible = gv;
      if (gv) { const gx = u < 10.5 ? lerp(5950, 5050, ease((u - 8) / 2.5)) : (u < 13 ? 5050 : lerp(5050, 4250, ease((u - 13) / 2.6))), gy = u < 10.5 ? lerp(320, 200, ease((u - 8) / 2.5)) : (u < 13 ? 200 + Math.sin(u * 3) * 6 : lerp(200, 360, ease((u - 13) / 2.6)));
        garuda.position.set(gx, gy, -30); garuda.rotation.y = Math.PI - .45; const fl = Math.sin(u * 11) * .6; garuda.userData.wings.forEach((w, i) => { w.rotation.x = (i ? -1 : 1) * fl; }); if (Math.random() < .7) ember(gx + rnd(-30, 30), gy - 10, -30, true); }
      once('g4b', u >= 10.4, () => { flashV = 1; burst(5050, 190, 0, .12, 130, 150); });
      once('g4c', u >= 12.6, () => { flashV = .6; burst(5330, 150, 0, .78, 90, 100); });
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
  let seaAmp = 1; const fired = {}; let lastTr = -1, flashV = 0, camC = 380, lastIns = -1;
  const once = (k, c, fn) => { if (c && !fired[k]) { fired[k] = 1; fn(); } };
  function resetAll() { for (const k in fired) delete fired[k]; parts = []; pets = []; flashV = 0; }
  const wp = new THREE.Vector3();

  function updateStory(Tr, dt) {
    const ins = mapT(Tr), T = ins.S, frozen = ins.i >= 0, fz = frozen ? 0 : 1;   // T is story time; during an inserted scene it stands still
    if (Tr < lastTr - .0001) resetAll();
    lastTr = Tr; flashV = Math.max(0, flashV - dt * 1.7);
    const camT = frozen && INS[ins.i].fx !== null ? INS[ins.i].fx : follow(T);
    if (ins.i !== lastIns && ((ins.i >= 0 && INS[ins.i].cut) || (lastIns >= 0 && INS[lastIns].cut))) camC = camT;   // a cut: jump, while the picture is dark
    lastIns = ins.i; camC += (camT - camC) * (1 - Math.exp(-dt * 2.2));
    const wide = Math.max(sstep(104, 110, T) * (1 - sstep(124, 128, T)), sstep(134, 140, T) * (1 - sstep(184, 187, T)), sstep(185, 188, T) * (1 - sstep(204, 206, T)));
    spotC = camC + 80; spotH = lerp(950, 1300, wide);
    const rx = ramX(T), vR = fz * vel(ramX, T);
    { let fd = 1; if (frozen && INS[ins.i].cut) { const n = INS[ins.i].n; fd = sstep(0, .7, ins.ur) * (1 - sstep(n - .7, n, ins.ur)); } gradePass.uniforms.uFade.value = fd; }

    // 1. birth: a lotus, and a baby of light who becomes Ram (and his brother Lakshman)
    lotus.visible = false; const open = 0;
    petals.forEach(p => { const d = p.userData, ang = lerp(.1, 1.12 - d.ring * .25, open); p.position.set(Math.cos(d.a) * (2 + d.ring * 2), 3, Math.sin(d.a) * (2 + d.ring * 2) * .8); p.rotation.set(0, -d.a, 0); p.rotateZ(-ang); });
    baby.visible = false;
    if (false) { const u = sstep(3, 6, T); baby.position.set(330, 34 + u * 70 + Math.sin(T * 3) * 2, 10); baby.scale.setScalar(1 + sstep(5.4, 6.4, T) * 3); babyLight.position.copy(baby.position); babyLight.intensity = 1.6 * sstep(3, 4, T); } else babyLight.intensity = 0;
    // King Dasharatha's sacred fire ritual: a divine being rises from the flames with a golden bowl of sacred pudding
    if (T < 7.6 && !frozen) { for (let k = 0; k < 2; k++) flame(330 + rnd(-16, 16), 4, 8, 1.5); }
    bowl.visible = false; babyLight.position.set(330, 118, 40); babyLight.intensity = 1.4 * sstep(3, 4, T) * (1 - sstep(5.6, 6.4, T)) * (frozen ? 0 : 1);
    birthOrbs.forEach((o, k) => { const a = sstep(2.2 + k * .25, 3.4 + k * .25, T) * (1 - sstep(5.8, 6.4, T)) * (frozen ? 0 : 1), an = Tr * 2.2 + k * 1.57; o.visible = a > .02; o.position.set(330 + Math.cos(an) * 20 + (k - 1.5) * 16 * sstep(3.6, 6, T), lerp(30, 150, ease(sstep(2.2, 6, T))) + Math.sin(an) * 7, 10 + Math.sin(an) * 14); o.scale.setScalar(12 * a + .01); });
    dash2.root.visible = T < 10 && !frozen; if (dash2.root.visible) { dash2.root.position.set(215, 0, 6); dash2.root.rotation.y = YAW; dash2.root.scale.setScalar(.2 + .8 * ease(sstep(0, 1.2, T)) * (1 - sstep(8.4, 10, T) * .97)); pose(dash2, { ph: 0, s: 0, t: Tr, join: sstep(1, 2, T) * (1 - sstep(7, 8, T)), talk: false }); }
    once('birth', T >= 6.0, () => { flashV = 1; burst(380, 100, 10, .12, 150, 150); burst(330, 118, 10, .1, 90, 120); petalRain(60, 900, 40, 260); });
    ram.root.visible = T >= 6.0; ram.root.scale.setScalar(.2 + .8 * ease(sstep(6.0, 7.2, T)));
    lak.root.visible = T >= 6.3; lak.root.scale.setScalar(.2 + .8 * ease(sstep(6.3, 7.5, T)));

    // Ram: walking, aiming, cheering
    let aw = null;
    for (const [a0, a1, d0, d1] of WIN) if (T >= a0 && T < a1 + .6) aw = { aim: sstep(a0, a0 + 1.2, T) * (1 - sstep(a1, a1 + .6, T)), draw: sstep(d0, d1, T) * (T < d1 + .05 ? 1 : 0), big: a0 < 30 };
    let insShot = null; const base = { ram: {}, lak: {}, sita: {} };
    if (frozen) { const r = insertParams(INS[ins.i].id, ins.u, rx, lakX(T)); if (!aw) aw = r.aw; insShot = r.shot; }
    const rider = T >= 185.5 && T < 205;
    ram.root.position.set(rx, rider ? chY(T) + 16 : 0, 6);
    const po = { ph: rx * Math.PI / STEP, s: rider ? 0 : clamp(Math.abs(vR) / SPDN), t: Tr };
    if (aw) { po.aim = aw.aim; po.draw = aw.draw; }
    if (T >= 31 && T < 34) po.victory = sstep(31.1, 31.8, T) * (1 - sstep(33, 34, T));
    if (T >= 168.8 && T < 172) po.victory = sstep(168.9, 169.6, T) * (1 - sstep(171, 172, T));
    pose(ram, po); const chV = fz * vel(chX, T); if (!frozen) turn(ram, rider ? chV : vR, dt);

    // Lakshman
    const lx = lakX(T), vL = fz * vel(lakX, T), lfall = 0;
    lak.root.position.set(lx, T >= 185.5 && T < 205 ? chY(T) + 16 : 12 * lfall, 2);
    pose(lak, { ph: lx * Math.PI / STEP + 2.6, s: (T >= 185.5 && T < 205) ? 0 : clamp(Math.abs(vL) / SPDN), t: Tr, point: sstep(152, 153, T) * (1 - sstep(157, 158, T)), angry: sstep(151, 152, T) * (1 - sstep(159, 160, T)) });
    lak.root.rotation.z = -1.45 * lfall; ram.root.rotation.z = -1.45 * lfall; ram.root.position.y = 12 * lfall;
    { const onCh = T >= 164 && T < 176; indraCh.visible = onCh; matali.root.visible = onCh;
      if (onCh) { ram.root.position.y = 26; indraCh.position.set(rx - 6, 10, -46); indraCh.scale.setScalar(1); indraCh.userData.wheels.forEach(w => { w.rotation.z = Tr * 3; }); matali.root.position.set(rx - 46, 26, 4); matali.root.rotation.y = YAW; matali.root.scale.setScalar(1); pose(matali, { ph: 0, s: 0, t: Tr, point: .6 }); } }
    if (!frozen) turn(lak, (T >= 185.5 && T < 205) ? chV : vL, dt);

    // Sita
    const sx = sitaX(T), vS = fz * vel(sitaX, T), captive = T >= 91 && T < 176, sRide = (T >= 82.5 && T < 91) || (T >= 185 && T < 205);
    sita.root.visible = T >= 25.5; sita.root.scale.setScalar(.2 + .8 * ease(sstep(25.5, 26.7, T)));
    sita.root.position.set(sx, sRide ? chY(T) + 16 : 0, 22);
    const sKneel = captive ? .85 * sstep(91.5, 92.5, T) * (1 - sstep(174.5, 176, T)) : 0; base.sita.kneel = sKneel;
    pose(sita, { ph: sx * Math.PI / STEP + 1.4, s: sRide ? 0 : clamp(Math.abs(vS) / SPDN), t: Tr, kneel: sKneel });
    if (!frozen) turn(sita, sRide ? chV : vS, dt, YAW, (T < 32 || captive) ? .55 : 0);

    // Hanuman and the vanaras
    const hp = hanPos(T); han.root.visible = hp.vis;
    if (hp.vis) {
      han.root.position.set(hp.x, hp.y, 10); han.root.scale.setScalar(1); const hv = fz * (hanPos(T + .06).x - hanPos(T - .06).x) / .12;
      if (!frozen) turn(han, (T >= 185.5 && T < 205) ? chV : hv, dt, hp.fly ? 1.4 : YAW);
      pose(han, { ph: hp.x * Math.PI / STEP, s: hp.fly ? 0 : clamp(Math.abs(hv) / SPDN), t: Tr, kneel: hp.kneel, fly: hp.fly, cheer: sstep(176, 177, T) * (1 - sstep(182, 183, T)) });
      han.tailTip.visible = hp.tail > 0;
      if (hp.tail) { han.tailTip.getWorldPosition(wp); for (let i = 0; i < 4; i++) ember(wp.x, wp.y, wp.z, true); }
    }
    mount.visible = hp.vis && hp.mount > .02; if (mount.visible) { mount.position.set(hp.x, hp.y + 150, 10); mount.scale.setScalar(hp.mount); mount.rotation.y = T * .8; }
    vanaras.forEach((v, i) => {
      const vis = T >= 119 && T < 185; v.root.visible = vis; if (!vis) return;
      const f = (t) => (t < 152 ? ramX(t) : ramX(152)) - 130 - i * 44, x = f(T), vv = fz * (f(T + .06) - f(T - .06)) / .12;
      v.root.position.set(x, 0, 14 + (i % 2) * 14); pose(v, { ph: x * Math.PI / STEP + i, s: clamp(Math.abs(vv) / SPDN), t: Tr, cheer: sstep(176, 177, T) * (1 - sstep(182, 183, T)), kneel: .55 * sstep(151, 152, T) * (1 - sstep(158.4, 159.4, T)) }); if (!frozen) turn(v, vv, dt);
    });

    // 3. Shiva's bow: lifted, bent, snapped; then Sita's garland
    const handAt = new THREE.Vector3(), rt = ram.arms[0].userData.hand; ram.root.updateMatrixWorld(true);
    if (T < 26.2) { bigBow.position.set(1700, 40 + Math.sin(T * 2) * 2, 4); bigBow.rotation.set(0, 0, Math.PI / 2); bigBow.scale.setScalar(.95); }
    else if (T < 31.0) { rt.getWorldPosition(handAt); bigBow.position.copy(handAt).add(new THREE.Vector3(7, 0, 0)); bigBow.rotation.set(0, 0, 0); bigBow.scale.setScalar(1); }
    bigBow.visible = T < 31.0 && (frozen ? T > 22.01 : T >= 22); pedestal.visible = frozen ? T > 22.01 : T >= 22; pedestal.position.x = 1700;
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
    bow.visible = T >= 43 || !!bowOn;
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
    arrow.scale.setScalar(1);
    SHOTS.forEach(([t0, dur, tx, ty], i) => {
      const p = (T - t0) / dur; if (p < 0 || p >= 1) return;
      const x0 = rx + 62, y0 = 128; arrow.visible = true; arrow.scale.setScalar(i === 2 ? 2.4 : 1);
      arrow.position.set(lerp(x0, tx, p), lerp(y0, ty, p) + Math.sin(Math.PI * p) * 8, 10); arrow.rotation.set(0, 0, Math.atan2(ty - y0, tx - x0));
      for (let k = 0; k < 3; k++) ember(arrow.position.x - 18, arrow.position.y, 10, true);
    });
    if (insShot) { const q = insShot; arrow.visible = true; arrow.position.set(lerp(q.x0, q.x1, q.p), lerp(q.y0, q.y1, q.p) + Math.sin(Math.PI * q.p) * 8, 10); arrow.rotation.set(0, 0, Math.atan2(q.y1 - q.y0, q.x1 - q.x0)); for (let k = 0; k < 3; k++) ember(arrow.position.x - 18, arrow.position.y, 10, true); }
    if (!insShot && !SHOTS.some(([t0, d]) => T >= t0 && T < t0 + d) && !(bowOn && aw.draw > .05)) arrow.visible = false;

    // 6. the golden deer, and the arrow that ends the illusion
    const dv = T >= 66 && T < 77 && !frozen;
    deer.visible = dv;
    deer.rotation.y = Math.PI / 2 - .25;
    if (dv) { const dx = deerX(T), hop = Math.abs(Math.sin(Tr * 4.2)) * 26; deer.position.set(dx, hop, -26); deer.legs.forEach((l, i) => { l.rotation.x = Math.sin(Tr * 8.4 + (i % 2) * 2.4 + (i > 1 ? 1.4 : 0)) * .9; }); deer.scale.setScalar(.85 + sstep(66, 68, T) * .15); if (Math.random() < .6) ember(dx, 60 + hop, -26, false); }
    once('deerhit', T >= 76.9, () => { flashV = .6; burst(3640, 70, 0, .12, 110, 120); });

    // 7. Ravan comes to the hut, takes Sita in his flying chariot; Jatayu fights him and falls
    const rp = T < 81 ? null : T < 82.5 ? { x: 3150, y: 0 } : T < 91 ? { x: chX(T) - 14, y: chY(T) + 18 } : { x: 5560, y: 0 };
    const burn = sstep(168.6, 176, T), ravS = 1.1 * (1 - .15 * burn), rfall = sstep(169.4, 171, T);
    rav.root.visible = rp !== null && T < 176;
    if (rp) {
      rav.root.scale.set(1.1, ravS, 1.1);
      rav.root.position.set(rp.x + (T >= 138 && T < 139 ? 100 * (1 - sstep(138, 139, T)) : 0) + (T > 168.6 && T < 171 ? Math.sin(T * 60) * 2.5 * (1 - rfall) : 0), rp.y + 12 * rfall, -10);
      pose(rav, { ph: 0, s: 0, t: Tr }); if (!frozen) turn(rav, T < 91 ? chV : -10, dt, YAW - .1); rav.heads.forEach((h, i) => { h.rotation.y = Math.sin(Tr * 1.1 + i) * .18; });
    }
    rav.root.rotation.z = -1.45 * rfall;
    rav.heads.forEach(h => { const d = h.userData; h.visible = true; h.position.copy(d.base); h.scale.setScalar(d.bs); h.rotation.z = d.bz; }); rav.xarms.forEach(a => { a.visible = true; a.scale.setScalar(1); if (!(frozen && INS[ins.i].id === 'headcut')) a.rotation.x = a.userData.rx + Math.sin(Tr * 1.6 + a.id) * .05; });
    { const cp = rav.heads[0].userData.crownParts; if (cp) cp.forEach(m => { m.visible = T < 138; }); }
    once('abduct', T >= 82.4, () => { flashV = 1; burst(3150, 110, 10, .78, 120, 130); });
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
    once('jhit', T >= 86.4, () => { flashV = .5; burst(3720, 150, 0, .12, 90, 120); });
    once('jspirit', T >= 100, () => { burst(3930, 40, 0, .13, 90, 90); for (let i = 0; i < 20; i++) ember(3930 + rnd(-20, 20), 20, 0, true); });

    // 8. Hanuman meets Ram; the sea and the bridge of stones
    once('hmeet', T >= 104.6, () => { burst(3990, 150, 0, .1, 60, 80); });
    once('leap', T >= 108, () => { flashV = .4; burst(3990, 40, 0, .08, 80, 110); });
    once('ring', T >= 113.4, () => { burst(5640, 120, 0, .13, 70, 70); });
    if (T > 116 && T < 121) for (let i = 0; i < 6; i++) { ember(rnd(5170, 5810), rnd(40, 190), rnd(-30, 10), true); if (i < 4) flame(rnd(5170, 5810), rnd(60, 150), rnd(-40, 10), 1.3); }
    once('lankaburn', T >= 116, () => { flashV = .5; });
    if (hp.fly && hp.vis) ember(hp.x - 20, hp.y + 60, 10, false);
    stones.forEach(m => { const a = clamp((T - m.userData.t) / .7), sc = a <= 0 ? .001 : (a < 1 ? 1 + .35 * Math.sin(Math.PI * a) : 1); m.scale.setScalar(sc * (a > 0 ? 1 : .001)); if (a > 0 && a < 1 && Math.random() < .6) ember(m.position.x, 16, 10, false); });
    const sp = seaGeo.attributes.position; for (let i = 0; i < sp.count; i++) { const x = seaBase[i * 3], y = seaBase[i * 3 + 1]; sp.setY(i, y + (Math.sin(x * .045 + Tr * 2.2) * 2.6 + Math.sin(x * .11 - Tr * 3) * 1.1) * seaAmp); } sp.needsUpdate = true;

    // 11. Kumbhakarna, Lakshman struck down, the healing mountain
    kum.root.visible = T >= 139 && T < 155.5;
    if (kum.root.visible) { const f = sstep(148, 150.5, T); kum.root.position.set(5320, 14 * f, -10); kum.root.rotation.z = 0; if (!frozen) turn(kum, -10, dt, YAW - .1); kum.root.rotation.z = -1.5 * f; kum.root.scale.setScalar(1.9 * (1 - .9 * sstep(153, 155.5, T))); pose(kum, { ph: 0, s: 0, t: Tr }); }
    once('khit', T >= 147.6, () => { flashV = .8; burst(5255, 150, 0, .12, 130, 160); });
    // Indrajit, hidden in a storm cloud, rains arrows on the army
    { const rk = sstep(150.2, 151.4, T) * (1 - sstep(158.6, 159.6, T)); cloud.visible = rk > .02;
      if (cloud.visible) { cloud.position.set(4930 + Math.sin(Tr * .4) * 30, 236, -60); cloud.scale.set(rk, .3 + .7 * rk, 1);
        if (!frozen) { for (let q = 0; q < 3; q++) parts.push({ x: 4930 + rnd(-160, 160), y: 220, z: rnd(0, 40), vx: rnd(10, 40), vy: -rnd(220, 300), vz: 0, life: .9, age: 0, hue: .02, r: rnd(.8, 1.4), sy: 6, drag: 1, g: 0, lt: .55 });
          if (Math.random() < dt * .25) { flashV = .3; burst(4930 + rnd(-120, 120), 210, -40, .7, 30, 90); } } } }
    // 12. Ravan falls
    once('hit', T >= 168.6, () => { flashV = 1; burst(5560, 150, 0, .12, 170, 190); });
    for (const [k, t, dx, y, h] of [['r2', 169.2, -60, 250, .12], ['r3', 169.9, 70, 210, .9], ['r4', 170.8, 10, 120, .55], ['r5', 171.8, -300, 230, .12], ['r6', 172.8, 250, 250, .08], ['r7', 174, -120, 260, .8]]) once(k, T >= t, () => burst(5560 + dx, y, 20, h, 125));
    if (T > 168.6 && T < 176) for (let i = 0; i < 6; i++) { ember(rav.root.position.x + rnd(-45, 45), rnd(5, 230) * ravS, rnd(0, 20), true); if (i < 3) flame(rav.root.position.x + rnd(-40, 40), rnd(5, 150) * ravS, rnd(0, 20), 1.2); }
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
    if (sv) { const sxx = ramX(T) + 130, vs = fz * vel(ramX, T); sage.root.position.set(sxx, 0, 4); if (!frozen) turn(sage, vs, dt); sage.root.scale.setScalar(.2 + .8 * ease(sstep(10, 11.2, T)) * (1 - sstep(24.4, 26, T) * .97)); pose(sage, { ph: sxx * Math.PI / STEP, s: clamp(Math.abs(vs) / SPDN), t: Tr }); }
    { const fade = T > 81 && T < 83 && !frozen ? 1 - sstep(81.2, 82.8, T) : 0; setRekha(fade > 0 ? 1 : 0, .4 * fade); }   // Lakshman's line (the inserted scenes draw it), fading after Sita steps out
    insertActors(ins, Tr, rx, base);
    if (!ram.root.visible) bow.visible = false; else if (bow.visible && !bowOn) { bow.position.x = ram.root.position.x - 22; bow.position.y = ram.root.position.y + 112; }
    if (frozen) {   // re-pose the main cast for the inserted scene (kneeling, pointing, fallen, seated)
      const rp = Object.assign({ ph: rx * Math.PI / STEP, s: 0, t: Tr }, base.ram); if (aw) { rp.aim = aw.aim; rp.draw = aw.draw; }
      pose(ram, rp); pose(lak, Object.assign({ ph: lx * Math.PI / STEP + 2.6, s: 0, t: Tr }, base.lak));
      if (base.lak.bow && base.lak.aim > .02) aimBow(bowL, lak, base.lak.draw || 0, 1.3);
      if (base.sitaOverride) { const o = base.sitaOverride; sita.root.position.set(o.x, o.y, 22); sita.root.rotation.y = o.face; pose(sita, { ph: o.ph, s: o.s, t: Tr, join: o.join, look: o.look }); }
      else pose(sita, Object.assign({ ph: sx * Math.PI / STEP + 1.4, s: 0, t: Tr }, base.sita));
      if (base.ram.fall !== undefined || base.lak.fall !== undefined || INS[ins.i].id === 'indra') { ram.root.rotation.z = -1.45 * (base.ram.fall || 0); ram.root.position.y = 12 * (base.ram.fall || 0); lak.root.rotation.z = -1.45 * (base.lak.fall || 0); lak.root.position.y = 12 * (base.lak.fall || 0); }
    }
    // a little squirrel carries pebbles to the bridge
    const sqv = false; squirrel.visible = false;
    if (sqv) { const q = sstep(132, 134, T), qx = ramX(T) + 60 + Math.sin(T * 1.7) * 38 * (1 - q) - 22 * q, hop = Math.abs(Math.sin(T * 7)) * 6 * (1 - q); squirrel.position.set(qx, 14 + hop, 22); squirrel.rotation.y = Math.cos(T * 1.7) > 0 ? 0 : Math.PI; if (q > .5) squirrel.rotation.y = Math.PI; squirrel.userData.pebble.visible = q < .5; if (q > .9) once('sq', true, () => { flashV = .3; burst(qx, 40, 0, .12, 50, 40); }); }
    // footsteps raise a little dust
    for (const [h, x, s2, vis] of [[ram, rx, clamp(Math.abs(vR) / SPDN), ram.root.visible], [lak, lx, clamp(Math.abs(vL) / SPDN), lak.root.visible], [sita, sx, clamp(Math.abs(vS) / SPDN), sita.root.visible]]) {
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
    FLAGS.forEach((f, k) => { const p = f.geometry.attributes.position, b = f.userData.base; for (let i = 0; i < p.count; i++) { const x = b[i * 3]; p.setZ(i, Math.sin(x * .25 - Tr * 5 + k) * x * .09); } p.needsUpdate = true; });
    stepParts(dt);
  }

  // ---------- the ten avatars of Vishnu, rendered as lit 3D stills for the opening titles ----------
  let STILLS = null;
  function avatarStills() {
    if (STILLS) return STILLS;
    const W = 480, Hh = 640, R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    R.setPixelRatio(1); R.setSize(W, Hh, false);
    const cam = new THREE.PerspectiveCamera(28, W / Hh, 1, 6000);
    const bgTex = (c1, c2) => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), g = x.createRadialGradient(128, 110, 4, 128, 128, 180); g.addColorStop(0, c1); g.addColorStop(1, c2); x.fillStyle = g; x.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); };
    const four = (H, sp, up) => { for (const s of [1, -1]) { const a = makeArm(sp, s); a.position.set(s * 13, 40, -3); a.rotation.z = s * (up ? 2.3 : .95); a.rotation.x = -.2; H.torso.add(a); } };
    const discus = () => { const g = new THREE.Group(); const r = mesh(new THREE.TorusGeometry(10, 1.6, 8, 32), std(0xffd24a, { emissive: 0xffa000, emissiveIntensity: 1.6, metalness: .7, roughness: .2 }), 0, 0, 0, g); r.rotation.y = Math.PI / 2; for (let k = 0; k < 12; k++) { const sp = mesh(new THREE.ConeGeometry(1.2, 5, 4), std(0xffe08a, { emissive: 0xffa000, emissiveIntensity: 1.2 }), 0, Math.cos(k / 12 * 6.283) * 12, Math.sin(k / 12 * 6.283) * 12, g); sp.rotation.x = k / 12 * 6.283; } const gl = mesh(G.sph, glowMat(0xffc040), 0, 0, 0, g); gl.scale.setScalar(16); gl.material.opacity = .35; return g; };
    const holdIn = (H, i, obj, dy) => { obj.position.set(0, dy === undefined ? -26 : dy, 3); H.arms[i].userData.el.add(obj); };
    const setArm = (H, i, x, z, el) => { H.arms[i].rotation.x = x; H.arms[i].rotation.z = z; H.arms[i].userData.el.rotation.x = el; };
    const DEF = [
      // name, colours (background centre, edge, rim light), build function returning [object, look-at height, distance]
      ['matsya', ['#2a9ad0', '#020a18', 0x7af0ff], (g) => { const H = makeHuman('vishnu', { headScale: 1.2 }); pose(H, { ph: 0, s: 0, t: 1 }); four(H, SPEC.vishnu); H.legs.forEach(l => { l.visible = false; }); H.dress.visible = false; g.add(H.root); H.root.rotation.y = .25;
        const tail = new THREE.Group(); const tg = lathe([[0, 0], [16, 4], [18, 20], [15, 40], [9, 62], [4, 80], [0, 86]], 20); gradient(tg, 0xffd060, 0x2a8ad0, 1, 0, 86); const tm = mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .15, roughness: .35, emissive: 0x0a2a40 }), 0, 0, 0, tail); tm.rotation.x = Math.PI; tail.position.set(0, 80, 0); tail.rotation.z = .25; g.add(tail);
        const fin = mesh(new THREE.ConeGeometry(18, 34, 3), std(0x40b0e0, { metalness: .5, roughness: .3, emissive: 0x0a3050 }), -26, -2, 0, g); fin.rotation.z = 2.1; fin.scale.z = .2; const fin2 = mesh(new THREE.ConeGeometry(18, 34, 3), fin.material, 6, -6, 0, g); fin2.rotation.z = -2.4; fin2.scale.z = .2;
        for (let k = 0; k < 40; k++) { const d = mesh(G.sphLow, glowMat(0xaef4ff), srnd(-120, 120), srnd(-10, 40), srnd(-40, 40), g); d.scale.setScalar(srnd(1, 3)); } return [92, 520]; }],
      ['kurma', ['#1ab08a', '#02140e', 0x9affd0], (g) => { const shell = new THREE.Group(); g.add(shell); const sg = new THREE.SphereGeometry(70, 32, 16, 0, 6.283, 0, Math.PI / 2); gradient(sg, 0x2a5a2a, 0xa8c060, 1, 0, 70); const sh = mesh(sg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, metalness: .2 }), 0, 10, 0, shell); sh.scale.set(1, .55, .8);
        for (let k = 0; k < 14; k++) { const a = k / 14 * 6.283, rr = k < 6 ? 25 : 50; const hx = mesh(new THREE.CylinderGeometry(11, 11, 3, 6), std(0xd8c070, { roughness: .4, metalness: .3 }), Math.cos(a) * rr, 10 + 36 * (1 - rr / 80), Math.sin(a) * rr * .8, shell); hx.lookAt(0, -40, 0); }
        const head = mesh(G.sph, std(0x6a8a50, { roughness: .5 }), 78, 18, 0, g); head.scale.set(16, 13, 13); for (const z of [-1, 1]) mesh(G.sphLow, std(0xffe080, { emissive: 0xffa000, emissiveIntensity: 1 }), 90, 24, z * 6, g).scale.setScalar(2);
        const mt = new THREE.ConeGeometry(42, 120, 12, 6), mp = mt.attributes.position; for (let i = 0; i < mp.count; i++) { const n = 1 + .12 * Math.sin(i * 7.7); mp.setX(i, mp.getX(i) * n); mp.setZ(i, mp.getZ(i) * n); } mt.computeVertexNormals(); gradient(mt, 0x4a3a2a, 0xa08a6a, 1, -60, 60); mesh(mt, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, flatShading: true }), 0, 105, 0, g);
        const pts = []; for (let k = 0; k <= 80; k++) { const a = k / 80 * Math.PI * 6; pts.push(new THREE.Vector3(Math.cos(a) * (40 - k * .2), 50 + k * 1.1, Math.sin(a) * (34 - k * .2))); } mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 3.4, 8), std(0x30d090, { emissive: 0x0a6040, emissiveIntensity: .8, roughness: .4 }), 0, 0, 0, g); return [80, 520]; }],
      ['varaha', ['#4a5ad0', '#04061a', 0xa8b8ff], (g) => { const H = makeHuman('varaha', { headScale: 1.2 }); pose(H, { ph: 0, s: 0, t: 1 }); four(H, SPEC.varaha, true); g.add(H.root); H.root.rotation.y = .85; H.head.visible = false;
        const bh = new THREE.Group(); bh.position.set(0, 57, 0); H.torso.add(bh); const bm = std(0x8a7a80, { roughness: .55, emissive: 0x1a1218 }); mesh(G.sph, bm, 0, 0, 2, bh).scale.set(11, 12, 14); const sn = mesh(new THREE.CylinderGeometry(4.5, 8, 20, 12), bm, 0, -3, 16, bh); sn.rotation.x = Math.PI / 2; mesh(new THREE.CylinderGeometry(4.7, 4.7, 1, 12), std(0x4a2a30), 0, -3, 26.4, bh).rotation.x = Math.PI / 2;
        for (const s of [-1, 1]) { const t = mesh(new THREE.ConeGeometry(1.8, 15, 8), std(0xfff4e0, { roughness: .3 }), s * 5, -6, 20, bh); t.rotation.set(-.6, 0, s * -.3); const e = mesh(new THREE.ConeGeometry(4, 9, 6), bm, s * 8, 10, -2, bh); e.rotation.z = s * -.5; mesh(G.sphLow, std(0xff3020, { emissive: 0xff2010, emissiveIntensity: 1.5 }), s * 5, 4, 10, bh).scale.setScalar(1.3); }
        mesh(new THREE.LatheGeometry([[0, 0], [10, 0], [9, 6], [5, 12], [7, 18], [3, 26], [0, 30]].map(p => new THREE.Vector2(p[0], p[1])), 16), GOLD, 0, 9, 0, bh);
        const earth = mesh(G.sph, std(0x2a6aff, { roughness: .4, metalness: .1, emissive: 0x0a2060 }), 0, 0, 0, g); earth.scale.setScalar(20); earth.position.set(10, 172, 40); for (let k = 0; k < 5; k++) { const l = mesh(G.sph, std(0x3ac060, { roughness: .6 }), 0, 0, 0, earth); l.scale.set(.4, .25, .3); l.position.set(Math.cos(k * 1.3) * .8, Math.sin(k * 2.1) * .5, Math.sin(k * 1.3) * .6); }
        return [110, 560]; }],
      ['narasimha', ['#ff6a1a', '#1a0402', 0xffd070], (g) => { const H = makeHuman('narasimha', { headScale: 1.2 }); pose(H, { ph: 0, s: 0, t: 1, angry: 1 }); four(H, SPEC.narasimha, true); setArm(H, 0, -.4, 1.9, -.9); setArm(H, 1, -.4, -1.9, -.9); g.add(H.root); H.root.rotation.y = .15;
        const mane = new THREE.Group(); mane.position.set(0, 58, -2); H.torso.add(mane); const mm = std(0xe0901a, { roughness: .7, emissive: 0x3a1800 }); for (let k = 0; k < 40; k++) { const a = k / 40 * 6.283, c = mesh(new THREE.ConeGeometry(3.4, 18, 6), mm, Math.cos(a) * 12, Math.sin(a) * 13, -4 - (k % 3) * 2, mane); c.rotation.z = a - Math.PI / 2; }
        const face = H.head; face.scale.setScalar(1.05); const sn = mesh(G.sph, std(0xe8b060, { roughness: .5 }), 0, -4, 10, face); sn.scale.set(5.5, 4, 3.5); for (const s of [-1, 1]) { const f = mesh(new THREE.ConeGeometry(1, 5, 6), std(0xffffff), s * 2.6, -8.6, 10.5, face); f.rotation.x = Math.PI; }
        for (const x of [-120, 120]) { const p = mesh(new THREE.CylinderGeometry(16, 18, 260, 10), std(0x8a6a5a, { roughness: .8 }), x, 130, -60, g); p.rotation.z = x < 0 ? .15 : -.15; }
        for (let k = 0; k < 40; k++) { const d = mesh(G.sphLow, glowMat(0xffa040), srnd(-140, 140), srnd(0, 250), srnd(-60, 30), g); d.scale.setScalar(srnd(1, 3.5)); } return [105, 560]; }],
      ['vamana', ['#ffc040', '#2a1402', 0xfff0a0], (g) => { const H = makeHuman('vamana', { headScale: 1.45 }); H.root.scale.setScalar(.75); pose(H, { ph: 0, s: 0, t: 1 }); setArm(H, 0, -1.2, .2, -.6); setArm(H, 1, -.5, -.2, -.8); g.add(H.root); H.root.rotation.y = .3;
        const um = new THREE.Group(); mesh(new THREE.CylinderGeometry(.8, .8, 90, 6), std(0x6a4a2a), 0, 30, 0, um); const top = mesh(new THREE.SphereGeometry(40, 24, 8, 0, 6.283, 0, 1.1), std(0xfff0d0, { side: THREE.DoubleSide, roughness: .6, emissive: 0x403020 }), 0, 50, 0, um); top.scale.y = .55; mesh(new THREE.TorusGeometry(35.5, 1, 6, 32), GOLD, 0, 66, 0, um).rotation.x = Math.PI / 2; holdIn(H, 0, um, -20);
        const pot = new THREE.Group(); mesh(G.sph, std(0xb8803a, { metalness: .6, roughness: .3 }), 0, 0, 0, pot).scale.set(6, 6.5, 6); mesh(new THREE.CylinderGeometry(2, 3, 5, 10), std(0xb8803a, { metalness: .6, roughness: .3 }), 0, 7, 0, pot); holdIn(H, 1, pot, -28);
        const ft = mesh(G.sph, glowMat(0xffe0a0), 60, 230, -200, g); ft.scale.set(70, 30, 10); ft.material.opacity = .25; return [70, 420]; }],
      ['parashurama', ['#d02a3a', '#140204', 0xffb0a0], (g) => { const H = makeHuman('parashurama', { headScale: 1.2 }); pose(H, { ph: 0, s: 0, t: 1, angry: 1 }); setArm(H, 0, -2.9, .3, -.3); g.add(H.root); H.root.rotation.y = .3;
        const axe = new THREE.Group(); mesh(new THREE.CylinderGeometry(1.6, 1.6, 70, 8), std(0x5a3a1a, { roughness: .8 }), 0, 0, 0, axe); const bl = mesh(new THREE.CylinderGeometry(16, 16, 2.4, 20, 1, false, 0, Math.PI), std(0xdfe6f0, { metalness: .9, roughness: .2, emissive: 0x334455 }), 9, 26, 0, axe); bl.rotation.set(Math.PI / 2, 0, Math.PI / 2); holdIn(H, 0, axe, -30);
        for (let k = 0; k < 30; k++) { const d = mesh(G.sphLow, glowMat(0xff6040), srnd(-140, 140), srnd(0, 250), srnd(-60, 30), g); d.scale.setScalar(srnd(1, 3)); } return [100, 540]; }],
      ['ram', ['#ffa030', '#1a0800', 0xffe8a0], (g) => { const H = makeHuman('ram'); pose(H, { ph: 0, s: 0, t: 1, aim: 1, draw: .9 }); g.add(H.root); H.root.rotation.y = .9;
        const bo = new THREE.Group(); bo.add(new THREE.Mesh(new THREE.TubeGeometry(bowCurve(46, 15), 24, 1.8, 8), bowMat)); holdIn(H, 0, bo, -24); bo.rotation.y = -Math.PI / 2;
        const ar = new THREE.Group(); mesh(new THREE.CylinderGeometry(.7, .7, 70, 6), std(0xf4e6c2), 0, 0, 0, ar).rotation.z = Math.PI / 2; mesh(new THREE.ConeGeometry(2.4, 9, 8), GOLD, 38, 0, 0, ar).rotation.z = -Math.PI / 2; const gl = mesh(G.sph, glowMat(0xffb04a), 40, 0, 0, ar); gl.scale.setScalar(9);
        H.root.updateMatrixWorld(true); const hp = new THREE.Vector3(); H.arms[1].userData.hand.getWorldPosition(hp); ar.position.copy(hp).add(new THREE.Vector3(34, 0, 0)); ar.lookAt(hp.x + 200, hp.y, hp.z); ar.rotateY(-Math.PI / 2); g.add(ar); return [110, 540]; }],
      ['krishna', ['#7a3ae0', '#08021a', 0xc8a8ff], (g) => { const H = makeHuman('krishna'); pose(H, { ph: 0, s: 0, t: 1 }); setArm(H, 0, -1.3, -.5, -1.6); setArm(H, 1, -1.4, .6, -1.2); g.add(H.root); H.root.rotation.y = .4; H.legs[0].rotation.x = .1; H.legs[1].rotation.z = .25; H.knees[1].rotation.x = .3;
        const fl = mesh(new THREE.CylinderGeometry(1.1, 1.1, 40, 8), std(0xb07a3a, { roughness: .4 }), 18, 52, 10, H.torso); fl.rotation.z = Math.PI / 2 - .25;
        const fe = new THREE.Group(); fe.position.set(5, 38, -2); fe.rotation.z = -.35; H.head.add(fe); mesh(G.sph, std(0x1a8a6a, { emissive: 0x0a3a2a, roughness: .4 }), 0, 0, 0, fe).scale.set(5, 13, 2); mesh(G.sph, std(0x1a4aff, { emissive: 0x0a2aff, emissiveIntensity: 1 }), 0, 6, 1.4, fe).scale.set(2.2, 3, 1); mesh(G.sph, std(0xffd040, { emissive: 0xa08000 }), 0, 6, 1.6, fe).scale.set(1, 1.4, .6);
        const d = discus(); d.position.set(-58, 190, -10); d.scale.setScalar(1.4); g.add(d); return [105, 540]; }],
      ['balarama', ['#a8c0e0', '#06080e', 0xeef4ff], (g) => { const H = makeHuman('balarama'); pose(H, { ph: 0, s: 0, t: 1 }); setArm(H, 0, -2.6, .5, -1.2); g.add(H.root); H.root.rotation.y = .25;
        const pl = new THREE.Group(); mesh(new THREE.CylinderGeometry(1.6, 1.6, 110, 8), std(0x7a5a2a, { roughness: .7 }), 0, 0, 0, pl); const blade = mesh(new THREE.BoxGeometry(4, 26, 12), std(0xd0d8e0, { metalness: .9, roughness: .25 }), 8, 52, 0, pl); blade.rotation.z = -.6; pl.rotation.z = .5; holdIn(H, 0, pl, -24); return [105, 540]; }],
      ['kalki', ['#6a2aa0', '#04020a', 0xe0b0ff], (g) => { const horse = new THREE.Group(); g.add(horse); const hm = std(0xf4f2f8, { roughness: .45, emissive: 0x202030 });
        const body = mesh(G.sph, hm, 0, 90, 0, horse); body.scale.set(52, 24, 20); const neck = mesh(new THREE.CylinderGeometry(9, 14, 50, 12), hm, 46, 122, 0, horse); neck.rotation.z = -.7; const head = mesh(G.sph, hm, 66, 150, 0, horse); head.scale.set(20, 9, 8); head.rotation.z = -.5;
        for (const s of [-1, 1]) mesh(new THREE.ConeGeometry(2.4, 9, 6), hm, 58, 162, s * 4, horse);
        const mane = mesh(new THREE.BoxGeometry(6, 44, 3), std(0xe0d8f0, { roughness: .8 }), 38, 128, 0, horse); mane.rotation.z = -.7;
        const leg = (x, z, a1, a2) => { const l = new THREE.Group(); l.position.set(x, 80, z); l.rotation.z = a1; horse.add(l); const u = new THREE.CylinderGeometry(5, 4, 34, 8); u.translate(0, -17, 0); l.add(new THREE.Mesh(u, hm)); const k = new THREE.Group(); k.position.y = -34; k.rotation.z = a2; l.add(k); const lo = new THREE.CylinderGeometry(3.4, 2.6, 34, 8); lo.translate(0, -17, 0); k.add(new THREE.Mesh(lo, hm)); mesh(G.sph, std(0x2a2a30), 0, -35, 0, k).scale.set(4, 3, 4); };
        leg(34, 10, 1.4, -1.4); leg(30, -10, 1.1, -1.5); leg(-36, 10, -.2, .3); leg(-40, -10, .1, .2);
        const tail = new THREE.CatmullRomCurve3([new THREE.Vector3(-50, 96, 0), new THREE.Vector3(-70, 80, 0), new THREE.Vector3(-80, 50, 4)]); mesh(new THREE.TubeGeometry(tail, 10, 4, 6), hm, 0, 0, 0, horse);
        horse.rotation.z = .32; horse.position.y = -20;
        const H = makeHuman('kalki'); pose(H, { ph: 0, s: 0, t: 1, sit: 1 }); setArm(H, 0, -2.9, .2, -.2); H.root.position.set(4, 96, 8); H.root.rotation.y = .9; horse.add(H.root); H.root.scale.setScalar(.85);
        const sw = new THREE.Group(); mesh(new THREE.BoxGeometry(2.6, 64, 1), std(0xeef4ff, { metalness: .95, roughness: .1, emissive: 0x4060a0, emissiveIntensity: .8 }), 0, -36, 0, sw); mesh(new THREE.BoxGeometry(12, 2.4, 3), GOLD, 0, -3, 0, sw); const sg = mesh(G.sph, glowMat(0xa0d0ff), 0, -40, 0, sw); sg.scale.set(5, 40, 5); sg.material.opacity = .4; holdIn(H, 0, sw, -24); sw.rotation.x = Math.PI;
        horse.rotation.y = .5; return [120, 600]; }],
    ];
    STILLS = DEF.map(([name, [c1, c2, rimC], build]) => {
      const sc = new THREE.Scene(), g = new THREE.Group(); sc.add(g);
      const bg = mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshBasicMaterial({ map: bgTex(c1, c2) }), 0, 150, -700, sc);
      sc.add(new THREE.HemisphereLight(0x6070a0, 0x201008, .32));
      const key = new THREE.DirectionalLight(0xffd8b0, .85); key.position.set(-300, 400, 500); sc.add(key);
      for (const sx of [-1, 1]) { const rim = new THREE.DirectionalLight(rimC, 1.1); rim.position.set(sx * 500, 300, -500); sc.add(rim); }
      const fill = new THREE.PointLight(rimC, .35, 900); fill.position.set(0, 60, 300); sc.add(fill);
      const [lookY, dist] = build(g);
      cam.position.set(24, lookY - 55, dist * .78); cam.lookAt(0, lookY, 0); cam.updateProjectionMatrix();
      R.render(sc, cam);
      const out = document.createElement('canvas'); out.width = W; out.height = Hh; const x = out.getContext('2d');
      x.drawImage(R.domElement, 0, 0);
      x.save(); x.globalCompositeOperation = 'lighter'; x.globalAlpha = .22; x.filter = 'blur(10px)'; x.drawImage(R.domElement, 0, 0); x.restore();   // a soft glow
      const v = x.createRadialGradient(W / 2, Hh * .45, Hh * .25, W / 2, Hh / 2, Hh * .75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.65)'); x.fillStyle = v; x.fillRect(0, 0, W, Hh);   // vignette
      sc.traverse(o => { if (o.geometry && o.geometry !== G.sph && o.geometry !== G.sphLow) o.geometry.dispose(); });
      return out;
    });
    R.dispose(); return STILLS;
  }

  // ---------- view and render ----------
  let vw = 0, vh = 0, spotC = 400, spotH = 950;
  function setView(x0, x1, yTop, yBottom, pxW, pxH, sx, sy) {
    pxW = Math.max(16, Math.round(pxW)); pxH = Math.max(8, Math.round(pxH));
    viewStretch = (pxH / Math.max(1e-6, yTop - yBottom)) / (pxW / Math.max(1e-6, x1 - x0));
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
  function render() { if (inIntro) return renderIntro(); if (inOutro) return renderOutro(); drawParts(); composer.render(); return canvas; }
  function renderOutro() {
    if (outroCanvas.width !== vw || outroCanvas.height !== vh) { outroCanvas.width = vw; outroCanvas.height = vh; }
    let st = null; try { st = avatarStills(); } catch (e) { st = null; }
    octx.setTransform(1, 0, 0, 1, 0, 0); VishnuOutro.drawBand(octx, vw, vh, outroT, viewStretch, st); return outroCanvas;
  }
  // ---------- the opening titles (intro.js), before the story ----------
  const INTRO = window.VishnuIntro ? VishnuIntro.DUR : 0, introCanvas = document.createElement('canvas'), ictx = introCanvas.getContext('2d');
  let inIntro = false, introT = 0, viewStretch = 1, inOutro = false, outroT = 0;
  const OUTRO = window.VishnuOutro ? VishnuOutro.DUR : 0, outroCanvas = document.createElement('canvas'), octx = outroCanvas.getContext('2d');
  function renderIntro() {
    if (introCanvas.width !== vw || introCanvas.height !== vh) { introCanvas.width = vw; introCanvas.height = vh; }
    ictx.setTransform(1, 0, 0, 1, 0, 0); VishnuIntro.drawBand(ictx, vw, vh, introT, viewStretch); return introCanvas;
  }
  const STORY_END = () => INTRO + TOTAL * SLOW;
  function update(Tr, dt) { inIntro = Tr < INTRO; inOutro = !inIntro && OUTRO > 0 && Tr >= STORY_END(); if (inIntro) { introT = Tr; return; } if (inOutro) { outroT = Tr - STORY_END(); return; } updateStory(Tr - INTRO, dt); }
  function caption(Tr) { if (Tr < INTRO) return { en: '', moral: '', a: 0, am: 0, age: 0, intro: Tr, kanda: null }; if (OUTRO > 0 && Tr >= STORY_END()) return VishnuOutro.caption(Tr - STORY_END()); return captionAt(Tr - INTRO); }
  const settle = () => { parts = []; pets = []; flashV = 0; };   // after a jump: clear the sparkles of everything skipped over
  return { canvas, setView, update, render, settle, LOOP: TOTAL * SLOW + INTRO + OUTRO, INTRO, OUTRO, STORY_END: INTRO + TOTAL * SLOW, WORLD, ramX, sitaX, lakX, hanPos, follow: () => camC, caption, avatarStills, chapters: [0].concat(chapters.map(x => x + INTRO)), bloom };
})();
