import { TILE, tileAt, type MapId } from './data';
import type { GameState } from './state';

export let VW = 320;
export let VH = 240;

/**
 * Adaptive viewport: base 320x240 at 4:3, expanded along the long axis so
 * widescreen/portrait windows fill instead of letterboxing. Snapped to 8px
 * so tile and window layout stays clean. Importers see live bindings.
 */
export function computeView(winW: number, winH: number): void {
  const aspect = winW / Math.max(1, winH);
  if (aspect >= 4 / 3) {
    VH = 240;
    VW = Math.max(320, Math.min(560, Math.round((240 * aspect) / 8) * 8));
  } else {
    VW = 320;
    VH = Math.max(240, Math.min(480, Math.round(320 / aspect / 8) * 8));
  }
}

// ---------------------------------------------------------------- helpers
function R(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string): void {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v: number) => Math.max(0, Math.min(255, v + amt));
  const r = cl((n >> 16) & 255), g = cl((n >> 8) & 255), b = cl(n & 255);
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------- FF6 window
export function drawWindow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x + 2, y + 3, w, h);
  // gradient body (FF6 deep blue)
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(43,43,190,0.96)');
  g.addColorStop(0.5, 'rgba(24,24,130,0.96)');
  g.addColorStop(1, 'rgba(10,10,70,0.96)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // subtle inner sheen
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(x + 2, y + 2, w - 4, 2);
  // outer white border
  ctx.strokeStyle = '#f4f4f8';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  // inner dark trim
  ctx.strokeStyle = '#23235e';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
  // corner accents (FF6 rounded look)
  ctx.fillStyle = '#f4f4f8';
  R(ctx, x, y, 3, 1, '#f4f4f8'); R(ctx, x, y, 1, 3, '#f4f4f8');
  R(ctx, x + w - 3, y, 3, 1, '#f4f4f8'); R(ctx, x + w - 1, y, 1, 3, '#f4f4f8');
  R(ctx, x, y + h - 1, 3, 1, '#f4f4f8'); R(ctx, x, y + h - 3, 1, 3, '#f4f4f8');
  R(ctx, x + w - 3, y + h - 1, 3, 1, '#f4f4f8'); R(ctx, x + w - 1, y + h - 3, 1, 3, '#f4f4f8');
}

// ---------------------------------------------------------------- tiles
function drawGrassBase(ctx: CanvasRenderingContext2D, dx: number, dy: number, tx: number, ty: number, dungeon: boolean): void {
  const alt = (tx + ty) % 2 === 0;
  if (dungeon) {
    R(ctx, dx, dy, TILE, TILE, alt ? '#2b2b38' : '#272732');
  } else {
    // FF6 saturated meadow green with checker dither
    R(ctx, dx, dy, TILE, TILE, alt ? '#5cab45' : '#55a03e');
    // darker dither patch (2x2 SNES-style)
    R(ctx, dx + 8, dy + 8, 8, 8, alt ? '#55a03e' : '#4f9839');
    R(ctx, dx, dy, 8, 8, alt ? '#5cab45' : '#55a03e');
  }
  const h = hash2(tx, ty);
  if (dungeon) {
    // stone speckle + cracks
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(dx + (h % 12), dy + ((h >> 4) % 12), 2, 1);
    ctx.fillRect(dx + ((h >> 8) % 12), dy + ((h >> 12) % 12), 1, 2);
    if (h % 11 === 0) { R(ctx, dx + 3, dy + 7, 10, 1, '#1c1c26'); R(ctx, dx + 7, dy + 4, 1, 6, '#1c1c26'); }
  } else {
    // grass blades / speckles
    R(ctx, dx + (h % 13), dy + ((h >> 3) % 13), 2, 1, 'rgba(0,60,0,0.25)');
    R(ctx, dx + ((h >> 5) % 13), dy + ((h >> 7) % 13), 1, 2, '#6cc24f');
    R(ctx, dx + ((h >> 9) % 14), dy + ((h >> 11) % 14), 1, 1, '#8ce07a');
    // occasional FF6 flower / pebble
    if (h % 41 === 0) { R(ctx, dx + 6, dy + 6, 2, 2, '#ffffff'); R(ctx, dx + 6, dy + 6, 1, 1, '#ffd76a'); R(ctx, dx + 5, dy + 9, 1, 3, '#2c6b26'); }
    else if (h % 37 === 0) { R(ctx, dx + 9, dy + 8, 2, 2, '#ff8fb3'); R(ctx, dx + 9, dy + 8, 1, 1, '#fff'); R(ctx, dx + 9, dy + 10, 1, 2, '#2c6b26'); }
    else if (h % 29 === 0) { R(ctx, dx + 4, dy + 10, 3, 2, '#8a8a9a'); R(ctx, dx + 4, dy + 10, 3, 1, '#b8b8c8'); }
  }
}

function drawPath(ctx: CanvasRenderingContext2D, dx: number, dy: number, tx: number, ty: number, mapId: MapId): void {
  const h = hash2(tx * 3 + 1, ty * 5 + 2);
  if (mapId === 'dungeon') {
    // worn dark flagstones
    const alt = (tx + ty) % 2 === 0;
    R(ctx, dx, dy, TILE, TILE, alt ? '#3a3a48' : '#353542');
    R(ctx, dx, dy, TILE, 1, '#4e4e60');
    R(ctx, dx, dy + 15, TILE, 1, '#22222c');
    R(ctx, dx + 7, dy, 1, TILE, 'rgba(0,0,0,0.3)');
    R(ctx, dx, dy + 7, TILE, 1, 'rgba(0,0,0,0.3)');
    R(ctx, dx + ((h >> 2) % 10), dy + ((h >> 4) % 10), 2, 1, '#4e4e60');
    if (h % 13 === 0) R(ctx, dx + 4, dy + 4, 2, 1, '#5b5b6e');
    return;
  }
  // warm dirt / cobble path
  const alt = (tx + ty) % 2 === 0;
  R(ctx, dx, dy, TILE, TILE, alt ? '#cfa96b' : '#c7a05f');
  R(ctx, dx, dy, TILE, 1, '#e2c086');
  R(ctx, dx, dy + 15, TILE, 1, '#8a6a3c');
  // cobbles
  const stones: Array<[number, number]> = [
    [(h % 9), ((h >> 3) % 9)],
    [((h >> 5) % 9) + 4, ((h >> 7) % 9) + 4],
  ];
  for (const [sx, sy] of stones) {
    R(ctx, dx + sx, dy + sy, 4, 3, '#b8945a');
    R(ctx, dx + sx, dy + sy, 4, 1, '#e8cf9a');
    R(ctx, dx + sx, dy + sy + 2, 4, 1, '#8a6a3a');
  }
  R(ctx, dx + ((h >> 9) % 14), dy + ((h >> 11) % 14), 1, 1, '#8a6a3a');
  R(ctx, dx + ((h >> 6) % 14), dy + ((h >> 8) % 14), 1, 1, '#e8cf9a');
}

function drawTallGrass(ctx: CanvasRenderingContext2D, dx: number, dy: number, tx: number, ty: number, time: number): void {
  R(ctx, dx, dy, TILE, TILE, '#2c5f24');
  R(ctx, dx, dy + 12, TILE, 4, '#234d1d');
  const sway = Math.round(Math.sin(time / 280 + (tx * 0.7 + ty * 1.1)) * 1);
  for (let i = 0; i < 6; i++) {
    const h = hash2(tx * 7 + i, ty * 3 + i * 2);
    const bx = dx + 1 + i * 2 + (i % 2 === 0 ? sway : 0);
    const bh = 7 + (h % 5);
    // stem dark -> mid -> light tip (FF6 3-tone blades)
    R(ctx, bx, dy + 15 - bh, 2, bh, '#245423');
    R(ctx, bx, dy + 15 - bh, 1, bh - 1, '#46a03a');
    R(ctx, bx, dy + 15 - bh, 2, 2, '#8be06b');
    if (h % 5 === 0) R(ctx, bx, dy + 15 - bh - 1, 1, 1, '#d6ffb8');
  }
  // tiny white seed heads
  const h2 = hash2(tx, ty * 13);
  if (h2 % 7 === 0) R(ctx, dx + (h2 % 12), dy + 3, 1, 1, '#e8ffd8');
}

function drawTree(ctx: CanvasRenderingContext2D, dx: number, dy: number, tx: number, ty: number): void {
  drawGrassBase(ctx, dx, dy, tx, ty, false);
  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(dx + 2, dy + 12, 12, 3);
  // trunk
  R(ctx, dx + 6, dy + 9, 4, 5, '#6b4423');
  R(ctx, dx + 6, dy + 9, 1, 5, '#8a5f36');
  R(ctx, dx + 9, dy + 9, 1, 5, '#40240f');
  // canopy: layered FF6 blobs with dark outline
  const OL = '#1c3d1a', MID = '#2e7d2b', LIT = '#57b84a', HI = '#8ce07a';
  // bottom row (widest)
  R(ctx, dx + 1, dy + 5, 14, 5, OL);
  R(ctx, dx + 2, dy + 5, 12, 4, MID);
  R(ctx, dx + 2, dy + 5, 12, 1, LIT);
  // mid
  R(ctx, dx + 2, dy + 2, 12, 4, OL);
  R(ctx, dx + 3, dy + 2, 10, 3, MID);
  R(ctx, dx + 3, dy + 2, 5, 1, LIT);
  // top
  R(ctx, dx + 4, dy, 8, 3, OL);
  R(ctx, dx + 5, dy, 6, 2, MID);
  R(ctx, dx + 5, dy, 3, 1, HI);
  // dither highlights
  const h = hash2(tx * 11, ty * 7);
  R(ctx, dx + 4 + (h % 5), dy + 6, 2, 1, HI);
  R(ctx, dx + 8 + ((h >> 3) % 4), dy + 3, 2, 1, HI);
  R(ctx, dx + 5, dy + 8, 1, 1, '#123012');
  R(ctx, dx + 10, dy + 7, 1, 2, '#123012');
}

function drawWall(ctx: CanvasRenderingContext2D, dx: number, dy: number, tx: number, ty: number, mapId: MapId): void {
  const h = hash2(tx * 5, ty * 9);
  if (mapId === 'dungeon') {
    R(ctx, dx, dy, TILE, TILE, '#33333f');
    // brick courses
    R(ctx, dx, dy + 5, TILE, 1, '#1e1e28');
    R(ctx, dx, dy + 11, TILE, 1, '#1e1e28');
    R(ctx, dx + 7, dy, 1, 6, '#1e1e28');
    R(ctx, dx + 3, dy + 6, 1, 5, '#1e1e28');
    R(ctx, dx + 11, dy + 6, 1, 5, '#1e1e28');
    R(ctx, dx + 7, dy + 12, 1, 4, '#1e1e28');
    R(ctx, dx, dy, TILE, 1, '#55556a');
    R(ctx, dx, dy + 15, TILE, 1, '#17171f');
    R(ctx, dx + 2 + (h % 8), dy + 2 + ((h >> 4) % 8), 2, 1, '#4a4a5e');
    if (h % 17 === 0) R(ctx, dx + 5, dy + 8, 2, 2, '#4a3a6e'); // faint crystal
    if (h % 23 === 0) { R(ctx, dx + 3, dy + 3, 1, 4, '#17171f'); R(ctx, dx + 3, dy + 6, 3, 1, '#17171f'); } // crack
  } else {
    // town: mossy beige stone + timber cap
    R(ctx, dx, dy, TILE, TILE, '#7a7a8c');
    R(ctx, dx, dy + 5, TILE, 1, '#4c4c5c');
    R(ctx, dx, dy + 11, TILE, 1, '#4c4c5c');
    R(ctx, dx + 7, dy, 1, 6, '#4c4c5c');
    R(ctx, dx + 3, dy + 6, 1, 5, '#4c4c5c');
    R(ctx, dx + 11, dy + 6, 1, 5, '#4c4c5c');
    R(ctx, dx, dy, TILE, 2, '#8f6b3f'); // timber beam top
    R(ctx, dx, dy, TILE, 1, '#c99a5e');
    R(ctx, dx, dy + 15, TILE, 1, '#3a3a48');
    R(ctx, dx + 1 + (h % 6), dy + 7 + ((h >> 3) % 5), 2, 1, '#a8a8c0');
    if (h % 9 === 0) R(ctx, dx + 10, dy + 12, 3, 2, '#4d7a35'); // moss
    if (h % 13 === 0) R(ctx, dx + 2, dy + 2, 2, 1, '#4d7a35');
  }
}

function drawWater(ctx: CanvasRenderingContext2D, dx: number, dy: number, tx: number, ty: number, time: number, mapId: MapId): void {
  const alt = (tx + ty) % 2 === 0;
  R(ctx, dx, dy, TILE, TILE, alt ? '#2456d8' : '#1e4cc4');
  R(ctx, dx, dy, TILE, TILE, alt ? '#2456d8' : '#1e4cc4');
  // deep shimmer bands
  const off = Math.floor(time / 350 + tx * 0.8 + ty * 0.6) % 8;
  R(ctx, dx + ((off + 2) % 12), dy + 4, 6, 1, '#5b9cf8');
  R(ctx, dx + ((8 - off + 12) % 12), dy + 9, 6, 1, '#3b78e8');
  R(ctx, dx + ((off + 6) % 14), dy + 12, 3, 1, 'rgba(255,255,255,0.5)');
  const h = hash2(tx * 13, ty * 17);
  if ((h + Math.floor(time / 500)) % 11 === 0) R(ctx, dx + (h % 14), dy + ((h >> 4) % 14), 1, 1, '#dff1ff');
  // foam where water meets land (FF6 white edge)
  const nb = [
    tileAt(mapId, tx, ty - 1) !== '~',
    tileAt(mapId, tx, ty + 1) !== '~',
    tileAt(mapId, tx - 1, ty) !== '~',
    tileAt(mapId, tx + 1, ty) !== '~',
  ];
  const foam = Math.floor(time / 300) % 2 === 0 ? '#dbeafe' : '#93c5fd';
  if (nb[0]) R(ctx, dx, dy, TILE, 2, foam);
  if (nb[1]) R(ctx, dx, dy + 14, TILE, 2, foam);
  if (nb[2]) R(ctx, dx, dy, 2, TILE, foam);
  if (nb[3]) R(ctx, dx + 14, dy, 2, TILE, foam);
}

function drawDoor(ctx: CanvasRenderingContext2D, dx: number, dy: number, tx: number, ty: number, mapId: MapId): void {
  void tx; void ty;
  if (mapId === 'dungeon') drawGrassBase(ctx, dx, dy, 3, 7, true);
  else drawGrassBase(ctx, dx, dy, 3, 7, false);
  // stone frame
  R(ctx, dx + 1, dy, 14, TILE, '#8f8fa3');
  R(ctx, dx + 1, dy, 14, 1, '#c8c8dc');
  R(ctx, dx + 2, dy + 1, 12, 14, '#5a5a6e');
  // wooden double door
  R(ctx, dx + 3, dy + 2, 10, 11, '#9a6530');
  R(ctx, dx + 3, dy + 2, 10, 1, '#c99a5e');
  R(ctx, dx + 7, dy + 2, 1, 11, '#6e4420');
  R(ctx, dx + 4, dy + 5, 2, 6, '#6e4420');
  R(ctx, dx + 10, dy + 5, 2, 6, '#6e4420');
  R(ctx, dx + 3, dy + 6, 10, 2, '#7c4a21');
  R(ctx, dx + 3, dy + 6, 10, 1, '#b07a3e');
  // studs + knobs
  R(ctx, dx + 5, dy + 8, 1, 1, '#ffd76a');
  R(ctx, dx + 10, dy + 8, 1, 1, '#ffd76a');
  // step
  R(ctx, dx + 2, dy + 13, 12, 3, '#6b6b7a');
  R(ctx, dx + 2, dy + 13, 12, 1, '#a8a8c0');
  // top shadow arch
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(dx + 3, dy + 2, 10, 2);
}

function drawHeal(ctx: CanvasRenderingContext2D, dx: number, dy: number, tx: number, ty: number, time: number, mapId: MapId): void {
  if (mapId === 'dungeon') drawGrassBase(ctx, dx, dy, tx, ty, true);
  else drawGrassBase(ctx, dx, dy, tx, ty, false);
  // glow halo
  const pulse = 0.5 + Math.sin(time / 400) * 0.15;
  ctx.fillStyle = `rgba(34,211,238,${0.12 + pulse * 0.1})`;
  ctx.fillRect(dx - 1, dy - 1, 18, 18);
  // pedestal
  R(ctx, dx + 3, dy + 11, 10, 4, '#6b7280');
  R(ctx, dx + 3, dy + 11, 10, 1, '#cbd5e1');
  R(ctx, dx + 3, dy + 14, 10, 1, '#374151');
  R(ctx, dx + 5, dy + 9, 6, 3, '#9ca3af');
  R(ctx, dx + 5, dy + 9, 6, 1, '#e5e7eb');
  // crystal (faceted diamond)
  const bob = Math.round(Math.sin(time / 350) * 1);
  const cx = dx + 8, cy = dy + 6 + bob;
  R(ctx, cx - 2, cy - 3, 4, 7, '#0e7490');
  R(ctx, cx - 1, cy - 2, 2, 5, '#22d3ee');
  R(ctx, cx - 1, cy - 2, 1, 3, '#a5f3fc');
  R(ctx, cx, cy - 3, 1, 1, '#ffffff');
  R(ctx, cx - 2, cy + 1, 4, 1, '#67e8f9');
  // sparkles
  for (let i = 0; i < 3; i++) {
    const sx = dx + ((hash2(tx + i * 5, ty - i * 3) % 14));
    const sy = dy + ((time / 300 + i * 5 + hash2(tx, ty + i)) % 12);
    R(ctx, sx, sy, 1, 1, i === 0 ? '#ffffff' : '#a5f3fc');
  }
}

function drawBossAltar(ctx: CanvasRenderingContext2D, dx: number, dy: number, time: number): void {
  R(ctx, dx, dy, TILE, TILE, '#2a1218');
  R(ctx, dx, dy, TILE, 1, '#571f28');
  // lava cracks
  const flick = Math.floor(time / 200) % 2 === 0;
  R(ctx, dx + 1, dy + 12, 14, 1, flick ? '#f97316' : '#c2410c');
  R(ctx, dx + 4, dy + 10, 1, 3, '#f97316');
  R(ctx, dx + 11, dy + 11, 1, 2, '#fbbf24');
  // altar slab
  R(ctx, dx + 2, dy + 7, 12, 6, '#4a4a5e');
  R(ctx, dx + 2, dy + 7, 12, 1, '#8a8aa3');
  R(ctx, dx + 2, dy + 12, 12, 1, '#22222e');
  // glowing runes
  const glow = Math.sin(time / 300) > 0 ? '#ef4444' : '#fca5a5';
  R(ctx, dx + 4, dy + 9, 2, 1, glow);
  R(ctx, dx + 7, dy + 9, 2, 1, glow);
  R(ctx, dx + 10, dy + 9, 2, 1, glow);
  // horns / spikes
  R(ctx, dx + 6, dy + 2, 4, 5, '#1f1f2a');
  R(ctx, dx + 7, dy + 1, 2, 2, flick ? '#ef4444' : '#991b1b');
  R(ctx, dx + 7, dy + 1, 1, 1, '#fecaca');
}

export function drawTile(
  ctx: CanvasRenderingContext2D, mapId: MapId, t: string,
  dx: number, dy: number, time: number, tx: number, ty: number,
): void {
  const ix = Math.round(dx), iy = Math.round(dy);
  if (t === '.' || t === 'N' || t === 'R' || t === 'M') drawGrassBase(ctx, ix, iy, tx, ty, mapId === 'dungeon');
  else if (t === ',') drawPath(ctx, ix, iy, tx, ty, mapId);
  else if (t === '"') drawTallGrass(ctx, ix, iy, tx, ty, time);
  else if (t === '#') {
    if (mapId === 'field') drawTree(ctx, ix, iy, tx, ty);
    else drawWall(ctx, ix, iy, tx, ty, mapId);
  }
  else if (t === '~') drawWater(ctx, ix, iy, tx, ty, time, mapId);
  else if (t === 'D') drawDoor(ctx, ix, iy, tx, ty, mapId);
  else if (t === 'H') drawHeal(ctx, ix, iy, tx, ty, time, mapId);
  else if (t === 'B') drawBossAltar(ctx, ix, iy, time);
  else drawGrassBase(ctx, ix, iy, tx, ty, mapId === 'dungeon');
}

// ---------------------------------------------------------------- hero art
type Dir = 'down' | 'up' | 'left' | 'right';

function heroKind(color: string): 'ash' | 'mira' | 'bram' | 'healer' | 'ghost' {
  if (color === '#f59e0b') return 'mira';
  if (color === '#a855f7') return 'bram';
  if (color === '#f8fafc') return 'healer';
  if (color === '#444' || color === '#666') return 'ghost';
  return 'ash';
}

function shadow(ctx: CanvasRenderingContext2D, dx: number, dy: number, wide = false): void {
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  const w = wide ? 14 : 10;
  const x = Math.round(dx + (16 - w) / 2);
  ctx.fillRect(x + 1, Math.round(dy) + 14, w - 2, 1);
  ctx.fillRect(x, Math.round(dy) + 13, w, 1);
}

export function drawHero(
  ctx: CanvasRenderingContext2D, dx: number, dy: number,
  color: string, dir: string, walking: boolean, time: number,
): void {
  const d = (dir === 'up' || dir === 'down' || dir === 'left' || dir === 'right') ? dir as Dir : 'down';
  const kind = heroKind(color);
  const X = Math.round(dx), Y = Math.round(dy);
  const frame = walking ? Math.floor(time / 150) % 2 : 0;
  const idle = walking ? 0 : (Math.floor(time / 900) % 2 === 0 ? 0 : 0);
  const yo = (walking && frame === 1 ? -1 : 0) + idle;
  shadow(ctx, X, Y, kind === 'bram');

  const SKIN = kind === 'ghost' ? '#9aa0aa' : '#ffcf9e';
  const SKIN_D = kind === 'ghost' ? '#6b7280' : '#e8a06a';
  const DARK = '#14141c';

  if (kind === 'ash') {
    // cape behind (blue knight)
    const capeC = d === 'up' ? '#2b4fd8' : '#1e40af';
    R(ctx, X + 3, Y + 7 + yo, 10, 5, capeC);
    R(ctx, X + 3, Y + 11 + yo, 10, 1, '#172f7a');
    if (d === 'left') R(ctx, X + 9, Y + 7 + yo, 4, 5, capeC);
    if (d === 'right') R(ctx, X + 3, Y + 7 + yo, 4, 5, capeC);
    // boots (walk cycle)
    R(ctx, X + 5, Y + 13 + (frame === 0 ? 0 : 1), 2, 2, '#3a2a1a');
    R(ctx, X + 9, Y + 13 + (frame === 0 ? 1 : 0), 2, 2, '#3a2a1a');
    // legs
    R(ctx, X + 5, Y + 11 + yo, 2, 2, '#2b3a8f');
    R(ctx, X + 9, Y + 11 + yo, 2, 2, '#2b3a8f');
    // torso armor
    R(ctx, X + 4, Y + 7 + yo, 8, 5, '#3b82f6');
    R(ctx, X + 4, Y + 7 + yo, 2, 5, '#93c5fd');
    R(ctx, X + 10, Y + 7 + yo, 2, 5, '#1e40af');
    R(ctx, X + 4, Y + 10 + yo, 8, 2, '#2447b8');
    // belt + strap
    R(ctx, X + 4, Y + 10 + yo, 8, 1, '#5e3a1a');
    R(ctx, X + 5, Y + 10 + yo, 2, 1, '#ffd76a');
    if (d !== 'up') R(ctx, X + 7, Y + 7 + yo, 2, 4, '#1e3a8a');
    // pauldrons
    R(ctx, X + 3, Y + 7 + yo, 2, 2, '#cbd5e1');
    R(ctx, X + 11, Y + 7 + yo, 2, 2, '#cbd5e1');
    R(ctx, X + 3, Y + 7 + yo, 2, 1, '#f1f5f9');
    R(ctx, X + 11, Y + 7 + yo, 2, 1, '#f1f5f9');
    // arms
    if (d === 'left') { R(ctx, X + 3, Y + 8 + yo, 2, 3, SKIN); }
    else if (d === 'right') { R(ctx, X + 11, Y + 8 + yo, 2, 3, SKIN); }
    else { R(ctx, X + 3, Y + 8 + yo, 1, 3, SKIN); R(ctx, X + 12, Y + 8 + yo, 1, 3, SKIN); }
    // head
    R(ctx, X + 5, Y + 2 + yo, 6, 5, SKIN);
    R(ctx, X + 5, Y + 6 + yo, 6, 1, SKIN_D);
    // blonde hair
    if (d === 'up') {
      R(ctx, X + 4, Y + 1 + yo, 8, 4, '#facc15');
      R(ctx, X + 4, Y + 1 + yo, 8, 1, '#fde68a');
      R(ctx, X + 5, Y + 4 + yo, 6, 2, '#b45309');
    } else {
      R(ctx, X + 4, Y + 1 + yo, 8, 2, '#facc15');
      R(ctx, X + 4, Y + 1 + yo, 8, 1, '#fde68a');
      if (d === 'down') { R(ctx, X + 4, Y + 3 + yo, 1, 3, '#facc15'); R(ctx, X + 11, Y + 3 + yo, 1, 3, '#facc15'); }
      if (d === 'left') R(ctx, X + 4, Y + 3 + yo, 1, 2, '#facc15');
      if (d === 'right') R(ctx, X + 11, Y + 3 + yo, 1, 2, '#facc15');
      // red headband tails
      R(ctx, X + 10, Y + 2 + yo, 3, 1, '#ef4444');
    }
    // eyes
    R(ctx, X, Y, 0, 0, DARK);
    ctx.fillStyle = DARK;
    if (d === 'down') { ctx.fillRect(X + 6, Y + 4 + yo, 1, 2); ctx.fillRect(X + 9, Y + 4 + yo, 1, 2); }
    else if (d === 'left') ctx.fillRect(X + 5, Y + 4 + yo, 1, 2);
    else if (d === 'right') ctx.fillRect(X + 10, Y + 4 + yo, 1, 2);
  } else if (kind === 'mira') {
    // long auburn hair behind
    R(ctx, X + 4, Y + 2 + yo, 8, 8, '#9a3412');
    R(ctx, X + 4, Y + 2 + yo, 2, 8, '#c2410c');
    // boots
    R(ctx, X + 5, Y + 13 + (frame === 0 ? 0 : 1), 2, 2, '#4a2e16');
    R(ctx, X + 9, Y + 13 + (frame === 0 ? 1 : 0), 2, 2, '#4a2e16');
    // orange robe
    R(ctx, X + 4, Y + 7 + yo, 8, 6, '#f59e0b');
    R(ctx, X + 4, Y + 7 + yo, 2, 6, '#fde68a');
    R(ctx, X + 10, Y + 7 + yo, 2, 6, '#b45309');
    R(ctx, X + 7, Y + 7 + yo, 2, 6, '#fff7ed');
    R(ctx, X + 4, Y + 11 + yo, 8, 2, '#b45309');
    R(ctx, X + 6, Y + 10 + yo, 4, 1, '#78350f');
    // sleeves
    R(ctx, X + 3, Y + 8 + yo, 2, 3, '#f59e0b');
    R(ctx, X + 11, Y + 8 + yo, 2, 3, '#f59e0b');
    R(ctx, X + 3, Y + 10 + yo, 2, 1, '#fff7ed');
    R(ctx, X + 11, Y + 10 + yo, 2, 1, '#fff7ed');
    // head
    R(ctx, X + 5, Y + 2 + yo, 6, 5, SKIN);
    R(ctx, X + 5, Y + 6 + yo, 6, 1, SKIN_D);
    // fringe + circlet
    if (d === 'up') {
      R(ctx, X + 4, Y + 1 + yo, 8, 3, '#7c2d12');
    } else {
      R(ctx, X + 4, Y + 1 + yo, 8, 2, '#7c2d12');
      R(ctx, X + 5, Y + 2 + yo, 6, 1, '#fca5a5');
    }
    R(ctx, X + 4, Y + 3 + yo, 6, 1, '#ffd76a');
    R(ctx, X + 7, Y + 3 + yo, 2, 1, '#ef4444');
    ctx.fillStyle = DARK;
    if (d === 'down') { ctx.fillRect(X + 6, Y + 4 + yo, 1, 2); ctx.fillRect(X + 9, Y + 4 + yo, 1, 2); }
    else if (d === 'left') ctx.fillRect(X + 5, Y + 4 + yo, 1, 2);
    else if (d === 'right') ctx.fillRect(X + 10, Y + 4 + yo, 1, 2);
  } else if (kind === 'bram') {
    // fur cape
    R(ctx, X + 2, Y + 7 + yo, 12, 5, '#78350f');
    R(ctx, X + 2, Y + 7 + yo, 12, 1, '#a16207');
    // boots big
    R(ctx, X + 4, Y + 13 + (frame === 0 ? 0 : 1), 3, 2, '#292524');
    R(ctx, X + 9, Y + 13 + (frame === 0 ? 1 : 0), 3, 2, '#292524');
    // bulky purple armor
    R(ctx, X + 3, Y + 7 + yo, 10, 6, '#a855f7');
    R(ctx, X + 3, Y + 7 + yo, 2, 6, '#d8b4fe');
    R(ctx, X + 11, Y + 7 + yo, 2, 6, '#6b21a8');
    R(ctx, X + 3, Y + 11 + yo, 10, 2, '#6b21a8');
    R(ctx, X + 3, Y + 10 + yo, 10, 1, '#57370f');
    R(ctx, X + 7, Y + 10 + yo, 2, 1, '#ffd76a');
    // bracers
    R(ctx, X + 2, Y + 9 + yo, 2, 3, '#92400e');
    R(ctx, X + 12, Y + 9 + yo, 2, 3, '#92400e');
    // head + beard
    R(ctx, X + 5, Y + 2 + yo, 6, 5, SKIN);
    if (d !== 'up') R(ctx, X + 5, Y + 5 + yo, 6, 2, '#92400e');
    if (d === 'down') R(ctx, X + 7, Y + 5 + yo, 2, 1, '#78350f');
    // horned helm
    R(ctx, X + 4, Y + 1 + yo, 8, 2, '#9ca3af');
    R(ctx, X + 4, Y + 1 + yo, 8, 1, '#e5e7eb');
    R(ctx, X + 2, Y, 2, 3, '#fef3c7');
    R(ctx, X + 12, Y, 2, 3, '#fef3c7');
    R(ctx, X + 2, Y, 2, 1, '#fff');
    R(ctx, X + 12, Y, 2, 1, '#fff');
    ctx.fillStyle = DARK;
    if (d === 'down') { ctx.fillRect(X + 6, Y + 4 + yo, 1, 1); ctx.fillRect(X + 9, Y + 4 + yo, 1, 1); }
    else if (d === 'left') ctx.fillRect(X + 5, Y + 4 + yo, 1, 1);
    else if (d === 'right') ctx.fillRect(X + 10, Y + 4 + yo, 1, 1);
  } else if (kind === 'healer') {
    // white hooded robe
    R(ctx, X + 4, Y + 2 + yo, 8, 4, '#f1f5f9');
    R(ctx, X + 4, Y + 2 + yo, 8, 1, '#ffffff');
    R(ctx, X + 5, Y + 13 + (frame === 0 ? 0 : 1), 2, 1, '#64748b');
    R(ctx, X + 9, Y + 13 + (frame === 0 ? 1 : 0), 2, 1, '#64748b');
    R(ctx, X + 4, Y + 7 + yo, 8, 6, '#f1f5f9');
    R(ctx, X + 4, Y + 7 + yo, 2, 6, '#ffffff');
    R(ctx, X + 10, Y + 7 + yo, 2, 6, '#94a3b8');
    R(ctx, X + 7, Y + 8 + yo, 2, 3, '#ef4444');
    R(ctx, X + 7, Y + 8 + yo, 2, 1, '#fca5a5');
    R(ctx, X + 4, Y + 11 + yo, 8, 2, '#cbd5e1');
    R(ctx, X + 3, Y + 8 + yo, 1, 3, '#e2e8f0');
    R(ctx, X + 12, Y + 8 + yo, 1, 3, '#e2e8f0');
    R(ctx, X + 5, Y + 3 + yo, 6, 4, SKIN);
    R(ctx, X + 5, Y + 6 + yo, 6, 1, SKIN_D);
    R(ctx, X + 4, Y + 2 + yo, 1, 5, '#e2e8f0');
    R(ctx, X + 11, Y + 2 + yo, 1, 5, '#e2e8f0');
    ctx.fillStyle = DARK;
    if (d === 'down') { ctx.fillRect(X + 6, Y + 4 + yo, 1, 1); ctx.fillRect(X + 9, Y + 4 + yo, 1, 1); }
    else if (d === 'left') ctx.fillRect(X + 5, Y + 4 + yo, 1, 1);
    else if (d === 'right') ctx.fillRect(X + 10, Y + 4 + yo, 1, 1);
  } else {
    // ghost / KO: gray silhouette
    ctx.globalAlpha = 0.75;
    R(ctx, X + 5, Y + 13, 2, 1, '#4b5563');
    R(ctx, X + 9, Y + 13, 2, 1, '#4b5563');
    R(ctx, X + 4, Y + 7 + yo, 8, 6, '#6b7280');
    R(ctx, X + 5, Y + 2 + yo, 6, 5, SKIN);
    ctx.fillStyle = DARK;
    if (d !== 'up') { ctx.fillRect(X + 6, Y + 4 + yo, 1, 1); ctx.fillRect(X + 9, Y + 4 + yo, 1, 1); }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- enemies
export function drawSlime(ctx: CanvasRenderingContext2D, dx: number, dy: number, color: string, time: number, big = false): void {
  const X = Math.round(dx), Y = Math.round(dy);
  const squash = Math.sin(time / 300) * 1;
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(X + 2, Y + 14, 12, 2);
  if (big) {
    // Golem King crowned slime -> replaced by rocky king below; keep crown here too
  }
  const w = big ? 15 : 12, hgt = big ? 11 : 8;
  const x = X + Math.round((16 - w) / 2), y = Y + 15 - hgt + Math.round(squash * 0.5);
  const dark = shade(color, -55), lite = shade(color, 55);
  // body with outline
  R(ctx, x - 1, y + 2, w + 2, hgt - 2, dark);
  R(ctx, x, y, w, hgt, color);
  R(ctx, x + 1, y + 1, w - 2, 2, lite);
  R(ctx, x + 1, y + 1, 3, 2, '#ffffff');
  R(ctx, x, y + hgt - 2, w, 2, dark);
  // drips
  R(ctx, x + 2, y + hgt, 2, 1, color);
  R(ctx, x + w - 4, y + hgt, 2, 1, color);
  // eyes (glossy FF style)
  R(ctx, x + 3, y + 4, 2, 3, '#ffffff');
  R(ctx, x + w - 5, y + 4, 2, 3, '#ffffff');
  R(ctx, x + 3, y + 4, 2, 2, '#14141c');
  R(ctx, x + w - 5, y + 4, 2, 2, '#14141c');
  R(ctx, x + 3, y + 4, 1, 1, '#fff');
  R(ctx, x + w - 5, y + 4, 1, 1, '#fff');
  R(ctx, x + 5, y + 7, w - 10, 1, dark);
  if (big) {
    // gold crown
    R(ctx, x + 2, y - 4, w - 4, 4, '#fbbf24');
    R(ctx, x + 2, y - 4, w - 4, 1, '#fde68a');
    R(ctx, x + 4, y - 2, 2, 2, '#ef4444');
    R(ctx, x + w / 2 - 1, y - 2, 2, 2, '#22d3ee');
    R(ctx, x + w - 6, y - 2, 2, 2, '#ef4444');
  }
}

export function drawBat(ctx: CanvasRenderingContext2D, dx: number, dy: number, color: string, time: number): void {
  const X = Math.round(dx), Y = Math.round(dy + Math.sin(time / 250) * 1.5);
  const flap = Math.floor(time / 170) % 2 === 0;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(X + 3, Y + 14, 10, 1);
  const wingY = flap ? Y + 3 : Y + 6;
  // wings with membrane + bone
  for (const s of [-1, 1]) {
    const wx = s < 0 ? X + 1 : X + 10;
    R(ctx, wx, wingY, 5, 5, shade(color, -45));
    R(ctx, wx + (s < 0 ? 1 : 0), wingY + 1, 3, 3, '#4c1d95');
    R(ctx, wx + 1, wingY, 3, 1, '#e9d5ff');
    R(ctx, wx + 2, wingY + 1, 1, 4, '#e9d5ff');
  }
  // ears
  R(ctx, X + 5, Y + 3, 2, 3, shade(color, -30));
  R(ctx, X + 9, Y + 3, 2, 3, shade(color, -30));
  R(ctx, X + 5, Y + 3, 1, 1, '#fecaca');
  R(ctx, X + 10, Y + 3, 1, 1, '#fecaca');
  // body
  R(ctx, X + 5, Y + 5, 6, 7, color);
  R(ctx, X + 5, Y + 5, 2, 7, shade(color, 40));
  R(ctx, X + 6, Y + 9, 4, 3, '#e9d5ff');
  // glowing eyes + fangs
  R(ctx, X + 6, Y + 7, 1, 2, '#fecaca');
  R(ctx, X + 9, Y + 7, 1, 2, '#fecaca');
  R(ctx, X + 6, Y + 7, 1, 1, '#ef4444');
  R(ctx, X + 9, Y + 7, 1, 1, '#ef4444');
  R(ctx, X + 6, Y + 10, 1, 1, '#fff');
  R(ctx, X + 9, Y + 10, 1, 1, '#fff');
}

export function drawSnake(ctx: CanvasRenderingContext2D, dx: number, dy: number, color: string, time: number): void {
  const X = Math.round(dx), Y = Math.round(dy);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(X + 2, Y + 14, 12, 2);
  const dark = shade(color, -60), lite = shade(color, 45);
  // coil (3 stacked segments)
  R(ctx, X + 2, Y + 10, 12, 4, dark);
  R(ctx, X + 3, Y + 10, 10, 3, color);
  R(ctx, X + 3, Y + 8, 10, 3, dark);
  R(ctx, X + 4, Y + 8, 8, 2, color);
  R(ctx, X + 5, Y + 6, 6, 3, dark);
  R(ctx, X + 6, Y + 6, 4, 2, color);
  // diamond pattern
  R(ctx, X + 5, Y + 10, 2, 1, '#65a30d');
  R(ctx, X + 9, Y + 10, 2, 1, '#65a30d');
  R(ctx, X + 7, Y + 8, 2, 1, lite);
  // raised neck + head
  const bob = Math.round(Math.sin(time / 350) * 1);
  R(ctx, X + 10, Y + 2 + bob, 4, 6, color);
  R(ctx, X + 10, Y + 2 + bob, 1, 6, lite);
  R(ctx, X + 13, Y + 2 + bob, 1, 6, dark);
  R(ctx, X + 9, Y + 1 + bob, 6, 4, color);
  R(ctx, X + 9, Y + 1 + bob, 6, 1, lite);
  R(ctx, X + 9, Y + 4 + bob, 6, 1, '#fef9c3');
  // eye + tongue
  R(ctx, X + 11, Y + 2 + bob, 2, 2, '#fff');
  R(ctx, X + 12, Y + 2 + bob, 1, 2, '#14141c');
  R(ctx, X + 12, Y + 2 + bob, 1, 1, '#ef4444');
  const flick = Math.floor(time / 300) % 3;
  R(ctx, X + 8 - flick, Y + 3 + bob, 2 + flick, 1, '#ef4444');
}

export function drawSkeleton(ctx: CanvasRenderingContext2D, dx: number, dy: number, color: string, time: number): void {
  const X = Math.round(dx), Y = Math.round(dy + Math.sin(time / 400) * 1);
  void color;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(X + 3, Y + 14, 10, 1);
  const BONE = '#e5e7eb', BONE_D = '#9ca3af', SOCK = '#111827';
  // legs
  R(ctx, X + 5, Y + 11, 2, 3, BONE);
  R(ctx, X + 9, Y + 11, 2, 3, BONE);
  R(ctx, X + 4, Y + 13, 3, 1, BONE_D);
  R(ctx, X + 9, Y + 13, 3, 1, BONE_D);
  // ribs
  R(ctx, X + 5, Y + 7, 6, 5, BONE);
  R(ctx, X + 5, Y + 8, 6, 1, BONE_D);
  R(ctx, X + 5, Y + 10, 6, 1, BONE_D);
  R(ctx, X + 7, Y + 7, 2, 5, '#f8fafc');
  // arms + rusty blade
  R(ctx, X + 3, Y + 8, 2, 4, BONE);
  R(ctx, X + 11, Y + 8, 2, 4, BONE);
  R(ctx, X + 12, Y + 4, 2, 7, '#9ca3af');
  R(ctx, X + 12, Y + 4, 1, 7, '#e5e7eb');
  R(ctx, X + 11, Y + 11, 4, 1, '#78350f');
  // skull
  R(ctx, X + 4, Y + 1, 8, 6, BONE);
  R(ctx, X + 4, Y + 1, 8, 1, '#ffffff');
  R(ctx, X + 4, Y + 6, 8, 1, BONE_D);
  R(ctx, X + 6, Y + 6, 1, 1, BONE_D);
  R(ctx, X + 8, Y + 6, 1, 1, BONE_D);
  R(ctx, X + 10, Y + 6, 1, 1, BONE_D);
  // cracks
  R(ctx, X + 10, Y + 2, 1, 2, BONE_D);
  // glowing sockets
  const glow = Math.sin(time / 250) > 0 ? '#ef4444' : '#7f1d1d';
  R(ctx, X + 5, Y + 3, 3, 3, SOCK);
  R(ctx, X + 9, Y + 3, 3, 3, SOCK);
  R(ctx, X + 6, Y + 4, 1, 1, glow);
  R(ctx, X + 10, Y + 4, 1, 1, glow);
}

export function drawGolem(ctx: CanvasRenderingContext2D, dx: number, dy: number, color: string, time: number, big: boolean): void {
  const X = Math.round(dx), Y = Math.round(dy);
  void color;
  const s = big ? 1.5 : 1;
  const W = Math.round(14 * s), H = Math.round(14 * s);
  const x = X + Math.round((16 - W) / 2), y = Y + 15 - H;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x, Y + 14, W, 1);
  const STONE = big ? '#8a8a9a' : '#9ca3af', DARK = '#4b5563', LIT = '#d1d5db';
  const pulse = Math.sin(time / 350) > 0;
  // legs / fists
  R(ctx, x, y + H - 4, 4, 4, DARK);
  R(ctx, x + W - 4, y + H - 4, 4, 4, DARK);
  R(ctx, x - 1, y + H - 8, 4, 5, STONE);
  R(ctx, x + W - 3, y + H - 8, 4, 5, STONE);
  R(ctx, x - 1, y + H - 8, 4, 1, LIT);
  R(ctx, x + W - 3, y + H - 8, 4, 1, LIT);
  // torso blocks
  R(ctx, x + 2, y + 4, W - 4, H - 7, STONE);
  R(ctx, x + 2, y + 4, W - 4, 1, LIT);
  R(ctx, x + 2, y + H - 4, W - 4, 1, DARK);
  R(ctx, x + W / 2 - 1, y + 4, 1, H - 7, DARK);
  // cracks + moss
  R(ctx, x + 4, y + 6, 3, 1, DARK);
  R(ctx, x + W - 7, y + 9, 3, 1, DARK);
  R(ctx, x + 4, y + 10, 2, 1, '#4d7a35');
  R(ctx, x + W - 6, y + 5, 2, 1, '#4d7a35');
  // core
  R(ctx, x + W / 2 - 2, y + 7, 4, 4, '#0e7490');
  R(ctx, x + W / 2 - 1, y + 8, 2, 2, pulse ? '#22d3ee' : '#67e8f9');
  R(ctx, x + W / 2 - 1, y + 8, 1, 1, '#fff');
  // head
  R(ctx, x + 3, y, W - 6, 5, STONE);
  R(ctx, x + 3, y, W - 6, 1, LIT);
  R(ctx, x + 3, y + 4, W - 6, 1, DARK);
  const eye = pulse ? '#22d3ee' : '#a5f3fc';
  R(ctx, x + 5, y + 2, 2, 1, eye);
  R(ctx, x + W - 7, y + 2, 2, 1, eye);
  // shoulder spikes
  R(ctx, x, y + 2, 3, 3, DARK);
  R(ctx, x + W - 3, y + 2, 3, 3, DARK);
  R(ctx, x + 1, y + 1, 1, 1, LIT);
  R(ctx, x + W - 2, y + 1, 1, 1, LIT);
}

export function drawGolemKing(ctx: CanvasRenderingContext2D, dx: number, dy: number, time: number): void {
  const X = Math.round(dx), Y = Math.round(dy);
  // aura
  const pulse = 0.5 + Math.sin(time / 300) * 0.5;
  ctx.fillStyle = `rgba(239,68,68,${0.10 + pulse * 0.08})`;
  ctx.fillRect(X - 6, Y - 8, 28, 26);
  drawGolem(ctx, X - 4, Y - 4, '#ef4444', time, true);
  // crown
  R(ctx, X - 1, Y - 9, 18, 5, '#fbbf24');
  R(ctx, X - 1, Y - 9, 18, 1, '#fde68a');
  R(ctx, X + 1, Y - 5, 14, 1, '#92400e');
  R(ctx, X + 1, Y - 7, 3, 2, '#ef4444');
  R(ctx, X + 7, Y - 7, 3, 2, '#22d3ee');
  R(ctx, X + 12, Y - 7, 3, 2, '#ef4444');
  R(ctx, X + 2, Y - 7, 1, 1, '#fff');
  R(ctx, X + 8, Y - 7, 1, 1, '#fff');
  // lava veins on crown band
  const flick = Math.floor(time / 180) % 2 === 0;
  R(ctx, X + 3, Y - 2, 4, 1, flick ? '#f97316' : '#7c2d12');
  R(ctx, X + 10, Y - 2, 3, 1, flick ? '#fbbf24' : '#7c2d12');
  // orbiting embers
  for (let i = 0; i < 4; i++) {
    const a = time / 600 + (i * Math.PI) / 2;
    const ex = X + 8 + Math.cos(a) * 13;
    const ey = Y + 5 + Math.sin(a) * 8;
    R(ctx, ex, ey, 1, 1, i % 2 === 0 ? '#fbbf24' : '#ef4444');
  }
}

export function drawHumanoidFoe(ctx: CanvasRenderingContext2D, dx: number, dy: number, color: string, time: number, big = false): void {
  // fallback: tinted skeleton-golem hybrid
  if (color === '#e5e7eb') drawSkeleton(ctx, dx, dy, color, time);
  else drawGolem(ctx, dx, dy, color, time, big);
}

export function drawEnemy(ctx: CanvasRenderingContext2D, id: string, dx: number, dy: number, color: string, time: number, big: boolean): void {
  if (id === 'boss') { drawGolemKing(ctx, dx, dy, time); return; }
  if (id === 'slime') drawSlime(ctx, dx, dy, color, time, big);
  else if (id === 'golem') drawGolem(ctx, dx, dy, color, time, big);
  else if (id === 'bat') drawBat(ctx, dx, dy, color, time);
  else if (id === 'snake') drawSnake(ctx, dx, dy, color, time);
  else if (id === 'skeleton') drawSkeleton(ctx, dx, dy, color, time);
  else drawHumanoidFoe(ctx, dx, dy, color, time, big);
}

// ---------------------------------------------------------------- backdrops
export function drawBattleBackdrop(ctx: CanvasRenderingContext2D, mapId: MapId, isBoss: boolean, time: number): void {
  // sky
  let top = '#1a2b5e', mid = '#2e4a8a', hor = '#7ab648';
  if (mapId === 'dungeon' || isBoss) { top = '#1a0f24'; mid = '#3f1d3a'; hor = '#571f28'; }
  else if (mapId === 'town') { top = '#2b3a7a'; mid = '#7a5a9a'; hor = '#c98a5a'; }
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, isBoss ? '#2a0f1a' : top);
  g.addColorStop(0.55, isBoss ? '#4a1a24' : mid);
  g.addColorStop(0.62, hor);
  g.addColorStop(0.66, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);

  // stars (night / dungeon / boss)
  if (mapId === 'dungeon' || isBoss || mapId === 'town') {
    for (let i = 0; i < 40; i++) {
      const h = hash2(i * 17, 7);
      const sx = h % VW, sy = (h >> 4) % 90;
      const tw = (h + Math.floor(time / 400)) % 7 === 0;
      ctx.fillStyle = tw ? '#ffffff' : 'rgba(255,255,255,0.5)';
      ctx.fillRect(sx, sy, 1, 1);
    }
  }
  // moon (town / field)
  if (!isBoss && mapId !== 'dungeon') {
    R(ctx, VW - 52, 18, 18, 18, '#f8f4d8');
    R(ctx, VW - 52, 18, 18, 2, '#fff');
    R(ctx, VW - 48, 24, 4, 4, '#d8d4b8');
    R(ctx, VW - 42, 28, 3, 3, '#d8d4b8');
    ctx.fillStyle = 'rgba(248,244,216,0.18)';
    ctx.fillRect(VW - 56, 14, 26, 26);
  }
  // clouds drifting
  if (!isBoss && mapId !== 'dungeon') {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 3; i++) {
      const cx = ((time / 40 + i * 130) % (VW + 80)) - 40;
      const cy = 24 + i * 22;
      ctx.fillRect(Math.round(cx), cy, 34, 4);
      ctx.fillRect(Math.round(cx) + 6, cy - 3, 20, 3);
    }
  }
  // distant mountains / cavern silhouette
  const horizon = 104;
  ctx.fillStyle = isBoss || mapId === 'dungeon' ? '#241a33' : '#2e4a6e';
  for (let x = 0; x < VW; x += 4) {
    const hgt = 18 + (hash2(x, 99) % 26);
    ctx.fillRect(x, horizon - hgt, 4, hgt);
  }
  ctx.fillStyle = isBoss || mapId === 'dungeon' ? '#31244a' : '#3e5f8a';
  for (let x = 0; x < VW; x += 6) {
    const hgt = 10 + (hash2(x, 55) % 16);
    ctx.fillRect(x, horizon - hgt, 6, hgt);
  }
  // dungeon crystals
  if (mapId === 'dungeon' || isBoss) {
    for (let i = 0; i < 6; i++) {
      const h = hash2(i * 31, 3);
      const cx = (h % VW);
      const glow = Math.sin(time / 400 + i) > 0 ? '#a78bfa' : '#7c3aed';
      R(ctx, cx, 128, 3, 12, '#4c1d95');
      R(ctx, cx, 126, 3, 3, glow);
      R(ctx, cx, 126, 1, 3, '#fff');
    }
  }
  // ground plane (FF6 textured)
  const gy = 104;
  if (mapId === 'dungeon' || isBoss) {
    R(ctx, 0, gy, VW, VH - gy, '#2e2e3d');
    R(ctx, 0, gy, VW, 2, isBoss ? '#7f1d1d' : '#4e4e60');
    for (let i = 0; i < 60; i++) {
      const h = hash2(i * 7, 21);
      R(ctx, h % VW, gy + 4 + ((h >> 4) % (VH - gy - 6)), 2, 1, 'rgba(0,0,0,0.4)');
      if (h % 9 === 0) R(ctx, h % VW, gy + 6 + ((h >> 6) % 20), 1, 1, '#55556a');
    }
    if (isBoss) {
      const flick = Math.floor(time / 200) % 2 === 0;
      for (let i = 0; i < 5; i++) {
        const h = hash2(i * 91, 5);
        R(ctx, (h % VW), gy + 12 + ((h >> 3) % 40), 12, 1, flick ? '#f97316' : '#7c2d12');
      }
      // rising embers
      for (let i = 0; i < 12; i++) {
        const h = hash2(i * 13, 77);
        const ey = VH - ((time / 20 + h * 3 + i * 40) % (VH - gy));
        R(ctx, (h + i * 29) % VW, ey, 1, 1, i % 2 ? '#fbbf24' : '#ef4444');
      }
    }
  } else {
    R(ctx, 0, gy, VW, VH - gy, mapId === 'town' ? '#9a7648' : '#4d8a3a');
    R(ctx, 0, gy, VW, 2, '#d8b878');
    R(ctx, 0, gy + 2, VW, 2, 'rgba(0,0,0,0.2)');
    for (let i = 0; i < 70; i++) {
      const h = hash2(i * 11, 13);
      const yy = gy + 6 + ((h >> 4) % (VH - gy - 8));
      R(ctx, h % VW, yy, 2, 1, mapId === 'town' ? '#7c5a34' : '#356b2a');
      if (h % 7 === 0) R(ctx, (h >> 3) % VW, yy, 1, 1, '#8be06b');
    }
    // path perspective lines
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 4; i++) ctx.fillRect(VW / 2 - 30 + i * 16, gy + 8 + i * 14, 2, 10);
  }
  // scanline sheen + vignette (FF6 CRT warmth)
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  for (let y = 0; y < VH; y += 3) ctx.fillRect(0, y, VW, 1);
  const vg = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VH * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, VW, VH);
}

export function drawTitleBackdrop(ctx: CanvasRenderingContext2D, time: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, '#070714');
  g.addColorStop(0.55, '#141a4a');
  g.addColorStop(0.75, '#3a2a5e');
  g.addColorStop(0.9, '#8a4a3a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);
  // stars
  for (let i = 0; i < 90; i++) {
    const h = hash2(i * 29, 11);
    const sx = h % VW, sy = (h >> 5) % 140;
    const tw = (h + Math.floor(time / 500)) % 9 === 0;
    R(ctx, sx, sy, 1, 1, tw ? '#fff' : 'rgba(255,255,255,0.55)');
  }
  // round pixel moon with glow + craters
  const mx = VW - 52, my = 42, mr = 15;
  ctx.fillStyle = 'rgba(245,237,208,0.14)';
  ctx.fillRect(mx - mr - 6, my - mr - 6, (mr + 6) * 2, (mr + 6) * 2);
  for (let yy = -mr; yy <= mr; yy++) {
    const half = Math.floor(Math.sqrt(mr * mr - yy * yy));
    R(ctx, mx - half, my + yy, half * 2, 1, '#f5edd0');
  }
  for (let yy = -mr; yy <= -mr + 2; yy++) {
    const half = Math.floor(Math.sqrt(mr * mr - yy * yy));
    R(ctx, mx - half, my + yy, half * 2, 1, '#fffdf0');
  }
  const craters: Array<[number, number, number]> = [[-5, -2, 3], [4, 3, 2], [-1, 7, 2]];
  for (const [ox, oy, r] of craters) {
    for (let yy = -r; yy <= r; yy++) {
      const half = Math.floor(Math.sqrt(r * r - yy * yy));
      R(ctx, mx + ox - half, my + oy + yy, half * 2, 1, '#d5cba5');
    }
  }
  // ---- far mountain range: sloped peaks with snowcaps (not city bars)
  const horizon = 186;
  const peaks = [
    { x: -20, w: 110, h: 78 }, { x: 70, w: 130, h: 100 },
    { x: 180, w: 110, h: 70 }, { x: 260, w: 100, h: 86 },
  ];
  for (const p of peaks) {
    for (let row = 0; row < p.h; row++) {
      const t = row / p.h; // 0 at top
      const half = Math.round((p.w / 2) * t);
      const y = horizon - p.h + row;
      R(ctx, p.x + p.w / 2 - half, y, half * 2, 1, '#2b2b5e');
    }
    // snowcap
    const capH = Math.round(p.h * 0.22);
    for (let row = 0; row < capH; row++) {
      const t = row / p.h;
      const half = Math.round((p.w / 2) * t);
      const y = horizon - p.h + row;
      R(ctx, p.x + p.w / 2 - half, y, half * 2, 1, row < 2 ? '#e8e8f5' : '#b8b8d8');
    }
  }
  // ---- rolling near hills
  ctx.fillStyle = '#1c2440';
  for (let x = 0; x < VW; x += 2) {
    const hgt = Math.round(18 + Math.sin(x / 55) * 8 + Math.sin(x / 23 + 2) * 4);
    ctx.fillRect(x, horizon - hgt, 2, hgt);
  }
  // ---- pine forest silhouette (triangles, not towers)
  for (let x = 4; x < VW; x += 9) {
    const h = hash2(x, 301);
    const th = 8 + (h % 7);
    const by = horizon - 12 - (h % 8);
    const sway = 0;
    R(ctx, x + 2 + sway, by + th - 2, 2, 3, '#0e1a12');
    for (let r = 0; r < 3; r++) {
      const w = 8 - r * 2;
      R(ctx, x + 3 - w / 2, by + r * (th / 3), w, th / 3 + 1, r === 0 ? '#14301c' : '#0f2415');
    }
    R(ctx, x + 2, by, 2, 1, '#1d4a28');
  }
  // ---- fantasy castle on a hill, left side (stone, spires, banners)
  const flick = Math.floor(time / 400) % 2 === 0;
  // hill mound
  ctx.fillStyle = '#24301f';
  for (let x = 0; x < 130; x += 2) {
    const hgt = Math.round(34 - Math.abs(x - 55) * 0.35);
    if (hgt > 0) ctx.fillRect(x, horizon - hgt, 2, hgt);
  }
  ctx.fillStyle = 'rgba(140,255,150,0.08)';
  for (let x = 0; x < 130; x += 4) {
    const hgt = Math.round(34 - Math.abs(x - 55) * 0.35);
    if (hgt > 0) ctx.fillRect(x, horizon - hgt, 4, 1);
  }
  const ST = '#5a5a7e', ST_L = '#8a8aa5', ST_D = '#38384e';
  const ROOF = '#8a2f3d', ROOF_L = '#c25a6a';
  function tower(tx: number, ty: number, w: number, h: number, roofH: number): void {
    R(ctx, tx, ty, w, h, ST);
    R(ctx, tx, ty, 2, h, ST_L);
    R(ctx, tx + w - 2, ty, 2, h, ST_D);
    // battlements
    for (let bx = tx; bx < tx + w; bx += 4) R(ctx, bx, ty - 3, 2, 3, ST);
    R(ctx, tx, ty - 3, w, 1, ST_L);
    // stepped spire roof
    for (let r = 0; r < roofH; r++) {
      const inset = Math.floor((r / roofH) * (w / 2));
      R(ctx, tx + inset, ty - 3 - roofH + r, w - inset * 2, 1, r === 0 ? ROOF_L : ROOF);
    }
    // flag
    const fx = tx + w / 2;
    R(ctx, fx, ty - 3 - roofH - 6, 1, 6, '#3a2a1a');
    const wave = Math.floor(time / 300) % 2;
    R(ctx, fx + 1, ty - 3 - roofH - 6, 4 + wave, 2, '#ffd76a');
    R(ctx, fx + 1, ty - 3 - roofH - 6, 2, 1, '#fff3c4');
  }
  // side towers + center keep
  tower(8, 128, 16, 34, 10);
  tower(62, 128, 16, 34, 10);
  tower(28, 112, 32, 50, 0);
  // keep battlements + tall flag
  for (let bx = 28; bx < 60; bx += 4) R(ctx, bx, 109, 2, 3, ST);
  R(ctx, 28, 109, 32, 1, ST_L);
  R(ctx, 43, 96, 1, 13, '#3a2a1a');
  const wv = Math.floor(time / 300) % 2;
  R(ctx, 44, 96, 7 + wv, 4, '#ef4444');
  R(ctx, 44, 96, 7 + wv, 1, '#fca5a5');
  // arched lit windows on keep
  const winCols = [flick ? '#ffd76a' : '#c98a2a', '#ffd76a', flick ? '#c98a2a' : '#ffd76a'];
  winCols.forEach((c, i) => {
    const wx = 33 + i * 8;
    R(ctx, wx, 122, 4, 7, '#23233a');
    R(ctx, wx + 1, 123, 2, 5, c);
    R(ctx, wx + 1, 123, 2, 1, '#fff3c4');
    R(ctx, wx + 1, 127, 2, 1, ST_D);
  });
  // tower windows
  R(ctx, 13, 136, 3, 5, '#23233a'); R(ctx, 14, 137, 1, 3, '#ffd76a');
  R(ctx, 67, 136, 3, 5, '#23233a'); R(ctx, 68, 137, 1, 3, flick ? '#ffd76a' : '#c98a2a');
  // gate arch with warm light spilling onto path
  R(ctx, 38, 146, 12, 16, '#1a1a2a');
  R(ctx, 40, 148, 8, 14, flick ? '#ffb84d' : '#e08a2d');
  R(ctx, 40, 148, 8, 2, '#ffe9b8');
  R(ctx, 38, 146, 12, 2, ST_L);
  ctx.fillStyle = 'rgba(255,184,77,0.25)';
  ctx.fillRect(34, 162, 20, 3);
  ctx.fillRect(30, 165, 28, 2);
  // torch glows flanking gate
  for (const tx of [34, 52]) {
    R(ctx, tx, 150, 2, 5, '#3a2a1a');
    R(ctx, tx, 148, 2, 2, flick ? '#ffd76a' : '#ff9a3d');
    ctx.fillStyle = 'rgba(255,200,100,0.20)';
    ctx.fillRect(tx - 3, 145, 8, 8);
  }
  // mist band + ground
  ctx.fillStyle = 'rgba(200,180,255,0.10)';
  ctx.fillRect(0, 180, VW, 8);
  ctx.fillStyle = '#101a14';
  ctx.fillRect(0, 188, VW, VH - 188);
  ctx.fillStyle = 'rgba(138,74,58,0.35)';
  ctx.fillRect(0, 188, VW, 3);
}

// ---------------------------------------------------------------- world
export interface NpcDef { id: string; name: string; mapId: MapId; tx: number; ty: number; color: string; }

export function npcPositions(s: GameState): NpcDef[] {
  const out: NpcDef[] = [
    { id: 'healer', name: 'Healer', mapId: 'town', tx: 5, ty: 11, color: '#f8fafc' },
  ];
  if (!s.flags.recruitedMira) out.push({ id: 'mira', name: 'Mira', mapId: 'town', tx: 11, ty: 11, color: '#f59e0b' });
  if (!s.flags.recruitedBram) out.push({ id: 'bram', name: 'Bram', mapId: 'dungeon', tx: 6, ty: 12, color: '#a855f7' });
  return out;
}

function drawVignette(ctx: CanvasRenderingContext2D): void {
  const vg = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VH * 0.9);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,10,0.38)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, VW, VH);
}

export function drawWorld(
  ctx: CanvasRenderingContext2D, s: GameState, time: number,
  rows: string[],
): void {
  const mapWpx = rows[0].length * TILE, mapHpx = rows.length * TILE;
  // Center maps smaller than the (possibly widescreen-expanded) view instead
  // of clamping to a corner, which left a black sidebar.
  let camX = s.px + 8 - VW / 2;
  let camY = s.py + 8 - VH / 2;
  camX = mapWpx <= VW ? (mapWpx - VW) / 2 : Math.max(0, Math.min(camX, mapWpx - VW));
  camY = mapHpx <= VH ? (mapHpx - VH) / 2 : Math.max(0, Math.min(camY, mapHpx - VH));
  // Outside the map, show base terrain (not black / not walls).
  const seen = (tx: number, ty: number): string => {
    if (ty < 0 || ty >= rows.length || tx < 0 || tx >= rows[0].length) return '.';
    return tileAt(s.mapId, tx, ty);
  };
  const x0 = Math.floor(camX / TILE), y0 = Math.floor(camY / TILE);
  const x1 = x0 + VW / TILE + 1;
  const y1 = y0 + VH / TILE + 1;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      drawTile(ctx, s.mapId, seen(tx, ty), tx * TILE - camX, ty * TILE - camY, time, tx, ty);
    }
  }
  // wall base shadows (depth cue)
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (seen(tx, ty) === '#') {
        const below = seen(tx, ty + 1);
        if (below !== '#') ctx.fillRect(Math.round(tx * TILE - camX), Math.round((ty + 1) * TILE - camY) - 2, TILE, 2);
      }
    }
  }
  // NPCs
  for (const n of npcPositions(s)) {
    if (n.mapId !== s.mapId) continue;
    // exclamation sparkle for recruitables
    if ((n.id === 'mira' || n.id === 'bram') && Math.floor(time / 500) % 2 === 0) {
      R(ctx, n.tx * TILE - camX + 7, n.ty * TILE - camY - 9, 2, 4, '#ffd76a');
      R(ctx, n.tx * TILE - camX + 6, n.ty * TILE - camY - 8, 4, 2, '#ffd76a');
      R(ctx, n.tx * TILE - camX + 7, n.ty * TILE - camY - 8, 2, 2, '#7c2d12');
    }
    drawHero(ctx, n.tx * TILE - camX, n.ty * TILE - camY - 2, n.color, 'down', false, time + 500);
  }
  // player
  const moving = (s as unknown as { __moving?: boolean }).__moving === true;
  drawHero(ctx, s.px - camX, s.py - camY - 2, s.party[0]?.color ?? '#3b82f6', s.dir, moving, time);
  // followers (simple trail)
  s.party.slice(1).forEach((m, i) => {
    const ox = s.dir === 'left' ? 12 * (i + 1) : s.dir === 'right' ? -12 * (i + 1) : 0;
    const oy = s.dir === 'down' ? -12 * (i + 1) : s.dir === 'up' ? 12 * (i + 1) : (i % 2 === 0 ? 4 : -4);
    drawHero(ctx, s.px - camX + ox, s.py - camY - 2 + oy, m.color, s.dir, moving, time - 120 * (i + 1));
  });
  // drifting light motes / pollen
  ctx.fillStyle = s.mapId === 'dungeon' ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,220,0.35)';
  for (let i = 0; i < 14; i++) {
    const h = hash2(i * 41, 5);
    const mx = (h * 7 + time / (60 + (i % 5) * 20)) % (VW + 20) - 10;
    const my = (h * 13 + Math.sin(time / 1500 + i) * 8) % VH;
    ctx.fillRect(Math.round(mx), Math.round((my + VH) % VH), 1, 1);
  }
  // dungeon darkness with light around player
  if (s.mapId === 'dungeon') {
    const px = s.px - camX + 8, py = s.py - camY + 8;
    const dg = ctx.createRadialGradient(px, py, 20, px, py, 110);
    dg.addColorStop(0, 'rgba(5,5,18,0)');
    dg.addColorStop(0.6, 'rgba(5,5,18,0.25)');
    dg.addColorStop(1, 'rgba(5,5,18,0.62)');
    ctx.fillStyle = dg;
    ctx.fillRect(0, 0, VW, VH);
  } else if (s.mapId === 'town') {
    // warm sunset tint top
    const tg = ctx.createLinearGradient(0, 0, 0, 60);
    tg.addColorStop(0, 'rgba(255,170,80,0.10)');
    tg.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, VW, 60);
  }
  drawVignette(ctx);
}
