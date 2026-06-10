/**
 * Generic boss - a pattern-driven state machine whose move set is derived
 * from which animations the boss's Spriter entity actually has (shoot1/
 * shoot2 -> ranged volley, jump -> leap at player, attack1 -> melee lunge).
 * Stats come from BossModeEnemies.xml. Per-boss bespoke behaviors (original
 * Boss_*.as classes) can replace this incrementally later.
 */
import { Point } from 'pixi.js';
import type { SpriterPlayer } from '../spriter/SpriterPlayer';
import type { EnemyType } from './data/levelData';
import { Enemy, type PlayerView } from './Enemy';
import { GROUND_Y } from './PlayerController';

type Pattern = 'shoot' | 'jump' | 'melee';

export class Boss extends Enemy {
  /** fired when the boss launches a projectile (x, y, vx, vy) */
  onShoot: ((x: number, y: number, vx: number, vy: number) => void) | null = null;
  /** fired when the boss lands a jump (for screenshake) */
  onLand: (() => void) | null = null;

  private patterns: Pattern[] = [];
  private phase: 'enter' | 'idle' | Pattern = 'enter';
  private phaseTimer = 0;
  private shotsLeft = 0;
  private shotTimer = 0;

  constructor(type: EnemyType, spriter: SpriterPlayer) {
    super(type, spriter);
    this.isBoss = true;
    if (spriter.hasAnim('shoot1') || spriter.hasAnim('shoot2')) this.patterns.push('shoot');
    if (spriter.hasAnim('jump')) this.patterns.push('jump');
    if (spriter.hasAnim('attack1') || spriter.hasAnim('attack')) this.patterns.push('melee');
    if (this.patterns.length === 0) this.patterns.push('melee');
  }

  spawnAt(x: number, y: number): void {
    super.spawnAt(x, y);
    this.phase = 'enter';
    this.phaseTimer = 0;
    if (this.spriter.hasAnim('spawn')) {
      this.spriter.playAnim('spawn', 'idle', null, true);
      this.phaseTimer = 2.2;
    } else {
      this.play('idle');
      this.phaseTimer = 1;
    }
  }

  protected runAI(dt: number, player: PlayerView): void {
    this.phaseTimer -= dt;
    // face the player while grounded (sprites are authored facing left, so invert)
    this.faceOverride = player.x < this.x ? 1 : -1;
    if (this.y >= GROUND_Y && this.phase !== 'jump' && this.phase !== 'melee') {
      this.xVel *= 0.8;
    }

    switch (this.phase) {
      case 'enter':
        if (this.phaseTimer <= 0) this.toIdle();
        break;

      case 'idle':
        this.play('idle');
        if (this.phaseTimer <= 0) {
          const pattern = this.patterns[Math.floor(Math.random() * this.patterns.length)];
          this.startPattern(pattern, player);
        }
        break;

      case 'shoot': {
        this.shotTimer -= dt;
        if (this.shotsLeft > 0 && this.shotTimer <= 0) {
          this.shotTimer = 0.3;
          this.shotsLeft--;
          // fire from the gun/cannon part if the rig has one (e.g. WaterMelon_Gun)
          const muzzle = this.muzzlePosition();
          const sx = muzzle?.x ?? this.x;
          const sy = muzzle?.y ?? this.y - 55;
          const dx = player.x - sx;
          const dy = player.y - 40 - sy;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const speed = this.projectileDef?.maxMovementSpeed ?? 7;
          this.onShoot?.(sx, sy, (dx / dist) * speed, (dy / dist) * speed);
        }
        if (this.phaseTimer <= 0) this.toIdle();
        break;
      }

      case 'jump':
        if (this.y >= GROUND_Y && this.yVel >= 0 && this.phaseTimer < 1.2) {
          // landed
          this.onLand?.();
          this.toIdle();
        }
        if (this.phaseTimer <= 0) this.toIdle();
        break;

      case 'melee': {
        const dir = player.x < this.x ? -1 : 1;
        this.xVel = dir * Math.max(3, this.type.maxMovementSpeed);
        if (this.phaseTimer <= 0) this.toIdle();
        break;
      }
    }
  }

  /** gun-part position in the enemy layer's coordinates (sibling of effects) */
  private muzzlePosition(): { x: number; y: number } | null {
    const gun = this.spriter.findPart(/gun|cannon/i);
    const parent = this.spriter.parent;
    if (!gun || !parent) return null;
    return parent.toLocal(gun.toGlobal(new Point(0, 0)));
  }

  private toIdle(): void {
    this.phase = 'idle';
    this.phaseTimer = 1 + Math.random() * 1.2;
    this.play('idle');
  }

  private startPattern(pattern: Pattern, player: PlayerView): void {
    this.phase = pattern;
    if (pattern === 'shoot') {
      const anim = this.spriter.hasAnim('shoot1') ? 'shoot1' : 'shoot2';
      this.spriter.playAnim(anim, 'idle', null, true);
      this.shotsLeft = 3;
      this.shotTimer = 0.35;
      this.phaseTimer = 1.6;
    } else if (pattern === 'jump') {
      this.spriter.playAnim('jump', 'idle', null, true);
      this.yVel = -13;
      this.xVel = (player.x - this.x) / 55;
      this.phaseTimer = 2.5;
    } else {
      const anim = this.spriter.hasAnim('attack1') ? 'attack1' : 'attack';
      this.spriter.playAnim(anim, 'idle', null, true);
      this.phaseTimer = 0.9;
    }
  }
}
