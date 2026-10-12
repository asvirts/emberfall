import { ENEMIES, MOVES, physDamage, magicDamage } from './data';
import { grantXp, type PartyMember } from './state';
import { sfx } from './audio';

export interface Foe {
  uid: number;
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  xp: number;
  gold: number;
  color: string;
  big: boolean;
}

let uidc = 1;
export function makeFoes(ids: string[]): Foe[] {
  return ids.map((id) => {
    const d = ENEMIES[id];
    return {
      uid: uidc++, id: d.id, name: d.name, hp: d.maxHp, maxHp: d.maxHp,
      atk: d.atk, def: d.def, spd: d.spd, xp: d.xp, gold: d.gold,
      color: d.color, big: !!d.big,
    };
  });
}

export type CmdKind = 'fight' | 'magic' | 'item' | 'run';
export interface PlannedCmd { kind: CmdKind; magicId?: string; item?: 'potion' | 'ether'; targetFoe?: number; targetAlly?: number; }

export interface BattleResult {
  done: boolean;
  victory?: boolean;
  fled?: boolean;
  wiped?: boolean;
}

export class Battle {
  party: PartyMember[];
  foes: Foe[];
  isBoss: boolean;
  log: string[] = [];
  queue: Array<{ side: 'party' | 'foe'; idx: number; spd: number }> = [];
  round = 1;
  gold: number;
  potions: number;
  ethers: number;

  constructor(party: PartyMember[], foeIds: string[], isBoss: boolean, gold: number, potions: number, ethers: number) {
    this.party = party;
    this.foes = makeFoes(foeIds);
    this.isBoss = isBoss;
    this.gold = gold; this.potions = potions; this.ethers = ethers;
    this.log.push(isBoss ? `The ${this.foes[0].name} blocks the way!` : `Wild ${this.foes.map((f) => f.name).join(', ')} appeared!`);
  }

  aliveParty(): number[] {
    return this.party.map((m, i) => (m.hp > 0 ? i : -1)).filter((i) => i >= 0);
  }
  aliveFoes(): number[] {
    return this.foes.map((f, i) => (f.hp > 0 ? i : -1)).filter((i) => i >= 0);
  }

  buildQueue(): void {
    const q: typeof this.queue = [];
    this.aliveParty().forEach((i) => q.push({ side: 'party', idx: i, spd: this.party[i].spd + Math.random() * 2 }));
    this.aliveFoes().forEach((i) => q.push({ side: 'foe', idx: i, spd: this.foes[i].spd + Math.random() * 2 }));
    q.sort((a, b) => b.spd - a.spd);
    this.queue = q;
  }

  /** Execute one full round given player plans (map partyIdx -> cmd). Returns logs + end state. */
  execRound(plans: Map<number, PlannedCmd>): string[] {
    const out: string[] = [];
    this.buildQueue();
    // Run attempt handled before queue: if first actor tries run, resolve immediately
    for (const turn of this.queue) {
      if (this.aliveFoes().length === 0 || this.aliveParty().length === 0) break;
      if (turn.side === 'party') {
        const m = this.party[turn.idx];
        if (m.hp <= 0) continue;
        const p = plans.get(turn.idx) ?? { kind: 'fight' as CmdKind, targetFoe: this.aliveFoes()[0] };
        out.push(...this.execPartyCmd(turn.idx, p));
      } else {
        out.push(...this.execFoe(turn.idx));
      }
    }
    this.round += 1;
    this.log.push(...out);
    return out;
  }

  private pickFoe(explicit?: number): number {
    const alive = this.aliveFoes();
    if (explicit !== undefined && this.foes[explicit] && this.foes[explicit].hp > 0) return explicit;
    return alive[Math.floor(Math.random() * alive.length)] ?? -1;
  }

  private pickAlly(explicit?: number): number {
    const alive = this.aliveParty();
    if (explicit !== undefined && this.party[explicit] && this.party[explicit].hp > 0) return explicit;
    // weakest ally
    let bi = alive[0]; let bh = Infinity;
    for (const i of alive) if (this.party[i].hp < bh) { bh = this.party[i].hp; bi = i; }
    return bi ?? -1;
  }

  private execPartyCmd(pi: number, p: PlannedCmd): string[] {
    const out: string[] = [];
    const m = this.party[pi];
    if (p.kind === 'run') {
      const chance = this.isBoss ? 0 : 0.55 + (m.spd - 5) * 0.05;
      if (Math.random() < chance) {
        out.push(`${m.name} fled successfully!`);
        sfx.win();
        (this as unknown as { _fled: boolean })._fled = true;
      } else out.push(`${m.name} couldn't escape!`);
      return out;
    }
    if (p.kind === 'item') {
      if (p.item === 'potion') {
        if (this.potions <= 0) { out.push('No potions left!'); return this.execPartyCmd(pi, { kind: 'fight', targetFoe: this.pickFoe() }); }
        this.potions -= 1;
        const t = this.pickAlly(p.targetAlly);
        const amt = 22 + Math.floor(Math.random() * 6);
        this.party[t].hp = Math.min(this.party[t].maxHp, this.party[t].hp + amt);
        out.push(`${m.name} used Potion on ${this.party[t].name} (+${amt})!`);
        sfx.heal();
        return out;
      } else {
        if (this.ethers <= 0) { out.push('No ethers left!'); return this.execPartyCmd(pi, { kind: 'fight', targetFoe: this.pickFoe() }); }
        this.ethers -= 1;
        const t = this.pickAlly(p.targetAlly);
        this.party[t].mp = Math.min(this.party[t].maxMp, this.party[t].mp + 12);
        out.push(`${m.name} used Ether on ${this.party[t].name}!`);
        sfx.heal();
        return out;
      }
    }
    if (p.kind === 'magic') {
      const mv = MOVES[p.magicId ?? 'fire'];
      if (!mv || m.mp < mv.mp) {
        out.push(`${m.name} lacks MP — attacks instead!`);
        return this.execPartyCmd(pi, { kind: 'fight', targetFoe: this.pickFoe(p.targetFoe) });
      }
      m.mp -= mv.mp;
      sfx.magic();
      if (mv.kind === 'heal') {
        const t = this.pickAlly(p.targetAlly);
        const amt = magicDamage(mv.power, Math.floor(Math.random() * 5 - 2));
        this.party[t].hp = Math.min(this.party[t].maxHp, this.party[t].hp + amt);
        out.push(`${m.name} casts ${mv.name} on ${this.party[t].name} (+${amt})!`);
      } else {
        const fi = this.pickFoe(p.targetFoe);
        if (fi < 0) return out;
        const dmg = magicDamage(mv.power + Math.floor(m.atk / 2), Math.floor(Math.random() * 5 - 2));
        this.foes[fi].hp = Math.max(0, this.foes[fi].hp - dmg);
        out.push(`${m.name} casts ${mv.name} on ${this.foes[fi].name} (${dmg})!`);
        if (this.foes[fi].hp === 0) out.push(`${this.foes[fi].name} fell!`);
      }
      return out;
    }
    // fight
    const fi = this.pickFoe(p.targetFoe);
    if (fi < 0) return out;
    const dmg = physDamage(m.atk, this.foes[fi].def, Math.floor(Math.random() * 5 - 2));
    this.foes[fi].hp = Math.max(0, this.foes[fi].hp - dmg);
    sfx.hit();
    out.push(`${m.name} attacks ${this.foes[fi].name} (${dmg})!`);
    if (this.foes[fi].hp === 0) out.push(`${this.foes[fi].name} fell!`);
    return out;
  }

  private execFoe(fi: number): string[] {
    const out: string[] = [];
    const f = this.foes[fi];
    if (f.hp <= 0) return out;
    const alive = this.aliveParty();
    const t = alive[Math.floor(Math.random() * alive.length)];
    if (t === undefined) return out;
    const m = this.party[t];
    const dmg = physDamage(f.atk, m.def, Math.floor(Math.random() * 5 - 2));
    m.hp = Math.max(0, m.hp - dmg);
    out.push(`${f.name} hits ${m.name} (${dmg})!`);
    if (m.hp === 0) out.push(`${m.name} is down!`);
    return out;
  }

  get fled(): boolean {
    return (this as unknown as { _fled?: boolean })._fled === true;
  }

  isOver(): BattleResult {
    if (this.fled) return { done: true, fled: true };
    if (this.aliveFoes().length === 0) return { done: true, victory: true };
    if (this.aliveParty().length === 0) return { done: true, wiped: true };
    return { done: false };
  }

  settleVictory(): { xp: number; goldWon: number; levelLogs: string[] } {
    // xp/gold from foes as spawned (use initial defs via current foes' stored rewards)
    let xp = 0; let goldWon = 0;
    for (const f of this.foes) { xp += f.xp; goldWon += f.gold; }
    const levelLogs: string[] = [];
    // split xp evenly? FF-style: each alive + half to downed? Keep simple: full xp to each alive.
    for (const i of this.aliveParty()) levelLogs.push(...grantXp(this.party[i], xp));
    sfx.win();
    return { xp, goldWon, levelLogs };
  }
}
