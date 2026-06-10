/**
 * Game shell — level 1 stage with a controllable Hoptron.
 * Fixed 60Hz simulation (the original's per-frame constants depend on it),
 * rendering at display rate.
 */
import { Application, Assets, Container, Point, Sprite, Text, Texture } from 'pixi.js';
import { loadStarlingAtlas } from '../assets/starlingAtlas';
import { parseScon } from '../spriter/parseScon';
import { SpriterPlayer } from '../spriter/SpriterPlayer';
import { Input } from './Input';
import { PlayerController } from './PlayerController';
import { SwipeTrail } from './SwipeTrail';

const SWORD_PART = 'Bunny_Sword1';
const SWORD_TIP_LOCAL_X = -153; // blade extends from the hilt pivot (0,0) to local (-153, 0)

export const STAGE_W = 800;
export const STAGE_H = 480;
const FIXED_DT = 1 / 60;

export async function startGame(root: HTMLElement): Promise<void> {
  root.innerHTML = '';
  const app = new Application();
  await app.init({ width: STAGE_W, height: STAGE_H, background: 0x000000, antialias: true });
  root.appendChild(app.canvas);

  // letterbox-fit the canvas to the window
  const fit = () => {
    const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    app.canvas.style.width = `${STAGE_W * scale}px`;
    app.canvas.style.height = `${STAGE_H * scale}px`;
    app.canvas.style.display = 'block';
    app.canvas.style.margin = `${Math.max(0, (window.innerHeight - STAGE_H * scale) / 2)}px auto 0`;
  };
  fit();
  window.addEventListener('resize', fit);

  // ---- load level 1 ----
  const [bgTexture, bunnyScon, bunnyAtlas] = await Promise.all([
    Assets.load<Texture>('assets/textures/stages/level01.jpg'),
    fetch('assets/scml/bunny_scon.scon').then((r) => r.json()),
    loadStarlingAtlas('assets/textureAtlas/bunny/TA_Bunny-hd.xml'),
  ]);

  const world = new Container();
  app.stage.addChild(world);

  const bg = new Sprite(bgTexture);
  bg.width = STAGE_W;
  bg.height = STAGE_H;
  world.addChild(bg);

  const characterLayer = new Container();
  world.addChild(characterLayer);

  const bunnySpriter = new SpriterPlayer('bunny', parseScon(bunnyScon), bunnyAtlas);
  characterLayer.addChild(bunnySpriter);

  const effectsLayer = new Container();
  world.addChild(effectsLayer);

  const swipeTrail = new SwipeTrail();
  effectsLayer.addChild(swipeTrail);

  const input = new Input();
  const player = new PlayerController(bunnySpriter, input);

  const hiltLocal = new Point(0, 0);
  const tipLocal = new Point(SWORD_TIP_LOCAL_X, 0);
  function sampleSword(): void {
    const sword = bunnySpriter.getPart(SWORD_PART);
    if (sword && player.state === 'attack') {
      const hilt = effectsLayer.toLocal(sword.toGlobal(hiltLocal));
      const tip = effectsLayer.toLocal(sword.toGlobal(tipLocal));
      swipeTrail.addSample(hilt, tip);
    } else {
      swipeTrail.break_();
    }
  }

  // debug HUD
  const debug = new Text({
    text: '',
    style: { fontFamily: 'monospace', fontSize: 11, fill: 0xffffff },
  });
  debug.position.set(6, 6);
  debug.alpha = 0.7;
  app.stage.addChild(debug);

  // ---- fixed-timestep loop ----
  let accumulator = 0;
  app.ticker.add((ticker) => {
    accumulator += Math.min(ticker.deltaMS / 1000, 0.1); // clamp to avoid spiral after tab-out
    while (accumulator >= FIXED_DT) {
      input.update(FIXED_DT);
      player.update(FIXED_DT);
      sampleSword();
      swipeTrail.update(FIXED_DT);
      input.postUpdate();
      accumulator -= FIXED_DT;
    }
    debug.text =
      `${player.state}  anim:${bunnySpriter.currentAnimationName}  ` +
      `x:${player.x.toFixed(0)} y:${player.y.toFixed(0)} vx:${player.xVel.toFixed(1)} vy:${player.yVel.toFixed(1)}\n` +
      `A/D or ←/→ move · Space/W jump (×2) · J/X attack · K/C dash · gamepad supported`;
  });
}
