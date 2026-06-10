/**
 * Game shell — level 1 with wave-spawned enemies and full combat loop.
 * Fixed 60Hz simulation (the original's per-frame constants depend on it),
 * rendering at display rate.
 */
import { Application, Assets, Container, Graphics, Point, Sprite, Text, Texture } from 'pixi.js';
import { loadStarlingAtlas } from '../assets/starlingAtlas';
import { parseScon } from '../spriter/parseScon';
import { SpriterPlayer } from '../spriter/SpriterPlayer';
import { loadEnemyTypes, loadSegments } from './data/levelData';
import { Enemy } from './Enemy';
import { Input } from './Input';
import { Hitstop, ParticleBursts, ScreenShake } from './Juice';
import { PlayerController, GROUND_Y } from './PlayerController';
import { SwipeTrail } from './SwipeTrail';
import { WaveManager } from './WaveManager';

export const STAGE_W = 800;
export const STAGE_H = 480;
const FIXED_DT = 1 / 60;

const SWORD_PART = 'Bunny_Sword1';
const SWORD_TIP_LOCAL_X = -153; // blade extends from the hilt pivot (0,0) to local (-153, 0)
const SWORD_DAMAGE = 30; // original BUNNY_DEFAULT_DMG_SWORD
const ENEMY_HIT_RADIUS = 42; // approximate enemy body radius at 0.55 scale

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

  // ---- load level 1 assets + data ----
  const [bgTexture, bunnyScon, bunnyAtlas, fruitScon, fruitAtlas, enemyLevels, segmentLevels] = await Promise.all([
    Assets.load<Texture>('assets/textures/stages/level01.jpg'),
    fetch('assets/scml/bunny_scon.scon').then((r) => r.json()),
    loadStarlingAtlas('assets/textureAtlas/bunny/TA_Bunny-hd.xml'),
    fetch('assets/scml/fruit_scon.scon').then((r) => r.json()),
    loadStarlingAtlas('assets/textureAtlas/enemies/fruit/fruit_enemies-hd.xml'),
    loadEnemyTypes(),
    loadSegments(),
  ]);

  const shakeRoot = new Container();
  app.stage.addChild(shakeRoot);

  const world = new Container();
  shakeRoot.addChild(world);

  const bg = new Sprite(bgTexture);
  bg.width = STAGE_W;
  bg.height = STAGE_H;
  world.addChild(bg);

  const enemyLayer = new Container();
  world.addChild(enemyLayer);

  const characterLayer = new Container();
  world.addChild(characterLayer);

  const effectsLayer = new Container();
  world.addChild(effectsLayer);

  const bunnySpriter = new SpriterPlayer('bunny', parseScon(bunnyScon), bunnyAtlas);
  characterLayer.addChild(bunnySpriter);

  const swipeTrail = new SwipeTrail();
  effectsLayer.addChild(swipeTrail);
  const bursts = new ParticleBursts();
  effectsLayer.addChild(bursts);

  const input = new Input();
  const player = new PlayerController(bunnySpriter, input);
  const shake = new ScreenShake(shakeRoot);
  const hitstop = new Hitstop();

  const fruitData = parseScon(fruitScon);
  const fruitTypes = enemyLevels[0].types;
  let wave = new WaveManager(segmentLevels[0], fruitTypes, fruitData, fruitAtlas, enemyLayer);
  let score = 0;

  // ---- sword swing tracking ----
  const hiltLocal = new Point(0, 0);
  const tipLocal = new Point(SWORD_TIP_LOCAL_X, 0);
  let swingId = 0;
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
    // detect new swing for the once-per-swing hit set
    const stage = player.state === 'attack' ? player.comboStageIndex : -1;
    if (stage !== lastComboStage) {
      lastComboStage = stage;
      if (stage >= 0) {
        swingId++;
        hitThisSwing.clear();
      }
    }

    const sword = bunnySpriter.getPart(SWORD_PART);
    if (sword && player.state === 'attack') {
      const hilt = effectsLayer.toLocal(sword.toGlobal(hiltLocal));
      const tip = effectsLayer.toLocal(sword.toGlobal(tipLocal));
      swipeTrail.addSample(hilt, tip);

      // sword vs enemies
      for (const enemy of wave.enemies) {
        if (!enemy.alive || enemy.invincible || hitThisSwing.has(enemy)) continue;
        const cx = enemy.x;
        const cy = enemy.y - 35; // body center above feet
        if (distToSegment(cx, cy, hilt.x, hilt.y, tip.x, tip.y) < ENEMY_HIT_RADIUS) {
          hitThisSwing.add(enemy);
          const killed = enemy.hurt(SWORD_DAMAGE, player.facing);
          hitstop.freeze(0.05);
          shake.add(enemy.hp <= 0 ? 5 : 2.5);
          if (killed && !enemy.alive) {
            wave.onKill();
            score += enemy.type.pointsAward;
            bursts.burst(enemy.x, enemy.y, enemy.type.deathPS);
          }
        }
      }
    } else {
      swipeTrail.break_();
    }

    // enemies vs player (contact damage with dwell timers, like the original)
    if (!player.dead && !player.hasIFrames) {
      for (const enemy of wave.enemies) {
        if (!enemy.alive || !enemy.canDamage) continue;
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
  const scoreText = new Text({ text: 'Score 0', style: { fontFamily: 'Verdana', fontSize: 13, fill: 0xffffff, fontWeight: 'bold' } });
  scoreText.position.set(180, 10);
  const waveText = new Text({ text: '', style: { fontFamily: 'Verdana', fontSize: 11, fill: 0xcccccc } });
  waveText.position.set(10, 30);
  hud.addChild(hpBack, hpBar, scoreText, waveText);

  const deathText = new Text({
    text: 'YOU DIED\npress R / Start to respawn',
    style: { fontFamily: 'Verdana', fontSize: 28, fill: 0xff5555, fontWeight: 'bold', align: 'center' },
  });
  deathText.anchor.set(0.5);
  deathText.position.set(STAGE_W / 2, STAGE_H / 2 - 40);
  deathText.visible = false;
  hud.addChild(deathText);

  const winText = new Text({
    text: 'LEVEL CLEAR!',
    style: { fontFamily: 'Verdana', fontSize: 36, fill: 0xffe066, fontWeight: 'bold', align: 'center' },
  });
  winText.anchor.set(0.5);
  winText.position.set(STAGE_W / 2, STAGE_H / 2 - 60);
  winText.visible = false;
  hud.addChild(winText);

  function drawHud(): void {
    const ratio = Math.max(0, player.hp / player.maxHp);
    hpBar.clear();
    hpBar.roundRect(12, 12, 150 * ratio, 12, 3).fill({ color: ratio > 0.35 ? 0x4dff6a : 0xff4d4d });
    scoreText.text = `Score ${score}`;
    waveText.text = wave.levelComplete
      ? `cleared! kills: ${wave.totalKills}`
      : `wave ${Math.max(0, wave.segmentIndex) + 1}  ·  kills ${wave.killsThisSegment}/${wave.currentQuota || '–'}`;
    deathText.visible = player.dead;
    winText.visible = wave.levelComplete;
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR' && player.dead) restart();
  });

  function restart(): void {
    for (const e of wave.enemies) {
      e.spriter.parent?.removeChild(e.spriter);
      e.spriter.destroy();
    }
    wave = new WaveManager(segmentLevels[0], fruitTypes, fruitData, fruitAtlas, enemyLayer);
    score = 0;
    player.respawn(400);
  }

  // ---- fixed-timestep loop ----
  let accumulator = 0;
  app.ticker.add((ticker) => {
    accumulator += Math.min(ticker.deltaMS / 1000, 0.1);
    while (accumulator >= FIXED_DT) {
      accumulator -= FIXED_DT;
      input.update(FIXED_DT);

      if (hitstop.update(FIXED_DT)) {
        input.postUpdate();
        continue; // world frozen for impact
      }

      if (player.dead && input.justPressed('pause')) restart();

      player.update(FIXED_DT);
      wave.update(FIXED_DT, player);
      combatTick();
      wave.cleanup();
      swipeTrail.update(FIXED_DT);
      bursts.update(FIXED_DT);
      shake.update(FIXED_DT);
      input.postUpdate();
    }
    drawHud();
  });
}
