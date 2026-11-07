// Lists every line the narrator reads (captions, lessons, the ending), so tools/narration-times.py can time them.
// Usage: node tools/narration-texts.js > texts.json
const fs = require('fs'), path = require('path'), src = fs.readFileSync(path.join(__dirname, '..', 'wall', 'src', 'r3.js'), 'utf8');
const out = new Set(), q = (re) => { let m; while ((m = re.exec(src))) out.add(JSON.parse(m[1][0] === "'" ? '"' + m[1].slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"') + '"' : m[1])); };
const ins = src.slice(src.indexOf('const INS = ['), src.indexOf('  // ---------- time to read'));
for (const m of ins.matchAll(/cap: ("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'), moral: ("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)) for (const g of [m[1], m[2]]) { const t = g[0] === "'" ? g.slice(1, -1).replace(/\\'/g, "'") : JSON.parse(g); if (t) out.add(t); }
const cap = src.slice(src.indexOf('  const CAP = ['), src.indexOf('  ];', src.indexOf('  const CAP = [')));
for (const m of cap.matchAll(/\[[\d.]+, [\d.]+, ("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')(?:, ("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))?/g)) for (const g of [m[1], m[2]]) { if (!g) continue; const t = g[0] === "'" ? g.slice(1, -1).replace(/\\'/g, "'") : JSON.parse(g); if (t) out.add(t); }
global.window = {}; new Function(fs.readFileSync(path.join(__dirname, '..', 'wall', 'src', 'outro.js'), 'utf8'))();
for (const c of window.VishnuOutro.CARDS) if (c.en) out.add(c.en);
process.stdout.write(JSON.stringify([...out], null, 1));
