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
}

export class EnemyProjectiles extends Container {
  /** fired when a shot touches the player (damage amount) */
  onPlayerHit: ((damage: number) => void) | null = null;

  private shots: ActiveShot[] = [];
  private textures: TextureMap | null = null;

  /** swap in the current level's atlas (call on level load) */
  setTextures(textures: TextureMap): void {
    this.clearAll();
    this.textures = textures;
  }

  spawn(def: ProjectileType, x: number, y: number, vx: number, vy: number, opts: ProjectileOpts = {}): void {
    const texture = this.textures?.get(def.image);
    if (!texture) {
      console.warn(`[projectiles] missing texture ${def.image}`);
      return;
    }
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.scale.set(opts.scale ?? 0.55);
    sprite.rotation = opts.rotation ?? 0;
    this.addChild(sprite);
    this.shots.push({
      def,
      sprite,
      vx,
      vy,
      age: 0,
      rotSpeed: opts.rotSpeed ?? 0,
      homing: def.specialAIType === 'FryMissile' || def.specialAIType === 'CandleMissile',
      boomerangReturned: false,
    });
  }

  update(dt: number, playerX: number, playerY: number, playerVulnerable: boolean): void {
    const step = dt * 60; // velocities are px/frame at 60Hz
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.age += dt;

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

      if (playerVulnerable && Math.abs(s.sprite.x - playerX) < 28 && Math.abs(s.sprite.y - (playerY - 40)) < 42) {
        this.onPlayerHit?.(s.def.damageDone);
        this.kill(i);
      }
    }
  }

  private kill(index: number): void {
    this.shots[index].sprite.destroy();
    this.shots.splice(index, 1);
  }

  clearAll(): void {
    for (const s of this.shots) s.sprite.destroy();
    this.shots.length = 0;
  }
}
