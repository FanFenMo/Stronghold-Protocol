// Grounded alchemy areas: a translucent wash, a constant-width contour and a few quiet moving arcs.
// Geometry is in screen pixels so expanding an area never thickens its boundary.

import { clamp, easeOut } from './limits.js';

const FILL_TINT = 0x81978b, EDGE_TINT = 0xc7cdbb;
const FILL_ALPHA = 0.04, EDGE_ALPHA = 0.36;
const ENTER_T = 0.16, EXIT_T = 0.25, DETAIL_HZ = 20;
const TAU = Math.PI * 2;

export function refreshAlchemyZone(fx, zn, visual, dur) {
  zn.remaining = dur * fx._ts();
  zn.motionAge = 0;
  zn.vx = visual.motion?.vx ?? 0;
  zn.vy = visual.motion?.vy ?? 0;
  zn.grow = visual.motion?.grow ?? 0;
  zn.anchorId = visual.anchor ?? null;
}

export function createAlchemyZone(fx, x, y, z, r, dur, key, visual) {
  const P = fx.P;
  const disc = new P.Sprite(fx.tex.soft);
  disc.anchor.set(0.5);
  disc.tint = FILL_TINT;
  const edge = new P.Graphics(), detail = new P.Graphics();
  edge.tint = detail.tint = EDGE_TINT;
  for (const sp of [disc, edge, detail]) {
    sp.blendMode = P.BLEND_MODES.NORMAL;
    sp.alpha = 0;
    fx._onGround(sp, y, z);
  }
  const zn = {
    disc, edge, detail, look: 'alchemy', x, y, z, r, t: 0, dur, key,
    drawX: x, drawY: y, drawR: r, drawZ: z, opacity: 0,
    edgeRx: -1, edgeRy: -1, lineWidth: 0,
    detailAge: 1, detailRx: 1, detailRy: 1,
    phase: (x * 0.73 + y * 1.37 + fx.zones.length * 1.61) % TAU,
  };
  refreshAlchemyZone(fx, zn, visual, dur);
  return zn;
}

/** Advance the presentation from the last authoritative event using game seconds, including speed changes. */
export function advanceAlchemyZone(fx, zn, dt) {
  const rate = fx._ts();
  zn.motionAge += dt * rate;
  let x = zn.x + zn.vx * zn.motionAge, y = zn.y + zn.vy * zn.motionAge;
  const anchor = fx._viewOf(zn.anchorId);
  if (zn.anchorId != null) {
    x = anchor && anchor.alive !== false ? anchor.x : zn.drawX;
    y = anchor && anchor.alive !== false ? anchor.y : zn.drawY;
  }
  const rect = fx.ctx.fieldRect?.();
  if (rect) { x = clamp(x, rect.c0, rect.c1); y = clamp(y, rect.r0, rect.r1); }
  const follow = 1 - Math.exp(-dt / 0.07);
  zn.drawX += (x - zn.drawX) * follow;
  zn.drawY += (y - zn.drawY) * follow;
  zn.drawR += (zn.r + zn.grow * zn.motionAge - zn.drawR) * follow;
  zn.drawZ = fx._groundZ(zn.drawX, zn.drawY);
  zn.opacity = easeOut(clamp(zn.t / ENTER_T, 0, 1)) * easeOut(clamp(zn.remaining / rate / EXIT_T, 0, 1));
  zn.detailAge += dt;
}

/** Rebuild only when projected radii change; the narrow feather stays inside the actual range. */
function contour(zn, rx, ry, width) {
  const g = zn.edge;
  g.clear();
  g.lineStyle(width * 3, 0xffffff, 0.07);
  g.drawEllipse(0, 0, Math.max(0.5, rx - width * 1.8), Math.max(0.5, ry - width * 1.8));
  g.lineStyle(width, 0xffffff, EDGE_ALPHA);
  g.drawEllipse(0, 0, Math.max(0.5, rx - width * 0.5), Math.max(0.5, ry - width * 0.5));
  zn.edgeRx = rx; zn.edgeRy = ry; zn.lineWidth = width;
}

function detailArcs(zn, rx, ry, width) {
  const g = zn.detail;
  g.clear();
  g.lineStyle(width * 0.7, 0xffffff, 0.17);
  const inset = width * 3.5;
  const ax = Math.max(0.5, rx - inset), ay = Math.max(0.5, ry - inset);
  for (let arc = 0; arc < 3; arc++) {
    const start = zn.phase + arc * 2.1 + zn.t * (arc === 1 ? -0.065 : 0.085);
    const span = 0.38 + arc * 0.19;
    for (let i = 0; i <= 12; i++) {
      const a = start + span * i / 12, x = Math.cos(a) * ax, y = Math.sin(a) * ay;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
  }
  if (zn.t < ENTER_T) {
    const k = easeOut(zn.t / ENTER_T), radius = 0.65 + k * 0.35;
    g.lineStyle(width * 0.75, 0xffffff, 0.14 * (1 - k));
    g.drawEllipse(0, 0, rx * radius, ry * radius);
  }
  zn.detailAge = 0; zn.detailRx = rx; zn.detailRy = ry;
}

export function drawAlchemyZone(fx, zn) {
  const cam = fx.ctx.cam(), p = fx._p, q = fx._q;
  cam.project(zn.drawX, zn.drawY, zn.drawZ + 0.02, p);
  cam.project(zn.drawX, zn.drawY + zn.drawR, zn.drawZ + 0.02, q);
  const rx = p.s * zn.drawR, ry = Math.max(1, p.y - q.y);
  const width = clamp(p.s * 0.014, 1, 1.5);
  let fillWeight = zn.opacity, edgeWeight = zn.opacity;
  for (const other of fx.zones) {
    if (other === zn || other.look !== 'alchemy') continue;
    const dist = Math.hypot(zn.drawX - other.drawX, zn.drawY - other.drawY);
    if (dist < zn.drawR + other.drawR) fillWeight += other.opacity;
    // Share coincident contours; separate boundaries remain readable where their filled areas intersect.
    if (dist + Math.abs(zn.drawR - other.drawR) < 3 / p.s) edgeWeight += other.opacity;
  }
  const edgeOpacity = zn.opacity / Math.max(1, edgeWeight);
  zn.disc.position.set(p.x, p.y);
  zn.disc.scale.set(rx * 2 / 128, ry * 2 / 128);
  zn.disc.alpha = FILL_ALPHA * zn.opacity / Math.max(1, fillWeight);
  if (Math.abs(rx - zn.edgeRx) > 0.1 || Math.abs(ry - zn.edgeRy) > 0.1 || width !== zn.lineWidth) contour(zn, rx, ry, width);
  zn.edge.position.set(p.x, p.y);
  zn.edge.alpha = edgeOpacity;
  zn.detail.visible = fx.rich;
  if (fx.rich) {
    if (zn.detailAge >= 1 / DETAIL_HZ) detailArcs(zn, rx, ry, width);
    zn.detail.position.set(p.x, p.y);
    zn.detail.scale.set(rx / zn.detailRx, ry / zn.detailRy);
    zn.detail.alpha = edgeOpacity;
  }
  fx._onGround(zn.disc, zn.drawY, zn.drawZ);
  fx._onGround(zn.edge, zn.drawY, zn.drawZ);
  fx._onGround(zn.detail, zn.drawY, zn.drawZ);
}
