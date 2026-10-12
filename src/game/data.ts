export const TILE = 16;

export type MapId = 'town' | 'field' | 'dungeon';

export interface MoveDef {
  id: string;
  name: string;
  mp: number;
  kind: 'dmg' | 'heal';
  power: number;
  desc: string;
}

export const MOVES: Record<string, MoveDef> = {
  fire: { id: 'fire', name: 'Fire', mp: 4, kind: 'dmg', power: 13, desc: 'Fire dmg' },
  bolt: { id: 'bolt', name: 'Bolt', mp: 6, kind: 'dmg', power: 18, desc: 'Lightning dmg' },
  heal: { id: 'heal', name: 'Heal', mp: 5, kind: 'heal', power: 20, desc: 'Restore HP' },
};

export interface HeroDef {
  id: string;
  name: string;
  job: string;
  maxHp: number;
  maxMp: number;
  atk: number;
  def: number;
  spd: number;
  magic: string[];
  color: string;
  /** per-level gains (old-FF job growth) */
  growth: { hp: number; mp: number; atk: number; def: number; spd: number };
  /** XP curve multiplier: <1 fast, >1 slow */
  xpNeed: number;
}

export const HEROES: Record<string, HeroDef> = {
  hero: { id: 'hero', name: 'Ash', job: 'Knight', maxHp: 30, maxMp: 10, atk: 7, def: 4, spd: 5, magic: ['fire', 'heal'], color: '#3b82f6', growth: { hp: 7, mp: 2, atk: 2, def: 1, spd: 1 }, xpNeed: 1.0 },
  mira: { id: 'mira', name: 'Mira', job: 'Mage', maxHp: 24, maxMp: 16, atk: 5, def: 3, spd: 8, magic: ['fire', 'heal'], color: '#f59e0b', growth: { hp: 5, mp: 4, atk: 1, def: 1, spd: 2 }, xpNeed: 0.9 },
  bram: { id: 'bram', name: 'Bram', job: 'Warrior', maxHp: 38, maxMp: 6, atk: 9, def: 6, spd: 3, magic: ['heal'], color: '#a855f7', growth: { hp: 9, mp: 1, atk: 3, def: 2, spd: 1 }, xpNeed: 1.15 },
};

/** Spells learned by level, FF-style. Checked on recruit + level-up. */
export const LEARNS: Record<string, Array<{ level: number; magicId: string }>> = {
  hero: [{ level: 4, magicId: 'bolt' }],
  mira: [{ level: 2, magicId: 'bolt' }],
  bram: [{ level: 3, magicId: 'fire' }, { level: 6, magicId: 'bolt' }],
};

export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  xp: number;
  gold: number;
  color: string;
  big?: boolean;
}

export const ENEMIES: Record<string, EnemyDef> = {
  slime: { id: 'slime', name: 'Slime', maxHp: 16, atk: 5, def: 1, spd: 3, xp: 8, gold: 5, color: '#4ade80' },
  bat: { id: 'bat', name: 'Cave Bat', maxHp: 14, atk: 6, def: 1, spd: 8, xp: 12, gold: 7, color: '#c084fc' },
  snake: { id: 'snake', name: 'Grass Snake', maxHp: 20, atk: 7, def: 2, spd: 6, xp: 15, gold: 9, color: '#facc15' },
  skeleton: { id: 'skeleton', name: 'Skeleton', maxHp: 28, atk: 9, def: 3, spd: 5, xp: 24, gold: 14, color: '#e5e7eb' },
  golem: { id: 'golem', name: 'Stone Golem', maxHp: 42, atk: 11, def: 5, spd: 2, xp: 38, gold: 24, color: '#9ca3af' },
  boss: { id: 'boss', name: 'Golem King', maxHp: 110, atk: 13, def: 5, spd: 4, xp: 140, gold: 120, color: '#ef4444', big: true },
};

export function xpForLevel(level: number, scale = 1): number {
  // Old-FF style rising curve: cost grows each level, scaled per job.
  return Math.floor((level * 24 + (level - 1) * (level - 1) * 6) * scale);
}

// ---- Hand-coded maps. Legend:
// # wall/tree (blocked)  . ground  , grass  " tall grass (encounters)
// ~ water (blocked)  D door  H heal crystal  B boss altar
// N/B/M spawn markers are entities, not tiles (kept as '.' below).

export const TOWN: string[] = [
  '####################',
  '#..................#',
  '#..##....H....##...#',
  '#..##.........##...#',
  '#..................#',
  '#.....##..##.......#',
  '#.....##..##.......#',
  '#..................#',
  '#..,,,,,,,,,,,,....#',
  '#..,,,,,,,,,,,,....#',
  '#..................#',
  '#....N.....M.......#',
  '#..................#',
  '#........D.........#',
  '####################',
];

export const FIELD: string[] = [
  '##############################',
  '#........D...................#',
  '#............................#',
  '#....""""".....~~~~~.........#',
  '#...."""""....~~~~~~~...""...#',
  '#....""""".....~~~~~...."""..#',
  '#............................#',
  '#.,,,,,,,..........""""""""..#',
  '#.,,,,,,,..........""""""""..#',
  '#.,,,,,,,....................#',
  '#.............##.............#',
  '#.............##........D....#',
  '#...."""".....##.............#',
  '#....""""....................#',
  '#....""""...,,,,,,.....~~....#',
  '#...........,,,,,,.....~~....#',
  '#...........,,,,,,...........#',
  '#......""""".................#',
  '#......""""".................#',
  '##############################',
];

export const DUNGEON: string[] = [
  '####################',
  '#........B.........#',
  '#..................#',
  '#..""""""""""""....#',
  '#..""""""""""""....#',
  '#..................#',
  '#....,,....,,......#',
  '#....,,....,,......#',
  '#..................#',
  '#..""""""""""""....#',
  '#..""""""""""""....#',
  '#..................#',
  '#.....R............#',
  '#D.................#',
  '####################',
];

export const MAPS: Record<MapId, { rows: string[]; encounterRate: number; table: string[]; palette: 'town' | 'field' | 'dungeon' }> = {
  town: { rows: TOWN, encounterRate: 0, table: [], palette: 'town' },
  field: { rows: FIELD, encounterRate: 0.09, table: ['slime', 'slime', 'bat', 'snake'], palette: 'field' },
  dungeon: { rows: DUNGEON, encounterRate: 0.13, table: ['bat', 'skeleton', 'skeleton', 'golem'], palette: 'dungeon' },
};

export function tileAt(mapId: MapId, tx: number, ty: number): string {
  const rows = MAPS[mapId].rows;
  if (ty < 0 || ty >= rows.length || tx < 0 || tx >= rows[0].length) return '#';
  return rows[ty][tx];
}

export function isBlocked(mapId: MapId, tx: number, ty: number): boolean {
  const t = tileAt(mapId, tx, ty);
  return t === '#' || t === '~';
}

// Pure combat math (unit-testable)
export function physDamage(atk: number, def: number, variance = 0): number {
  return Math.max(1, atk * 2 - def + variance);
}
export function magicDamage(power: number, variance = 0): number {
  return Math.max(1, power + variance);
}
