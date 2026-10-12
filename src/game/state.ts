import { HEROES, LEARNS, xpForLevel } from './data';

export interface PartyMember {
  id: string;
  name: string;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  atk: number;
  def: number;
  spd: number;
  magic: string[];
  color: string;
}

export interface GameFlags {
  recruitedMira: boolean;
  recruitedBram: boolean;
  bossDone: boolean;
  metHealer: boolean;
}

export interface GameState {
  mapId: 'town' | 'field' | 'dungeon';
  px: number; // pixel coords (top-left of sprite box)
  py: number;
  dir: 'down' | 'up' | 'left' | 'right';
  party: PartyMember[];
  gold: number;
  potions: number;
  ethers: number;
  flags: GameFlags;
  stepsSinceBattle: number;
}

/** XP still needed for this member's next level (FF-style NEXT). */
export function xpNeedFor(m: PartyMember): number {
  const scale = HEROES[m.id]?.xpNeed ?? 1;
  return xpForLevel(m.level, scale);
}

function applyLearns(m: PartyMember): string[] {
  const logs: string[] = [];
  const table = LEARNS[m.id] ?? [];
  for (const l of table) {
    if (m.level >= l.level && !m.magic.includes(l.magicId)) {
      m.magic.push(l.magicId);
      logs.push(`${m.name} learned ${l.magicId === 'bolt' ? 'Bolt' : l.magicId === 'fire' ? 'Fire' : 'Heal'}!`);
    }
  }
  return logs;
}

export function makeMember(heroId: string, level = 1): PartyMember {
  const d = HEROES[heroId];
  const m: PartyMember = {
    id: d.id, name: d.name, level: 1, xp: 0,
    hp: d.maxHp, maxHp: d.maxHp, mp: d.maxMp, maxMp: d.maxMp,
    atk: d.atk, def: d.def, spd: d.spd, magic: [...d.magic], color: d.color,
  };
  // FF-style: recruits join at party level with earned growth applied.
  while (m.level < level) {
    m.level += 1;
    m.maxHp += d.growth.hp; m.maxMp += d.growth.mp;
    m.atk += d.growth.atk; m.def += d.growth.def; m.spd += d.growth.spd;
  }
  m.hp = m.maxHp; m.mp = m.maxMp;
  applyLearns(m);
  return m;
}

export function initialState(): GameState {
  return {
    mapId: 'town',
    px: 9 * 16, py: 10 * 16,
    dir: 'down',
    party: [makeMember('hero')],
    gold: 12, potions: 3, ethers: 1,
    flags: { recruitedMira: false, recruitedBram: false, bossDone: false, metHealer: false },
    stepsSinceBattle: 0,
  };
}

export function grantXp(m: PartyMember, amount: number): string[] {
  const logs: string[] = [];
  const def = HEROES[m.id];
  const g = def?.growth ?? { hp: 6, mp: 2, atk: 2, def: 1, spd: 1 };
  const scale = def?.xpNeed ?? 1;
  m.xp += amount;
  while (m.xp >= xpForLevel(m.level, scale)) {
    m.xp -= xpForLevel(m.level, scale);
    m.level += 1;
    m.maxHp += g.hp; m.maxMp += g.mp; m.atk += g.atk; m.def += g.def; m.spd += g.spd;
    m.hp = Math.min(m.maxHp, m.hp + Math.floor(m.maxHp / 2));
    m.mp = Math.min(m.maxMp, m.mp + 2);
    logs.push(`${m.name} grew to Lv${m.level}!`);
    logs.push(` HP+${g.hp} MP+${g.mp} ATK+${g.atk} DEF+${g.def} SPD+${g.spd}`);
    logs.push(...applyLearns(m));
  }
  return logs;
}

const KEY = 'emberfall-save-v1';

export function saveGame(s: GameState): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as GameState;
    if (!p.party || !p.mapId) return null;
    // migrate old saves missing xp / new fields
    for (const m of p.party) {
      if (typeof m.xp !== 'number') m.xp = 0;
      if (!HEROES[m.id]) continue;
      // backfill spells they would have learned by now
      const table = LEARNS[m.id] ?? [];
      for (const l of table) {
        if (m.level >= l.level && !m.magic.includes(l.magicId)) m.magic.push(l.magicId);
      }
    }
    return p;
  } catch { return null; }
}
