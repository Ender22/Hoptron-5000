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

## How to mine the original code (methodology for any new feature)

1. **Find the spec**: use the Feature → Spec map below; for broad/unknown questions, spawn an Explore subagent (sonnet) over `D:\Dropbox\MyGames\SamuraiRobot2.0` instead of reading big files into main context.
2. **Extract behavior, not structure**: constants, timings, anim names + chaining, state conditions, XML field usage. Re-architect cleanly in TS.
3. **Verify visually** in the browser against expectations (and the animation viewer for anything animation-related).

### Feature → Spec map

| Feature | Original spec |
|---|---|
| Any boss fight | `com/characterclasses/Boss_<Name>.as` + `planning/*.txt` fight docs + per-boss fx sounds |
| Enemy AI archetype | `com/characterclasses/<AIType>.as` (Mover/Bouncer/Shooter/... names match XML aiType) |
| In-run shop / shopkeeper | `com/menuclasses/InGameShopManager.as` + `public/data/GameShop.xml` + LevelBase initGameShop:2157 |
| AP meta-shop | `com/menuclasses/ShopManager.as` (595 ln) + ShopScreen.as |
| Spell/magic behaviors | LevelBase magic functions ~9240–9880 (init_magic_*, magic_*) + `com/gameclasses/MagicPowerGame.as` |
| Cutscenes/dialogue | `com/menuclasses/SceneManager.as` (876 ln) + `assets/xml/Scenes.xml` |
| Achievements | `assets/xml/Achievements.xml` + AchievementHolder.as |
| Animation-synced sounds | LevelBase initBunnySoundFX:7694 (AnimationSoundObject arrays per anim) |
| Music selection | LevelBase getMusicTrack:1583 |
| Save format ideas | LevelBase saveCurrentGame:10989 / MGC SharedObject fields |
| Balloons/potions | LevelBase initPotions:1953, updateBalloon, checkLifeBalloonCollision |
| Boss rush mode | BossModeSegments.xml + BossModeEnemies.xml + heart_scon |

### LevelBase.as line-number index (12,499 lines — jump, don't scroll)

constants 334–392 · initAllTheThings 1771 · initLevelGraphics 1858 (level→bg/atlas/scon) · initGUI 2010 · initGameShop 2157 · initBossHearts 2518 · initMagicBubbles 2587 · getEnemyFromXML 2830 (enemy factory) · initEnemies 3584 · spawn helpers 4721–4809 · handleStageTouch 4817 (old touch zones) · doBunnyJump 4995 · doBunnySlash 5087 · onAttackTouch 5140 · attackAgainTime 5184 (combo chaining) · checkAttackCollision 5510 · onEnemyHit 5828 · combo bar 5985 · segment/level transitions 6012–6886 · initBunny 7668 · initBunnySoundFX 7694 · keyPressed 7846 · updateAll 8141 · updateBunny 8180 · updateEnemies 8313 (contact dwell damage) · injureEnemy 8370 · injureBunny 8425 · magic powers 9240–9880 · saveCurrentGame 10989 · pause 11682–11906

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

### Known bugs (user playtest 2026-06-10) — both FIXED in Phase B (2026-06-10 overnight session)

## ROADMAP — full task list to game completion

Work phases in order; each phase ends with: typecheck, browser-verify, commit, update CLAUDE.md + project memory, **git push** (remote: github.com/Ender22/Hoptron-5000; repo-local identity is the personal account — never change user.email here). "Done" definition for 1.0: the original game faithfully remade (minus arena mode, plus controller combat + spell loadout), deployed to a URL friends can open.

### Phase A — Debug tooling — DONE (commit cde429b)

- [x] DebugPanel.ts: DOM overlay, backquote toggle, ?debug starts open. Level skip 1-11, jump to boss, spawn enemy by name (per-level dropdown, refreshed on level load), +500c/+30★/heal, god mode (PlayerController.godMode honored by hurt + hasIFrames), kill all (routes through kill pipeline → loot/score), reset spell cooldowns, game speed 0.25-2x (scales the fixed-step accumulator), hitbox overlay.
- [x] Console hooks: `__spawn(name)`, `__god()`, `__give(c,s)`, `__speed(s)` added.
- [ ] Trigger shopkeeper/chest segment on demand (once Phase D lands).

### Phase B — Bug fixes & enemy completeness — DONE (commit 94eacfa)

- [x] GroundPopper: dirt-trickle telegraph + visible burstOut leap (yVel −10, shake, strawberry_burstOut); 3 difficulty tiers — <3 static biter (attack within 105px), 3-5 walker, ≥6 carrot sky-crusher (flyUp→lookDown→drop→thud→jumpUp loop).
- [x] Boss projectiles: `EnemyProjectiles` (atlas sprites from per-level `<projectileType>`, parsed in levelData with `<hasProjectileWithID>` links); watermelon fires Watermelon_Seed from WaterMelon_Gun via `spriter.findPart(/gun|cannon/i)`; orb fallback for bosses without defs.
- [x] Shooter (corn static aimed speed-8 / dumpling mobile ±5 tumbling, 0.45/2.0s vs 0.65/1.5s timings) + Blaster (pepper: wall→pre_fire→fire loop, diagonal 80,80 flame line w/ segment-vs-player check, fireLoop via audio.playLoop, sweeps wall to wall).
- [x] Exploder (berries): float-home (y-accel /15), detonate within 50px box, damage window at +0.8s (radius ~80), fade +1.1s, suicide = no loot/score.
- [x] Bouncer, Dropper, Spinner, Icecream (scoop1+scoop2 split on death), Fries (homing FryMissile, ease-40 turn after 0.5s), Stick (3 ball-drop anims → stab chase, per-count death anims), Spawner (nugget pump 1.35s, maxNum cap), MiddleSlammer (linked pairs spawned together; donut diff1 slam→break→laugh→walls loop, pizza diff5 fuses at 3×HP and chases). Candle/Note/HamburgerHeart deferred to Phase C (boss minions). PowerSwat (swat) = boss attachment, not in any wave segment — Phase C.
- [x] All 5 worlds eyeballed in browser; spawn types at_ground_pos/offscreen_left/jump_from_side added (corn was spawning off-screen).

### Phase C — Boss fidelity — 10/12 DONE (commits 64811e8 + 656b824, overnight 2026-06-10/11)

- [x] ALL TEN regular bosses are bespoke (`BossBehaviors.ts`, `createBoss` factory by aiType; generic Boss = fallback): Watermelon (action loop, gun-axis volleys, jump-away), Durian (PowerSwat pair guards it → 6s power-down window → recover/regrow), Eggplant (HP-weighted boxer, turn-punch, shoryuken escape), Pumpkin (21-action loop, boomerang head, blob lobs, off-screen side blasts, shrinks with damage), Sundae (throws + charge; stun via blocked-hit counter — original was slash-projectiles-back, simplified: noted fidelity gap), Cake (6 relighting candle minions → stun; hand rays, slam re-entries, homing candle missiles, 20-note song stream), Noodles (melee: lunges/combos/wall-dives/3-pass superslash/defend+backflip counters), Sushi (orbiting shields, boomerang fish, wasabi mortars, rapid-cut counter), Hamburger (heart AttachedMinion is the target, exposed on laugh/suck; suck pulls player via services.pullPlayer, chew+spit), Combo (KO break system via Enemy.koMode: shatters into KO-able pieces every quarter HP).
- [x] Boss intro warning banner (pulsing, boss_is_coming) + boss death slow-mo/flash/fanfare; per-boss sounds wired.
- [x] Boss minions: PowerSwat, AttachedMinion (heart/candles), NoteMinion — spawned via services.spawnChild, registered in createEnemy.
- [x] Burrito final boss (commit c8f2d3e): condensed 10-form transformation fight, original HP thresholds, per-form action loops, swat/candle/guard mechanics per form. One rig (final_scon entity `burrito`), all forms = animations (changeToX/idle_X/<form>_* names).
- [x] Magic Man = LEVEL 12 added (segments idx 11, category `mm`, magicMan_Fight_scon + magicman/TA_Magicman-hd atlas, track_07): condensed SOLO version (original was a duo — pair version is a fidelity follow-up). Energy balls, teleport staff smash, eagle swoops, side blasts, sub-50% rapid barrage canceled by hitting him.
- [x] bossWarning ids RESOLVED: 0/1 per world pair; 2=burrito (lvl 11), 3=magicman (lvl 12). Final bosses are enemyTypes not <boss> elements → spawnBoss falls back to BOSS_ID_NAMES lookup. loadLevel drops post-boss leftover segments (lvl 12 data had a trailing magicman wave).
- [ ] Fidelity follow-ups: Magic Man DUO (partner + highfive + fart + KO smash sequences), Sundae projectile slash-back (orig mechanic; both real + burrito form), Hamburger heart HP tuning, Cake candle positions (use rig points if present), Combo break thresholds quartered vs original 1000/2000-HP steps, burrito intro/death cutscenes (Phase F).

### Phase D — Run economy & shops (spec mined → `notes/phase-d-spec.md` — read it first)

- [ ] Shopkeeper segments: full spec in notes/phase-d-spec.md (items/prices/effects/anims/sounds). Player needs new stat fields: armor pool, dmgResistance, luck, dodge.
- [x] Reward chest segments (commit 418f3b2): WaveManager.needsChest → Game chest drop/open/coin-shower, level-scaled loot. **NEEDS BROWSER VERIFY** (Chrome window was hidden when built — fast-forward level 1 w/ kill-alls to segment w/ chest; watch for the [wave] CHEST log).
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

`__gotoLevel(n)` (1-based), `__bossNow()`, `__equip('akuma','time')`, `__spawn('strawberry')`, `__god()`, `__give(coins, stars)`, `__speed(0.25-2)`. Spells: freeze/ninjaRain/slash/growth/coin/magnet/time/akuma. Debug panel: backquote or `?debug`.

## Working style & session tidbits

- **The user (Devin) is the original author** of the 2015 game — it's his IP. He wants full autonomy: build without approval, scope sessions to one roadmap phase, treat his casual playtest notes as authoritative tuning directives. If a feature would need new sprites, scratch it rather than ask.
- **Git identity**: machine's global git config is his WORK account — this repo is locally pinned to personal (Ender22 + noreply email). Never change `user.email` here; remote is `github.com/Ender22/Hoptron-5000`.
- **Dev server**: may already be running on :5173 from a previous session — check before starting another.
- **Browser testing technique**: drive the game by JS-dispatching `KeyboardEvent`s (keydown without keyup = hold); screenshots' DPI scale flip-flops, so click via element refs (`find` tool) or JS instead of coordinates; console hooks + `read_console_messages` with a pattern.
- **HIDDEN-WINDOW TRAP**: if the game appears frozen (bunny stuck in a pose, no enemies, level text never fades) with NO console errors — check `document.hidden` first. Chrome pauses rAF for hidden/occluded windows; screenshots still capture but the sim doesn't run. Probe: count rAF frames over 1s via JS. Wasted 20 minutes chasing a phantom regression on this (2026-06-11 ~1am).
- **Animation questions** → use the viewer (`/?viewer`) before writing code; it's the fastest fidelity check.
- **PowerShell hazard**: `Set-Content` after regex-replace mangles unicode (em-dashes) in source files — use the Edit tool or ASCII.
- Never port: arena mode (dead server), Vungle ads, IAP, profiles (single localStorage save replaces them). Stretch idea (user-approved someday-maybe): the 10 local arena rule/segment XMLs could become an offline "challenge mode".
- Original 800×480 stage and fixed 60Hz step are load-bearing (all original constants are per-frame-at-60).

## Project memory

Long-form decision history lives in Claude's project memory (`hoptron-remake-decisions.md` + `user-devin-profile.md`); this file is the canonical continuation doc — keep BOTH updated at each milestone.
