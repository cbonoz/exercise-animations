# Animation Build Plan

Stick figure Lottie animations for all 50 exercises across 8 muscle groups.

## Priority Order

Build in this order — groups sorted by prevalence in generated routines (core + hamstring + glute first).

---

## P1 — Already Built (5)

| # | Exercise | Scene |
|---|----------|-------|
| 1 | Hamstring Slides | scene-1 |
| 2 | Bridges | scene-2 |
| 3 | Cat-Cow | scene-3 |
| 4 | Dead Bugs | scene-4 |
| 5 | Clamshells | scene-5 |

---

## P2 — Core / Hamstring / Glute (17)

### Hamstring (7 remaining)
| # | Exercise | Motion |
|---|----------|--------|
| 6 | Prone Hamstring Curls | lying face down, curl heel to glute |
| 7 | Standing Hamstring Curls | standing, curl heel to glute |
| 8 | Romanian Deadlifts | hip hinge, band resistance |
| 9 | Good Mornings | hip hinge, hands behind head |
| 10 | Nordic Curls | kneeling, slow lower torso |
| 11 | Straight-Leg Deadlifts | hip hinge, straight legs, band |
| 12 | Hamstring Stretch | seated reach to extended foot |

### Glute (5 remaining)
| # | Exercise | Motion |
|---|----------|--------|
| 13 | Single-Leg Bridges | bridge one leg extended |
| 14 | Banded Walks | side steps with band |
| 15 | Fire Hydrants | on all fours, knee out to side |
| 16 | Glute Kickbacks | on all fours, kick back and up |

### Core (6 remaining)
| # | Exercise | Motion |
|---|----------|--------|
| 17 | Bird Dogs | all fours, opposite arm + leg extend |
| 18 | Planks | forearm plank hold |
| 19 | Side Planks | side body hold |
| 20 | Pelvic Tilts | supine posterior tilt |
| 21 | Hollow Holds | supine hollow body hold |
| 22 | Supermans | prone, lift arms + legs |
| 23 | Crunches | supine curl |

---

## P3 — Quads / Hip / Mobility (15)

### Quad (5)
| # | Exercise | Motion |
|---|----------|--------|
| 24 | Quad Sets | supine, tighten quad |
| 25 | Straight Leg Raises | supine, lift straight leg |
| 26 | Step-Ups | step onto platform |
| 27 | Wall Sits | wall slide to 90° |
| 28 | Terminal Knee Extensions | band resisted extension |

### Hip (6)
| # | Exercise | Motion |
|---|----------|--------|
| 29 | Hip Flexor Stretch | kneeling lunge stretch |
| 30 | Figure-4 Stretch | supine, ankle over knee |
| 31 | Hip Circles | standing leg circles |
| 32 | Banded Hip Flexion | band resisted knee drive |
| 33 | Pigeon Pose | seated external rotation |
| 34 | 90-90 Stretch | seated 90° legs |

### Mobility (6)
| # | Exercise | Motion |
|---|----------|--------|
| 35 | Child's Pose | kneeling, arms forward |
| 36 | World's Greatest Stretch | lunge + thoracic rotation |
| 37 | Thread the Needle | all fours, arm under |
| 38 | Seated Spinal Twist | seated twist |
| 39 | Standing Side Bend | lateral side bend |

---

## P4 — Balance / Shoulder (11)

### Balance (5)
| # | Exercise | Motion |
|---|----------|--------|
| 40 | Single-Leg Stance | stand on one foot |
| 41 | Tandem Walk | heel-to-toe walk |
| 42 | Heel-to-Toe Stand | tandem stance hold |
| 43 | Lateral Step-Overs | side step over obstacle |
| 44 | Marching | high knee march |

### Shoulder (6)
| # | Exercise | Motion |
|---|----------|--------|
| 46 | Pendulum Swings | bent forward arm circles |
| 47 | Band Pull-Aparts | horizontal band pull |
| 48 | Wall Slides | arms slide up wall |
| 49 | Scapular Retractions | scap squeeze |
| 50 | Doorway Stretch | doorway chest stretch |
| 51 | Chest Opener | hands behind back |

---

## Notes

- **Style**: Stick figure, neutral colored limbs, 400×300 canvas, 72 frames at 24fps
- **Output**: `lottie.json` (Lottie format) + SVG frames (`frame-*.svg`) + static poster SVG
- **Existing generator**: `scripts/generate-exercise.cjs` in bridge-recovery has the stick-figure drawing primitives
- **Preview**: `npm run preview` serves local preview at http://localhost:3001
