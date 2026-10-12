import { TILE, tileAt, type MapId } from './data';
import type { GameState } from './state';

export const VW = 320;
export const VH = 240;

export function drawWindow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(18,32,140,0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#f8f8f8';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = '#1a1a2e';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v: number) => Math.max(0, Math.min(255, v + amt));
  const r = cl((n >> 16) & 255), g = cl((n >> 8) & 255), b = cl(n & 255);
  return `rgb(${r},${g},${b})`;
}

export function drawTile(
  ctx: CanvasRenderingContext2D, mapId: MapId, t: string,
  dx: number, dy: number, time: number, tx: number, ty: number,
): void {
  const pal = mapId === 'dungeon' ? { g0: '#23232e', g1: '#262633' }
    : mapId === 'town' ? { g0: '#4a7c3a', g1: '#447236' }
    : { g0: '#3f7a33', g1: '#3a702f' };
  // base
  ctx.fillStyle = (tx + ty) % 2 === 0 ? pal.g0 : pal.g1;
  if (t === ',') ctx.fillStyle = mapId === 'dungeon' ? '#2b2b38' : '#4f8a3e';
  if (t === '.' || t === ',') ctx.fillRect(dx, dy, TILE, TILE);
  else ctx.fillRect(dx, dy, TILE, TILE);

  if (t === '.' || t === ',') {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(dx + ((tx * 7 + ty * 13) % 12), dy + ((tx * 5 + ty * 11) % 12), 2, 2);
  } else if (t === '"') {
    ctx.fillStyle = mapId === 'dungeon' ? '#33334a' : '#356b2a';
    ctx.fillRect(dx, dy, TILE, TILE);
    const sway = Math.sin(time / 300 + (tx + ty)) > 0 ? 1 : 0;
    ctx.fillStyle = '#5da24a';
    for (let i = 0; i < 4; i++) {
      const bx = dx + 2 + i * 4;
      ctx.fillRect(bx + sway, dy + 5, 2, 9);
      ctx.fillRect(bx + sway, dy + 3, 2, 3);
    }
  } else if (t === '#') {
    if (mapId === 'field') {
      // tree
      ctx.fillStyle = '#2c5a26';
      ctx.fillRect(dx, dy, TILE, TILE);
      ctx.fillStyle = '#3c7a34';
      ctx.fillRect(dx + 2, dy + 2, 12, 10);
      ctx.fillStyle = '#2a5224';
      ctx.fillRect(dx + 6, dy + 10, 4, 6);
    } else {
      ctx.fillStyle = '#3a3a4a';
      ctx.fillRect(dx, dy, TILE, TILE);
      ctx.fillStyle = '#565672';
      ctx.fillRect(dx, dy, TILE, 5);
      ctx.fillStyle = '#2c2c38';
      ctx.fillRect(dx, dy + 12, TILE, 4);
    }
  } else if (t === '~') {
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(dx, dy, TILE, TILE);
    ctx.fillStyle = '#60a5fa';
    const off = Math.floor(time / 400 + tx + ty) % 2;
    ctx.fillRect(dx + 2 + off, dy + 5, 6, 1);
    ctx.fillRect(dx + 8 - off, dy + 10, 6, 1);
  } else if (t === 'D') {
    ctx.fillStyle = '#7c4a21';
    ctx.fillRect(dx, dy, TILE, TILE);
    ctx.fillStyle = '#a06a35';
    ctx.fillRect(dx + 2, dy + 2, 12, 12);
  } else if (t === 'H') {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(dx, dy, TILE, TILE);
    const bob = Math.sin(time / 350) * 1.5;
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(dx + 6, dy + 3 + bob, 4, 9);
    ctx.fillStyle = '#a5f3fc';
    ctx.fillRect(dx + 7, dy + 4 + bob, 2, 3);
  } else if (t === 'B') {
    ctx.fillStyle = '#3f1d24';
    ctx.fillRect(dx, dy, TILE, TILE);
    ctx.fillStyle = t ? '#ef4444' : '#ef4444';
    ctx.fillRect(dx + 3, dy + 9, 10, 4);
    ctx.fillRect(dx + 6, dy + 4, 4, 6);
  }
}

// --- characters (procedural 16x16-ish) ---
export function drawHero(
  ctx: CanvasRenderingContext2D, dx: number, dy: number,
  color: string, dir: string, walking: boolean, time: number,
): void {
  const bob = walking ? (Math.floor(time / 140) % 2) : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(dx + 3, dy + 13, 10, 2);
  // body
  ctx.fillStyle = color;
  ctx.fillRect(dx + 4, dy + 7 + bob, 8, 6);
  ctx.fillStyle = shade(color, -40);
  ctx.fillRect(dx + 4, dy + 11 + bob, 8, 2);
  // head
  ctx.fillStyle = '#f2c89b';
  ctx.fillRect(dx + 5, dy + 2 + bob, 6, 5);
  // hair/hood
  ctx.fillStyle = shade(color, -60);
  ctx.fillRect(dx + 4, dy + 1 + bob, 8, 3);
  // eyes face dir
  ctx.fillStyle = '#111';
  if (dir === 'down') { ctx.fillRect(dx + 6, dy + 4 + bob, 1, 1); ctx.fillRect(dx + 9, dy + 4 + bob, 1, 1); }
  else if (dir === 'up') { /* back of head */ }
  else if (dir === 'left') { ctx.fillRect(dx + 5, dy + 4 + bob, 1, 1); }
  else { ctx.fillRect(dx + 10, dy + 4 + bob, 1, 1); }
  // feet
  ctx.fillStyle = '#222';
  const step = walking ? (Math.floor(time / 140) % 2 === 0 ? 0 : 1) : 0;
  ctx.fillRect(dx + 5, dy + 13 + step, 2, 2);
  ctx.fillRect(dx + 9, dy + 13 + (1 - step), 2, 2);
}

export function drawSlime(ctx: CanvasRenderingContext2D, dx: number, dy: number, color: string, time: number, big = false): void {
  const s = big ? 2 : 1;
  const w = 12 * s, h = 9 * s;
  const x = dx + (16 - w) / 2, y = dy + (16 - h) + Math.sin(time / 300) * 1;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(dx + 2, dy + 13, 12, 2);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = shade(color, 40);
  ctx.fillRect(x + 1, y + 1, w - 2, 2 * s);
  ctx.fillStyle = '#111';
  ctx.fillRect(x + 3 * s, y + 4 * s, 2, 2);
  ctx.fillRect(x + 7 * s, y + 4 * s, 2, 2);
  if (big) {
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(x + 2, y - 4, w - 4, 3);
  }
}

export function drawBat(ctx: CanvasRenderingContext2D, dx: number, dy: number, color: string, time: number): void {
  const flap = Math.floor(time / 180) % 2 === 0;
  ctx.fillStyle = color;
  ctx.fillRect(dx + 2, dy + (flap ? 4 : 6), 3, 4); // left wing
  ctx.fillRect(dx + 11, dy + (flap ? 4 : 6), 3, 4); // right wing
  ctx.fillStyle = shade(color, -30);
  ctx.fillRect(dx + 5, dy + 6, 6, 6); // body
  ctx.fillStyle = '#fecaca';
  ctx.fillRect(dx + 6, dy + 8, 1, 1);
  ctx.fillRect(dx + 9, dy + 8, 1, 1);
}

export function drawHumanoidFoe(ctx: CanvasRenderingContext2D, dx: number, dy: number, color: string, time: number, big = false): void {
  const bob = Math.sin(time / 400) * 1;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(dx + 3, dy + 13, 10, 2);
  ctx.fillStyle = color;
  const h = big ? 12 : 9;
  ctx.fillRect(dx + 5, dy + 14 - h + bob, 6, h);
  ctx.fillStyle = '#111';
  ctx.fillRect(dx + 6, dy + 4 + bob, 2, 2);
  ctx.fillRect(dx + 9, dy + 4 + bob, 1, 1);
}

export function drawEnemy(ctx: CanvasRenderingContext2D, id: string, dx: number, dy: number, color: string, time: number, big: boolean): void {
  if (id === 'slime' || id === 'boss' || id === 'golem') drawSlime(ctx, dx, dy, color, time, big || id === 'boss');
  else if (id === 'bat') drawBat(ctx, dx, dy, color, time);
  else if (id === 'snake') { drawSlime(ctx, dx, dy, color, time); ctx.fillStyle = '#111'; ctx.fillRect(dx + 4, dy + 9, 8, 1); }
  else drawHumanoidFoe(ctx, dx, dy, color, time, big);
}

export interface NpcDef { id: string; name: string; mapId: MapId; tx: number; ty: number; color: string; }

export function npcPositions(s: GameState): NpcDef[] {
  const out: NpcDef[] = [
    { id: 'healer', name: 'Healer', mapId: 'town', tx: 5, ty: 11, color: '#f8fafc' },
  ];
  if (!s.flags.recruitedMira) out.push({ id: 'mira', name: 'Mira', mapId: 'town', tx: 11, ty: 11, color: '#f59e0b' });
  if (!s.flags.recruitedBram) out.push({ id: 'bram', name: 'Bram', mapId: 'dungeon', tx: 6, ty: 12, color: '#a855f7' });
  return out;
}

export function drawWorld(
  ctx: CanvasRenderingContext2D, s: GameState, time: number,
  rows: string[],
): void {
  const camX = Math.max(0, Math.min(s.px + 8 - VW / 2, rows[0].length * TILE - VW));
  const camY = Math.max(0, Math.min(s.py + 8 - VH / 2, rows.length * TILE - VH));
  const x0 = Math.floor(camX / TILE), y0 = Math.floor(camY / TILE);
  const x1 = Math.min(rows[0].length - 1, x0 + VW / TILE + 1);
  const y1 = Math.min(rows.length - 1, y0 + VH / TILE + 1);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      drawTile(ctx, s.mapId, tileAt(s.mapId, tx, ty), tx * TILE - camX, ty * TILE - camY, time, tx, ty);
    }
  }
  // NPCs
  const walking = false;
  for (const n of npcPositions(s)) {
    if (n.mapId !== s.mapId) continue;
    drawHero(ctx, n.tx * TILE - camX, n.ty * TILE - camY - 2, n.color, 'down', walking, time + 500);
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
}
