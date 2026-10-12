import { HEROES, xpForLevel } from './data';

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

export function makeMember(heroId: string, level = 1): PartyMember {
  const d = HEROES[heroId];
  return {
    id: d.id, name: d.name, level, xp: 0,
    hp: d.maxHp, maxHp: d.maxHp, mp: d.maxMp, maxMp: d.maxMp,
    atk: d.atk, def: d.def, spd: d.spd, magic: [...d.magic], color: d.color,
  };
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
  m.xp += amount;
  while (m.xp >= xpForLevel(m.level)) {
    m.xp -= xpForLevel(m.level);
    m.level += 1;
    m.maxHp += 6; m.maxMp += 2; m.atk += 2; m.def += 1; m.spd += 1;
    m.hp = Math.min(m.maxHp, m.hp + Math.floor(m.maxHp / 2));
    m.mp = Math.min(m.maxMp, m.mp + 2);
    logs.push(`${m.name} grew to Lv${m.level}!`);
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
    return p;
  } catch { return null; }
}
