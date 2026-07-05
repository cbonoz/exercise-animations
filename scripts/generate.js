// Exercise Stick Figure Animation Generator — data-driven
// Reads animation-plan.json for all 50 exercise definitions
// Run: node scripts/generate.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'animation-plan.json'), 'utf-8'));

const FR = plan.style.fps;
const TOTAL_FRAMES = plan.style.frames;
const W = plan.style.canvas.width;
const H = plan.style.canvas.height;
const S = plan.style;

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ============== POSTURE TEMPLATES ==============
// Each posture defines a stick figure skeleton in the rest position
// Joints: head, neck, shoulder, hip, L/R elbow, L/R hand, L/R knee, L/R foot
// Lines connect joints for the skeleton

const POSTURES = {
  // Lying on back, head left, feet right, arms/legs up
  supine: {
    floorY: 260,
    head: { x: 160, y: 253 }, neck: { x: 172, y: 255 }, shoulder: { x: 185, y: 257 }, hip: { x: 230, y: 260 },
    left_elbow: { x: 168, y: 215 }, left_hand: { x: 158, y: 195 },
    right_elbow: { x: 202, y: 215 }, right_hand: { x: 212, y: 195 },
    left_knee: { x: 265, y: 210 }, left_foot: { x: 280, y: 258 },
    right_knee: { x: 250, y: 210 }, right_foot: { x: 265, y: 258 },
    lines: [
      ['head','neck'],['neck','shoulder'],['shoulder','hip'],
      ['shoulder','left_elbow'],['left_elbow','left_hand'],
      ['shoulder','right_elbow'],['right_elbow','right_hand'],
      ['hip','left_knee'],['left_knee','left_foot'],
      ['hip','right_knee'],['right_knee','right_foot'],
    ], head_r: 12,
  },
  // Lying face down, head left, feet right
  prone: {
    floorY: 260,
    head: { x: 120, y: 253 }, neck: { x: 138, y: 255 }, shoulder: { x: 155, y: 257 }, hip: { x: 215, y: 258 },
    left_elbow: { x: 145, y: 235 }, left_hand: { x: 135, y: 230 },
    right_elbow: { x: 170, y: 235 }, right_hand: { x: 180, y: 230 },
    left_knee: { x: 260, y: 258 }, left_foot: { x: 290, y: 258 },
    right_knee: { x: 255, y: 258 }, right_foot: { x: 285, y: 258 },
    lines: [
      ['head','neck'],['neck','shoulder'],['shoulder','hip'],
      ['shoulder','left_elbow'],['left_elbow','left_hand'],
      ['shoulder','right_elbow'],['right_elbow','right_hand'],
      ['hip','left_knee'],['left_knee','left_foot'],
      ['hip','right_knee'],['right_knee','right_foot'],
    ], head_r: 12,
  },
  // head_y for all vertical postures = INSTRUCTION_Y(58) + HEAD_R(10) + MARGIN(5) = 73
  // Ensures head_top (cy - r) clears instruction text baseline by MARGIN(5)px
  // On hands and knees, side view
  'all-fours': {
    floorY: 190,
    head: { x: 175, y: 73 }, neck: { x: 186, y: 76 }, shoulder: { x: 200, y: 87 }, hip: { x: 240, y: 110 },
    left_elbow: null, left_hand: { x: 170, y: 189 },
    right_elbow: null, right_hand: null,
    left_knee: { x: 245, y: 145 }, left_foot: { x: 255, y: 189 },
    right_knee: null, right_foot: null,
    lines: [
      ['head','neck'],['neck','shoulder'],['shoulder','hip'],
      ['shoulder','left_hand'],
      ['hip','left_knee'],['left_knee','left_foot'],
    ], head_r: 10,
  },
  // Lying on side, head left, feet right
  'side-lying': {
    floorY: 250,
    head: { x: 130, y: 232 }, neck: { x: 142, y: 235 }, shoulder: { x: 155, y: 238 }, hip: { x: 210, y: 245 },
    left_elbow: { x: 180, y: 243 }, left_hand: { x: 200, y: 247 },
    right_elbow: null, right_hand: null,
    left_knee: { x: 258, y: 237 }, left_foot: { x: 238, y: 245 },
    right_knee: { x: 255, y: 228 }, right_foot: { x: 235, y: 243 },
    lines: [
      ['head','neck'],['neck','shoulder'],['shoulder','hip'],
      ['shoulder','left_elbow'],['left_elbow','left_hand'],
      ['hip','left_knee'],['left_knee','left_foot'],
      ['hip','right_knee'],['right_knee','right_foot'],
    ], head_r: 12,
  },
  // Standing, side view, vertical
  // head_y computed as: INSTRUCTION_Y(58) + HEAD_R(10) + MARGIN(5) = 73 → head_top=63 (5px below text)
  standing: {
    floorY: 225,
    head: { x: 200, y: 73 }, neck: { x: 200, y: 81 }, shoulder: { x: 200, y: 89 }, hip: { x: 200, y: 113 },
    left_elbow: { x: 182, y: 99 }, left_hand: { x: 174, y: 111 },
    right_elbow: { x: 218, y: 99 }, right_hand: { x: 226, y: 111 },
    left_knee: { x: 195, y: 170 }, left_foot: { x: 190, y: 222 },
    right_knee: { x: 205, y: 170 }, right_foot: { x: 210, y: 222 },
    lines: [
      ['head','neck'],['neck','shoulder'],['shoulder','hip'],
      ['shoulder','left_elbow'],['left_elbow','left_hand'],
      ['shoulder','right_elbow'],['right_elbow','right_hand'],
      ['hip','left_knee'],['left_knee','left_foot'],
      ['hip','right_knee'],['right_knee','right_foot'],
    ], head_r: 10,
  },
  // Upright on knees, side view
  kneeling: {
    floorY: 225,
    head: { x: 200, y: 73 }, neck: { x: 200, y: 81 }, shoulder: { x: 200, y: 89 }, hip: { x: 200, y: 113 },
    left_elbow: { x: 182, y: 99 }, left_hand: { x: 174, y: 111 },
    right_elbow: { x: 218, y: 99 }, right_hand: { x: 226, y: 111 },
    left_knee: { x: 195, y: 222 }, left_foot: { x: 188, y: 222 },
    right_knee: { x: 205, y: 222 }, right_foot: { x: 212, y: 222 },
    lines: [
      ['head','neck'],['neck','shoulder'],['shoulder','hip'],
      ['shoulder','left_elbow'],['left_elbow','left_hand'],
      ['shoulder','right_elbow'],['right_elbow','right_hand'],
      ['hip','left_knee'],['left_knee','left_foot'],
      ['hip','right_knee'],['right_knee','right_foot'],
    ], head_r: 10,
  },
  // Seated with legs forward, side view
  seated: {
    floorY: 250,
    head: { x: 155, y: 60 }, neck: { x: 155, y: 80 }, shoulder: { x: 155, y: 95 }, hip: { x: 155, y: 170 },
    left_elbow: { x: 135, y: 105 }, left_hand: { x: 125, y: 120 },
    right_elbow: { x: 175, y: 105 }, right_hand: { x: 185, y: 120 },
    left_knee: { x: 225, y: 170 }, left_foot: { x: 255, y: 245 },
    right_knee: { x: 205, y: 170 }, right_foot: { x: 235, y: 245 },
    lines: [
      ['head','neck'],['neck','shoulder'],['shoulder','hip'],
      ['shoulder','left_elbow'],['left_elbow','left_hand'],
      ['shoulder','right_elbow'],['right_elbow','right_hand'],
      ['hip','left_knee'],['left_knee','left_foot'],
      ['hip','right_knee'],['right_knee','right_foot'],
    ], head_r: 10,
  },
};

// All joint names for interpolation
const JOINTS = ['head','neck','shoulder','hip','left_elbow','left_hand','right_elbow','right_hand','left_knee','left_foot','right_knee','right_foot'];

function lerp(a, b, t) { return a + (b - a) * t; }

// ============== EXERCISE MOTION DEFINITIONS ==============
// Each exercise defines which joints move and by what delta at max extension
// A segment like ['joint1', 'joint2'] highlights that line in the accent color

const MOTIONS = {
  'hamstring-slide': {
    posture: 'supine',
    move: { left_knee: { x: 84, y: 5 }, left_foot: { x: 100, y: 2 } },
    highlight: [['hip','left_knee'],['left_knee','left_foot']],
    highlightColor: '#FF6B6B',
  },
  'bridges': {
    posture: 'supine',
    move: { hip: { x: 0, y: -55 }, shoulder: { x: 0, y: -19 }, neck: { x: 0, y: -8 }, head: { x: 0, y: -4 },
            left_knee: { x: -8, y: -20 }, right_knee: { x: -8, y: -20 },
            left_foot: { x: -3, y: -2 }, right_foot: { x: -3, y: -2 } },
    highlight: [['neck','shoulder'],['shoulder','hip']],
    highlightColor: '#FF9500',
  },
  'cat-cow': {
    posture: 'all-fours',
    cow: { head: { x: -3, y: 20 }, neck: { x: -3, y: 15 }, shoulder: { x: 0, y: -6 }, hip: { x: 0, y: 7 } },
    cat: { head: { x: 3, y: -8 }, neck: { x: 3, y: -5 }, shoulder: { x: 0, y: 6 }, hip: { x: 0, y: -7 } },
    highlight: [['neck','shoulder'],['shoulder','hip']],
    highlightColor: '#22C55E',
  },
  'dead-bugs': {
    posture: 'supine',
    move: { right_elbow: { x: -22, y: 32 }, right_hand: { x: -53, y: 70 },
            left_knee: { x: 15, y: -3 }, left_foot: { x: 20, y: -3 } },
    highlight: [['shoulder','right_elbow'],['right_elbow','right_hand'],['hip','left_knee'],['left_knee','left_foot']],
    highlightColor: '#8B5CF6',
  },
  'clamshells': {
    posture: 'side-lying',
    move: { right_knee: { x: 24, y: -24 } },
    highlight: [['hip','right_knee'],['right_knee','right_foot']],
    highlightColor: '#FFD93D',
  },
  'prone-hamstring-curl': {
    posture: 'prone',
    move: { left_knee: { x: 10, y: -40 }, left_foot: { x: -15, y: -55 } },
    highlight: [['hip','left_knee'],['left_knee','left_foot']],
    highlightColor: '#FF6B6B',
  },
  'standing-hamstring-curl': {
    posture: 'standing',
    move: { right_knee: { x: -15, y: -40 }, right_foot: { x: -20, y: -60 } },
    highlight: [['hip','right_knee'],['right_knee','right_foot']],
    highlightColor: '#FF6B6B',
  },
  'romanian-deadlifts': {
    posture: 'standing',
    move: { hip: { x: -5, y: 10 }, shoulder: { x: -5, y: 20 }, neck: { x: -5, y: 20 }, head: { x: -5, y: 20 },
            left_elbow: { x: -5, y: 30 }, left_hand: { x: -5, y: 40 },
            right_elbow: { x: -5, y: 30 }, right_hand: { x: -5, y: 40 } },
    highlight: [['hip','shoulder']],
    highlightColor: '#FF6B6B',
  },
  'good-mornings': {
    posture: 'standing',
    move: { hip: { x: -5, y: 10 }, shoulder: { x: -5, y: 20 }, neck: { x: -5, y: 20 }, head: { x: -5, y: 15 },
            left_elbow: { x: 10, y: 5 }, left_hand: { x: 15, y: 0 },
            right_elbow: { x: 10, y: 5 }, right_hand: { x: 15, y: 0 } },
    highlight: [['hip','shoulder']],
    highlightColor: '#FF9500',
  },
  'nordic-curls': {
    posture: 'kneeling',
    move: { hip: { x: 15, y: 10 }, shoulder: { x: 30, y: 20 }, neck: { x: 35, y: 22 }, head: { x: 35, y: 22 },
            left_elbow: { x: 15, y: 15 }, left_hand: { x: 20, y: 20 },
            right_elbow: { x: 15, y: 15 }, right_hand: { x: 20, y: 20 } },
    highlight: [['hip','left_knee'],['hip','right_knee']],
    highlightColor: '#FF6B6B',
  },
  'straight-leg-deadlifts': {
    posture: 'standing',
    move: { hip: { x: -5, y: 10 }, shoulder: { x: -5, y: 30 }, neck: { x: -5, y: 30 }, head: { x: -5, y: 25 },
            left_elbow: { x: -5, y: 50 }, left_hand: { x: -5, y: 65 },
            right_elbow: { x: -5, y: 50 }, right_hand: { x: -5, y: 65 } },
    highlight: [['hip','shoulder']],
    highlightColor: '#FF6B6B',
  },
  'hamstring-stretch': {
    posture: 'seated',
    move: { hip: { x: 10, y: 0 }, shoulder: { x: 20, y: 5 }, neck: { x: 25, y: 8 }, head: { x: 25, y: 8 },
            left_elbow: { x: 30, y: 10 }, left_hand: { x: 40, y: 15 },
            right_elbow: { x: 30, y: 10 }, right_hand: { x: 40, y: 15 } },
    highlight: [['hip','left_knee'],['left_knee','left_foot']],
    highlightColor: '#FF6B6B',
  },
  'single-leg-bridges': {
    posture: 'supine',
    move: { left_knee: { x: -10, y: -30 }, left_foot: { x: -15, y: -40 },
            hip: { x: 0, y: -45 }, shoulder: { x: 0, y: -15 }, neck: { x: 0, y: -6 }, head: { x: 0, y: -3 } },
    highlight: [['hip','left_knee'],['left_knee','left_foot']],
    highlightColor: '#FF9500',
  },
  'banded-walks': {
    posture: 'standing',
    move: { hip: { x: 0, y: -5 }, left_knee: { x: 0, y: -5 }, left_foot: { x: 0, y: -5 },
            right_knee: { x: 0, y: -5 }, right_foot: { x: 0, y: -5 } },
    highlight: [['hip','left_knee'],['hip','right_knee']],
    highlightColor: '#FFD93D',
  },
  'fire-hydrants': {
    posture: 'all-fours',
    move: { hip: { x: 0, y: -5 }, left_knee: { x: 20, y: -15 }, left_foot: { x: 10, y: -10 } },
    highlight: [['hip','left_knee'],['left_knee','left_foot']],
    highlightColor: '#FFD93D',
  },
  'glute-kickbacks': {
    posture: 'all-fours',
    move: { hip: { x: 0, y: -3 }, left_knee: { x: 5, y: -5 }, left_foot: { x: 20, y: -15 } },
    highlight: [['hip','left_knee'],['left_knee','left_foot']],
    highlightColor: '#FFD93D',
  },
  'bird-dogs': {
    posture: 'all-fours',
    move: { left_hand: { x: -30, y: -20 }, left_foot: { x: 20, y: -15 },
            left_knee: { x: 5, y: -5 }, shoulder: { x: -5, y: -5 }, hip: { x: 5, y: -5 } },
    highlight: [['shoulder','left_hand'],['hip','left_knee'],['left_knee','left_foot']],
    highlightColor: '#22C55E',
  },
  'planks': {
    posture: 'prone',
    rest: { head: { x: 0, y: -20 }, neck: { x: 0, y: -25 }, shoulder: { x: 0, y: -30 },
            hip: { x: 0, y: -15 },
            left_elbow: { x: -10, y: 22 }, left_hand: { x: -25, y: 28 },
            right_elbow: { x: -10, y: 22 }, right_hand: { x: -25, y: 28 } },
    move: { hip: { x: 0, y: -5 } },
    highlight: [['neck','shoulder'],['shoulder','hip']],
    highlightColor: '#22C55E',
  },
  'side-planks': {
    posture: 'side-lying',
    rest: { head: { x: 0, y: -10 }, neck: { x: 0, y: -15 }, shoulder: { x: 0, y: -20 },
            hip: { x: 0, y: -15 },
            left_elbow: { x: -15, y: 15 }, left_hand: { x: -20, y: 18 } },
    move: { hip: { x: 0, y: -4 } },
    highlight: [['neck','shoulder'],['shoulder','hip']],
    highlightColor: '#22C55E',
  },
  'pelvic-tilts': {
    posture: 'supine',
    move: { hip: { x: 0, y: -10 }, shoulder: { x: 0, y: -3 } },
    highlight: [['hip','shoulder']],
    highlightColor: '#22C55E',
  },
  'hollow-holds': {
    posture: 'supine',
    move: { head: { x: 0, y: -10 }, neck: { x: 0, y: -8 }, shoulder: { x: 0, y: -5 },
            left_hand: { x: -10, y: -25 }, left_elbow: { x: -8, y: -20 },
            right_hand: { x: 10, y: -25 }, right_elbow: { x: 8, y: -20 },
            left_foot: { x: 5, y: -15 }, left_knee: { x: 3, y: -10 },
            right_foot: { x: -5, y: -15 }, right_knee: { x: -3, y: -10 } },
    highlight: [['neck','shoulder'],['shoulder','hip']],
    highlightColor: '#22C55E',
  },
  'supermans': {
    posture: 'prone',
    move: { head: { x: 0, y: -10 }, neck: { x: 0, y: -8 }, shoulder: { x: 0, y: -6 },
            left_hand: { x: -5, y: -15 }, left_elbow: { x: -3, y: -10 },
            right_hand: { x: 5, y: -15 }, right_elbow: { x: 3, y: -10 },
            left_foot: { x: 3, y: -10 }, right_foot: { x: -3, y: -10 } },
    highlight: [['neck','shoulder'],['shoulder','hip']],
    highlightColor: '#22C55E',
  },
  'crunches': {
    posture: 'supine',
    move: { head: { x: 0, y: -15 }, neck: { x: 0, y: -12 }, shoulder: { x: 0, y: -10 },
            left_elbow: { x: 10, y: -5 }, left_hand: { x: 15, y: -5 },
            right_elbow: { x: -10, y: -5 }, right_hand: { x: -15, y: -5 } },
    highlight: [['neck','shoulder'],['shoulder','hip']],
    highlightColor: '#22C55E',
  },
  'quad-sets': {
    posture: 'supine',
    move: { left_knee: { x: 3, y: -4 }, left_foot: { x: 5, y: -3 } },
    highlight: [['hip','left_knee'],['left_knee','left_foot']],
    highlightColor: '#FF6B6B',
  },
  'straight-leg-raises': {
    posture: 'supine',
    move: { left_knee: { x: -5, y: -30 }, left_foot: { x: -10, y: -50 } },
    highlight: [['hip','left_knee'],['left_knee','left_foot']],
    highlightColor: '#FF6B6B',
  },
  'step-ups': {
    posture: 'standing',
    move: { right_knee: { x: 10, y: -25 }, right_foot: { x: 15, y: -40 },
            hip: { x: 5, y: -5 }, shoulder: { x: 5, y: -3 }, neck: { x: 3, y: -2 }, head: { x: 3, y: -2 } },
    highlight: [['hip','right_knee'],['right_knee','right_foot']],
    highlightColor: '#FF6B6B',
  },
  'wall-sits': {
    posture: 'standing',
    move: { hip: { x: 10, y: 25 }, shoulder: { x: 5, y: 15 }, neck: { x: 3, y: 10 }, head: { x: 3, y: 8 },
            left_knee: { x: 10, y: 10 }, left_foot: { x: 15, y: 0 },
            right_knee: { x: 10, y: 10 }, right_foot: { x: 15, y: 0 } },
    highlight: [['hip','left_knee'],['hip','right_knee']],
    highlightColor: '#FF6B6B',
  },
  'terminal-knee-extensions': {
    posture: 'standing',
    move: { right_knee: { x: 5, y: -10 }, right_foot: { x: 10, y: -20 } },
    highlight: [['hip','right_knee'],['right_knee','right_foot']],
    highlightColor: '#FF6B6B',
  },
  'hip-flexor-stretch': {
    posture: 'kneeling',
    rest: { left_knee: { x: -35, y: -40 }, left_foot: { x: -55, y: 0 },
            hip: { x: -10, y: 5 }, shoulder: { x: -5, y: 0 }, neck: { x: -5, y: 0 }, head: { x: -5, y: 0 },
            left_elbow: { x: -15, y: 0 }, left_hand: { x: -20, y: -5 },
            right_elbow: { x: 5, y: 0 }, right_hand: { x: 5, y: -5 } },
    move: { hip: { x: 20, y: -10 }, shoulder: { x: 12, y: -5 }, neck: { x: 8, y: -3 }, head: { x: 8, y: -3 },
            left_knee: { x: 5, y: -5 }, left_foot: { x: 5, y: 0 } },
    highlight: [['hip','shoulder']],
    highlightColor: '#FF9500',
  },
  'figure-4-stretch': {
    posture: 'supine',
    move: { left_knee: { x: -30, y: -10 }, left_foot: { x: -20, y: -5 } },
    highlight: [['hip','left_knee'],['left_knee','left_foot']],
    highlightColor: '#FF9500',
  },
  'hip-circles': {
    posture: 'standing',
    move: { right_knee: { x: 15, y: -5 }, right_foot: { x: 20, y: -5 } },
    highlight: [['hip','right_knee'],['right_knee','right_foot']],
    highlightColor: '#FF9500',
  },
  'banded-hip-flexion': {
    posture: 'standing',
    move: { right_knee: { x: 5, y: -30 }, right_foot: { x: 5, y: -40 } },
    highlight: [['hip','right_knee'],['right_knee','right_foot']],
    highlightColor: '#FF9500',
  },
  'pigeon-pose': {
    posture: 'seated',
    move: { hip: { x: 5, y: 5 }, shoulder: { x: 10, y: 10 }, neck: { x: 12, y: 12 }, head: { x: 12, y: 12 },
            left_elbow: { x: 5, y: 10 }, left_hand: { x: 10, y: 15 },
            right_elbow: { x: 5, y: 10 }, right_hand: { x: 10, y: 15 } },
    highlight: [['hip','right_knee'],['right_knee','right_foot']],
    highlightColor: '#FF9500',
  },
  '90-90-stretch': {
    posture: 'seated',
    move: { shoulder: { x: 10, y: 0 }, neck: { x: 15, y: 0 }, head: { x: 15, y: 0 } },
    highlight: [['neck','shoulder'],['shoulder','hip']],
    highlightColor: '#FF9500',
  },
  'childs-pose': {
    posture: 'kneeling',
    move: { hip: { x: 10, y: 45 }, shoulder: { x: -15, y: 60 }, neck: { x: -20, y: 68 }, head: { x: -20, y: 68 },
            left_elbow: { x: -30, y: 65 }, left_hand: { x: -55, y: 115 },
            right_elbow: { x: -30, y: 65 }, right_hand: { x: -55, y: 115 } },
    highlight: [['neck','shoulder'],['shoulder','hip']],
    highlightColor: '#22C55E',
  },
  'worlds-greatest-stretch': {
    posture: 'standing',
    move: { right_knee: { x: 20, y: 10 }, right_foot: { x: 30, y: 15 },
            hip: { x: 5, y: 5 }, shoulder: { x: 5, y: 10 }, neck: { x: 3, y: 8 },
            right_elbow: { x: 10, y: -30 }, right_hand: { x: 15, y: -45 } },
    highlight: [['hip','right_knee'],['right_knee','right_foot']],
    highlightColor: '#22C55E',
  },
  'thread-the-needle': {
    posture: 'all-fours',
    move: { left_hand: { x: 15, y: 5 }, shoulder: { x: 5, y: 5 }, hip: { x: -3, y: 3 },
            left_knee: { x: 5, y: -3 }, left_foot: { x: 10, y: -5 } },
    highlight: [['shoulder','left_hand']],
    highlightColor: '#22C55E',
  },
  'seated-spinal-twist': {
    posture: 'seated',
    move: { shoulder: { x: 10, y: -5 }, neck: { x: 15, y: -8 }, head: { x: 15, y: -8 },
            right_elbow: { x: -10, y: 0 }, right_hand: { x: -15, y: 5 } },
    highlight: [['neck','shoulder'],['shoulder','hip']],
    highlightColor: '#22C55E',
  },
  'standing-side-bend': {
    posture: 'standing',
    move: { shoulder: { x: 5, y: 5 }, neck: { x: 8, y: 8 }, head: { x: 8, y: 10 },
            right_elbow: { x: 10, y: -10 }, right_hand: { x: 15, y: -15 } },
    highlight: [['neck','shoulder'],['shoulder','hip']],
    highlightColor: '#22C55E',
  },
  'single-leg-stance': {
    posture: 'standing',
    move: { right_knee: { x: 5, y: -20 }, right_foot: { x: 5, y: -30 } },
    highlight: [['hip','left_knee'],['left_knee','left_foot']],
    highlightColor: '#22C55E',
  },
  'tandem-walk': {
    posture: 'standing',
    move: { left_knee: { x: 20, y: -5 }, left_foot: { x: 30, y: 0 },
            right_knee: { x: 5, y: -5 }, right_foot: { x: 5, y: 0 },
            hip: { x: 5, y: -2 } },
    highlight: [['hip','left_knee'],['left_knee','left_foot']],
    highlightColor: '#22C55E',
  },
  'heel-to-toe-stand': {
    posture: 'standing',
    move: { left_foot: { x: 15, y: 0 }, right_foot: { x: -15, y: 0 }, hip: { x: 0, y: -2 }, shoulder: { x: 0, y: -1 } },
    highlight: [['hip','left_knee'],['hip','right_knee']],
    highlightColor: '#22C55E',
  },
  'lateral-step-overs': {
    posture: 'standing',
    move: { right_knee: { x: 25, y: 5 }, right_foot: { x: 35, y: 10 },
            hip: { x: 5, y: 2 } },
    highlight: [['hip','right_knee'],['right_knee','right_foot']],
    highlightColor: '#22C55E',
  },
  'marching': {
    posture: 'standing',
    move: { right_knee: { x: 5, y: -35 }, right_foot: { x: 5, y: -45 },
            left_elbow: { x: 5, y: -5 }, left_hand: { x: 10, y: -5 } },
    highlight: [['hip','right_knee'],['right_knee','right_foot']],
    highlightColor: '#22C55E',
  },
  'pendulum-swings': {
    posture: 'standing',
    rest: { hip: { x: -5, y: 10 }, shoulder: { x: -5, y: 20 }, neck: { x: -5, y: 20 }, head: { x: -5, y: 15 },
            right_elbow: { x: -5, y: 10 }, right_hand: { x: -10, y: 15 },
            left_elbow: { x: -5, y: 10 }, left_hand: { x: -10, y: 15 } },
    move: { right_hand: { x: 5, y: 5 }, left_hand: { x: 5, y: 5 } },
    highlight: [['shoulder','right_elbow'],['right_elbow','right_hand']],
    highlightColor: '#FF9500',
  },
  'band-pull-aparts': {
    posture: 'standing',
    rest: { left_elbow: { x: 20, y: 0 }, left_hand: { x: 35, y: 0 },
            right_elbow: { x: -20, y: 0 }, right_hand: { x: -35, y: 0 } },
    move: { left_elbow: { x: -30, y: 0 }, left_hand: { x: -50, y: 0 },
            right_elbow: { x: 30, y: 0 }, right_hand: { x: 50, y: 0 } },
    highlight: [['shoulder','left_elbow'],['shoulder','right_elbow']],
    highlightColor: '#FF9500',
  },
  'wall-slides': {
    posture: 'standing',
    rest: { left_elbow: { x: -5, y: -15 }, left_hand: { x: -10, y: -25 },
            right_elbow: { x: -5, y: -15 }, right_hand: { x: -10, y: -25 } },
    move: { left_elbow: { x: 0, y: -20 }, left_hand: { x: 0, y: -30 },
            right_elbow: { x: 0, y: -20 }, right_hand: { x: 0, y: -30 } },
    highlight: [['shoulder','left_elbow'],['left_elbow','left_hand']],
    highlightColor: '#FF9500',
  },
  'scapular-retractions': {
    posture: 'standing',
    move: { left_elbow: { x: -8, y: -2 }, left_hand: { x: -12, y: -3 },
            right_elbow: { x: 8, y: -2 }, right_hand: { x: 12, y: -3 } },
    highlight: [['shoulder','left_elbow'],['shoulder','right_elbow']],
    highlightColor: '#FF9500',
  },
  'doorway-stretch': {
    posture: 'standing',
    rest: { left_elbow: { x: 12, y: 0 }, left_hand: { x: 20, y: 0 },
            right_elbow: { x: -12, y: 0 }, right_hand: { x: -20, y: 0 },
            hip: { x: 5, y: 3 }, shoulder: { x: 5, y: 5 }, neck: { x: 3, y: 3 }, head: { x: 3, y: 3 } },
    move: { hip: { x: 5, y: 8 }, shoulder: { x: 5, y: 12 }, neck: { x: 3, y: 8 }, head: { x: 3, y: 8 } },
    highlight: [['shoulder','left_elbow'],['shoulder','right_elbow']],
    highlightColor: '#FF9500',
  },
  'chest-opener': {
    posture: 'standing',
    rest: { left_elbow: { x: -10, y: 15 }, left_hand: { x: -15, y: 25 },
            right_elbow: { x: 10, y: 15 }, right_hand: { x: 15, y: 25 } },
    move: { left_elbow: { x: -5, y: -10 }, left_hand: { x: -8, y: -15 },
            right_elbow: { x: 5, y: -10 }, right_hand: { x: 8, y: -15 } },
    highlight: [['neck','shoulder'],['shoulder','hip']],
    highlightColor: '#FF9500',
  },
};

// ============== RENDER ENGINE ==============

function interpolateJoints(template, motion, p, floorY) {
  const result = {};
  const restOff = motion.rest || {};
  const move = motion.move || {};
  for (const j of JOINTS) {
    if (!template[j]) { result[j] = null; continue; }
    const base = template[j];
    const r = restOff[j] || { x: 0, y: 0 };
    const d = move[j] || { x: 0, y: 0 };
    const x = base.x + r.x + d.x * p;
    const y = Math.min(base.y + r.y + d.y * p, floorY - 1);
    result[j] = { x, y };
  }
  return result;
}

function catCowInterpolate(rest, motion_cat, motion_cow, p, floorY) {
  const a = -Math.sin(p * Math.PI * 2);
  const cow = a < 0;
  const mag = Math.abs(a);
  const motionFlat = cow ? motion_cow : motion_cat;
  const move = Object.fromEntries(
    Object.entries(motionFlat).map(([k, v]) => [k, { x: v.x * mag, y: v.y * mag }])
  );
  return interpolateJoints(rest, { move }, 1, floorY);
}

function makeSvg(frame, exercise, motionData) {
  const pk = motionData.posture;
  const floorY = motionData.floorY || POSTURES[pk].floorY;
  const joints = frame;
  const lines = POSTURES[pk].lines;
  const hr = POSTURES[pk].head_r || 12;
  const accent = motionData.highlightColor || '#FFF';
  const annotations = motionData.annotations || [];

  // Build ghost (rest position)
  const ghost = POSTURES[pk];
  let ghostSvg = '';
  for (const [a, b] of lines) {
    if (!ghost[a] || !ghost[b]) continue;
    ghostSvg += `<line x1="${ghost[a].x}" y1="${ghost[a].y}" x2="${ghost[b].x}" y2="${ghost[b].y}"/>`;
  }

  // Build active skeleton
  let activeSvg = '';
  for (const [a, b] of lines) {
    if (!joints[a] || !joints[b]) continue;
    activeSvg += `<line x1="${+joints[a].x.toFixed(1)}" y1="${+joints[a].y.toFixed(1)}" x2="${+joints[b].x.toFixed(1)}" y2="${+joints[b].y.toFixed(1)}"/>`;
  }

  // Build highlights
  let highlightSvg = '';
  for (const [a, b] of (motionData.highlight || [])) {
    if (!joints[a] || !joints[b]) continue;
    highlightSvg += `<line x1="${+joints[a].x.toFixed(1)}" y1="${+joints[a].y.toFixed(1)}" x2="${+joints[b].x.toFixed(1)}" y2="${+joints[b].y.toFixed(1)}" stroke="${accent}" stroke-width="5" opacity="0.6"/>`;
  }

  // Build annotations
  let annoSvg = '';
  for (const a of annotations) {
    if (a.type === 'arrow') {
      const x1 = a.x1, x2 = a.x2, y = a.y;
      annoSvg += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${a.color}" stroke-width="2" stroke-dasharray="4,3"/>`;
      annoSvg += `<polygon points="${x2},${y-5} ${x2+10},${y} ${x2},${y+5}" fill="${a.color}"/>`;
      if (a.label) annoSvg += `<text x="${(x1+x2)/2}" y="${a.labelY}" fill="${a.color}" font-size="10" text-anchor="middle" font-family="sans-serif">${a.label}</text>`;
    } else if (a.type === 'arc') {
      const refJ = joints[a.joint] || ghost[a.joint] || { x: 205, y: 55 };
      const cx = refJ.x + (a.dx || 0);
      const cy = refJ.y + (a.dy || 0);
      const yOff = a.yOff || 20;
      annoSvg += `<path d="M ${cx-25} ${cy+yOff-10} Q ${cx} ${cy-yOff-8} ${cx+25} ${cy+yOff-10}" stroke="${a.color}" stroke-width="2" fill="none" stroke-dasharray="4,3"/>`;
      if (a.label) annoSvg += `<text x="${cx}" y="${cy-yOff-12}" fill="${a.color}" font-size="10" text-anchor="middle" font-family="sans-serif">${a.label}</text>`;
    } else if (a.type === 'text') {
      const j = a.joint || 'right_hand';
      const jp = joints[j] || ghost[j];
      if (jp) {
        const tx = jp.x + (a.dx || 0);
        const ty = jp.y + (a.dy || 0);
        annoSvg += `<text x="${+tx.toFixed(1)}" y="${+ty.toFixed(1)}" fill="${a.color}" font-size="10" font-family="sans-serif">${a.text}</text>`;
      }
    }
  }

  const title = exercise.name;
  const instruction = exercise.instruction || exercise.label;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${S.bgColor}"/>
<line x1="20" y1="${floorY}" x2="380" y2="${floorY}" stroke="${S.floorColor}" stroke-width="${S.floorStroke}" stroke-linecap="round"/>
<text x="200" y="38" fill="#888" font-size="13" font-family="sans-serif" text-anchor="middle">${title}</text>
<text x="200" y="58" fill="#666" font-size="10" font-family="sans-serif" text-anchor="middle">${instruction}</text>
<g stroke="${S.ghostColor}" stroke-width="${S.ghostStroke}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${S.ghostOpacity}">
  <circle cx="${ghost.head.x}" cy="${ghost.head.y}" r="${hr}" fill="#444" stroke="none"/>
  ${ghostSvg}
</g>
<g stroke="${S.activeColor}" stroke-width="${S.activeStroke}" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="${+joints.head.x.toFixed(1)}" cy="${+joints.head.y.toFixed(1)}" r="${hr}" fill="#FFF" stroke="none"/>
  ${activeSvg}
  ${highlightSvg}
</g>
${annoSvg}
</svg>`;
}

// ============== GENERATION ==============

const outputDir = path.join(ROOT, 'assets', 'animations');

for (const exercise of plan.exercises) {
  const motion = MOTIONS[exercise.id];
  if (!motion) {
    console.log(`  SKIP ${exercise.name.padEnd(25)} no motion definition`);
    continue;
  }

  const postureKey = motion.posture;
  const ghost = POSTURES[postureKey];
  if (!ghost) {
    console.log(`  SKIP ${exercise.name.padEnd(25)} unknown posture: ${postureKey}`);
    continue;
  }

  const sceneDir = path.join(outputDir, exercise.id);
  fs.mkdirSync(sceneDir, { recursive: true });

  const floorY = motion.floorY || ghost.floorY;
  const isCatCow = exercise.id === 'cat-cow';

  for (let f = 0; f < TOTAL_FRAMES; f++) {
    const t = f / TOTAL_FRAMES;
    const phase = t % 1;
    const p = phase < 0.5 ? easeInOut(phase * 2) : easeInOut((1 - phase) * 2);

    let joints;
    if (isCatCow) {
      joints = catCowInterpolate(ghost, motion.cat, motion.cow, t, floorY);
    } else {
      joints = interpolateJoints(ghost, motion, p, floorY);
    }

    const mergedAnnotations = exercise.annotations || motion.annotations || [];
    const svg = makeSvg(joints, exercise, { ...motion, annotations: mergedAnnotations });
    const frameFile = path.join(sceneDir, `frame-${String(f).padStart(3, '0')}.svg`);
    fs.writeFileSync(frameFile, svg);
  }

  const html = `<html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0f0f1a;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;flex-direction:column;gap:12px}
h2{color:#FFF;font-size:18px;font-weight:600}
h3{color:#888;font-size:13px;font-weight:400}
canvas{width:600px;height:450px;background:#0f0f1a;border-radius:12px;margin-top:8px}
</style></head><body>
<h2>${exercise.name}</h2>
<h3>${exercise.label}</h3>
<canvas id="c"></canvas>
<script>
const c=document.getElementById('c'),ctx=c.getContext('2d');c.width=600;c.height=450;
const total=${TOTAL_FRAMES};const imgs=[];let fi=0;
function load(i){if(i>=total){setInterval(play,${1000/FR});return}
const img=new Image();img.onload=()=>{imgs[i]=img;load(i+1)};
img.onerror=()=>{imgs[i]=null;load(i+1)};
img.src='frame-'+String(i).padStart(3,'0')+'.svg'}
function play(){ctx.clearRect(0,0,c.width,c.height);const img=imgs[fi];
if(img){const s=c.width/400;ctx.scale(s,s);ctx.drawImage(img,0,0,400,300);ctx.setTransform(1,0,0,1,0,0)}
fi=(fi+1)%total}
load(0);
</script></body></html>`;
  fs.writeFileSync(path.join(sceneDir, 'index.html'), html);

  // Generate Lottie JSON (image sequence format, portable for lottie-react-native)
  const assets = Array.from({ length: TOTAL_FRAMES }, (_, i) => ({
    id: `frame_${i}`, w: W, h: H, u: '',
    p: `frame-${String(i).padStart(3, '0')}.svg`, e: 1,
  }));
  const lottie = {
    v: '5.7.0', fr: FR, ip: 0, op: TOTAL_FRAMES, w: W, h: H,
    nm: exercise.name,
    assets,
    layers: [{
      ty: 0, nm: exercise.name, ip: 0, op: TOTAL_FRAMES, st: 0, sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [W / 2, H / 2, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
    }],
  };
  fs.writeFileSync(path.join(sceneDir, 'lottie.json'), JSON.stringify(lottie, null, 2));

  console.log(`${exercise.name.padEnd(25)} ${exercise.id}`);
}

console.log(`\nDone. Generated exercises with motion definitions.`);
