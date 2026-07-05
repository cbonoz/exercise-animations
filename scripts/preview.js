// Local exercise animation preview server
// Run: node scripts/preview.js
// Open: http://localhost:3001

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const ROOT = path.join(__dirname, '..');
const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'animation-plan.json'), 'utf-8'));

const SCENES = plan.exercises.map(e => ({
  dir: e.id,
  name: e.name,
  group: e.group,
}));

const MIME = {
  '.html': 'text/html', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.js': 'application/javascript',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
};

const HTML = `<!DOCTYPE html>
<html>
<head>
  <title>BridgeRecovery - Exercise Animations</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, sans-serif; background: #0f0f1a; color: #fff; }
    .app { max-width: 960px; margin: 0 auto; padding: 32px; }
    h1 { font-size: 28px; margin-bottom: 4px; }
    .sub { color: #888; margin-bottom: 32px; font-size: 14px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
    .card { background: #1a1a2e; border-radius: 12px; overflow: hidden; cursor: pointer; transition: transform .2s, box-shadow .2s; }
    .card:hover { transform: translateY(-3px); box-shadow: 0 8px 30px rgba(32,138,239,0.25); }
    .info { padding: 14px 18px; }
    .name { font-size: 15px; font-weight: 600; }
    .path { font-size: 11px; color: #666; margin-top: 3px; }
    .fullscreen { display: none; position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:100; justify-content:center; align-items:center; }
    .fullscreen.open { display:flex; }
    .fs-close { position:absolute; top:24px; right:32px; font-size:28px; color:#fff; cursor:pointer; background:none; border:none; }
    .fs-name { position:absolute; bottom:40px; color:#fff; font-size:18px; font-weight:600; }
  </style>
</head>
<body>
  <div class="app">
    <h1>BridgeRecovery</h1>
    <div class="sub">Exercise Stick Figure Animations — ${SCENES.length} exercises</div>
    <div class="grid" id="grid"></div>
  </div>
  <div class="fullscreen" id="fullscreen">
    <button class="fs-close" onclick="closeFS()">✕</button>
    <div id="fsCanvas" style="position:relative;width:800px;height:600px;background:#0f0f1a;border-radius:12px;overflow:hidden"></div>
    <div class="fs-name" id="fsName"></div>
  </div>
  <script>
    const scenes = ${JSON.stringify(SCENES)};
    const FULL_FRAMES = 72;
    const GRID_FRAMES = 12; // grid uses 12 frames (every 6th), fullscreen uses all 72
    const FPS = 24;

    let fsTimer = null;

    function loadFrames(container, dir, count, step, cb) {
      let f = 0;
      const imgs = [];

      function loadNext(i) {
        if (i >= count) {
          const t = setInterval(play, 1000 / FPS);
          if (cb) cb(t);
          return;
        }
        const img = document.createElement('img');
        img.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain';
        const frameIdx = i * step;
        img.onload = () => { imgs[i] = img; loadNext(i + 1); };
        img.onerror = () => { imgs[i] = img; loadNext(i + 1); };
        img.src = '/assets/animations/' + dir + '/frame-' + String(frameIdx).padStart(3, '0') + '.svg';
        container.appendChild(img);
      }

      function play() {
        imgs.forEach((img, i) => { if (img) img.style.display = i === f ? '' : 'none'; });
        f = (f + 1) % count;
      }

      loadNext(0);
    }

    const grid = document.getElementById('grid');

    const groups = {};
    scenes.forEach(s => { const g = s.group || 'Other'; if(!groups[g]) groups[g] = []; groups[g].push(s); });

    Object.entries(groups).forEach(([groupName, exs]) => {
      const header = document.createElement('div');
      header.style.cssText = 'grid-column:1 / -1;font-size:13px;color:#888;margin:24px 0 8px;border-bottom:1px solid #333;padding-bottom:4px;background:none;cursor:default';
      header.textContent = groupName;
      grid.appendChild(header);
      exs.forEach(s => {
        const card = document.createElement('div');
        card.className = 'card';
        const frame = document.createElement('div');
        frame.style.cssText = 'position:relative;width:100%;aspect-ratio:400/300;background:#0f0f1a;border-radius:8px;overflow:hidden';
        card.appendChild(frame);
        const info = document.createElement('div');
        info.className = 'info';
        info.innerHTML = '<div class="name">'+s.name+'</div><div class="path">'+s.dir+'</div>';
        card.appendChild(info);
        card.onclick = () => openFS(s.dir, s.name);
        grid.appendChild(card);
        loadFrames(frame, s.dir, GRID_FRAMES, Math.floor(FULL_FRAMES / GRID_FRAMES));
      });
    });

    function openFS(dir, name) {
      // Stop previous fullscreen player
      if (fsTimer) { clearInterval(fsTimer); fsTimer = null; }
      document.getElementById('fsCanvas').innerHTML = '';

      const overlay = document.getElementById('fullscreen');
      overlay.classList.add('open');
      document.getElementById('fsName').textContent = name;
      loadFrames(document.getElementById('fsCanvas'), dir, FULL_FRAMES, 1, (t) => { fsTimer = t; });
    }

    function closeFS() {
      document.getElementById('fullscreen').classList.remove('open');
      if (fsTimer) { clearInterval(fsTimer); fsTimer = null; }
      document.getElementById('fsCanvas').innerHTML = '';
    }
    document.addEventListener('keydown', e => { if(e.key === 'Escape') closeFS(); });
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML);
    return;
  }

  const filePath = path.join(ROOT, req.url);
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Exercise Animation Preview running at:\n   http://localhost:${PORT}\n`);
  SCENES.forEach(s => console.log(`   ${s.dir}: ${s.name}`));
});
