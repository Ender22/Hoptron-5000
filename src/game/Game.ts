/**
 * Game shell — all 6 adventure levels with wave-spawned enemies, loot,
 * ninja stars, and full combat. Fixed 60Hz simulation (the original's
 * per-frame constants depend on it), rendering at display rate.
 */
import { Application, Assets, Container, Graphics, Point, Sprite, Text, Texture } from 'pixi.js';
import { loadStarlingAtlas, type TextureMap } from '../assets/starlingAtlas';
import { parseScon } from '../spriter/parseScon';
import { SpriterPlayer } from '../spriter/SpriterPlayer';
import { audio } from './Audio';
import { loadEnemyTypes, loadSegments, type LevelEnemies } from './data/levelData';
import { Balloons } from './Balloons';
import { Boss } from './Boss';
import { createBoss } from './BossBehaviors';
import { DebugPanel } from './DebugPanel';
import { Enemy, type EnemyServices } from './Enemy';
import { EnemyProjectiles } from './EnemyProjectiles';
import { Input } from './Input';
import { BossShots, Hitstop, ParticleBursts, ScreenShake } from './Juice';
import { MetaShop } from './MetaShop';
import { NinjaStars } from './NinjaStars';
import { Pickups } from './Pickups';
import { GROUND_Y, PlayerController } from './PlayerController';
import { loadSave, writeSave } from './SaveData';
import { ScoreScreen } from './ScoreScreen';
import { Shopkeeper, type ShopBackend, type ShopItemKey } from './Shopkeeper';
import { SpellSystem } from './Spells';
import { SwipeTrail } from './SwipeTrail';
import { TitleScreen } from './TitleScreen';
import { WaveManager } from './WaveManager';

export const STAGE_W = 800;
export const STAGE_H = 480;
const FIXED_DT = 1 / 60;

const SWORD_PART = 'Bunny_Sword1';
const SWORD_TIP_LOCAL_X = -153; // blade extends from the hilt pivot (0,0) to local (-153, 0)
const ENEMY_HIT_RADIUS = 42; // approximate enemy body radius at 0.55 scale
const STARTING_STARS = 30; // one original "Ninja Star Pack"

// ---- in-run shop tables (GameShop.xml + InGameShopManager effects) ----
const ARMOR_TIERS = {
  names: ['Thin Armor', 'Strong Armor', 'Diamond Armor', 'Swift Dragon Armor'],
  prices: [150, 250, 350, 450],
  pool: [50, 80, 110, 140],
  speed: [0, 1, 2, 8],
  accel: [0, 0.03, 0.1, 0.3],
};
const CHI_TIERS = { prices: [100, 300, 500, 700, 1000], resist: [0.9, 0.8, 0.7, 0.6, 0.45] };
const HEALTH_POTION_TIERS = { names: ['Health Potion', 'Mega Health Potion'], prices: [200, 600] };
const INVINCE_TIERS = { names: ['Invincibility Potion', 'Mega Invincibility Potion'], prices: [400, 800] };
const LUCK_TIERS = { names: ['Lucky Robo Arm', 'Golden Lucky Robo Arm'], prices: [200, 500], mult: [1.25, 1.5] };
const DODGE_TIERS = { names: ['Dodge Shoes', 'Super Dodge Shoes'], prices: [225, 850], chance: [15, 35] };

interface LevelDef {
  bg: string;
  scon: string;
  atlas: string;
  category: string;
  music: string;
}

// original initLevelGraphics: 11 adventure levels, two per food world
// (level 11, the Magic Man fight, comes later with the boss system)
function worldPair(bg: string, scon: string, atlas: string, category: string, track: string): LevelDef[] {
  return [
    { bg, scon, atlas, category, music: track },
    { bg, scon, atlas, category, music: `${track}-2` },
  ];
}

const LEVELS: LevelDef[] = [
  ...worldPair('level01', 'fruit_scon', 'enemies/fruit/fruit_enemies-hd', 'fruit', 'track_01'),
  ...worldPair('level02', 'veg_scon', 'enemies/veg/veg_enemies-hd', 'veg', 'track_02'),
  ...worldPair('level03', 'dessert_scon', 'enemies/dessert/dessert_enemies-hd', 'dessert', 'track_03'),
  ...worldPair('level04', 'asian_scon', 'enemies/asian/asian_enemies-hd', 'asian', 'track_04'),
  ...worldPair('level05', 'ffood_scon', 'enemies/ffood/ffood_enemies-hd', 'ffood', 'track_05'),
  { bg: 'level06', scon: 'final_scon', atlas: 'enemies/final/final_enemies-hd', category: 'final', music: 'track_06' },
  // level 12: the Magic Man fight (original level 11, segments index 11, category "mm")
  { bg: 'level06', scon: 'magicMan_Fight_scon', atlas: 'magicman/TA_Magicman-hd', category: 'mm', music: 'track_07' },
];

// the final-world bossWarning ids map to named enemyTypes, not <boss> elements
const BOSS_ID_NAMES: Record<number, string> = { 2: 'burrito', 3: 'magicman' };

export async function startGame(root: HTMLElement): Promise<void> {
  root.innerHTML = '';
  const app = new Application();
  await app.init({ width: STAGE_W, height: STAGE_H, background: 0x000000, antialias: true });
  root.appendChild(app.canvas);

  const fit = () => {
    const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    app.canvas.style.width = `${STAGE_W * scale}px`;
    app.canvas.style.height = `${STAGE_H * scale}px`;
    app.canvas.style.display = 'block';
    app.canvas.style.margin = `${Math.max(0, (window.innerHeight - STAGE_H * scale) / 2)}px auto 0`;
  };
  fit();
  window.addEventListener('resize', fit);

  // ---- shared assets + design data ----
  const [bunnyScon, bunnyAtlas, effectsAtlas, menuAtlas, storeAtlas, enemyLevels, segmentLevels] = await Promise.all([
    fetch('assets/scml/bunny_scon.scon').then((r) => r.json()),
    loadStarlingAtlas('assets/textureAtlas/bunny/TA_Bunny-hd.xml'),
    loadStarlingAtlas('assets/textureAtlas/effects/effectAtlas-hd.xml'),
    loadStarlingAtlas('assets/textureAtlas/menu/menuAtlas-hd.xml'),
    loadStarlingAtlas('assets/textureAtlas/store/storeAtlas-hd.xml'),
    loadEnemyTypes(),
    loadSegments(),
  ]);
  const typesByCategory = new Map<string, LevelEnemies>(enemyLevels.map((l) => [l.foodCategory, l]));

  // ---- display tree ----
  const shakeRoot = new Container();
  app.stage.addChild(shakeRoot);
  const world = new Container();
  shakeRoot.addChild(world);

  const bg = new Sprite();
  bg.width = STAGE_W;
  bg.height = STAGE_H;
  world.addChild(bg);

  const enemyLayer = new Container();
  const lootLayer = new Container();
  const characterLayer = new Container();
  const effectsLayer = new Container();
  world.addChild(enemyLayer, lootLayer, characterLayer, effectsLayer);

  const bunnySpriter = new SpriterPlayer('bunny', parseScon(bunnyScon), bunnyAtlas);
  characterLayer.addChild(bunnySpriter);

  const swipeTrail = new SwipeTrail();
  const bursts = new ParticleBursts();
  effectsLayer.addChild(swipeTrail, bursts);

  const pickups = new Pickups(effectsAtlas);
  lootLayer.addChild(pickups);
  const stars = new NinjaStars(effectsAtlas);
  effectsLayer.addChild(stars);
  const bossShots = new BossShots();
  effectsLayer.addChild(bossShots);
  const enemyShots = new EnemyProjectiles();
  effectsLayer.addChild(enemyShots);

  const input = new Input();
  const player = new PlayerController(bunnySpriter, input);
  const shake = new ScreenShake(shakeRoot);
  const hitstop = new Hitstop();

  audio.loadFx([
    'bunny_drawSword', 'jumpSound', 'bunny_hurt', 'you_died', 'slide_to_stop',
    'swipe1_01', 'swipe1_02', 'swipe1_03', 'swipe2_01', 'swipe2_02', 'swipe3_01', 'swipe4_01',
    'enemyHurt_01', 'enemyHurt_02', 'enemyHurt_03', 'pickup_coin_silver', 'pickup_coin_gold',
    // enemy archetype sounds (original AS3 classes)
    'strawberry_burstOut', 'strawberry_bite', 'pineapple_thud', 'pineapple_start',
    'spin_start', 'impact1', 'impact2', 'impact3', 'projectileShot', 'berries_explode',
    'woosh', 'spawnSomeone', 'donut_laugh', 'slam', 'fireLoop', 'explosion_01',
    'boss_is_coming', 'boss_killed', 'explosion_boss', 'coke_blast',
    // boss fight sounds (first four bosses)
    'watermelon_jump', 'watermelon_gunSmack', 'watermelon_hitGroundAfterJump', 'watermelon_die',
    'durian_hitGround', 'durian_slam', 'durian_laugh', 'durian_start_spin',
    'durian_powerLoss', 'durian_powerGained', 'durian_swat_destroyed', 'durian_die',
    'shoryuken',
    'pumpkin_hello', 'pumpkin_throwhead', 'pumpkin_shoot1', 'pumpkin_shoot2', 'pumpkin_shoot3',
    'pumpkin_slashdown1', 'pumpkin_slashdown2', 'pumpkin_stab1', 'pumpkin_stab2', 'pumpkin_die',
    // bosses 5-10
    'sundae_roar', 'durian_powerLoss', 'cake_roar', 'cake_shot', 'cake_shot2', 'cake_shot3',
    'note1', 'note2', 'note3', 'noodles_unsheath', 'noodles_superslash',
    'sushi_getmad', 'sushi_getmad2', 'hamburger_laugh', 'hamburger_chew', 'hamburger_spit',
    'hamburger_suck_start', 'hamburger_suck_loop',
    'combo_bigRoar', 'combo_roar1', 'combo_roar2', 'combo_roar3', 'combo_blast',
    'combo_preBreak', 'combo_down', 'combo_up', 'combo_stomp1', 'combo_stomp2', 'combo_stomp3',
    'chest_appear', 'chest_open', 'chest_coinOut1', 'chest_coinOut2', 'pickup_potion',
    // shopkeeper + stores (Phase D)
    'shopkeeper_welcome', 'shopkeeper_whatAreYaBuyin', 'shopkeeper_comeBack',
    'shopkeeper_isThatAll', 'shopkeeper_thankyou', 'store_itemBought', 'store_notEnough',
    'teleportBack', 'teleportOut', 'new_record',
  ]);

  // ---- run state ----
  const save = loadSave();
  let levelIndex = 0;
  let score = 0;
  let coins = 0;
  let starAmmo = STARTING_STARS;
  let wave: WaveManager | null = null;
  let levelClearTimer = 0;
  let gameComplete = false;
  let atTitle = true;

  // AP accrual (original awardLoot amount/7 + awardPoints amount/300)
  let apFloat = 0;
  let bossesThisLevel = 0;
  let runKills = 0;

  // in-run shop purchases (reset every run)
  const runShop = { armor: 0, chi: 0, healthPotion: 0, invincePotion: 0, luck: 0, dodge: 0, carrotPrice: 5 };
  let luckMult = 1;
  let armorMax = 0;

  function resetRunShop(): void {
    runShop.armor = 0;
    runShop.chi = 0;
    runShop.healthPotion = 0;
    runShop.invincePotion = 0;
    runShop.luck = 0;
    runShop.dodge = 0;
    runShop.carrotPrice = 5;
    luckMult = 1;
    armorMax = 0;
  }

  /** floor + boss bonus, banked into the save (original storeLoadComplete) */
  function bankAp(): number {
    if (apFloat <= 0 && bossesThisLevel === 0) return 0;
    let ap = Math.max(1, Math.floor(apFloat));
    ap += Math.floor(ap * (bossesThisLevel / 10));
    apFloat = 0;
    bossesThisLevel = 0;
    save.ap += ap;
    return ap;
  }

  function bankProgress(unlockNext: boolean): void {
    if (unlockNext && levelIndex + 1 < LEVELS.length) {
      save.furthestLevel = Math.max(save.furthestLevel, levelIndex + 1);
    }
    save.bestScore = Math.max(save.bestScore, score);
    save.bestKills = Math.max(save.bestKills, runKills);
    save.totalCoins += coins;
    coins = 0;
    bankAp();
    writeSave(save);
  }

  pickups.onCoins = (amount) => {
    const amt = Math.round(amount * luckMult); // Lucky Robo Arm
    coins += amt;
    apFloat += amt / 7;
    audio.play(amount >= 8 ? 'pickup_coin_gold' : 'pickup_coin_silver', 0, 0.5);
  };
  pickups.onHeal = (fraction) => {
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * fraction);
  };
  player.onThrow = (x, y, dir) => {
    if (starAmmo <= 0) return;
    starAmmo--;
    audio.play('swipe1_02', 0, 0.4);
    stars.throw_(x, y, dir);
  };
  stars.onHit = (enemy, killed) => {
    audio.playRandom(['enemyHurt_01', 'enemyHurt_02', 'enemyHurt_03']);
    if (killed) onEnemyKilled(enemy);
  };

  function onEnemyKilled(enemy: Enemy): void {
    wave?.onKill();
    runKills++;
    score += enemy.type.pointsAward;
    apFloat += enemy.type.pointsAward / 300;
    bursts.burst(enemy.x, enemy.y, enemy.type.deathPS, enemy instanceof Boss ? 42 : 16);
    pickups.dropFrom(enemy.x, enemy.y, enemy.type.loot);
    if (enemy instanceof Boss) {
      bossesThisLevel++;
      // boss death sequence: big shake + slow-mo beat + fanfare
      shake.add(12);
      bossShots.clearAll();
      enemyShots.clearAll();
      enemyTimeScale = 0.2;
      slowMoTimer = 1.3;
      flashColor = 0xffffff;
      screenFlash.tint = 0xffffff;
      screenFlash.alpha = 0.5;
      audio.play('boss_killed');
      audio.play('explosion_boss', 0.1, 0.7);
      audio.playMusic(LEVELS[levelIndex].music, 2);
    }
  }

  // ---- spells ----
  const screenFlash = new Graphics().rect(0, 0, STAGE_W, STAGE_H).fill(0xffffff);
  screenFlash.alpha = 0;
  app.stage.addChild(screenFlash);
  let flashColor = 0xffffff;

  function damageEnemy(enemy: Enemy, amount: number, dir: number): void {
    const wasAlive = enemy.alive;
    enemy.frozenTimer = 0;
    enemy.invincible = false;
    enemy.hurt(amount, dir);
    if (wasAlive && !enemy.alive) onEnemyKilled(enemy);
  }

  const spells = new SpellSystem(
    {
      player,
      enemies: () => wave?.enemies ?? [],
      stars,
      bursts,
      shake,
      damage: damageEnemy,
      flash: (color, alpha) => {
        flashColor = color;
        screenFlash.tint = color;
        screenFlash.alpha = alpha;
      },
      spawnLoot: (x, y, item) => pickups.spawn(x, y, item),
      vacuumLoot: () => pickups.vacuum(),
      slowMo: (scale, seconds) => {
        enemyTimeScale = scale;
        slowMoTimer = seconds;
      },
    },
    effectsAtlas,
    ['freeze', 'ninjaRain'],
  );
  let enemyTimeScale = 1;
  let slowMoTimer = 0;

  (window as any).__equip = (a: string, b: string) => spells.setLoadout([a, b]);

  // ---- enemy services (capabilities behaviors can use) ----
  const enemyServices: EnemyServices = {
    shoot: (def, x, y, vx, vy, opts) => enemyShots.spawn(def, x, y, vx, vy, opts),
    spawnChild: (name, x, y, xVel, yVel) => wave?.spawnChildAt(name, x, y, xVel, yVel) ?? null,
    shake: (amount) => shake.add(amount),
    hurtPlayer: (damage, dir) => {
      if (!player.dead && player.hurt(damage, dir)) {
        shake.add(5);
        hitstop.freeze(0.05);
      }
    },
    burst: (x, y, deathPS, count) => bursts.burst(x, y, deathPS, count),
    killEnemy: (enemy) => damageEnemy(enemy, 9999999, 1),
    pullPlayer: (x, _y, accel) => {
      if (player.dead || player.hasIFrames) return;
      player.xVel += Math.sign(x - player.x) * accel;
    },
  };

  // ---- boss spawning ----
  let bossLoading = false;

  bossShots.onPlayerHit = () => {
    const boss = wave?.boss;
    if (player.hurt(boss ? Math.max(4, boss.type.attackDmg * 0.6) : 6, player.facing * -1)) {
      shake.add(5);
    }
  };
  enemyShots.onPlayerHit = (damage) => {
    if (!player.dead && player.hurt(damage, player.facing * -1)) {
      shake.add(5);
    }
  };

  async function spawnBoss(bossId: number): Promise<void> {
    if (bossLoading || !wave) return;
    bossLoading = true;
    try {
      const def = LEVELS[levelIndex];
      const levelTypes = typesByCategory.get(def.category);
      const bossList = levelTypes?.bosses ?? [];
      const type = bossList[Math.min(bossId, bossList.length - 1)] ?? levelTypes?.types.get(BOSS_ID_NAMES[bossId] ?? '');
      if (!type) {
        console.warn(`[boss] no boss ${bossId} for ${def.category}`);
        wave.levelComplete = true;
        return;
      }
      // warning banner while the boss assets load (original bossWarning)
      bossWarnTimer = 2.4;
      audio.play('boss_is_coming', 0, 0.8);
      const minWarning = new Promise((r) => setTimeout(r, 2200));
      let cached = sconCache.get(type.scon);
      if (!cached) {
        const [sconJson, textures] = await Promise.all([
          fetch(`assets/scml/${type.scon}.scon`).then((r) => r.json()),
          loadStarlingAtlas(`assets/textureAtlas/${def.atlas}.xml`),
        ]);
        cached = { data: parseScon(sconJson), textures };
        sconCache.set(type.scon, cached);
      }
      await minWarning;
      if (!wave || wave.needsBoss === null) return; // level changed while loading

      const spriter = new SpriterPlayer(`boss-${type.name}`, cached.data, cached.textures);
      const boss = createBoss(type, spriter);
      // real atlas projectile (e.g. Watermelon_Seed) when the XML links one; orb fallback
      const levelData = typesByCategory.get(def.category);
      boss.projectileDef = levelData?.projectiles.get(type.projectileIds[0] ?? -1) ?? null;
      boss.projectileMap = levelData?.projectiles ?? null;
      boss.onShoot = (x, y, vx, vy) => {
        if (boss.projectileDef) enemyShots.spawn(boss.projectileDef, x, y, vx, vy);
        else bossShots.fire(x, y, vx, vy);
      };
      boss.onLand = () => shake.add(8);
      boss.spawnAt(620, type.effectedByGravity ? 0 : 160); // drops in / flies in
      enemyLayer.addChild(spriter);
      wave.bossSpawned(boss);
      audio.playMusic(bossId === 3 ? 'track_07' : bossId === 2 ? 'bosstrack_01' : levelIndex % 2 === 0 ? 'bosstrack_01' : 'bosstrack_02', 1);
      console.log(`[boss] ${type.name} spawned (hp ${type.hp})`);
    } finally {
      bossLoading = false;
    }
  }

  // ---- reward chest segments (original spawnChest/spawnChestStuff) ----
  const chest = new Sprite();
  chest.anchor.set(0.5, 1);
  chest.visible = false;
  lootLayer.addChild(chest);
  let chestState: 'none' | 'dropping' | 'waiting' | 'open' = 'none';
  let chestTimer = 0;
  let chestLevel = 0;

  function startChest(level: number): void {
    chestLevel = level;
    chestState = 'dropping';
    chestTimer = 0;
    chest.texture = effectsAtlas.get('TreasureChest_Closed') ?? Texture.EMPTY;
    chest.visible = true;
    chest.alpha = 1;
    chest.position.set(STAGE_W / 2, -100);
    audio.play('chest_appear', 0, 0.8);
  }

  function openChest(): void {
    chestState = 'open';
    chestTimer = 0;
    chest.texture = effectsAtlas.get('TreasureChest_Open') ?? Texture.EMPTY;
    audio.play('chest_open', 0, 0.9);
    audio.playRandom(['chest_coinOut1', 'chest_coinOut2'], 0.1, 0.7);
    // condensed loot table from the original spawnChestStuff levels 0-10
    const L = chestLevel;
    const drops: [string, number][] = [
      ['loot_s', 8 + Math.floor(Math.random() * 5)],
      ['loot_l', 8 + Math.floor(Math.random() * 7)],
      ['loot_xl', Math.min(3, Math.floor(L / 3) + (L >= 1 ? 1 : 0))],
      ['health_s', L >= 9 ? 0 : 2],
      ['health_l', L >= 6 && L < 9 ? 1 : 0],
      ['health_full', L >= 9 ? 1 : 0],
    ];
    for (const [item, count] of drops) {
      for (let i = 0; i < count; i++) pickups.spawn(chest.x + (Math.random() - 0.5) * 30, chest.y - 30, item);
    }
  }

  function updateChest(): void {
    if (chestState === 'none') return;
    chestTimer += FIXED_DT;
    if (chestState === 'dropping') {
      // ease down from the sky over 2s
      const u = Math.min(1, chestTimer / 2);
      chest.y = -100 + (GROUND_Y + 8 + 100) * (1 - (1 - u) ** 2);
      if (u >= 1) {
        chestState = 'waiting';
        chestTimer = 0;
      }
      return;
    }
    if (chestState === 'waiting') {
      if (!player.dead && Math.abs(player.x - chest.x) < 55 && Math.abs(player.y - chest.y) < 70) {
        openChest();
        return;
      }
      if (chestTimer > 4.5) chest.alpha = Math.max(0, 1 - (chestTimer - 4.5) / 1.5);
      if (chestTimer > 6) {
        chestState = 'none';
        chest.visible = false;
      }
      return;
    }
    // open: linger then fade
    if (chestTimer > 1.5) chest.alpha = Math.max(0, 1 - (chestTimer - 1.5) / 1);
    if (chestTimer > 2.5) {
      chestState = 'none';
      chest.visible = false;
    }
  }

  // ---- balloons (potion items from the in-run shop) ----
  const balloons = new Balloons(effectsAtlas);
  lootLayer.addChild(balloons);
  balloons.onCollect = (kind, level) => {
    if (kind === 'health') {
      player.hp = level >= 2 ? player.maxHp : Math.min(player.maxHp, player.hp + player.maxHp * 0.5);
    } else {
      player.potionInvinceTimer = level >= 2 ? 20 : 10;
    }
  };

  // ---- in-run shopkeeper (original InGameShopManager) ----
  const shopBackend: ShopBackend = {
    coins: () => coins,
    name: (key) => {
      switch (key) {
        case 'stars': return 'Ninja Star Pack';
        case 'armor': return ARMOR_TIERS.names[Math.min(runShop.armor, 3)];
        case 'chi': return `Chi Enhancer ${Math.min(runShop.chi + 1, 5)}`;
        case 'healthPotion': return HEALTH_POTION_TIERS.names[Math.min(runShop.healthPotion, 1)];
        case 'invincePotion': return INVINCE_TIERS.names[Math.min(runShop.invincePotion, 1)];
        case 'luck': return LUCK_TIERS.names[Math.min(runShop.luck, 1)];
        case 'dodge': return DODGE_TIERS.names[Math.min(runShop.dodge, 1)];
        case 'carrot': return 'Health Carrot';
      }
    },
    price: (key) => {
      switch (key) {
        case 'stars': return 40;
        case 'armor': return ARMOR_TIERS.prices[runShop.armor] ?? null;
        case 'chi': return CHI_TIERS.prices[runShop.chi] ?? null;
        case 'healthPotion': return HEALTH_POTION_TIERS.prices[runShop.healthPotion] ?? null;
        case 'invincePotion': return INVINCE_TIERS.prices[runShop.invincePotion] ?? null;
        case 'luck': return LUCK_TIERS.prices[runShop.luck] ?? null;
        case 'dodge': return DODGE_TIERS.prices[runShop.dodge] ?? null;
        case 'carrot': return runShop.carrotPrice;
      }
    },
    buy: (key: ShopItemKey) => {
      const price = shopBackend.price(key);
      if (price === null) return 'rejected';
      if (key === 'carrot' && player.hp >= player.maxHp) return 'rejected';
      if (coins < price) return 'poor';
      coins -= price;
      switch (key) {
        case 'stars':
          starAmmo += 30;
          break;
        case 'armor': {
          const tier = runShop.armor++;
          player.armorHp = ARMOR_TIERS.pool[tier];
          armorMax = ARMOR_TIERS.pool[tier];
          player.speedBonus = ARMOR_TIERS.speed[tier];
          player.accelBonus = ARMOR_TIERS.accel[tier];
          break;
        }
        case 'chi':
          player.dmgResistance = CHI_TIERS.resist[runShop.chi++];
          break;
        case 'healthPotion':
          balloons.enable('health', ++runShop.healthPotion);
          break;
        case 'invincePotion':
          balloons.enable('invince', ++runShop.invincePotion);
          break;
        case 'luck':
          luckMult = LUCK_TIERS.mult[runShop.luck++];
          break;
        case 'dodge':
          player.dodgeChance = DODGE_TIERS.chance[runShop.dodge++];
          break;
        case 'carrot':
          player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.3);
          runShop.carrotPrice += 5; // original: price grows 5 per carrot bought
          break;
      }
      return 'ok';
    },
  };

  let shopkeeper: Shopkeeper | null = null;
  let shopkeeperLoading = false;
  let shopkeeperCache: { data: ReturnType<typeof parseScon>; textures: TextureMap } | null = null;

  function disposeShopkeeper(): void {
    if (!shopkeeper) return;
    shopkeeper.ui.parent?.removeChild(shopkeeper.ui);
    shopkeeper.dispose();
    shopkeeper = null;
  }

  async function spawnShopkeeper(): Promise<void> {
    if (shopkeeperLoading || shopkeeper) return;
    shopkeeperLoading = true;
    try {
      if (!shopkeeperCache) {
        const [sconJson, textures] = await Promise.all([
          fetch('assets/scml/shopkeeper_scon.scon').then((r) => r.json()),
          loadStarlingAtlas('assets/textureAtlas/shopkeeper/TA_Shopkeeper-hd.xml'),
        ]);
        shopkeeperCache = { data: parseScon(sconJson), textures };
      }
      if (atTitle || !wave) return; // level changed while loading
      const spriter = new SpriterPlayer('shopkeeper', shopkeeperCache.data, shopkeeperCache.textures);
      shopkeeper = new Shopkeeper(spriter, menuAtlas, shopBackend, player.x);
      shopkeeper.onClosed = () => audio.playMusic(LEVELS[levelIndex].music, 1);
      characterLayer.addChild(spriter);
      app.stage.addChild(shopkeeper.ui);
      console.log('[shop] shopkeeper spawned');
    } finally {
      shopkeeperLoading = false;
    }
  }

  // ---- post-level score screen + AP banking ----
  const scoreScreen = new ScoreScreen();
  let scoreScreenPending = false;

  function showScoreScreen(): void {
    scoreScreenPending = true;
    const finalLevel = levelIndex + 1 >= LEVELS.length;
    const newBest = score > 0 && score > save.bestScore;
    const apEarned = bankAp();
    bankProgress(true);
    scoreScreen.show({
      levelNumber: levelIndex + 1,
      kills: wave?.totalKills ?? 0,
      score,
      apEarned,
      newBestScore: newBest,
      finalLevel,
    });
  }

  scoreScreen.onContinue = () => {
    scoreScreenPending = false;
    if (levelIndex + 1 < LEVELS.length) {
      levelIndex++;
      player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.5);
      void loadLevel(levelIndex);
    } else {
      gameComplete = true;
      audio.playMusic('afterboss', 1);
    }
  };

  // ---- level loading ----
  const sconCache = new Map<string, { data: ReturnType<typeof parseScon>; textures: TextureMap }>();

  async function loadLevel(n: number): Promise<void> {
    const def = LEVELS[n];
    levelClearTimer = 0;

    // detach the old wave FIRST so the ticker stops updating it during the async load
    const old = wave;
    wave = null;
    if (old) {
      for (const e of old.enemies) {
        e.dispose();
        e.spriter.parent?.removeChild(e.spriter);
        e.spriter.destroy();
      }
      old.enemies.length = 0;
    }
    pickups.clear();
    stars.clear();
    enemyShots.clearAll();
    bossShots.clearAll();
    chestState = 'none';
    chest.visible = false;
    disposeShopkeeper();
    balloons.clearActive();
    scoreScreen.visible = false;

    let cached = sconCache.get(def.scon);
    if (!cached) {
      const [sconJson, textures] = await Promise.all([
        fetch(`assets/scml/${def.scon}.scon`).then((r) => r.json()),
        loadStarlingAtlas(`assets/textureAtlas/${def.atlas}.xml`),
      ]);
      cached = { data: parseScon(sconJson), textures };
      sconCache.set(def.scon, cached);
    }
    bg.texture = await Assets.load<Texture>(`assets/textures/stages/${def.bg}.jpg`);

    if (levelIndex !== n) return; // a newer load superseded this one
    enemyShots.setTextures(cached.textures);
    // post-boss: keep marker segments (reward chest) but drop leftover enemy
    // waves (level 12's data has a trailing magicman wave)
    const segs = segmentLevels[n];
    const bossIdx = segs.findIndex((s) => s.boss !== null);
    const useSegs = bossIdx >= 0 ? segs.filter((s, i) => i <= bossIdx || s.enemies.length === 0) : segs;
    wave = new WaveManager(useSegs, typesByCategory.get(def.category)!, cached.data, cached.textures, enemyLayer, enemyServices);
    audio.playMusic(def.music, 1.5);
    levelText.text = `Level ${n + 1}`;
    levelText.alpha = 1;
    debugPanel.refreshEnemyList();
  }

  // ---- sword swing tracking ----
  const hiltLocal = new Point(0, 0);
  const tipLocal = new Point(SWORD_TIP_LOCAL_X, 0);
  let lastComboStage = -1;
  const hitThisSwing = new Set<Enemy>();

  function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function combatTick(): void {
    if (!wave) return;
    const stage = player.state === 'attack' ? player.comboStageIndex : -1;
    if (stage !== lastComboStage) {
      lastComboStage = stage;
      if (stage >= 0) hitThisSwing.clear();
    }

    const sword = bunnySpriter.getPart(SWORD_PART);
    if (sword && player.state === 'attack') {
      tipLocal.x = SWORD_TIP_LOCAL_X * player.swordLengthFactor; // Sword Booster reach
      const hilt = effectsLayer.toLocal(sword.toGlobal(hiltLocal));
      const tip = effectsLayer.toLocal(sword.toGlobal(tipLocal));
      swipeTrail.addSample(hilt, tip);

      for (const enemy of wave.enemies) {
        if (!enemy.alive || enemy.invincible || hitThisSwing.has(enemy)) continue;
        if (distToSegment(enemy.x, enemy.y - 35, hilt.x, hilt.y, tip.x, tip.y) < ENEMY_HIT_RADIUS) {
          hitThisSwing.add(enemy);
          const wasAlive = enemy.alive;
          enemy.hurt(player.swordDamage * player.damageMultiplier, player.facing);
          audio.playRandom(['enemyHurt_01', 'enemyHurt_02', 'enemyHurt_03']);
          hitstop.freeze(0.05);
          shake.add(!enemy.alive ? 5 : 2.5);
          if (wasAlive && !enemy.alive) onEnemyKilled(enemy);
        }
      }
    } else {
      swipeTrail.break_();
    }

    // enemies vs player (contact damage with dwell timers, like the original)
    if (!player.dead && !player.hasIFrames) {
      for (const enemy of wave.enemies) {
        if (!enemy.alive || !enemy.canDamage || enemy.frozenTimer > 0) continue;
        const overlap = Math.abs(enemy.x - player.x) < 48 && Math.abs(enemy.y - 35 - (player.y - 40)) < 60;
        if (overlap) {
          enemy.contactTime += FIXED_DT;
          if (enemy.contactTime >= enemy.type.timeToDamage) {
            enemy.contactTime = 0;
            if (player.hurt(enemy.type.attackDmg, player.x < enemy.x ? -1 : 1)) {
              shake.add(6);
              hitstop.freeze(0.06);
            }
            break;
          }
        } else {
          enemy.contactTime = 0;
        }
      }
    }
  }

  // ---- HUD ----
  const hud = new Container();
  app.stage.addChild(hud);

  const hpBack = new Graphics().roundRect(10, 10, 154, 16, 4).fill({ color: 0x000000, alpha: 0.55 });
  const hpBar = new Graphics();
  const scoreText = new Text({ text: '', style: { fontFamily: 'Verdana', fontSize: 13, fill: 0xffffff, fontWeight: 'bold' } });
  scoreText.position.set(180, 10);
  const waveText = new Text({ text: '', style: { fontFamily: 'Verdana', fontSize: 11, fill: 0xcccccc } });
  waveText.position.set(10, 30);

  const coinIcon = new Sprite(effectsAtlas.get('Coin_Gold'));
  coinIcon.position.set(640, 8);
  coinIcon.scale.set(0.7);
  const coinText = new Text({ text: '0', style: { fontFamily: 'Verdana', fontSize: 13, fill: 0xffe066, fontWeight: 'bold' } });
  coinText.position.set(666, 10);
  const starIcon = new Sprite(effectsAtlas.get('NinjaStar'));
  starIcon.position.set(720, 8);
  starIcon.scale.set(0.6);
  const starText = new Text({ text: '', style: { fontFamily: 'Verdana', fontSize: 13, fill: 0xffffff, fontWeight: 'bold' } });
  starText.position.set(748, 10);

  const levelText = new Text({ text: '', style: { fontFamily: 'Verdana', fontSize: 30, fill: 0xffffff, fontWeight: 'bold' } });
  levelText.anchor.set(0.5);
  levelText.position.set(STAGE_W / 2, 90);

  const centerText = new Text({ text: '', style: { fontFamily: 'Verdana', fontSize: 30, fill: 0xffe066, fontWeight: 'bold', align: 'center' } });
  centerText.anchor.set(0.5);
  centerText.position.set(STAGE_W / 2, STAGE_H / 2 - 50);

  let bossWarnTimer = 0;
  const bossWarnText = new Text({ text: '! WARNING !', style: { fontFamily: 'Verdana', fontSize: 42, fill: 0xff3030, fontWeight: 'bold', stroke: { color: 0x000000, width: 5 } } });
  bossWarnText.anchor.set(0.5);
  bossWarnText.position.set(STAGE_W / 2, 160);
  bossWarnText.visible = false;

  const bossBarBack = new Graphics().roundRect(150, 446, 504, 18, 5).fill({ color: 0x000000, alpha: 0.6 });
  const bossBar = new Graphics();
  const bossName = new Text({ text: '', style: { fontFamily: 'Verdana', fontSize: 11, fill: 0xffdddd, fontWeight: 'bold' } });
  bossName.anchor.set(0.5, 1);
  bossName.position.set(STAGE_W / 2, 446);

  hud.addChild(hpBack, hpBar, scoreText, waveText, coinIcon, coinText, starIcon, starText, levelText, centerText, bossWarnText, bossBarBack, bossBar, bossName, spells);

  function drawHud(): void {
    const ratio = Math.max(0, player.hp / player.maxHp);
    hpBar.clear();
    hpBar.roundRect(12, 12, 150 * ratio, 12, 3).fill({ color: ratio > 0.35 ? 0x4dff6a : 0xff4d4d });
    // armor pool (in-run shop) — thin blue bar under the health bar
    if (player.armorHp > 0 && armorMax > 0) {
      hpBar.roundRect(12, 26, 150 * Math.min(1, player.armorHp / armorMax), 4, 2).fill({ color: 0x5db9ff });
    }
    scoreText.text = `Score ${score}`;
    coinText.text = String(coins);
    starText.text = String(starAmmo);
    if (wave) {
      waveText.text = wave.levelComplete
        ? ''
        : `wave ${Math.max(0, wave.segmentIndex) + 1}  ·  kills ${wave.killsThisSegment}/${wave.currentQuota || '–'}`;
    }
    if (player.dead) {
      centerText.text = 'YOU DIED\nR / Start: retry  ·  T: title';
      centerText.style.fill = 0xff5555;
    } else if (gameComplete) {
      centerText.text = `GAME COMPLETE!\nscore ${score}  ·  T: title`;
      centerText.style.fill = 0xffe066;
    } else if (wave?.levelComplete && !scoreScreen.visible) {
      centerText.text = 'LEVEL CLEAR!';
      centerText.style.fill = 0xffe066;
    } else {
      centerText.text = '';
    }
    if (levelText.alpha > 0) levelText.alpha -= 0.005;

    if (bossWarnTimer > 0) {
      bossWarnTimer -= 1 / 60;
      bossWarnText.visible = true;
      bossWarnText.alpha = 0.55 + 0.45 * Math.sin(bossWarnTimer * 14); // pulse
      bossWarnText.scale.set(1 + 0.06 * Math.sin(bossWarnTimer * 14));
    } else {
      bossWarnText.visible = false;
    }

    const boss = wave?.boss;
    const showBoss = !!boss && boss.alive;
    bossBarBack.visible = bossBar.visible = bossName.visible = showBoss;
    if (boss && showBoss) {
      const r = Math.max(0, boss.hp / boss.type.hp);
      bossBar.clear();
      bossBar.roundRect(153, 449, 498 * r, 12, 4).fill({ color: 0xe83b3b });
      bossName.text = boss.type.name.toUpperCase();
    }
  }

  /** new-run reset: meta upgrades on, run-shop purchases off */
  function startFreshRun(): void {
    score = 0;
    runKills = 0;
    apFloat = 0;
    bossesThisLevel = 0;
    starAmmo = STARTING_STARS;
    gameComplete = false;
    scoreScreenPending = false;
    scoreScreen.visible = false;
    resetRunShop();
    balloons.reset();
    player.applyFightUpgrades(save.fight);
    player.resetRunStats();
    stars.damage = 10 + 5 * save.fight.damage;
    spells.setSpellLevels(save.spells);
  }

  function restart(): void {
    bankProgress(false);
    startFreshRun();
    player.respawn(400);
    void loadLevel(levelIndex);
  }

  function gotoTitle(): void {
    bankProgress(false);
    score = 0;
    gameComplete = false;
    atTitle = true;
    title.visible = true;
    title.refresh(save);
    audio.playMusic('menu_title', 1);
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR' && player.dead && !atTitle) restart();
    if (e.code === 'KeyT' && (player.dead || gameComplete) && !atTitle) gotoTitle();
  });

  // ---- debug tooling (Phase A): panel + console hooks ----
  let gameSpeed = 1;
  let showHitboxes = false;
  const hitboxGfx = new Graphics();
  effectsLayer.addChild(hitboxGfx);

  function debugGotoLevel(n: number): void {
    levelIndex = Math.max(0, Math.min(LEVELS.length - 1, n - 1));
    if (atTitle) {
      atTitle = false;
      title.visible = false;
      player.respawn(400);
    }
    gameComplete = false;
    void loadLevel(levelIndex);
  }

  const debugPanel = new DebugPanel({
    levelCount: LEVELS.length,
    gotoLevel: debugGotoLevel,
    bossNow: () => wave?.skipToBoss(),
    spawnEnemy: (name) => wave?.spawnNamed(name),
    enemyNames: () => [...(typesByCategory.get(LEVELS[levelIndex].category)?.types.keys() ?? [])],
    giveCoins: (n) => {
      coins += n;
    },
    giveStars: (n) => {
      starAmmo += n;
    },
    giveAp: (n) => {
      save.ap += n;
      writeSave(save);
      title.refresh(save);
    },
    triggerChest: () => startChest(Math.min(10, levelIndex)),
    triggerShopkeeper: () => void spawnShopkeeper(),
    fullHeal: () => {
      player.hp = player.maxHp;
    },
    toggleGod: () => {
      player.godMode = !player.godMode;
      return player.godMode;
    },
    killAll: () => {
      for (const e of wave?.enemies ?? []) {
        if (e.alive) damageEnemy(e, 999999, 1);
      }
    },
    resetCooldowns: () => spells.resetCooldowns(),
    setGameSpeed: (s) => {
      gameSpeed = s;
    },
    toggleHitboxes: () => {
      showHitboxes = !showHitboxes;
      if (!showHitboxes) hitboxGfx.clear();
      return showHitboxes;
    },
  });

  function drawHitboxes(): void {
    hitboxGfx.clear();
    if (!showHitboxes || !wave) return;
    // enemy body radii (sword-hit circles) + contact boxes
    for (const e of wave.enemies) {
      if (!e.alive) continue;
      hitboxGfx.circle(e.x, e.y - 35, ENEMY_HIT_RADIUS).stroke({ color: 0xff5555, width: 1.5 });
    }
    // player contact box (combatTick: |dx|<48, |dy|<60 around y-40)
    hitboxGfx.rect(player.x - 48, player.y - 40 - 60, 96, 120).stroke({ color: 0x4dff6a, width: 1.5 });
    // sword segment while attacking
    const sword = bunnySpriter.getPart(SWORD_PART);
    if (sword && player.state === 'attack') {
      const hilt = effectsLayer.toLocal(sword.toGlobal(hiltLocal));
      const tip = effectsLayer.toLocal(sword.toGlobal(tipLocal));
      hitboxGfx.moveTo(hilt.x, hilt.y).lineTo(tip.x, tip.y).stroke({ color: 0x5db9ff, width: 2 });
    }
  }

  // console hooks (kept for scripted browser testing)
  (window as any).__gotoLevel = debugGotoLevel;
  (window as any).__bossNow = () => wave?.skipToBoss();
  (window as any).__spawn = (name: string) => wave?.spawnNamed(name);
  (window as any).__god = () => (player.godMode = !player.godMode);
  (window as any).__give = (c = 500, s = 30) => {
    coins += c;
    starAmmo += s;
  };
  (window as any).__speed = (s: number) => (gameSpeed = s);
  (window as any).__chest = () => startChest(Math.min(10, levelIndex));
  (window as any).__player = player;
  (window as any).__balloons = balloons;
  (window as any).__balloonNow = (kind: 'health' | 'invince' = 'health', level = 2) => {
    balloons.enable(kind, level);
    (balloons as any).timers[kind] = 0.1;
  };
  (window as any).__shop = () => void spawnShopkeeper();
  (window as any).__ap = (n = 1000) => {
    save.ap += n;
    writeSave(save);
  };

  // ---- title screen ----
  const title = new TitleScreen(save, LEVELS.length, effectsAtlas);
  app.stage.addChild(title);
  title.onStart = (lvl, loadout) => {
    save.loadout = loadout;
    writeSave(save);
    spells.setLoadout(loadout);
    levelIndex = lvl;
    startFreshRun();
    atTitle = false;
    title.visible = false;
    player.respawn(400);
    void loadLevel(levelIndex);
  };
  audio.playMusic('menu_title', 1.5);

  // ---- AP meta-shop overlay (S on the title screen) ----
  const metaShop = new MetaShop(save, storeAtlas, effectsAtlas);
  app.stage.addChild(scoreScreen, metaShop);
  metaShop.onChanged = () => {
    title.locked = metaShop.visible;
    title.refresh(save);
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyS' && atTitle && !metaShop.visible) {
      metaShop.open();
      title.locked = true;
    }
  });

  // ---- fixed-timestep loop ----
  let accumulator = 0;
  app.ticker.add((ticker) => {
    accumulator += Math.min(ticker.deltaMS / 1000, 0.1) * gameSpeed;
    while (accumulator >= FIXED_DT) {
      accumulator -= FIXED_DT;
      input.update(FIXED_DT);

      if (atTitle) {
        if (metaShop.visible) metaShop.pollInput(input);
        else title.pollInput(input);
        input.postUpdate();
        continue;
      }

      if (hitstop.update(FIXED_DT)) {
        input.postUpdate();
        continue;
      }

      // shop browsing pauses the world (the segment itself is enemy-free)
      if (shopkeeper?.uiOpen) {
        shopkeeper.pollInput(input);
        shopkeeper.update(FIXED_DT, player);
        input.postUpdate();
        continue;
      }

      // score tally pauses the world until the player continues
      if (scoreScreen.visible) {
        scoreScreen.update(FIXED_DT);
        scoreScreen.pollInput(input);
        input.postUpdate();
        continue;
      }

      if (player.dead && input.justPressed('pause')) restart();
      if (input.justPressed('spell1')) spells.cast(0);
      if (input.justPressed('spell2')) spells.cast(1);

      if (slowMoTimer > 0) {
        slowMoTimer -= FIXED_DT;
        if (slowMoTimer <= 0) enemyTimeScale = 1;
      }

      player.update(FIXED_DT);
      if (shopkeeper) {
        shopkeeper.update(FIXED_DT, player);
        if (shopkeeper.state === 'gone') disposeShopkeeper();
      }
      if (wave) {
        wave.update(FIXED_DT * enemyTimeScale, player);
        if (wave.needsBoss !== null) void spawnBoss(wave.needsBoss);
        if (wave.needsChest !== null) {
          startChest(wave.needsChest);
          wave.chestSpawned();
        }
        if (wave.needsShopkeeper) {
          void spawnShopkeeper();
          wave.shopkeeperSpawned();
        }
        combatTick();
        wave.cleanup();
        stars.update(wave.enemies);
        bossShots.update(FIXED_DT * enemyTimeScale, player.x, player.y, !player.dead && !player.hasIFrames);
        enemyShots.update(FIXED_DT * enemyTimeScale, player.x, player.y, !player.dead && !player.hasIFrames);

        // level complete → score tally (original gotoScoreScreen)
        if (wave.levelComplete && !gameComplete && !scoreScreenPending && !player.dead) {
          levelClearTimer += FIXED_DT;
          if (levelClearTimer > 1.6) showScoreScreen();
        }
      }
      pickups.update(FIXED_DT, player.x, player.y);
      balloons.update(FIXED_DT, player.x, player.y, !player.dead);
      updateChest();
      swipeTrail.update(FIXED_DT);
      bursts.update(FIXED_DT);
      shake.update(FIXED_DT);
      spells.update(FIXED_DT);
      if (screenFlash.alpha > 0) screenFlash.alpha = Math.max(0, screenFlash.alpha - FIXED_DT * 1.6);
      input.postUpdate();
    }
    drawHud();
    drawHitboxes();
  });
}
