# Exercise Animations

Stick figure exercise animations in SVG frame sequences and Lottie JSON format for [BridgeRecovery](https://github.com/cbonoz/bridge-recovery).

## Structure

```
assets/animations/
  scene-1/    Hamstring Slide
  scene-2/    Bridge
  scene-3/    Cat-Cow
  scene-4/    Dead Bugs
  scene-5/    Clamshells
```

Each scene contains:
- `lottie.json` — Lottie animation JSON (import via `lottie-react-native`)
- `frame-*.svg` — Individual SVG frames
- `index.html` — Standalone viewer

## Preview

```bash
npm run preview
# Opens at http://localhost:3001
```

## Usage

To consume these animations from the RN app, copy `assets/animations/scene-*/lottie.json` into the app's asset bundle and render with `lottie-react-native`.
