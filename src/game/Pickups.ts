/**
 * Loot pickups — drops from the original lootArray data. Coins/potions pop
 * out of dead enemies, bounce, then home to the player (like the original
 * Pickup tween-to-player). Textures come from the original effects atlas.
 */
import { Container, Sprite } from 'pixi.js';
import type { TextureMap } from '../assets/starlingAtlas';
import type { LootEntry } from './data/levelData';
import { GROUND_Y } from './PlayerController';

interface LootDef {
  texture: string;
  scale: number;
  coins?: number;
  heal?: number; // fraction of maxHp, 1 = full
}

const LOOT: Record<string, LootDef> = {
  loot_s: { texture: 'Coin_Silver', scale: 0.8, coins: 1 },
  loot_m: { texture: 'Coin_Silver', scale: 1.1, coins: 3 },
  loot_l: { texture: 'Coin_Gold', scale: 1.0, coins: 8 },
  loot_xl: { texture: 'Coin_Gold', scale: 1.35, coins: 20 },
  health_xs: { texture: 'Health_Potion_Small', scale: 0.7, heal: 0.1 },
  health_s: { texture: 'Health_Potion_Small', scale: 0.9, heal: 0.2 },
  health_m: { texture: 'Health_Potion', scale: 0.85, heal: 0.35 },
  health_l: { texture: 'Health_Potion', scale: 1.0, heal: 0.5 },
  health_full: { texture: 'Health_Potion', scale: 1.15, heal: 1 },
};

interface ActivePickup {
  sprite: Sprite;
  def: LootDef;
  vx: number;
  vy: number;
  age: number;
  homing: boolean;
}

export class Pickups extends Container {
  onCoins: ((amount: number) => void) | null = null;
  onHeal: ((fraction: number) => void) | null = null;

  private textures: TextureMap;
  private active: ActivePickup[] = [];

  constructor(textures: TextureMap) {
    super();
    this.textures = textures;
  }

  /** roll an enemy's loot table (freq is a percentage per entry) */
  dropFrom(x: number, y: number, loot: LootEntry[]): void {
    for (const entry of loot) {
      if (Math.random() * 100 >= entry.freq) continue;
      const amount = entry.minAmount + Math.floor(Math.random() * (entry.maxAmount - entry.minAmount + 1));
      for (let i = 0; i < amount; i++) this.spawn(x, y, entry.item);
    }
  }

  spawn(x: number, y: number, lootName: string): void {
    const def = LOOT[lootName];
    if (!def) return;
    const texture = this.textures.get(def.texture);
    if (!texture) return;
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.scale.set(def.scale);
    sprite.position.set(x, y - 40);
    this.addChild(sprite);
    this.active.push({
      sprite,
      def,
      vx: (Math.random() - 0.5) * 6,
      vy: -5 - Math.random() * 4,
      age: 0,
      homing: false,
    });
  }

  update(dt: number, playerX: number, playerY: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.age += dt;

      if (!p.homing) {
        p.sprite.x += p.vx;
        p.sprite.y += p.vy;
        p.vy += 0.4;
        if (p.sprite.y > GROUND_Y - 8) {
          p.sprite.y = GROUND_Y - 8;
          p.vy *= -0.45;
          p.vx *= 0.8;
        }
        if (p.age > 0.55) p.homing = true;
      } else {
        // accelerate toward the player
        const tx = playerX;
        const ty = playerY - 40;
        const dx = tx - p.sprite.x;
        const dy = ty - p.sprite.y;
        const dist = Math.hypot(dx, dy);
        const speed = Math.min(22, 6 + p.age * 18);
        if (dist < speed * 1.2) {
          // collected
          if (p.def.coins) this.onCoins?.(p.def.coins);
          if (p.def.heal) this.onHeal?.(p.def.heal);
          p.sprite.destroy();
          this.active.splice(i, 1);
          continue;
        }
        p.sprite.x += (dx / dist) * speed;
        p.sprite.y += (dy / dist) * speed;
      }
    }
  }

  clear(): void {
    for (const p of this.active) p.sprite.destroy();
    this.active.length = 0;
  }
}
