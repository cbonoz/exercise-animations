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
    canvas { width: 100%; aspect-ratio: 4/3; display: block; background: #12121f; }
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
    <h1>🏋️ BridgeRecovery</h1>
    <div class="sub">Exercise Stick Figure Animation Previewer</div>
    <div class="grid" id="grid"></div>
  </div>
  <div class="fullscreen" id="fullscreen">
    <button class="fs-close" onclick="closeFS()">✕</button>
    <canvas id="fsCanvas"></canvas>
    <div class="fs-name" id="fsName"></div>
  </div>
  <script>
    const scenes = ${JSON.stringify(SCENES)};
    const FRAME_COUNT = 72;
    const FPS = 24;

    function startPlayer(canvas, dir) {
      const ctx = canvas.getContext('2d');
      let f = 0;
      const imgs = [];
      let timer = null;

      function loadNext(i) {
        if (i >= FRAME_COUNT) { timer = setInterval(play, 1000 / FPS); return; }
        const img = new Image();
        img.onload = () => { imgs[i] = img; loadNext(i + 1); };
        img.onerror = () => { imgs[i] = null; loadNext(i + 1); };
        img.src = '/assets/animations/' + dir + '/frame-' + String(i).padStart(3, '0') + '.svg';
      }

      function play() {
        if (imgs[f]) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const img = imgs[f];
          const sx = canvas.width / 400, sy = canvas.height / 300;
          ctx.scale(sx, sy);
          ctx.drawImage(img, 0, 0, 400, 300);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        f = (f + 1) % FRAME_COUNT;
      }

      loadNext(0);
      return { interval: timer, stop: () => { if(timer) clearInterval(timer); } };
    }

    const grid = document.getElementById('grid');
    const players = [];

    // Group by group name
    const groups = {};
    scenes.forEach(s => { const g = s.group || 'Other'; if(!groups[g]) groups[g] = []; groups[g].push(s); });

    Object.entries(groups).forEach(([groupName, exs]) => {
      const header = document.createElement('div');
      header.style.cssText = 'grid-column:1;-1;font-size:13px;color:#666;margin:24px 0 8px;border-bottom:1px solid #333;padding-bottom:4px';
      header.textContent = groupName;
      grid.appendChild(header);
      exs.forEach(s => {
        const card = document.createElement('div');
        card.className = 'card';
        const cvs = document.createElement('canvas');
        cvs.width = 400; cvs.height = 300;
        card.appendChild(cvs);
        const info = document.createElement('div');
        info.className = 'info';
        info.innerHTML = '<div class="name">'+s.name+'</div><div class="path">'+s.dir+'</div>';
        card.appendChild(info);
        card.onclick = () => openFS(s.dir, s.name);
        grid.appendChild(card);
        const p = startPlayer(cvs, s.dir);
        if(p) players.push(p);
      });
    });

    function openFS(dir, name) {
      const overlay = document.getElementById('fullscreen');
      overlay.classList.add('open');
      document.getElementById('fsName').textContent = name;
      const cvs = document.getElementById('fsCanvas');
      cvs.width = 600; cvs.height = 450;
      const p = startPlayer(cvs, dir);
      overlay.dataset.interval = p ? p.interval : null;
    }

    function closeFS() {
      const overlay = document.getElementById('fullscreen');
      overlay.classList.remove('open');
      if(overlay.dataset.interval) clearInterval(parseInt(overlay.dataset.interval));
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
  console.log(`🏋️ Exercise Animation Preview running at:\n   http://localhost:${PORT}\n`);
  SCENES.forEach(s => console.log(`   ${s.dir}: ${s.name}`));
});
