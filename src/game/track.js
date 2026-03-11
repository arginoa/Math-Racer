export function randInt(a, b) {
  return Math.floor(a + Math.random() * (b - a + 1));
}

function normalize(x, y) {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpPt(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

// Centripetal Catmull-Rom (alpha=0.5) prevents overshoot loops.
function catmullCentripetal(p0, p1, p2, p3, u, alpha = 0.5) {
  const d01 = Math.max(1e-6, Math.pow(dist(p0, p1), alpha));
  const d12 = Math.max(1e-6, Math.pow(dist(p1, p2), alpha));
  const d23 = Math.max(1e-6, Math.pow(dist(p2, p3), alpha));

  const t0 = 0;
  const t1 = t0 + d01;
  const t2 = t1 + d12;
  const t3 = t2 + d23;

  const t = lerp(t1, t2, u);

  const A1 = lerpPt(p0, p1, (t - t0) / (t1 - t0));
  const A2 = lerpPt(p1, p2, (t - t1) / (t2 - t1));
  const A3 = lerpPt(p2, p3, (t - t2) / (t3 - t2));

  const B1 = lerpPt(A1, A2, (t - t0) / (t2 - t0));
  const B2 = lerpPt(A2, A3, (t - t1) / (t3 - t1));

  const C = lerpPt(B1, B2, (t - t1) / (t2 - t1));
  return C;
}

function bboxOf(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function buildTrack(viewW, viewH) {
  // Build in normalized space, then we "fit" into the canvas with margins.
  const Pn = (u, v) => ({ x: u, y: v });

  const ptsN = [
    Pn(0.10, 0.18),
    Pn(0.92, 0.18),

    Pn(0.92, 0.32),
    Pn(0.18, 0.32),

    Pn(0.18, 0.50),
    Pn(0.84, 0.50),

    Pn(0.84, 0.68),
    Pn(0.16, 0.68),

    Pn(0.16, 0.80),
    Pn(0.92, 0.80),

    Pn(0.92, 0.88),
    Pn(0.06, 0.88),
    Pn(0.06, 0.18),
  ];

  // First pass: sample in a temporary unit square
  const samplesUnit = [];
  const stepsPerSeg = 60;
  const n = ptsN.length;

  for (let i = 0; i < n; i++) {
    const p0 = ptsN[(i - 1 + n) % n];
    const p1 = ptsN[i];
    const p2 = ptsN[(i + 1) % n];
    const p3 = ptsN[(i + 2) % n];

    for (let s = 0; s < stepsPerSeg; s++) {
      const u = s / stepsPerSeg;
      samplesUnit.push(catmullCentripetal(p0, p1, p2, p3, u, 0.5));
    }
  }

  // Fit into view with real pixel margins so it always has breathing room
  const margin = Math.min(viewW, viewH) * 0.09; // tweak 0.09..0.12 for more gap
  const targetW = Math.max(1, viewW - margin * 2);
  const targetH = Math.max(1, viewH - margin * 2);

  const bb = bboxOf(samplesUnit);
  const scale = Math.min(targetW / bb.w, targetH / bb.h) * 0.98;

  const cx = (bb.minX + bb.maxX) * 0.5;
  const cy = (bb.minY + bb.maxY) * 0.5;

  const samples = samplesUnit.map((p) => ({
    x: (p.x - cx) * scale + viewW * 0.5,
    y: (p.y - cy) * scale + viewH * 0.5,
  }));

  // Build arc-length parameterization + tangents/normals on fitted samples
  const out = [];
  let total = 0;

  for (let i = 0; i < samples.length; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % samples.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const seg = Math.hypot(dx, dy);

    const t = normalize(dx, dy);
    const nrm = { x: -t.y, y: t.x };

    out.push({
      x: a.x,
      y: a.y,
      tanX: t.x,
      tanY: t.y,
      norX: nrm.x,
      norY: nrm.y,
      s: total,
    });

    total += seg;
  }

  const length = total;

  function sampleAt(distAlong) {
    let d = distAlong % length;
    if (d < 0) d += length;

    let lo = 0;
    let hi = out.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (out[mid].s < d) lo = mid + 1;
      else hi = mid;
    }

    const i = Math.max(0, lo - 1);
    const a = out[i];
    const b = out[(i + 1) % out.length];

    const span = (b.s >= a.s ? b.s - a.s : (length - a.s) + b.s) || 1;
    const t = (d - a.s) / span;

    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;

    const tanX = a.tanX + (b.tanX - a.tanX) * t;
    const tanY = a.tanY + (b.tanY - a.tanY) * t;
    const nt = normalize(tanX, tanY);

    return { x, y, tanX: nt.x, tanY: nt.y, norX: -nt.y, norY: nt.x };
  }

  // Recommended road half-width that scales with the fitted geometry
  const recommendedHalfW = clamp(Math.min(viewW, viewH) * 0.055, 34, 56) * 0.95;

  return { points: out, length, sampleAt, recommendedHalfW };
}