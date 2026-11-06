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
  const LOOP = 90, WORLD = 6000, YAW = 1.12;

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
  };

  function makeHead(sp, scale) {
    const g = new THREE.Group(), skin = std(sp.skin, { roughness: .5, emissive: new THREE.Color(sp.skin).multiplyScalar(.05) });
    const head = mesh(G.sph, skin, 0, 0, 0, g); head.scale.set(8.4, 10.4, 9);
    const jaw = mesh(G.sph, skin, 0, -6.4, 1.4, g); jaw.scale.set(6.2, 5.6, 7);
    const nose = mesh(new THREE.ConeGeometry(1.7, 4.8, 12), skin, 0, -1.4, 9.6, g); nose.rotation.x = Math.PI / 2 - .25;
    for (const s of [-1, 1]) {
      const ew = mesh(G.sph, WHITE, s * 3.7, 1.4, 8.1, g); ew.scale.set(1.9, 1.15, .7);
      const pu = mesh(G.sph, sp.evil ? std(0xff3b1f, { emissive: 0xff2a10, emissiveIntensity: 2 }) : DARK, s * 3.7, 1.4, 8.7, g); pu.scale.set(.85, .85, .5);
      const br = mesh(new THREE.BoxGeometry(3.6, .55, .7), DARK, s * 3.9, 3.7, 8.3, g); br.rotation.z = s * (sp.evil ? -.35 : .12);
      const ear = mesh(G.sph, skin, s * 8.5, -.2, -.4, g); ear.scale.set(1.1, 2.5, 1.6);
      mesh(G.sph, GOLD, s * 8.9, -3.2, -.4, g).scale.setScalar(sp.female ? 1.5 : 1.1);
    }
    const lips = mesh(G.sph, std(0xb5403d, { roughness: .4 }), 0, -5.2, 8.4, g); lips.scale.set(2.5, .75, .8);
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
      H.legs[i].rotation.x = -sw * .62 * s;
      H.knees[i].rotation.x = (Math.max(0, Math.cos(p)) * .95 + .04) * s;
      const arm = H.arms[i];
      arm.rotation.x = sw * .55 * s + (1 - s) * .03; arm.rotation.z = (i ? -1 : 1) * (.06 + (1 - s) * .03);
      arm.userData.el.rotation.x = -(.25 + Math.max(0, -sw) * .5) * s - (1 - s) * .12;
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
    g.scale.setScalar(sc); return g;
  }
  function makeTree(h) {
    const g = new THREE.Group(); mesh(new THREE.CylinderGeometry(3.4, 5.2, h * .55, 8), std(0x2a1a10, { roughness: .9 }), 0, h * .27, 0, g);
    const leaf = std(0x0e5a52, { roughness: .6, emissive: 0x052a26 });
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
  const palaceR = makePalace(1.15); palaceR.position.set(5640, 0, 0); scene.add(palaceR);
  const court = makePillars(); court.position.set(1050, 0, 0); scene.add(court);
  for (const [x, h] of [[2380, 215], [2610, 250], [2890, 200], [3140, 240], [3420, 210], [3680, 250], [3920, 200], [2150, 190]]) { const t = makeTree(h); t.position.set(x, 0, rnd(-70, -30)); scene.add(t); world.trees.push(t); }
  const lanka = makeLanka(); lanka.position.set(4250, 0, 0); scene.add(lanka);
  const moon = mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0xfff1d0 }), 5400, 215, -300, scene); moon.scale.setScalar(26);
  const redMoon = mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0xff4a2a }), 4200, 215, -300, scene); redMoon.scale.setScalar(26);

  // Shiva's bow on a pedestal
  const pedestal = mesh(new THREE.BoxGeometry(70, 26, 26), std(0x3a2a4a, { roughness: .4, metalness: .4 }), 1500, 13, 0, scene);
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
  const ram = makeHuman('ram'), sita = makeHuman('sita'), lak = makeHuman('lakshman'), rav = makeRavan(); rav.root.position.set(4650, 0, -10);
  const deer = makeDeer(); scene.add(deer); deer.visible = false;
  for (const h of [ram, sita, lak, rav]) scene.add(h.root);
  ram.root.visible = false;

  // diyas along the last stretch and near the start
  const diyaGeo = new THREE.LatheGeometry([[0, 0], [4.4, 1.2], [6, 4.4], [5.2, 5.6], [0, 4.6]].map(p => new THREE.Vector2(p[0], p[1])), 12), diyaMat = std(0xb85a1c, { roughness: .6, emissive: 0x3a1204 });
  const flameGeo = new THREE.ConeGeometry(2.1, 9, 8); flameGeo.translate(0, 4.5, 0);
  for (const x of [...Array.from({ length: 12 }, (_, k) => 4700 + k * 100), ...Array.from({ length: 10 }, (_, k) => 5560 + k * 38), 100, 160, 220, 280, 380, 440, 500, 560]) {
    const d = new THREE.Group(); d.position.set(x, 0, 36 + (x % 3) * 3); d.add(new THREE.Mesh(diyaGeo, diyaMat));
    const fl = new THREE.Mesh(flameGeo, glowMat(0xffb24a)); fl.position.set(0, 5.6, 0); d.add(fl); const gl = mesh(G.sph, glowMat(0xff8a2a), 0, 8, 0, d); gl.scale.setScalar(10); gl.material.opacity = .0;
    d.userData = { x, fl, gl, ph: Math.random() * 10 }; scene.add(d); world.diyas.push(d);
  }
  // lanterns for the homecoming
  const lanMat = std(0xff9a3c, { emissive: 0xff7a18, emissiveIntensity: 1.3, roughness: .6 });
  for (let k = 0; k < 14; k++) { const l = mesh(new THREE.CylinderGeometry(9, 6, 22, 10), lanMat, 0, 0, 0, scene); l.userData = { x: 4900 + k * 85 + rnd(-30, 30), y0: rnd(40, 130), sp: rnd(7, 14), ph: rnd(0, 6) }; l.visible = false; world.lanterns.push(l); }
  // greeting text
  const label = (function () {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const x = c.getContext('2d');
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = 'rgba(255,170,60,1)'; x.shadowBlur = 24; x.fillStyle = '#ffe9b0';
    x.font = '700 130px "Noto Sans Devanagari","Mangal",Georgia,serif'; x.fillText('शुभ दीपावली', 512, 96);
    x.font = '600 54px Georgia,serif'; x.fillStyle = '#ffcf70'; x.fillText('Happy Diwali', 512, 205);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(400, 100), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(5900, 200, 20); m.material.opacity = 0; scene.add(m); return m;
  })();

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
  function petalRain(x0, x1, n, top) { for (let i = 0; i < n; i++) pets.push({ x: rnd(x0, x1), y: top + rnd(-30, 30), z: rnd(-20, 40), vy: -rnd(22, 46), ph: rnd(0, 6.3), rot: rnd(0, 6.3), age: 0, life: 12, col: [0xffb3c7, 0xff9d1c, 0xffd9a0, 0xff7a9c][i % 4] }); }
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
  const seg = (T, t0, t1, x0, x1) => T <= t0 ? x0 : T >= t1 ? x1 : lerp(x0, x1, ease((T - t0) / (t1 - t0)));
  function ramX(T) {
    if (T < 7) return 430;
    if (T < 16.5) return seg(T, 7, 16.5, 430, 1335);
    if (T < 26) return 1335;
    if (T < 54) return seg(T, 26, 54, 1335, 3720);
    if (T < 64) return 3720;
    return seg(T, 64, 83, 3720, 5640);
  }
  const sitaX = (T) => T < 21.5 ? 1690 : T < 25.2 ? seg(T, 21.5, 25.2, 1690, 1410) : Math.max(1410, ramX(T) - 100);
  const lakX = (T) => Math.max(2330, ramX(T) - 200);
  // where the camera looks when it follows the story
  const follow = (T) => lerp(ramX(T) - 120, 4220, sstep(52.5, 56, T) * (1 - sstep(65, 69, T)));
  const vel = (f, T) => (f(T + .06) - f(T - .06)) / .12;
  const STEP = 58;   // length of one stride

  const fired = {}; let lastT = -1, flashV = 0, babyT = -1;
  const once = (k, c, fn) => { if (c && !fired[k]) { fired[k] = 1; fn(); } };
  function resetAll() { for (const k in fired) delete fired[k]; parts = []; pets = []; flashV = 0; }

  function update(T, dt) {
    if (T < lastT - .0001) resetAll();
    lastT = T; flashV = Math.max(0, flashV - dt * 1.7);
    spotC = follow(T) + 80; spotH = lerp(950, 1250, sstep(52.5, 56, T) * (1 - sstep(65, 69, T)));
    const rx = ramX(T), vR = vel(ramX, T), vS = vel(sitaX, T), vL = vel(lakX, T);

    // lotus and the baby of light (the birth of Ram)
    const open = sstep(1, 5, T);
    petals.forEach(p => { const d = p.userData, ang = lerp(.1, 1.12 - d.ring * .25, open); p.position.set(Math.cos(d.a) * (2 + d.ring * 2), 3, Math.sin(d.a) * (2 + d.ring * 2) * .8); p.rotation.set(0, -d.a, 0); p.rotateZ(-ang); });
    baby.visible = T > 3 && T < 6.6;
    if (baby.visible) { const u = sstep(3, 6, T); baby.position.set(330, 34 + u * 70 + Math.sin(T * 3) * 2, 10); baby.scale.setScalar(1 + sstep(5.4, 6.4, T) * 3); babyLight.position.copy(baby.position); babyLight.intensity = 1.6 * sstep(3, 4, T); } else babyLight.intensity = 0;
    once('birth', T >= 6.0, () => { flashV = 1; burst(380, 100, 10, .12, 150, 150); petalRain(60, 900, 40, 260); });
    ram.root.visible = T >= 6.0;
    const born = sstep(6.0, 7.2, T); ram.root.scale.setScalar(.2 + .8 * ease(born));

    // Ram
    const rs = clamp(Math.abs(vR) / 55) , rph = rx * Math.PI / STEP;
    ram.root.position.set(rx, 0, 6);
    const lift = sstep(16.5, 18.2, T), draw1 = sstep(18.4, 21, T), snapped = T >= 21.0;
    const aim2 = sstep(54.2, 55.6, T) * (1 - sstep(58, 58.6, T)), draw2 = sstep(55.2, 57.4, T) * (T < 57.5 ? 1 : 0);
    const po = { ph: rph, s: rs, t: T };
    if (T >= 16.5 && T < 21.0) { po.aim = lift; po.draw = draw1; }
    else if (T >= 54.2 && T < 59) { po.aim = aim2; po.draw = draw2; }
    if (snapped && T < 24) po.victory = sstep(21.1, 21.8, T) * (1 - sstep(23, 24, T));
    if (T >= 82.5) po.victory = sstep(82.5, 83.6, T) * .0;
    pose(ram, po);
    // Sita and Lakshman
    sita.root.position.set(sitaX(T), 0, 22); pose(sita, { ph: sitaX(T) * Math.PI / STEP + 1.4, s: clamp(Math.abs(vS) / 55), t: T });
    sita.root.rotation.y = T < 21.5 ? YAW + .55 : YAW;
    lak.root.position.set(lakX(T), 0, 2); pose(lak, { ph: lakX(T) * Math.PI / STEP + 2.6, s: clamp(Math.abs(vL) / 55), t: T });
    sita.root.visible = T > 1;   // she is there from the start, waiting at Mithila
    // Shiva's bow: lies on the pedestal, is lifted, bent, and snapped
    const handAt = new THREE.Vector3(), rt = ram.arms[0].userData.hand;
    ram.root.updateMatrixWorld(true);
    if (T < 16.8) { bigBow.visible = true; bigBow.position.set(1500, 40 + Math.sin(T * 2) * 2, 4); bigBow.rotation.set(0, 0, Math.PI / 2); bigBow.scale.setScalar(.95); }
    else if (T < 21.0) { rt.getWorldPosition(handAt); bigBow.position.copy(handAt).add(new THREE.Vector3(5, 0, 0)); bigBow.rotation.set(0, 0, 0); bigBow.scale.setScalar(1); bigBow.position.x += 2; }
    bigBow.visible = T < 21.0;
    // bend the big bow while drawing
    if (bigBow.visible) {
      const d = T >= 16.8 ? draw1 : 0, curve = bowCurve(78 - d * 8, 24 + d * 8);
      bigBowMesh.geometry.dispose(); bigBowMesh.geometry = new THREE.TubeGeometry(curve, 24, 2.6, 8);
      const sp = bigString.geometry.attributes.position; sp.setXYZ(0, 0, 78 - d * 8, 0); sp.setXYZ(1, -d * 34, 0, 0); sp.setXYZ(2, 0, -(78 - d * 8), 0); sp.needsUpdate = true;
    }
    once('snap', T >= 21.0, () => { flashV = 1; ring3(); burst(1470, 130, 12, .12, 160, 170); petalRain(1000, 1900, 70, 280); halves.forEach(h => { h.visible = true; h.userData = { t0: T }; h.position.set(1475, 130, 10); }); });
    halves.forEach((h, i) => { if (!h.visible) return; const a = T - h.userData.t0, g = i ? -1 : 1; h.position.set(1475 + g * a * 90, 130 - a * 70 + 190 * a * a * -.0 + (-170 * a * a), 10); h.rotation.z = g * a * 3; h.rotation.x = Math.PI / 2; if (a > 2.2 || h.position.y < 6) h.visible = false; });
    // Ram's bow: slung while walking, in hand to shoot Ravan
    if (T < 26) bow.visible = false; else bow.visible = true;
    if (T >= 54.2 && T < 59) {
      const f = ram.arms[0].userData.hand, b = ram.arms[1].userData.hand, fp = new THREE.Vector3(), bp = new THREE.Vector3(); f.getWorldPosition(fp); b.getWorldPosition(bp);
      bow.position.copy(fp); bow.rotation.set(0, 0, 0); bow.scale.setScalar(1.3); bow.updateMatrixWorld(true);
      const bl = bow.worldToLocal(bp.clone()), sp = bowString.geometry.attributes.position;
      sp.setXYZ(0, 0, 38, 0); sp.setXYZ(1, bl.x, bl.y, bl.z); sp.setXYZ(2, 0, -38, 0); sp.needsUpdate = true;
      arrow.visible = T < 57.5 && draw2 > .05; if (arrow.visible) { arrow.position.copy(bp).add(new THREE.Vector3(30, 0, 0)); arrow.rotation.set(0, 0, 0); }
    } else if (T >= 26) {
      bow.position.set(rx - 22, 112, -14); bow.rotation.set(0, .5, .3); bow.scale.setScalar(1.25);
      const sp = bowString.geometry.attributes.position; sp.setXYZ(0, 0, 38, 0); sp.setXYZ(1, 0, 0, 0); sp.setXYZ(2, 0, -38, 0); sp.needsUpdate = true; arrow.visible = false;
    }
    // the arrow flies to Ravan
    const shot = T - 57.6, flying = shot >= 0 && shot < 1.0;
    if (flying) {
      const p = shot / 1.0, x0 = rx + 62, y0 = 128, x1 = rav.root.position.x - 40, y1 = 150; arrow.visible = true;
      arrow.position.set(lerp(x0, x1, p), lerp(y0, y1, p) + Math.sin(Math.PI * p) * 8, 10); arrow.rotation.set(0, 0, Math.atan2(y1 - y0, x1 - x0));
      for (let i = 0; i < 3; i++) ember(arrow.position.x - 18, arrow.position.y, 10, true);
    } else if (T >= 58.6) arrow.visible = false;
    once('hit', T >= 58.6, () => { flashV = 1; ring3(); burst(rav.root.position.x, 150, 12, .02, 170, 190); });
    for (const [k, t, dx, y, h] of [['r2', 59.2, -60, 250, .12], ['r3', 59.9, 70, 210, .9], ['r4', 60.8, 10, 120, .55], ['r5', 61.8, -300, 230, .12], ['r6', 62.8, 250, 250, .08], ['r7', 64, -120, 260, .8]]) once(k, T >= t, () => burst(rav.root.position.x + dx, y, 20, h, 125));
    // Ravan wakes, burns and crumbles
    const burn = sstep(58.6, 67, T), ravS = 1.1 * (1 - .5 * burn);
    rav.root.scale.set(1.1 * (1 + burn * .1), ravS, 1.1);
    rav.root.position.x = 4650 + (T > 58.6 && T < 66 ? Math.sin(T * 60) * 2.5 * (1 - burn) : 0);
    rav.root.visible = burn < .985;
    rav.root.traverse(o => { if (o.material && o.material.opacity !== undefined && o.material.transparent === false) {} });
    const rpose = { ph: 0, s: 0, t: T }; pose(rav, rpose); rav.root.rotation.y = YAW - .4;
    rav.heads.forEach((h, i) => { h.rotation.y = Math.sin(T * 1.1 + i) * .18; });
    if (T > 58.6 && T < 67) for (let i = 0; i < 6; i++) ember(rav.root.position.x + rnd(-45, 45), rnd(5, 230) * ravS, rnd(0, 20), true);
    if (T > 66.5 && T < 72) for (let i = 0; i < 2; i++) ember(rav.root.position.x + rnd(-60, 60), rnd(0, 30), rnd(0, 20), false);
    // the golden deer
    const dv = T > 30 && T < 50;
    deer.visible = dv;
    if (dv) { const u = (T - 30) / 20, dx = lerp(2600, 4180, u), hop = Math.abs(Math.sin(T * 4.2)) * 26; deer.position.set(dx, hop, -30); deer.legs.forEach((l, i) => { l.rotation.x = Math.sin(T * 8.4 + (i % 2) * 2.4 + (i > 1 ? 1.4 : 0)) * .9; }); deer.scale.setScalar(.85 + sstep(30, 32, T) * .15 - sstep(48, 50, T) * .85); if (Math.random() < .5) ember(dx, 60 + hop, -30, false); }
    // diyas light up as Ram passes
    world.diyas.forEach((d, i) => { const u = d.userData, lit = u.x < 700 ? sstep(7, 9, T) : sstep(u.x - 130, u.x + 10, rx), fl = .85 + .15 * Math.sin(T * 12 + u.ph); u.fl.visible = lit > .02; u.fl.scale.set(1, (.6 + .4 * lit) * fl, 1); u.gl.material.opacity = .55 * lit * fl; });
    world.lanterns.forEach(l => { const u = l.userData, a = sstep(70, 74, T); l.visible = a > 0; l.position.set(u.x + Math.sin(T * .6 + u.ph) * 14, u.y0 + (T - 70) * u.sp, -10 + Math.sin(u.ph) * 20); l.scale.setScalar(.8 + (u.ph % 1) * .5); });
    // Diwali fireworks and greeting
    [[0, 70], [1, 71.3], [2, 72.5], [3, 73.8], [4, 75], [5, 76.4], [6, 77.8], [7, 79.2], [8, 80.6], [9, 82], [10, 83.6], [11, 85]].forEach(([k, t]) => once('fw' + k, T >= t, () => burst(5100 + (k * 173) % 1000, 150 + (k * 47) % 110, rnd(-30, 20), [.1, .92, .55, .35, .02, .78][k % 6], 120)));
    once('petal2', T >= 72, () => petalRain(5000, 6000, 60, 260));
    label.material.opacity = sstep(76, 79, T) * (1 - sstep(87.2, 89, T));
    // light flashes
    lights.flash.intensity = flashV * 2.6; if (flashV > 0) lights.flash.position.set(T < 20 ? 1470 : T < 40 ? 1470 : rav.root.position.x, 150, 200);
    if (T >= 6 && T < 6.2) lights.flash.position.set(330, 120, 200);
    stepParts(dt);
  }
  function ring3() { }

  // ---------- view and render ----------
  let vw = 0, vh = 0, spotC = 400, spotH = 950;
  function setView(x0, x1, yTop, yBottom, pxW, pxH, sx, sy) {
    pxW = Math.max(16, Math.round(pxW)); pxH = Math.max(8, Math.round(pxH));
    if (pxW !== vw || pxH !== vh) { vw = pxW; vh = pxH; renderer.setSize(pxW, pxH, false); composer.setSize(pxW, pxH); }
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
  return { canvas, setView, update, render, LOOP, WORLD, ramX, sitaX, lakX, follow, bloom };
})();
