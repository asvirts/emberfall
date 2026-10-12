import './style.css';
import { TILE, MAPS, tileAt, isBlocked, MOVES, HEROES } from './game/data';
import { initialState, makeMember, saveGame, loadGame, xpNeedFor, type GameState } from './game/state';
import { drawWindow, drawEnemy, drawHero, drawWorld, drawBattleBackdrop, drawTitleBackdrop, computeView, VW, VH } from './game/render';
import { Battle, type PlannedCmd } from './game/battle';
import { sfx } from './game/audio';

// ---------- setup ----------
document.querySelector('#app')!.innerHTML = `
  <div id="wrap"><canvas id="cv" width="${VW}" height="${VH}"></canvas>
  <button id="fs-btn" title="Toggle fullscreen (F)">&#x26F6; Fullscreen</button>
  <div id="hint"><b>Arrows/WASD</b> move &nbsp; <b>Enter/Z</b> talk/confirm &nbsp; <b>X</b> back &nbsp; <b>Q/Tab</b> status &nbsp; <b>K</b> save &nbsp; <b>F</b> fullscreen<br>
  Find <b>Mira</b> in town, <b>Bram</b> in the east dungeon, beat the <b>Golem King</b>.</div></div>`;
const cv = document.querySelector<HTMLCanvasElement>('#cv')!;
const ctx = cv.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

// Adaptive viewport + DPR-aware backing store.
// computeView() expands the logical view to match the window aspect, so the
// canvas fills the screen instead of letterboxing a 4:3 box. The context is
// scaled so text rasterizes at full display resolution.
let viewScale = 1;
let viewDpr = 1;
let fitW = 0, fitH = 0, fitDpr = 0;
function fit(): void {
  computeView(window.innerWidth, window.innerHeight);
  const scale = Math.min(window.innerWidth / VW, window.innerHeight / VH);
  // Cap DPR to bound backing-store size on 3x displays.
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  viewScale = scale;
  viewDpr = dpr;
  fitW = window.innerWidth; fitH = window.innerHeight; fitDpr = dpr;
  cv.width = Math.max(2, Math.round(VW * scale * dpr));
  cv.height = Math.max(2, Math.round(VH * scale * dpr));
  cv.style.width = `${Math.max(2, Math.round(VW * scale))}px`;
  cv.style.height = `${Math.max(2, Math.round(VH * scale))}px`;
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', fit);
document.addEventListener('fullscreenchange', fit);
fit();

function toggleFullscreen(): void {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}
document.querySelector('#fs-btn')!.addEventListener('click', toggleFullscreen);

let S: GameState = initialState();
type Mode = 'title' | 'overworld' | 'dialog' | 'battle' | 'status';
let mode: Mode = 'title';
let hasSave = loadGame() !== null;

// ---------- input ----------
const held = new Set<string>();
const pressed: string[] = [];
function norm(e: KeyboardEvent): string {
  const k = e.key.toLowerCase();
  if (k === 'tab') return 'statuskey';
  if (k === 'q' || k === 'e') return 'statuskey';
  if (k === 'arrowup' || k === 'w') return 'up';
  if (k === 'arrowdown' || k === 's') return 'down';
  if (k === 'arrowleft' || k === 'a') return 'left';
  if (k === 'arrowright' || k === 'd') return 'right';
  if (k === 'enter' || k === 'z' || k === ' ') return 'ok';
  if (k === 'x' || k === 'escape') return 'cancel';
  if (k === 'k') return 'savekey';
  if (k === 'c') return 'c';
  return k;
}
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(e.key)) e.preventDefault();
  const n = norm(e);
  if (n === 'f') { toggleFullscreen(); return; }
  if (!held.has(n)) pressed.push(n);
  held.add(n);
});
window.addEventListener('keyup', (e) => held.delete(norm(e)));
function takePress(): string[] { const q = [...pressed]; pressed.length = 0; return q; }

// ---------- dialog ----------
let dlgLines: string[] = [];
let dlgIdx = 0;
let dlgAfter: (() => void) | null = null;
function say(lines: string[], after?: () => void): void {
  dlgLines = lines; dlgIdx = 0; dlgAfter = after ?? null; mode = 'dialog';
}

// ---------- battle UI state ----------
let B: Battle | null = null;
let bPhase: 'intro' | 'cmd' | 'anim' | 'end' = 'intro';
let bCmdIdx = 0; // which party member choosing
let bMenu = 0; // 0 fight 1 magic 2 item 3 run
let bSub = -1; // -1 main, >=0 submenu cursor
let bMagicCur = 0;
let bItemCur = 0;
let bTargetFoe = 0;
let bTargetAlly = 0;
let bSelecting: 'none' | 'foe' | 'ally' = 'none';
let bPlans = new Map<number, PlannedCmd>();
let bAnimLines: string[] = [];
let bAnimIdx = 0;
let bAnimT = 0;
let bEndLines: string[] = [];
let bEndIdx = 0;
let bLeveledUp = false;

function startBattle(foeIds: string[], isBoss: boolean): void {
  B = new Battle(S.party, foeIds, isBoss, S.gold, S.potions, S.ethers);
  bPhase = 'intro'; bCmdIdx = 0; bMenu = 0; bSub = -1; bMagicCur = 0; bItemCur = 0;
  bTargetFoe = 0; bTargetAlly = 0; bSelecting = 'none'; bLeveledUp = false;
  bPlans = new Map(); bAnimLines = []; bAnimIdx = 0; bEndLines = []; bEndIdx = 0;
  mode = 'battle';
}

function aliveFoeIdx(): number[] {
  return B!.foes.map((f, i) => (f.hp > 0 ? i : -1)).filter((i) => i >= 0);
}
function alivePartyIdx(): number[] {
  return S.party.map((m, i) => (m.hp > 0 ? i : -1)).filter((i) => i >= 0);
}
function nextAliveCmd(start: number): number {
  for (let k = 0; k < S.party.length; k++) {
    const i = (start + k) % S.party.length;
    if (S.party[i].hp > 0) return i;
  }
  return start;
}

// ---------- world helpers ----------
function playerTile(): { tx: number; ty: number } {
  return { tx: Math.floor((S.px + 8) / TILE), ty: Math.floor((S.py + 8) / TILE) };
}
function facingTile(): { tx: number; ty: number } {
  const { tx, ty } = playerTile();
  if (S.dir === 'up') return { tx, ty: ty - 1 };
  if (S.dir === 'down') return { tx, ty: ty + 1 };
  if (S.dir === 'left') return { tx: tx - 1, ty };
  return { tx: tx + 1, ty };
}
function tryMove(dx: number, dy: number): boolean {
  const nx = S.px + dx, ny = S.py + dy;
  // collide: check 4 corners of 12x14 box
  const corners = [[nx + 2, ny + 2], [nx + 13, ny + 2], [nx + 2, ny + 15], [nx + 13, ny + 15]];
  for (const [cx, cy] of corners) {
    const tx = Math.floor(cx / TILE), ty = Math.floor(cy / TILE);
    if (isBlocked(S.mapId, tx, ty)) return false;
    // npc block
    for (const n of npcList()) {
      if (n.mapId !== S.mapId) continue;
      const nxp = n.tx * TILE, nyp = n.ty * TILE;
      if (cx >= nxp && cx < nxp + TILE && cy >= nyp && cy < nyp + TILE) return false;
    }
  }
  S.px = nx; S.py = ny;
  return true;
}
function npcList(): Array<{ id: string; mapId: typeof S.mapId; tx: number; ty: number }> {
  const out: Array<{ id: string; mapId: typeof S.mapId; tx: number; ty: number }> = [
    { id: 'healer', mapId: 'town', tx: 5, ty: 11 },
  ];
  if (!S.flags.recruitedMira) out.push({ id: 'mira', mapId: 'town', tx: 11, ty: 11 });
  if (!S.flags.recruitedBram) out.push({ id: 'bram', mapId: 'dungeon', tx: 6, ty: 12 });
  return out;
}
function switchMap(to: typeof S.mapId, tx: number, ty: number): void {
  S.mapId = to; S.px = tx * TILE; S.py = ty * TILE;
  S.stepsSinceBattle = 0;
  saveGame(S);
}
function checkDoor(): void {
  const { tx, ty } = playerTile();
  if (tileAt(S.mapId, tx, ty) !== 'D') return;
  sfx.confirm();
  if (S.mapId === 'town') switchMap('field', 9, 2);
  else if (S.mapId === 'dungeon') switchMap('field', 23, 11);
  else {
    // field: north door -> town, east door -> dungeon
    if (ty < 5) switchMap('town', 9, 12);
    else switchMap('dungeon', 2, 13);
  }
}
function rollEncounter(movedPx: number): void {
  S.stepsSinceBattle += movedPx;
  const { tx, ty } = playerTile();
  const t = tileAt(S.mapId, tx, ty);
  if (t !== '"') return;
  if (S.stepsSinceBattle < TILE) return;
  S.stepsSinceBattle = 0;
  const rate = MAPS[S.mapId].encounterRate;
  if (Math.random() < rate) {
    const table = MAPS[S.mapId].table;
    const n = 1 + (Math.random() < 0.35 ? 1 : 0) + (S.mapId === 'dungeon' && Math.random() < 0.15 ? 1 : 0);
    const ids: string[] = [];
    for (let i = 0; i < n; i++) ids.push(table[Math.floor(Math.random() * table.length)]);
    startBattle(ids, false);
  }
}
function interact(): void {
  const f = facingTile();
  // NPCs
  for (const n of npcList()) {
    if (n.mapId === S.mapId && n.tx === f.tx && n.ty === f.ty) {
      if (n.id === 'healer') {
        S.party.forEach((m) => { m.hp = m.maxHp; m.mp = m.maxMp; });
        sfx.heal();
        say(['Healer: The ember keeps you. You are restored.', 'HP and MP fully recovered! (Game saved)']);
        saveGame(S);
      } else if (n.id === 'mira') {
        say(['Mira: Monsters on the road? Take me with you!', 'Mira joined the party!'], () => {
          S.party.push(makeMember('mira', Math.max(1, S.party[0].level)));
          S.flags.recruitedMira = true;
          saveGame(S);
        });
        sfx.confirm();
      } else if (n.id === 'bram') {
        say(['Bram: Hmph. You fight the Golem King? Then you need my axe.', 'Bram joined the party!'], () => {
          S.party.push(makeMember('bram', Math.max(1, S.party[0].level)));
          S.flags.recruitedBram = true;
          saveGame(S);
        });
        sfx.confirm();
      }
      return;
    }
  }
  const ft = tileAt(S.mapId, f.tx, f.ty);
  const st = tileAt(S.mapId, playerTile().tx, playerTile().ty);
  if (ft === 'H' || st === 'H') {
    S.party.forEach((m) => { m.hp = m.maxHp; m.mp = m.maxMp; });
    sfx.heal();
    say(['The crystal hums... party fully healed!']);
    return;
  }
  if ((ft === 'B' || st === 'B') && S.mapId === 'dungeon') {
    if (S.flags.bossDone) { say(['The shattered altar is quiet. Emberfall is safe.']); return; }
    say(['The Golem King stirs...!'], () => startBattle(['boss', 'skeleton'], true));
    return;
  }
}

// ---------- update ----------
let last = performance.now();
let time = 0;
let moveAcc = 0;

function updateOverworld(dt: number, presses: string[]): void {
  let dx = 0, dy = 0;
  if (held.has('up')) { dy = -1; S.dir = 'up'; }
  else if (held.has('down')) { dy = 1; S.dir = 'down'; }
  else if (held.has('left')) { dx = -1; S.dir = 'left'; }
  else if (held.has('right')) { dx = 1; S.dir = 'right'; }
  const moving = dx !== 0 || dy !== 0;
  (S as unknown as { __moving: boolean }).__moving = moving;
  if (moving) {
    const sp = 72 * dt;
    const ok = tryMove(dx * sp, dy * sp);
    if (ok) { moveAcc += sp; rollEncounter(sp); }
    checkDoor();
  } else moveAcc = 0;
  for (const p of presses) {
    if (p === 'ok') interact();
    else if (p === 'savekey') { saveGame(S); sfx.confirm(); say(['Game saved.']); }
    else if (p === 'statuskey') { sfx.confirm(); mode = 'status'; }
    else if (p === 'up' || p === 'down' || p === 'left' || p === 'right') {
      S.dir = p as typeof S.dir;
    }
  }
}

function updateStatus(presses: string[]): void {
  if (presses.includes('cancel') || presses.includes('statuskey') || presses.includes('ok')) {
    sfx.cursor();
    mode = 'overworld';
  }
}

function updateDialog(presses: string[]): void {
  if (presses.includes('ok') || presses.includes('cancel')) {
    sfx.cursor();
    dlgIdx += 1;
    if (dlgIdx >= dlgLines.length) {
      mode = 'overworld';
      const cb = dlgAfter; dlgAfter = null;
      if (cb) cb();
    }
  }
}

// battle input
function updateBattle(presses: string[], dt: number): void {
  if (!B) { mode = 'overworld'; return; }
  if (bPhase === 'intro') {
    if (presses.includes('ok')) { bPhase = 'cmd'; bCmdIdx = nextAliveCmd(0); sfx.cursor(); }
    return;
  }
  if (bPhase === 'anim') {
    bAnimT += dt * 1000;
    const adv = presses.includes('ok');
    if (bAnimT > 750 || adv) {
      bAnimT = 0; bAnimIdx += 1;
      if (bAnimIdx >= bAnimLines.length) {
        const over = B.isOver();
        if (over.done) enterBattleEnd(over);
        else { bPhase = 'cmd'; bCmdIdx = nextAliveCmd(0); bMenu = 0; bSelecting = 'none'; }
      }
    }
    return;
  }
  if (bPhase === 'end') {
    if (presses.includes('ok')) {
      bEndIdx += 1;
      if (bEndIdx >= bEndLines.length) exitBattle();
    }
    return;
  }
  // bPhase cmd
  const m = S.party[bCmdIdx];
  const aliveF = aliveFoeIdx();
  if (bTargetFoe >= B.foes.length || (B.foes[bTargetFoe] && B.foes[bTargetFoe].hp <= 0)) {
    bTargetFoe = aliveF[0] ?? 0;
  }
  for (const p of presses) {
    if (bSelecting === 'foe') {
      if (p === 'left' || p === 'up') { sfx.cursor(); bTargetFoe = (bTargetFoe - 1 + B.foes.length) % B.foes.length; if (B.foes[bTargetFoe].hp <= 0) bTargetFoe = aliveF[0] ?? 0; }
      else if (p === 'right' || p === 'down') { sfx.cursor(); bTargetFoe = (bTargetFoe + 1) % B.foes.length; if (B.foes[bTargetFoe].hp <= 0) bTargetFoe = aliveF[0] ?? 0; }
      else if (p === 'ok') {
        const base = bPlans.get(bCmdIdx) ?? { kind: 'fight' as const };
        bPlans.set(bCmdIdx, { ...base, targetFoe: bTargetFoe });
        sfx.confirm(); bSelecting = 'none'; advanceCmd();
      } else if (p === 'cancel') { bSelecting = 'none'; sfx.cursor(); }
      continue;
    }
    if (bSelecting === 'ally') {
      if (p === 'up' || p === 'left') { sfx.cursor(); bTargetAlly = (bTargetAlly - 1 + S.party.length) % S.party.length; }
      else if (p === 'down' || p === 'right') { sfx.cursor(); bTargetAlly = (bTargetAlly + 1) % S.party.length; }
      else if (p === 'ok') {
        const base = bPlans.get(bCmdIdx) ?? { kind: 'fight' as const };
        bPlans.set(bCmdIdx, { ...base, targetAlly: bTargetAlly });
        sfx.confirm(); bSelecting = 'none'; advanceCmd();
      } else if (p === 'cancel') { bSelecting = 'none'; sfx.cursor(); }
      continue;
    }
    if (bSub === -1) {
      if (p === 'up') { bMenu = (bMenu + 3) % 4; sfx.cursor(); }
      else if (p === 'down') { bMenu = (bMenu + 1) % 4; sfx.cursor(); }
      else if (p === 'cancel') { /* noop */ }
      else if (p === 'ok') {
        sfx.confirm();
        if (bMenu === 0) { bPlans.set(bCmdIdx, { kind: 'fight' }); bSelecting = 'foe'; }
        else if (bMenu === 1) { bSub = 0; bMagicCur = 0; }
        else if (bMenu === 2) { bSub = 1; bItemCur = 0; }
        else if (bMenu === 3) { bPlans.set(bCmdIdx, { kind: 'run' }); advanceCmd(); }
      }
    } else if (bSub === 0) {
      const list = m.magic;
      if (p === 'up') { bMagicCur = (bMagicCur - 1 + list.length) % list.length; sfx.cursor(); }
      else if (p === 'down') { bMagicCur = (bMagicCur + 1) % list.length; sfx.cursor(); }
      else if (p === 'cancel') { bSub = -1; sfx.cursor(); }
      else if (p === 'ok') {
        const mv = MOVES[list[bMagicCur]];
        sfx.confirm();
        if (mv.kind === 'heal') { bPlans.set(bCmdIdx, { kind: 'magic', magicId: mv.id }); bTargetAlly = 0; bSelecting = 'ally'; }
        else { bPlans.set(bCmdIdx, { kind: 'magic', magicId: mv.id }); bSelecting = 'foe'; }
      }
    } else if (bSub === 1) {
      if (p === 'up' || p === 'down') { bItemCur = 1 - bItemCur; sfx.cursor(); }
      else if (p === 'cancel') { bSub = -1; sfx.cursor(); }
      else if (p === 'ok') {
        sfx.confirm();
        bPlans.set(bCmdIdx, { kind: 'item', item: bItemCur === 0 ? 'potion' : 'ether' });
        bTargetAlly = 0; bSelecting = 'ally';
      }
    }
  }
}

function advanceCmd(): void {
  // find next party member needing a plan
  const order = alivePartyIdx();
  const curPos = order.indexOf(bCmdIdx);
  let next: number | null = null;
  for (let k = 1; k <= order.length; k++) {
    const cand = order[(curPos + k) % order.length];
    if (!bPlans.has(cand)) { next = cand; break; }
  }
  bSub = -1; bMenu = 0;
  if (next === null) {
    // all planned -> execute
    if (!B) return;
    bAnimLines = B.execRound(bPlans);
    S.potions = B.potions; S.ethers = B.ethers;
    bPlans = new Map();
    bPhase = 'anim'; bAnimIdx = 0; bAnimT = 0;
  } else {
    bCmdIdx = next;
  }
}

function enterBattleEnd(over: { victory?: boolean; fled?: boolean; wiped?: boolean }): void {
  bPhase = 'end'; bEndIdx = 0;
  if (over.fled) {
    bEndLines = ['Got away safely!'];
    S.stepsSinceBattle = -TILE * 4; // grace
  } else if (over.wiped) {
    sfx.lose();
    bEndLines = ['The party fell...', 'You wake in town. The healer frowns.', `(Lost half your gold.)`];
  } else {
    const { xp, goldWon, levelLogs } = B!.settleVictory();
    S.gold += goldWon;
    bEndLines = [`Victory! +${xp} EXP, +${goldWon}G.`, ...levelLogs];
    bLeveledUp = levelLogs.length > 0;
    if (bLeveledUp) setTimeout(() => sfx.heal(), 450);
    if (B!.isBoss) {
      S.flags.bossDone = true;
      bEndLines.push('The Golem King crumbles. EMBERFALL IS SAVED!');
    }
    saveGame(S);
  }
}

function exitBattle(): void {
  if (!B) { mode = 'overworld'; return; }
  const over = B.isOver();
  if (over.wiped) {
    // respawn
    S.party.forEach((pm) => { pm.hp = pm.maxHp; pm.mp = pm.maxMp; });
    S.gold = Math.floor(S.gold / 2);
    S.mapId = 'town'; S.px = 9 * TILE; S.py = 10 * TILE;
    saveGame(S);
  }
  B = null;
  mode = 'overworld';
  S.stepsSinceBattle = 0;
}

// ---------- draw ----------
function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#fff'): void {
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.font = '8px monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// Wrap a single line to fit maxW pixels (measured, not char-counted).
function wrapLine(text: string, maxW: number): string[] {
  ctx.font = '8px monospace';
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? cur + ' ' + w : w;
    if (ctx.measureText(trial).width <= maxW || !cur) {
      if (ctx.measureText(trial).width <= maxW) {
        cur = trial;
      } else {
        // single word longer than the box: hard-split it
        if (cur) { lines.push(cur); cur = ''; }
        let part = '';
        for (const ch of w) {
          if (part && ctx.measureText(part + ch).width > maxW) { lines.push(part); part = ch; }
          else part += ch;
        }
        cur = part;
      }
    } else {
      lines.push(cur);
      cur = w;
      // w itself may still be too wide
      while (ctx.measureText(cur).width > maxW && cur.length > 1) {
        let k = cur.length - 1;
        while (k > 1 && ctx.measureText(cur.slice(0, k)).width > maxW) k--;
        lines.push(cur.slice(0, k));
        cur = cur.slice(k);
      }
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function wrapLines(texts: string[], maxW: number): string[] {
  const out: string[] = [];
  for (const t of texts) out.push(...wrapLine(t, maxW));
  return out;
}

// Draw lines clipped to a window interior so text can never spill over borders.
function drawClipped(x: number, y: number, w: number, h: number, fn: () => void): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 4, y + 4, w - 8, h - 8);
  ctx.clip();
  fn();
  ctx.restore();
}

function drawTitle(): void {
  drawTitleBackdrop(ctx, time);
  // FF6-style gold logo with shadow + gradient feel
  ctx.textAlign = 'center';
  ctx.font = 'bold 28px monospace';
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillText('EMBERFALL', VW / 2 + 2, 46 + 2);
  const lg = ctx.createLinearGradient(0, 44, 0, 72);
  lg.addColorStop(0, '#fff7cc');
  lg.addColorStop(0.5, '#ffd76a');
  lg.addColorStop(1, '#b45309');
  ctx.fillStyle = lg;
  ctx.fillText('EMBERFALL', VW / 2, 46);
  ctx.font = '8px monospace';
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillText('an old-school turn RPG', VW / 2 + 1, 77 + 1);
  ctx.fillStyle = '#cdd3f0';
  ctx.fillText('an old-school turn RPG', VW / 2, 77);
  ctx.textAlign = 'left';
  // hero lineup
  drawHero(ctx, VW / 2 - 28, 96, '#3b82f6', 'down', false, time);
  drawHero(ctx, VW / 2 - 8, 96, '#f59e0b', 'down', false, time + 300);
  drawHero(ctx, VW / 2 + 12, 96, '#a855f7', 'down', false, time + 600);
  const mw = 180, mx0 = Math.round(VW / 2 - mw / 2);
  drawWindow(ctx, mx0, 152, mw, 60);
  drawText(ctx, 'ENTER: new game', mx0 + 12, 160);
  drawText(ctx, hasSave ? 'C: continue save' : 'no save yet', mx0 + 12, 172, hasSave ? '#fff' : '#8a8aa3');
  drawText(ctx, 'FF6-style battles + wilds', mx0 + 12, 184, '#ffd76a');
  if (Math.floor(time / 500) % 2 === 0) drawText(ctx, 'v press enter v', mx0 + 42, 196, '#fff');
}

function drawDialog(): void {
  drawOverworldScene();
  const dx = 12, dy = VH - 64, dw = VW - 24, dh = 56;
  drawWindow(ctx, dx, dy, dw, dh);
  const line = dlgLines[dlgIdx] ?? '';
  const maxW = dw - 16;
  const wrapped = wrapLine(line, maxW);
  // show last lines that fit (line height 10, top pad 8, bottom pad 8)
  const maxLines = Math.floor((dh - 16) / 10);
  const vis = wrapped.slice(-maxLines);
  drawClipped(dx, dy, dw, dh, () => {
    vis.forEach((row, i) => drawText(ctx, row, dx + 8, dy + 8 + i * 10));
  });
  if (Math.floor(time / 400) % 2 === 0) drawText(ctx, '[ENTER]', VW - 58, VH - 18, '#ffd76a');
}

function drawOverworldScene(): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VW, VH);
  drawWorld(ctx, S, time, MAPS[S.mapId].rows);
  // HUD
  drawWindow(ctx, 4, 4, 148, 30);
  const names: Record<string, string> = { town: 'Ember Town', field: 'Greenfield', dungeon: 'Stone Deep' };
  drawText(ctx, names[S.mapId], 10, 8, '#ffd76a');
  drawText(ctx, `G:${S.gold} Ptn:${S.potions} Q:status`, 10, 19);
  // party mini — FF-style LV + HP + EXP bar on its own panel
  const pw = 114, px0 = VW - pw - 4;
  drawWindow(ctx, px0, 4, pw, S.party.length * 12 + 10);
  S.party.forEach((m, i) => {
    const y = 6 + i * 12;
    drawText(ctx, `${m.name} Lv${m.level}`, px0 + 6, y - 2, m.hp === 0 ? '#666' : '#fff');
    drawText(ctx, `${m.hp}/${m.maxHp}`, px0 + 68, y - 2, m.hp === 0 ? '#f87171' : '#9ca3af');
    const need = xpNeedFor(m);
    const frac = Math.max(0, Math.min(1, m.xp / need));
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(px0 + 6, y + 7, 62, 3);
    ctx.fillStyle = '#3a3a55'; ctx.fillRect(px0 + 7, y + 7, 60, 2);
    ctx.fillStyle = '#ffd76a'; ctx.fillRect(px0 + 7, y + 7, 60 * frac, 2);
  });
  if (S.flags.bossDone) drawText(ctx, '* SAVED *', 10, VH - 14, '#4ade80');
}

function drawStatusScreen(): void {
  drawOverworldScene();
  // dim
  ctx.fillStyle = 'rgba(0,0,10,0.6)';
  ctx.fillRect(0, 0, VW, VH);
  const wx = 20, wy = 18, ww = VW - 40, wh = VH - 36;
  drawWindow(ctx, wx, wy, ww, wh);
  drawText(ctx, 'PARTY STATUS  (X/Q: close)', wx + 10, wy + 7, '#ffd76a');
  S.party.forEach((m, i) => {
    const y = wy + 20 + i * 50;
    if (y + 44 > wy + wh) return;
    const job = HEROES[m.id]?.job ?? '';
    drawHero(ctx, wx + 12, y, m.color, 'down', false, time + i * 300);
    drawText(ctx, `${m.name}  Lv${m.level} ${job}`, wx + 32, y, '#fff');
    const need = xpNeedFor(m);
    drawText(ctx, `EXP ${m.xp}/${need}  NEXT ${need - m.xp}`, wx + 32, y + 10, '#9ca3af');
    // exp bar (gold, FF-style)
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(wx + 32, y + 19, 120, 5);
    ctx.fillStyle = '#3a3a55'; ctx.fillRect(wx + 33, y + 20, 118, 3);
    ctx.fillStyle = '#ffd76a'; ctx.fillRect(wx + 33, y + 20, 118 * Math.max(0, Math.min(1, m.xp / need)), 3);
    // hp/mp bars
    drawText(ctx, `HP ${m.hp}/${m.maxHp}`, wx + 32, y + 27, m.hp === 0 ? '#f87171' : '#fff');
    ctx.fillStyle = '#3a0d0d'; ctx.fillRect(wx + 90, y + 28, 60, 3);
    ctx.fillStyle = '#4ade80'; ctx.fillRect(wx + 90, y + 28, 60 * (m.hp / m.maxHp), 3);
    drawText(ctx, `MP ${m.mp}/${m.maxMp}`, wx + 160, y + 27, '#fff');
    ctx.fillStyle = '#0d1a3a'; ctx.fillRect(wx + 208, y + 28, 44, 3);
    ctx.fillStyle = '#60a5fa'; ctx.fillRect(wx + 208, y + 28, 44 * (m.mp / m.maxMp), 3);
    drawText(ctx, `ATK${m.atk} DEF${m.def} SPD${m.spd}  ${m.magic.join('/')}`, wx + 32, y + 37, '#cbd5e1');
  });
  drawText(ctx, `Gold ${S.gold}G  Potions ${S.potions}  Ethers ${S.ethers}`, wx + 10, wy + wh - 14, '#cbd5e1');
}

function drawBattleScene(): void {
  if (!B) return;
  // FF6 terrain-aware backdrop
  drawBattleBackdrop(ctx, S.mapId, B.isBoss, time);
  // foes
  B.foes.forEach((f, i) => {
    const alive = f.hp > 0;
    const n = B!.foes.length;
    const bx = VW / 2 + 20 + (i - (n - 1) / 2) * 52 - 8;
    const by = 92 + (i % 2) * 10 + (f.big || f.id === 'boss' ? -14 : 0);
    const bobY = by + Math.sin(time / 350 + i * 1.7) * 1.5;
    if (!alive) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; }
    const selecting = bPhase === 'cmd' && bSelecting === 'foe' && bTargetFoe === i;
    // target flash ring
    if (selecting && Math.floor(time / 250) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,215,106,0.35)';
      ctx.fillRect(bx - 4, bobY - 4, 26, 26);
    }
    drawEnemy(ctx, f.id, bx, bobY, alive ? f.color : '#444', time, f.big);
    ctx.font = '8px monospace';
    const nw = ctx.measureText(f.name).width;
    const nx = Math.max(2, Math.min(VW - 2 - nw, bx + 8 - nw / 2));
    drawText(ctx, f.name, nx, bobY - 11, selecting ? '#ffd76a' : '#fff');
    // hp bar (FF6 framed)
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 5, bobY + 17, 26, 5);
    ctx.fillStyle = '#3a0d0d'; ctx.fillRect(bx - 4, bobY + 18, 24, 3);
    ctx.fillStyle = f.hp / f.maxHp > 0.3 ? '#4ade80' : '#ef4444';
    ctx.fillRect(bx - 4, bobY + 18, 24 * (f.hp / f.maxHp), 3);
    if (selecting && Math.floor(time / 250) % 2 === 0) drawText(ctx, 'v', bx + 4, bobY - 21, '#ffd76a');
  });
  // party lineup left
  S.party.forEach((m, i) => {
    const py = 112 + i * 18;
    const active = bPhase === 'cmd' && bCmdIdx === i;
    if (active && Math.floor(time / 300) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,215,106,0.22)';
      ctx.fillRect(12, py - 2, 22, 20);
    }
    drawHero(ctx, 18, py, m.hp > 0 ? m.color : '#444', 'right', active, time + i * 200);
    drawText(ctx, `${m.name} Lv${m.level}`, 38, py - 4, active ? '#ffd76a' : '#fff');
    drawText(ctx, `HP${m.hp}/${m.maxHp} MP${m.mp}/${m.maxMp}`, 38, py + 5, m.hp === 0 ? '#f87171' : '#9ca3af');
    // FF-style EXP bar under each battler
    const need = xpNeedFor(m);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(38, py + 14, 52, 3);
    ctx.fillStyle = '#3a3a55'; ctx.fillRect(39, py + 14, 50, 2);
    ctx.fillStyle = '#ffd76a'; ctx.fillRect(39, py + 14, 50 * Math.max(0, Math.min(1, m.xp / need)), 2);
    if (bPhase === 'cmd' && bSelecting === 'ally' && bTargetAlly === i && Math.floor(time / 250) % 2 === 0) {
      drawText(ctx, '>', 8, py + 4, '#ffd76a');
    }
  });
  // message / menu windows
  if (bPhase === 'intro') {
    const ix = 12, iy = VH - 64, iw = VW - 24, ih = 56;
    drawWindow(ctx, ix, iy, iw, ih);
    const wrapped = wrapLine(B.log[0] ?? '', iw - 16);
    const vis = wrapped.slice(0, Math.floor((ih - 16) / 10));
    drawClipped(ix, iy, iw, ih, () => {
      vis.forEach((l, i) => drawText(ctx, l, ix + 8, iy + 8 + i * 10));
    });
    drawText(ctx, '[ENTER]', VW - 58, VH - 20, '#ffd76a');
  } else if (bPhase === 'cmd') {
    const menuX = 12, menuY = VH - 68, menuW = 112, menuH = 60;
    const logX = menuX + menuW + 6, logY = VH - 68, logW = VW - logX - 12, logH = 60;
    drawWindow(ctx, menuX, menuY, menuW, menuH);
    const m = S.party[bCmdIdx];
    drawClipped(menuX, menuY, menuW, menuH, () => {
      if (bSub === -1) {
        drawText(ctx, `${m.name}: choose`, menuX + 8, menuY + 6, '#ffd76a');
        const opts = ['Fight', 'Magic', 'Item', 'Run'];
        opts.forEach((o, i) => drawText(ctx, `${bMenu === i ? '>' : ' '} ${o}`, menuX + 12, menuY + 16 + i * 9, bMenu === i ? '#fff' : '#9ca3af'));
      } else if (bSub === 0) {
        m.magic.forEach((id, i) => {
          const mv = MOVES[id];
          drawText(ctx, `${bMagicCur === i ? '>' : ' '} ${mv.name} ${mv.mp}mp`, menuX + 8, menuY + 6 + i * 9, m.mp >= mv.mp ? '#fff' : '#666');
        });
        drawText(ctx, 'X: back', menuX + 8, menuY + menuH - 14, '#9ca3af');
      } else if (bSub === 1) {
        drawText(ctx, `${bItemCur === 0 ? '>' : ' '} Potion x${S.potions}`, menuX + 8, menuY + 6);
        drawText(ctx, `${bItemCur === 1 ? '>' : ' '} Ether x${S.ethers}`, menuX + 8, menuY + 15);
        drawText(ctx, 'X: back', menuX + 8, menuY + menuH - 14, '#9ca3af');
      }
    });
    drawWindow(ctx, logX, logY, logW, logH);
    const maxLogW = logW - 16;
    const maxLogLines = Math.floor((logH - 12) / 10);
    const wrappedLog = wrapLines(B.log.slice(-3), maxLogW).slice(-maxLogLines);
    drawClipped(logX, logY, logW, logH, () => {
      wrappedLog.forEach((l, i) => drawText(ctx, l, logX + 8, logY + 6 + i * 10, '#cbd5e1'));
    });
  } else if (bPhase === 'anim') {
    const ax = 12, ay = VH - 64, aw = VW - 24, ah = 56;
    drawWindow(ctx, ax, ay, aw, ah);
    const wrapped = wrapLines(bAnimLines.slice(Math.max(0, bAnimIdx - 1), bAnimIdx + 1), aw - 16);
    const vis = wrapped.slice(-4);
    drawClipped(ax, ay, aw, ah, () => {
      vis.forEach((l, i) => drawText(ctx, l, ax + 8, ay + 8 + i * 10));
    });
  } else if (bPhase === 'end') {
    const ex = 12, ey = VH - 64, ew = VW - 24, eh = 56;
    // level-up flash banner, old-FF fanfare feel
    if (bLeveledUp && Math.floor(time / 300) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,215,106,0.25)';
      ctx.fillRect(ex, ey - 16, ew, 14);
      drawText(ctx, '** LEVEL UP! **', ex + 92, ey - 13, '#ffd76a');
    }
    drawWindow(ctx, ex, ey, ew, eh);
    // sliding window so long victory text never spills out
    const wrapped = wrapLines(bEndLines.slice(0, bEndIdx + 1), ew - 16);
    const vis = wrapped.slice(-3);
    drawClipped(ex, ey, ew, eh, () => {
      vis.forEach((l, i) => drawText(ctx, l, ex + 8, ey + 8 + i * 10));
    });
    drawText(ctx, '[ENTER]', VW - 58, VH - 20, '#ffd76a');
  }
}

// ---------- main loop ----------
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; time += dt * 1000;
  // Re-fit if window/DPR changed (resize, zoom, monitor move, fullscreen).
  const curDpr = Math.min(3, window.devicePixelRatio || 1);
  if (window.innerWidth !== fitW || window.innerHeight !== fitH || curDpr !== fitDpr) fit();
  // Draw in game units; backing store gives full-resolution text.
  ctx.setTransform(viewScale * viewDpr, 0, 0, viewScale * viewDpr, 0, 0);
  const presses = takePress();
  if (mode === 'title') {
    if (presses.includes('ok')) { S = initialState(); mode = 'overworld'; saveGame(S); hasSave = true; sfx.confirm(); }
    else if (presses.includes('c') && hasSave) { const l = loadGame(); if (l) S = l; mode = 'overworld'; sfx.confirm(); }
    drawTitle();
  } else if (mode === 'overworld') {
    updateOverworld(dt, presses);
    if (mode === 'overworld') drawOverworldScene();
    else if (mode === 'dialog') drawDialog();
    else if (mode === 'status') drawStatusScreen();
    else if (mode === 'battle') drawBattleScene();
  } else if (mode === 'status') {
    (S as unknown as { __moving: boolean }).__moving = false;
    updateStatus(presses);
    if (mode === 'status') drawStatusScreen(); else drawOverworldScene();
  } else if (mode === 'dialog') {
    (S as unknown as { __moving: boolean }).__moving = false;
    updateDialog(presses);
    if (mode === 'dialog') drawDialog(); else drawOverworldScene();
  } else if (mode === 'battle') {
    updateBattle(presses, dt);
    drawBattleScene();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
