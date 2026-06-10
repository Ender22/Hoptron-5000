/**
 * Bespoke boss fights, each a faithful port of its original AS3 class
 * (com/characterclasses/Boss_*.as): action sequences, timings, projectile
 * vectors, reactive escapes. Bosses not yet ported fall back to the generic
 * pattern-driven Boss.
 */
import type { SpriterPlayer } from '../spriter/SpriterPlayer';
import { audio } from './Audio';
import { Boss } from './Boss';
import type { EnemyType, ProjectileType } from './data/levelData';
import { Enemy, type PlayerView } from './Enemy';
import { GROUND_Y } from './PlayerController';

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function createBoss(type: EnemyType, spriter: SpriterPlayer): Boss {
  switch (type.aiType) {
    case 'Boss_Watermelon':
      return new WatermelonBoss(type, spriter);
    case 'Boss_Durian':
      return new DurianBoss(type, spriter);
    case 'Boss_Eggplant':
      return new EggplantBoss(type, spriter);
    case 'Boss_Pumpkin':
      return new PumpkinBoss(type, spriter);
    default:
      return new Boss(type, spriter);
  }
}

// ---------------------------------------------------------------------------
/**
 * PowerSwat — orbiting hand attached to a parent boss (Durian). Harmless but
 * must be destroyed to open the boss's vulnerability window.
 */
export class PowerSwat extends Enemy {
  parentBoss: Enemy | null = null;
  onDestroyed: (() => void) | null = null;
  private offX = 0;
  private offY = 0;
  private t = 0;

  attachTo(parent: Enemy, offX: number, offY: number): void {
    this.parentBoss = parent;
    this.offX = offX;
    this.offY = offY;
    this.flying = true;
    this.canDamage = false;
    this.faceOverride = offX > 0 ? 1 : -1;
    this.play('idle');
  }

  protected runAI(dt: number, _player: PlayerView): void {
    if (!this.parentBoss || !this.parentBoss.alive) return;
    this.t += dt;
    // oscillate toward screen center and up 50px (original tween1/tween2 0.6s each)
    const u = (1 - Math.cos((this.t / 1.2) * Math.PI * 2)) / 2;
    const inward = this.offX > 0 ? -50 : 50;
    this.x = this.parentBoss.x + this.offX + inward * u;
    this.y = this.parentBoss.y + this.offY - 50 * u;
    this.xVel = 0;
    this.yVel = 0;
  }

  protected onDeath(): void {
    audio.play('durian_swat_destroyed', 0, 0.7);
    this.onDestroyed?.();
  }
}

// ---------------------------------------------------------------------------
/**
 * Boss_Watermelon — grounded gunner. Fixed action loop attack/jump/gunshots;
 * 60% chance to jump away when hit while idle, returning from the sky on the
 * far side from the player.
 */
class WatermelonBoss extends Boss {
  private actions = ['attack', 'jump', 'gunshot1', 'gunshot2', 'attack', 'jump', 'gunshot1', 'attack', 'jump', 'gunshot2'];
  private actionIndex = 0;
  private actionTimer = 0;
  private isJumping = false;
  private wasAirborne = false;
  private shotIndex = 9;

  spawnAt(x: number, _y: number): void {
    Enemy.prototype.spawnAt.call(this, x, GROUND_Y);
    this.invincible = true;
    this.canDamage = false;
    this.faceOverride = -1;
    if (this.spriter.hasAnim('spawn')) this.spriter.playAnim('spawn', 'idle', null, true);
    this.actionTimer = 3.5;
    // burst of 4 shots during the spawn animation (original spawnStartShooting)
    this.after(1.7, () => {
      this.invincible = false;
      this.canDamage = true;
      for (let i = 0; i < 4; i++) this.after(0.12 * i, () => this.fireSeed());
    });
  }

  protected runAI(dt: number, player: PlayerView): void {
    this.tickDelayed(dt);

    if (!this.isJumping) {
      this.faceOverride = player.x < this.x ? -1 : 1;
      this.xVel *= 0.8;
    } else {
      this.xVel *= 0.98;
    }

    // jump landing
    const airborne = this.y < GROUND_Y - 1;
    if (this.wasAirborne && !airborne) {
      audio.play('watermelon_hitGroundAfterJump', 0, 0.7);
      this.services?.shake(4);
      this.onLand?.();
    }
    this.wasAirborne = airborne;

    this.actionTimer -= dt;
    if (this.actionTimer <= 0 && !this.isJumping) this.getAction(player);
  }

  private getAction(player: PlayerView): void {
    const action = this.actions[this.actionIndex];
    this.actionIndex = (this.actionIndex + 1) % this.actions.length;
    this.faceOverride = player.x < this.x ? -1 : 1;

    switch (action) {
      case 'attack':
        this.canDamage = false;
        this.spriter.playAnim('attack1', 'idle', null, true);
        audio.play('watermelon_gunSmack', 0.35, 0.7);
        this.after(0.4, () => (this.canDamage = true));
        this.actionTimer = 1.1;
        break;
      case 'jump': {
        this.isJumping = true;
        this.canDamage = false;
        this.spriter.playAnim('jump', 'idle', null, true);
        audio.play('watermelon_jump', 0, 0.7);
        const dir = this.faceOverride ?? 1;
        this.after(0.5, () => {
          this.xVel = 15 * dir;
          this.yVel = -15;
          this.canDamage = true;
        });
        this.after(2.0, () => {
          this.isJumping = false;
          this.xVel = 0;
        });
        this.actionTimer = 2.1;
        break;
      }
      default: {
        // gunshot1 / gunshot2 — 5-shot volley
        this.spriter.playAnim(action === 'gunshot1' ? 'shoot1' : 'shoot2', 'idle', null, true);
        this.shotIndex = 0;
        this.after(0.07, () => this.fireSeed(true));
        this.actionTimer = 1.6;
      }
    }
  }

  private fireSeed(volley = false): void {
    if (!this.alive || !this.projectileDef || !this.services) return;
    const anim = this.spriter.currentAnimationName;
    if (volley && anim !== 'shoot1' && anim !== 'shoot2') return;

    const p0 = this.pointPos(0);
    const p1 = this.pointPos(1);
    const sx = p0?.x ?? this.x + 50 * (this.faceOverride ?? 1);
    const sy = p0?.y ?? this.y - 60;
    // aim along the gun axis (points 0 -> 1), else at the player
    let dx = (this.faceOverride ?? 1) * 1;
    let dy = -0.1;
    if (p0 && p1) {
      dx = p1.x - p0.x;
      dy = p1.y - p0.y;
    }
    const len = Math.max(1, Math.hypot(dx, dy));
    audio.play('projectileShot', 0, 0.6);
    this.services.shoot(this.projectileDef, sx, sy, (dx / len) * 10, (dy / len) * 10, {
      rotation: Math.atan2(dy, dx) + Math.PI / 2,
    });

    if (volley && ++this.shotIndex < 5) {
      this.after(0.22, () => this.fireSeed(true));
    }
  }

  protected onHurt(): void {
    if (this.spriter.currentAnimationName !== 'idle' || this.isJumping) return;
    if (Math.random() < 0.6) this.after(0.31, () => this.jumpAway());
  }

  private jumpAway(): void {
    if (!this.alive || this.isJumping || this.spriter.currentAnimationName !== 'idle') return;
    this.isJumping = true;
    this.invincible = true;
    this.canGoOffScreen = true;
    this.spriter.playAnim('jump', 'idle', null, true);
    audio.play('watermelon_jump', 0, 0.7);
    this.after(0.5, () => {
      this.xVel = this.x > 400 ? 15 : -15;
      this.yVel = -15;
    });
    this.after(2.5, () => this.returnToFight());
  }

  private returnToFight(): void {
    if (!this.alive) return;
    this.isJumping = false;
    this.invincible = false;
    this.canDamage = true;
    this.canGoOffScreen = false;
    this.yVel = 15;
    this.xVel = 0;
    // drop in on the opposite side from the player
    this.x = this.x < 400 ? 700 : 100;
    this.y = -20;
    this.faceOverride = this.x > 400 ? -1 : 1;
    this.spriter.playAnim('crush', 'idle', null, true);
    this.services?.shake(3);
    this.actionTimer = 1.1;
  }
}

// ---------------------------------------------------------------------------
/**
 * Boss_Durian — flying spiker guarded by two PowerSwats. Invincible while
 * any swat lives; killing both forces a 6s grounded vulnerability window,
 * then it recovers and regrows the swats.
 */
class DurianBoss extends Boss {
  private actions = ['spinAttack', 'spinAttack', 'cornerSpinSlam', 'laugh', 'flyCrush', 'flyCrush', 'flyCrush', 'laugh', 'spinAttack', 'spinAttack', 'cornerSpinSlam', 'laugh'];
  private actionIndex = 0;
  private actionTimer = 0;
  private swats: PowerSwat[] = [];
  private swatsRemaining = 0;
  private powered = true;
  private busy = false;

  private doingSpinAttack = false;
  private spinDir = 1;
  private spinSlam = false;
  private isSlamming = false;
  private flyUpForSlam = false;
  private slamIndex = 0;
  private readonly FLY_GROUND = 280; // DURIAN_GROUNDY
  private readonly SLAM_TOP = 40;
  private readonly slamXs = [100, 400, 700];

  spawnAt(x: number, _y: number): void {
    Enemy.prototype.spawnAt.call(this, x, this.FLY_GROUND);
    this.flying = true;
    this.canGoOffScreen = true;
    this.invincible = true;
    this.canDamage = false;
    this.faceOverride = -1;
    if (this.spriter.hasAnim('spawn')) this.spriter.playAnim('spawn', 'idle', null, true);
    this.actionTimer = 5.5;
    this.after(2.5, () => this.spawnSwats());
  }

  private spawnSwats(): void {
    this.swats = [];
    this.swatsRemaining = 0;
    for (const offX of [-95, 95]) {
      const swat = this.services?.spawnChild('swat', this.x + offX, this.y - 30, 0, 0);
      if (swat instanceof PowerSwat) {
        swat.attachTo(this, offX, -30);
        swat.onDestroyed = () => this.swatDestroyed();
        this.swats.push(swat);
        this.swatsRemaining++;
      }
    }
    this.canDamage = true;
  }

  private swatDestroyed(): void {
    this.swatsRemaining--;
    if (this.swatsRemaining <= 0) this.powerDown();
  }

  protected runAI(dt: number, player: PlayerView): void {
    this.tickDelayed(dt);
    const t = this.type;

    if (this.powered) this.invincible = true; // shouldBeInvincible

    // ---- motion phases ----
    if (this.doingSpinAttack) {
      this.xVel = Math.max(-t.maxMovementSpeed, Math.min(t.maxMovementSpeed, this.xVel + t.acceleration * this.spinDir));
      if ((this.spinDir > 0 && this.x > 900) || (this.spinDir < 0 && this.x < -100)) {
        this.doingSpinAttack = false;
        this.busy = false;
        this.xVel = 0;
      }
      return;
    }

    if (this.spinSlam) {
      this.yVel += t.acceleration;
      if (this.y > this.FLY_GROUND) {
        audio.play('durian_hitGround', 0, 0.8);
        this.services?.shake(4);
        this.spriter.playAnim('spinslam', 'idle', null, true);
        this.y = this.FLY_GROUND;
        this.yVel = 0;
        this.xVel = 0;
        this.spinSlam = false;
        this.busy = false;
      }
      return;
    }

    if (this.isSlamming) {
      if (this.flyUpForSlam) {
        if (this.y > this.SLAM_TOP) {
          this.yVel = Math.max(-t.maxMovementSpeed, this.yVel - t.acceleration);
        } else {
          this.y = this.SLAM_TOP;
          this.yVel = 0;
          const targetX = this.slamXs[this.slamIndex];
          if (Math.abs(this.x - targetX) > 30) {
            const dir = Math.sign(targetX - this.x);
            this.xVel = Math.max(-t.maxMovementSpeed, Math.min(t.maxMovementSpeed, this.xVel + t.acceleration * dir));
          } else {
            this.spriter.playAnim('slam', 'idle', null, true);
            this.flyUpForSlam = false;
            this.xVel = 0;
            this.yVel = 0;
            this.canDamage = true;
          }
        }
      } else {
        this.yVel = Math.min(t.maxMovementSpeed * 2, this.yVel + t.acceleration);
        if (this.y >= this.FLY_GROUND) {
          this.y = this.FLY_GROUND;
          this.yVel = 0;
          this.xVel = 0;
          this.isSlamming = false;
          audio.play('durian_slam', 0, 0.8);
          this.services?.shake(4);
          this.slamIndex++;
          if (this.slamIndex < 3) {
            this.after(1, () => this.doSlam());
            this.busy = true;
          } else {
            this.slamIndex = 0;
            this.actionTimer = 2;
            this.busy = false;
          }
        }
      }
      return;
    }

    if (!this.powered) return; // vulnerable window: grounded, no actions

    this.xVel *= 0.9;
    if (this.busy) return;
    this.actionTimer -= dt;
    if (this.actionTimer <= 0) this.getAction(player);
  }

  private getAction(player: PlayerView): void {
    if (this.swatsRemaining <= 0 && this.swats.length > 0) return; // powering down
    this.faceOverride = player.x < this.x ? -1 : 1;
    const action = this.actions[this.actionIndex];
    this.actionIndex = (this.actionIndex + 1) % this.actions.length;

    switch (action) {
      case 'spinAttack':
        this.spriter.playAnim('startspin', 'spin', null, true);
        audio.play('durian_start_spin', 0, 0.6);
        this.busy = true;
        this.after(1.2, () => {
          if (this.x < 400) {
            this.x = Math.min(this.x, -40);
            this.spinDir = 1;
          } else {
            this.x = Math.max(this.x, 840);
            this.spinDir = -1;
          }
          this.canDamage = true;
          this.doingSpinAttack = true;
        });
        this.actionTimer = 3;
        break;

      case 'cornerSpinSlam':
        this.spriter.playAnim('spin', '', null, true);
        this.busy = true;
        this.spinSlam = true;
        if (this.x < 400) {
          this.x = 0;
          this.xVel = 30;
        } else {
          this.x = 850;
          this.xVel = -30;
        }
        this.y = 0;
        this.yVel = -5;
        this.canDamage = true;
        this.actionTimer = 2;
        break;

      case 'flyCrush':
        this.play('idle');
        this.doSlam();
        break;

      default: // laugh
        this.canDamage = false;
        this.spriter.playAnim('laugh', 'idle', null, true);
        audio.play('durian_laugh', 0, 0.7);
        this.actionTimer = 2;
    }
  }

  private doSlam(): void {
    this.isSlamming = true;
    this.flyUpForSlam = true;
    this.busy = true;
  }

  private powerDown(): void {
    this.powered = false;
    this.busy = false;
    this.doingSpinAttack = false;
    this.isSlamming = false;
    this.spinSlam = false;
    this.invincible = false;
    this.canDamage = false;
    this.flying = false; // falls to the real ground
    this.canGoOffScreen = false;
    this.x = Math.max(50, Math.min(750, this.x));
    this.xVel = 0;
    this.yVel = 0;
    audio.play('durian_powerLoss', 0, 0.8);
    this.spriter.playAnim('powerlost', 'powerlost_idle', null, true, true);
    this.after(6, () => this.recoverPower());
  }

  private recoverPower(): void {
    if (!this.alive) return;
    this.powered = true;
    this.invincible = true;
    audio.play('durian_powerGained', 0, 0.8);
    this.spriter.playAnim('recover', 'idle', null, true, true);
    this.flying = true;
    this.after(1.75, () => {
      this.y = this.FLY_GROUND;
      this.spawnSwats();
    });
    this.actionTimer = 3;
  }

  protected onHurt(): void {
    if (!this.powered && this.spriter.currentAnimationName !== 'recover') {
      this.spriter.playAnim('hurt', 'powerlost_idle', null, true);
    }
  }

  protected onDeath(): void {
    super.onDeath();
    audio.play('durian_die', 0, 0.8);
    for (const swat of this.swats) {
      if (swat.alive) {
        swat.suicided = true;
        swat.hp = 0;
        swat.alive = false;
        swat.spriter.visible = false;
      }
    }
  }
}

// ---------------------------------------------------------------------------
/**
 * Boss_Eggplant — grounded boxer. HP-weighted random attack selector that
 * gets lazier as HP drops; turn-punch dash when the player slips behind it;
 * 1-in-7 chance per hit to shoryuken off-screen and drop back in.
 */
class EggplantBoss extends Boss {
  private actionTimer = 0;
  private checkTurnTimer = -1;
  private isOneTwo = false;
  private isRapidPunch = false;
  private isUppercutting = false;
  private isTurnPunch = false;
  private rapidTurnTimer = 0;

  spawnAt(x: number, _y: number): void {
    Enemy.prototype.spawnAt.call(this, x, GROUND_Y);
    this.invincible = false;
    this.canDamage = true;
    this.faceOverride = -1;
    if (this.spriter.hasAnim('spawn')) this.spriter.playAnim('spawn', 'idle', null, true);
    this.actionTimer = 4.5;
  }

  private resetState(): void {
    this.isOneTwo = false;
    this.isRapidPunch = false;
    this.isUppercutting = false;
    this.isTurnPunch = false;
  }

  protected runAI(dt: number, player: PlayerView): void {
    this.tickDelayed(dt);
    const dir = Math.sign(this.faceOverride ?? 1);

    // facing-sensitive contact damage (only hurts in front, never from 80px above)
    const playerInFront = Math.sign(player.x - this.x) === dir;
    const playerAbove = player.y < this.y - 80;
    this.canDamage = playerInFront && !playerAbove && !this.isUppercutting;

    if (this.isTurnPunch) {
      this.xVel = 15 * dir;
    } else if (this.isOneTwo) {
      this.xVel = 4 * dir;
    } else if (this.isRapidPunch) {
      this.xVel = 0.5 * dir;
      this.rapidTurnTimer -= dt;
      if (this.rapidTurnTimer <= 0) this.turnAround(player);
    } else if (!this.isUppercutting) {
      this.xVel *= 0.95;
    }

    if (this.spriter.currentAnimationName === 'idle') {
      this.faceOverride = player.x < this.x ? -1 : 1;
    }

    // one-two: check if the player got behind us (every 1s)
    if (this.isOneTwo && this.checkTurnTimer >= 0) {
      this.checkTurnTimer -= dt;
      if (this.checkTurnTimer <= 0) {
        this.checkTurnTimer = 1;
        const behind = Math.sign(player.x - this.x) !== dir;
        if (behind && Math.random() < 0.5) this.turnPunch();
      }
    }

    this.actionTimer -= dt;
    if (this.actionTimer <= 0 && !this.isTurnPunch && !this.isUppercutting) this.chooseNewAttack(false, player);
  }

  private chooseNewAttack(noRapid: boolean, player: PlayerView): void {
    if (!this.alive || this.spriter.currentAnimationName === 'spawn') return;
    this.resetState();
    this.checkTurnTimer = -1;
    this.faceOverride = player.x < this.x ? -1 : 1;

    // attack pool widens toward "tired" pauses as HP drops (70/40/20%)
    const hpFrac = this.hp / this.type.hp;
    const range = hpFrac > 0.7 ? 4 : hpFrac > 0.4 ? 5 : hpFrac > 0.2 ? 6 : 7;
    const min = noRapid ? 2 : 0;
    const r = Math.floor(rand(min, range));

    if (r <= 1) {
      // rapid punch
      this.spriter.playAnim('pre_onetwo', 'rapidpunch', null, true);
      this.isRapidPunch = true;
      this.rapidTurnTimer = 3;
      this.actionTimer = 9999;
    } else if (r <= 3) {
      // one-two combo
      this.spriter.playAnim('pre_onetwo', '', () => {
        if (!this.alive) return;
        this.spriter.playAnim('onetwo');
        this.isOneTwo = true;
        this.checkTurnTimer = 1;
        this.actionTimer = rand(2, 6);
      }, true);
      this.actionTimer = 9999;
    } else if (r === 4) {
      audio.play('shoryuken', 0, 0.1);
      this.spriter.playAnim('uppercut', '', () => {
        this.actionTimer = 0.01;
      }, true);
      this.actionTimer = 9999;
    } else {
      // tired
      this.play('idle');
      this.actionTimer = rand(0.5, 2.0);
    }
  }

  private turnAround(player: PlayerView): void {
    this.faceOverride = (this.faceOverride ?? 1) * -1;
    this.rapidTurnTimer = 3;
    const dist = Math.abs(player.x - this.x);
    if (Math.random() < 0.33 || dist > 235) {
      this.isRapidPunch = false;
      this.chooseNewAttack(true, player);
    }
  }

  private turnPunch(): void {
    this.faceOverride = (this.faceOverride ?? 1) * -1;
    this.isOneTwo = false;
    this.checkTurnTimer = -1;
    this.spriter.playAnim('turnpunch', 'turnpunch_idle', null, true);
    this.after(0.15, () => {
      this.canGoOffScreen = true;
      this.isTurnPunch = true;
      this.after(2.2, () => this.returnToFight());
    });
    this.actionTimer = 9999;
  }

  protected onHurt(): void {
    if (this.isTurnPunch || this.isUppercutting) return;
    if (Math.random() < 1 / 7) this.after(0.31, () => this.upperCutOff());
  }

  private upperCutOff(): void {
    if (!this.alive || this.isUppercutting) return;
    this.resetState();
    this.isUppercutting = true;
    this.flying = true;
    this.canGoOffScreen = true;
    this.invincible = true;
    this.spriter.playAnim('uppercut_off', '', null, true);
    audio.play('shoryuken', 0, 0.1);
    this.after(0.3, () => {
      this.xVel = this.x > 400 ? 2 : -2;
      this.yVel = -15;
      this.after(2.2, () => this.returnToFight());
    });
    this.actionTimer = 9999;
  }

  private returnToFight(): void {
    if (!this.alive) return;
    this.resetState();
    this.flying = false;
    this.invincible = false;
    this.canGoOffScreen = false;
    this.yVel = 12;
    this.xVel = 0;
    // drop in right next to the player
    const px = this.lastPlayerX;
    if (px < 400) {
      this.x = px + 60;
      this.faceOverride = -1;
    } else {
      this.x = px - 60;
      this.faceOverride = 1;
    }
    this.y = -20;
    this.spriter.playAnim('smashdown', 'idle', null, true);
    this.services?.shake(3);
    this.actionTimer = 0.8;
  }

  private lastPlayerX = 400;

  update(dt: number, player: PlayerView): void {
    this.lastPlayerX = player.x;
    super.update(dt, player);
  }
}

// ---------------------------------------------------------------------------
/**
 * Boss_Pumpkin — flying knife-wielder that shrinks as it takes damage.
 * 21-step action loop: flying slashes, boomerang head throw, lobbed blob
 * triples, off-screen side blasts; 1-in-6 chance per hit to spin-escape.
 */
class PumpkinBoss extends Boss {
  private actions = [
    'flyingSlash', 'slash', 'throw_head', 'slash', 'rest',
    'shoot3', 'slash', 'sideblast', 'slash', 'rest',
    'shoot3', 'slash', 'throw_head', 'slash', 'rest',
    'sideblast', 'slash', 'flyingSlash', 'slash', 'rest',
    'sideblast',
  ];
  private actionIndex = 0;
  private actionTimer = 0;
  private isFlyingSlash = false;
  private slashed = false;
  private flyingOffScreen = false;
  private isSideBlast = false;
  private blastCount = 0;
  private isEscapeSlash = false;
  private noHead = false;
  private shotIndex = 0;
  private glide: { x: number; y: number; time: number; total: number; sx: number; sy: number; then?: () => void } | null = null;

  private readonly blastDef: ProjectileType = {
    id: -1,
    image: 'PumpkinBlast',
    damageDone: 15,
    disappearTime: 1.6,
    maxMovementSpeed: 14,
    effectedByGravity: false,
    specialAIType: '',
    boomerang: false,
  };

  spawnAt(x: number, _y: number): void {
    Enemy.prototype.spawnAt.call(this, x, 250);
    this.flying = true;
    this.canGoOffScreen = true;
    this.invincible = true;
    this.canDamage = false;
    this.faceOverride = -1;
    this.baseScale = 0.75; // SCALE + 0.2, shrinks with damage
    if (this.spriter.hasAnim('spawn')) this.spriter.playAnim('spawn', 'idle', null, true);
    audio.play('pumpkin_hello', 1, 0.7);
    this.actionTimer = 6;
    this.after(5, () => {
      this.invincible = false;
      this.canDamage = true;
    });
  }

  private def(id: number): ProjectileType | null {
    return this.projectileMap?.get(id) ?? null;
  }

  protected runAI(dt: number, player: PlayerView): void {
    this.tickDelayed(dt);
    const t = this.type;

    if (this.isEscapeSlash || this.isSideBlast || this.flyingOffScreen) this.invincible = true;

    // glide tween (original Starling Tweens)
    if (this.glide) {
      const g = this.glide;
      g.time += dt;
      const u = Math.min(1, g.time / g.total);
      const ease = 1 - (1 - u) ** 2;
      this.x = g.sx + (g.x - g.sx) * ease;
      this.y = g.sy + (g.y - g.sy) * ease;
      if (u >= 1) {
        this.glide = null;
        g.then?.();
      }
      return;
    }

    if (this.isEscapeSlash) {
      this.xVel = this.x > 400 || this.xVel > 0 ? 15 : -15;
      if (this.y > 300) this.yVel = -5;
      else this.yVel = 0;
      if (this.x > 950 || this.x < -150) {
        this.isEscapeSlash = false;
        this.invincible = false;
        this.xVel = 0;
        this.actionTimer = 0.5;
      }
      return;
    }

    if (this.flyingOffScreen) {
      this.xVel = (this.faceOverride ?? 1) * 15;
      if (this.x > 950 || this.x < -150) {
        this.flyingOffScreen = false;
        this.xVel = 0;
        this.prepareSideBlast();
      }
      return;
    }

    if (this.isFlyingSlash) {
      this.xVel = (this.faceOverride ?? 1) * 7;
      const dist = Math.hypot(player.x - this.x, player.y - 40 - this.y);
      if (!this.slashed && dist < 250) {
        this.slashed = true;
        this.spriter.playAnim('flyingslash', 'idle', null, true);
        audio.playRandom(['pumpkin_slashdown1', 'pumpkin_slashdown2'], 0, 0.7);
      }
      if (this.x > 950 || this.x < -150) {
        this.isFlyingSlash = false;
        this.xVel = 0;
        this.actionTimer = 1;
      }
      return;
    }

    if (this.isSideBlast) return; // sequenced via after()/glide

    this.xVel *= 0.9;
    this.yVel *= 0.9;
    this.actionTimer -= dt;
    if (this.actionTimer <= 0) this.getAction(player);
  }

  private getAction(player: PlayerView): void {
    // off-screen guard: spin back to the fight instead
    if (this.x > 800 || this.x < 0) {
      this.returnToFight(player);
      return;
    }
    this.faceOverride = player.x < this.x ? -1 : 1;
    const action = this.actions[this.actionIndex];
    this.actionIndex = (this.actionIndex + 1) % this.actions.length;
    this.actionTimer = 9999;

    switch (action) {
      case 'flyingSlash':
        this.canDamage = false;
        this.slashed = false;
        this.spriter.playAnim('pre_flyingslash', '', () => {
          if (!this.alive) return;
          this.canDamage = true;
          this.spriter.playAnim('flyingslash_idle');
          this.isFlyingSlash = true;
        }, true);
        this.startGlide(this.x, player.y - 50, 0.45);
        break;

      case 'throw_head':
        this.noHead = true;
        this.canDamage = false;
        this.spriter.playAnim('pulloffhead', '', () => this.throwHead(player), true);
        break;

      case 'shoot3':
        this.noHead = true;
        this.canDamage = false;
        this.spriter.playAnim('pulloffhead', '', () => this.shoot3(), true);
        break;

      case 'sideblast':
        this.flyingOffScreen = true;
        this.isSideBlast = true;
        this.canDamage = false;
        break;

      case 'slash':
        this.canDamage = true;
        this.spriter.playAnim('slash', 'idle', null, true);
        audio.playRandom(['pumpkin_stab1', 'pumpkin_stab2'], 0, 0.7);
        this.actionTimer = 2.6;
        break;

      default: // rest
        this.canDamage = false;
        this.play('idle');
        this.actionTimer = 1.5;
    }
  }

  private throwHead(player: PlayerView): void {
    if (!this.alive) return;
    this.faceOverride = player.x < this.x ? -1 : 1;
    this.spriter.playAnim('throw_head', 'nohead_idle', null, true);
    this.after(0.5, () => {
      const headDef = this.def(1);
      if (!headDef || !this.services) return;
      audio.play('pumpkin_throwhead', 0, 0.8);
      const p0 = this.pointPos(0);
      const sx = p0?.x ?? this.x;
      const sy = p0?.y ?? this.y - 60;
      const dx = player.x - sx;
      const dy = player.y - 30 - sy;
      const len = Math.max(1, Math.hypot(dx, dy));
      this.services.shoot(headDef, sx, sy, (dx / len) * 8, (dy / len) * 8, { scale: this.baseScale });
    });
    // boomerang returns ~1.5s after launch (def disappearTime)
    this.after(2.1, () => {
      if (!this.alive) return;
      this.noHead = false;
      this.spriter.playAnim('catch_head', 'idle', null, true);
      this.actionTimer = 2.5;
    });
  }

  private shoot3(): void {
    if (!this.alive) return;
    this.xVel = 0;
    this.shotIndex = 0;
    this.spriter.playAnim('shoot3', '', () => {
      if (!this.alive) return;
      this.noHead = false;
      this.spriter.playAnim('returnhead', 'idle', null, true);
      this.actionTimer = 3.5;
    }, true);
    const fire = () => {
      if (!this.alive || this.spriter.currentAnimationName !== 'shoot3') return;
      const blobDef = this.def(2);
      if (blobDef && this.services) {
        audio.play(`pumpkin_shoot${this.shotIndex + 1}`, 0, 0.7);
        const dir = this.faceOverride ?? 1;
        const xv = [1, 3.5, 6][this.shotIndex] * dir;
        this.services.shoot(blobDef, this.x, this.y - 60, xv, -12, { scale: this.baseScale });
      }
      if (++this.shotIndex < 3) this.after(0.355, fire);
    };
    this.after(0.355, fire);
  }

  private prepareSideBlast(): void {
    this.blastCount = 0;
    this.y = rand(100, 320);
    this.spriter.playAnim('sideblast_idle', '', null, true);
    const fromLeft = this.x < 0;
    this.faceOverride = fromLeft ? 1 : -1;
    this.after(1.5, () => {
      this.startGlide(fromLeft ? 50 : 750, this.y, 0.75, () => this.sideBlast());
    });
  }

  private sideBlast(): void {
    if (!this.alive) return;
    const dir = this.faceOverride ?? 1;
    this.spriter.playAnim('sideblast', 'sideblast_idle', null, true);
    audio.play('pumpkin_shoot3', 0, 0.8);
    this.services?.shake(3);
    this.services?.shoot(this.blastDef, this.x + 40 * dir, this.y - 30, 14 * dir, 0, {
      scale: this.baseScale * 4,
      rotation: Math.PI / 2,
    });
    this.blastCount++;
    if (this.blastCount < 3) {
      this.after(0.4, () => {
        this.startGlide(this.x, rand(200, 330), 0.75, () => this.sideBlast());
      });
    } else {
      this.after(1.2, () => {
        this.startGlide(dir > 0 ? -150 : 950, this.y, 0.75, () => {
          this.isSideBlast = false;
          this.invincible = false;
          this.actionTimer = 3.5;
        });
      });
    }
  }

  private startGlide(x: number, y: number, seconds: number, then?: () => void): void {
    this.xVel = 0;
    this.yVel = 0;
    this.glide = { x, y, time: 0, total: seconds, sx: this.x, sy: this.y, then };
  }

  private returnToFight(player: PlayerView): void {
    this.isSideBlast = false;
    this.isFlyingSlash = false;
    this.flyingOffScreen = false;
    this.invincible = false;
    this.canDamage = true;
    this.spriter.playAnim('spin_back', 'idle', null, true);
    if (player.x < 400) {
      this.x = player.x + 60;
      this.faceOverride = -1;
    } else {
      this.x = player.x - 60;
      this.faceOverride = 1;
    }
    this.y = -20;
    this.startGlide(player.x > 440 ? 240 : 640, 250, 1.0, () => {
      this.actionTimer = 1;
    });
    this.actionTimer = 9999;
  }

  protected onHurt(): void {
    // shrink with damage (original specialScale)
    const frac = (this.type.hp - this.hp) / this.type.hp;
    this.baseScale = Math.max(0.4, 0.75 - 0.45 * frac);

    if (this.isSideBlast || this.flyingOffScreen || this.isFlyingSlash || this.isEscapeSlash || this.noHead) return;
    if (Math.random() < 1 / 6) {
      this.after(0.3, () => this.escapeSlash());
    } else if (this.spriter.currentAnimationName === 'idle') {
      this.spriter.playAnim('hurt', 'idle', null, true);
    }
  }

  private escapeSlash(): void {
    if (!this.alive || this.isEscapeSlash || this.isSideBlast || this.glide) return;
    this.spriter.playAnim('spin_escape', 'idle', null, true);
    this.isEscapeSlash = true;
    this.invincible = true;
    this.canDamage = false;
    this.xVel = this.x > 400 ? 15 : -15;
    this.after(0.22, () => (this.canDamage = true));
    this.actionTimer = 9999;
  }

  protected onDeath(): void {
    super.onDeath();
    audio.play('pumpkin_die', 0, 0.8);
  }
}
