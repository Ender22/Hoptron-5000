/**
 * Enemy & boss projectiles using the original XML <projectileType> data:
 * real atlas sprites (Watermelon_Seed, OneCorn, Pie_Cherry...), per-def
 * gravity / lifetime / damage, plus the two special AIs from the original:
 * FryMissile (delayed homing) and boomerang (Pumpkin_Top, BigSushi_Fish).
 */
import { Container, Sprite } from 'pixi.js';
import type { TextureMap } from '../assets/starlingAtlas';
import type { ProjectileType } from './data/levelData';

const PROJECTILE_GRAVITY = 0.15; // original Projectile gravity feel at 60Hz
const HOMING_DELAY = 0.5; // FryMissile activate() delay
const HOMING_EASE = 40; // FryMissile rotation ease divisor

export interface ProjectileOpts {
  rotation?: number;
  scale?: number;
  /** spin per frame (Shooter mobile shots tumble) */
  rotSpeed?: number;
  /** override the XML-derived homing flag (Cake's candle missiles fly straight up in the original) */
  homing?: boolean;
  /** skip player collision entirely (visual-only flights, e.g. Sundae's thrown icecream) */
  harmless?: boolean;
  /** fired once when the shot is removed (expiry/offscreen/player-hit) — boomerang catches, cherry explosion */
  onGone?: (x: number, y: number, hitPlayer: boolean) => void;
  /**
   * SUPER_BLAST beam (original LevelBase:12018 PumpkinBlast): 0.5s telegraph,
   * then the sprite stretches from ~5px to 800px over 0.2s in the direction of
   * sign(vx), with a single ray-vs-player check at full extension.
   */
  beam?: boolean;
}

interface ActiveShot {
  def: ProjectileType;
  sprite: Sprite;
  vx: number;
  vy: number;
  age: number;
  rotSpeed: number;
  homing: boolean;
  boomerangReturned: boolean;
  harmless: boolean;
  onGone?: (x: number, y: number, hitPlayer: boolean) => void;
  beam: { dir: number; hitDone: boolean } | null;
  /** slashed back by the player — now hurts ENEMIES instead (original Sundae mechanic) */
  reflected: boolean;
}

const BEAM_DELAY = 0.5; // original tween delay before the blast sweeps
const BEAM_SWEEP = 0.2; // width 5 -> 800 over 0.2s
const BEAM_LINGER = 0.25;
const BEAM_LENGTH = 800;

export class EnemyProjectiles extends Container {
  /** fired when a shot touches the player (damage amount) */
  onPlayerHit: ((damage: number) => void) | null = null;
  /** reflected-shot vs enemy test — Game damages the enemy and returns true on hit */
  enemyHitTest: ((x: number, y: number, damage: number) => boolean) | null = null;

  private shots: ActiveShot[] = [];
  private textures: TextureMap | null = null;

  /** swap in the current level's atlas (call on level load) */
  setTextures(textures: TextureMap): void {
    this.clearAll();
    this.textures = textures;
  }

  /** returns false when the texture is missing (caller can fall back) */
  spawn(def: ProjectileType, x: number, y: number, vx: number, vy: number, opts: ProjectileOpts = {}): boolean {
    const texture = this.textures?.get(def.image);
    if (!texture) {
      console.warn(`[projectiles] missing texture ${def.image}`);
      return false;
    }
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.scale.set(opts.scale ?? 0.55);
    sprite.rotation = opts.rotation ?? 0;
    let beam: ActiveShot['beam'] = null;
    if (opts.beam) {
      // beams grow horizontally out of the origin point
      sprite.anchor.set(0, 0.5);
      beam = { dir: vx < 0 ? -1 : 1, hitDone: false };
      sprite.scale.x = (5 / Math.max(1, texture.width)) * beam.dir;
      vx = 0;
      vy = 0;
    }
    this.addChild(sprite);
    this.shots.push({
      def,
      sprite,
      vx,
      vy,
      age: 0,
      rotSpeed: opts.rotSpeed ?? 0,
      homing: opts.homing ?? (def.specialAIType === 'FryMissile' || def.specialAIType === 'CandleMissile'),
      boomerangReturned: false,
      harmless: opts.harmless ?? false,
      onGone: opts.onGone,
      beam,
      reflected: false,
    });
    return true;
  }

  /**
   * Sword swing vs live shots (original Sundae slash-back): shots near the
   * blade segment get batted back in the player's facing direction and hurt
   * whatever enemy they hit. Returns how many shots were reflected.
   */
  slashAt(x1: number, y1: number, x2: number, y2: number, dir: number): number {
    let reflectedCount = 0;
    for (const s of this.shots) {
      if (s.beam || s.reflected || s.harmless) continue;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lenSq = Math.max(1, dx * dx + dy * dy);
      const t = Math.max(0, Math.min(1, ((s.sprite.x - x1) * dx + (s.sprite.y - y1) * dy) / lenSq));
      const dist = Math.hypot(s.sprite.x - (x1 + t * dx), s.sprite.y - (y1 + t * dy));
      if (dist < 36) {
        s.reflected = true;
        s.homing = false;
        s.age = 0; // fresh lifetime for the return trip
        const speed = Math.max(8, Math.hypot(s.vx, s.vy) * 1.3);
        s.vx = dir * speed;
        s.vy = -1 - Math.abs(s.vy) * 0.2;
        s.sprite.tint = 0xcfe2ff;
        reflectedCount++;
      }
    }
    return reflectedCount;
  }

  update(dt: number, playerX: number, playerY: number, playerVulnerable: boolean): void {
    const step = dt * 60; // velocities are px/frame at 60Hz
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.age += dt;

      if (s.beam) {
        // SUPER_BLAST: telegraph, sweep to full length, one raycast, fade out
        const b = s.beam;
        const texW = Math.max(1, s.sprite.texture.width);
        const progress = Math.max(5 / BEAM_LENGTH, Math.min(1, (s.age - BEAM_DELAY) / BEAM_SWEEP));
        s.sprite.scale.x = ((BEAM_LENGTH * progress) / texW) * b.dir;
        if (s.age >= BEAM_DELAY + BEAM_SWEEP && !b.hitDone) {
          b.hitDone = true;
          const x0 = Math.min(s.sprite.x, s.sprite.x + BEAM_LENGTH * b.dir);
          const x1 = Math.max(s.sprite.x, s.sprite.x + BEAM_LENGTH * b.dir);
          if (playerVulnerable && playerX >= x0 - 20 && playerX <= x1 + 20 && Math.abs(playerY - 40 - s.sprite.y) < 42) {
            this.onPlayerHit?.(s.def.damageDone);
          }
        }
        if (s.age > BEAM_DELAY + BEAM_SWEEP) {
          s.sprite.alpha = Math.max(0, 1 - (s.age - BEAM_DELAY - BEAM_SWEEP) / BEAM_LINGER);
        }
        if (s.age > BEAM_DELAY + BEAM_SWEEP + BEAM_LINGER) this.kill(i);
        continue;
      }

      if (s.homing && s.age > HOMING_DELAY) {
        // FryMissile: ease the velocity vector toward the player each frame
        const speed = Math.max(2, s.def.maxMovementSpeed);
        const desired = Math.atan2(playerY - 30 - s.sprite.y, playerX - s.sprite.x);
        const current = Math.atan2(s.vy, s.vx);
        let delta = desired - current;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const angle = current + (delta / HOMING_EASE) * step;
        s.vx = Math.cos(angle) * speed;
        s.vy = Math.sin(angle) * speed;
        s.sprite.rotation = angle + Math.PI / 2;
      } else if (s.def.boomerang && !s.boomerangReturned && s.age > s.def.disappearTime / 2) {
        // boomerang: reverse halfway through its lifetime and fly back out
        s.vx *= -1;
        s.vy *= -1;
        s.boomerangReturned = true;
      }

      if (s.def.effectedByGravity) s.vy += PROJECTILE_GRAVITY * step;
      s.sprite.x += s.vx * step;
      s.sprite.y += s.vy * step;
      if (s.rotSpeed !== 0) s.sprite.rotation += s.rotSpeed * step;

      const off = s.sprite.x < -60 || s.sprite.x > 860 || s.sprite.y > 520 || s.sprite.y < -80;
      if (s.age > s.def.disappearTime || off) {
        this.kill(i);
        continue;
      }

      if (s.reflected) {
        if (this.enemyHitTest?.(s.sprite.x, s.sprite.y, s.def.damageDone)) this.kill(i);
        continue;
      }

      if (!s.harmless && playerVulnerable && Math.abs(s.sprite.x - playerX) < 28 && Math.abs(s.sprite.y - (playerY - 40)) < 42) {
        this.onPlayerHit?.(s.def.damageDone);
        this.kill(i, true);
      }
    }
  }

  private kill(index: number, hitPlayer = false): void {
    const s = this.shots[index];
    const gx = s.sprite.x;
    const gy = s.sprite.y;
    s.sprite.destroy();
    this.shots.splice(index, 1);
    s.onGone?.(gx, gy, hitPlayer);
  }

  clearAll(): void {
    for (const s of this.shots) s.sprite.destroy();
    this.shots.length = 0;
  }
}
