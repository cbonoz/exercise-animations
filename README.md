# Exercise Animations

Stick figure exercise animations in SVG frame sequences + Lottie JSON for [BridgeRecovery](https://github.com/cbonoz/bridge-recovery).

All 50 exercises across 8 muscle groups are data-driven: each exercise is defined in [`animation-plan.json`](animation-plan.json) with posture, joint motion deltas, action annotations, and display metadata. The generator interpolates joint positions using easeInOut over 72 frames (3s at 24fps).

## Structure

```
animation-plan.json       ← exercise catalog + generator docs (all 50 exercises)
assets/animations/
  hamstring-slide/        ← one directory per exercise (72 SVGs + lottie.json + index.html)
  bridges/
  ...

scripts/
  generate.js             ← data-driven renderer (reads JSON, posture templates, motion defs)
  preview.js              ← local preview server with fullscreen player
  validate.js             ← 16 quality checks
```

## Quick Start

```bash
npm run generate    # render all 50 exercises (72 frames each)
npm run validate    # run 16 quality checks
npm run preview     # local preview at http://localhost:3001
```

Each exercise directory contains:
- `frame-000.svg` through `frame-071.svg` — individual frames at 400×300
- `lottie.json` — Lottie image-sequence animation for lottie-react-native
- `index.html` — standalone browser viewer

## Architecture

### Posture Templates

The generator uses 7 posture templates (defined in `scripts/generate.js`):

| Posture | Canvas layout | Examples |
|---------|--------------|----------|
| `supine` | Lying on back, horizontal | hamstring-slide, bridges, dead-bugs |
| `prone` | Lying face down, horizontal | prone-hamstring-curl, planks, supermans |
| `all-fours` | On hands and knees | cat-cow, fire-hydrants, bird-dogs |
| `side-lying` | Lying on side | clamshells, side-planks |
| `standing` | Upright, vertical | standing-hamstring-curl, RDLs, marching |
| `kneeling` | Upright on knees | nordic-curls, childs-pose, hip-flexor |
| `seated` | Sitting with legs forward | hamstring-stretch, pigeon-pose |

Each template defines joint positions at rest and the skeleton connections (lines between joints).

### Motion Definitions

Each exercise in `animation-plan.json` has a matching motion definition in `generate.js`'s `MOTIONS` object:
- `posture` — which template to use
- `rest` — joint offsets for the exercise-specific starting pose (e.g., pendulum swings bends forward)
- `move` — joint deltas applied during the animation cycle (0 at rest, max at mid-cycle)
- `highlight` — which skeleton segments to draw in the accent color
- `annotations` — action labels read from `animation-plan.json` (arrow, arc, or text)

### Deterministic Figure Height

The standing/kneeling head position is computed as:
```
head_y = INSTRUCTION_Y(58) + HEAD_R(10) + MARGIN(5) = 73
```
This guarantees the head top clears the instruction text baseline by 5px — the figure never overlaps the label. The same formula applies to all vertical postures.

## Validate

```bash
npm run validate
```

16 quality checks across all 50 exercises:

| Check | What it catches |
|-------|----------------|
| `frameCount` | All 72 frames present |
| `svgValidity` | Unescaped `&`, mismatched tags |
| `structure` | Inconsistent element counts across frames |
| `labels` | Annotation labels that pop in/out mid-cycle |
| `connectivity` | Disconnected skeleton joints |
| `limbLengths` | Static segments that unnaturally stretch/shrink |
| `cycleClosure` | Frame 71 loops back to frame 0 |
| `motion` | Near-static animations (checks both segment endpoints) |
| `smoothness` | Sudden frame-to-frame jumps |
| `orientation` | Spine angle matches exercise posture |
| `floorContact` | Appendages under floor or body floating (posture-specific tolerance) |
| `textOverlap` | Head circle enters instruction text render zone |
| `bounds` | Joints outside 400×300 canvas |
| `lottie` | Valid Lottie JSON with all 72 assets |
| `proportions` | Extreme segment length disparities |
| `ghostAlignment` | Active skeleton matches ghost at rest |

## Adding a New Exercise

1. Add an entry to `animation-plan.json` with posture, instruction, description, `motionHint`, and `annotations`
2. Add a motion definition in `scripts/generate.js`'s `MOTIONS` object with `posture`, `rest` (if needed), `move` deltas, and `highlight` segments
3. Add annotation entries to the exercise's `animation-plan.json` entry describing the key action
4. Run `npm run generate` and `npm run validate`

The system is designed for AI generation — give an LLM an existing motion definition from `generate.js` plus the `animation-plan.json` entry, describe the new movement, and it can produce both.

## Usage in BridgeRecovery App

Copy the exercise directory (`assets/animations/<exercise-id>/`) into the RN app's asset bundle. Each directory contains `lottie.json` (image-sequence format, Lottie v5.7.0) referencing all 72 SVG frames. Render with `lottie-react-native`.
