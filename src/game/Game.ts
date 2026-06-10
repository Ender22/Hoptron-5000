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
import { Boss } from './Boss';
import { Enemy } from './Enemy';
import { Input } from './Input';
import { BossShots, Hitstop, ParticleBursts, ScreenShake } from './Juice';
import { NinjaStars } from './NinjaStars';
import { Pickups } from './Pickups';
import { PlayerController } from './PlayerController';
import { loadSave, writeSave } from './SaveData';
import { SpellSystem } from './Spells';
import { SwipeTrail } from './SwipeTrail';
import { TitleScreen } from './TitleScreen';
import { WaveManager } from './WaveManager';

export const STAGE_W = 800;
export const STAGE_H = 480;
const FIXED_DT = 1 / 60;

const SWORD_PART = 'Bunny_Sword1';
const SWORD_TIP_LOCAL_X = -153; // blade extends from the hilt pivot (0,0) to local (-153, 0)
const SWORD_DAMAGE = 30; // original BUNNY_DEFAULT_DMG_SWORD
const ENEMY_HIT_RADIUS = 42; // approximate enemy body radius at 0.55 scale
const STARTING_STARS = 30; // one original "Ninja Star Pack"

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
];

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
  const [bunnyScon, bunnyAtlas, effectsAtlas, enemyLevels, segmentLevels] = await Promise.all([
    fetch('assets/scml/bunny_scon.scon').then((r) => r.json()),
    loadStarlingAtlas('assets/textureAtlas/bunny/TA_Bunny-hd.xml'),
    loadStarlingAtlas('assets/textureAtlas/effects/effectAtlas-hd.xml'),
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

  const input = new Input();
  const player = new PlayerController(bunnySpriter, input);
  const shake = new ScreenShake(shakeRoot);
  const hitstop = new Hitstop();

  audio.loadFx([
    'bunny_drawSword', 'jumpSound', 'bunny_hurt', 'you_died', 'slide_to_stop',
    'swipe1_01', 'swipe1_02', 'swipe1_03', 'swipe2_01', 'swipe2_02', 'swipe3_01', 'swipe4_01',
    'enemyHurt_01', 'enemyHurt_02', 'enemyHurt_03', 'pickup_coin_silver', 'pickup_coin_gold',
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

  function bankProgress(unlockNext: boolean): void {
    if (unlockNext && levelIndex + 1 < LEVELS.length) {
      save.furthestLevel = Math.max(save.furthestLevel, levelIndex + 1);
    }
    save.bestScore = Math.max(save.bestScore, score);
    save.totalCoins += coins;
    coins = 0;
    writeSave(save);
  }

  pickups.onCoins = (amount) => {
    coins += amount;
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
    score += enemy.type.pointsAward;
    bursts.burst(enemy.x, enemy.y, enemy.type.deathPS, enemy instanceof Boss ? 42 : 16);
    pickups.dropFrom(enemy.x, enemy.y, enemy.type.loot);
    if (enemy instanceof Boss) {
      shake.add(10);
      bossShots.clearAll();
    }
  }

  // ---- spells ----
  const screenFlash = new Graphics().rect(0, 0, STAGE_W, STAGE_H).fill(0xffffff);
  screenFlash.alpha = 0;
  app.stage.addChild(screenFlash);
  let flashColor = 0xffffff;

  const spells = new SpellSystem(
    {
      player,
      enemies: () => wave?.enemies ?? [],
      stars,
      bursts,
      shake,
      damage: (enemy, amount, dir) => {
        const wasAlive = enemy.alive;
        enemy.frozenTimer = 0;
        enemy.invincible = false;
        enemy.hurt(amount, dir);
        if (wasAlive && !enemy.alive) onEnemyKilled(enemy);
      },
      flash: (color, alpha) => {
        flashColor = color;
        screenFlash.tint = color;
        screenFlash.alpha = alpha;
      },
    },
    effectsAtlas,
    ['freeze', 'ninjaRain'],
  );

  (window as any).__equip = (a: string, b: string) => spells.setLoadout([a, b]);

  // ---- boss spawning ----
  let bossLoading = false;

  bossShots.onPlayerHit = () => {
    const boss = wave?.boss;
    if (player.hurt(boss ? Math.max(4, boss.type.attackDmg * 0.6) : 6, player.facing * -1)) {
      shake.add(5);
    }
  };

  async function spawnBoss(bossId: number): Promise<void> {
    if (bossLoading || !wave) return;
    bossLoading = true;
    try {
      const def = LEVELS[levelIndex];
      const bossList = typesByCategory.get(def.category)?.bosses ?? [];
      const type = bossList[Math.min(bossId, bossList.length - 1)];
      if (!type) {
        console.warn(`[boss] no boss ${bossId} for ${def.category}`);
        wave.levelComplete = true;
        return;
      }
      let cached = sconCache.get(type.scon);
      if (!cached) {
        const [sconJson, textures] = await Promise.all([
          fetch(`assets/scml/${type.scon}.scon`).then((r) => r.json()),
          loadStarlingAtlas(`assets/textureAtlas/${def.atlas}.xml`),
        ]);
        cached = { data: parseScon(sconJson), textures };
        sconCache.set(type.scon, cached);
      }
      if (!wave || wave.needsBoss === null) return; // level changed while loading

      const spriter = new SpriterPlayer(`boss-${type.name}`, cached.data, cached.textures);
      const boss = new Boss(type, spriter);
      boss.onShoot = (x, y, vx, vy) => bossShots.fire(x, y, vx, vy);
      boss.onLand = () => shake.add(8);
      boss.spawnAt(620, type.effectedByGravity ? 0 : 160); // drops in / flies in
      enemyLayer.addChild(spriter);
      wave.bossSpawned(boss);
      console.log(`[boss] ${type.name} spawned (hp ${type.hp})`);
    } finally {
      bossLoading = false;
    }
  }

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
        e.spriter.parent?.removeChild(e.spriter);
        e.spriter.destroy();
      }
      old.enemies.length = 0;
    }
    pickups.clear();
    stars.clear();

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

    const types = typesByCategory.get(def.category)!.types;
    if (levelIndex !== n) return; // a newer load superseded this one
    wave = new WaveManager(segmentLevels[n], types, cached.data, cached.textures, enemyLayer);
    audio.playMusic(def.music, 1.5);
    levelText.text = `Level ${n + 1}`;
    levelText.alpha = 1;
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
      const hilt = effectsLayer.toLocal(sword.toGlobal(hiltLocal));
      const tip = effectsLayer.toLocal(sword.toGlobal(tipLocal));
      swipeTrail.addSample(hilt, tip);

      for (const enemy of wave.enemies) {
        if (!enemy.alive || enemy.invincible || hitThisSwing.has(enemy)) continue;
        if (distToSegment(enemy.x, enemy.y - 35, hilt.x, hilt.y, tip.x, tip.y) < ENEMY_HIT_RADIUS) {
          hitThisSwing.add(enemy);
          const wasAlive = enemy.alive;
          enemy.hurt(SWORD_DAMAGE * player.damageMultiplier, player.facing);
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

  const bossBarBack = new Graphics().roundRect(150, 446, 504, 18, 5).fill({ color: 0x000000, alpha: 0.6 });
  const bossBar = new Graphics();
  const bossName = new Text({ text: '', style: { fontFamily: 'Verdana', fontSize: 11, fill: 0xffdddd, fontWeight: 'bold' } });
  bossName.anchor.set(0.5, 1);
  bossName.position.set(STAGE_W / 2, 446);

  hud.addChild(hpBack, hpBar, scoreText, waveText, coinIcon, coinText, starIcon, starText, levelText, centerText, bossBarBack, bossBar, bossName, spells);

  function drawHud(): void {
    const ratio = Math.max(0, player.hp / player.maxHp);
    hpBar.clear();
    hpBar.roundRect(12, 12, 150 * ratio, 12, 3).fill({ color: ratio > 0.35 ? 0x4dff6a : 0xff4d4d });
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
    } else if (wave?.levelComplete) {
      centerText.text = 'LEVEL CLEAR!';
      centerText.style.fill = 0xffe066;
    } else {
      centerText.text = '';
    }
    if (levelText.alpha > 0) levelText.alpha -= 0.005;

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

  function restart(): void {
    bankProgress(false);
    score = 0;
    starAmmo = STARTING_STARS;
    gameComplete = false;
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

  // dev hooks: jump to a level / boss from the console
  (window as any).__gotoLevel = (n: number) => {
    levelIndex = Math.max(0, Math.min(LEVELS.length - 1, n - 1));
    void loadLevel(levelIndex);
  };
  (window as any).__bossNow = () => wave?.skipToBoss();

  // ---- title screen ----
  const title = new TitleScreen(save, LEVELS.length, effectsAtlas);
  app.stage.addChild(title);
  title.onStart = (lvl, loadout) => {
    save.loadout = loadout;
    writeSave(save);
    spells.setLoadout(loadout);
    levelIndex = lvl;
    score = 0;
    starAmmo = STARTING_STARS;
    gameComplete = false;
    atTitle = false;
    title.visible = false;
    player.respawn(400);
    void loadLevel(levelIndex);
  };
  audio.playMusic('menu_title', 1.5);

  // ---- fixed-timestep loop ----
  let accumulator = 0;
  app.ticker.add((ticker) => {
    accumulator += Math.min(ticker.deltaMS / 1000, 0.1);
    while (accumulator >= FIXED_DT) {
      accumulator -= FIXED_DT;
      input.update(FIXED_DT);

      if (atTitle) {
        title.pollInput(input);
        input.postUpdate();
        continue;
      }

      if (hitstop.update(FIXED_DT)) {
        input.postUpdate();
        continue;
      }

      if (player.dead && input.justPressed('pause')) restart();
      if (input.justPressed('spell1')) spells.cast(0);
      if (input.justPressed('spell2')) spells.cast(1);

      player.update(FIXED_DT);
      if (wave) {
        wave.update(FIXED_DT, player);
        if (wave.needsBoss !== null) void spawnBoss(wave.needsBoss);
        combatTick();
        wave.cleanup();
        stars.update(wave.enemies);
        bossShots.update(FIXED_DT, player.x, player.y, !player.dead && !player.hasIFrames);

        // level progression
        if (wave.levelComplete && !gameComplete) {
          levelClearTimer += FIXED_DT;
          if (levelClearTimer > 3.5) {
            bankProgress(true);
            if (levelIndex + 1 < LEVELS.length) {
              levelIndex++;
              player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.5);
              void loadLevel(levelIndex);
            } else {
              gameComplete = true;
              audio.playMusic('afterboss', 1);
            }
          }
        }
      }
      pickups.update(FIXED_DT, player.x, player.y);
      swipeTrail.update(FIXED_DT);
      bursts.update(FIXED_DT);
      shake.update(FIXED_DT);
      spells.update(FIXED_DT);
      if (screenFlash.alpha > 0) screenFlash.alpha = Math.max(0, screenFlash.alpha - FIXED_DT * 1.6);
      input.postUpdate();
    }
    drawHud();
  });
}
