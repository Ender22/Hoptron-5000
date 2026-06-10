/**
 * Enemy - stats from the original XML, physics from MovableObject
 * (SCALE 0.55, enemy gravity 0.5). The base class carries the simple AI
 * archetypes (Mover, Wanderer, Chaser, Crusher, Jumper); the stateful
 * originals (GroundPopper, Shooter, Blaster, ...) live in EnemyBehaviors.ts
 * as subclasses created by the factory there.
 */
import type { SpriterPlayer } from '../spriter/SpriterPlayer';
import { audio } from './Audio';
import type { EnemyType, ProjectileType } from './data/levelData';
import type { ProjectileOpts } from './EnemyProjectiles';
import { GROUND_Y } from './PlayerController';

export const ENEMY_SCALE = 0.55;
const ENEMY_GRAVITY = 0.5; // original LevelBase.GRAVITY (enemies), bunny uses 0.8

export interface PlayerView {
  x: number;
  y: number;
  invincible: boolean;
}

/** level-side capabilities injected by the WaveManager */
export interface EnemyServices {
  shoot(def: ProjectileType, x: number, y: number, vx: number, vy: number, opts?: ProjectileOpts): void;
  /** spawn another enemy type (Icecream scoops, Stick balls, Spawner nuggets) */
  spawnChild(name: string, x: number, y: number, xVel: number, yVel: number): Enemy | null;
  shake(amount: number): void;
  /** direct player damage that isn't body-contact (Blaster flame, Exploder blast) */
  hurtPlayer(damage: number, dir: number): void;
  burst(x: number, y: number, deathPS: string, count: number): void;
  /** kill an enemy through the full loot/score pipeline (Hamburger heart -> boss) */
  killEnemy(enemy: Enemy): void;
  /** drag the player toward a point (Hamburger suck) */
  pullPlayer(x: number, y: number, accel: number): void;
}

export class Enemy {
  readonly type: EnemyType;
  readonly spriter: SpriterPlayer;

  /** injected after construction by the WaveManager */
  services: EnemyServices | null = null;
  projectileDef: ProjectileType | null = null;

  x = 0;
  y = GROUND_Y;
  xVel = 0;
  yVel = 0;
  hp: number;
  alive = true;
  /** set false during hurt recoil etc. */
  canUpdate = true;
  canDamage = true;
  invincible = false;
  /** dwell timer for contact damage (original withinAttackDistance logic) */
  contactTime = 0;
  /** which die-variant is playing (Stick has die/die1/die2/die_stick) */
  deathAnim = 'die';
  /** self-removed enemies (Exploder detonation) skip loot/score */
  suicided = false;
  /** Combo-boss KO system: at 0 HP the enemy is knocked out, not killed */
  koMode = false;
  /** fired when a koMode enemy gets knocked out */
  onKO: (() => void) | null = null;

  /** bosses keep acting while hurt and don't get knocked back (original behavior) */
  protected isBoss = false;
  /** disable gravity per-instance (flying archetypes) */
  protected flying = false;
  /** skip the arena x-clamp (boss spin attacks exit the screen) */
  protected canGoOffScreen = false;
  /** render scale (Pumpkin shrinks as it takes damage) */
  protected baseScale = ENEMY_SCALE;

  /** per-AI scratch state */
  protected movingLeft = false;
  protected aiTimer = 0;
  protected aiPhase = 0;
  private targetX = 0;

  private hurtTimer = 0;
  private recoverTimer = 0;
  /** magic freeze (original MAGIC_FREEZECOLOR tint, AI + animation halted) */
  frozenTimer = 0;

  constructor(type: EnemyType, spriter: SpriterPlayer) {
    this.type = type;
    this.spriter = spriter;
    this.hp = type.hp;
    spriter.setEntity(type.name);
    spriter.scale.set(ENEMY_SCALE);
    this.flying = !type.effectedByGravity;
  }

  spawnAt(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.movingLeft = x > 400;
    this.aiPhase = 0;
    this.aiTimer = 0;
    this.play(this.type.effectedByGravity ? 'idle' : 'move');
    this.applyTransform();
  }

  protected play(anim: string): void {
    if (this.spriter.hasAnim(anim) && this.spriter.currentAnimationName !== anim) {
      this.spriter.playAnim(anim);
    }
  }

  /** spriter-local muzzle point (original spriter.activePoints[0]), scaled to stage units */
  protected muzzleOffset(fallbackX = 30, fallbackY = -40): [number, number] {
    const p = this.spriter.activePoints[0];
    const facing = Math.sign(this.spriter.scale.x) || 1;
    if (p) return [p.x * ENEMY_SCALE * facing, p.y * ENEMY_SCALE];
    return [fallbackX * facing, fallbackY];
  }

  hurt(damage: number, knockDir: number): boolean {
    if (!this.alive) return false;
    if (this.invincible) {
      this.onBlockedHit();
      return false;
    }
    this.hp -= damage;
    this.invincible = true;
    this.contactTime = 0;
    this.spriter.setColor(0xff5555);
    this.hurtTimer = 0.2; // original: invincible cleared after 0.2s

    if (this.hp <= 0) {
      this.die();
      return true;
    }
    if (!this.isBoss) {
      // original: non-bosses are staggered, bosses keep going
      this.canDamage = false;
      this.canUpdate = false;
      this.recoverTimer = 0.6;
      this.play('hurt');
      this.xVel = 4 * knockDir;
    }
    this.onHurt();
    return true;
  }

  /** subclass hook: original onHurt overrides (Bouncer stops spinning etc.) */
  protected onHurt(): void {}

  /** subclass hook: hit landed while invincible (Sundae stun counter) */
  protected onBlockedHit(): void {}

  protected die(): void {
    if (this.koMode && this.spriter.hasAnim('ko')) {
      // knocked out instead of dying (original KoEnemy flag)
      this.hp = 1;
      this.invincible = true;
      this.canDamage = false;
      this.canUpdate = false;
      this.xVel = 0;
      this.spriter.playAnim('ko', 'koIdle', null, true);
      this.onKO?.();
      return;
    }
    this.alive = false;
    this.canDamage = false;
    this.xVel = 0;
    this.yVel = 0;
    this.deathAnim = this.pickDeathAnim();
    if (this.spriter.hasAnim(this.deathAnim)) {
      this.spriter.playAnim(this.deathAnim, '', null, true);
    }
    this.onDeath();
  }

  /** subclass hook: which die animation variant to use */
  protected pickDeathAnim(): string {
    return 'die';
  }

  /** subclass hook: original onDestroyed overrides (Icecream scoop spawn etc.) */
  protected onDeath(): void {}

  /** teardown hook (stop loop sounds etc.); called before the spriter is destroyed */
  dispose(): void {}

  update(dt: number, player: PlayerView): void {
    if (this.frozenTimer > 0 && this.alive) {
      this.frozenTimer -= dt;
      this.spriter.setColor(0xb4ddff);
      if (this.frozenTimer <= 0) this.spriter.setColor(0xffffff);
      return; // fully halted: no AI, no physics, no animation
    }

    if (this.hurtTimer > 0) {
      this.hurtTimer -= dt;
      if (this.hurtTimer <= 0) {
        this.spriter.setColor(0xffffff);
        this.invincible = false;
      }
    }
    if (this.recoverTimer > 0 && this.alive) {
      this.recoverTimer -= dt;
      if (this.recoverTimer <= 0) {
        this.canUpdate = true;
        this.canDamage = true;
        this.onRecovered();
      }
    }

    if (this.alive && this.canUpdate) {
      this.runAI(dt, player);
    }

    this.integrate();
    this.applyTransform();
    this.spriter.advanceTime(dt);
  }

  /** subclass hook: fired when hurt-stagger recovery completes */
  protected onRecovered(): void {}

  // ---- AI dispatch (simple archetypes; complex ones are subclasses) ----
  protected runAI(dt: number, player: PlayerView): void {
    switch (this.type.aiType) {
      case 'Wanderer':
        this.aiWanderer(dt);
        break;
      case 'Chaser':
        this.aiChaser(player);
        break;
      case 'Jumper':
        this.aiJumper(dt, player);
        break;
      default:
        this.aiMover();
    }
  }

  /** walk back and forth, turning at the arena walls (original Mover) */
  protected aiMover(): void {
    const t = this.type;
    if (this.movingLeft) {
      if (this.xVel > -t.maxMovementSpeed) this.xVel -= t.acceleration;
    } else {
      if (this.xVel < t.maxMovementSpeed) this.xVel += t.acceleration;
    }
    if (this.x > 720 && !this.movingLeft) this.movingLeft = true;
    else if (this.x < 60 && this.movingLeft) this.movingLeft = false;
    this.play('move');
  }

  /** airborne drifter with random direction changes (original Wanderer) */
  private aiWanderer(dt: number): void {
    const t = this.type;
    this.aiTimer -= dt;
    if (this.aiTimer <= 0) {
      this.aiTimer = 1 + Math.random() * 2.5;
      this.movingLeft = Math.random() < 0.5;
      this.targetX = 80 + Math.random() * 200; // target altitude above ground
    }
    if (this.movingLeft) {
      if (this.xVel > -t.maxMovementSpeed) this.xVel -= t.acceleration;
    } else {
      if (this.xVel < t.maxMovementSpeed) this.xVel += t.acceleration;
    }
    const targetY = GROUND_Y - this.targetX;
    this.yVel += Math.sign(targetY - this.y) * t.acceleration * 0.5;
    this.yVel = Math.max(-2, Math.min(2, this.yVel));
    if (this.x > 740) this.movingLeft = true;
    if (this.x < 60) this.movingLeft = false;
    this.play('move');
  }

  /** run straight at the player (original Chaser) */
  protected aiChaser(player: PlayerView): void {
    const t = this.type;
    const dir = player.x < this.x ? -1 : 1;
    this.xVel += t.acceleration * dir;
    this.xVel = Math.max(-t.maxMovementSpeed, Math.min(t.maxMovementSpeed, this.xVel));
    this.play('move');
  }

  /** hop toward the player (original Jumper: springroll) */
  private aiJumper(dt: number, player: PlayerView): void {
    if (this.y >= GROUND_Y) {
      this.aiTimer += dt;
      this.xVel *= 0.8;
      if (this.aiTimer > 0.9) {
        this.aiTimer = 0;
        this.yVel = -9;
        this.xVel = Math.sign(player.x - this.x) * this.type.maxMovementSpeed;
        this.play(this.spriter.hasAnim('spring') ? 'spring' : 'move');
      }
    }
  }

  // ---- physics ----
  protected integrate(): void {
    this.x += this.xVel;
    this.y += this.yVel;

    if (this.type.effectedByGravity && !this.flying) {
      if (this.y < GROUND_Y) {
        this.yVel += ENEMY_GRAVITY;
      } else {
        this.y = GROUND_Y;
        if (this.yVel > 0) this.yVel = 0;
      }
      if (!this.alive || !this.canUpdate) this.xVel *= 0.85; // friction while staggered/dead
    }

    if (!this.canGoOffScreen) {
      if (this.x > 820) this.x = 820;
      if (this.x < -20) this.x = -20;
    }
  }

  /** bosses face the player directly instead of by velocity */
  protected faceOverride: number | null = null;

  protected applyTransform(): void {
    this.spriter.position.set(this.x, this.y);
    const facing =
      this.faceOverride ?? (this.xVel < -0.1 ? -1 : this.xVel > 0.1 ? 1 : Math.sign(this.spriter.scale.x) || 1);
    this.spriter.scale.set(this.baseScale * facing, this.baseScale);
  }
}
