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

## ROADMAP — full task list to game completion

Work phases in order; each phase ends with: typecheck, browser-verify, commit, update CLAUDE.md + project memory, **git push** (remote: github.com/Ender22/Hoptron-5000; repo-local identity is the personal account — never change user.email here). "Done" definition for 1.0: the original game faithfully remade (minus arena mode, plus controller combat + spell loadout), deployed to a URL friends can open.

### Phase A — Debug tooling (DO FIRST next session — user requested)

- [ ] In-game debug panel, toggled with backquote (`) or ?debug URL param: buttons/keys for
  skip to level N, jump to this level's boss, spawn specific enemy by name, give 500 coins,
  give 30 stars, full heal, god mode toggle, kill all enemies, reset spell cooldowns,
  set game speed (0.25/0.5/1/2), show hitboxes overlay (sword segment, enemy radii, player rect).
- [ ] Keep/extend console hooks (`__gotoLevel(n)` 1-based, `__bossNow()`, `__equip(a,b)` exist).
- [ ] Trigger shopkeeper/chest segment on demand (once Phase D lands).

### Phase B — Bug fixes & enemy completeness

- [ ] Strawberry GroundPopper: visible pop-out-of-ground (spec: original GroundPopper.as, 304 lines).
- [ ] Watermelon muzzle: shots from gun part via `spriter.getPart` + toGlobal; use `type.projectileImage` (`Watermelon_Seed`) sprite from level atlas instead of code orbs. Generalize: every boss's `<image>` projectile.
- [ ] Shooter + Blaster enemies actually fire projectiles (currently fall back to Mover). Generic enemy-projectile system w/ atlas sprites.
- [ ] Exploder: fuse + explosion AoE on contact/death (original Exploder.as), not plain chase.
- [ ] Remaining AIs vs originals: Bouncer, Dropper, Spinner, Icecream (spawns scoop enemies), Fries (FryMissile), Stick (club swings), Spawner (spawns on death), MiddleSlammer, Candle/Note/HamburgerHeart (boss minions — may belong to Phase C bosses).
- [ ] Enemy facing/anim sanity pass across all 5 worlds (use __gotoLevel).

### Phase C — Boss fidelity (one or two bosses per work chunk; spec = com/characterclasses/Boss_*.as + planning/*.txt)

- [ ] Watermelon (366 ln), Durian (442, flying), Eggplant (383), Pumpkin (652, super-blast), Sundae (452, scoop projectiles), Cake (525, music notes), Noodles (534), Sushi (647), Hamburger (451, gravity pull), Combo (481, KO system).
- [ ] Burrito final boss (3,122 ln: multi-phase transformations watermelon→…→combo via final_scon entities, candles, swats, hearts).
- [ ] Magic Man fight = level 11 (1,465 ln: portals, beams, magicMan_Fight_scon + TA_Magicman-hd).
- [ ] Resolve final-world bossWarning ids 2/3 (likely burrito then magicman — read level 10/11 segment XML + LevelBase beginMMFight).
- [ ] Boss intro warning banner, boss death slow-mo/sequence, per-boss sounds (cake_roar, watermelon_jump etc. exist in fx/).

### Phase D — Run economy & shops

- [ ] Shopkeeper segments (shopkeeper_scon exists): pause wave, shop UI from `public/data/GameShop.xml` — armor tiers (absorb until break; original equipArmorTime), chi enhancers, dodge shoes (auto-dodge %), health/invince potion spawns, star packs, health carrot. Coins = currency.
- [ ] Reward chest segments (chest open + coin shower).
- [ ] Health/invincibility balloons + potions (original balloon mechanic).
- [ ] Post-level score screen (kills/score/AP tally; original gotoScoreScreen) + Awesomeness Points.
- [ ] Permanent AP meta-shop on title (ShopManager.as spec): sword dmg, max HP, slash upgrades, ninja star capacity, and SPELL UNLOCK/LEVELING (levels shorten cooldown / boost effect). Gate the 8 spells behind unlocks (currently all free) — store in SaveData.

### Phase E — Game feel & polish

- [ ] Fall attack (user's phase-2 feature): audition reverse `Attack_FromGtoA` in viewer; plunge = hold down + attack in air, x-damp, fast fall, AoE on land + shockwave.
- [ ] .pex particle player (34 original defs in assets/particles: per-enemy die_*, portal, explosions) replacing/augmenting code bursts; map enemy `deathPS` names to .pex.
- [ ] Combo meter + score multiplier (original comboBar/COMBO_FILLER), kill streak feel.
- [ ] Pause menu (Esc/Start when alive): resume/restart/title, music+sfx mute toggles persisted to save.
- [ ] Level title banners, 3-2-1 countdown (textures exist in assets/textures/countDown), loading tips (Loading.xml).
- [ ] Tuning pass with user: 30-apple opening swarm cap?, spell cooldowns, trail color verdict, dash trail VFX, hit sparks on enemy contact.

### Phase F — Story & meta content

- [ ] SCML XML parser (dikbot_scml.scml, ending_magicman.scml are old XML format; parser mirrors parseScon — original SpriterXML.as is the spec).
- [ ] Cutscene/dialogue system: port SceneManager.as reading assets/xml/Scenes.xml (Magic Man story beats between levels, talk icons + speech bubbles, scene mp3s in sounds/scenes/). Skippable.
- [ ] Intro sequence (introbunny/intro_magicman scons, intro narration) — skippable; ending + credits (Credits.xml, ending music).
- [ ] Achievements (assets/xml/Achievements.xml + toast UI; original AchievementHolder).
- [ ] Tutorial, simplified for keyboard/controller (TutorialXML.xml as inspiration).
- [ ] Boss Rush mode (BossModeSegments.xml + BossModeEnemies.xml + heart_scon HP display) — stretch goal.

### Phase G — Ship

- [ ] `vite build` production pass; asset preloading + loading screen; favicon from icons folders.
- [ ] Deploy to static host (Netlify / itch.io / GitHub Pages) — friends play via URL. Consider trimming unused assets from dist (full assets folder is ~55MB; sounds dominate).
- [ ] Final playtest/balance rounds with user; capture feedback in memory.
- [ ] Stretch: touch controls for phones; gamepad rumble; Steam-style polish.

### Dev hooks (console, current)

`__gotoLevel(n)` (1-based), `__bossNow()`, `__equip('akuma','time')`. Spells: freeze/ninjaRain/slash/growth/coin/magnet/time/akuma.

## Project memory

Long-form decision history lives in Claude's project memory (`hoptron-remake-decisions.md`); this file is the canonical continuation doc — keep BOTH updated at each milestone.
