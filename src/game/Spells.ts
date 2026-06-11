/**
 * Spell system - the magic powers redesigned per the remake plan: equip two
 * of them before a run, each on its own cooldown button (Q/E, LB/RB),
 * replacing the original's in-level bubble pickups + touch mini-games.
 * Icons reuse the original MagicBubble_* textures from the effects atlas.
 */
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { TextureMap } from '../assets/starlingAtlas';
import { audio } from './Audio';
import type { Enemy } from './Enemy';
import type { NinjaStars } from './NinjaStars';
import type { ParticleBursts, ScreenShake } from './Juice';
import type { PlayerController } from './PlayerController';
import { GROUND_Y } from './PlayerController';

export interface SpellContext {
  player: PlayerController;
  enemies: () => Enemy[];
  stars: NinjaStars;
  bursts: ParticleBursts;
  shake: ScreenShake;
  /** big AoE damage helper (kills route through the normal kill pipeline) */
  damage: (enemy: Enemy, amount: number, dir: number) => void;
  flash: (color: number, alpha: number) => void;
  /** spawn a loot item near a position */
  spawnLoot: (x: number, y: number, item: string) => void;
  /** pull all active pickups to the player immediately */
  vacuumLoot: () => void;
  /** slow enemy time to `scale` for `seconds` */
  slowMo: (scale: number, seconds: number) => void;
}

interface SpellDef {
  id: string;
  icon: string;
  cooldown: number;
  cast: (ctx: SpellContext) => void;
}

export const SPELLS: Record<string, SpellDef> = {
  freeze: {
    id: 'freeze',
    icon: 'MagicBubble_Freeze',
    cooldown: 14,
    cast: (ctx) => {
      ctx.flash(0xb4ddff, 0.45);
      ctx.shake.add(3);
      for (const e of ctx.enemies()) {
        if (e.alive) e.frozenTimer = 4;
      }
    },
  },
  ninjaRain: {
    id: 'ninjaRain',
    icon: 'MagicBubble_HeavensRain',
    cooldown: 12,
    cast: (ctx) => {
      for (let i = 0; i < 16; i++) {
        const x = 50 + Math.random() * 700;
        const delay = i * 2; // staggered via spawn height
        ctx.stars.spawn(x, -40 - delay * 14, (Math.random() - 0.5) * 2, 15 + Math.random() * 4);
      }
      audio.playRandom(['swipe1_01', 'swipe1_02'], 0, 0.5);
    },
  },
  slash: {
    id: 'slash',
    icon: 'MagicBubble_Slash',
    cooldown: 10,
    cast: (ctx) => {
      const p = ctx.player;
      ctx.flash(0xffffff, 0.35);
      ctx.shake.add(8);
      audio.play('swipe4_01');
      for (const e of ctx.enemies()) {
        if (!e.alive) continue;
        const dx = e.x - p.x;
        if (Math.sign(dx) === p.facing && Math.abs(dx) < 320 && Math.abs(e.y - p.y) < 200) {
          ctx.damage(e, 60, p.facing);
        }
      }
    },
  },
  growth: {
    id: 'growth',
    icon: 'MagicBubble_Growth',
    cooldown: 18,
    cast: (ctx) => {
      const p = ctx.player;
      p.sizeScale = 1.65;
      p.damageMultiplier = 2;
      ctx.shake.add(4);
      setTimeout(() => {
        p.sizeScale = 1;
        p.damageMultiplier = 1;
      }, 6000);
    },
  },
  coin: {
    id: 'coin',
    icon: 'MagicBubble_Coin',
    cooldown: 22,
    cast: (ctx) => {
      const p = ctx.player;
      audio.play('pickup_coin_gold');
      for (let i = 0; i < 10; i++) {
        ctx.spawnLoot(p.x + (Math.random() - 0.5) * 120, p.y - 60, Math.random() < 0.25 ? 'loot_l' : 'loot_m');
      }
    },
  },
  magnet: {
    id: 'magnet',
    icon: 'MagicBubble_Magnet',
    cooldown: 8,
    cast: (ctx) => {
      ctx.vacuumLoot();
      ctx.shake.add(2);
    },
  },
  time: {
    id: 'time',
    icon: 'MagicBubble_Time',
    cooldown: 16,
    cast: (ctx) => {
      ctx.flash(0x9b6bff, 0.3);
      ctx.slowMo(0.3, 5);
    },
  },
  akuma: {
    id: 'akuma',
    icon: 'MagicBubble_Akuma',
    cooldown: 26,
    cast: (ctx) => {
      const p = ctx.player;
      ctx.flash(0xff3030, 0.5);
      ctx.shake.add(12);
      audio.play('swipe4_01');
      // beam: full-width band at player height in the facing direction
      for (let i = 0; i < 8; i++) {
        ctx.bursts.burst(p.x + p.facing * (60 + i * 90), p.y - 30, 'explosion_red', 8);
      }
      for (const e of ctx.enemies()) {
        if (!e.alive) continue;
        if (Math.sign(e.x - p.x) === p.facing && Math.abs(e.y - p.y) < 160) {
          ctx.damage(e, 100, p.facing);
        }
      }
    },
  },
};

interface Slot {
  def: SpellDef;
  /** spell level 1-4: each level shortens the cooldown by 12% */
  cooldown: number;
  remaining: number;
  icon: Sprite;
  overlay: Graphics;
  label: Text;
}

export class SpellSystem extends Container {
  private slots: Slot[] = [];
  private ctx: SpellContext;
  private textures: TextureMap;
  private levels: Record<string, number> = {};

  constructor(ctx: SpellContext, textures: TextureMap, loadout: string[]) {
    super();
    this.ctx = ctx;
    this.textures = textures;
    this.setLoadout(loadout);
  }

  /** AP-shop spell levels (cooldown scaling); call before setLoadout */
  setSpellLevels(levels: Record<string, number>): void {
    this.levels = levels;
    for (const s of this.slots) {
      s.cooldown = this.effectiveCooldown(s.def);
    }
  }

  private effectiveCooldown(def: SpellDef): number {
    const level = Math.max(1, this.levels[def.id] ?? 1);
    return def.cooldown * (1 - 0.12 * (level - 1));
  }

  setLoadout(ids: string[]): void {
    for (const s of this.slots) {
      s.icon.destroy();
      s.overlay.destroy();
      s.label.destroy();
    }
    this.slots = [];
    ids.slice(0, 2).forEach((id, i) => {
      const def = SPELLS[id];
      if (!def) return;
      const icon = new Sprite(this.textures.get(def.icon));
      icon.anchor.set(0.5);
      icon.scale.set(0.75);
      icon.position.set(34 + i * 62, 440);
      const overlay = new Graphics();
      overlay.position.copyFrom(icon.position);
      const label = new Text({
        text: i === 0 ? 'Q' : 'E',
        style: { fontFamily: 'Verdana', fontSize: 11, fill: 0xffffff, fontWeight: 'bold' },
      });
      label.anchor.set(0.5);
      label.position.set(icon.x, icon.y + 33);
      this.addChild(icon, overlay, label);
      this.slots.push({ def, cooldown: this.effectiveCooldown(def), remaining: 0, icon, overlay, label });
    });
  }

  /** attempt to cast slot 0 or 1 */
  cast(slot: number): void {
    const s = this.slots[slot];
    if (!s || s.remaining > 0 || this.ctx.player.dead) return;
    s.remaining = s.cooldown;
    s.def.cast(this.ctx);
  }

  /** debug helper: make both spells castable immediately */
  resetCooldowns(): void {
    for (const s of this.slots) s.remaining = 0;
  }

  update(dt: number): void {
    for (const s of this.slots) {
      if (s.remaining > 0) s.remaining = Math.max(0, s.remaining - dt);
      const ready = s.remaining <= 0;
      s.icon.alpha = ready ? 1 : 0.45;
      s.overlay.clear();
      if (!ready) {
        // radial cooldown wipe
        const frac = s.remaining / s.cooldown;
        s.overlay
          .moveTo(0, 0)
          .arc(0, 0, 27, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac)
          .lineTo(0, 0)
          .fill({ color: 0x000000, alpha: 0.55 });
      }
    }
  }
}
