import './style.css';
import { TILE, MAPS, tileAt, isBlocked, MOVES } from './game/data';
import { initialState, makeMember, saveGame, loadGame, type GameState } from './game/state';
import { drawWindow, drawEnemy, drawHero, drawWorld, VW, VH } from './game/render';
import { Battle, type PlannedCmd } from './game/battle';
import { sfx } from './game/audio';

// ---------- setup ----------
document.querySelector('#app')!.innerHTML = `
  <div id="wrap"><canvas id="cv" width="${VW}" height="${VH}"></canvas>
  <button id="fs-btn" title="Toggle fullscreen (F)">&#x26F6; Fullscreen</button>
  <div id="hint"><b>Arrows/WASD</b> move &nbsp; <b>Enter/Z</b> talk/confirm &nbsp; <b>X</b> back &nbsp; <b>K</b> save &nbsp; <b>F</b> fullscreen<br>
  Find <b>Mira</b> in town, <b>Bram</b> in the east dungeon, beat the <b>Golem King</b>.</div></div>`;
const cv = document.querySelector<HTMLCanvasElement>('#cv')!;
const ctx = cv.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

function toggleFullscreen(): void {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}
document.querySelector('#fs-btn')!.addEventListener('click', toggleFullscreen);

let S: GameState = initialState();
type Mode = 'title' | 'overworld' | 'dialog' | 'battle';
let mode: Mode = 'title';
let hasSave = loadGame() !== null;

// ---------- input ----------
const held = new Set<string>();
const pressed: string[] = [];
function norm(e: KeyboardEvent): string {
  const k = e.key.toLowerCase();
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
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
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

function startBattle(foeIds: string[], isBoss: boolean): void {
  B = new Battle(S.party, foeIds, isBoss, S.gold, S.potions, S.ethers);
  bPhase = 'intro'; bCmdIdx = 0; bMenu = 0; bSub = -1; bMagicCur = 0; bItemCur = 0;
  bTargetFoe = 0; bTargetAlly = 0; bSelecting = 'none';
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
    else if (p === 'up' || p === 'down' || p === 'left' || p === 'right') {
      S.dir = p as typeof S.dir;
    }
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
    bEndLines = [`Victory! +${xp} XP, +${goldWon}G.`, ...levelLogs];
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
  ctx.fillStyle = color;
  ctx.font = '8px monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y);
}

function drawTitle(): void {
  ctx.fillStyle = '#0b0b14';
  ctx.fillRect(0, 0, VW, VH);
  drawText(ctx, 'EMBERFALL', 120, 70, '#ffd76a');
  ctx.font = '8px monospace';
  drawText(ctx, 'an old-school turn RPG', 92, 84, '#9ca3af');
  drawHero(ctx, VW / 2 - 8, 110, '#3b82f6', 'down', false, time);
  drawWindow(ctx, 70, 160, 180, 52);
  drawText(ctx, 'ENTER: new game', 82, 168);
  drawText(ctx, hasSave ? 'C: continue save' : 'no save yet', 82, 180);
  drawText(ctx, 'FF-style battles + random', 82, 192, '#ffd76a');
}

function drawDialog(): void {
  drawOverworldScene();
  drawWindow(ctx, 12, VH - 64, VW - 24, 56);
  const line = dlgLines[dlgIdx] ?? '';
  // wrap crudely
  const words = line.split(' ');
  let row = '';
  let y = VH - 56;
  for (const w of words) {
    if ((row + ' ' + w).length > 42) { drawText(ctx, row, 20, y); y += 10; row = w; }
    else row = row ? row + ' ' + w : w;
  }
  drawText(ctx, row, 20, y);
  if (Math.floor(time / 400) % 2 === 0) drawText(ctx, '[ENTER]', VW - 58, VH - 18, '#ffd76a');
}

function drawOverworldScene(): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VW, VH);
  drawWorld(ctx, S, time, MAPS[S.mapId].rows);
  // HUD
  drawWindow(ctx, 4, 4, 132, 30);
  const names: Record<string, string> = { town: 'Ember Town', field: 'Greenfield', dungeon: 'Stone Deep' };
  drawText(ctx, names[S.mapId], 10, 8, '#ffd76a');
  drawText(ctx, `G:${S.gold} Ptn:${S.potions}`, 10, 19);
  // party mini
  S.party.forEach((m, i) => {
    drawText(ctx, `${m.name} ${m.hp}/${m.maxHp}`, VW - 92, 6 + i * 10, m.hp === 0 ? '#666' : '#fff');
  });
  if (S.flags.bossDone) drawText(ctx, '* SAVED *', 10, VH - 14, '#4ade80');
}

function drawBattleScene(): void {
  if (!B) return;
  // bg
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, B.isBoss ? '#3f1d24' : '#14261a');
  g.addColorStop(1, '#0b0b14');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 5; i++) ctx.fillRect(0, 30 + i * 12, VW, 1);
  // foes
  B.foes.forEach((f, i) => {
    const alive = f.hp > 0;
    const n = B!.foes.length;
    const bx = VW / 2 + (i - (n - 1) / 2) * 56 - 8;
    const by = 56 + (i % 2) * 8;
    if (!alive) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; }
    const selecting = bPhase === 'cmd' && bSelecting === 'foe' && bTargetFoe === i;
    drawEnemy(ctx, f.id, bx, by, alive ? f.color : '#444', time, f.big);
    drawText(ctx, f.name, bx - 8, by - 10, selecting ? '#ffd76a' : '#fff');
    // hp bar
    ctx.fillStyle = '#333'; ctx.fillRect(bx - 4, by + 18, 24, 3);
    ctx.fillStyle = '#4ade80'; ctx.fillRect(bx - 4, by + 18, 24 * (f.hp / f.maxHp), 3);
    if (selecting && Math.floor(time / 250) % 2 === 0) drawText(ctx, 'v', bx + 4, by - 20, '#ffd76a');
  });
  // party lineup left
  S.party.forEach((m, i) => {
    const py = 120 + i * 18;
    const active = bPhase === 'cmd' && bCmdIdx === i;
    drawHero(ctx, 18, py, m.hp > 0 ? m.color : '#444', 'right', active, time + i * 200);
    drawText(ctx, `${m.name} L${m.level}`, 38, py + 1, active ? '#ffd76a' : '#fff');
    drawText(ctx, `HP${m.hp}/${m.maxHp} MP${m.mp}/${m.maxMp}`, 38, py + 10, m.hp === 0 ? '#f87171' : '#9ca3af');
    if (bPhase === 'cmd' && bSelecting === 'ally' && bTargetAlly === i && Math.floor(time / 250) % 2 === 0) {
      drawText(ctx, '>', 8, py + 4, '#ffd76a');
    }
  });
  // message / menu windows
  if (bPhase === 'intro') {
    drawWindow(ctx, 12, VH - 64, VW - 24, 56);
    drawText(ctx, B.log[0] ?? '', 20, VH - 52);
    drawText(ctx, '[ENTER]', VW - 58, VH - 20, '#ffd76a');
  } else if (bPhase === 'cmd') {
    drawWindow(ctx, 12, VH - 64, 180, 56);
    const m = S.party[bCmdIdx];
    drawText(ctx, `${m.name}: choose`, 20, VH - 56, '#ffd76a');
    if (bSub === -1) {
      const opts = ['Fight', 'Magic', 'Item', 'Run'];
      opts.forEach((o, i) => drawText(ctx, `${bMenu === i ? '>' : ' '} ${o}`, 24, VH - 44 + i * 10, bMenu === i ? '#fff' : '#9ca3af'));
    } else if (bSub === 0) {
      m.magic.forEach((id, i) => {
        const mv = MOVES[id];
        drawText(ctx, `${bMagicCur === i ? '>' : ' '} ${mv.name} ${mv.mp}mp`, 24, VH - 44 + i * 10, m.mp >= mv.mp ? '#fff' : '#666');
      });
      drawText(ctx, 'X: back', 120, VH - 20, '#9ca3af');
    } else if (bSub === 1) {
      drawText(ctx, `${bItemCur === 0 ? '>' : ' '} Potion x${S.potions}`, 24, VH - 44);
      drawText(ctx, `${bItemCur === 1 ? '>' : ' '} Ether x${S.ethers}`, 24, VH - 34);
      drawText(ctx, 'X: back', 120, VH - 20, '#9ca3af');
    }
    drawWindow(ctx, 198, VH - 64, VW - 210, 56);
    const last = B.log.slice(-3);
    last.forEach((l, i) => drawText(ctx, l.slice(0, 30), 206, VH - 56 + i * 10, '#cbd5e1'));
  } else if (bPhase === 'anim') {
    drawWindow(ctx, 12, VH - 64, VW - 24, 56);
    const upto = bAnimLines.slice(Math.max(0, bAnimIdx - 2), bAnimIdx + 1);
    upto.forEach((l, i) => drawText(ctx, l.slice(0, 44), 20, VH - 56 + i * 10));
  } else if (bPhase === 'end') {
    drawWindow(ctx, 12, VH - 64, VW - 24, 56);
    const upto = bEndLines.slice(0, bEndIdx + 1);
    upto.forEach((l, i) => drawText(ctx, l.slice(0, 44), 20, VH - 56 + i * 10));
    drawText(ctx, '[ENTER]', VW - 58, VH - 20, '#ffd76a');
  }
}

// ---------- main loop ----------
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; time += dt * 1000;
  const presses = takePress();
  if (mode === 'title') {
    if (presses.includes('ok')) { S = initialState(); mode = 'overworld'; saveGame(S); hasSave = true; sfx.confirm(); }
    else if (presses.includes('c') && hasSave) { const l = loadGame(); if (l) S = l; mode = 'overworld'; sfx.confirm(); }
    drawTitle();
  } else if (mode === 'overworld') {
    updateOverworld(dt, presses);
    if (mode === 'overworld') drawOverworldScene();
    else if (mode === 'dialog') drawDialog();
    else if (mode === 'battle') drawBattleScene();
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
