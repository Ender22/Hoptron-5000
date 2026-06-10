/**
 * Enemy — stats from the original XML, physics from MovableObject
 * (SCALE 0.55, enemy gravity 0.5), AI behaviors approximating the original
 * archetype classes (Mover, Wanderer, Chaser, GroundPopper, Crusher,
 * Exploder, ...). Anim names are uniform across enemy scons: idle/move/hurt/die.
 */
import type { SpriterPlayer } from '../spriter/SpriterPlayer';
import type { EnemyType } from './data/levelData';
import { GROUND_Y } from './PlayerController';

const ENEMY_SCALE = 0.55;
const ENEMY_GRAVITY = 0.5; // original LevelBase.GRAVITY (enemies), bunny uses 0.8

export interface PlayerView {
  x: number;
  y: number;
  invincible: boolean;
}

export class Enemy {
  readonly type: EnemyType;
  readonly spriter: SpriterPlayer;

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

  /** per-AI scratch state */
  private movingLeft = false;
  private aiTimer = 0;
  private aiPhase = 0;
  private targetX = 0;

  private hurtTimer = 0;
  private recoverTimer = 0;

  constructor(type: EnemyType, spriter: SpriterPlayer) {
    this.type = type;
    this.spriter = spriter;
    this.hp = type.hp;
    spriter.setEntity(type.name);
    spriter.scale.set(ENEMY_SCALE);
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

  private play(anim: string): void {
    if (this.spriter.hasAnim(anim) && this.spriter.currentAnimationName !== anim) {
      this.spriter.playAnim(anim);
    }
  }

  hurt(damage: number, knockDir: number): boolean {
    if (this.invincible || !this.alive) return false;
    this.hp -= damage;
    this.invincible = true;
    this.canDamage = false;
    this.canUpdate = false;
    this.contactTime = 0;
    this.spriter.setColor(0xff5555);
    this.hurtTimer = 0.2; // original: invincible cleared after 0.2s
    this.recoverTimer = 0.6; // original: canUpdate/canDamage restored after 0.6s

    if (this.hp <= 0) {
      this.die();
      return true;
    }
    this.play('hurt');
    this.xVel = 4 * knockDir; // original knockback
    return true;
  }

  private die(): void {
    this.alive = false;
    this.canDamage = false;
    this.xVel = 0;
    this.yVel = 0;
    if (this.spriter.hasAnim('die')) {
      this.spriter.playAnim('die', '', null, true);
    }
  }

  update(dt: number, player: PlayerView): void {
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
      }
    }

    if (this.alive && this.canUpdate) {
      this.runAI(dt, player);
    }

    this.integrate();
    this.applyTransform();
    this.spriter.advanceTime(dt);
  }

  // ---- AI dispatch ----
  private runAI(dt: number, player: PlayerView): void {
    switch (this.type.aiType) {
      case 'Wanderer':
        this.aiWanderer(dt);
        break;
      case 'Chaser':
        this.aiChaser(player);
        break;
      case 'GroundPopper':
        this.aiGroundPopper(dt, player);
        break;
      case 'Crusher':
        this.aiCrusher(dt, player);
        break;
      case 'Exploder':
        this.aiChaser(player); // explosion handled by combat system on contact
        break;
      case 'Jumper':
        this.aiJumper(dt, player);
        break;
      default:
        this.aiMover();
    }
  }

  /** walk back and forth, turning at the arena walls (original Mover) */
  private aiMover(): void {
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
  private aiChaser(player: PlayerView): void {
    const t = this.type;
    const dir = player.x < this.x ? -1 : 1;
    this.xVel += t.acceleration * dir;
    this.xVel = Math.max(-t.maxMovementSpeed, Math.min(t.maxMovementSpeed, this.xVel));
    this.play('move');
  }

  /** burrow under the player, pop up, then walk (original GroundPopper) */
  private aiGroundPopper(dt: number, player: PlayerView): void {
    if (this.aiPhase === 0) {
      // underground, slide toward player
      this.spriter.visible = false;
      this.canDamage = false;
      this.aiTimer += dt;
      this.x += Math.sign(player.x - this.x) * 3;
      if (this.aiTimer > 1.2 || Math.abs(player.x - this.x) < 20) {
        this.aiPhase = 1;
        this.spriter.visible = true;
        this.canDamage = true;
        this.y = GROUND_Y + 10;
        this.yVel = -7;
        this.play('move');
      }
    } else {
      this.aiMover();
    }
  }

  /** hover above the player then slam down (original Crusher) */
  private aiCrusher(dt: number, player: PlayerView): void {
    const t = this.type;
    if (this.aiPhase === 0) {
      // track player x at altitude
      const dir = Math.sign(player.x - this.x);
      this.xVel += t.acceleration * dir;
      this.xVel = Math.max(-t.maxMovementSpeed, Math.min(t.maxMovementSpeed, this.xVel));
      const hoverY = GROUND_Y - 220;
      this.yVel = Math.sign(hoverY - this.y) * 1.5;
      this.aiTimer += dt;
      if (this.aiTimer > 1.5 && Math.abs(player.x - this.x) < 40) {
        this.aiPhase = 1;
        this.xVel = 0;
      }
      this.play('move');
    } else if (this.aiPhase === 1) {
      // slam
      this.yVel += 1.2;
      if (this.y >= GROUND_Y) {
        this.aiPhase = 2;
        this.aiTimer = 0;
      }
    } else {
      // rest on ground then rise again
      this.aiTimer += dt;
      this.yVel = 0;
      if (this.aiTimer > 1.2) {
        this.aiPhase = 0;
        this.aiTimer = 0;
      }
    }
  }

  /** hop toward the player (original Jumper) */
  private aiJumper(dt: number, player: PlayerView): void {
    if (this.y >= GROUND_Y) {
      this.aiTimer += dt;
      this.xVel *= 0.8;
      if (this.aiTimer > 0.9) {
        this.aiTimer = 0;
        this.yVel = -9;
        this.xVel = Math.sign(player.x - this.x) * this.type.maxMovementSpeed;
        this.play('move');
      }
    }
  }

  // ---- physics ----
  private integrate(): void {
    this.x += this.xVel;
    this.y += this.yVel;

    if (this.type.effectedByGravity) {
      if (this.y < GROUND_Y) {
        this.yVel += ENEMY_GRAVITY;
      } else {
        this.y = GROUND_Y;
        if (this.yVel > 0) this.yVel = 0;
      }
      if (!this.alive || !this.canUpdate) this.xVel *= 0.85; // friction while staggered/dead
    }

    if (this.x > 820) this.x = 820;
    if (this.x < -20) this.x = -20;
  }

  private applyTransform(): void {
    this.spriter.position.set(this.x, this.y);
    const facing = this.xVel < -0.1 ? -1 : this.xVel > 0.1 ? 1 : Math.sign(this.spriter.scale.x) || 1;
    this.spriter.scale.set(ENEMY_SCALE * facing, ENEMY_SCALE);
  }
}
