function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawTrack(ctx, track, trackHalfW) {
  // Build left and right edges
  const pts = track.points;
  const left = [];
  const right = [];
  for (const p of pts) {
    left.push({ x: p.x + p.norX * trackHalfW, y: p.y + p.norY * trackHalfW });
    right.push({ x: p.x - p.norX * trackHalfW, y: p.y - p.norY * trackHalfW });
  }

  // Asphalt
  ctx.save();
  ctx.fillStyle = "#12131a";
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Edge lines
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(right[0].x, right[0].y);
  for (let i = 1; i < right.length; i++) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Center dashed line
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 18]);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Start line (near points[0])
  const p0 = pts[0];
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(p0.x + p0.norX * trackHalfW, p0.y + p0.norY * trackHalfW);
  ctx.lineTo(p0.x - p0.norX * trackHalfW, p0.y - p0.norY * trackHalfW);
  ctx.stroke();
  ctx.restore();
}

function drawCar(ctx, car) {
  const { x, y, angle, color } = car;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Body
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 2;

  roundedRect(ctx, -14, -8, 28, 16, 5);
  ctx.fill();
  ctx.stroke();

  // Cockpit stripe
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  roundedRect(ctx, -6, -6, 12, 12, 4);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.restore();
}

export function render(ctx, view, state) {
  const { track, cars, trackHalfW } = state;

  // Background
  ctx.clearRect(0, 0, view.w, view.h);
  ctx.fillStyle = "#0b0b0f";
  ctx.fillRect(0, 0, view.w, view.h);

  // Subtle grid
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  const step = 64;
  for (let x = 0; x <= view.w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, view.h);
    ctx.stroke();
  }
  for (let y = 0; y <= view.h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(view.w, y);
    ctx.stroke();
  }
  ctx.restore();

  drawTrack(ctx, track, trackHalfW);

  // Sort by distance so leading cars draw on top nicely
  const drawCars = cars.slice().sort((a, b) => a.totalDist - b.totalDist);
  for (const c of drawCars) drawCar(ctx, c);
}