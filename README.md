# Emberfall — old-school turn-based RPG

TypeScript + Vite + Canvas 2D. No engine, no assets (all pixel art drawn procedurally).

## Run

```sh
cd old-school-rpg
npm install
npm run dev
```

## Game

- **Ember Town** → talk to Mira to recruit, healer/crystal to heal, south door to Greenfield.
- **Greenfield** → random encounters in tall grass (`"` tiles). East door to Stone Deep dungeon.
- **Stone Deep** → Bram joins, boss altar (Golem King + guard) to the north.
- FF-style round-based battles: Fight / Magic / Item / Run, speed-ordered, target select, XP/levels, gold, potions/ethers.
- Wipe = wake in town at half gold. `K` saves to localStorage; `C` on title continues.

## Controls

Arrows/WASD move · Enter/Z confirm · X back · K save.
