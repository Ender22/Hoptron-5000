/**
 * Ninja star projectiles — speed 20 and 10 damage from the original
 * constants (ninjaStarSpeed, BUNNY_DEFAULT_DMG_PROJECTILE), spin from
 * NINJASTAR_ROT_SPEED.
 */
import { Container, Sprite } from 'pixi.js';
import type { TextureMap } from '../assets/starlingAtlas';
import type { Enemy } from './Enemy';

const STAR_SPEED = 20;
const STAR_DAMAGE = 10;
const ROT_SPEED = 0.4;

interface Star {
  sprite: Sprite;
  vx: number;
  vy: number;
}

export class NinjaStars extends Container {
  onHit: ((enemy: Enemy, killed: boolean) => void) | null = null;

  private textures: TextureMap;
  private stars: Star[] = [];

  constructor(textures: TextureMap) {
    super();
    this.textures = textures;
  }

  throw_(x: number, y: number, dir: number): void {
    this.spawn(x + dir * 30, y - 45, STAR_SPEED * dir, 0);
  }

  /** arbitrary-velocity star (used by the Heaven's Rain spell) */
  spawn(x: number, y: number, vx: number, vy: number): void {
    const texture = this.textures.get('NinjaStar');
    if (!texture) return;
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    this.addChild(sprite);
    this.stars.push({ sprite, vx, vy });
  }

  update(enemies: Enemy[]): void {
    for (let i = this.stars.length - 1; i >= 0; i--) {
      const star = this.stars[i];
      star.sprite.x += star.vx;
      star.sprite.y += star.vy;
      star.sprite.rotation += ROT_SPEED;

      let dead = star.sprite.x < -40 || star.sprite.x > 840 || star.sprite.y > 400;
      if (!dead) {
        for (const enemy of enemies) {
          if (!enemy.alive || enemy.invincible) continue;
          if (Math.abs(enemy.x - star.sprite.x) < 35 && Math.abs(enemy.y - 35 - star.sprite.y) < 45) {
            const before = enemy.alive;
            enemy.hurt(STAR_DAMAGE, Math.sign(star.vx));
            this.onHit?.(enemy, before && !enemy.alive);
            dead = true;
            break;
          }
        }
      }
      if (dead) {
        star.sprite.destroy();
        this.stars.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const s of this.stars) s.sprite.destroy();
    this.stars.length = 0;
  }
}
