const { chromium } = require('playwright');
const { spawn } = require('child_process');
// Usage: node tools/render-video.js <page.html> <out.mp4> [seconds=120] [fps=30] [cssWidth=1024] [cssHeight=768]
// Renders at 2x, so the defaults give a 2048x1536 (iPad 4:3) H.264 MP4. Needs ffmpeg and playwright.
const [,, page, out, secs = '120', fps = '30', w = '1024', h = '768'] = process.argv;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
  await p.addInitScript((fps) => {
    let now = 0, q = [];
    performance.now = () => now;
    window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
    window.__step = () => { now += 1000 / fps; const c = q; q = []; c.forEach(f => f(now)); };
  }, +fps);
  await p.goto('file://' + require('path').resolve(page));
  await p.addStyleTag({ content: '#ui,#hint,#err{display:none!important}' });
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', fps, '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-level', '5.1', '-movflags', '+faststart', '-tag:v', 'avc1', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const total = +secs * +fps;
  for (let i = 0; i < total; i++) {
    const data = await p.evaluate(() => { window.__step(); return document.getElementById('c').toDataURL('image/jpeg', 0.95).split(',')[1]; });
    if (!ff.stdin.write(Buffer.from(data, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 300 === 0) console.log(`frame ${i}/${total}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await b.close();
  console.log('done', out);
})();
