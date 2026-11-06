// Usage: node tools/caption-schedule.js out.json  - lists when each caption, lesson and book heading appears (seconds into the loop), for the narration.
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 400, height: 300 } });
  await p.goto('file:///home/user/diwali-ramayan/wall/index.html?mode=play&t=0&hold'); await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const ev = []; let cur = null, curM = false, curK = '';
    for (let t = 0; t < R3.LOOP; t += .05) {
      const c = R3.caption(t); const on = c.en && c.a > .05;
      if (on && (!cur || cur.en !== c.en)) { if (cur) cur.end = t; cur = { type: 'cap', t, en: c.en, moral: c.moral }; ev.push(cur); curM = false; }
      if (!on && cur) { cur.end = t; cur = null; }
      if (c.moral && c.am > .05 && !curM && cur) { ev.push({ type: 'moral', t, en: c.moral }); curM = true; }
      if (!c.kanda) continue; const kk = c.kanda.book + c.kanda.name; if (kk !== curK) { ev.push({ type: 'kanda', t, en: c.kanda.book + '. ' + c.kanda.name + (c.kanda.sub ? '. ' + c.kanda.sub : '') }); curK = kk; }
    }
    if (cur) cur.end = R3.LOOP; return { loop: R3.LOOP, intro: R3.INTRO || 0, ev };
  });
  fs.writeFileSync(process.argv[2], JSON.stringify(r, null, 1)); console.log(r.ev.length, 'events'); await b.close();
})();
