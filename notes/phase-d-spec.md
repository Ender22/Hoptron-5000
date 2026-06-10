# Phase D spec — mined from the original source (2026-06-11 session)

Condensed from InGameShopManager.as, GameShop.xml, LevelBase.as (initGameShop/initPotions/
updateBalloon/gotoScoreScreen). Reward chests are DONE (Game.ts startChest/openChest/updateChest,
WaveManager.needsChest); the rest below is still to build.

## Shopkeeper segments (NOT BUILT)

- Trigger: segment with `<shopkeeper> 1 </shopkeeper>`, maxEnemies=0, continueAfterTime=7 (auto-advances; shop runs concurrently).
- Spawn opposite the player (x=700 facing left if player x<400, else x=100 facing right), y = groundY-10; `teleport_in`→`idle` anims (shopkeeper_scon, entity "Shopkeeper", skin "shopanim"); sound `teleportBack`; auto-leaves after 6s if not approached.
- Player walks into it (facing it) → shop opens: music fades to `shop` track; sounds `shopkeeper_welcome`, then `shopkeeper_whatAreYaBuyin` (1.25s); anims `showwares`→`wares_idle`. Close: `shopkeeper_comeBack`, `hidewares`→`idle`, then `teleport_out`.
- Buy: `store_itemBought` + random [`shopkeeper_isThatAll`, `shopkeeper_thankyou`]. Not enough coins: `store_notEnough`.

### Items (GameShop.xml; price → effect)

| Item | Prices per level | Effect |
|---|---|---|
| Ninja Star Pack | 40 | +30 stars |
| Armor 1-4 | 150/250/350/450 | armor pool 50/80/110/140 (absorbs dmg×resistance until 0); L2+: +1/+2/+8 maxSpeed, +0.03/+0.1/+0.3 accel |
| Chi Enhancer 1-5 | 100/300/500/700/1000 | dmgResistance ×0.9/0.8/0.7/0.6/0.45 (glow tint 0x00FF84→0xFF0000) |
| Health Potion balloon 1-2 | 200/600 | enables balloon spawns: small=+50% HP, large=full heal |
| Invincibility balloon 1-2 | 400/800 | small=10s invince, large=20s |
| Lucky Robo Arm 1-2 | 200/500 | coin drop multiplier ×1.25/×1.50 |
| Dodge Shoes 1-2 | 225/850 | auto-dodge 15%/35% (roll 0-100; on dodge: invincible, `dodge` anim, xVel ±32, 1.5s) |
| Health Carrot | 5, +5 each buy | +30% maxHP instantly; rejected at full HP |

## Balloons (NOT BUILT)

- After potion purchase: first spawn 10s (health) / 15s (invince). Spawn at (-40, 50), xVel 5.
- Drift: accelerate to xVel 2 cap, ±0.2 jitter; yVel wobble ±0.1, capped ±0.667; floats right.
- Off right edge (x>1000) → reschedule 90–120s. Collected → no reschedule.
- Balloon texture `Balloon` + potion sprite below (`Health_Potion[_Small]`, `Invincibility_Potion[_Small]`, effects atlas). Touch → effect + `pickup_potion`; balloon floats up offscreen.
- Invincibility visual: brightness/saturation boost on the bunny.

## Score screen + AP (NOT BUILT)

- AP during run: loot pickup amount/7; kill score amount/300.
- End: AP = max(1, floor(AP)); +10% per boss defeated this run; floor again.
- Screen shows Kills / Score / AP with count-up anims and best-record comparisons (`new_record` sound on a record).
- Original also had Distance — skip (not tracked).

## Chest loot reference (BUILT — condensed table in Game.ts)

Original per-level tables: silver 8-15, gold 6-16, goldbar 0-3, diamond at L6+ (1) and L10 (2),
hearts shift from xs/s to l, L9-10 = full heal. Coin shower xVel rand(-4,4), yVel -10,
0.025s stagger, sounds chest_appear/chest_open/chest_coinOut1+2.
