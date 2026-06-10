# Hoptron 5001 — Claude working notes

Browser remake of **Hoptron 5000 / SamuraiRobotBunny** (2015 Flash/AIR + Starling game by this user). TypeScript + PixiJS v8 + Vite + Howler. The user's friends should be able to play via a URL.

## Iron rules (user-set)

1. **Never port the old AS3 code structure** — it's beginner-quality (12,500-line LevelBase.as god class). The old code is a *behavior spec* only: read it for mechanics, constants, timings.
2. **NO new art assets, ever.** The user cannot generate sprites. All visuals = original assets + code/math (Graphics, tints, trails, particles). Reusing/retiming/reversing existing animations is fine.
3. **Reuse the original data as-is**: .scon animations, atlas XMLs, enemy/segment XMLs, mp3s, .pex. They're engine-agnostic and authoritative.
4. Combat is controller/keyboard (gamepad day one), physics tuned fast like Astral Ascent. Arena mode (dead web server) is never built. Magic powers = equip 2 of 8 on cooldowns (user decision; replaced bubble pickups + touch minigames).

## Locations

- **This repo**: `D:\Software\Hoptron 5001` (git, 8+ commits). Dev: `npm run dev` → http://localhost:5173 (game) and `/?viewer` (animation debug viewer: every character, scrub/speed/**reverse** toggle).
- **Original game source**: `D:\Dropbox\MyGames\SamuraiRobot2.0`
  - `LevelBase.as` (12.5k lines, all gameplay), `MGC.as` (global controller), `TitleMenu.as`
  - `com/characterclasses/Boss_*.as` — per-boss fight scripts (the spec for boss fidelity passes)
  - `com/acemobe/spriter/` — Spriter runtime our TS port mirrors (BrashMonkey reference impl)
  - `planning/*.txt|rtf` — design docs for boss fights, magic powers, store
  - `assets/xml/Scenes.xml` — full cutscene dialogue script; `xml/` — game design data (copied to `public/data/`)
- Typecheck: `npx tsc --noEmit`. No tests yet. Verify changes in the browser (claude-in-chrome) — JS-dispatch KeyboardEvents to drive the game; dev hooks below.

## Architecture (`src/`)

- `spriter/` — **the crown jewel**: `parseScon.ts` (SCON JSON → model), `playback.ts` (pure pose math, verbatim port), `SpriterPlayer.ts` (Pixi Container; playAnim w/ nextAnim chaining, callbacks, uninterruptable, reverse flag, sound triggers, `getPart(name)` for VFX/muzzle tracking).
- `assets/starlingAtlas.ts` — Starling XML atlas → Pixi textures (1:1 scale, no trim in practice).
- `viewer/` — animation viewer (manifest.ts maps every scon→atlas).
- `game/` — `Game.ts` (shell/orchestration, ~all wiring), `PlayerController.ts`, `Enemy.ts`, `Boss.ts`, `WaveManager.ts`, `Spells.ts`, `TitleScreen.ts`, `SaveData.ts`, `Input.ts` (kb+gamepad, buffering), `Audio.ts` (Howler singleton), `Juice.ts` (shake/hitstop/bursts/BossShots), `SwipeTrail.ts`, `Pickups.ts`, `NinjaStars.ts`, `data/levelData.ts` (XML parsers).

## Critical technical facts (hard-won — do not rediscover)

- **Spriter runtime semantics (must match, data authored against them)**: y NEGATED at parse; file names `.png`-stripped; sprite pivot defaults (0,1); Pixi `anchor = (pivot_x, 1 - pivot_y)`; `rotation = deg2rad(360 - angle)`; spin-aware angle lerp; instant/linear/quadratic/cubic curves; mainline INSTANT skips interpolation; bone chain via `unmapFromParent` (incl. negative-scale angle flip).
- SCON numbers can be strings — coerce everything. `looping:false` only when present.
- **Sword tracking**: `Bunny_Sword1` part, 153×17, pivot at hilt (right-center). Hilt = local (0,0), tip = local (−153, 0). Same `getPart` technique works for ANY part (e.g. watermelon's gun for muzzle position — see bugs).
- Bunny has NO point/box timelines (no authored markers) and NO downward attack anim (fall-attack = reverse `Attack_FromGtoA`, viewer has reverse toggle).
- **Level structure**: 11 adventure levels, TWO per food world (0-1 fruit, 2-3 veg, 4-5 dessert, 6-7 asian, 8-9 ffood, 10 final), from `initLevelGraphics` (LevelBase.as:1858). Level 11 = Magic Man fight (unbuilt). Music `track_0N` + `track_0N-2` variants per world pair.
- **Boss data**: `AdventureModeEnemies.xml` has per-category `<boss>` elements (id/scon/atlas/hp/aiType/`<image>` = projectile texture name e.g. `Watermelon_Seed` in the level atlas). Segments mark boss spawn with `<bossWarning> id </bossWarning>` (per-category id; final world uses 2 AND 3 — unresolved, likely burrito + magicman).
- Scales: bunny 0.375, enemies/bosses 0.55 (`MovableObject.SCALE`), magic man 0.6. Enemy gravity 0.5, bunny 0.85→retuned. Ground y=325, walls 40/760, stage 800×480 fixed 60Hz (per-frame constants depend on 60Hz — keep the fixed timestep).
- Enemy anims are uniformly `idle/move/hurt/die`. Boss extras: spawn/shoot1/shoot2/attack1/jump/crush etc.
- Sounds: no `getCoin`/`throwStar` files — use `pickup_coin_silver/gold`; throw uses `swipe1_02` quiet. Music incl. `menu_title`, `bosstrack_01/02`, `afterboss`.
- **Async level-switch race**: always set `wave = null` BEFORE tearing down enemies (ticker crash otherwise). `loadLevel` guards stale loads via `levelIndex !== n`.
- PowerShell `Set-Content` mangles unicode (em-dashes) in source files — avoid regex-replace over files with special chars, or use ASCII.

## Feel tuning (user-approved current values)

In `PlayerController.ts`, originals in comments: gravity 0.68 (orig 0.8), jump −12, jump-cut ×0.45 on release, accel 1.3 (0.7), combo playback speeds 1.35/1.4/1.85/1.4 with chainTime = orig/speed, impulses 4.5/4/2.5/3.5 (orig 8/7/4/6 — user said too pushy), air-attack gravity ×0.3 + fall cap 2.5 (user wants air combos), dash 19 for 0.16s cd 0.32 w/ i-frames, coyote 0.08, buffers ~0.12–0.3. Dash cancels attacks anytime; jump cancels after 55% of stage. Trail: neon blue glow 0x2f5cff core 0xcfe2ff, brightness ∝ tip speed. Hitstop 0.05–0.06, shake 2.5–12.

## Status: WORKS end-to-end

Title (level select + pick-2-of-8 spell loadout, localStorage saves) → 11 levels of XML-driven waves → bosses w/ HP bar + music → loot/stars/spells/audio → death/retry/clear/saves. All verified in browser.

### Known bugs (user playtest 2026-06-10)

1. **Strawberry (GroundPopper) spawn looks wrong** — should visibly pop out of the ground. Current `aiGroundPopper` hides then unhides; check spawn y / "from_ground" position and the original GroundPopper.as (304 lines) for the burrow/emerge sequence + dirt effect.
2. **Watermelon shots don't come from his gun tip** — currently fired from a fixed body offset. Fix: `boss.spriter.getPart('<gun part name>')` + toGlobal, like the sword trail. Check fruit atlas for the gun part texture name (grep `TA`/atlas XML for "gun"/"Watermelon"). Also use `type.projectileImage` (`Watermelon_Seed`) as the projectile sprite instead of code orbs.

### Priority TODO (rough order)

1. Bug fixes above; Shooter/Blaster enemies actually shooting (currently fall back to Mover); Exploder explosion on contact.
2. Boss fidelity passes — port patterns from `Boss_*.as` + `planning/` docs (watermelon first).
3. Shopkeeper segments + in-run GameShop (`GameShop.xml`), chests; AP meta-shop (`ShopManager.as` spec) for sword/HP/spell upgrades.
4. Remaining enemy AIs: Bouncer/Dropper/Spinner/Icecream/Fries/Stick/Spawner.
5. Level 11 Magic Man fight; final-world bossWarning 2/3 mapping.
6. Pause menu, mute toggle, fall-attack (reverse GtoA — audition in viewer first), .pex particle player, cutscenes (Scenes.xml), achievements, deploy to static host (Netlify/itch) for friends.
7. Tuning watchpoints: 30-apple opening swarm is real data but maybe cap; spell cooldown balance; trail color (awaiting user verdict).

### Dev hooks (console)

`__gotoLevel(n)` (1-based), `__bossNow()`, `__equip('akuma','time')`. Spells: freeze/ninjaRain/slash/growth/coin/magnet/time/akuma.

## Project memory

Long-form decision history lives in Claude's project memory (`hoptron-remake-decisions.md`); this file is the canonical continuation doc — keep BOTH updated at each milestone.
