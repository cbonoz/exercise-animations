// Exercise Animation Quality Validator v2
// Run: node scripts/validate.js
// Checks SVG validity, label consistency, skeleton integrity, floor contact, motion quality.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'animation-plan.json'), 'utf-8'));
const FRAMES = plan.style.frames || 72;
const LENGTH_VARIANCE_THRESHOLD = 0.08;
const CYCLE_CLOSURE_THRESHOLD = 2.0;
const SMOOTHNESS_OUTLIER_THRESHOLD = 3.5;

const SCENES = plan.exercises.map(e => ({ dir: e.id, name: e.name }));
const SCENE_TYPES = Object.fromEntries(
  plan.exercises.map(e => [e.id, e.posture])
);

// Per-posture floor gap tolerance (how close the body should be to the floor)
const FLOOR_GAP_TOLERANCE = { supine: 15, prone: 15, 'all-fours': 5, 'side-lying': 15, standing: 5, kneeling: 5, seated: 10, lunge: 10 };

// Key frames to sample for critical analysis (start, quarter, mid, three-quarter, end)
const KEY_FRAMES = [0, 18, 36, 54, 71];

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
  const frameLabels = frames.map(f => f.texts.filter(t => t.y > 30).map(t => t.text));
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
      const l = frameData[f][i];
      const d = Math.sqrt((l.x1 - first[i].x1) ** 2 + (l.y1 - first[i].y1) ** 2);
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

// ============ MAIN ============

function validateScene(scene) {
  const sceneDir = path.join(ROOT, 'assets', 'animations', scene.dir);
  const results = { name: scene.name, dir: scene.dir, checks: {}, score: 0, maxScore: 0 };

  const frames = [];
  for (let i = 0; i < FRAMES; i++) {
    const filePath = path.join(sceneDir, `frame-${String(i).padStart(3, '0')}.svg`);
    if (!fs.existsSync(filePath)) { frames.push(null); continue; }
    const content = fs.readFileSync(filePath, 'utf-8');
    frames.push(parseSVG(content));
  }

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

  // Check 7: Cycle closure
  results.checks.cycleClosure = checkCycleClosure(skeletonData[0], skeletonData[skeletonData.length - 1]);

  // Check 8: Motion
  results.checks.motion = checkMotion(skeletonData);

  // Check 9: Smoothness
  results.checks.smoothness = checkSmoothness(skeletonData);

  // Check 10: Spine orientation
  results.checks.orientation = checkSpineOrientation(validFrames[0].ghostLines, validFrames[0].ghostCircles, scene.dir);

  // Check 11: Floor contact
  results.checks.floorContact = checkFloorContact(validFrames, scene.dir);

  // Score: each check contributes 1 point if it passes
  const checkKeys = Object.keys(results.checks);
  results.maxScore = checkKeys.length;
  results.score = checkKeys.filter(k => results.checks[k].pass).length;
  results.pass = results.score === results.maxScore;

  return results;
}

function printResults(results) {
  const icon = (pass) => pass ? '✓' : '✗';
  const detail = results.score !== undefined ? ` [${results.score}/${results.maxScore}]` : '';
  console.log(`\n${results.name} (${results.dir})${detail}`);

  for (const [key, check] of Object.entries(results.checks)) {
    if (check.skip) continue;
    console.log('  ' + icon(check.pass) + ` ${key}: ${check.note || (check.pass ? 'OK' : 'FAIL')}`);
    if (!check.pass && check.issues && check.issues.length > 0) {
      for (const issue of check.issues.slice(0, 3)) {
        console.log(`       ${issue}`);
      }
    }
  }
  return results.pass;
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

// Run
console.log('🏋️  Exercise Animation Validator v2\n');
const allResults = [];
for (const scene of SCENES) {
  const result = validateScene(scene);
  allResults.push(result);
  printResults(result);
}
printSummary(allResults);
if (allResults.some(r => !r.pass)) process.exit(1);
