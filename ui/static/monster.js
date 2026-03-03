/* =============================================================
   Monster Expression Generator — p5.js
   Based on Darwin's "Expression of Emotions in Man and Animals"
   ============================================================= */

'use strict';

// ── Palette ──────────────────────────────────────────────────────────────────
const TEAL       = [72, 185, 185];
const TEAL_DARK  = [45, 148, 155];
const TEAL_DEEP  = [28, 105, 112];
const TEAL_LIGHT = [155, 225, 220];
const WHITE      = [255, 255, 255];
const BLACK      = [20, 20, 22];
const GUM_RED    = [200, 55, 55];
const SWEAT_CLR  = [100, 195, 235];
const SHADOW_CLR = [195, 220, 220];
const BG         = [248, 248, 248];

let _limbCol = null;   // set each frame by renderMonster (supports pallor)

const SIZE = 480;

// ── Animation state ───────────────────────────────────────────────────────────
let currentParams = null;
let fromParams    = null;
let targetParams  = null;
let monsterState  = null;
let animT         = 1.0;
const ANIM_FRAMES = 28;

// ── Seeded deterministic RNG ──────────────────────────────────────────────────
function makeRng(seed) {
  let s = (seed ^ 0xDEADBEEF) >>> 0;
  return () => { s ^= s<<13; s ^= s>>>17; s ^= s<<5; return (s>>>0)/0xFFFFFFFF; };
}

// ── Math helpers ──────────────────────────────────────────────────────────────
function lv(a, b, t)    { return a + (b - a) * t; }
function lerp2(p, q, t) { return [lv(p[0],q[0],t), lv(p[1],q[1],t)]; }
function easeInOut(t)   { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }

function evalBezier(t, ctrl) {
  let pts = ctrl.map(p => [...p]);
  while (pts.length > 1)
    pts = pts.slice(0,-1).map((p,i) => lerp2(p, pts[i+1], t));
  return pts[0];
}

// Draw a bezier curve as a dense polyline
function drawBezierCurve(ctrl, steps = 80) {
  noFill();
  beginShape();
  for (let i = 0; i <= steps; i++) {
    const [x, y] = evalBezier(i/steps, ctrl);
    vertex(x, y);
  }
  endShape();
}

// ── Organic blob (low-amplitude harmonic polar noise) ────────────────────────
function makeBlob(cx, cy, rx, ry, seed = 7) {
  const rng = makeRng(seed);
  // Even-frequency cosines only: cos(2a), cos(4a), cos(6a)
  // cos(freq*(2π−a)) = cos(freq*a)  → top/bottom symmetry
  // cos(freq*(π−a))  = cos(freq*a) when freq is even → left/right symmetry
  const harmonics = Array.from({length: 3}, () => [
    (Math.floor(rng() * 3) + 1) * 2,   // freq ∈ {2, 4, 6}
    rng() * 0.012 + 0.004,              // tiny amplitude
  ]);
  const pts = [];
  for (let i = 0; i < 120; i++) {
    const a = Math.PI * 2 * i / 120;
    let r = 1.0;
    for (const [freq, amp] of harmonics)
      r += amp * Math.cos(freq * a);    // no phase shift → fully symmetric
    r = Math.max(0.97, Math.min(1.03, r));
    pts.push([cx + rx * r * Math.cos(a), cy + ry * r * Math.sin(a)]);
  }
  return pts;
}

// ── Rounded-rectangle body ────────────────────────────────────────────────────
function drawRoundedBody(cx, cy, hw, hh, r, col) {
  // hw = half-width, hh = half-height, r = corner radius
  // k = bezier handle length for a quarter-circle approximation
  const k = r * 0.552;
  fill(...col); noStroke();
  beginShape();
  vertex(cx - hw + r, cy - hh);
  bezierVertex(cx - hw + r - k, cy - hh,   cx - hw, cy - hh + r - k,   cx - hw, cy - hh + r);
  vertex(cx - hw, cy + hh - r);
  bezierVertex(cx - hw, cy + hh - r + k,   cx - hw + r - k, cy + hh,   cx - hw + r, cy + hh);
  vertex(cx + hw - r, cy + hh);
  bezierVertex(cx + hw - r + k, cy + hh,   cx + hw, cy + hh - r + k,   cx + hw, cy + hh - r);
  vertex(cx + hw, cy - hh + r);
  bezierVertex(cx + hw, cy - hh + r - k,   cx + hw - r + k, cy - hh,   cx + hw - r, cy - hh);
  endShape(CLOSE);
}

function drawBlob(cx, cy, rx, ry, col, seed = 7) {
  fill(...col);
  noStroke();
  const pts = makeBlob(cx, cy, rx, ry, seed);
  beginShape();
  for (const [x, y] of pts) vertex(x, y);
  endShape(CLOSE);
}

// ── Eye with drooping lid ─────────────────────────────────────────────────────
function makeEyePoly(cx, cy, rx, ry, lid = 0, n = 72) {
  const lid_y = cy - ry + 2 * ry * Math.min(0.95, lid);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI * 2 * i / n;
    let px = cx + rx * Math.cos(a);
    let py = cy + ry * Math.sin(a);
    if (py < lid_y) py = lid_y;
    pts.push([px, py]);
  }
  return pts;
}

function drawEye(cx, cy, size, openness, pupilScale, lidDrop, crinkle = 0, isLeft = true, pupilDx = 0, pupilDy = 0, closed = false) {
  const rx = size;
  const ry = Math.max(6, Math.round(size * openness));

  // Crow's feet drawn in both open and closed states
  if (crinkle > 0) {
    const dir     = isLeft ? -1 : 1;
    const cantX   = cx + dir * rx;
    const cantY   = cy;
    const lineLen = 5 + crinkle * 11;
    noFill();
    stroke(20, 20, 22, Math.round(80 + crinkle * 110));
    strokeWeight(1.2 + crinkle * 1.0);
    for (const ang of [-0.30, 0.05, 0.38]) {
      const tipX = cantX + dir * Math.cos(ang) * lineLen;
      const tipY = cantY +       Math.sin(ang) * lineLen;
      beginShape();
      vertex(cantX, cantY);
      bezierVertex(
        cantX + dir * lineLen * 0.40 * Math.cos(ang), cantY + lineLen * 0.40 * Math.sin(ang),
        cantX + dir * lineLen * 0.75 * Math.cos(ang), cantY + lineLen * 0.75 * Math.sin(ang),
        tipX, tipY
      );
      endShape();
    }
  }

  // Closed eye: draw a single lid arc and return
  if (closed) {
    const arcH = Math.max(8, Math.round(ry * 0.65));
    stroke(...TEAL_DEEP); strokeWeight(3); noFill();
    drawBezierCurve([[cx - rx, cy], [cx, cy - arcH], [cx + rx, cy]]);
    return;
  }

  // Sclera
  const pts = makeEyePoly(cx, cy, rx, ry, lidDrop);
  fill(...WHITE); noStroke();
  beginShape();
  for (const [x, y] of pts) vertex(x, y);
  endShape(CLOSE);

  // Pupil — constrained fully inside the visible eye area
  const lid_y  = cy - ry + 2 * ry * Math.min(0.95, lidDrop);
  const eyeTop = Math.max(cy - ry, lid_y);
  const eyeBot = cy + ry;
  const eyeMidY = (eyeTop + eyeBot) / 2;
  const maxPr   = Math.max(3, Math.floor((eyeBot - eyeTop) / 2) - 2);
  const pr      = Math.min(maxPr, Math.max(4, Math.round(size * 0.52 * pupilScale)));

  // Apply pupil offset (clamped inside the visible eye area)
  const maxPx = Math.max(0, rx - pr - 2);
  const maxPy = Math.max(0, (eyeBot - eyeTop) / 2 - pr - 2);
  const px = cx      + Math.max(-maxPx, Math.min(maxPx, pupilDx));
  const py = eyeMidY + Math.max(-maxPy, Math.min(maxPy, pupilDy));

  fill(...BLACK); noStroke();
  ellipse(px, py, pr * 2, pr * 2);

  // Glint
  const gr = Math.max(2, Math.round(pr / 3));
  fill(...WHITE);
  ellipse(px + pr * 0.38, py - pr * 0.38, gr * 2, gr * 2);

  // Lid edge
  if (lidDrop > 0) {
    stroke(...TEAL_DARK); strokeWeight(3);
    line(cx - rx + 3, lid_y, cx + rx - 3, lid_y);
  }

}

// ── Eyebrow ───────────────────────────────────────────────────────────────────
function drawEyebrow(cx, cy, browAngle, hOffset, thickness, isLeft) {
  // browAngle > 0 → inner corner UP  (sad / Darwin obliquity)
  // browAngle < 0 → inner corner DOWN (angry V-shape)
  const halfW  = 19;
  const h      = cy + hOffset;
  const innerX = isLeft ? cx + halfW : cx - halfW;
  const outerX = isLeft ? cx - halfW : cx + halfW;
  const innerY = h - browAngle * 20;
  const outerY = h + browAngle * 8;
  const midY   = Math.min(innerY, outerY) - 7;

  stroke(...BLACK); strokeWeight(thickness);
  drawBezierCurve([[outerX, outerY], [cx, midY], [innerX, innerY]]);
}

// ── Mouth ─────────────────────────────────────────────────────────────────────
function drawMouth(cx, cy, curve, width, openH, teeth, openUp = false, openRound = false, maxUpH = openH, bruxism = 0, lowerTeeth = false) {
  if (openH > 12) {
    const W = width, ins = 5;

    if (openRound) {
      // ── O-shaped mouth (surprised) ────────────────────────────────────────
      const r = openH * 0.55;
      fill(...BLACK); noStroke();
      ellipse(cx, cy, (r + 5) * 2, (r + 5) * 2);
      fill(...GUM_RED);
      ellipse(cx, cy, r * 2, r * 2);
      return;
    }

    // Negative curve (sad/fearful affect) drives upward opening even without explicit flag
    const goUp = openUp || (curve < -0.15 && !openRound);
    // Cap upward height so the triangle never covers the nostrils
    const H = goUp ? Math.min(openH, maxUpH) : openH;

    if (!goUp) {
      // ── Downward opening (happy / positive) ──────────────────────────────
      fill(...BLACK); noStroke();
      beginShape();
      vertex(cx - W, cy);
      bezierVertex(cx-W+10, cy-7,      cx+W-10, cy-7,      cx+W, cy);
      bezierVertex(cx+W+6,  cy+H*0.72, cx+W*0.22, cy+H,   cx,    cy+H);
      bezierVertex(cx-W*0.22, cy+H,    cx-W-6, cy+H*0.72,  cx-W, cy);
      endShape(CLOSE);

      fill(...GUM_RED);
      beginShape();
      vertex(cx-W+ins, cy+3);
      bezierVertex(cx-W+ins+8, cy-3,         cx+W-ins-8, cy-3,         cx+W-ins,  cy+3);
      bezierVertex(cx+W-ins+4, cy+H*0.72-2,  cx+W*0.22-2, cy+H-ins,   cx,        cy+H-ins);
      bezierVertex(cx-W*0.22+2, cy+H-ins,    cx-W+ins-4, cy+H*0.72-2, cx-W+ins,  cy+3);
      endShape(CLOSE);

      if (teeth) {
        // 4 triangular monster fangs — outer pair angled inward, inner pair nearly vertical
        const nT = 4, tw = (W * 2 - 10) / nT;
        const tipLen = Math.min(14, H - 4);
        if (tipLen > 4) {
          fill(...WHITE); noStroke();
          for (let j = 0; j < nT; j++) {
            const tx = cx - W + 5 + j * tw + tw / 2;
            const t2 = ((tx - cx) / W) ** 2;
            const bY = cy + 5 - 6 * (1 - t2);         // 2px clearance from lip outline
            const tiltX = (tx - cx) * -0.40;           // tip leans toward center
            beginShape();
            vertex(tx - tw / 2 + 1, bY);
            vertex(tx + tw / 2 - 1, bY);
            vertex(tx + tiltX, bY + tipLen);
            endShape(CLOSE);
          }
        }
      }

      // Lower jaw teeth — visible in full snarl / peak intensity states
      // Each tooth's base follows the parabolic approximation of the inner lower gum curve:
      // cy+3 at the edges (x=±W) curving down to cy+H-ins at the center
      if (lowerTeeth) {
        const lowerW = W * 0.55;
        const nT = 4, tw = (lowerW * 2 - 8) / nT;
        const tipLen = Math.min(11, H * 0.28);
        if (tipLen > 3) {
          fill(...WHITE); noStroke();
          for (let j = 0; j < nT; j++) {
            const tx = cx - lowerW + 4 + j * tw + tw / 2;
            const t2  = ((tx - cx) / W) ** 2;
            const bY  = cy + 3 + (H - 8) * (1 - t2);  // follows the lower jaw curve
            const tiltX = (tx - cx) * -0.35;
            beginShape();
            vertex(tx - tw / 2 + 1, bY);
            vertex(tx + tw / 2 - 1, bY);
            vertex(tx + tiltX, bY - tipLen);   // tips point upward into the cavity
            endShape(CLOSE);
          }
        }
      }

    } else {
      // ── Upward opening (fearful / distressed — inverted triangle) ─────────
      fill(...BLACK); noStroke();
      beginShape();
      vertex(cx-W, cy);
      bezierVertex(cx-W+10, cy+7,       cx+W-10, cy+7,      cx+W, cy);
      bezierVertex(cx+W+6,  cy-H*0.72,  cx+W*0.22, cy-H,   cx,    cy-H);
      bezierVertex(cx-W*0.22, cy-H,     cx-W-6, cy-H*0.72,  cx-W, cy);
      endShape(CLOSE);

      fill(...GUM_RED);
      beginShape();
      vertex(cx-W+ins, cy-3);
      bezierVertex(cx-W+ins+8, cy+3,         cx+W-ins-8, cy+3,         cx+W-ins,  cy-3);
      bezierVertex(cx+W-ins+4, cy-H*0.72+2,  cx+W*0.22-2, cy-H+ins,   cx,        cy-H+ins);
      bezierVertex(cx-W*0.22+2, cy-H+ins,    cx-W+ins-4, cy-H*0.72+2, cx-W+ins,  cy-3);
      endShape(CLOSE);

      if (teeth) {
        // 4 triangular monster fangs — outer pair angled inward, inner pair nearly vertical
        const nT = 4, tw = (W * 2 - 10) / nT;
        const tipLen = Math.min(12, H - 4);
        if (tipLen > 3) {
          fill(...WHITE); noStroke();
          for (let j = 0; j < nT; j++) {
            const tx = cx - W + 5 + j * tw + tw / 2;
            const t2 = ((tx - cx) / W) ** 2;
            const bY = cy - 5 + 6 * (1 - t2);         // 2px clearance from lip outline
            const tiltX = (tx - cx) * -0.40;           // tip leans toward center
            beginShape();
            vertex(tx - tw / 2 + 1, bY);
            vertex(tx + tw / 2 - 1, bY);
            vertex(tx + tiltX, bY - tipLen);
            endShape(CLOSE);
          }
        }
      }
    }

  } else {
    // Closed curve
    const midY = cy + curve * 30;

    // Bruxism: clenched teeth peeking through compressed lips
    // Bases are pushed 5px away from lip center so the strokeWeight(5) line
    // only covers the very tip of each base, leaving the tooth body clearly visible
    if (bruxism > 0) {
      const nT = 4, tw = (width * 2 - 10) / nT;
      const toothH = Math.round(6 + bruxism * 9);  // 6–15px, large enough to clear the stroke
      const gap = 5;                                // px from lip center to tooth base
      fill(...WHITE); noStroke();
      for (let j = 0; j < nT; j++) {
        const tx = cx - width + 5 + j * tw + tw / 2;
        const t2 = ((tx - cx) / width) ** 2;
        const lipY = cy + (midY - cy) * (1 - t2) / 2;  // /2: midY is a control point, not on curve
        const tiltX = (tx - cx) * -0.35;
        // Upper teeth: base at lip, tip pokes upward through upper lip
        beginShape();
        vertex(tx - tw / 2 + 1, lipY + 2);
        vertex(tx + tw / 2 - 1, lipY + 2);
        vertex(tx + tiltX,      lipY + 2 - toothH);
        endShape(CLOSE);
        // Lower teeth: base at lip, tip pokes downward through lower lip
        beginShape();
        vertex(tx - tw / 2 + 1, lipY - 2);
        vertex(tx + tw / 2 - 1, lipY - 2);
        vertex(tx + tiltX,      lipY - 2 + toothH);
        endShape(CLOSE);
      }
    }

    stroke(...BLACK); strokeWeight(5);
    drawBezierCurve([[cx-width, cy], [cx, midY], [cx+width, cy]]);
  }
}

// ── Limbs (tapered: thin at origin, thick at tip) ────────────────────────────
function drawTaperedLimb(ctrl, wStart, wEnd, steps = 22) {
  noFill(); strokeCap(ROUND); strokeJoin(ROUND);
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const [x0, y0] = evalBezier(t0, ctrl);
    const [x1, y1] = evalBezier(t1, ctrl);
    stroke(...(_limbCol || TEAL_DARK));
    strokeWeight(lv(wStart, wEnd, (t0 + t1) / 2));
    line(x0, y0, x1, y1);
  }
}

function drawLeg(p0, p1, p2) {
  drawTaperedLimb([p0, p1, p2], 22, 30);   // elephant: thick column
}

function drawArm(p0, p1, p2) {
  drawTaperedLimb([p0, p1, p2], 18, 24);   // elephant: thick throughout
}

// ── Horns (devil horns: wide outer sweep, sharp tip) ─────────────────────────
function drawHorns(cx, cy, headRx, headRy, col) {
  const dark = col.map(c => Math.round(c * 0.68));  // inner-face shadow

  for (const s of [-1, 1]) {
    // Base anchors on the upper side of the head
    const boX = cx + s * headRx * 0.52,  boY = cy - headRy * 0.46;  // outer base
    const biX = cx + s * headRx * 0.18,  biY = cy - headRy * 0.84;  // inner base
    // Tip — sweeps outward to the side
    const tipX = cx + s * headRx * 1.02, tipY = cy - headRy * 0.82;
    // Outer edge: rises upward first, then arcs out to tip
    const oc1x = cx + s * headRx * 0.48, oc1y = cy - headRy * 1.18;
    const oc2x = cx + s * headRx * 1.10, oc2y = cy - headRy * 1.00;
    // Inner edge: curves gently from tip back down to inner base
    const ic1x = cx + s * headRx * 0.30, ic1y = cy - headRy * 0.72;

    // Main horn fill
    fill(...col); noStroke();
    beginShape();
    vertex(boX, boY);
    bezierVertex(oc1x, oc1y, oc2x, oc2y, tipX, tipY);
    bezierVertex(ic1x, ic1y, biX + s * 5, biY, biX, biY);
    endShape(CLOSE);

    // Inner-face shadow strip (depth / curvature illusion)
    fill(...dark); noStroke();
    beginShape();
    vertex(tipX, tipY);
    bezierVertex(ic1x, ic1y, biX + s * 8, biY - 4, biX + s * 16, biY - 20);
    bezierVertex(cx + s * headRx * 0.72, cy - headRy * 1.04,
                 cx + s * headRx * 0.95, cy - headRy * 0.90, tipX, tipY);
    endShape(CLOSE);
  }
}

// ── Sleep ZZZs ────────────────────────────────────────────────────────────────
function drawZzzz(cx, cy, headRx, headRy, intensity) {
  const zs = [
    { x: cx + headRx * 0.52, y: cy - headRy * 1.12, sz: 8 },
    { x: cx + headRx * 0.70, y: cy - headRy * 1.45, sz: 12 },
    { x: cx + headRx * 0.84, y: cy - headRy * 1.82, sz: 16 },
  ];
  noFill();
  for (const { x, y, sz } of zs) {
    const a = Math.round(intensity * 190);
    stroke(90, 90, 115, a);
    strokeWeight(1.4 + sz * 0.07);
    const w = sz, h = sz * 0.85;
    beginShape();
    vertex(x,     y);
    vertex(x + w, y);
    vertex(x,     y + h);
    vertex(x + w, y + h);
    endShape();
  }
}

// ── Hunger drool ─────────────────────────────────────────────────────────────
// curve: mouth curve value (positive = smile, negative = frown) so we follow the lip
function drawDrool(cx, mY, mouthW, curve, intensity) {
  const a    = Math.round(intensity * 210);
  // Place at the right corner, tracking the actual bezier curve position at that x
  const tx   = cx + mouthW * 0.88;
  const u2   = ((tx - cx) / mouthW) ** 2;
  const cornerY = mY + (curve * 30) * (1 - u2) / 2;  // actual curve y at corner
  const r    = Math.round(4 + intensity * 3);          // small, subtle
  fill(80, 208, 226, a); noStroke();
  arc(tx, cornerY, r * 2, r * 2, 0, Math.PI);          // single downward semicircle
}

// ── FX overlays ───────────────────────────────────────────────────────────────
function drawBlush(cx, cy, rx, intensity) {
  const rng = makeRng(42);
  const r = 22 * intensity, bxOff = rx * 0.44;
  noStroke();
  for (const bx of [cx - bxOff, cx + bxOff]) {
    const by = cy;
    for (let i = 0; i < 5; i++) {
      fill(228, 132, 138, 110);
      ellipse(bx + (rng()-0.5)*r*0.67, by + (rng()-0.5)*r*0.5, r, r * 0.65);
    }
  }
}

function drawSpikes(cx, cy, rx, ry, n, h) {
  fill(...TEAL_DARK); noStroke();
  for (let i = 0; i < n; i++) {
    const a   = Math.PI * 2 * i / n;
    const pa  = a + Math.PI / 2;        // tangent direction (perpendicular to outward normal)
    const cpa = Math.cos(pa), spa = Math.sin(pa);

    // Root sits slightly inside body surface so hair merges with body fill
    const bx = cx + (rx - 3) * Math.cos(a), by = cy + (ry - 3) * Math.sin(a);
    const tx = cx + (rx + h) * Math.cos(a), ty = cy + (ry + h) * Math.sin(a);
    const dx = tx - bx, dy = ty - by;

    const hw = 2.5;   // narrow half-width at root

    // Tapered teardrop strand: wide at root, rounded tip
    beginShape();
    vertex(bx + hw * cpa, by + hw * spa);
    bezierVertex(
      bx + hw * cpa + dx * 0.5, by + hw * spa + dy * 0.5,
      tx + hw * 0.15 * cpa,     ty + hw * 0.15 * spa,
      tx, ty
    );
    bezierVertex(
      tx - hw * 0.15 * cpa,     ty - hw * 0.15 * spa,
      bx - hw * cpa + dx * 0.5, by - hw * spa + dy * 0.5,
      bx - hw * cpa, by - hw * spa
    );
    endShape(CLOSE);
  }
}

function drawSweat(cx, cy, rx) {
  fill(...SWEAT_CLR); noStroke();
  for (const [ox, oy, sc] of [[rx+22,-52,1.0],[rx+32,-16,0.72]]) {
    const sx = cx+ox, sy = cy+oy, r = 8*sc;
    // Single continuous teardrop: pointed top, round bottom — no seam
    beginShape();
    vertex(sx, sy - r * 2.4);
    bezierVertex(sx + r*0.55, sy - r*1.5,  sx + r, sy - r*0.3,  sx + r, sy + r*0.2);
    bezierVertex(sx + r,      sy + r,       sx - r, sy + r,       sx - r, sy + r*0.2);
    bezierVertex(sx - r,      sy - r*0.3,   sx - r*0.55, sy - r*1.5,  sx, sy - r*2.4);
    endShape(CLOSE);
  }
}

// ── Tongue ────────────────────────────────────────────────────────────────────
function drawTongue(cx, cy, mouthW, openH, side = 0) {
  // cy = mouth reference Y (lip line); tongue sits in the lower part of the cavity
  const baseY = cy + Math.round(openH * 0.28);
  const tongW = Math.max(8, Math.round(mouthW * 0.52));
  const tongH = Math.round(openH * 0.58 + 14);
  const tx    = cx + side * mouthW * 0.35;   // lateral offset for ahegao

  // Tongue body
  fill(220, 80, 100); noStroke();
  beginShape();
  vertex(tx - tongW / 2, baseY);
  bezierVertex(
    tx - tongW / 2 - 4, baseY + tongH * 0.40,
    tx - tongW / 2 + 2, baseY + tongH,
    tx,                  baseY + tongH
  );
  bezierVertex(
    tx + tongW / 2 - 2, baseY + tongH,
    tx + tongW / 2 + 4, baseY + tongH * 0.40,
    tx + tongW / 2,     baseY
  );
  endShape(CLOSE);

  // Center groove
  stroke(185, 50, 65); strokeWeight(1.5); noFill();
  beginShape();
  vertex(tx, baseY + 5);
  bezierVertex(tx, baseY + tongH * 0.50, tx, baseY + tongH * 0.85, tx, baseY + tongH - 5);
  endShape();
}

// ── Forehead wrinkles (Duchenne: frontalis / corrugator / procerus) ───────────
function drawForehead(cx, browY, type, intensity) {
  if (!type || intensity <= 0) return;
  noFill();
  stroke(20, 20, 22, Math.round(intensity * 170 + 40));

  if (type === 'attention') {
    // 3 arching horizontal lines across forehead — frontalis raised (surprise / attention)
    strokeWeight(1.2 + intensity * 0.8);
    for (let i = 0; i < 3; i++) {
      const y = browY - 14 - i * 9;
      const w = 52 - i * 10;
      beginShape();
      vertex(cx - w, y + 4);
      bezierVertex(cx - w * 0.4, y - 4, cx + w * 0.4, y - 4, cx + w, y + 4);
      endShape();
    }

  } else if (type === 'suffering') {
    // 2 short lines center-band only — corrugator obliquity (pain / grief)
    strokeWeight(1.5 + intensity * 0.8);
    for (let i = 0; i < 2; i++) {
      const y = browY - 10 - i * 8;
      const w = 16;
      beginShape();
      vertex(cx - w, y + 2);
      bezierVertex(cx - w * 0.3, y - 3, cx + w * 0.3, y - 3, cx + w, y + 2);
      endShape();
    }

  } else if (type === 'focus') {
    // 2 short vertical lines between brows — procerus / corrugator (anger / deep effort)
    strokeWeight(2 + intensity * 1.5);
    for (const dx of [-7, 7]) {
      beginShape();
      vertex(cx + dx, browY - 2);
      bezierVertex(cx + dx * 0.7, browY - 10,
                   cx + dx * 0.6, browY - 16,
                   cx + dx * 0.5, browY - 20);
      endShape();
    }
  }
}

// ── Main renderer ─────────────────────────────────────────────────────────────
function renderMonster(e) {
  strokeCap(ROUND); strokeJoin(ROUND);

  const bp=e.body||{}, ep=e.eyes||{}, brp=e.brows||{}, mp=e.mouth||{}, fx=e.fx||{};
  const pose   = bp.pose || 'neutral';
  const baseRx = Math.round(108 * (bp.width_scale  || 1.0));
  const baseRy = Math.round(100 * (bp.height_scale || 1.0));
  const cx = SIZE / 2, cy = SIZE / 2 - 15;


  // ── Head + body geometry ──────────────────────────────────────────────────
  const headRx = Math.round(baseRx * 0.72);
  const headRy = Math.round(baseRy * 0.76);
  const bodyCy = cy + Math.round(baseRy * 0.80);
  const bodyRx = Math.round(baseRx * 0.62);
  const bodyRy = Math.round(baseRy * 0.48);

  // Limb anchor points (attached to torso)
  const lhip = [cx - Math.round(bodyRx * 0.46), bodyCy + bodyRy - 10];
  const rhip = [cx + Math.round(bodyRx * 0.46), bodyCy + bodyRy - 10];
  const lsho = [cx - bodyRx + 8,  bodyCy - Math.round(bodyRy * 0.30)];
  const rsho = [cx + bodyRx - 8,  bodyCy - Math.round(bodyRy * 0.30)];

  // Pallor (shutdown / extreme fear) — applied to body AND limbs
  const pallor = fx.pallor || 0;
  const bc = pallor > 0 ? TEAL_DARK.map(c => Math.round(c + (210-c)*pallor)) : [...TEAL_DARK];
  _limbCol = bc;

  // Pose-specific limbs
  if (pose === 'neutral') {
    drawLeg(lhip, [lhip[0]-14, lhip[1]+22], [lhip[0]-6,  lhip[1]+55]);
    drawLeg(rhip, [rhip[0]+14, rhip[1]+22], [rhip[0]+6,  rhip[1]+55]);
    drawArm(lsho, [lsho[0]-12, lsho[1]+44], [lsho[0]-10, lsho[1]+105]);
    drawArm(rsho, [rsho[0]+12, rsho[1]+44], [rsho[0]+10, rsho[1]+105]);
  } else if (pose === 'tension') {
    drawLeg(lhip, [lhip[0]-3,  lhip[1]+25], [lhip[0]-2,  lhip[1]+58]);
    drawLeg(rhip, [rhip[0]+3,  rhip[1]+25], [rhip[0]+2,  rhip[1]+58]);
    drawArm(lsho, [lsho[0]-3,  lsho[1]+36], [lsho[0]-2,  lsho[1]+95]);
    drawArm(rsho, [rsho[0]+3,  rsho[1]+36], [rsho[0]+2,  rsho[1]+95]);
  } else if (pose === 'postration') {
    drawLeg(lhip, [lhip[0]-28, lhip[1]+12], [lhip[0]-50, lhip[1]+20]);
    drawLeg(rhip, [rhip[0]+28, rhip[1]+12], [rhip[0]+50, rhip[1]+20]);
    drawArm(lsho, [lsho[0]+10, lsho[1]+20], [lsho[0]+30, lsho[1]+62]);
    drawArm(rsho, [rsho[0]-10, rsho[1]+20], [rsho[0]-30, rsho[1]+62]);
  } else if (pose === 'contraction') {
    drawLeg(lhip, [lhip[0]+12, lhip[1]+16], [lhip[0]+20, lhip[1]+44]);
    drawLeg(rhip, [rhip[0]-12, rhip[1]+16], [rhip[0]-20, rhip[1]+44]);
    drawArm(lsho, [lsho[0]+18, lsho[1]-50], [cx-22, cy - Math.round(headRy * 0.40)]);
    drawArm(rsho, [rsho[0]-18, rsho[1]-50], [cx+22, cy - Math.round(headRy * 0.40)]);
  } else if (pose === 'expansion') {
    drawLeg(lhip, [lhip[0]-30, lhip[1]+24], [lhip[0]-20, lhip[1]+58]);
    drawLeg(rhip, [rhip[0]+30, rhip[1]+24], [rhip[0]+20, rhip[1]+58]);
    drawArm(lsho, [lsho[0]-32, lsho[1]-6],  [lsho[0]-78, lsho[1]-2]);
    drawArm(rsho, [rsho[0]+32, rsho[1]-6],  [rsho[0]+78, rsho[1]-2]);
  } else if (pose === 'sobresalto') {
    drawLeg(lhip, [lhip[0]-12, lhip[1]+26], [lhip[0]+2,  lhip[1]+62]);
    drawLeg(rhip, [rhip[0]+38, rhip[1]+12], [rhip[0]+56, rhip[1]-18]);
    drawArm(lsho, [lsho[0]-22, lsho[1]-58], [lsho[0]-38, lsho[1]-108]);
    drawArm(rsho, [rsho[0]+22, rsho[1]-58], [rsho[0]+38, rsho[1]-108]);
  }

  // Horripilation — spikes around the head
  if ((fx.spiky || 0) > 0.28)
    drawSpikes(cx, cy, headRx, headRy,
               Math.round(18 + 12 * fx.spiky), Math.round(10 + 14 * fx.spiky));

  // Horns (drawn before body so their bases are naturally covered)
  drawHorns(cx, cy, headRx, headRy, bc);

  // Single rounded-rectangle body (head + torso unified)
  const shapeTop = cy - headRy;
  const shapeBot = bodyCy + bodyRy;
  const shapeCY  = Math.round((shapeTop + shapeBot) / 2);
  const shapeHH  = Math.round((shapeBot - shapeTop) / 2);
  const cornerR  = Math.round(headRx * 0.82);
  drawRoundedBody(cx, shapeCY, headRx, shapeHH, cornerR, bc);

  // ── Face features (all relative to head geometry) ─────────────────────────
  const eyeY  = cy - Math.round(headRy * 0.08);
  const eyeX  = Math.round(headRx * 0.37);
  const eyeSz = Math.max(12, Math.round(21 * headRx / 67));

  // Blush
  if ((fx.blush || 0) > 0) drawBlush(cx, eyeY + eyeSz * 0.9, headRx, fx.blush);

  const scaledHOffset = Math.round((brp.h_offset ?? -38) * headRy / 100);
  // Clamp eye openness so eyes never overlap the nose
  const maxEyeRy = (cy + Math.round(headRy * 0.20)) - eyeY - 5;
  const eyeOpen  = Math.min(ep.openness ?? 1.0, maxEyeRy / eyeSz);

  for (const [isLeft, ex] of [[true, cx - eyeX], [false, cx + eyeX]]) {
    const pDy = (ep.pupil_y ?? 0) * eyeSz;
    drawEye(ex, eyeY, eyeSz, eyeOpen, ep.pupil_scale??1, ep.lid_drop??0, ep.crinkle??0, isLeft, 0, pDy, ep.eyes_closed??false);
    drawEyebrow(ex, eyeY, brp.angle??0, scaledHOffset, brp.thickness??6, isLeft);
  }

  const fh = e.forehead || {};
  if (fh.type) drawForehead(cx, eyeY + scaledHOffset, fh.type, fh.intensity ?? 0);

  const nostrilY = cy + Math.round(headRy * 0.20);
  const mY       = cy + Math.round(headRy * 0.62);
  const nf       = fx.nostril_flare || 0;

  // Nostril holes
  const nrx = 3.5 + (nf > 0 ? nf * 4 : nf * 1.5);
  const nry = 3.5 + (nf > 0 ? nf * 1 : nf * 2.0);
  fill(...BLACK); noStroke();
  for (const dx of [-7, 7]) ellipse(cx + dx, nostrilY, Math.max(2, nrx) * 2, Math.max(2, nry) * 2);

  // Nose decoration lines
  const nw = Math.round(13 + (nf > 0 ? nf * 5 : 0));  // half-span of nose area
  stroke(...TEAL_DEEP); strokeWeight(2); noFill();
  // Side curves — bottom half only (outer bulge hooking back inward/down)
  for (const s of [-1, 1]) {
    drawBezierCurve([
      [cx + s * (nw + 4), nostrilY - 1],
      [cx + s * (nw + 5), nostrilY + 2],
      [cx + s * (nw - 2), nostrilY + 4]
    ], 24);
  }

  const maxUpH = Math.max(6, Math.round(mY - nostrilY - 10));
  const mouthW = Math.round(headRx * 0.40);
  const openH  = Math.round((mp.open_amount ?? 0) * 42);
  // Guard teeth behind a minimum openH so they never flash during transitions
  const showTeeth  = (mp.show_teeth  ?? false) && openH >= 18;
  const lowerTeeth = (mp.lower_teeth ?? false) && openH >= 22;
  drawMouth(cx, mY, mp.curve ?? 0.2, mouthW, openH,
            showTeeth,
            mp.open_up    ?? false,
            mp.open_round ?? false,
            maxUpH,
            mp.bruxism    ?? 0,
            lowerTeeth);

  if ((mp.tongue_out ?? false) && openH > 12 && !(mp.open_round ?? false)) {
    drawTongue(cx, mY, mouthW, openH, mp.tongue_side ?? 0);
  }

  // Sweat
  if ((fx.sweat || 0) > 0.10) drawSweat(cx, cy, headRx);

  // Sleep ZZZs
  if ((fx.zzz || 0) > 0.1) drawZzzz(cx, cy, headRx, headRy, fx.zzz);

  // Hunger drool
  if ((fx.drool || 0) > 0.1) drawDrool(cx, mY, mouthW, mp.curve ?? 0.2, fx.drool);
}

// ── Internal state defaults (from human.py baselines) ────────────────────────
const DEFAULT_STATE = {
  dopamine:    50,
  oxytocin:    30,
  endorphins:  20,
  serotonin:   50,
  prolactin:   10,
  vasopressin: 20,
  arousal:     20,
  prefrontal:  50,
  sleepiness:  20,
  anxiety:     30,
  absorption:  30,
  hunger:      20,
  energy:      80,
  shutdown:     0,
};

// ── State presets (expressed in internal-logic terms) ────────────────────────
const STATE_PRESETS = {
  // ── Affect baselines ────────────────────────────────────────────────────────
  baseline: { ...DEFAULT_STATE },
  calm: {
    // low anxiety, good serotonin — the "everything is fine" resting state
    dopamine: 52, oxytocin: 42, endorphins: 26, serotonin: 62,
    prolactin: 10, vasopressin: 18, arousal: 14, prefrontal: 56,
    sleepiness: 18, anxiety: 10, absorption: 36, hunger: 20,
    energy: 84, shutdown: 0,
  },
  rested: {
    // post-sleep: energy+35, anxiety reset, reserves restored
    dopamine: 55, oxytocin: 32, endorphins: 22, serotonin: 56,
    prolactin: 10, vasopressin: 20, arousal: 22, prefrontal: 52,
    sleepiness: 10, anxiety: 20, absorption: 32, hunger: 42,
    energy: 95, shutdown: 0,
  },

  // ── Positive states ─────────────────────────────────────────────────────────
  happy: {
    dopamine: 80, oxytocin: 70, endorphins: 75, serotonin: 70,
    prolactin: 12, vasopressin: 22, arousal: 55, prefrontal: 65,
    sleepiness: 8, anxiety: 12, absorption: 50, hunger: 15,
    energy: 85, shutdown: 0,
  },
  bonding: {
    // after cuddling + massage path: oxytocin dominant, vasopressin low
    dopamine: 55, oxytocin: 78, endorphins: 42, serotonin: 74,
    prolactin: 12, vasopressin: 10, arousal: 22, prefrontal: 44,
    sleepiness: 28, anxiety: 6, absorption: 48, hunger: 18,
    energy: 70, shutdown: 0,
  },
  flow: {
    // hypofrontality: prefrontal < 40, absorption > 70 — trance / in-the-zone
    dopamine: 62, oxytocin: 36, endorphins: 32, serotonin: 56,
    prolactin: 8, vasopressin: 26, arousal: 58, prefrontal: 26,
    sleepiness: 10, anxiety: 16, absorption: 80, hunger: 14,
    energy: 74, shutdown: 0,
  },

  // ── Negative states ─────────────────────────────────────────────────────────
  sad: {
    dopamine: 22, oxytocin: 18, endorphins: 8, serotonin: 18,
    prolactin: 32, vasopressin: 12, arousal: 12, prefrontal: 32,
    sleepiness: 58, anxiety: 48, absorption: 62, hunger: 38,
    energy: 28, shutdown: 0,
  },
  depressed: {
    // low reserves, dopamine/serotonin depleted, high prolactin
    dopamine: 18, oxytocin: 14, endorphins: 7, serotonin: 14,
    prolactin: 30, vasopressin: 10, arousal: 8, prefrontal: 36,
    sleepiness: 68, anxiety: 54, absorption: 50, hunger: 48,
    energy: 20, shutdown: 6,
  },
  anxious: {
    dopamine: 42, oxytocin: 14, endorphins: 12, serotonin: 28,
    prolactin: 5, vasopressin: 52, arousal: 78, prefrontal: 32,
    sleepiness: 4, anxiety: 88, absorption: 42, hunger: 22,
    energy: 58, shutdown: 0,
  },
  performance_anxiety: {
    // high arousal + high prefrontal (DCM Sexual Inhibition System) → wanting but can't respond
    dopamine: 56, oxytocin: 20, endorphins: 18, serotonin: 36,
    prolactin: 15, vasopressin: 42, arousal: 68, prefrontal: 84,
    sleepiness: 8, anxiety: 58, absorption: 10, hunger: 22,
    energy: 62, shutdown: 0,
  },
  shutdown: {
    // dorsal collapse: anxiety > 80 AND energy < 25
    dopamine: 8, oxytocin: 8, endorphins: 4, serotonin: 12,
    prolactin: 22, vasopressin: 8, arousal: 4, prefrontal: 8,
    sleepiness: 92, anxiety: 8, absorption: 8, hunger: 62,
    energy: 4, shutdown: 92,
  },

  // ── Arousal / sexual states ─────────────────────────────────────────────────
  horny: {
    // vasopressin-dominant: intense stimulation path — high endorphins/oxytocin for positive valence
    dopamine: 88, oxytocin: 50, endorphins: 58, serotonin: 50,
    prolactin: 4, vasopressin: 74, arousal: 95, prefrontal: 28,
    sleepiness: 4, anxiety: 18, absorption: 85, hunger: 28,
    energy: 78, shutdown: 0,
  },
  edging: {
    // sustained high arousal without release, edging_buildup accumulates
    dopamine: 78, oxytocin: 28, endorphins: 48, serotonin: 46,
    prolactin: 4, vasopressin: 70, arousal: 90, prefrontal: 22,
    sleepiness: 4, anxiety: 24, absorption: 75, hunger: 20,
    energy: 64, shutdown: 0,
  },
  postorgasm: {
    // prolactin surge, dopamine floored, refractory sleepiness
    dopamine: 36, oxytocin: 88, endorphins: 92, serotonin: 78,
    prolactin: 82, vasopressin: 28, arousal: 14, prefrontal: 38,
    sleepiness: 62, anxiety: 4, absorption: 52, hunger: 32,
    energy: 38, shutdown: 0,
  },

  // ── Altered states ──────────────────────────────────────────────────────────
  caffeinated: {
    // caffeine: dopamine+8, arousal+10, sleepiness-25, energy+10, prefrontal+10, anxiety+10
    dopamine: 62, oxytocin: 28, endorphins: 20, serotonin: 50,
    prolactin: 8, vasopressin: 22, arousal: 34, prefrontal: 62,
    sleepiness: 2, anxiety: 44, absorption: 26, hunger: 18,
    energy: 90, shutdown: 0,
  },
  weed: {
    // cannabis: absorption+25, dopamine+15, anxiety-20, prefrontal-20, sleepiness+15, hunger+25
    dopamine: 66, oxytocin: 32, endorphins: 22, serotonin: 50,
    prolactin: 10, vasopressin: 18, arousal: 20, prefrontal: 28,
    sleepiness: 36, anxiety: 8, absorption: 58, hunger: 48,
    energy: 72, shutdown: 0,
  },
  rolling: {
    // MDMA: serotonin+40, oxytocin+35, dopamine+25, endorphins+20, anxiety-30, prefrontal-30
    dopamine: 92, oxytocin: 95, endorphins: 88, serotonin: 95,
    prolactin: 8, vasopressin: 32, arousal: 82, prefrontal: 18,
    sleepiness: 4, anxiety: 4, absorption: 92, hunger: 4,
    energy: 82, shutdown: 0,
  },
  angry: {
    // high anxiety/vasopressin (stress hormones), low oxytocin, open grimace with teeth
    dopamine: 60, oxytocin: 28, endorphins: 30, serotonin: 48,
    prolactin: 8, vasopressin: 60, arousal: 45, prefrontal: 42,
    sleepiness: 14, anxiety: 72, absorption: 48, hunger: 20,
    energy: 70, shutdown: 0,
  },
};

// ── Slider groups for the UI ──────────────────────────────────────────────────
const SLIDER_GROUPS = [
  { label: 'Neurotransmitters', keys: ['dopamine','oxytocin','endorphins','serotonin','prolactin','vasopressin'] },
  { label: 'Physiological',     keys: ['arousal','energy','sleepiness'] },
  { label: 'Mental',            keys: ['anxiety','absorption','prefrontal','hunger'] },
  { label: 'Special',           keys: ['shutdown'] },
];

// ── State → Visual params mapping (Darwin physiological model) ────────────────
function stateToParams(s) {
  const cl = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

  // Normalize all to 0–1
  const da = s.dopamine    / 100;
  const ox = s.oxytocin    / 100;
  const en = s.endorphins  / 100;
  const se = s.serotonin   / 100;
  const pr = s.prolactin   / 100;
  const va = s.vasopressin / 100;
  const ar = s.arousal     / 100;
  const pf = s.prefrontal  / 100;
  const sl = s.sleepiness  / 100;
  const an = s.anxiety     / 100;
  const ab = s.absorption  / 100;
  const hu = s.hunger      / 100;
  const eg = s.energy      / 100;
  const sh = s.shutdown    / 100;

  // Derived composites
  // liking: hedonic valence (pleasure + social warmth + contentment)
  const liking = cl(en * 0.40 + ox * 0.25 + se * 0.35);
  // tone: muscle activation (arousal/vasopressin/energy raise it; shutdown/sleep/prolactin lower it)
  const tone   = cl(ar * 0.35 + va * 0.25 + eg * 0.20 - sh * 0.90 - sl * 0.45 - pr * 0.25 + 0.25);
  // threat: appraisal of danger (anxiety + low energy + low prefrontal control)
  const threat = cl(an * 0.50 + (1 - eg) * 0.30 + (1 - pf) * 0.20);

  // Ahegao flag: computed early so lid_drop and pupil params can use it
  // Peak arousal + high hedonic valence + high absorption + low prefrontal inhibition
  const ahegao_flag = ar > 0.78 && liking > 0.72 && ab > 0.72 && pf < 0.32;

  // ── Pose (Darwin: Useful Habits — muscle tone drives posture) ─────────────
  let pose = 'neutral';
  if (sh > 0.55 || (sl > 0.70 && eg < 0.28)) {
    pose = 'postration';                          // collapse / exhaustion
  } else if (threat > 0.58 && tone < 0.40) {
    pose = 'contraction';                         // fearful curl
  } else if (threat > 0.58 && tone > 0.52) {
    pose = 'expansion';                           // aggressive expansion
  } else if (va > 0.58 && an < 0.42 && tone > 0.55) {
    pose = 'tension';                             // focused / determined
  } else if (ar > 0.72 && an < 0.35 && liking > 0.52) {
    pose = 'sobresalto';                          // excited / playful
  }

  // ── Body scale ────────────────────────────────────────────────────────────
  const height_scale = cl(0.88 + tone * 0.20, 0.82, 1.10);
  const width_scale  = (pose === 'postration')
    ? cl(1.02 + sl * 0.06, 0.90, 1.10)
    : cl(0.93 + liking * 0.10 - an * 0.04, 0.86, 1.06);

  // ── Eyes (apertura de orificios) ──────────────────────────────────────────
  // Wide open: arousal, anxiety (threat scanning)
  // Drooping: sleepiness, prolactin (post-satiation), low arousal
  const openness    = cl(0.55 + ar * 0.75 - sl * 0.60 + an * 0.40 - pr * 0.30);
  const lid_drop    = cl(sl * 0.80 + pr * 0.45 - ar * 0.25);
  const pupil_scale = cl(0.60 + ar * 0.55 + an * 0.35 - pr * 0.30 - sl * 0.20 + da * 0.22);

  // ── Eyebrows (muscle indicators) ─────────────────────────────────────────
  // Darwin obliquity (angle > 0): inner corners UP = sadness / fearful suffering
  // Frown (angle < 0): inner corners DOWN = aggression / anger / determination
  let browAngle = 0;
  if (threat > 0.45) {
    const aggression = va - an * 0.3;
    if (aggression > 0.35 && liking < 0.50) {
      // Anger / aggression: brows press down
      browAngle = cl(-aggression * 1.0, -0.90, 0);
    } else {
      // Fear / sadness: Darwin obliquity
      browAngle = cl(threat * 0.80 - liking * 0.50, 0, 0.85);
    }
  } else if (liking < 0.30 && tone < 0.38) {
    // Low affect, low tone: mild sad obliquity
    browAngle = cl((0.30 - liking) * 1.2, 0, 0.65);
  }
  const h_offset = Math.round(cl(-56 + ar * 24 + (1 - eg) * 10, -60, -22));

  // ── Mouth (dirección de comisuras) ───────────────────────────────────────
  // Curve: positive = smile (liking), negative = frown (low liking / sadness)
  // Zero-crossing at 0.35 so baseline liking (~0.33) ≈ straight mouth, not sad
  const curve       = cl((liking - 0.35) * 1.60, -0.85, 0.85);
  // ar*liking interaction: joy only opens mouth when both affect AND activation are present
  // (calm-content stays closed; excited-happy opens wide like horny/edging)
  const open_amount = cl(ar * 0.30 + an * 0.35 + threat * 0.15
                       + liking * 0.15 + ar * liking * 0.80
                       - pr * 0.55 - sl * 0.40);
  // Fearful inverted triangle: contraction pose + anxiety + open
  const open_up     = (pose === 'contraction') && an > 0.60 && open_amount > 0.22;
  const show_teeth  = (liking > 0.58 && open_amount > 0.35) ||
                      (an > 0.55 && va > 0.58 && open_amount > 0.30) ||
                      (open_up && open_amount > 0.28) ||
                      (an > 0.55 && open_amount > 0.40 && liking < 0.30); // anxious grimace
  // O-surprised: high arousal, low threat, wide open, AND not in a joyful/positive state
  const open_round  = ar > 0.68 && threat < 0.38 && open_amount > 0.48 && liking < 0.45;

  // ── FX (Darwin: direct nervous system action = intensity overlays) ────────
  const blush  = cl(liking * 0.90 + ox * 0.25 - an * 0.15 - 0.28);
  // spiky: horripilation — piel de gallina (anxiety + low prefrontal control)
  const spiky  = cl(an * 0.60 + (1 - pf) * 0.15 + threat * 0.20 - liking * 0.30);
  // sweat: anxiety + high arousal
  const sweat  = cl(an * 0.50 + ar * 0.25 - eg * 0.20);
  // pallor: shutdown + very low energy + extreme fear
  const pallor = cl(sh * 0.65 + (1 - eg) * 0.20 + an * 0.35 - liking * 0.45);
  // nostril_flare: +1 = dilated (anger/effort), -1 = wrinkling (disgust)
  // Anger/vasopressin/threat → dilate; low liking + aversion → wrinkle
  const disgust_signal = cl((1 - liking) * 0.55 + (1 - pf) * 0.20 - ar * 0.35);
  const nostril_flare  = cl(va * 0.65 + threat * 0.30 - liking * 0.25, 0, 1)
                        - disgust_signal * 0.70;
  // zzz: floating sleep symbols — high sleepiness, low energy and arousal
  const zzz   = cl(sl * 0.90 - eg * 0.40 - ar * 0.50);
  // drool: hunger drool from mouth corner — high hunger, low prefrontal inhibition
  const drool = cl(hu * 0.80 - pf * 0.35 - liking * 0.25);

  // ── Duchenne additions ────────────────────────────────────────────────────
  // Crow's feet: genuine smile = hedonic liking + visible smile signal
  const smile_signal = cl(curve * 0.50 + open_amount * 0.80);
  const eye_crinkle  = cl(liking * 1.60 - 0.65) * cl(smile_signal * 2.50 - 0.15, 0, 1);

  // Forehead wrinkle type (Duchenne muscular anatomy):
  //   suffering → corrugator obliquity (center-only transverse folds)
  //   attention → frontalis raised (full-width arching lines, O-mouth surprise)
  //   focus     → procerus descent (vertical glabellar lines, anger/effort)
  let foreheadType      = null;
  let foreheadIntensity = 0;
  if (browAngle > 0.35) {
    foreheadType      = 'suffering';
    foreheadIntensity = cl((browAngle - 0.35) * 3.5);
  } else if (open_round) {
    foreheadType      = 'attention';
    foreheadIntensity = cl(ar * 1.4 - 0.55);
  } else if (browAngle < -0.35) {
    foreheadType      = 'focus';
    foreheadIntensity = cl((-browAngle - 0.35) * 5.0);
  }

  // Brow thickness: thin when relaxed, thick under muscular contraction
  const brow_thickness = cl(4.0 + Math.abs(browAngle) * 6.0 + threat * 2.0, 4.0, 9.0);

  // ── Gaze types ────────────────────────────────────────────────────────────
  // Ahegao eye roll: pupil drifts upward (negative Y = up in screen coords)
  const pupil_y = ahegao_flag ? cl(-(ar - 0.75) * 4.5, -1, 0) : 0;
  // Eyes fully closed: extreme sleepiness or shutdown collapse
  const eyes_closed = sl > 0.85 || sh > 0.70;

  // ── Tongue ────────────────────────────────────────────────────────────────
  // Out when: ahegao peak state OR max arousal + joy + open mouth
  const tongue_out  = (ahegao_flag && open_amount > 0.40) ||
                      (ar > 0.85 && liking > 0.72 && open_amount > 0.45 && !open_round);
  // Side offset: ahegao gets a fixed lateral loll; otherwise centered
  const tongue_side = ahegao_flag ? 0.80 : 0;

  // Bruxism: jaw clenching / teeth grinding — high tension + suppressed open mouth
  // Only visible in the closed-mouth rendering path (open_amount stays low)
  // Represents controlled/suppressed anger or stress where the jaw tightens but mouth doesn't open
  // Bruxism requires elevated vasopressin (jaw-tension stress hormone), not just anxiety.
  // Sad/depressed states have va≈0.10–0.12, so the va-gate zeroes them out.
  const bruxism = cl(va * 0.55 + an * 0.45 - liking * 0.60 - ar * 0.30)
                * cl((va - 0.30) * 3, 0, 1);

  // Lower teeth visible in full open-mouth snarl/peak states
  // Angry growl (high vasopressin + high threat + open) or peak ecstasy (rolling)
  const lower_teeth = show_teeth && (
    (va > 0.55 && threat > 0.55 && open_amount > 0.45) ||   // aggressive snarl
    (liking > 0.82 && ar > 0.78 && open_amount > 0.55)      // peak ecstasy / rolling
  );

  return {
    body:  { pose, height_scale, width_scale },
    eyes:  {
      openness:    cl(openness, 0.30, 2.00),
      pupil_scale: cl(pupil_scale, 0.50, 1.80),
      lid_drop:    cl(lid_drop, 0.00, 0.75),
      crinkle:     cl(eye_crinkle, 0, 1),
      pupil_y:     cl(pupil_y, -1, 0),
      eyes_closed,
    },
    brows: { angle: browAngle, h_offset, thickness: brow_thickness },
    mouth: {
      curve:       cl(curve, -0.85, 0.85),
      open_amount: cl(open_amount, 0.00, 1.00),
      show_teeth,
      open_up,
      open_round,
      bruxism:     cl(bruxism, 0, 1),
      lower_teeth,
      tongue_out,
      tongue_side: cl(tongue_side, 0, 1),
    },
    fx: {
      blush:         cl(blush,  0, 1),
      spiky:         cl(spiky,  0, 1),
      sweat:         cl(sweat,  0, 1),
      pallor:        cl(pallor, 0, 1),
      nostril_flare: Math.max(-1, Math.min(1, nostril_flare)),
      zzz:           cl(zzz,   0, 1),
      drool:         cl(drool, 0, 1),
    },
    forehead: { type: foreheadType, intensity: foreheadIntensity },
  };
}

// ── Parameter interpolation ───────────────────────────────────────────────────
function deepCopy(obj) { return JSON.parse(JSON.stringify(obj)); }

function lerpParams(a, b, t) {
  const out = {};
  for (const section of ['body','eyes','brows','mouth','fx','forehead']) {
    out[section] = {};
    const asec = (a && a[section]) || {};
    for (const key of Object.keys(b[section])) {
      const av = asec[key], bv = b[section][key];
      out[section][key] = typeof bv === 'number' ? lv(av ?? bv, bv, t)
                                                  : (t < 0.5 ? av : bv);
    }
  }
  return out;
}

// ── p5 sketch ─────────────────────────────────────────────────────────────────
function setup() {
  pixelDensity(2);
  const canvas = createCanvas(SIZE, SIZE);
  canvas.parent('avatar-canvas-wrap');

  monsterState  = deepCopy(DEFAULT_STATE);
  targetParams  = stateToParams(monsterState);
  currentParams = deepCopy(targetParams);
  fromParams    = deepCopy(targetParams);

  noLoop();
  redraw();
}

function draw() {
  clear();
  if (animT < 1.0) {
    animT = Math.min(1.0, animT + 1/ANIM_FRAMES);
    currentParams = lerpParams(fromParams, targetParams, easeInOut(animT));
    if (animT >= 1.0) noLoop();
  }
  renderMonster(currentParams);
}

// Animate to new params
function animateTo(newParams) {
  fromParams   = deepCopy(currentParams);
  targetParams = newParams;
  animT = 0;
  loop();
}

// ── App state → monster state mapping ────────────────────────────────────────
// The API already returns full neurotransmitter fields — pass them through directly.
window.updateMonsterFromApp = function(appState) {
  const keys = ['dopamine','oxytocin','endorphins','serotonin','prolactin',
                'vasopressin','arousal','prefrontal','sleepiness','anxiety',
                'absorption','hunger','energy','shutdown'];
  for (const k of keys) {
    if (appState[k] !== undefined) monsterState[k] = appState[k];
  }
  animateTo(stateToParams(monsterState));
};
