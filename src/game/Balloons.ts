/**
 * Health / invincibility balloons — unlocked by the in-run shop potion items.
 * Behavior from the original initPotions/updateBalloon/checkLifeBalloonCollision:
 * spawn off the left edge, drift right with a wobble, reschedule 90-120s if
 * they escape, collected on touch.
 */
import { Container, Sprite } from 'pixi.js';
import type { TextureMap } from '../assets/starlingAtlas';
import { audio } from './Audio';

export type BalloonKind = 'health' | 'invince';

interface ActiveBalloon {
  kind: BalloonKind;
  level: number; // 1 = small potion, 2 = large
  root: Container;
  xVel: number;
  yVel: number;
  collected: boolean;
}

const POTION_TEXTURES: Record<BalloonKind, [string, string]> = {
  health: ['Health_Potion_Small', 'Health_Potion'],
  invince: ['Invincibility_Potion_Small', 'Invincibility_Potion'],
};

export class Balloons extends Container {
  /** Game applies the effect (heal / invincibility) */
  onCollect: ((kind: BalloonKind, level: number) => void) | null = null;

  private textures: TextureMap;
  /** purchased level per kind (0 = disabled, no spawns) */
  private levels: Record<BalloonKind, number> = { health: 0, invince: 0 };
  /** seconds until the next spawn per kind (-1 = not scheduled) */
  private timers: Record<BalloonKind, number> = { health: -1, invince: -1 };
  private active: ActiveBalloon[] = [];

  constructor(textures: TextureMap) {
    super();
    this.textures = textures;
  }

  /** potion purchased: enable/upgrade spawns (first spawn 10s health / 15s invince) */
  enable(kind: BalloonKind, level: number): void {
    this.levels[kind] = level;
    if (this.timers[kind] < 0) this.timers[kind] = kind === 'health' ? 10 : 15;
  }

  /** new run: forget purchases and despawn */
  reset(): void {
    this.levels = { health: 0, invince: 0 };
    this.timers = { health: -1, invince: -1 };
    this.clearActive();
  }

  /** level switch: despawn active balloons but keep the schedule running */
  clearActive(): void {
    for (const b of this.active) b.root.destroy({ children: true });
    this.active.length = 0;
  }

  private spawn(kind: BalloonKind): void {
    const level = this.levels[kind];
    const root = new Container();
    const balloon = new Sprite(this.textures.get('Balloon'));
    balloon.anchor.set(0.5, 0);
    const potion = new Sprite(this.textures.get(POTION_TEXTURES[kind][level >= 2 ? 1 : 0]));
    potion.anchor.set(0.5, 0);
    potion.y = balloon.height - 6;
    root.addChild(balloon, potion);
    root.position.set(-40, 50);
    this.addChild(root);
    this.active.push({ kind, level, root, xVel: 5, yVel: 0, collected: false });
  }

  update(dt: number, playerX: number, playerY: number, playerAlive: boolean): void {
    for (const kind of ['health', 'invince'] as BalloonKind[]) {
      if (this.levels[kind] > 0 && this.timers[kind] >= 0) {
        this.timers[kind] -= dt;
        if (this.timers[kind] <= 0) {
          this.spawn(kind);
          this.timers[kind] = -1; // rescheduled when this one resolves
        }
      }
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];

      if (b.collected) {
        // float up and away after pickup
        b.root.y -= 3;
        b.root.alpha -= 0.02;
        if (b.root.y < -180 || b.root.alpha <= 0) {
          b.root.destroy({ children: true });
          this.active.splice(i, 1);
        }
        continue;
      }

      // drift: settle toward xVel 2 with jitter; wobble vertically
      b.xVel += b.xVel > 2 ? -0.05 : 0.05;
      b.xVel += (Math.random() - 0.5) * 0.4;
      b.yVel += (Math.random() - 0.5) * 0.2;
      if (b.yVel > 0.667) b.yVel = 0.667;
      if (b.yVel < -0.667) b.yVel = -0.667;
      b.root.x += b.xVel;
      b.root.y += b.yVel;

      // escaped off the right: reschedule 90-120s
      if (b.root.x > 840) {
        b.root.destroy({ children: true });
        this.active.splice(i, 1);
        this.timers[b.kind] = 90 + Math.random() * 30;
        continue;
      }

      // touch pickup (balloon + dangling potion ~ 140px tall)
      if (playerAlive && Math.abs(playerX - b.root.x) < 45 && playerY - 40 > b.root.y - 30 && playerY - 80 < b.root.y + 170) {
        b.collected = true;
        audio.play('pickup_potion');
        this.onCollect?.(b.kind, b.level);
        this.timers[b.kind] = 90 + Math.random() * 30;
      }
    }
  }
}
