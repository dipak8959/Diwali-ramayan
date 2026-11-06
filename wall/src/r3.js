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
    kumbha:   { skin: 0x5e9a62, hair: 0x120508, dress: [0x8a3a2a, 0x2a120a], sash: 0xc0392b, crown: true, evil: true },
  };

  function makeHead(sp, scale) {
    const g = new THREE.Group(), skin = std(sp.skin, { roughness: .5, emissive: new THREE.Color(sp.skin).multiplyScalar(.05) });
    const head = mesh(G.sph, skin, 0, 0, 0, g); head.scale.set(8.4, 10.4, 9);
    const jaw = mesh(G.sph, skin, 0, -6.4, 1.4, g); jaw.scale.set(6.2, 5.6, 7);
    const eyes = []; let nose;
    if (sp.monkey) {   // a pink face with a broad muzzle
      const faceM = std(0xe8957c, { roughness: .55 });
      mesh(G.sph, faceM, 0, -.8, 6, g).scale.set(6.8, 7.6, 4.8);
      nose = mesh(G.sph, faceM, 0, -3.6, 8.9, g); nose.scale.set(4.6, 3.6, 3.6);
      for (const s of [-1, 1]) mesh(G.sphLow, DARK, s * 1.3, -2.6, 12, g).scale.setScalar(.7);
    } else { nose = mesh(new THREE.ConeGeometry(1.7, 4.8, 12), skin, 0, -1.4, 9.6, g); nose.rotation.x = Math.PI / 2 - .25; }
    for (const s of [-1, 1]) {
      const ew = mesh(G.sph, WHITE, s * 3.7, 1.4, 8.1, g); ew.scale.set(1.9, 1.15, .7); ew.userData.by = 1.15; eyes.push(ew);
      const pu = mesh(G.sph, sp.evil ? std(0xff3b1f, { emissive: 0xff2a10, emissiveIntensity: 2 }) : DARK, s * 3.7, 1.4, 8.7, g); pu.scale.set(.85, .85, .5); pu.userData.by = .85; eyes.push(pu);
      const br = mesh(new THREE.BoxGeometry(3.6, .55, .7), DARK, s * 3.9, 3.7, 8.3, g); br.rotation.z = s * (sp.evil ? -.35 : .12);
      const ear = mesh(G.sph, skin, s * 8.5, -.2, -.4, g); ear.scale.set(sp.monkey ? 2.2 : 1.1, sp.monkey ? 3.4 : 2.5, 1.6);
      mesh(G.sph, GOLD, s * 8.9, -3.2, -.4, g).scale.setScalar(sp.female ? 1.5 : 1.1);
    }
    const lips = mesh(G.sph, std(0xb5403d, { roughness: .4 }), 0, -5.2, 8.4, g); lips.scale.set(2.5, .75, .8); g.userData.eyes = eyes; g.userData.lips = lips;
    mesh(new THREE.BoxGeometry(.9, 2.4, .5), RUBY, 0, 5.6, 8.9, g);                      // tilak
    if (sp.evil) { const mo = mesh(new THREE.TorusGeometry(3.2, .55, 6, 14, Math.PI), DARK, 0, -3.8, 8.6, g); mo.rotation.z = Math.PI; mo.scale.set(1.3, .7, 1); }
    const hair = mesh(new THREE.SphereGeometry(1, 20, 14, 0, 6.283, 0, Math.PI * .62), std(sp.hair, { roughness: .8 }), 0, 1.2, -1.4, g); hair.scale.set(9, 11, 10);
    if (sp.crown) {
      const prof = [[0, 0], [9.2, 0], [10, 2.4], [8.4, 5.6], [8, 8], [9.2, 10.4], [7, 13.4], [5.2, 14.4], [6, 17.6], [4.2, 20.6], [2.8, 24], [3.4, 26.6], [1.6, 29.4], [.3, 33], [0, 34]].map(p => new THREE.Vector2(p[0], p[1]));
      const crown = mesh(new THREE.LatheGeometry(prof, 18), GOLD, 0, 8.6, -.4, g); crown.scale.set(1, 1, .96);
      for (const a of [-.95, 0, .95]) { const sp2 = mesh(new THREE.ConeGeometry(1.7, 8, 8), GOLD, Math.sin(a) * 9, 11.6, Math.cos(a) * 3.2 - .4, g); sp2.rotation.z = -a * .35; }
      mesh(new THREE.TorusGeometry(9.3, 1.1, 8, 22), std(0xff9d1c, { metalness: .6, roughness: .3, emissive: 0x7a3a00 }), 0, 9.2, -.4, g).rotation.x = Math.PI / 2;
      mesh(G.sphLow, RUBY, 0, 15, 8.4, g).scale.setScalar(2); mesh(G.sphLow, RUBY, 0, 24, 5, g).scale.setScalar(1.5); mesh(G.sphLow, GOLD, 0, 35, -.4, g).scale.setScalar(1.6);
      for (const s of [-1, 1]) mesh(G.sphLow, EMER, s * 5, 12, 7.2, g).scale.setScalar(1.15);
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
    if (o.point) { const k = o.point; H.arms[0].rotation.x = lerp(H.arms[0].rotation.x, -1.45, k); H.arms[0].rotation.z = lerp(H.arms[0].rotation.z, .12, k); H.arms[0].userData.el.rotation.x = lerp(H.arms[0].userData.el.rotation.x, -.05, k); }
    if (o.kneel) { const k = o.kneel; H.body.position.y -= 34 * k; H.legs[0].rotation.x = -1.35 * k; H.knees[0].rotation.x = 2.3 * k; H.legs[1].rotation.x = -.15 * k; H.knees[1].rotation.x = 1.6 * k; H.torso.rotation.x += .35 * k; for (const i of [0, 1]) { H.arms[i].rotation.x = lerp(H.arms[i].rotation.x, -1.1, k); H.arms[i].userData.el.rotation.x = lerp(H.arms[i].userData.el.rotation.x, -1.4, k); } }
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
      const p = parts[i], k = 1 - p.age / p.life; dummy.position.set(p.x, p.y, p.z); dummy.scale.setScalar(p.r * (.4 + k)); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); pInst.setMatrixAt(i, dummy.matrix);
      tmpC.setHSL(((p.hue % 1) + 1) % 1, 1, .5 + k * .18).multiplyScalar(Math.max(0, k * (k < .3 ? .6 + Math.random() * .4 : 1))); pInst.setColorAt(i, tmpC);
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
  const sitaX = (T) => T < 32 ? 2000 : T < 38 ? K(T, [[32, 2000], [38, 1660]]) : T < 70 ? Math.max(1660, ramX(T) - 100) : T < 75 ? K(T, [[70, 2950], [75, 3250]]) : T < 82.5 ? 3250 : T < 91 ? chX(T) : T < 94 ? K(T, [[91, 5560], [94, 5700]]) : T < 176 ? 5700 : T < 185 ? K(T, [[176, 5700], [185, 5130]]) : T < 205 ? chX(T) : ramX(T) - 30;
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
    { s0: 14.5, n: 11, fx: 1020, cap: 'The sage Vishwamitra takes Ram and Lakshman into the forest. Ram defeats the demoness Tataka, and the sage gives him divine weapons' },
    { s0: 53, n: 11, fx: 2400, cap: 'Queen Kaikeyi asks the king for two boons: Ram must live in the forest, and her son Bharata will be king. Dasharatha collapses in grief, and Ram bows and accepts' },
    { s0: 60, n: 9, fx: 2200, cap: 'Bharata begs Ram to come back. Ram gives him his sandals to rule in his name' },
    { s0: 104.6, n: 13, fx: 4050, cap: 'The monkey kings Sugriva and Vali fight. Ram shoots Vali, and Sugriva becomes king' },
    { s0: 137, n: 16, fx: 5100, cap: "Indrajit, Ravan's son, ties Ram and Lakshman with serpent arrows. The divine eagle Garuda comes and frees them" },
  ];
  let accIns = 0; INS.forEach(a => { a.t0 = a.s0 + accIns; accIns += a.n; });
  const TOTAL = 225 + accIns;
  function mapT(Tr) {
    for (let i = 0; i < INS.length; i++) { const a = INS[i]; if (Tr < a.t0) return { S: Tr - (a.t0 - a.s0), i: -1 }; if (Tr < a.t0 + a.n) return { S: a.s0, i, u: Tr - a.t0 }; }
    return { S: Tr - accIns, i: -1 };
  }
  const sToT = (S) => S + INS.reduce((a, b) => a + (b.s0 < S ? b.n : 0), 0);
  const CAP = [   // story time windows [from, to, text]
    [0, 6, 'Ayodhya: a lotus blooms and a baby of light appears'], [6, 10, 'Ram and his brother Lakshman are born'],
    [10, 22, 'Sage Vishwamitra leads the young princes to guard his sacred ritual'],
    [22, 26, 'Mithila: King Janak holds a contest to win his daughter Sita'], [26, 31, "Ram lifts Shiva's great bow"], [31, 38, 'The bow breaks! Sita walks toward Ram'], [38, 40.5, 'Sita garlands Ram: they are married'],
    [40.5, 52, 'Back in Ayodhya, a promise forces Ram into exile'], [52, 66, 'Ram, Sita and Lakshman leave the palace for fourteen years in the forest'],
    [66, 77, 'A golden deer appears. Sita wants it, and Ram goes after it'], [77, 82.5, "The deer was a demon in disguise. Ram shoots it, and it cries out in Ram's voice"],
    [82.5, 92, 'Ravan carries Sita away in his flying chariot. The vulture Jatayu tries to stop him'], [92, 100, 'Ram and Lakshman find the dying Jatayu, who tells them where Ravan went'],
    [100, 108, 'Hanuman, the monkey hero, bows to Ram and promises to find Sita'], [108, 116, "Hanuman leaps across the sea to Lanka and finds Sita, and gives her Ram's ring"],
    [116, 124, 'Hanuman sets Lanka on fire with his tail and leaps back'], [124, 138, 'The monkey army builds a bridge of stones across the sea. A little squirrel helps too'],
    [138, 150, 'The battle of Lanka: the giant Kumbhakarna falls'], [150, 160, 'Lakshman is struck down. Hanuman flies to bring a healing mountain'],
    [160, 168.6, 'Ram faces the ten-headed Ravan'], [168.6, 177, 'Ravan falls: good wins over evil'], [177, 186, 'Sita is free. They board the flying chariot Pushpak'],
    [186, 205, 'The fourteen years are over: the chariot flies them home to Ayodhya'], [205, 225, 'Diwali: Ayodhya lights a lamp for every step of their return'],
  ];
  function captionAt(Tr) {
    const m = mapT(Tr);
    if (m.i >= 0) { const a = INS[m.i]; return { en: a.cap, a: sstep(0, .9, m.u) * (1 - sstep(a.n - .9, a.n, m.u)) }; }
    for (const [a, b, en] of CAP) if (m.S >= a && m.S < b) { let k = sstep(a, a + .9, m.S) * (1 - sstep(b - .9, b, m.S)); for (const q of INS) k *= sstep(0, .8, Math.abs(m.S - q.s0)); return { en, a: k }; }
    return null;
  }
  const chapters = [0, 10, 22, 40.5, 52, 66, 82.5, 100, 108, 124, 138, 160, 186, 205].map(sToT).concat(INS.map(a => a.t0)).sort((a, b) => a - b);

  // the aim and the arrow of an inserted scene (the actors themselves are posed later)
  function insertParams(i, u, rx) {
    const out = { aw: null, shot: null }, win = (a0, a1, d0, d1) => ({ aim: sstep(a0, a0 + 1.2, u) * (1 - sstep(a1, a1 + .6, u)), draw: sstep(d0, d1, u) * (u < d1 + .05 ? 1 : 0), big: false });
    if (i === 0) { if (u >= 3.6 && u < 7.4) out.aw = win(3.6, 6.8, 4.6, 5.9); const p = (u - 5.9) / .8; if (p >= 0 && p < 1) out.shot = { p, x0: rx + 62, y0: 128, x1: 1130, y1: 110 }; }
    if (i === 3) { if (u >= 5.6 && u < 9.2) out.aw = win(5.6, 8.6, 6.2, 7.3); const p = (u - 7.3) / .9; if (p >= 0 && p < 1) out.shot = { p, x0: rx + 62, y0: 128, x1: 4110, y1: 125 }; }
    return out;
  }
  const hide = (...hs) => hs.forEach(h => { h.root.visible = false; });
  const showAt = (h, x, y, z, ry, sc) => { h.root.visible = true; h.root.position.set(x, y, z); h.root.rotation.set(0, ry, 0); h.root.scale.setScalar(sc); };
  const pop = (a, b, u, sc) => sc * (.2 + .8 * ease(sstep(a, a + 1.1, u))) * (1 - sstep(b - 1.1, b, u) * .97);   // scale in at a, out at b
  function insertActors(ins, Tr, rx, base) {
    hide(tataka, dash, kaik, bharat, sugr, vali, indra);
    garuda.visible = false; sandals.visible = false; orbs.forEach(o => { o.visible = false; }); serpents.forEach(g => { g.visible = false; }); coils.forEach(g => { g.visible = false; });
    if (ins.i < 0) return;
    const u = ins.u, face = -YAW;
    if (ins.i === 0) {   // Vishwamitra's ritual: Tataka charges and falls
      const tx = u < 4 ? lerp(1290, 1130, sstep(.4, 4, u)) : 1130, tf = sstep(6.3, 7.6, u), td = sstep(8.2, 9.6, u);
      if (u > .4 && u < 9.7) { showAt(tataka, tx, 12 * tf, -6, face, 1.5 * (1 - .6 * td) + .001); pose(tataka, { ph: tx * Math.PI / STEP, s: u < 4 ? .75 : 0, t: Tr, cheer: sstep(4, 4.6, u) * (1 - sstep(6, 6.4, u)), talk: u > 4 && u < 6.2 }); tataka.root.rotation.z = -1.5 * tf; if (td > 0 && Math.random() < .8) ember(tx + rnd(-30, 30), rnd(10, 130), 0, true); }
      once('i0a', u >= .4, () => { flashV = .5; burst(1290, 80, 0, .3, 70, 80); });
      once('i0b', u >= 6.7, () => { flashV = .7; burst(1130, 100, 0, .02, 120, 130); });
      once('i0c', u >= 9.3, () => { for (let k = 0; k < 30; k++) ember(1130 + rnd(-20, 20), rnd(20, 100), 0, true); });
      sage.root.rotation.y = YAW; pose(sage, { ph: 0, s: 0, t: Tr, cheer: sstep(8.6, 9.6, u) * (1 - sstep(10.4, 11, u)), talk: u > 8.6 && u < 10.4 });
      orbs.forEach((o, i) => { const a = sstep(9, 9.8, u) * (1 - sstep(10.4, 11, u)); o.visible = a > .02; const an = u * 2.6 + i * 2.09; o.position.set(rx + 20 + Math.cos(an) * 34, 130 + Math.sin(an * 1.3) * 18, 10 + Math.sin(an) * 20); o.scale.setScalar(6 * a + .01); });
    }
    if (ins.i === 1) {   // Kaikeyi's boons
      if (u > .2 && u < 10.9) { const kf = sstep(.2, 1.4, u) * (1 - sstep(9.8, 10.9, u));
        showAt(dash, 2450, 10 * sstep(5.6, 6.8, u), 0, face, kf + .001); pose(dash, { ph: 0, s: 0, t: Tr, kneel: sstep(4.2, 5.4, u), talk: u > 2.2 && u < 4.4 }); dash.root.rotation.z = -1.4 * sstep(5.6, 6.8, u);
        showAt(kaik, 2515, 0, -10, face, kf + .001); pose(kaik, { ph: 0, s: 0, t: Tr, talk: u > 1.8 && u < 5, point: sstep(2.2, 3, u) * (1 - sstep(4.8, 5.4, u)) }); }
      once('i1', u >= .2, () => { flashV = .4; burst(2480, 110, 0, .78, 60, 70); });
      base.ram.kneel = sstep(7, 8.2, u) * (1 - sstep(9.6, 10.6, u));
    }
    if (ins.i === 2) {   // Bharata and the sandals
      const bx = u < 4 ? lerp(1850, 2150, ease(u / 4)) : (u < 6.2 ? 2150 : lerp(2150, 1950, (u - 6.2) / 2.4));
      if (u > .2 && u < 8.7) { showAt(bharat, bx, 0, 4, u < 6.5 ? YAW : -YAW, pop(.2, 8.7, u, 1)); pose(bharat, { ph: bx * Math.PI / STEP, s: (u < 4 || u > 6.2) ? .85 : 0, t: Tr, kneel: sstep(4, 5, u) * (1 - sstep(6.2, 7, u)), talk: u > 1 && u < 4 }); }
      const sp = clamp((u - 5.2) / 1.6), hx = bx, hy = 165;
      sandals.visible = u > 5.2 && u < 8.8; if (sandals.visible) { sandals.position.set(u < 6.8 ? lerp(rx + 12, hx, ease(sp)) : hx, u < 6.8 ? lerp(98, hy, ease(sp)) + Math.sin(Math.PI * sp) * 18 : hy + Math.sin(u * 4) * 1.5, 8); sandals.rotation.y = u * 1.5; sandals.scale.setScalar(1 - sstep(8.2, 8.8, u)); }
      base.ram.point = sstep(4.4, 5.2, u) * (1 - sstep(6, 6.8, u));
      once('i2', u >= 5.4, () => { flashV = .3; burst(rx + 14, 100, 0, .12, 50, 60); });
    }
    if (ins.i === 3) {   // Sugriva and Vali
      const sw = Math.sin(u * 2.6), duel = u > .8 && u < 6, sx = duel ? 4040 + 14 * sw : (u < .8 ? 4040 : 4030), vx = duel ? 4125 - 14 * sw : 4125;
      const vf = sstep(8.2, 9.6, u), vf2 = 1 - sstep(11.6, 12.8, u);
      if (u > .3 && u < 13) { const f = sstep(.3, 1.4, u) * (1 - sstep(11.8, 12.9, u) * .0);
        showAt(sugr, sx, 0, 6, YAW, f + .001); pose(sugr, { ph: sx * Math.PI / STEP, s: 0, t: Tr, kneel: sstep(9.8, 10.8, u) * (1 - sstep(10.8, 11.6, u)), cheer: sstep(11.2, 12, u) * .0 });
        if (u < 8.2) { sugr.arms[0].rotation.x = -1.5 + Math.sin(u * 7) * .6; sugr.arms[1].rotation.x = -1.2 + Math.sin(u * 7 + 2) * .6; sugr.torso.rotation.y = Math.sin(u * 7) * .25; } }
      if (u > .3 && u < 12.9) { showAt(vali, vx, 10 * vf, -4, face, vf2 * (.2 + .8 * ease(sstep(.3, 1.4, u))) + .001); pose(vali, { ph: 0, s: 0, t: Tr, talk: u > 9.4 && u < 11.6 }); if (u < 8.2) { vali.arms[0].rotation.x = -1.5 + Math.sin(u * 7 + 1) * .6; vali.arms[1].rotation.x = -1.2 + Math.sin(u * 7 + 3) * .6; vali.torso.rotation.y = -Math.sin(u * 7 + 1) * .25; } vali.root.rotation.z = -1.4 * vf; }
      once('i3a', u >= .3, () => { flashV = .5; burst(4090, 90, 0, .02, 80, 90); });
      once('i3b', u >= 8.2, () => { flashV = .8; burst(4125, 120, 0, .02, 120, 130); });
      once('i3c', u >= 11, () => { flashV = .7; burst(4030, 150, 0, .12, 100, 110); });
    }
    if (ins.i === 4) {   // Indrajit's serpent arrows and Garuda
      const cx = u < 12.5 ? lerp(5750, 5330, ease(sstep(.2, 1.8, u))) : lerp(5330, 5900, sstep(12.5, 15.5, u)), cy = 150 + Math.sin(u * 2) * 5;
      chariot.visible = u > .1 && u < 15.9; chariot.position.set(cx, cy, 0); chariot.scale.setScalar(1); chariot.userData.mat.color.setHex(0x3a1a6a); chariot.userData.mat.emissive.setHex(0x1a0a40); chariot.userData.wheels.forEach(w => { w.rotation.z = Tr * 4; });
      if (u > .1 && u < 15.9) { showAt(indra, cx - 10, cy + 16, 0, face, 1.1); pose(indra, { ph: 0, s: 0, t: Tr, aim: sstep(1.4, 2.2, u) * (1 - sstep(4.4, 5, u)), draw: sstep(1.6, 3, u) * (u < 4.2 ? 1 : 0), talk: u > 5 && u < 8 }); if (Math.random() < .5) ember(cx + rnd(-30, 30), cy + 4, 0, true); }
      const tgt = [[rx, 105], [rx - 95, 105]];
      serpents.forEach((g, i) => { const t0 = 1.8 + i * .38, p = (u - t0) / .9, tg = tgt[i % 2]; g.visible = p >= 0 && p < 1; if (g.visible) { g.position.set(lerp(cx - 30, tg[0], p), lerp(cy + 40, tg[1], p) + Math.sin(p * 9) * 5, 8); g.rotation.z = Math.atan2(tg[1] - cy - 40, tg[0] - cx + 30) + Math.PI; for (let k = 0; k < 2; k++) ember(g.position.x + 14, g.position.y, 8, false); } });
      const cf = (a) => sstep(a, a + 1.2, u) * (1 - sstep(10, 11, u));
      coils[0].visible = cf(3.2) > .02; coils[0].position.set(rx, 0, 6); coils[0].scale.set(1, .05 + .95 * cf(3.2), 1); coils[0].rotation.y = u * .4;
      coils[1].visible = cf(3.6) > .02; coils[1].position.set(rx - 95, 0, 2); coils[1].scale.set(1, .05 + .95 * cf(3.6), 1); coils[1].rotation.y = -u * .4;
      const rf = sstep(4.2, 5.2, u) * (1 - sstep(11, 12.6, u));
      base.ram.fall = rf; base.lak.fall = rf;
      once('i4a', u >= 4.2, () => { flashV = .7; burst(rx, 110, 0, .38, 90, 100); burst(rx - 95, 110, 0, .38, 90, 100); });
      const gv = u > 8 && u < 15.6; garuda.visible = gv;
      if (gv) { const gx = u < 10.5 ? lerp(5950, 5050, ease((u - 8) / 2.5)) : (u < 13 ? 5050 : lerp(5050, 4250, ease((u - 13) / 2.6))), gy = u < 10.5 ? lerp(320, 200, ease((u - 8) / 2.5)) : (u < 13 ? 200 + Math.sin(u * 3) * 6 : lerp(200, 360, ease((u - 13) / 2.6)));
        garuda.position.set(gx, gy, -30); garuda.rotation.y = Math.PI - .45; const fl = Math.sin(u * 11) * .6; garuda.userData.wings.forEach((w, i) => { w.rotation.x = (i ? -1 : 1) * fl; }); if (Math.random() < .7) ember(gx + rnd(-30, 30), gy - 10, -30, true); }
      once('i4b', u >= 10.4, () => { flashV = 1; burst(5050, 190, 0, .12, 130, 150); });
      once('i4c', u >= 12.6, () => { flashV = .6; burst(5330, 150, 0, .78, 90, 100); });
    }
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
    const open = sstep(1, 5, T);
    petals.forEach(p => { const d = p.userData, ang = lerp(.1, 1.12 - d.ring * .25, open); p.position.set(Math.cos(d.a) * (2 + d.ring * 2), 3, Math.sin(d.a) * (2 + d.ring * 2) * .8); p.rotation.set(0, -d.a, 0); p.rotateZ(-ang); });
    baby.visible = T > 3 && T < 6.6;
    if (baby.visible) { const u = sstep(3, 6, T); baby.position.set(330, 34 + u * 70 + Math.sin(T * 3) * 2, 10); baby.scale.setScalar(1 + sstep(5.4, 6.4, T) * 3); babyLight.position.copy(baby.position); babyLight.intensity = 1.6 * sstep(3, 4, T); } else babyLight.intensity = 0;
    once('birth', T >= 6.0, () => { flashV = 1; burst(380, 100, 10, .12, 150, 150); petalRain(60, 900, 40, 260); });
    ram.root.visible = T >= 6.0; ram.root.scale.setScalar(.2 + .8 * ease(sstep(6.0, 7.2, T)));
    lak.root.visible = T >= 6.3; lak.root.scale.setScalar(.2 + .8 * ease(sstep(6.3, 7.5, T)));

    // Ram: walking, aiming, cheering
    let aw = null;
    for (const [a0, a1, d0, d1] of WIN) if (T >= a0 && T < a1 + .6) aw = { aim: sstep(a0, a0 + 1.2, T) * (1 - sstep(a1, a1 + .6, T)), draw: sstep(d0, d1, T) * (T < d1 + .05 ? 1 : 0), big: a0 < 30 };
    let insShot = null; const base = { ram: {}, lak: {} };
    if (frozen) { const r = insertParams(ins.i, ins.u, rx); if (!aw) aw = r.aw; insShot = r.shot; }
    const rider = T >= 185.5 && T < 205;
    ram.root.position.set(rx, rider ? chY(T) + 16 : 0, 6);
    const po = { ph: rx * Math.PI / STEP, s: rider ? 0 : clamp(Math.abs(vR) / 85), t: Tr };
    if (aw) { po.aim = aw.aim; po.draw = aw.draw; }
    if (T >= 31 && T < 34) po.victory = sstep(31.1, 31.8, T) * (1 - sstep(33, 34, T));
    if (T >= 168.8 && T < 172) po.victory = sstep(168.9, 169.6, T) * (1 - sstep(171, 172, T));
    pose(ram, po);

    // Lakshman
    const lx = lakX(T), vL = fz * vel(lakX, T), lfall = sstep(155.5, 156.4, T) * (1 - sstep(164.5, 166, T));
    lak.root.position.set(lx, T >= 185.5 && T < 205 ? chY(T) + 16 : 12 * lfall, 2);
    pose(lak, { ph: lx * Math.PI / STEP + 2.6, s: (T >= 185.5 && T < 205) ? 0 : clamp(Math.abs(vL) / 85), t: Tr });
    lak.root.rotation.z = -1.45 * lfall;

    // Sita
    const sx = sitaX(T), vS = fz * vel(sitaX, T), captive = T >= 91 && T < 176, sRide = (T >= 82.5 && T < 91) || (T >= 185 && T < 205);
    sita.root.visible = T >= 25.5; sita.root.scale.setScalar(.2 + .8 * ease(sstep(25.5, 26.7, T)));
    sita.root.position.set(sx, sRide ? chY(T) + 16 : 0, 22);
    pose(sita, { ph: sx * Math.PI / STEP + 1.4, s: sRide ? 0 : clamp(Math.abs(vS) / 85), t: Tr, kneel: captive ? .85 * sstep(91.5, 92.5, T) * (1 - sstep(174.5, 176, T)) : 0 });
    sita.root.rotation.y = (T < 32 || captive) ? YAW + .55 : YAW;

    // Hanuman and the vanaras
    const hp = hanPos(T); han.root.visible = hp.vis;
    if (hp.vis) {
      han.root.position.set(hp.x, hp.y, 10); const hv = fz * (hanPos(T + .06).x - hanPos(T - .06).x) / .12;
      han.root.rotation.y = hp.fly ? (hv >= 0 ? 1.4 : -1.4 + Math.PI) : (hp.tail ? (hv >= 0 ? YAW : YAW + 2.4) : YAW);
      pose(han, { ph: hp.x * Math.PI / STEP, s: hp.fly ? 0 : clamp(Math.abs(hv) / 85), t: Tr, kneel: hp.kneel, fly: hp.fly, cheer: sstep(176, 177, T) * (1 - sstep(182, 183, T)) });
      han.tailTip.visible = hp.tail > 0;
      if (hp.tail) { han.tailTip.getWorldPosition(wp); for (let i = 0; i < 4; i++) ember(wp.x, wp.y, wp.z, true); }
    }
    mount.visible = hp.vis && hp.mount > .02; if (mount.visible) { mount.position.set(hp.x, hp.y + 150, 10); mount.scale.setScalar(hp.mount); mount.rotation.y = T * .8; }
    vanaras.forEach((v, i) => {
      const vis = T >= 119 && T < 185; v.root.visible = vis; if (!vis) return;
      const f = (t) => (t < 152 ? ramX(t) : ramX(152)) - 130 - i * 44, x = f(T), vv = fz * (f(T + .06) - f(T - .06)) / .12;
      v.root.position.set(x, 0, 14 + (i % 2) * 14); pose(v, { ph: x * Math.PI / STEP + i, s: clamp(Math.abs(vv) / 85), t: Tr, cheer: sstep(176, 177, T) * (1 - sstep(182, 183, T)) });
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
    once('garland', T >= 38.6, () => { burst(1700, 150, 12, .1, 80, 90); petalRain(1500, 1900, 40, 260); });
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
    const dv = T >= 66 && T < 77;
    deer.visible = dv;
    if (dv) { const dx = deerX(T), hop = Math.abs(Math.sin(T * 4.2)) * 26; deer.position.set(dx, hop, -26); deer.legs.forEach((l, i) => { l.rotation.x = Math.sin(T * 8.4 + (i % 2) * 2.4 + (i > 1 ? 1.4 : 0)) * .9; }); deer.scale.setScalar(.85 + sstep(66, 68, T) * .15); if (Math.random() < .6) ember(dx, 60 + hop, -26, false); }
    once('deerhit', T >= 76.9, () => { flashV = .6; burst(3640, 70, 0, .12, 110, 120); });

    // 7. Ravan comes to the hut, takes Sita in his flying chariot; Jatayu fights him and falls
    const rp = T < 80 ? null : T < 82.5 ? { x: 3420, y: 0 } : T < 91 ? { x: chX(T) - 14, y: chY(T) + 18 } : { x: 5560, y: 0 };
    const burn = sstep(168.6, 177, T), ravS = 1.1 * (1 - .5 * burn);
    rav.root.visible = rp !== null && burn < .985;
    if (rp) {
      rav.root.scale.set(1.1 * (1 + burn * .1), ravS, 1.1);
      rav.root.position.set(rp.x + (T > 168.6 && T < 175 ? Math.sin(T * 60) * 2.5 * (1 - burn) : 0), rp.y, -10);
      pose(rav, { ph: 0, s: 0, t: Tr }); rav.root.rotation.y = YAW - .4; rav.heads.forEach((h, i) => { h.rotation.y = Math.sin(Tr * 1.1 + i) * .18; });
    }
    once('abduct', T >= 80, () => { flashV = 1; burst(3420, 110, 10, .78, 120, 130); });
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
    if (T > 116 && T < 121) for (let i = 0; i < 6; i++) ember(rnd(5170, 5810), rnd(40, 190), rnd(-30, 10), true);
    once('lankaburn', T >= 116, () => { flashV = .5; });
    if (hp.fly && hp.vis) ember(hp.x - 20, hp.y + 60, 10, false);
    stones.forEach(m => { const a = clamp((T - m.userData.t) / .7), sc = a <= 0 ? .001 : (a < 1 ? 1 + .35 * Math.sin(Math.PI * a) : 1); m.scale.setScalar(sc * (a > 0 ? 1 : .001)); if (a > 0 && a < 1 && Math.random() < .6) ember(m.position.x, 16, 10, false); });
    const sp = seaGeo.attributes.position; for (let i = 0; i < sp.count; i++) { const x = seaBase[i * 3], y = seaBase[i * 3 + 1]; sp.setY(i, y + Math.sin(x * .045 + Tr * 2.2) * 2.6 + Math.sin(x * .11 - Tr * 3) * 1.1); } sp.needsUpdate = true;

    // 11. Kumbhakarna, Lakshman struck down, the healing mountain
    kum.root.visible = T >= 138 && T < 155.5;
    if (kum.root.visible) { const f = sstep(148, 150.5, T); kum.root.position.set(5320, 14 * f, -10); kum.root.rotation.y = YAW - .5; kum.root.rotation.z = -1.5 * f; kum.root.scale.setScalar(1.9 * (1 - .9 * sstep(153, 155.5, T))); pose(kum, { ph: 0, s: 0, t: Tr }); }
    once('khit', T >= 147.6, () => { flashV = .8; burst(5255, 150, 0, .02, 130, 160); });
    once('lakhit', T >= 155.5, () => { flashV = .6; burst(5110, 110, 0, .02, 80, 110); });
    once('mount', T >= 158, () => { flashV = .9; burst(4900, 120, 0, .38, 130, 150); burst(5110, 60, 0, .38, 90, 100); });
    // 12. Ravan falls
    once('hit', T >= 168.6, () => { flashV = 1; burst(5560, 150, 0, .02, 170, 190); });
    for (const [k, t, dx, y, h] of [['r2', 169.2, -60, 250, .12], ['r3', 169.9, 70, 210, .9], ['r4', 170.8, 10, 120, .55], ['r5', 171.8, -300, 230, .12], ['r6', 172.8, 250, 250, .08], ['r7', 174, -120, 260, .8]]) once(k, T >= t, () => burst(5560 + dx, y, 20, h, 125));
    if (T > 168.6 && T < 177) for (let i = 0; i < 6; i++) ember(rav.root.position.x + rnd(-45, 45), rnd(5, 230) * ravS, rnd(0, 20), true);
    once('freed', T >= 176, () => { burst(5700, 100, 0, .13, 90, 90); });
    once('board', T >= 185.5, () => { flashV = .6; });
    once('land', T >= 205, () => { flashV = .7; burst(560, 110, 0, .1, 100, 110); petalRain(100, 1100, 60, 280); });

    // 13–14. diyas light as the chariot flies home; lanterns, fireworks and the greeting
    world.diyas.forEach(d => { const u = d.userData, chp = chX(T), lit = Math.max(u.x < 700 ? sstep(7, 9, T) : 0, T >= 186 ? sstep(chp - 30, chp + 120, u.x) : 0), fl = .85 + .15 * Math.sin(Tr * 12 + u.ph); u.fl.visible = lit > .02; u.fl.scale.set(1, (.6 + .4 * lit) * fl, 1); u.gl.material.opacity = .55 * lit * fl; });
    world.lanterns.forEach(l => { const u = l.userData, a = sstep(205, 209, T); l.visible = a > 0 && T < 225; l.position.set(u.x + Math.sin(T * .6 + u.ph) * 14, u.y0 + (T - 205) * u.sp, -10 + Math.sin(u.ph) * 20); l.scale.setScalar(.8 + (u.ph % 1) * .5); });
    for (let k = 0; k < 12; k++) once('fw' + k, T >= 206 + k * 1.4, () => burst(150 + (k * 173) % 1100, 150 + (k * 47) % 110, rnd(-30, 20), [.1, .92, .55, .35, .02, .78][k % 6], 120));
    once('petal2', T >= 207, () => petalRain(100, 1200, 60, 260));
    label.material.opacity = sstep(208, 211, T) * (1 - sstep(221, 223.5, T));
    // the sage who guides the princes, and the inserted scenes
    const sv = T >= 10 && T < 26; sage.root.visible = sv;
    if (sv) { const sxx = ramX(T) + 130, vs = fz * vel(ramX, T); sage.root.position.set(sxx, 0, 4); sage.root.rotation.y = YAW; sage.root.scale.setScalar(.2 + .8 * ease(sstep(10, 11.2, T)) * (1 - sstep(24.4, 26, T) * .97)); pose(sage, { ph: sxx * Math.PI / STEP, s: clamp(Math.abs(vs) / 85), t: Tr }); }
    insertActors(ins, Tr, rx, base);
    if (frozen) {   // re-pose the main cast for the inserted scene (kneeling, pointing, fallen)
      const rp = { ph: rx * Math.PI / STEP, s: 0, t: Tr }; if (aw) { rp.aim = aw.aim; rp.draw = aw.draw; } if (base.ram.kneel) rp.kneel = base.ram.kneel; if (base.ram.point) rp.point = base.ram.point; if (ins.i === 3 && aw) rp.talk = false;
      pose(ram, rp); ram.root.rotation.z = -1.45 * (base.ram.fall || 0); ram.root.position.y = 12 * (base.ram.fall || 0);
      lak.root.rotation.z = -1.45 * (base.lak.fall || 0); lak.root.position.y = 12 * (base.lak.fall || 0);
    }
    // a little squirrel carries pebbles to the bridge
    const sqv = T >= 121 && T < 136; squirrel.visible = sqv;
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
