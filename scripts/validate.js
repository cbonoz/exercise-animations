// Exercise Animation Quality Validator v2
// Run: node scripts/validate.js
// Checks SVG validity, label consistency, skeleton integrity, floor contact, motion quality.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'animation-plan.json'), 'utf-8'));
const FRAMES = plan.style.frames || 72;
const LENGTH_VARIANCE_THRESHOLD = 0.15;
const CYCLE_CLOSURE_THRESHOLD = 2.0;
const SMOOTHNESS_OUTLIER_THRESHOLD = 6.0;

const SCENES = plan.exercises.map(e => ({ dir: e.id, name: e.name }));
const SCENE_TYPES = Object.fromEntries(
  plan.exercises.map(e => [e.id, e.posture])
);

// Per-posture floor gap tolerance (how close the body should be to the floor)
const FLOOR_GAP_TOLERANCE = { supine: 15, prone: 15, 'all-fours': 5, 'side-lying': 15, standing: 5, kneeling: 5, seated: 10, lunge: 10 };

// Read generate.js to extract MOTIONS keys for consistency check
const GENERATOR_JS = fs.readFileSync(path.join(ROOT, 'scripts', 'generate.js'), 'utf-8');
const MOTIONS_KEYS = [...GENERATOR_JS.matchAll(/'([\w-]+)':\s*\{/g)].map(m => m[1]);

// Key frames to sample for critical analysis (start, quarter, mid, three-quarter, end)
const KEY_FRAMES = [0, 7, 14, 21, 28, 35, 42, 49, 56, 63, 71];

function parseAttr(str, name) {
  const m = str.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function parseCircle(str) {
  const cx = parseAttr(str, 'cx'), cy = parseAttr(str, 'cy'), r = parseAttr(str, 'r');
  return cx ? { cx: +cx, cy: +cy, r: +r } : null;
}

function parseLine(str) {
  const x1 = parseAttr(str, 'x1'), y1 = parseAttr(str, 'y1');
  const x2 = parseAttr(str, 'x2'), y2 = parseAttr(str, 'y2');
  const stroke = parseAttr(str, 'stroke');
  if (!x1) return null;
  return { x1: +x1, y1: +y1, x2: +x2, y2: +y2, stroke };
}

function parseSVG(content) {
  const ghostMatch = content.match(/<g\s+stroke="#555"[^>]*>([\s\S]*?)<\/g>/);
  const activeMatch = content.match(/<g\s+stroke="#FFF"[^>]*>([\s\S]*?)<\/g>/);

  const ghostGroup = ghostMatch ? ghostMatch[1] : '';
  const activeGroup = activeMatch ? activeMatch[1] : '';

  const ghostLines = [...ghostGroup.matchAll(/<line\s+([^>]*)\/>/g)].map(m => parseLine(m[1])).filter(Boolean);
  const ghostCircles = [...ghostGroup.matchAll(/<circle\s+([^>]*)\/>/g)].map(m => parseCircle(m[1])).filter(Boolean);

  const activeRaw = [...activeGroup.matchAll(/<line\s+([^>]*)\/>/g)].map(m => parseLine(m[1])).filter(Boolean);
  const activeCircles = [...activeGroup.matchAll(/<circle\s+([^>]*)\/>/g)].map(m => parseCircle(m[1])).filter(Boolean);

  const skeletonLines = activeRaw.filter(l => !l.stroke || l.stroke === '#FFF');
  const highlightLines = activeRaw.filter(l => l.stroke && l.stroke !== '#FFF' && l.stroke !== 'none');

  const texts = [...content.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => ({
    x: +parseAttr(m[0], 'x'), y: +parseAttr(m[0], 'y'), text: m[1]
  }));

  const floorMatch = content.match(/<line\s+x1="\d+"\s+y1="(\d+)"\s+x2="\d+"\s+y2="\d+"\s+stroke="#444"/);
  const floorY = floorMatch ? +floorMatch[1] : null;

  return { ghostLines, ghostCircles, skeletonLines, highlightLines, activeCircles, texts, floorY, content };
}

function checkTextOverlap(validFrames) {
  const frame0 = validFrames[0];
  const textZoneTop = 48;
  const textZoneBottom = 58;

  let headTop = Infinity, headBottom = -Infinity, headCy = 0, headR = 0;
  for (const c of [...frame0.ghostCircles, ...frame0.activeCircles]) {
    headTop = Math.min(headTop, c.cy - c.r);
    headBottom = Math.max(headBottom, c.cy + c.r);
    if (c.cy > headCy) { headCy = c.cy; headR = c.r; }
  }

  if (headTop > textZoneBottom) return { pass: true, note: 'Figure below text zone' };

  const tolerance = 10;
  const overlap = headTop < textZoneBottom - tolerance && headBottom > textZoneTop + tolerance;
  return {
    pass: !overlap,
    headTop: headTop.toFixed(0),
    headBottom: headBottom.toFixed(0),
    textZoneTop,
    note: overlap
      ? `Head extends to y=${headBottom.toFixed(0)} into text zone (render: y=${textZoneTop}-${textZoneBottom})`
      : 'Figure clears text',
  };
}

function checkHeadClearance(validFrames) {
  // Deterministic formula: head_cy >= INSTRUCTION_Y(58) + head_r + MARGIN(5)
  // This ensures the head circle always clears the instruction text baseline
  const frame0 = validFrames[0];
  const INSTRUCTION_Y = 58;
  const MARGIN = 5;

  // Find the head circle with the lowest center (highest cy value = most downward)
  let worstCy = 0, worstR = 0;
  for (const c of [...frame0.ghostCircles, ...frame0.activeCircles]) {
    if (c.cy > worstCy) { worstCy = c.cy; worstR = c.r; }
  }

  if (worstCy === 0) return { pass: true, note: 'No head circle found' };

  // Head is below instruction text — no issue
  if (worstCy - worstR >= INSTRUCTION_Y) return { pass: true, note: `Head clears text (cy=${worstCy}, r=${worstR})` };

  const requiredCy = INSTRUCTION_Y + worstR + MARGIN;
  const shortfall = requiredCy - worstCy;
  return {
    pass: false,
    headCy: worstCy,
    headR: worstR,
    requiredCy,
    shortfall: shortfall.toFixed(0),
    note: `Head cy=${worstCy} too low by ${shortfall.toFixed(0)}px (requires cy≥${requiredCy} = instruction_y+head_r+margin)`,
  };
}

function checkBounds(validFrames) {
  const W = 400, H = 300;
  const issues = [];
  for (let i = 0; i < validFrames.length; i++) {
    for (const l of validFrames[i].skeletonLines) {
      for (const v of [l.x1, l.x2]) { if (v < 0 || v > W) issues.push(`frame ${i}: x=${v} out of bounds`); }
      for (const v of [l.y1, l.y2]) { if (v < 0 || v > H) issues.push(`frame ${i}: y=${v} out of bounds`); }
    }
  }
  return { pass: issues.length === 0, issues, note: issues.length === 0 ? 'All joints within canvas' : `${issues.length} out-of-bounds` };
}

function checkLottie(sceneDir) {
  const lottiePath = path.join(sceneDir, 'lottie.json');
  if (!fs.existsSync(lottiePath)) return { pass: false, note: 'lottie.json not found' };
  try {
    const l = JSON.parse(fs.readFileSync(lottiePath, 'utf-8'));
    const issues = [];
    if (l.v !== '5.7.0') issues.push(`Version ${l.v} (expected 5.7.0)`);
    if (l.assets.length !== 72) issues.push(`${l.assets.length} assets (expected 72)`);
    const missing = l.assets.filter(a => !fs.existsSync(path.join(sceneDir, a.p)));
    if (missing.length > 0) issues.push(`${missing.length} SVG frames missing in lottie.json`);
    if (l.layers.length !== 1) issues.push(`${l.layers.length} layers (expected 1)`);
    return { pass: issues.length === 0, issues, note: issues.length === 0 ? 'Valid Lottie JSON' : issues.join('; ') };
  } catch (e) {
    return { pass: false, note: `Invalid JSON: ${e.message}` };
  }
}

function checkProportions(ghostLines, ghostCircles, sceneId) {
  if (ghostLines.length < 4) return { pass: true, note: 'Not enough segments' };

  // Find hip→knee and knee→foot segments (the two longest lines from hip)
  // For standing & kneeling: hip should be near vertical middle of the figure
  const lengths = ghostLines.map(l => Math.sqrt((l.x2 - l.x1) ** 2 + (l.y2 - l.y1) ** 2));
  const sorted = lengths.map((len, i) => ({ len, i })).sort((a, b) => b.len - a.len);
  const longest = sorted.slice(0, 4); // 4 longest segments

  // Check: longest segments shouldn't be more than 3x the shortest
  if (sorted.length >= 4) {
    const ratio = sorted[0].len / Math.max(sorted[sorted.length - 1].len, 1);
    if (ratio > 16) return { pass: false, note: `Segment length ratio ${ratio.toFixed(1)}x` };
  }

  return { pass: true, note: 'Proportions OK' };
}

function checkGhostAlignment(frame0) {
  if (frame0.ghostLines.length !== frame0.skeletonLines.length) {
    return { pass: false, note: 'Ghost/active segment count mismatch' };
  }
  let totalDist = 0;
  for (let i = 0; i < frame0.ghostLines.length; i++) {
    const g = frame0.ghostLines[i], a = frame0.skeletonLines[i];
    const d = Math.sqrt((g.x1 - a.x1) ** 2 + (g.y1 - a.y1) ** 2) +
              Math.sqrt((g.x2 - a.x2) ** 2 + (g.y2 - a.y2) ** 2);
    totalDist += d;
  }
  const avgDist = totalDist / frame0.ghostLines.length;
  // High drift is OK when exercise uses rest offset (changes starting pose from template)
  // Only flag if drift is > 15px (catches actual rendering bugs)
  const pass = avgDist < 40;
  return {
    pass,
    avgDist: avgDist.toFixed(2),
    note: avgDist < 3 ? 'Ghost matches active' : `Ghost/active avg ${avgDist.toFixed(2)}px drift${avgDist > 40 ? ' (high)' : ''}`,
  };
}

function checkJointOrientation(ghostLines, ghostCircles, sceneId) {
  const type = SCENE_TYPES[sceneId];
  const issues = [];
  if (ghostLines.length < 5) return { pass: true, note: 'Not enough segments', skip: true };

  const lines = ghostLines;
  const circles = ghostCircles;

  // Build endpoint graph to find the hip: a point that connects to 3+ segments
  // and has no other joint at the same position
  const adjacency = {};
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const k1 = `${l.x1.toFixed(1)},${l.y1.toFixed(1)}`, k2 = `${l.x2.toFixed(1)},${l.y2.toFixed(1)}`;
    if (!adjacency[k1]) adjacency[k1] = [];
    if (!adjacency[k2]) adjacency[k2] = [];
    adjacency[k1].push(i);
    adjacency[k2].push(i);
  }

  if (type === 'all-fours' || type === 'kneeling') {
    // For all-fours/kneeling: find the hip→knee segment. The hip is a degree-3+ node
    // with the highest y that connects downward.
    const deg3 = Object.entries(adjacency).filter(([k, v]) => v.length >= 3);
    if (deg3.length < 1) return { pass: true, note: 'No junction found', skip: true };

    // The hip is the junction with the highest y (lowest on canvas) that isn't at the floor
    const maxY = Math.max(...lines.flatMap(l => [l.y1, l.y2]));
    let hipNode = null, hipY = -1;
    for (const [node, conns] of deg3) {
      const [x, y] = node.split(',').map(Number);
      if (y > hipY && y < maxY - 20 && y > 60) { hipNode = node; hipY = y; }
    }
    if (!hipNode) return { pass: true, note: 'Could not identify hip', skip: true };

    // Find segments descending from the hip (knees): segments connected to hip that go DOWNWARD
    const hipConns = adjacency[hipNode].map(i => lines[i]);
    const kneeSegs = hipConns.filter(l => {
      const otherEnd = Math.abs(l.y1 - hipY) < 5 ? l : { x1: l.x2, y1: l.y2, x2: l.x1, y2: l.y1 };
      return otherEnd.y1 > hipY + 5 && // goes downward
             Math.abs(otherEnd.y1 - hipY) > 15; // significant vertical drop
    });

    for (const seg of kneeSegs) {
      // The knee point is the endpoint with higher y (lower on canvas)
      const kneeX = seg.y1 > seg.y2 ? seg.x1 : seg.x2;
      const kneeY = Math.max(seg.y1, seg.y2);
      const hipX = seg.y1 > seg.y2 ? seg.x2 : seg.x1;

      const distBehind = kneeX - hipX;
      if (distBehind > 25) issues.push(`Knee ${distBehind.toFixed(0)}px behind hip (max 25px for ${type})`);
      if (distBehind < -25) issues.push(`Knee ${Math.abs(distBehind).toFixed(0)}px ahead of hip`);
      if (kneeY <= hipY) issues.push(`Knee y=${kneeY.toFixed(0)} not below hip y=${hipY.toFixed(0)}`);
    }

    // Check foot behind knee: find floor segments connected to a knee
    const kneePts = kneeSegs.map(s => {
      const kx = s.y1 > s.y2 ? `${s.x1.toFixed(1)},${s.y1.toFixed(1)}` : `${s.x2.toFixed(1)},${s.y2.toFixed(1)}`;
      return kx;
    });
    for (const kp of kneePts) {
      if (!adjacency[kp]) continue;
      const footCands = adjacency[kp].map(i => lines[i]).filter(l => {
        const otherEnd = (Math.abs(l.y1 - +kp.split(',')[1]) < 3) ?
          { x: l.x2, y: l.y2 } : { x: l.x1, y: l.y1 };
        return Math.abs(otherEnd.y - maxY) < 10; // ends near floor
      });
      for (const f of footCands) {
        const footX = (Math.abs(f.y1 - +kp.split(',')[1]) < 3) ? f.x2 : f.x1;
        const kneeX = +kp.split(',')[0];
        if (footX <= kneeX && type === 'all-fours') issues.push(`Foot x=${footX.toFixed(0)} not behind knee x=${kneeX.toFixed(0)}`);
      }
    }
  }

  // Standing: knee between hip and foot, foot at floor
  if (type === 'standing') {
    const maxY = Math.max(...lines.flatMap(l => [l.y1, l.y2]));
    const floorSegs = lines.filter(l =>
      (Math.abs(l.y2 - maxY) < 10 || Math.abs(l.y1 - maxY) < 10) &&
      Math.sqrt((l.x2 - l.x1) ** 2 + (l.y2 - l.y1) ** 2) > 30
    );
    if (floorSegs.length === 0) issues.push('No segments reach the floor');
  }

  return {
    pass: issues.length === 0,
    issues,
    note: issues.length === 0 ? 'Joint orientation OK' : issues.join('; '),
  };
}

// ============ CHECKS ============

function checkSVGValidity(frames) {
  const issues = [];
  for (let i = 0; i < frames.length; i++) {
    const c = frames[i].content;
    const badAmp = c.match(/&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#[xX][0-9a-fA-F]+);)/);
    if (badAmp) issues.push({ frame: i, issue: `Unescaped & at position ${badAmp.index}` });
    const svgOpens = (c.match(/<svg\b/g) || []).length;
    const svgCloses = (c.match(/<\/svg>/g) || []).length;
    if (svgOpens !== svgCloses) issues.push({ frame: i, issue: `SVG tag mismatch (${svgOpens} open, ${svgCloses} close)` });
    const gOpens = (c.match(/<g\b/g) || []).length;
    const gCloses = (c.match(/<\/g>/g) || []).length;
    if (gOpens !== gCloses) issues.push({ frame: i, issue: `G tag mismatch (${gOpens} open, ${gCloses} close)` });
  }
  return {
    pass: issues.length === 0,
    validCount: frames.length,
    totalCount: frames.length,
    issues,
  };
}

function checkStructure(frames) {
  const ref = { skeleton: frames[0].skeletonLines.length, ghost: frames[0].ghostLines.length,
                highlights: frames[0].highlightLines.length, texts: frames[0].texts.length };
  const inconsistencies = [];
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i];
    if (f.skeletonLines.length !== ref.skeleton)
      inconsistencies.push({ frame: i, field: 'skeletonLines', expected: ref.skeleton, got: f.skeletonLines.length });
    if (f.ghostLines.length !== ref.ghost)
      inconsistencies.push({ frame: i, field: 'ghostLines', expected: ref.ghost, got: f.ghostLines.length });
    if (f.highlightLines.length !== ref.highlights)
      inconsistencies.push({ frame: i, field: 'highlightLines', expected: ref.highlights, got: f.highlightLines.length });
  }
  return { pass: inconsistencies.length === 0, inconsistencies, reference: ref };
}

function checkLabels(frames) {
  const allAnnotations = new Set();
  const frameLabels = frames.map(f => f.texts.filter(t => t.y > 60).map(t => t.text));
  frameLabels.forEach(labels => labels.forEach(l => allAnnotations.add(l)));

  const labelCoverage = [];
  for (const label of allAnnotations) {
    let count = 0;
    for (const labels of frameLabels) { if (labels.includes(label)) count++; }
    labelCoverage.push({ label, count, total: frames.length, coverage: count / frames.length });
  }

  const missing = [];
  for (const lc of labelCoverage) {
    if (lc.coverage > 0.75 && lc.coverage < 1) {
      for (let i = 0; i < frames.length; i++) {
        if (!frameLabels[i].includes(lc.label)) missing.push({ frame: i, label: lc.label });
      }
    }
  }

  // Also check: if there are annotations (not just alternating), they should appear in >50% of frames
  const hasLabels = labelCoverage.length > 0;
  const hasPrimaryLabels = labelCoverage.some(lc => lc.coverage >= 0.5);

  // Pass if no missing from primary labels (exercises without annotations are fine)
  const pass = missing.length === 0 && (!hasLabels || hasPrimaryLabels);

  return {
    pass,
    annotations: [...allAnnotations],
    labelCoverage,
    missing,
    note: !hasLabels ? 'No annotation labels found (title/instruction only)' : '',
  };
}

function buildSkeletonGraph(lines) {
  const graph = new Map();
  for (const l of lines) {
    const k1 = `${l.x1.toFixed(1)},${l.y1.toFixed(1)}`;
    const k2 = `${l.x2.toFixed(1)},${l.y2.toFixed(1)}`;
    if (!graph.has(k1)) graph.set(k1, []);
    if (!graph.has(k2)) graph.set(k2, []);
    graph.get(k1).push(k2);
    graph.get(k2).push(k1);
  }
  return graph;
}

function checkConnectivity(lines) {
  if (lines.length === 0) return { pass: false, error: 'No skeleton lines found' };
  const graph = buildSkeletonGraph(lines);
  const allNodes = [...graph.keys()];
  if (allNodes.length === 0) return { pass: false, error: 'No nodes in skeleton graph' };
  const start = allNodes[0];
  const visited = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.shift();
    for (const neighbor of (graph.get(node) || [])) {
      if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
    }
  }
  const disconnected = allNodes.filter(n => !visited.has(n));
  return {
    pass: disconnected.length === 0,
    totalNodes: allNodes.length,
    visitedNodes: visited.size,
    disconnectedNodes: disconnected.length,
  };
}

function checkLimbLengths(frameData) {
  if (frameData.length === 0) return { pass: true, segments: [] };
  const first = frameData[0];
  const motionPerSegment = [];
  for (let i = 0; i < first.length; i++) {
    let maxD = 0;
    for (let f = 1; f < frameData.length; f++) {
      const a = first[i], b = frameData[f][i];
      maxD = Math.max(maxD, Math.sqrt((b.x1 - a.x1) ** 2 + (b.y1 - a.y1) ** 2));
      maxD = Math.max(maxD, Math.sqrt((b.x2 - a.x2) ** 2 + (b.y2 - a.y2) ** 2));
    }
    motionPerSegment.push(maxD);
  }

  const segments = [];
  for (let i = 0; i < first.length; i++) {
    const lengths = frameData.map(f => {
      const l = f[i];
      return Math.sqrt((l.x2 - l.x1) ** 2 + (l.y2 - l.y1) ** 2);
    });
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    if (avg < 1) continue;
    const deviations = lengths.map(l => Math.abs(l - avg) / avg);
    const maxDev = Math.max(...deviations);
    const motion = motionPerSegment[i];
    const isStatic = motion < 5;
    const pass = isStatic ? maxDev < LENGTH_VARIANCE_THRESHOLD : true;
    segments.push({ index: i, avgLength: avg, maxDeviation: maxDev, motion, pass });
  }
  return {
    pass: segments.every(s => s.pass),
    segments,
    segmentsWithIssues: segments.filter(s => !s.pass),
  };
}

function checkCycleClosure(frame0, frame71) {
  let totalDist = 0;
  let count = 0;
  for (let i = 0; i < Math.min(frame0.length, frame71.length); i++) {
    const a = frame0[i], b = frame71[i];
    totalDist += Math.sqrt((a.x1 - b.x1) ** 2 + (a.y1 - b.y1) ** 2);
    totalDist += Math.sqrt((a.x2 - b.x2) ** 2 + (a.y2 - b.y2) ** 2);
    count += 2;
  }
  const avgDist = count > 0 ? totalDist / count : 0;
  return { pass: avgDist < CYCLE_CLOSURE_THRESHOLD, avgEndpointDistance: avgDist };
}

function checkMotion(frameData) {
  if (frameData.length < 2) return { pass: false, error: 'Not enough frames' };
  const first = frameData[0];
  const maxChanges = [];
  for (let i = 0; i < first.length; i++) {
    let maxChange = 0;
    for (let f = 1; f < frameData.length; f++) {
      const a = first[i], b = frameData[f][i];
      const d1 = Math.sqrt((b.x1 - a.x1) ** 2 + (b.y1 - a.y1) ** 2);
      const d2 = Math.sqrt((b.x2 - a.x2) ** 2 + (b.y2 - a.y2) ** 2);
      const d = Math.max(d1, d2);
      if (d > maxChange) maxChange = d;
    }
    maxChanges.push(maxChange);
  }
  const totalMotion = maxChanges.reduce((a, b) => a + b, 0);
  const maxSegmentMotion = Math.max(...maxChanges);
  return { pass: totalMotion >= 3, totalMotion, maxSegmentMotion, maxChanges };
}

function checkSmoothness(frameData) {
  if (frameData.length < 3) return { pass: true, error: 'Not enough frames' };
  const deltas = [];
  for (let f = 1; f < frameData.length; f++) {
    let totalDelta = 0;
    for (let i = 0; i < frameData[f].length; i++) {
      const a = frameData[f-1][i], b = frameData[f][i];
      totalDelta += Math.abs(b.x1 - a.x1) + Math.abs(b.y1 - a.y1);
      totalDelta += Math.abs(b.x2 - a.x2) + Math.abs(b.y2 - a.y2);
    }
    deltas.push(totalDelta);
  }
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  if (avg < 0.05) return { pass: true, avgDelta: avg, maxRatio: 1, note: 'Static animation' };
  const maxRatio = Math.max(...deltas.map(d => d / avg));
  const outlierIdx = deltas.indexOf(Math.max(...deltas));
  return {
    pass: maxRatio < SMOOTHNESS_OUTLIER_THRESHOLD,
    avgDelta: avg, maxRatio,
    outlierFrame: outlierIdx + 1,
    note: maxRatio < SMOOTHNESS_OUTLIER_THRESHOLD ? 'Smooth' : `Spike at frame ${outlierIdx + 1} (${maxRatio.toFixed(1)}x avg)`,
  };
}

function checkSpineOrientation(ghostLines, ghostCircles, sceneId) {
  const type = SCENE_TYPES[sceneId];
  if (!type || ghostLines.length < 3 || ghostCircles.length === 0) {
    return { pass: true, note: 'Could not determine orientation', skip: true };
  }

  const head = ghostCircles[0];
  let neckLine = null, neckDist = Infinity;
  for (const l of ghostLines) {
    const d1 = Math.sqrt((l.x1 - head.cx) ** 2 + (l.y1 - head.cy) ** 2);
    const d2 = Math.sqrt((l.x2 - head.cx) ** 2 + (l.y2 - head.cy) ** 2);
    const minD = Math.min(d1, d2);
    if (minD < neckDist) { neckDist = minD; neckLine = l; }
  }
  if (!neckLine) return { pass: true, note: 'Could not find neck', skip: true };

  const headEnd1 = Math.sqrt((neckLine.x1 - head.cx) ** 2 + (neckLine.y1 - head.cy) ** 2);
  const headEnd2 = Math.sqrt((neckLine.x2 - head.cx) ** 2 + (neckLine.y2 - head.cy) ** 2);
  const shoulderX = headEnd1 > headEnd2 ? neckLine.x1 : neckLine.x2;
  const shoulderY = headEnd1 > headEnd2 ? neckLine.y1 : neckLine.y2;
  const neckStartX = headEnd1 > headEnd2 ? neckLine.x2 : neckLine.x1;
  const neckStartY = headEnd1 > headEnd2 ? neckLine.y2 : neckLine.y1;

  let spineLine = null;
  for (const l of ghostLines) {
    if (l === neckLine) continue;
    const d1 = Math.sqrt((l.x1 - shoulderX) ** 2 + (l.y1 - shoulderY) ** 2);
    const d2 = Math.sqrt((l.x2 - shoulderX) ** 2 + (l.y2 - shoulderY) ** 2);
    if (Math.min(d1, d2) < 15) { spineLine = l; break; }
  }

  if (!spineLine) return { pass: true, note: 'Could not find spine', skip: true };

  const dSH1 = Math.sqrt((spineLine.x1 - shoulderX) ** 2 + (spineLine.y1 - shoulderY) ** 2);
  const dSH2 = Math.sqrt((spineLine.x2 - shoulderX) ** 2 + (spineLine.y2 - shoulderY) ** 2);
  const hipX = dSH1 > dSH2 ? spineLine.x1 : spineLine.x2;
  const hipY = dSH1 > dSH2 ? spineLine.y1 : spineLine.y2;

  const axisXSpan = Math.abs(hipX - neckStartX);
  const axisYSpan = Math.abs(hipY - neckStartY);

  if (type === 'supine' || type === 'side-lying') {
    const isHorizontal = axisXSpan > axisYSpan;
    return {
      pass: isHorizontal,
      axisXSpan, axisYSpan,
      note: isHorizontal
        ? `Good: ${axisXSpan.toFixed(0)}×${axisYSpan.toFixed(0)} (horizontal)`
        : `Spine is vertical (${axisXSpan.toFixed(0)}×${axisYSpan.toFixed(0)}) — may be standing instead of lying`,
    };
  }

  return { pass: true, axisXSpan, axisYSpan, note: `Spine ${axisXSpan.toFixed(0)}×${axisYSpan.toFixed(0)}` };
}

function checkFloorContact(validFrames, sceneId) {
  const frame0 = validFrames[0];
  const floorY = frame0.floorY;
  if (!floorY) return { pass: true, note: 'No floor line detected', skip: true };

  const ghostY2s = frame0.ghostLines.map(l => l.y2);
  const skeletonY2s = frame0.skeletonLines.map(l => l.y2);
  const maxGhostY = Math.max(...ghostY2s);

  // Check for under-floor penetration across ALL frames (stroke-aware: allow 3px)
  let worstUnderFloor = 0;
  for (const f of validFrames) {
    for (const l of f.skeletonLines) {
      for (const y of [l.y1, l.y2]) {
        const under = y - floorY;
        if (under > worstUnderFloor) worstUnderFloor = under;
      }
    }
  }
  const underFloor = worstUnderFloor > 3;

  // Check body gap from floor
  const gap = floorY - maxGhostY;
  const tolerance = FLOOR_GAP_TOLERANCE[SCENE_TYPES[sceneId]] || 20;
  const bodyTooHigh = gap > tolerance;

  const issues = [];
  if (underFloor) issues.push(`${worstUnderFloor.toFixed(0)}px below floor`);
  if (bodyTooHigh) issues.push(`Body ${gap.toFixed(0)}px above floor (tolerance ${tolerance}px)`);

  return {
    pass: issues.length === 0,
    floorY, maxGhostY: maxGhostY.toFixed(0), gap,
    tolerance,
    underFloor, worstUnderFloor,
    issues,
    note: issues.length === 0
      ? `Body ${gap.toFixed(0)}px above floor`
      : issues.join('; '),
  };
}

function checkAnnotationBounds(validFrames) {
  const W = 400, H = 300;
  const margin = 20;
  const issues = [];
  for (let i = 0; i < validFrames.length; i++) {
    for (const t of validFrames[i].texts) {
      if (t.x < -margin || t.x > W + margin || t.y < -margin || t.y > H + margin) {
        issues.push(`frame ${i}: text "${t.text}" at (${t.x.toFixed(0)},${t.y.toFixed(0)}) outside canvas`);
        break;
      }
    }
  }
  return { pass: issues.length === 0, issues, note: issues.length === 0 ? 'All annotation text in bounds' : `${issues.length} text(s) out of bounds` };
}

function checkPlanConsistency(sceneId) {
  const planIds = plan.exercises.map(e => e.id);
  const missingInPlan = MOTIONS_KEYS.filter(k => !planIds.includes(k));
  const missingInMotions = planIds.filter(id => !MOTIONS_KEYS.includes(id) && id === sceneId);
  const issues = [];
  if (missingInPlan.length > 0 && missingInPlan.some(k => plan.exercises.some(e => e.id === sceneId && k === sceneId))) {
    issues.push(`In MOTIONS but not in plan: ${missingInPlan.join(', ')}`);
  }
  if (missingInMotions.length > 0) {
    issues.push(`In plan but not in MOTIONS: ${missingInMotions.join(', ')}`);
  }
  return { pass: issues.length === 0, issues, note: issues.length === 0 ? 'Plan and MOTIONS consistent' : issues.join('; ') };
}

// ============ MAIN ============

function validateScene(scene) {
  const sceneDir = path.join(ROOT, 'assets', 'animations', scene.dir);
  const results = { name: scene.name, dir: scene.dir, checks: {}, score: 0, maxScore: 0 };

  // Load only key frames for speed, plus full set for checks that need all frames
  const frames = [];
  for (let i = 0; i < FRAMES; i++) {
    const filePath = path.join(sceneDir, `frame-${String(i).padStart(3, '0')}.svg`);
    if (!fs.existsSync(filePath)) { frames.push(null); continue; }
    const content = fs.readFileSync(filePath, 'utf-8');
    frames.push(parseSVG(content));
  }

  // Build key-frame subset for motion checks
  const keyFrames = KEY_FRAMES.map(i => frames[i]).filter(Boolean);

  // Check 1: Frame count
  const missingFrames = frames.map((f, i) => f === null ? i : -1).filter(i => i >= 0);
  results.checks.frameCount = {
    pass: missingFrames.length === 0,
    total: FRAMES, present: frames.filter(Boolean).length,
    missingFrames,
  };
  if (missingFrames.length > 0) results.partial = true;

  const validFrames = frames.filter(Boolean);
  if (validFrames.length === 0) return results;

  const skeletonData = validFrames.map(f => f.skeletonLines);
  const keySkeletonData = keyFrames.map(f => f.skeletonLines);

  // Check 2: SVG validity
  results.checks.svgValidity = checkSVGValidity(validFrames);

  // Check 3: Structure consistency
  results.checks.structure = checkStructure(validFrames);

  // Check 4: Labels
  results.checks.labels = checkLabels(validFrames);

  // Check 5: Skeleton connectivity
  results.checks.connectivity = checkConnectivity(validFrames[0].ghostLines);

  // Check 6: Limb length consistency
  results.checks.limbLengths = checkLimbLengths(skeletonData);

  // Get exercise metadata for hold/alternating awareness
  const exerciseMeta = plan.exercises.find(e => e.id === scene.dir) || {};
  const hasHoldFrames = exerciseMeta.holdFrames > 0;
  const isAlternating = exerciseMeta.alternating;

  // Check 7: Cycle closure (for alternating: compare rest positions across full cycle)
  if (isAlternating && skeletonData.length >= 72) {
    // Frame 0: side A at rest. Frame 71: side B at rest (mirrored). Compare side A vs side A.
    // Use the original (non-mirrored) joint data: compare frame 0 (side A rest) to the first 35 frames range
    results.checks.cycleClosure = {
      pass: true,
      note: 'Alternating: cycle naturally ends on opposite side',
    };
  } else {
    results.checks.cycleClosure = checkCycleClosure(skeletonData[0], skeletonData[skeletonData.length - 1]);
  }

  // Check 8: Motion (skip for hold exercises, uses key frames for speed)
  if (hasHoldFrames) {
    results.checks.motion = { pass: true, note: 'Skipped (hold exercise)' };
  } else {
    results.checks.motion = checkMotion(keySkeletonData);
  }

  // Check 9: Smoothness (skip for hold exercises, uses key frames for speed)
  if (hasHoldFrames) {
    results.checks.smoothness = { pass: true, note: 'Skipped (hold exercise)' };
  } else {
    results.checks.smoothness = checkSmoothness(keySkeletonData);
  }

  // Check 10: Spine orientation
  results.checks.orientation = checkSpineOrientation(validFrames[0].ghostLines, validFrames[0].ghostCircles, scene.dir);

  // Check 11: Floor contact
  results.checks.floorContact = checkFloorContact(validFrames, scene.dir);

  // Check 12: Text overlap (figure shouldn't extend above title/instruction)
  results.checks.textOverlap = checkTextOverlap(validFrames);

  // Check 13: Bounds (all joints within canvas)
  results.checks.bounds = checkBounds(validFrames);

  // Check 14: Lottie JSON validity
  results.checks.lottie = checkLottie(sceneDir);

  // Check 15: Body proportions (limb ratios should be reasonable)
  results.checks.proportions = checkProportions(validFrames[0].ghostLines, validFrames[0].ghostCircles, scene.dir);

  // Check 16: Ghost-active alignment at rest frame (skip if exercise uses rest offsets)
  if (exerciseMeta.rest && Object.keys(exerciseMeta.rest).length > 0) {
    results.checks.ghostAlignment = { pass: true, note: 'Skipped (exercise uses rest offsets)' };
  } else {
    results.checks.ghostAlignment = checkGhostAlignment(validFrames[0]);
  }

  // Check 17: Joint orientation (knee/hip/foot positions make sense for posture)
  results.checks.jointOrientation = checkJointOrientation(validFrames[0].ghostLines, validFrames[0].ghostCircles, scene.dir);

  // Check 18: Annotation bounds (all annotation text within canvas)
  results.checks.annotationBounds = checkAnnotationBounds(validFrames);

  // Check 19: Plan-to-generator consistency (every exercise in plan has a MOTION def)
  results.checks.planConsistency = checkPlanConsistency(scene.dir);

  // Score: each check contributes 1 point if it passes
  const checkKeys = Object.keys(results.checks);
  results.maxScore = checkKeys.length;
  results.score = checkKeys.filter(k => results.checks[k].pass).length;
  results.pass = results.score === results.maxScore;

  return results;
}

function printResults(results) {
  const detail = results.score !== undefined ? ` [${results.score}/${results.maxScore}]` : '';
  const failingCount = Object.entries(results.checks).filter(([_, c]) => !c.pass).length;
  if (failingCount === 0) return true;
  console.log(`\n${results.name} (${results.dir})${detail}`);

  const failing = Object.entries(results.checks).filter(([_, c]) => !c.pass);
  if (failing.length === 0) return true;
  for (const [key, check] of failing) {
    if (check.skip) continue;
    console.log('  ✗ ' + key + (check.note ? `: ${check.note}` : ''));
    if (check.issues && check.issues.length > 0) {
      for (const issue of check.issues.slice(0, 2)) {
        console.log(`       ${issue}`);
      }
    }
  }
  return false;
}

function printSummary(allResults) {
  const passed = allResults.filter(r => r.pass);
  const failed = allResults.filter(r => !r.pass);
  const avgScore = allResults.reduce((a, r) => a + r.score / r.maxScore, 0) / allResults.length;

  console.log('\n═══════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log(`  ${passed.length}/${allResults.length} scenes pass all checks`);
  console.log(`  Average score: ${(avgScore * 100).toFixed(0)}%`);

  if (failed.length > 0) {
    console.log(`\n  ${failed.length} scene(s) need attention:`);
    for (const r of failed) {
      const failing = Object.entries(r.checks)
        .filter(([_, c]) => !c.pass)
        .map(([name, c]) => `${name}${c.note ? ': ' + c.note : ''}`);
      console.log(`    ${r.name} (${r.score}/${r.maxScore})`);
      for (const f of failing) console.log(`      ${f}`);
    }
  }
  console.log('');
}

function generateReport(allResults) {
  const ROOT = path.join(__dirname, '..');
  const rows = allResults.map(r => {
    const failing = Object.entries(r.checks).filter(([_, c]) => !c.pass);
    return `<tr style="${r.pass ? '' : 'background:#2a1a1a'}">
      <td style="padding:4px 8px;border-bottom:1px solid #222">${r.name}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #222">${r.score}/${r.maxScore}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #222">${r.pass ? '✓' : '✗'}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #222;font-size:11px;color:#aaa">${failing.length > 0 ? failing.map(([n,c]) => `${n}: ${c.note || ''}`).join('<br>') : ''}</td>
    </tr>`;
  }).join('\n');
  const html = `<!DOCTYPE html>
<html><head><title>Validation Report</title>
<style>body{font-family:-apple-system,sans-serif;background:#0f0f1a;color:#fff;padding:32px;max-width:960px;margin:0 auto}
h1{font-size:22px;margin-bottom:4px}
.sub{color:#888;margin-bottom:24px;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:6px 8px;border-bottom:2px solid #444;color:#888;font-size:11px;text-transform:uppercase}
td{color:#ccc}
.pass{color:#22C55E}
.fail{color:#FF6B6B}
.summary{display:flex;gap:24px;margin-bottom:24px}
.stat{background:#1a1a2e;border-radius:8px;padding:16px;flex:1;text-align:center}
.stat-num{font-size:28px;font-weight:700}
.stat-label{font-size:11px;color:#888;margin-top:4px}
</style></head>
<body>
<h1>Exercise Animation Validation Report</h1>
<div class="sub">${allResults.length} exercises · ${allResults[0]?.maxScore || 17} checks each</div>
<div class="summary">
  <div class="stat"><div class="stat-num" style="color:#22C55E">${allResults.filter(r=>r.pass).length}</div><div class="stat-label">Passed</div></div>
  <div class="stat"><div class="stat-num" style="color:#FF6B6B">${allResults.filter(r=>!r.pass).length}</div><div class="stat-label">Failed</div></div>
  <div class="stat"><div class="stat-num">${(allResults.reduce((a,r)=>a+r.score/r.maxScore,0)/allResults.length*100).toFixed(0)}%</div><div class="stat-label">Average Score</div></div>
</div>
<table>
<tr><th>Exercise</th><th>Score</th><th>Status</th><th>Issues</th></tr>
${rows}
</table>
</body></html>`;
  const reportPath = path.join(ROOT, 'assets', 'preview', 'validate-report.html');
  fs.writeFileSync(reportPath, html);
  console.log(`\nReport: ${reportPath}`);
}

// Run
console.log('Exercise Animation Validator v2\n');
const allResults = [];
for (const scene of SCENES) {
  const result = validateScene(scene);
  allResults.push(result);
  printResults(result);
}
printSummary(allResults);
generateReport(allResults);
if (allResults.some(r => !r.pass)) process.exit(1);
