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
import { Enemy, ENEMY_SCALE, type PlayerView } from './Enemy';
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
    case 'Boss_Sundae':
      return new SundaeBoss(type, spriter);
    case 'Boss_Cake':
      return new CakeBoss(type, spriter);
    case 'Boss_Noodles':
      return new NoodlesBoss(type, spriter);
    case 'Boss_Sushi':
      return new SushiBoss(type, spriter);
    case 'Boss_Hamburger':
      return new HamburgerBoss(type, spriter);
    case 'Boss_Combo':
      return new ComboBoss(type, spriter);
    case 'Boss_Burrito':
      return new BurritoBoss(type, spriter);
    case 'Boss_MagicMan':
      return new MagicManBoss(type, spriter);
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
  private grow = 0;
  private targetScale = ENEMY_SCALE;

  attachTo(parent: Enemy, offX: number, offY: number): void {
    this.parentBoss = parent;
    this.offX = offX;
    this.offY = offY;
    this.flying = true;
    this.canDamage = false;
    this.faceOverride = offX > 0 ? 1 : -1;
    // original PowerSwat.restore(): scale 0 -> 1 over 1.0s (EASE_OUT_BACK), oscillation starts at 1.1s
    this.grow = 0;
    this.t = 0;
    this.targetScale = this.baseScale;
    this.setBaseScale(0.001);
    this.play('idle');
  }

  protected runAI(dt: number, _player: PlayerView): void {
    if (!this.parentBoss || !this.parentBoss.alive) return;
    this.xVel = 0;
    this.yVel = 0;
    if (this.grow < 1.1) {
      // grow-in phase: hold position at the attach offset while scaling up
      this.grow += dt;
      const u = Math.min(1, this.grow / 1.0);
      const back = 1.70158; // ease-out-back overshoot
      const eased = 1 + (back + 1) * (u - 1) ** 3 + back * (u - 1) ** 2;
      this.setBaseScale(this.targetScale * Math.max(0.001, eased));
      this.x = this.parentBoss.x + this.offX;
      this.y = this.parentBoss.y + this.offY;
      return;
    }
    this.t += dt;
    // oscillate toward screen center and up 50px (original tween1/tween2 0.6s each)
    const u = (1 - Math.cos((this.t / 1.2) * Math.PI * 2)) / 2;
    const inward = this.offX > 0 ? -50 : 50;
    this.x = this.parentBoss.x + this.offX + inward * u;
    this.y = this.parentBoss.y + this.offY - 50 * u;
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
  // original Boss_Watermelon.as:15 — double gunshot only at the very end of the loop
  private actions = ['attack', 'jump', 'gunshot1', 'attack', 'jump', 'gunshot2', 'attack', 'jump', 'gunshot1', 'gunshot2'];
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
        // first shot at 0.07 + 0.22 = 0.29s (original getAction -> startShooting -> shootOne)
        this.after(0.29, () => this.fireSeed(true));
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
    // aim along the gun axis, barrel-base -> muzzle (original shootAnglePoint = pt0 - pt1)
    let dx = (this.faceOverride ?? 1) * 1;
    let dy = -0.1;
    if (p0 && p1) {
      dx = p0.x - p1.x;
      dy = p0.y - p1.y;
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
    if (Math.random() < 0.5) {
      // original: randomNumber(0,5) <= 2 — 50%
      this.after(0.31, () => this.jumpAway());
    } else {
      this.spriter.playAnim('hurt', 'idle', null, true);
    }
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
    // drop in on the opposite side from the PLAYER (original LevelBase.bunny.x < 400)
    const px = this.lastPlayer?.x ?? 400;
    this.x = px < 400 ? 700 : 100;
    this.y = -20;
    this.faceOverride = px < 400 ? -1 : 1;
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
  private slideTo: { x: number; t: number; total: number; sx: number } | null = null;
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
    // original: swats exist from the start (placed by level setup) and scale in;
    // one-tick delay only because services is injected after spawnAt
    this.after(0.05, () => this.spawnSwats());
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

    // powerDown edge slide (original tweenOnScreen: 0.5s EASE_OUT to 50/750)
    if (this.slideTo) {
      const s = this.slideTo;
      s.t += dt;
      const u = Math.min(1, s.t / s.total);
      this.x = s.sx + (s.x - s.sx) * (1 - (1 - u) ** 2);
      if (u >= 1) this.slideTo = null;
    }

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
        this.isSlamming = false; // original Boss_Durian.as:243-244 clears all slam state
        this.doingSpinAttack = false;
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
        this.after(1.2, () => this.startSpinCross());
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
        this.slamIndex = 0; // original Boss_Durian.as:123 — flyCrush always restarts at slam 0
        this.spriter.playAnim('laugh', 'idle', null, true);
        audio.play('durian_laugh', 0, 0.7);
        this.actionTimer = 2;
    }
  }

  /** teleport to an off-screen edge and spin across (original spinAttack) */
  private startSpinCross(): void {
    if (!this.alive) return;
    if (this.x < 400) {
      this.x = Math.min(this.x, -40);
      this.spinDir = 1;
    } else {
      this.x = Math.max(this.x, 840);
      this.spinDir = -1;
    }
    this.canDamage = true;
    this.doingSpinAttack = true;
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
    if (this.x < 25 || this.x > 775) {
      // original tweenOnScreen: 0.5s EASE_OUT slide onto the stage
      this.slideTo = { x: this.x < 25 ? 50 : 750, t: 0, total: 0.5, sx: this.x };
    }
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
    // mandatory recovery spin (original recoverPower -> spinAway at +1.2s -> spinAttack at +1.2s, next action +3s)
    this.after(1.2, () => {
      if (!this.alive || !this.powered) return;
      this.spriter.playAnim('startspin', 'spin', null, true);
      audio.play('durian_start_spin', 0, 0.6);
      this.busy = true;
      this.after(1.2, () => this.startSpinCross());
      this.actionTimer = 3;
    });
    this.actionTimer = 9999;
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
  private preTurnPunch = false;
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
    this.preTurnPunch = false;
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
      this.resetState(); // original idle branch clears lingering state every frame
      this.xVel *= 0.95;
    }

    // one-two: check if the player got behind us (every 1s)
    if (this.isOneTwo && this.checkTurnTimer >= 0) {
      this.checkTurnTimer -= dt;
      if (this.checkTurnTimer <= 0) {
        this.checkTurnTimer = 1;
        const behind = Math.sign(player.x - this.x) !== dir;
        if (behind && Math.random() < 1 / 3) this.turnPunch(); // original randomNumber(0,2) < 1
      }
    }

    this.actionTimer -= dt;
    if (this.actionTimer <= 0 && !this.isTurnPunch && !this.isUppercutting) this.chooseNewAttack(false, player);
  }

  private chooseNewAttack(noRapid: boolean, player: PlayerView): void {
    if (!this.alive || this.spriter.currentAnimationName === 'spawn') return;
    this.xVel = 0; // original Boss_Eggplant.as:68-69 zeroes momentum first
    this.yVel = 0;
    this.resetState();
    this.checkTurnTimer = -1;
    this.faceOverride = player.x < this.x ? -1 : 1;

    // attack pool widens toward "tired" pauses as HP drops (70/40/20%)
    const hpFrac = this.hp / this.type.hp;
    const range = hpFrac > 0.7 ? 4 : hpFrac > 0.4 ? 5 : hpFrac > 0.2 ? 6 : 7;
    const min = noRapid ? 2 : 0;
    // inclusive upper bound like Helper.randomNumber(min, range)
    const r = Math.floor(rand(min, range + 1));

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
    const dist = Math.hypot(player.x - this.x, player.y - this.y); // original Point.distance
    if (Math.random() < 0.33 || dist > 235) {
      this.isRapidPunch = false;
      this.chooseNewAttack(true, player);
    }
  }

  private turnPunch(): void {
    this.faceOverride = (this.faceOverride ?? 1) * -1;
    this.isOneTwo = false;
    this.preTurnPunch = true; // windup blocks the uppercut escape (original preTurnPunch)
    this.checkTurnTimer = -1;
    this.spriter.playAnim('turnpunch', 'turnpunch_idle', null, true);
    this.xVel = (this.faceOverride ?? 1) * 1; // original 1-unit crawl before the +15 lurch
    this.after(0.15, () => {
      this.canGoOffScreen = true;
      this.preTurnPunch = false;
      this.isTurnPunch = true;
      this.after(2.2, () => this.returnToFight());
    });
    this.actionTimer = 9999;
  }

  protected onHurt(): void {
    if (this.isTurnPunch || this.preTurnPunch || this.isUppercutting) return;
    if (Math.random() < 1 / 7) this.after(0.31, () => this.upperCutOff());
  }

  private upperCutOff(): void {
    if (!this.alive || this.isUppercutting) return;
    this.resetState();
    this.isUppercutting = true;
    this.flying = true;
    this.canGoOffScreen = true;
    // (no invincible: the original can still be hit during the escape arc)
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
    const px = this.lastPlayer?.x ?? 400;
    if (px < 400) {
      this.x = px + 60;
      this.faceOverride = -1;
    } else {
      this.x = px - 60;
      this.faceOverride = 1;
    }
    this.y = -20;
    // original chains straight into chooseNewAttack when smashdown completes
    this.spriter.playAnim('smashdown', '', () => {
      this.actionTimer = 0.01;
    }, true);
    this.services?.shake(3);
    this.actionTimer = 9999;
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
    damageDone: 20, // original injureBunny(20)
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
      this.xVel = this.x > 400 ? 15 : -15; // original simple threshold (Boss_Pumpkin.as:535)
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
    const prevFace = this.faceOverride;
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
        this.startGlide(this.x, player.y, 0.45); // original aligns to the exact player y
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
        // original keeps the current facing: the exit direction is whatever way it already faces
        this.faceOverride = prevFace;
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
      if (!headDef || !this.services) {
        this.catchHead();
        return;
      }
      audio.play('pumpkin_throwhead', 0, 0.8);
      const p0 = this.pointPos(0);
      const sx = p0?.x ?? this.x;
      const sy = p0?.y ?? this.y - 60;
      const dx = player.x - sx;
      const dy = player.y - 30 - sy;
      const len = Math.max(1, Math.hypot(dx, dy));
      // event-driven boomerang return (original BOOMERANG_COMPLETE -> boomerangReturned)
      const ok = this.services.shoot(headDef, sx, sy, (dx / len) * 8, (dy / len) * 8, {
        scale: this.baseScale,
        onGone: () => this.catchHead(),
      });
      if (!ok) this.catchHead();
    });
  }

  /** original boomerangReturned(): catch the head and resume */
  private catchHead(): void {
    if (!this.alive || !this.noHead) return;
    this.noHead = false;
    this.spriter.playAnim('catch_head', 'idle', null, true);
    this.actionTimer = 2.5;
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
    // original idles off-screen for 3 seconds before gliding in (tween.delay = 3)
    this.after(3, () => {
      this.startGlide(fromLeft ? 50 : 750, this.y, 0.75, () => this.sideBlast());
    });
  }

  private sideBlast(): void {
    if (!this.alive) return;
    const dir = this.faceOverride ?? 1;
    audio.play('pumpkin_shoot3', 0, 0.8);
    this.services?.shake(3);
    // SUPER_BLAST screen-wide beam (original LevelBase:12018: 0.5s delay, 0.2s sweep, raycast, 20 dmg)
    this.services?.shoot(this.blastDef, this.x + 40 * dir, this.y - 30, dir, 0, {
      beam: true,
      scale: this.baseScale,
    });
    this.blastCount++;
    // repeat is chained off the sideblast animation completing (original sideBlastVerticleTween)
    this.spriter.playAnim('sideblast', '', () => {
      if (!this.alive) return;
      if (this.blastCount < 3) {
        this.spriter.playAnim('sideblast_idle');
        this.after(0.1, () => {
          this.startGlide(this.x, rand(200, 330), 0.75, () => this.sideBlast());
        });
      } else {
        this.spriter.playAnim('sideblast_idle');
        this.after(1.2, () => {
          this.startGlide(dir > 0 ? -150 : 950, this.y, 0.75, () => {
            this.isSideBlast = false;
            this.invincible = false;
            this.actionTimer = 3.5;
          });
        });
      }
    }, true);
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
    // shrink with damage (original specialScale = 0.75 - 0.6 * frac, bottoms out at 0.15)
    const frac = (this.type.hp - this.hp) / this.type.hp;
    this.baseScale = Math.max(0.15, 0.75 - 0.6 * frac);

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

// ---------------------------------------------------------------------------
/** Attachment minion that tracks a fixed offset on its parent (Hamburger heart, Cake candles). */
export class AttachedMinion extends Enemy {
  parentBoss: Enemy | null = null;
  offX = 0;
  offY = 0;
  onDestroyed: (() => void) | null = null;
  /** parent notification on a landed (non-blocked) hit — Hamburger heart triggers the fly escape */
  onHurtHook: (() => void) | null = null;
  /** reasserted every frame (the hurt-flash timer clears invincible on expiry) */
  shouldBeInvincible = false;
  /** lit candles flicker a flame burst so they read as targets */
  flame = false;
  private flameTimer = 0;

  attachTo(parent: Enemy, offX: number, offY: number, scale = 0): void {
    this.parentBoss = parent;
    this.offX = offX;
    this.offY = offY;
    if (scale > 0) this.baseScale = scale;
    this.flying = true;
    this.canDamage = false;
    this.play('idle');
  }

  protected runAI(dt: number, _player: PlayerView): void {
    if (!this.parentBoss) return;
    if (this.shouldBeInvincible) this.invincible = true;
    const facing = Math.sign(this.parentBoss.spriter.scale.x) || 1;
    this.x = this.parentBoss.x + this.offX * facing;
    this.y = this.parentBoss.y + this.offY;
    this.xVel = 0;
    this.yVel = 0;
    if (this.flame) {
      this.flameTimer -= dt;
      if (this.flameTimer <= 0) {
        this.flameTimer = 0.22;
        this.services?.burst(this.x, this.y - 40, 'flame', 3);
      }
    }
  }

  protected onHurt(): void {
    this.onHurtHook?.();
  }

  protected onDeath(): void {
    this.onDestroyed?.();
  }
}

// ---------------------------------------------------------------------------
/** Note — cake's music-note bullets: fly straight right across the stage. */
export class NoteMinion extends Enemy {
  spawnAt(x: number, y: number): void {
    super.spawnAt(x, y);
    this.flying = true;
    this.canDamage = true;
    this.canGoOffScreen = true; // notes start at x=-100 off-screen (original addCakeMusicNotes)
    this.play('idle');
    audio.playRandom(['note1', 'note2', 'note3'], 0, 0.4);
    const tints = [0x118185, 0x9d6359, 0x14b36b, 0xaed15b, 0x89439a];
    this.spriter.setColor(tints[Math.floor(Math.random() * tints.length)]);
  }

  protected runAI(_dt: number, _player: PlayerView): void {
    const t = this.type;
    if (this.xVel < t.maxMovementSpeed) this.xVel += t.acceleration;
    this.yVel = 0;
    if (this.x > 850) {
      this.suicided = true;
      this.alive = false;
      this.canDamage = false;
      this.spriter.visible = false;
    }
  }
}

// ---------------------------------------------------------------------------
/**
 * Boss_Sundae — throws cherries / bananas / live icecream scoops, charges
 * across the arena. Invincible while active: pummeling it (HP-scaled number
 * of blocked hits) staggers it into a 6s vulnerable window.
 */
class SundaeBoss extends Boss {
  private actions = ['shootCherrie', 'shootIcecream', 'attackToSide', 'shootBanana', 'shootAll', 'attackToSide'];
  private actionIndex = 0;
  private actionTimer = 0;
  private flyingAttack = false;
  private chargeLeft = false;
  private stunned = false;
  private blockedHits = 0;
  private throwsLeft = 0;
  private throwKinds: string[] = [];

  spawnAt(x: number, _y: number): void {
    Enemy.prototype.spawnAt.call(this, x, GROUND_Y);
    this.invincible = true;
    this.canDamage = false;
    this.faceOverride = -1;
    if (this.spriter.hasAnim('spawn')) this.spriter.playAnim('spawn', 'idle', null, true);
    audio.play('sundae_roar', 3.3, 0.7);
    this.actionTimer = 6;
  }

  protected runAI(dt: number, player: PlayerView): void {
    this.tickDelayed(dt);
    const t = this.type;
    if (!this.stunned) this.invincible = true;

    if (this.flyingAttack) {
      const cap = t.maxMovementSpeed / 2.5;
      this.xVel = Math.max(-cap, Math.min(cap, this.xVel + t.acceleration * (this.chargeLeft ? -1 : 1)));
      if ((this.chargeLeft && this.x < 180) || (!this.chargeLeft && this.x > 640)) {
        this.flyingAttack = false;
        this.canDamage = false;
        this.play('idle');
        this.actionTimer = 0.5;
      }
      return;
    }

    if (this.stunned) {
      this.xVel = 0;
      return;
    }

    this.xVel *= 0.7;
    this.faceOverride = player.x < this.x ? -1 : 1;
    this.actionTimer -= dt;
    if (this.actionTimer <= 0) this.getAction(player);
  }

  /** HP-phase scaling: 1..5 throws / hits-to-stun */
  private phaseCount(): number {
    const f = this.hp / this.type.hp;
    return f > 0.9 ? 1 : f > 0.7 ? 2 : f > 0.5 ? 3 : f > 0.3 ? 4 : 5;
  }

  private getAction(player: PlayerView): void {
    const action = this.actions[this.actionIndex];
    this.actionIndex = (this.actionIndex + 1) % this.actions.length;
    this.actionTimer = 9999;

    if (action === 'attackToSide') {
      this.spriter.playAnim('flyingattack', '', () => {
        if (!this.alive) return;
        this.spriter.playAnim('flyingattack_idle');
        this.flyingAttack = true;
        this.canDamage = true;
        this.chargeLeft = this.x > 400;
      }, true);
      return;
    }

    this.throwsLeft = this.phaseCount();
    if (action === 'shootAll') {
      this.throwsLeft *= 2;
      this.throwKinds = ['cherry', 'banana', 'icecream'];
      // original shuffles the rotation each shootAll (Helper.randomSortArray)
      for (let i = this.throwKinds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.throwKinds[i], this.throwKinds[j]] = [this.throwKinds[j], this.throwKinds[i]];
      }
    } else {
      this.throwKinds = [action === 'shootCherrie' ? 'cherry' : action === 'shootBanana' ? 'banana' : 'icecream'];
    }
    this.throwNext(player);
  }

  private throwNext(player: PlayerView): void {
    if (!this.alive || this.stunned) return;
    if (this.throwsLeft <= 0) {
      this.actionTimer = 3;
      return;
    }
    this.throwsLeft--;
    const kind = this.throwKinds[this.throwsLeft % this.throwKinds.length];
    this.spriter.playAnim('getProjectile', 'idle', null, true);
    const holdTime = Math.max(0.3, this.hp / this.type.hp);
    this.after(0.25 + holdTime, () => {
      if (!this.alive || this.stunned) return;
      this.spriter.playAnim('throwProjectile', 'idle', null, true);
      this.after(0.43, () => this.throwOne(kind, player));
    });
  }

  private throwOne(kind: string, player: PlayerView): void {
    if (!this.alive || this.stunned) return;
    const dir = this.faceOverride ?? 1;
    const p0 = this.pointPos(0);
    const sx = p0?.x ?? this.x + 40 * dir;
    const sy = p0?.y ?? this.y - 100;
    audio.play('projectileShot', 0, 0.6);

    if (kind === 'icecream') {
      // flies as a (harmless) projectile, then becomes a live scoop enemy with
      // the projectile's momentum 1.2s later (original activateIcecream)
      const ok = this.services?.shoot(
        { id: -1, image: 'Sunday_IceCream', damageDone: 0, disappearTime: 1.2, maxMovementSpeed: 7, effectedByGravity: true, specialAIType: '', boomerang: false },
        sx, sy, 7 * dir, -6,
        {
          scale: 0.8,
          harmless: true,
          onGone: (gx, gy) => {
            if (!this.alive) return;
            this.services?.spawnChild('icecream', gx, Math.min(gy, GROUND_Y), 7 * dir, 0);
          },
        },
      );
      if (!ok) this.services?.spawnChild('icecream', sx, sy, 7 * dir, -6);
    } else if (kind === 'cherry') {
      this.services?.shoot(
        { id: -1, image: 'Sunday_Cherry', damageDone: 20, disappearTime: 2.5, maxMovementSpeed: 9, effectedByGravity: true, specialAIType: '', boomerang: false },
        sx, sy, 9 * dir, -6,
        {
          scale: 0.9,
          // original SundaeProjectile.explode(): shake, explosion_01, 20 dmg within 200px
          onGone: (gx, gy, hitPlayer) => {
            if (hitPlayer || !this.alive) return;
            audio.play('explosion_01', 0, 0.7);
            this.services?.shake(2);
            this.services?.burst(gx, gy, 'explosion_yellow', 10);
            const px = this.lastPlayer?.x ?? -9999;
            const py = (this.lastPlayer?.y ?? -9999) - 40;
            if (Math.hypot(px - gx, py - gy) < 200) {
              this.services?.hurtPlayer(20, Math.sign(px - gx) || 1);
            }
          },
        },
      );
    } else {
      const dx = player.x - sx;
      const dy = player.y - 30 - sy;
      const len = Math.max(1, Math.hypot(dx, dy));
      this.services?.shoot(
        { id: -1, image: 'Sunday_Banana', damageDone: 15, disappearTime: 3, maxMovementSpeed: 9, effectedByGravity: false, specialAIType: '', boomerang: false },
        sx, sy, (dx / len) * 9, (dy / len) * 9, { scale: 0.7, rotSpeed: 0.3 },
      );
    }
    this.after(0.4, () => this.throwNext(player));
  }

  protected onBlockedHit(): void {
    if (this.stunned || !this.alive) return;
    this.blockedHits++;
    if (this.blockedHits >= this.phaseCount() * 4) this.powerDown();
  }

  private powerDown(): void {
    this.blockedHits = 0;
    this.stunned = true;
    this.flyingAttack = false;
    this.invincible = false;
    this.canDamage = false;
    this.canUpdate = true; // original sets canUpdate=false, but our delayed-call recover ticks in runAI
    this.xVel = 0;
    audio.play('durian_powerLoss', 0, 0.7);
    // original gotStunned callback: idle then stunned_idle once get_stunned22 finishes
    this.spriter.playAnim('get_stunned22', '', () => {
      if (this.alive) this.spriter.playAnim('stunned_idle');
    }, true, true);
    this.after(6, () => this.recover());
  }

  private recover(): void {
    if (!this.alive) return;
    this.stunned = false;
    this.invincible = true;
    audio.play('sundae_roar', 1.1, 0.7);
    this.spriter.playAnim('recover', '', () => {
      if (!this.alive) return;
      // always charges right after recovering
      this.spriter.playAnim('flyingattack', '', () => {
        this.spriter.playAnim('flyingattack_idle');
        this.flyingAttack = true;
        this.canDamage = true;
        this.chargeLeft = this.x > 400;
      }, true);
    }, true, true);
  }

  protected onHurt(): void {
    if (this.stunned) this.spriter.playAnim('stunned_hurt', 'stunned_idle', null, true);
  }
}

// ---------------------------------------------------------------------------
/**
 * Boss_Cake — six relighting candles guard it: snuff all six to stun it for
 * 6s. Hand-blast rays, fly-up slam re-entries, homing candle missiles, and a
 * birthday-song bullet-stream of music notes.
 */
class CakeBoss extends Boss {
  private actions = ['shoot2', 'jumpside', 'shoot2x2', 'flyup', 'shoot2', 'jumpside', 'shoot4', 'flyup', 'sing', 'shoot2', 'jumpside', 'shoot2x2', 'fireCandleMissles'];
  private actionIndex = 0;
  private actionTimer = 0;
  private candles: AttachedMinion[] = [];
  private candlesRemaining = 0;
  private stunned = false;
  private isFlyingUp = false;
  /** forced action override (original recoverComplete hardcodes getAction('flyup')) */
  private forceNext: string | null = null;

  spawnAt(x: number, _y: number): void {
    Enemy.prototype.spawnAt.call(this, x, GROUND_Y);
    this.invincible = true;
    this.canDamage = false;
    this.faceOverride = -1;
    if (this.spriter.hasAnim('spawn')) this.spriter.playAnim('spawn', 'idle', null, true);
    audio.play('cake_roar', 3.9, 0.7);
    this.after(4, () => this.lightCandles());
    this.actionTimer = 6;
  }

  private hpFrac(): number {
    return Math.max(0, this.hp / this.type.hp);
  }

  private lightCandles(): void {
    // 6 candles riding the cake's attachment points
    const offsets: [number, number][] = [[-70, -150], [-42, -170], [-14, -180], [14, -180], [42, -170], [70, -150]];
    this.candles = [];
    this.candlesRemaining = 0;
    // NOTE: the rig's authored points all resolve to one spot, so the six
    // candles stacked into what looked like a single candle (playtest) —
    // use the hand-tuned tier offsets instead of pointPos.
    offsets.forEach(([ox, oy]) => {
      const c = this.services?.spawnChild('candle', this.x + ox, this.y + oy, 0, 0);
      if (c instanceof AttachedMinion) {
        c.attachTo(this, ox, oy, 0.85); // bigger + lit, or they read as decoration
        c.flame = true;
        c.onDestroyed = () => this.candleOut(c);
        this.candles.push(c);
        this.candlesRemaining++;
      }
    });
  }

  private candleOut(candle: AttachedMinion): void {
    this.candlesRemaining--;
    if (this.candlesRemaining <= 0) {
      this.powerDown();
      return;
    }
    // relight: respawn that candle after 4-8s (HP-scaled)
    const relight = 4 + 4 * this.hpFrac();
    const offX = candle.offX;
    const offY = candle.offY;
    this.after(relight, () => {
      if (!this.alive || this.stunned) return;
      const c = this.services?.spawnChild('candle', this.x + offX, this.y + offY, 0, 0);
      if (c instanceof AttachedMinion) {
        c.attachTo(this, offX, offY, 0.85);
        c.flame = true;
        c.onDestroyed = () => this.candleOut(c);
        this.candlesRemaining++;
      }
    });
  }

  protected runAI(dt: number, player: PlayerView): void {
    this.tickDelayed(dt);
    if (!this.stunned) this.invincible = true;

    if (this.isFlyingUp) {
      if (this.y < -200) {
        // re-enter above the player's half and slam
        this.isFlyingUp = false;
        this.x = player.x < 400 ? 350 : 450;
        this.y = -20;
        this.flying = false;
        this.yVel = 10;
        this.canDamage = true;
        this.spriter.playAnim('slamdown', '', () => {
          if (!this.alive) return;
          this.play('idle');
          this.canDamage = false;
          this.actionTimer = 0.5;
        }, true);
        audio.play('watermelon_hitGroundAfterJump', 0.38, 0.7);
        this.services?.shake(4);
      }
      return;
    }

    if (this.stunned) {
      this.xVel = 0;
      return;
    }

    this.xVel *= 0.8;
    if (this.y >= GROUND_Y) this.faceOverride = player.x < this.x ? -1 : 1;
    this.actionTimer -= dt;
    if (this.actionTimer <= 0) this.getAction(player);
  }

  private getAction(player: PlayerView): void {
    const action = this.forceNext ?? this.actions[this.actionIndex];
    if (this.forceNext) this.forceNext = null;
    else this.actionIndex = (this.actionIndex + 1) % this.actions.length;
    this.actionTimer = 9999;
    const hpf = this.hpFrac();

    switch (action) {
      case 'shoot2':
        this.spriter.playAnim('shoot2', 'idle', null, true);
        this.after(0.4, () => this.handBlast(6, player));
        this.after(1.05, () => this.handBlast(6, player));
        this.actionTimer = 2 + 1.5 * hpf;
        break;
      case 'shoot2x2':
        this.spriter.playAnim('shoot2x2', 'idle', null, true);
        this.after(0.49, () => {
          this.handBlast(6, player);
          this.handBlast(7, player);
        });
        this.after(1.205, () => {
          this.handBlast(6, player);
          this.handBlast(7, player);
        });
        this.actionTimer = 2.5 + 1.5 * hpf;
        break;
      case 'shoot4':
        this.spriter.playAnim('shoot4', 'idle', null, true);
        this.after(0.24, () => this.handBlast(6, player));
        this.after(0.73, () => this.handBlast(6, player));
        this.after(1.22, () => this.handBlast(7, player));
        this.after(1.7, () => this.handBlast(7, player));
        this.actionTimer = 3 + 1.5 * hpf;
        break;
      case 'flyup':
      case 'jumpside': {
        this.spriter.playAnim(action === 'flyup' ? 'flyup' : 'jumpSide', '', null, true);
        audio.play('watermelon_jump', 0.3, 0.6);
        const delay = action === 'flyup' ? 0.39 : 0.245;
        this.after(delay, () => {
          this.flying = true;
          this.yVel = -15;
          this.isFlyingUp = true;
          this.canGoOffScreen = true;
        });
        break;
      }
      case 'sing': {
        this.spriter.playAnim('sing', '', () => {
          if (this.alive) this.play('dance');
        }, true);
        // 20 music notes staggered 0.45s apart, random heights (original spawn x = -100)
        for (let i = 0; i < 20; i++) {
          this.after(0.5 + i * 0.45, () => {
            if (!this.alive || this.stunned) return;
            this.services?.spawnChild('note', -100, 100 + Math.random() * 205, 0, 0);
          });
        }
        this.actionTimer = 11.5 + 1.5 * hpf;
        break;
      }
      default: {
        // fireCandleMissles: 3 candles fired STRAIGHT UP (original xVel 0 / yVel -7, no homing),
        // chained off the lowercandle2 animation completing
        const missileDef = this.projectileMap?.get(this.type.projectileIds[0] ?? 1) ?? null;
        this.spriter.playAnim('lowercandle2', '', () => {
          if (!this.alive) return;
          this.spriter.playAnim('firecandle', 'idle_nocandle', null, true);
          let fired = 0;
          const fireOne = () => {
            if (!this.alive || this.stunned) {
              this.actionTimer = 2;
              return;
            }
            if (missileDef) {
              audio.play('projectileShot', 0, 0.6);
              this.services?.shoot(missileDef, this.x, this.y - 100, 0, -7, { scale: 0.5, rotation: -Math.PI / 2, homing: false });
            }
            if (++fired < 3) {
              this.after(0.83, fireOne);
            } else {
              // the 6s pause starts only after the 3rd missile (original getNextAction(6))
              this.actionTimer = 6;
              this.after(0.83, () => {
                if (this.alive && !this.stunned) this.spriter.playAnim('raisecandle2', 'idle', null, true);
              });
            }
          };
          this.after(0.33, fireOne);
        }, true);
      }
    }
  }

  /** instant hand-blast ray (original CHECK_SHOT_COLLISION, 150px, 20 dmg) */
  private handBlast(pointIndex: number, player: PlayerView): void {
    if (!this.alive || this.stunned) return;
    audio.playRandom(['cake_shot', 'cake_shot2', 'cake_shot3'], 0, 0.25);
    const p = this.pointPos(pointIndex);
    const dir = this.faceOverride ?? 1;
    const sx = p?.x ?? this.x + 60 * dir;
    const sy = p?.y ?? this.y - 90;
    // ray follows the authored arm angle (original: deg2rad(90 - point.angle), cos/sin offsets, 150px)
    const ptAngle = this.spriter.activePoints[pointIndex]?.angle;
    const theta = ptAngle !== undefined ? (90 - ptAngle) * (Math.PI / 180) - Math.PI / 2 : 0;
    const ex = sx + Math.cos(theta) * 150 * dir;
    const ey = sy + Math.sin(theta) * 150;
    this.services?.burst((sx + ex) / 2, (sy + ey) / 2, 'explosion_yellow', 7);
    const px = player.x;
    const py = player.y - 40;
    const within =
      Math.min(sx, ex) - 20 <= px && px <= Math.max(sx, ex) + 20 &&
      Math.min(sy, ey) - 55 <= py && py <= Math.max(sy, ey) + 55;
    if (within) this.services?.hurtPlayer(20, dir);
  }

  private powerDown(): void {
    this.stunned = true;
    this.invincible = false;
    this.canDamage = false;
    this.isFlyingUp = false;
    this.xVel = 0;
    this.yVel = 0;
    audio.play('durian_powerLoss', 0, 0.7);
    this.spriter.playAnim('get_stunned', 'stunned_idle', null, true, true);
    this.after(6, () => {
      if (!this.alive) return;
      this.stunned = false;
      this.invincible = true;
      audio.play('sundae_roar', 0.28, 0.7);
      // original recoverComplete: relight all candles, then force flyup as the next action
      this.spriter.playAnim('recover', '', () => {
        if (!this.alive) return;
        this.spriter.playAnim('idle');
        this.lightCandles();
        this.forceNext = 'flyup';
        this.actionTimer = 0.01;
      }, true, true);
      this.actionTimer = 9999;
    });
  }

  protected onHurt(): void {
    if (this.spriter.currentAnimationName !== 'recover') {
      this.spriter.playAnim('stunned_hurt', 'stunned_idle', null, true);
    }
  }

  protected onDeath(): void {
    super.onDeath();
    for (const c of this.candles) {
      if (c.alive) {
        c.suicided = true;
        c.hp = 0;
        c.alive = false;
        c.spriter.visible = false;
      }
    }
  }
}

// ---------------------------------------------------------------------------
/**
 * Boss_Noodles — pure-melee swordfighter. Slash lunges, slash combos, wall
 * jumps with push-off dives, triple super-slash below 70% HP, and reactive
 * defends/backflip counters when hit.
 */
class NoodlesBoss extends Boss {
  private actionTimer = 5;
  private mode: 'idle' | 'approachSlash' | 'approachCombo' | 'toWall' | 'wallArc' | 'onWall' | 'pushFly' | 'executing' | 'defend' | 'backflip' = 'idle';
  private slashesLeft = 0;
  private damageWindow = false;
  /** combo holds xVel=2 flat for the whole anim (original EXECUTING_ACTION skips the 0.85 decay) */
  private comboHold = false;
  /** superslash sweep: damage anywhere along the travelled band, not just at launch */
  private superPass = false;
  private superStartX = 0;
  private superHitDone = false;

  spawnAt(x: number, _y: number): void {
    Enemy.prototype.spawnAt.call(this, x, GROUND_Y);
    this.faceOverride = -1;
    if (this.spriter.hasAnim('spawn')) this.spriter.playAnim('spawn', 'idle', null, true);
    audio.play('noodles_unsheath', 2.5, 0.6);
    this.actionTimer = 5;
  }

  protected runAI(dt: number, player: PlayerView): void {
    this.tickDelayed(dt);
    const t = this.type;

    // damage only lands in front (original shouldBeAbleToDamage + side check)
    const dir = this.faceOverride ?? 1;
    this.canDamage = this.damageWindow && Math.sign(player.x - this.x) === dir;

    switch (this.mode) {
      case 'approachSlash':
      case 'approachCombo': {
        const range = this.mode === 'approachSlash' ? 200 : 100;
        this.faceOverride = player.x < this.x ? -1 : 1;
        if (Math.abs(player.x - this.x) > range) {
          this.play('run');
          const d = this.faceOverride;
          this.xVel = Math.max(-t.maxMovementSpeed, Math.min(t.maxMovementSpeed, this.xVel + t.acceleration * d));
        } else if (this.mode === 'approachSlash') {
          this.startSlash();
        } else {
          this.startCombo();
        }
        return;
      }
      case 'toWall': {
        const spot = (this.faceOverride ?? 1) > 0 ? 650 : 150;
        if (Math.abs(this.x - spot) > 10) {
          this.play('run');
          const d = Math.sign(spot - this.x);
          this.xVel = Math.max(-t.maxMovementSpeed, Math.min(t.maxMovementSpeed, this.xVel + t.acceleration * d));
        } else {
          this.xVel = 0;
          this.mode = 'wallArc';
          this.canGoOffScreen = false;
          this.spriter.playAnim('jumpToWall', '', null, true);
          this.after(0.36, () => {
            this.flying = true;
            this.xVel = 5 * (this.faceOverride ?? 1);
            this.yVel = -rand(4, 7);
          });
        }
        return;
      }
      case 'wallArc':
        // stick when we reach a wall
        if (this.x <= 45 || this.x >= 755) {
          this.mode = 'onWall';
          this.xVel = 0;
          this.yVel = 0;
          this.play('wallIdle');
          this.after(rand(0.05, 1.0), () => {
            if (!this.alive) return;
            this.spriter.playAnim('wallPush', '', () => this.wallPushFly(), true);
          });
        }
        return;
      case 'onWall':
        this.xVel = 0;
        this.yVel = 0;
        return;
      case 'pushFly':
        if (this.y >= GROUND_Y) {
          this.mode = 'idle';
          this.flying = false;
          this.damageWindow = false;
          this.xVel *= 0.5;
          this.play('idle');
          this.actionTimer = rand(0.5, 1.5);
        }
        return;
      case 'defend':
        this.xVel = 0;
        return;
      case 'executing':
      case 'backflip':
        if (this.superPass && !this.superHitDone) {
          // sweeping slash line: hit anywhere inside the band travelled so far
          const x0 = Math.min(this.superStartX, this.x) - 30;
          const x1 = Math.max(this.superStartX, this.x) + 30;
          if (player.x >= x0 && player.x <= x1 && Math.abs(player.y - 40 - (this.y - 30)) < 55) {
            this.superHitDone = true;
            this.services?.hurtPlayer(20, this.faceOverride ?? 1);
          }
        }
        if (this.comboHold) this.xVel = 2 * (this.faceOverride ?? 1);
        else this.xVel *= 0.85;
        break;
      default:
        this.xVel *= 0.85;
        this.faceOverride = player.x < this.x ? -1 : 1;
    }

    this.actionTimer -= dt;
    if (this.actionTimer <= 0) this.chooseNewAttack(player);
  }

  private chooseNewAttack(player: PlayerView): void {
    if (!this.alive) return;
    this.damageWindow = false;
    this.comboHold = false;
    this.superPass = false;
    this.invincible = false;
    this.flying = false;
    this.faceOverride = player.x < this.x ? -1 : 1;
    this.actionTimer = 9999;

    const hpFrac = this.hp / this.type.hp;
    const range = hpFrac > 0.9 ? 5 : hpFrac > 0.7 ? 6 : 7;
    const r = Math.floor(rand(0, range));

    if (r === 0) {
      this.mode = 'idle';
      this.play('idle');
      this.actionTimer = rand(0.5, 2.0);
    } else if (r <= 2) {
      this.mode = 'approachSlash';
    } else if (r <= 4) {
      this.mode = 'approachCombo';
    } else if (r === 5) {
      this.mode = 'toWall';
    } else {
      this.slashesLeft = 3;
      this.spriter.playAnim('pre_superslash', '', () => this.startSuperSlash(player), true);
      audio.play('noodles_unsheath', 0, 0.6);
      this.mode = 'executing';
    }
  }

  private startSlash(): void {
    this.mode = 'executing';
    this.damageWindow = true;
    this.comboHold = false;
    this.xVel = 0;
    this.spriter.playAnim('slash', 'idle', null, true);
    this.after(0.29, () => {
      this.xVel = 55 * (this.faceOverride ?? 1);
    });
    this.actionTimer = rand(1.4, 2.4);
  }

  private startCombo(): void {
    this.mode = 'executing';
    this.damageWindow = true;
    this.comboHold = true; // xVel held flat for the whole combo (original)
    this.spriter.playAnim('slashCombo', 'idle', null, true);
    this.xVel = 2 * (this.faceOverride ?? 1);
    this.actionTimer = rand(1.8, 2.5);
  }

  private startSuperSlash(player: PlayerView): void {
    if (!this.alive) return;
    this.mode = 'executing';
    this.damageWindow = true;
    this.comboHold = false;
    audio.play('noodles_superslash', 0, 0.8);
    this.spriter.playAnim('superslash', '', () => this.endSuperSlash(player), true);
    this.xVel = 100 * (this.faceOverride ?? 1);
    // full-width sweeping slash line at chest height (original CHECK_SHOT_COLLISION) —
    // checked every frame across the travelled band in runAI
    this.superPass = true;
    this.superStartX = this.x;
    this.superHitDone = false;
  }

  private endSuperSlash(player: PlayerView): void {
    if (!this.alive) return;
    this.xVel = 0;
    this.superPass = false;
    this.slashesLeft--;
    if (this.slashesLeft > 0) {
      this.faceOverride = this.x < 400 ? 1 : -1;
      this.startSuperSlash(player);
    } else {
      this.spriter.playAnim('post_superslash', 'idle', null, true);
      this.damageWindow = false;
      this.mode = 'idle';
      this.actionTimer = rand(0.5, 2.0);
    }
  }

  private wallPushFly(): void {
    if (!this.alive) return;
    this.faceOverride = (this.faceOverride ?? 1) * -1;
    this.spriter.playAnim('wallPushFly', '', null, true);
    this.damageWindow = true;
    this.mode = 'pushFly';
    this.xVel = 18 * (this.faceOverride ?? 1);
    this.yVel = -3;
    this.flying = false; // gravity pulls the dive down
  }

  protected onHurt(): void {
    const anim = this.spriter.currentAnimationName;
    if (this.mode === 'wallArc' || this.mode === 'onWall') return;
    if (anim !== 'idle' && anim !== 'run' && anim !== 'hurt') return;
    this.damageWindow = false;

    const r = Math.floor(rand(0, 8));
    if (r === 0) {
      // defend: brief invincible guard
      this.mode = 'defend';
      this.invincible = true;
      this.xVel = 0;
      this.spriter.playAnim('defend', 'defend_idle', null, true);
      this.actionTimer = 9999;
      this.after(rand(0.5, 2.0), () => {
        if (!this.alive) return;
        this.invincible = false;
        this.mode = 'idle';
        this.actionTimer = 0.01;
      });
    } else if (r === 1) {
      this.startBackflip();
    } else {
      this.spriter.playAnim('hurt', 'idle', null, true);
    }
  }

  protected onBlockedHit(): void {
    if (this.mode !== 'defend') return;
    if (Math.floor(rand(0, 5)) === 0) {
      this.invincible = false;
      this.startBackflip();
    } else {
      this.spriter.playAnim('defend_hit', 'idle', null, true); // original drops the guard after defend_hit
    }
  }

  private startBackflip(): void {
    this.mode = 'backflip';
    this.invincible = false;
    this.damageWindow = false;
    this.spriter.playAnim('backflipSlash', '', () => {
      if (this.alive) this.startSlash();
    }, true);
    this.after(0.375, () => {
      this.xVel = -6 * (this.faceOverride ?? 1);
      this.yVel = -10;
    });
    this.actionTimer = 9999;
    this.after(1.0, () => {
      if (this.mode === 'backflip') {
        this.mode = 'idle';
        this.actionTimer = 0.01;
      }
    });
  }
}

// ---------------------------------------------------------------------------
/**
 * Boss_Sushi (salmon) — sushi chef with orbiting sushi shields, a boomerang
 * fish knife, soy-sauce blasts, wasabi mortars, and a rapid-cut zigzag
 * counter when hit (1-in-7).
 */
class SushiBoss extends Boss {
  private actions = ['callSushi', 'doubleSmash', 'throwFish', 'removeHat', 'forward_blast', 'blast', 'forward_blast', 'replaceHat', 'sendSushi', 'throwFish', 'doubleSmash'];
  private actionIndex = 0;
  private actionTimer = 5;
  private orbs: Enemy[] = [];
  private orbAngles: number[] = [];
  private orbContact: number[] = [];
  /** orbit only starts after the 2s scale-in tween (original sushiActive) */
  private orbsActive = false;
  private orbGrow = 0;
  private rapid = false;
  private rapidTimer = 0;
  private rapidFlip = 0;
  private noFish = false;
  private noHat = false;

  spawnAt(x: number, _y: number): void {
    Enemy.prototype.spawnAt.call(this, x, GROUND_Y);
    this.faceOverride = -1;
    if (this.spriter.hasAnim('spawn')) this.spriter.playAnim('spawn', 'idle', null, true);
    audio.play('sushi_getmad', 2.5, 0.6);
    this.actionTimer = 5;
  }

  protected runAI(dt: number, player: PlayerView): void {
    this.tickDelayed(dt);

    this.updateOrbs(dt, player);

    if (this.rapid) {
      this.rapidTimer -= dt;
      this.rapidFlip -= dt;
      if (this.rapidFlip <= 0) {
        this.rapidFlip = 0.25;
        this.faceOverride = (this.faceOverride ?? 1) * -1;
        this.xVel = 4 * this.faceOverride;
      }
      if (this.rapidTimer <= 0) {
        this.rapid = false;
        this.invincible = false;
        this.canDamage = false;
        this.xVel = 0;
        this.play('idle');
        this.actionTimer = 0.1;
      }
      return;
    }

    this.xVel *= 0.85;
    this.actionTimer -= dt;
    if (this.actionTimer <= 0) this.getAction(player);
  }

  private idleAnim(): string {
    return this.noFish ? 'idle_noFish' : this.noHat ? 'idle_noHat' : 'idle';
  }

  private getAction(player: PlayerView): void {
    this.faceOverride = player.x < this.x ? -1 : 1;
    const action = this.actions[this.actionIndex];
    this.actionIndex = (this.actionIndex + 1) % this.actions.length;
    this.actionTimer = 9999;

    switch (action) {
      case 'callSushi': {
        this.spriter.playAnim('callSushi', this.idleAnim(), null, true);
        this.orbs = [];
        this.orbAngles = [0, Math.PI / 1.33, Math.PI * 1.33];
        this.orbContact = [0, 0, 0];
        // original: scale 0 -> 0.4 over 1s after a 1s delay; sushiActive only on tween complete
        this.orbsActive = false;
        this.orbGrow = 0;
        for (let i = 0; i < 3; i++) {
          const orb = this.services?.spawnChild('sushiroll', this.x, this.y - 75, 0, 0);
          if (orb) {
            orb.canUpdate = false;
            orb.canDamage = false;
            orb.invincible = true;
            orb.setBaseScale(0.001);
            this.orbs.push(orb);
          }
        }
        this.after(2, () => (this.orbsActive = true));
        this.actionTimer = 4;
        break;
      }
      case 'doubleSmash':
        this.canDamage = true;
        this.spriter.playAnim('doubleSmash', this.idleAnim(), null, true);
        this.after(1.7, () => (this.canDamage = false));
        this.actionTimer = 2;
        break;
      case 'throwFish': {
        this.noFish = true;
        this.spriter.playAnim('throwFish', 'idle_noFish', null, true);
        this.after(0.435, () => {
          if (!this.alive) return;
          const fishDef = this.projectileMap?.get(1);
          if (!fishDef || !this.services) {
            this.catchFish();
            return;
          }
          audio.play('projectileShot', 0, 0.6);
          const p0 = this.pointPos(0);
          const sx = p0?.x ?? this.x + 40 * (this.faceOverride ?? 1);
          const sy = p0?.y ?? this.y - 80;
          const dx = player.x - sx;
          const dy = player.y - 30 - sy;
          const len = Math.max(1, Math.hypot(dx, dy));
          // event-driven boomerang catch (original boomerangReturned)
          const ok = this.services.shoot(fishDef, sx, sy, (dx / len) * 8, (dy / len) * 8, {
            rotSpeed: 0.5,
            onGone: () => this.catchFish(),
          });
          if (!ok) this.catchFish();
        });
        break;
      }
      case 'removeHat':
        this.noHat = true;
        this.spriter.playAnim('removeHat', 'idle_noHat', null, true);
        this.actionTimer = 1;
        break;
      case 'replaceHat':
        this.noHat = false;
        this.spriter.playAnim('replaceHat', 'idle', null, true);
        this.actionTimer = 1;
        break;
      case 'forward_blast':
        // original turns AWAY from the player first, then blasts backward out of the pot
        this.faceOverride = player.x < this.x ? 1 : -1;
        this.spriter.playAnim('pre_forward_blast', '', () => {
          if (!this.alive) return;
          this.spriter.playAnim('forward_blast', '', () => {
            if (!this.alive) return;
            this.spriter.playAnim('post_forward_blast', this.idleAnim(), null, true);
            this.actionTimer = 1;
          }, true);
          this.after(0.18, () => {
            const soyDef = this.projectileMap?.get(2);
            if (!soyDef || !this.services || !this.alive) return;
            audio.play('projectileShot', 0, 0.6);
            this.services.shake(2);
            const p0 = this.pointPos(0);
            // fires opposite the facing — i.e. toward the player it turned away from
            this.services.shoot(soyDef, p0?.x ?? this.x, p0?.y ?? this.y - 70, -12 * (this.faceOverride ?? 1), 0, { rotSpeed: 1 });
          });
        }, true);
        break;
      case 'blast': {
        // 3 upward wasabi mortars, strictly sequential per animation (original blastOne/blastFinished),
        // then idle_noHat and 3 falling from the sky
        this.xVel = 0;
        const wasabiDef = this.projectileMap?.get(3);
        this.actionTimer = 9999;
        let count = 0;
        const blastOne = () => {
          if (!this.alive) return;
          this.spriter.playAnim('blast', '', () => {
            if (!this.alive) return;
            if (++count < 3) {
              blastOne();
            } else {
              this.play('idle_noHat');
              for (let i = 0; i < 3; i++) {
                this.after(i * 0.425, () => {
                  if (!this.alive || !wasabiDef || !this.services) return;
                  this.services.shoot(wasabiDef, [200, 400, 600][i], -50, [-1, 0, 1][i], 10, { scale: 1 });
                });
              }
              this.actionTimer = 3 * 0.425 + 0.5; // original chooseNewActionSoon(0.5) after the last drop
            }
          }, true);
          this.after(0.185, () => {
            if (!this.alive || !wasabiDef || !this.services) return;
            if (this.spriter.currentAnimationName !== 'blast') return;
            audio.play('projectileShot', 0, 0.6);
            this.services.shake(1);
            const p0 = this.pointPos(0);
            this.services.shoot(wasabiDef, p0?.x ?? this.x, p0?.y ?? this.y - 90, [-2, 0, 2][count], -20, { scale: 0.6 });
          });
        };
        blastOne();
        break;
      }
      default: {
        // sendSushi: launch remaining orbs as live sushi rolls
        this.spriter.playAnim('sendSushi', this.idleAnim(), null, true);
        let sent = 0;
        for (const orb of this.orbs) {
          if (!orb.alive) continue;
          const delay = 0.8 + sent * 0.25;
          sent++;
          this.after(delay, () => {
            if (!orb.alive) return;
            orb.suicided = true;
            orb.alive = false;
            orb.spriter.visible = false;
            this.services?.spawnChild('sushiroll', orb.x, orb.y, 3 * (this.faceOverride ?? 1), 1);
          });
        }
        this.orbs = [];
        this.actionTimer = 1.5 + sent * 0.25 + 0.8;
      }
    }
  }

  /** original boomerangReturned(): catch the fish and resume */
  private catchFish(): void {
    if (!this.alive || !this.noFish) return;
    this.noFish = false;
    this.spriter.playAnim('catchFish', this.idleAnim(), null, true);
    this.actionTimer = 2;
  }

  /** orbit the sushi shields and check player contact (150ms dwell) */
  private updateOrbs(dt: number, player: PlayerView): void {
    if (!this.orbsActive) {
      // scale-in at the call position: 1s delay, then 1s tween to full size
      this.orbGrow += dt;
      const u = Math.max(0, Math.min(1, this.orbGrow - 1));
      for (const orb of this.orbs) {
        if (!orb.alive) continue;
        orb.setBaseScale(Math.max(0.001, 0.55 * u));
        orb.x = this.x;
        orb.y = this.y - 75;
        orb.xVel = 0;
        orb.yVel = 0;
      }
      return;
    }
    for (let i = 0; i < this.orbs.length; i++) {
      const orb = this.orbs[i];
      if (!orb.alive) continue;
      this.orbAngles[i] = (this.orbAngles[i] + 0.025 * dt * 60) % (Math.PI * 2);
      orb.x = this.x + Math.sin(this.orbAngles[i]) * 75;
      orb.y = this.y - 75 + Math.cos(this.orbAngles[i]) * 75;
      orb.xVel = 0;
      orb.yVel = 0;
      if (Math.abs(orb.x - player.x) < 40 && Math.abs(orb.y - (player.y - 40)) < 45) {
        this.orbContact[i] += dt;
        if (this.orbContact[i] >= 0.15) {
          this.services?.hurtPlayer(orb.type.attackDmg, Math.sign(player.x - orb.x) || 1);
          orb.suicided = true;
          orb.alive = false;
          orb.spriter.visible = false;
        }
      } else {
        this.orbContact[i] = 0;
      }
    }
  }

  protected onHurt(): void {
    const anim = this.spriter.currentAnimationName;
    if (!['idle', 'idle_noFish', 'idle_noHat', 'hurt'].includes(anim)) return;
    this.canDamage = false;
    if (Math.floor(rand(0, 7)) === 0) {
      // rapid-cut counter
      audio.play('sushi_getmad2', 0, 0.7);
      this.spriter.playAnim('pre_rapidCut', '', () => {
        if (!this.alive) return;
        this.invincible = true;
        this.canDamage = true;
        this.rapid = true;
        this.rapidTimer = 3;
        this.rapidFlip = 0.25; // first direction flip after 0.25s
        // original startRapid lunges toward the player immediately at xVel 4
        const px = this.lastPlayer?.x ?? 400;
        this.xVel = 4 * (Math.sign(px - this.x) || 1);
        this.faceOverride = Math.sign(this.xVel) || 1;
        this.play('rapidCut');
      }, true);
      this.actionTimer = 9999;
    } else {
      const hurtAnim = this.noFish ? 'hurt_noFish' : this.noHat ? 'hurt_noHat' : 'hurt';
      this.spriter.playAnim(hurtAnim, this.idleAnim(), null, true);
    }
  }

  protected onDeath(): void {
    super.onDeath();
    for (const orb of this.orbs) {
      if (orb.alive) {
        orb.suicided = true;
        orb.alive = false;
        orb.spriter.visible = false;
      }
    }
  }
}

// ---------------------------------------------------------------------------
/**
 * Boss_Hamburger — invincible burger whose heart is the real target. Seed
 * sprays, fly-up slams, and a vacuum suck that drags the player toward its
 * mouth (chew + spit if it gets you). The heart is exposed during laugh and
 * suck; killing the heart kills the boss.
 */
class HamburgerBoss extends Boss {
  private actions = ['shoot360', 'laugh', 'shoot', 'suck', 'fly', 'fly', 'shoot', 'laugh'];
  private actionIndex = 0;
  private actionTimer = 0;
  private heart: AttachedMinion | null = null;
  private sucking = false;
  private suckTimer = 0;
  private chewing = false;
  private stopSuckLoop: (() => void) | null = null;
  private flyPhase = 0;
  private sprayAngle = 0;
  private glide: { x: number; y: number; time: number; total: number; sx: number; sy: number; then?: () => void } | null = null;

  spawnAt(x: number, _y: number): void {
    Enemy.prototype.spawnAt.call(this, x, GROUND_Y);
    this.invincible = true;
    this.faceOverride = -1;
    if (this.spriter.hasAnim('spawn')) this.spriter.playAnim('spawn', 'idle', null, true);
    audio.play('hamburger_laugh', 1, 0.7);
    // seed burst during spawn
    this.after(1.55, () => {
      for (let i = 0; i < 15; i++) this.after(0.05 * i, () => this.fireSeed(this.sprayAngle += 0.42));
    });
    this.after(2.2, () => {
      const heart = this.services?.spawnChild('hamburger_heart', this.x, this.y - 50, 0, 0);
      if (heart instanceof AttachedMinion) {
        heart.attachTo(this, 0, -50); // original setParentEnemy updateYOffset -50
        heart.invincible = true;
        heart.shouldBeInvincible = true;
        heart.onDestroyed = () => {
          if (this.alive) this.services?.killEnemy(this);
        };
        // heart damage triggers the burger's hurt + forced fly escape (original onHurt -> jumpAwaySoon)
        heart.onHurtHook = () => this.onHeartHurt();
        this.heart = heart;
      }
    });
    this.actionTimer = 5;
  }

  protected runAI(dt: number, player: PlayerView): void {
    this.tickDelayed(dt);
    this.invincible = true; // the heart is the target

    // fly-slam repositioning tween (original Tween EASE_IN_OUT over 1s)
    if (this.glide) {
      const g = this.glide;
      g.time += dt;
      const u = Math.min(1, g.time / g.total);
      const ease = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) ** 2;
      this.x = g.sx + (g.x - g.sx) * ease;
      this.y = g.sy + (g.y - g.sy) * ease;
      if (u >= 1) {
        this.glide = null;
        g.then?.();
      }
      return;
    }

    if (this.sucking) {
      this.suckTimer -= dt;
      this.services?.pullPlayer(this.x, this.y - 40, 0.55);
      if (!this.chewing && Math.abs(player.x - this.x) < 55 && Math.abs(player.y - this.y) < 80) {
        // got you: chew then spit
        this.chewing = true;
        this.endSuck(false);
        this.spriter.playAnim('chew', '', () => {
          if (!this.alive) return;
          this.spriter.playAnim('spit', 'idle', null, true);
          audio.play('hamburger_spit', 0, 0.8);
          this.after(0.8, () => {
            // original launches the bunny (ko_fly, xVel ±10 / yVel -7) — player-anim
            // dependent, so a minimal knockback hit stands in for the throw
            this.services?.hurtPlayer(1, this.faceOverride ?? 1);
            this.services?.shake(3);
            this.chewing = false;
            this.actionTimer = 2;
          });
        }, true);
        audio.play('hamburger_chew', 0, 0.8);
        // original injureBunnyFromHamburger: flat 30 at 0.2s into the chew
        this.after(0.2, () => this.services?.hurtPlayer(30, 0));
        return;
      }
      if (this.suckTimer <= 0) {
        this.endSuck(true);
        this.actionTimer = 2;
      }
      return;
    }
    if (this.chewing) return;

    if (this.flyPhase === 1) {
      // rising off-screen; the reposition tween is scheduled from the fly action
      return;
    }
    if (this.flyPhase === 3) {
      if (this.y >= GROUND_Y) {
        this.flyPhase = 0;
        this.services?.shake(6);
        audio.play('watermelon_hitGroundAfterJump', 0, 0.7);
        this.after(0.65, () => (this.canDamage = false));
        this.actionTimer = 1.5;
      }
      return;
    }

    this.xVel *= 0.85;
    this.faceOverride = player.x < this.x ? -1 : 1;
    this.actionTimer -= dt;
    if (this.actionTimer <= 0) this.getAction(player);
  }

  private setHeartExposed(exposed: boolean): void {
    if (this.heart?.alive) {
      this.heart.invincible = !exposed;
      this.heart.shouldBeInvincible = !exposed;
    }
  }

  private getAction(player: PlayerView): void {
    const action = this.actions[this.actionIndex];
    this.actionIndex = (this.actionIndex + 1) % this.actions.length;
    this.actionTimer = 9999;
    this.setHeartExposed(false);

    switch (action) {
      case 'shoot360': {
        this.spriter.playAnim('shoot360', 'idle', null, true);
        this.after(1.23, () => (this.faceOverride = (this.faceOverride ?? 1) * -1));
        this.after(0.2, () => {
          for (let i = 0; i < 30; i++) this.after(0.05 * i, () => this.fireSeed(this.sprayAngle += 0.21));
        });
        this.actionTimer = 2.2; // original: startShoot360 at 0.2s + chooseNewActionSoon(2)
        break;
      }
      case 'shoot': {
        this.spriter.playAnim('shootAtBunny', 'idle', null, true);
        this.after(0.1, () => {
          for (let i = 0; i < 8; i++) {
            this.after(0.05 * i, () => {
              const angle = Math.atan2(player.y - 40 - (this.y - 80), player.x - this.x) + rand(-0.15, 0.15);
              this.fireSeed(angle, true);
            });
          }
        });
        this.actionTimer = 1.6; // original: 0.1s pre-delay + chooseNewActionSoon(1.5)
        break;
      }
      case 'laugh':
        this.spriter.playAnim('laugh', 'idle', null, true);
        audio.play('hamburger_laugh', 0, 0.8);
        this.setHeartExposed(true);
        this.actionTimer = 2;
        break;
      case 'suck':
        audio.play('hamburger_suck_start', 0, 0.8);
        this.setHeartExposed(true);
        this.spriter.playAnim('start_suck', '', () => {
          if (!this.alive) return;
          this.play('suck_idle');
          this.stopSuckLoop = audio.playLoop('hamburger_suck_loop', 0.5);
          this.sucking = true;
          this.suckTimer = 4.5;
        }, true);
        break;
      default:
        this.startFly();
    }
  }

  /** fly slam (original addJumpVel -> prepareForSlam tween -> addSlamVel) */
  private startFly(): void {
    if (this.flyPhase !== 0 || this.chewing || this.glide) return;
    if (this.sucking) this.endSuck(false);
    this.actionTimer = 9999;
    this.spriter.playAnim('flyUp', '', null, true);
    this.after(0.295, () => {
      this.flying = true;
      this.canGoOffScreen = true;
      this.yVel = -10;
      this.flyPhase = 1;
      // original: prepareForSlam at +1s, tween delay 0.25s, then 1s EASE_IN_OUT to (rand(100,700), 40)
      this.after(1.25, () => {
        if (!this.alive) return;
        this.flyPhase = 2;
        this.yVel = 0;
        this.startGlide(100 + Math.random() * 600, 40, 1.0, () => {
          this.flyPhase = 3;
          this.flying = false;
          this.yVel = 1; // gravity takes over (original addSlamVel yVel=1, not a launch)
          this.canDamage = true;
          this.spriter.playAnim('slamDown', 'idle', null, true);
        });
      });
    });
  }

  private startGlide(x: number, y: number, seconds: number, then?: () => void): void {
    this.xVel = 0;
    this.yVel = 0;
    this.glide = { x, y, time: 0, total: seconds, sx: this.x, sy: this.y, then };
  }

  private endSuck(playFinish: boolean): void {
    this.sucking = false;
    this.stopSuckLoop?.();
    this.stopSuckLoop = null;
    this.setHeartExposed(false);
    if (playFinish) this.spriter.playAnim('suck_finished', 'idle', null, true);
  }

  private fireSeed(angle: number, aimed = false): void {
    if (!this.alive || !this.services) return;
    const anim = this.spriter.currentAnimationName;
    if (!aimed && anim !== 'shoot360' && anim !== 'spawn') return;
    const seedDef = this.projectileMap?.get(this.type.projectileIds[0] ?? 1);
    if (!seedDef) return;
    audio.play('projectileShot', 0, 0.3);
    this.services.shoot(seedDef, this.x, this.y - 80, 10 * Math.cos(angle), 10 * Math.sin(angle), {
      rotation: angle + Math.PI / 2,
    });
  }

  /** heart was hit: hurt anim, heart re-shielded, forced fly-slam escape (original onHurt + jumpAwaySoon) */
  private onHeartHurt(): void {
    if (!this.alive) return;
    if (this.sucking) this.endSuck(true);
    this.setHeartExposed(false); // original heartInvincible()
    this.spriter.playAnim('hurt', 'idle', null, true);
    this.after(0.25, () => {
      if (this.alive) this.startFly();
    });
  }

  dispose(): void {
    this.stopSuckLoop?.();
  }

  protected onDeath(): void {
    super.onDeath();
    this.dispose();
    if (this.heart?.alive) {
      this.heart.suicided = true;
      this.heart.hp = 0;
      this.heart.alive = false;
      this.heart.spriter.visible = false;
    }
  }
}

// ---------------------------------------------------------------------------
/**
 * Boss_Combo — the final-food colossus. Melee smashes and kicks, homing fry
 * launches, aimed nugget blasts, arena-crossing stomps, minion-summoning
 * roars — and a break system: every chunk of HP lost it shatters into a wave
 * of KO-able enemies; knock them all out to bring the boss back.
 */
class ComboBoss extends Boss {
  private actions = ['smash', 'footballKick', 'shootFries', 'smash', 'stomp', 'handNuggetBlast', 'footballKick', 'roar', 'smash', 'footballKick', 'shootFries', 'smash', 'stomp', 'handNuggetBlast', 'footballKick'];
  private actionIndex = 0;
  private actionTimer = 0;
  private nextHpLevel = 0;
  private broken = false;
  private koRemaining = 0;
  private mode: 'idle' | 'approach' | 'stomp' = 'idle';
  private approachAction = '';
  private stompLeft = false;
  private pieces: Enemy[] = [];

  /** the 14 break-apart pieces and their body-part offsets (original LevelBase:4347-4420, × SCALE) */
  private static readonly PIECE_LAYOUT: [string, number, number][] = [
    ['pizza', -112, -368], ['pizza', 138, -334], ['pizza', -68, -120], ['pizza', 60, -106],
    ['hotdog', -33, -307], ['hotdog', 46, -302], ['hotdog', -17, -220], ['hotdog', 30, -208],
    ['nugget', -142, -383], ['nugget', 168, -347], ['nugget', -80, -80], ['nugget', 75, -75],
    ['drink', 10, -210],
    ['fries', 5, -360],
  ];

  spawnAt(x: number, _y: number): void {
    Enemy.prototype.spawnAt.call(this, x, GROUND_Y);
    this.faceOverride = -1;
    this.nextHpLevel = this.type.hp - 1000; // original: first break at maxHP - 1000
    if (this.spriter.hasAnim('spawn')) this.spriter.playAnim('spawn', 'idle', null, true);
    audio.play('combo_bigRoar', 1, 0.8);
    this.actionTimer = 3;
  }

  protected runAI(dt: number, player: PlayerView): void {
    this.tickDelayed(dt);
    const t = this.type;

    if (this.broken) {
      // safety net for pieces that died outright instead of KO'ing
      if (this.pieces.length > 0 && this.pieces.every((p) => !p.alive || p.koDone)) this.reform();
      return;
    }

    if (this.mode === 'approach') {
      const range = this.approachAction === 'smash' ? 150 : 200;
      this.faceOverride = player.x < this.x ? -1 : 1;
      if (Math.abs(player.x - this.x) > range) {
        this.play('walk');
        this.xVel = Math.max(-t.maxMovementSpeed, Math.min(t.maxMovementSpeed, this.xVel + t.acceleration * this.faceOverride));
      } else {
        this.xVel *= 0.1;
        this.mode = 'idle';
        this.doMelee(this.approachAction);
      }
      return;
    }

    if (this.mode === 'stomp') {
      this.canDamage = true;
      const dir = this.stompLeft ? -1 : 1;
      this.xVel = Math.max(-t.maxMovementSpeed, Math.min(t.maxMovementSpeed, this.xVel + t.acceleration * dir));
      if ((dir > 0 && this.x > 680) || (dir < 0 && this.x < 100)) {
        this.xVel = 0;
        this.mode = 'idle';
        this.canDamage = false;
        this.faceOverride = dir * -1;
        this.play('idle');
        this.actionTimer = 0.1; // original chooseNewActionSoon(0.1)
      }
      audio.playRandom(['combo_stomp1', 'combo_stomp2', 'combo_stomp3'], 0, 0.12);
      return;
    }

    this.xVel *= 0.85;
    if (this.spriter.currentAnimationName === 'idle' || this.spriter.currentAnimationName === 'handNuggetBlast') {
      this.faceOverride = player.x < this.x ? -1 : 1;
    }
    this.actionTimer -= dt;
    if (this.actionTimer <= 0) this.getAction(player);
  }

  private getAction(player: PlayerView): void {
    const action = this.actions[this.actionIndex];
    this.actionIndex = (this.actionIndex + 1) % this.actions.length;
    this.actionTimer = 9999;
    this.canDamage = false;

    switch (action) {
      case 'smash':
      case 'footballKick':
        this.mode = 'approach';
        this.approachAction = action;
        break;
      case 'shootFries': {
        this.spriter.playAnim('shootFries', 'idle', null, true);
        const fryDef = this.projectileMap?.get(this.type.projectileIds[0] ?? 0);
        for (let i = 0; i < 3; i++) {
          this.after(0.85 + i * 0.4, () => {
            if (!this.alive || !fryDef || !this.services) return;
            this.services.shake(2);
            audio.play('projectileShot', 0, 0.5);
            this.services.shoot(fryDef, this.x + 10 * (this.faceOverride ?? 1), this.y - 184, 0, -6, { scale: 0.7, rotation: -Math.PI / 2 });
          });
        }
        this.actionTimer = 2.2;
        break;
      }
      case 'stomp':
        this.spriter.playAnim('stompAcrossLevel', '', null, true);
        this.mode = 'stomp';
        this.stompLeft = player.x < this.x;
        break;
      case 'handNuggetBlast': {
        this.spriter.playAnim('handNuggetBlast', 'idle', null, true);
        this.after(0.515, () => {
          const nuggetDef = this.projectileMap?.get(2);
          if (!this.alive || !nuggetDef || !this.services) return;
          audio.play('combo_blast', 0, 0.7);
          this.services.shake(2);
          const p0 = this.pointPos(0);
          const sx = p0?.x ?? this.x + 60 * (this.faceOverride ?? 1);
          const sy = p0?.y ?? this.y - 120;
          const dx = player.x - sx;
          const dy = player.y - 30 - sy;
          const len = Math.max(1, Math.hypot(dx, dy));
          this.services.shoot(nuggetDef, sx, sy, (dx / len) * 10, (dy / len) * 10, { scale: 0.3 }); // original 0.3
          this.actionTimer = 1.0; // original fireNugget -> chooseNewActionSoon(1)
        });
        this.actionTimer = 9999;
        break;
      }
      default:
        // roar: summon minions — original spawnMoreComboEnemies: 6 enemies
        // (ids 0,0,1,1,3,5) falling from above, staggered 0.2s
        this.spriter.playAnim('roar', 'idle', null, true);
        audio.playRandom(['combo_roar1', 'combo_roar2', 'combo_roar3'], 0, 0.8);
        this.services?.shake(5);
        this.after(0.05, () => {
          const summons = ['hotdog', 'hotdog', 'drink', 'drink', 'nuggetbox', 'fries'];
          summons.forEach((name, i) => {
            this.after(0.2 * i, () => {
              this.services?.spawnChild(name, 100 + Math.random() * 600, -20, 0, 0);
            });
          });
        });
        this.actionTimer = 3;
    }
  }

  private doMelee(action: string): void {
    this.spriter.playAnim(action === 'smash' ? 'smashArm' : 'footballKick', 'idle', null, true);
    audio.play(action === 'smash' ? 'combo_down' : 'combo_up', 0, 0.6);
    this.after(0.7, () => {
      this.canDamage = true;
      this.xVel *= 0.5;
    });
    this.actionTimer = action === 'smash' ? 1.5 : 1.4;
  }

  protected onHurt(): void {
    if (this.broken) return;
    if (this.hp > 0 && this.hp <= this.nextHpLevel) {
      this.nextHpLevel -= 2000; // original fixed 2000 steps (7000/5000/3000)
      this.breakApart();
    }
  }

  private breakApart(): void {
    this.broken = true;
    this.mode = 'idle';
    this.canDamage = false;
    this.xVel = 0;
    audio.play('combo_preBreak', 0, 0.8);
    this.x = Math.max(100, Math.min(700, this.x));
    this.spriter.playAnim('preBreakApart', '', () => {
      if (!this.alive) return;
      this.services?.shake(4);
      this.invincible = true;
      this.spriter.visible = false;
      // shatter into the 14 KO-able body-part pieces; knock them ALL out to reform the boss
      this.koRemaining = 0;
      this.pieces = [];
      for (const [name, ox, oy] of ComboBoss.PIECE_LAYOUT) {
        const piece = this.services?.spawnChild(
          name,
          this.x + ox * ENEMY_SCALE,
          this.y + oy * ENEMY_SCALE,
          rand(-3, 3),
          rand(-5, -1),
        );
        if (piece) {
          piece.koMode = true;
          this.koRemaining++;
          this.pieces.push(piece);
          piece.onKO = () => {
            this.koRemaining--;
            if (this.koRemaining <= 0) this.reform();
          };
        }
      }
    }, true);
  }

  private clearPieces(): void {
    for (const piece of this.pieces) {
      piece.suicided = true;
      piece.alive = false;
      piece.spriter.visible = false;
    }
    this.pieces = [];
  }

  private reform(): void {
    if (!this.alive || !this.broken) return;
    this.clearPieces();
    audio.play('combo_bigRoar', 0, 0.8);
    this.broken = false;
    this.invincible = false;
    this.spriter.visible = true;
    this.spriter.playAnim('spawn', 'idle', null, true);
    this.services?.shake(5);
    this.actionTimer = 2;
  }

  protected onDeath(): void {
    super.onDeath();
    this.clearPieces();
  }
}

// ---------------------------------------------------------------------------
/**
 * Boss_Burrito — the final food boss (condensed port of the 3,122-line
 * original). One rig, ten forms: it transforms through every prior boss as
 * its HP drops, via changeToX animations at fixed HP thresholds. Each form
 * runs a small action loop borrowing that boss's signature moves; Durian
 * form regrows PowerSwats, Cake form regrows candles, Sundae form must be
 * pummeled through its guard.
 */
interface BurritoPhase {
  key: string;
  minHp: number;
  idle: string;
  change: string;
  hurt: string;
  actions: string[];
}

const BURRITO_PHASES: BurritoPhase[] = [
  { key: 'watermelon', minHp: 16500, idle: 'idle_watermelon', change: 'changeToWatermelon', hurt: 'water_hurt', actions: ['w_attack', 'w_jump', 'w_shoot', 'w_attack', 'w_jump', 'w_shoot'] },
  { key: 'durian', minHp: 14500, idle: 'idle_durian', change: 'changeToDurian', hurt: 'dur_hurt', actions: ['dur_spin', 'dur_spin', 'dur_slam', 'dur_flycrush', 'dur_flycrush', 'dur_flycrush', 'rest'] },
  { key: 'eggplant', minHp: 13000, idle: 'idle_eggplant', change: 'changeToEggplant', hurt: 'egg_hurt', actions: ['egg_onetwo', 'egg_onetwo', 'egg_turnpunch', 'egg_rapidpunch', 'rest'] },
  { key: 'pumpkin', minHp: 11500, idle: 'idle_pumpkin', change: 'changeToPumpkin', hurt: 'pumpkin_hurt', actions: ['pk_flyslash', 'pk_slash', 'rest', 'pk_slash', 'pk_sideblast'] },
  { key: 'sundae', minHp: 9500, idle: 'idle_sundae', change: 'changeToSundae', hurt: 'sundae_hurt', actions: ['su_throw', 'su_throw', 'su_charge'] },
  { key: 'cake', minHp: 7500, idle: 'idle_cake', change: 'changeToCake', hurt: 'cake_hurt', actions: ['ck_shoot2x2', 'ck_shoot4', 'ck_flyup', 'ck_shoot2x2', 'ck_sing'] },
  { key: 'noodles', minHp: 5500, idle: 'idle_noodles', change: 'changeToNoodles', hurt: 'noodles_hurt', actions: ['nd_slash', 'nd_combo', 'nd_backflip', 'nd_slash', 'nd_combo', 'nd_super'] },
  { key: 'sushi', minHp: 3500, idle: 'idle_sushi', change: 'changeToSushi', hurt: 'sushi_hurt', actions: ['sh_smash', 'sh_fish', 'sh_fwdblast', 'sh_blast', 'sh_fwdblast', 'sh_smash', 'sh_fish', 'sh_rapidcut'] },
  { key: 'hamburger', minHp: 3000, idle: 'idle_hamburger', change: 'changeToHamburger', hurt: 'ham_hurt', actions: ['hm_shoot360', 'hm_shoot', 'hm_suck', 'hm_fly', 'hm_fly'] },
  { key: 'combo', minHp: -999999, idle: 'idle_combo', change: 'changeToCombo', hurt: 'combo_hurt', actions: ['cb_smash', 'cb_kick', 'cb_stomp', 'cb_nugget'] },
];

class BurritoBoss extends Boss {
  private phaseIndex = -1;
  private actionIndex = 0;
  private actionTimer = 0;
  private mode: 'idle' | 'approach' | 'charge' | 'stomp' | 'flyup' | 'spin' | 'flycrush' | 'rapidpunch' | 'shrapid' | 'suck' | 'chew' | 'hamfly' | 'hamslam' = 'idle';
  private chargeDir = 1;
  private chargeStopAt = 0;
  private approachRange = 150;
  private approachThen = '';
  private swats: PowerSwat[] = [];
  private swatsLeft = 0;
  private candlesLeft = 0;
  private guarded = false;
  private blockedHits = 0;
  private busyChange = false;
  /** durian fly-crush state */
  private slamIdx = 0;
  private flyRise = true;
  /** eggplant rapid-punch / sushi rapid-cut timers */
  private rapidTimer2 = 0;
  private rapidFlip2 = 0;
  /** hamburger-form suck */
  private suckTimer = 0;
  private stopSuckLoop: (() => void) | null = null;

  private get form(): BurritoPhase {
    return BURRITO_PHASES[Math.max(0, this.phaseIndex)];
  }

  spawnAt(x: number, _y: number): void {
    Enemy.prototype.spawnAt.call(this, x, GROUND_Y);
    this.invincible = true;
    this.canDamage = false;
    this.faceOverride = -1;
    if (this.spriter.hasAnim('spawn')) this.spriter.playAnim('spawn', 'spawn_idle', null, true);
    audio.play('boss_is_coming', 0, 0.5);
    this.after(3.5, () => this.nextPhase());
  }

  private nextPhase(): void {
    if (!this.alive) return;
    this.phaseIndex = Math.min(this.phaseIndex + 1, BURRITO_PHASES.length - 1);
    const p = this.form;
    this.clearDelayed();
    this.mode = 'idle';
    this.actionIndex = 0;
    this.busyChange = true;
    this.invincible = true;
    this.canDamage = false;
    this.guarded = false;
    this.blockedHits = 0;
    this.flying = false;
    this.canGoOffScreen = false;
    this.xVel = 0;
    this.yVel = 0;
    this.stopSuckLoop?.();
    this.stopSuckLoop = null;
    this.clearMinions();
    // pumpkin form starts oversized at 0.75 and shrinks with damage (original specialScale)
    this.baseScale = p.key === 'pumpkin' ? 0.75 : ENEMY_SCALE;
    audio.play('boss_killed', 0, 0.5);
    this.spriter.playAnim(p.change, p.idle, null, true, true);
    this.after(1.6, () => {
      this.busyChange = false;
      this.invincible = false;
      this.canDamage = true;
      // phase entry hooks
      if (p.key === 'durian') this.spawnSwats();
      if (p.key === 'cake') this.spawnCandles();
      if (p.key === 'sundae') this.guarded = true;
      if (this.guarded || this.swatsLeft > 0 || this.candlesLeft > 0) this.invincible = true;
      this.actionTimer = 1.2;
    });
  }

  private clearMinions(): void {
    for (const s of this.swats) {
      if (s.alive) {
        s.suicided = true;
        s.alive = false;
        s.spriter.visible = false;
      }
    }
    this.swats = [];
    this.swatsLeft = 0;
    this.candlesLeft = 0;
  }

  private spawnSwats(): void {
    this.swats = [];
    this.swatsLeft = 0;
    for (const offX of [-110, 110]) {
      const swat = this.services?.spawnChild('swat', this.x + offX, this.y - 110, 0, 0);
      if (swat instanceof PowerSwat) {
        swat.attachTo(this, offX, -110);
        swat.onDestroyed = () => {
          this.swatsLeft--;
          if (this.swatsLeft <= 0) this.guardBroken('dur_powerlost', 'dur_powerlost_idle', 'dur_recover');
        };
        this.swats.push(swat);
        this.swatsLeft++;
      }
    }
  }

  private spawnCandles(): void {
    this.candlesLeft = 0;
    for (const offX of [-50, 0, 50]) {
      const c = this.services?.spawnChild('candle', this.x + offX, this.y - 170, 0, 0);
      if (c instanceof AttachedMinion) {
        c.attachTo(this, offX, -170);
        c.onDestroyed = () => {
          this.candlesLeft--;
          if (this.candlesLeft <= 0) this.guardBroken('cake_get_stunned', 'cake_stunned_idle', 'cake_recover', 6); // original cake stun is 6s
        };
        this.candlesLeft++;
      }
    }
  }

  /** open the vulnerability window (durian/cake/sundae forms) */
  private guardBroken(stunAnim: string, stunIdle: string, recoverAnim: string, stunTime = 4.5): void {
    if (!this.alive) return;
    this.clearDelayed();
    this.mode = 'idle';
    this.invincible = false;
    this.canDamage = false;
    this.guarded = false;
    this.xVel = 0;
    this.yVel = 0;
    this.flying = false;
    this.canGoOffScreen = false;
    this.x = Math.max(60, Math.min(740, this.x));
    audio.play('durian_powerLoss', 0, 0.7);
    this.spriter.playAnim(stunAnim, stunIdle, null, true, true);
    this.actionTimer = 9999;
    this.after(stunTime, () => {
      if (!this.alive || this.busyChange) return;
      this.invincible = true;
      this.canDamage = true;
      this.spriter.playAnim(recoverAnim, this.form.idle, null, true, true);
      const p = this.form;
      if (p.key === 'durian') this.after(1.5, () => this.spawnSwats());
      if (p.key === 'cake') this.after(1.5, () => this.spawnCandles());
      if (p.key === 'sundae') this.guarded = true;
      this.actionTimer = 2;
    });
  }

  protected onBlockedHit(): void {
    if (this.guarded && this.form.key === 'sundae') {
      this.blockedHits++;
      if (this.blockedHits >= 5) {
        this.blockedHits = 0;
        this.guardBroken('sundae_get_stunned', 'sundae_stunned_idle', 'sundae_recover');
      }
    }
  }

  protected onHurt(): void {
    if (this.hp > 0 && this.hp < this.form.minHp && !this.busyChange) {
      this.nextPhase();
      return;
    }
    if (this.form.key === 'pumpkin') {
      // original: specialScale = 0.75 - 0.6 * (damage taken within this form / form HP pool)
      const entryHp = BURRITO_PHASES[this.phaseIndex - 1]?.minHp ?? this.type.hp;
      const pool = Math.max(1, entryHp - this.form.minHp);
      const frac = Math.max(0, Math.min(1, (entryHp - this.hp) / pool));
      this.baseScale = Math.max(0.15, 0.75 - 0.6 * frac);
    }
    if (this.spriter.currentAnimationName === this.form.idle) {
      this.spriter.playAnim(this.form.hurt, this.form.idle, null, true);
    }
  }

  protected runAI(dt: number, player: PlayerView): void {
    this.tickDelayed(dt);
    const t = this.type;
    if (this.busyChange) {
      this.xVel *= 0.85;
      return;
    }
    if ((this.swatsLeft > 0 || this.candlesLeft > 0 || this.guarded) && this.spriter.currentAnimationName !== 'sundae_stunned_idle') {
      this.invincible = true;
    }

    switch (this.mode) {
      case 'approach': {
        this.faceOverride = player.x < this.x ? -1 : 1;
        if (Math.abs(player.x - this.x) > this.approachRange) {
          const moveAnim = this.form.key === 'noodles' ? 'noodles_run' : this.form.key === 'combo' ? 'combo_walk' : this.form.idle;
          this.play(moveAnim);
          this.xVel = Math.max(-8, Math.min(8, this.xVel + 0.6 * this.faceOverride));
        } else {
          this.mode = 'idle';
          this.xVel *= 0.2;
          this.execute(this.approachThen, player);
        }
        return;
      }
      case 'charge':
        this.xVel = this.chargeDir * Math.max(10, t.maxMovementSpeed);
        if ((this.chargeDir > 0 && this.x >= this.chargeStopAt) || (this.chargeDir < 0 && this.x <= this.chargeStopAt)) {
          this.mode = 'idle';
          this.canDamage = true;
          this.xVel = 0;
          this.canGoOffScreen = false;
          this.x = Math.max(-20, Math.min(820, this.x));
          this.play(this.form.idle);
          this.actionTimer = 1;
        }
        return;
      case 'stomp': {
        this.canDamage = true;
        this.xVel = Math.max(-t.maxMovementSpeed, Math.min(t.maxMovementSpeed, this.xVel + t.acceleration * this.chargeDir));
        if ((this.chargeDir > 0 && this.x > 680) || (this.chargeDir < 0 && this.x < 100)) {
          this.mode = 'idle';
          this.xVel = 0;
          this.play(this.form.idle);
          this.actionTimer = 0.6;
        }
        return;
      }
      case 'flyup':
        if (this.y < -180) {
          this.mode = 'idle';
          this.x = player.x < 400 ? 350 : 450;
          this.y = -20;
          this.flying = false;
          this.yVel = 10;
          this.canDamage = true;
          this.spriter.playAnim('cake_slamdown', this.form.idle, null, true);
          this.services?.shake(5);
          this.actionTimer = 1.2;
        }
        return;
      case 'spin':
        this.yVel += t.acceleration;
        if (this.y >= GROUND_Y) {
          this.y = GROUND_Y;
          this.yVel = 0;
          this.xVel = 0;
          this.mode = 'idle';
          audio.play('durian_hitGround', 0, 0.7);
          this.services?.shake(4);
          this.spriter.playAnim('dur_spinslam', this.form.idle, null, true);
          this.actionTimer = 1.2;
        }
        return;
      case 'flycrush': {
        // durian dur_flyCrush: float to the top, glide to 100/400/700, slam down — 3 times
        if (this.flyRise) {
          if (this.y > 40) {
            this.yVel = Math.max(-8, this.yVel - 0.5);
          } else {
            this.y = 40;
            this.yVel = 0;
            const tx = [100, 400, 700][this.slamIdx];
            if (Math.abs(this.x - tx) > 30) {
              this.xVel = Math.max(-8, Math.min(8, this.xVel + 0.5 * Math.sign(tx - this.x)));
            } else {
              if (this.spriter.hasAnim('dur_slam')) this.spriter.playAnim('dur_slam', '', null, true);
              this.flyRise = false;
              this.xVel = 0;
              this.canDamage = true;
            }
          }
        } else {
          this.yVel = Math.min(16, this.yVel + 0.5);
          if (this.y >= GROUND_Y) {
            this.y = GROUND_Y;
            this.yVel = 0;
            this.xVel = 0;
            audio.play('durian_slam', 0, 0.7);
            this.services?.shake(4);
            this.slamIdx++;
            if (this.slamIdx < 3) {
              this.flyRise = true;
            } else {
              this.mode = 'idle';
              this.flying = false;
              this.play(this.form.idle);
              this.actionTimer = 2; // original chooseNewActionSoon(2)
            }
          }
        }
        return;
      }
      case 'rapidpunch': {
        // eggplant egg_rapidpunch: crawl forward punching, turn every 3s, random stop
        this.xVel = 0.5 * (this.faceOverride ?? 1);
        this.rapidTimer2 -= dt;
        if (this.rapidTimer2 <= 0) {
          this.rapidTimer2 = 3;
          this.faceOverride = (this.faceOverride ?? 1) * -1;
          const dist = Math.hypot(player.x - this.x, player.y - this.y);
          if (Math.random() < 1 / 3 || dist > 235) {
            this.mode = 'idle';
            this.xVel = 0;
            this.play(this.form.idle);
            this.actionTimer = 1;
          }
        }
        return;
      }
      case 'shrapid':
        // sushi rapid-cut: invincible zigzag for 3s, flipping every 0.25s
        this.rapidFlip2 -= dt;
        this.rapidTimer2 -= dt;
        if (this.rapidFlip2 <= 0) {
          this.rapidFlip2 = 0.25;
          this.faceOverride = (this.faceOverride ?? 1) * -1;
          this.xVel = 4 * (this.faceOverride ?? 1);
        }
        if (this.rapidTimer2 <= 0) {
          this.mode = 'idle';
          this.invincible = this.guarded || this.swatsLeft > 0 || this.candlesLeft > 0;
          this.canDamage = false;
          this.xVel = 0;
          this.play(this.form.idle);
          this.actionTimer = 0.5;
        }
        return;
      case 'suck':
        // hamburger ham_suck: vacuum pull for 4.5s; catching the player triggers chew + spit
        // (no heart child in the burrito remake — the boss body is the target during this form)
        this.suckTimer -= dt;
        this.services?.pullPlayer(this.x, this.y - 40, 0.55);
        if (Math.abs(player.x - this.x) < 55 && Math.abs(player.y - this.y) < 80) {
          this.endSuck();
          this.mode = 'chew';
          this.spriter.playAnim('ham_chew', '', () => {
            if (!this.alive) return;
            this.spriter.playAnim('ham_spit', this.form.idle, null, true);
            audio.play('hamburger_spit', 0, 0.7);
            this.after(0.8, () => {
              // original launches the bunny (ko_fly) — minimal knockback hit stands in
              this.services?.hurtPlayer(1, this.faceOverride ?? 1);
              this.services?.shake(3);
              this.mode = 'idle';
              this.actionTimer = 2;
            });
          }, true);
          audio.play('hamburger_chew', 0, 0.7);
          this.after(0.2, () => this.services?.hurtPlayer(30, 0)); // original injureBunny(30)
          return;
        }
        if (this.suckTimer <= 0) {
          this.endSuck();
          if (this.spriter.hasAnim('ham_suck_finished')) {
            this.spriter.playAnim('ham_suck_finished', this.form.idle, null, true);
          } else {
            this.play(this.form.idle);
          }
          this.mode = 'idle';
          this.actionTimer = 1.5;
        }
        return;
      case 'chew':
        this.xVel *= 0.85;
        return;
      case 'hamfly':
        // ham_fly: rocket up, teleport to a random x, slam back down
        if (this.y < -180) {
          this.x = 100 + Math.random() * 600;
          this.y = -40;
          this.flying = false;
          this.yVel = 4;
          this.canDamage = true;
          this.spriter.playAnim('ham_slamDown', this.form.idle, null, true);
          this.mode = 'hamslam';
        }
        return;
      case 'hamslam':
        if (this.y >= GROUND_Y) {
          this.mode = 'idle';
          this.canGoOffScreen = false;
          this.services?.shake(5);
          audio.play('watermelon_hitGroundAfterJump', 0, 0.6);
          this.after(0.6, () => (this.canDamage = false));
          this.actionTimer = 1.5;
        }
        return;
    }

    this.xVel *= 0.85;
    this.faceOverride = player.x < this.x ? -1 : 1;
    this.actionTimer -= dt;
    if (this.actionTimer <= 0) {
      const action = this.form.actions[this.actionIndex];
      this.actionIndex = (this.actionIndex + 1) % this.form.actions.length;
      this.actionTimer = 9999;
      this.execute(action, player);
    }
  }

  private def(id: number): ProjectileType | null {
    return this.projectileMap?.get(id) ?? null;
  }

  private aimedShot(defId: number, speed: number, player: PlayerView, sy = -80, opts: { scale?: number; rotSpeed?: number } = {}): void {
    const d = this.def(defId);
    if (!d || !this.services) return;
    audio.play('projectileShot', 0, 0.5);
    const sx = this.x + 40 * (this.faceOverride ?? 1);
    const dx = player.x - sx;
    const dy = player.y - 30 - (this.y + sy);
    const len = Math.max(1, Math.hypot(dx, dy));
    this.services.shoot(d, sx, this.y + sy, (dx / len) * speed, (dy / len) * speed, opts);
  }

  private execute(action: string, player: PlayerView): void {
    const dir = this.faceOverride ?? 1;
    switch (action) {
      case 'rest':
        this.play(this.form.idle);
        this.actionTimer = 1.5;
        break;
      // ---- watermelon ----
      case 'w_attack':
        this.spriter.playAnim('water_attack', this.form.idle, null, true);
        audio.play('watermelon_gunSmack', 0.35, 0.6);
        this.actionTimer = 1.1;
        break;
      case 'w_jump':
        this.spriter.playAnim('water_jump', this.form.idle, null, true);
        audio.play('watermelon_jump', 0, 0.6);
        this.after(0.5, () => {
          this.xVel = 15 * dir;
          this.yVel = -15;
        });
        this.actionTimer = 2.1;
        break;
      case 'w_shoot': {
        this.spriter.playAnim(Math.random() < 0.5 ? 'water_shoot1' : 'water_shoot2', this.form.idle, null, true);
        // first shot at 0.07 + 0.22 = 0.29s, then +0.22s each (original water_shoot1/2)
        for (let i = 0; i < 5; i++) this.after(0.29 + i * 0.22, () => this.aimedShot(0, 10, player));
        this.actionTimer = 1.8;
        break;
      }
      // ---- durian ----
      case 'dur_spin':
        this.spriter.playAnim('dur_startspin', 'dur_spin', null, true);
        audio.play('durian_start_spin', 0, 0.5);
        this.after(1.2, () => {
          this.canGoOffScreen = true;
          this.canDamage = true;
          this.chargeDir = this.x < 400 ? 1 : -1;
          this.chargeStopAt = this.chargeDir > 0 ? 900 : -100;
          this.mode = 'charge';
        });
        break;
      case 'dur_slam':
        // dur_cornerSpinSlam: teleport to a corner and arc diagonally to the ground
        this.spriter.playAnim('dur_spin', '', null, true);
        this.canGoOffScreen = true;
        this.x = this.x < 400 ? 0 : 800;
        this.y = 0;
        this.xVel = this.x < 400 ? 30 : -30; // original ±30
        this.yVel = -5;
        this.canDamage = true;
        this.mode = 'spin';
        break;
      case 'dur_flycrush':
        // dur_flyCrush: 3 hover-slams at x = 100/400/700
        this.spriter.playAnim('dur_spin', '', null, true);
        this.flying = true;
        this.canDamage = true;
        this.slamIdx = 0;
        this.flyRise = true;
        this.mode = 'flycrush';
        break;
      // ---- eggplant ----
      case 'egg_onetwo':
        this.spriter.playAnim('egg_pre_onetwo', 'egg_onetwo', null, true);
        this.canDamage = true;
        this.after(0.4, () => (this.xVel = 4 * dir));
        this.after(2.5, () => (this.xVel = 0));
        this.actionTimer = 3;
        break;
      case 'egg_rapidpunch':
        // egg_rapidpunch: crawl-forward punch loop with the 3s turn check
        this.spriter.playAnim('egg_pre_onetwo', 'egg_rapidpunch', null, true);
        this.canDamage = true;
        this.rapidTimer2 = 3;
        this.mode = 'rapidpunch';
        break;
      case 'egg_turnpunch':
        this.spriter.playAnim('egg_pre_turnpunch', 'egg_turnpunch_idle', null, true);
        audio.play('shoryuken', 0, 0.1);
        this.canDamage = true;
        this.after(0.5, () => {
          this.canGoOffScreen = true;
          this.chargeDir = dir;
          this.chargeStopAt = dir > 0 ? 900 : -100;
          this.mode = 'charge';
        });
        this.after(2.4, () => {
          if (this.mode === 'charge') return;
          this.x = player.x < 400 ? player.x + 60 : player.x - 60;
          this.y = -20;
        });
        break;
      // ---- pumpkin ----
      case 'pk_flyslash':
        this.spriter.playAnim('pumpkin_pre_flyingslash', 'pumpkin_flyingslash_idle', null, true);
        this.canDamage = true;
        this.after(0.5, () => {
          this.canGoOffScreen = true;
          this.chargeDir = dir;
          this.chargeStopAt = dir > 0 ? 900 : -100;
          this.mode = 'charge';
        });
        break;
      case 'pk_slash':
        this.spriter.playAnim('pumpkin_slash', this.form.idle, null, true);
        audio.playRandom(['pumpkin_stab1', 'pumpkin_stab2'], 0, 0.6);
        this.canDamage = true;
        this.actionTimer = 2.6;
        break;
      case 'pk_sideblast': {
        // pumpkin_sideblast: vanish off-screen, re-appear at an edge, 3 SUPER_BLAST beams, return
        this.actionTimer = 9999;
        this.invincible = true;
        this.canDamage = false;
        this.canGoOffScreen = true;
        this.flying = true;
        const side = this.x < 400 ? -1 : 1;
        this.x = side < 0 ? -120 : 920;
        this.y = 100 + Math.random() * 220;
        this.faceOverride = side < 0 ? 1 : -1;
        this.play('pumpkin_sideblast_idle');
        const base = this.def(3);
        let count = 0;
        const blast = () => {
          if (!this.alive) return;
          this.x = side < 0 ? 50 : 750; // edge firing position (original tween to 50/750)
          audio.play('pumpkin_shoot3', 0, 0.7);
          this.services?.shake(3);
          if (base) {
            this.services?.shoot(
              { ...base, damageDone: 20, effectedByGravity: false, specialAIType: '', boomerang: false },
              this.x + 40 * (this.faceOverride ?? 1), this.y - 30, this.faceOverride ?? 1, 0,
              { beam: true, scale: 0.7 },
            );
          }
          this.spriter.playAnim('pumpkin_sideblast', '', () => {
            if (!this.alive) return;
            count++;
            if (count < 3) {
              this.spriter.playAnim('pumpkin_sideblast_idle');
              this.y = 100 + Math.random() * 220;
              this.after(0.4, blast);
            } else {
              // exit off-screen, then drop back into the fight
              this.x = side < 0 ? -120 : 920;
              this.after(0.6, () => {
                if (!this.alive) return;
                this.flying = false;
                this.canGoOffScreen = false;
                this.invincible = false;
                this.canDamage = true;
                this.x = side < 0 ? 100 : 700;
                this.play(this.form.idle);
                this.actionTimer = 1; // original chooseNewActionSoon(1)
              });
            }
          }, true);
        };
        this.after(0.75, blast);
        break;
      }
      // ---- sundae ----
      case 'su_throw':
        this.spriter.playAnim('sundae_getProjectile', '', () => {
          if (!this.alive) return;
          this.spriter.playAnim('sundae_throwProjectile', this.form.idle, null, true);
          this.after(0.43, () => this.aimedShot(4, 9, player, -100, { scale: 0.7, rotSpeed: 0.3 }));
        }, true);
        this.actionTimer = 2.5;
        break;
      case 'su_charge':
        this.spriter.playAnim('sundae_flyingattack', 'sundae_flyingattack_idle', null, true);
        this.canDamage = true;
        this.after(0.4, () => {
          this.chargeDir = this.x > 400 ? -1 : 1;
          this.chargeStopAt = this.chargeDir > 0 ? 640 : 180;
          this.mode = 'charge';
        });
        break;
      // ---- cake ----
      case 'ck_shoot2x2':
      case 'ck_shoot4': {
        this.spriter.playAnim(action === 'ck_shoot2x2' ? 'cake_shoot2x2' : 'cake_shoot4', this.form.idle, null, true);
        const times = action === 'ck_shoot2x2' ? [0.49, 1.2] : [0.24, 0.73, 1.22, 1.7];
        for (const time of times) {
          this.after(time, () => {
            if (!this.alive) return;
            audio.playRandom(['cake_shot', 'cake_shot2', 'cake_shot3'], 0, 0.25);
            const sx = this.x + 60 * (this.faceOverride ?? 1);
            const sy = this.y - 90;
            this.services?.burst(sx + 85 * (this.faceOverride ?? 1), sy, 'explosion_yellow', 7);
            const px = player.x;
            const py = player.y - 40;
            const ex = sx + 170 * (this.faceOverride ?? 1);
            if (Math.min(sx, ex) - 20 <= px && px <= Math.max(sx, ex) + 20 && Math.abs(py - sy) < 55) {
              this.services?.hurtPlayer(20, this.faceOverride ?? 1);
            }
          });
        }
        this.actionTimer = 3;
        break;
      }
      case 'ck_flyup':
        this.spriter.playAnim('cake_flyup', '', null, true);
        audio.play('watermelon_jump', 0.3, 0.5);
        this.after(0.39, () => {
          this.flying = true;
          this.canGoOffScreen = true;
          this.yVel = -15;
          this.mode = 'flyup';
        });
        break;
      case 'ck_sing': {
        this.spriter.playAnim('cake_sing', 'cake_dance', null, true);
        for (let i = 0; i < 12; i++) {
          this.after(0.5 + i * 0.45, () => {
            if (this.alive) this.services?.spawnChild('note', -60, 100 + Math.random() * 205, 0, 0);
          });
        }
        this.actionTimer = 7;
        break;
      }
      // ---- noodles ----
      case 'nd_slash':
        this.mode = 'approach';
        this.approachRange = 200;
        this.approachThen = 'nd_slash_now';
        break;
      case 'nd_slash_now':
        this.spriter.playAnim('noodles_slash', this.form.idle, null, true);
        this.canDamage = true;
        this.after(0.29, () => (this.xVel = 55 * (this.faceOverride ?? 1)));
        this.actionTimer = rand(1.4, 2.4);
        break;
      case 'nd_combo':
        this.mode = 'approach';
        this.approachRange = 100;
        this.approachThen = 'nd_combo_now';
        break;
      case 'nd_combo_now':
        this.spriter.playAnim('noodles_slashCombo', this.form.idle, null, true);
        this.canDamage = true;
        this.xVel = 2 * (this.faceOverride ?? 1);
        this.actionTimer = rand(1.8, 2.5);
        break;
      case 'nd_backflip':
        // noodles_backflipSlash: hop backward then chain straight into a slash
        this.actionTimer = 9999;
        this.spriter.playAnim('noodles_backflipSlash', '', () => {
          if (this.alive) this.execute('nd_slash_now', player);
        }, true);
        this.after(0.375, () => {
          this.xVel = -4 * (this.faceOverride ?? 1);
          this.yVel = -8;
        });
        break;
      case 'nd_super':
        this.spriter.playAnim('noodles_pre_superslash', '', () => {
          if (!this.alive) return;
          audio.play('noodles_superslash', 0, 0.7);
          this.spriter.playAnim('noodles_superslash', '', () => {
            if (!this.alive) return;
            this.spriter.playAnim('noodles_post_superslash', this.form.idle, null, true);
          }, true);
          this.canDamage = true;
          this.canGoOffScreen = true;
          this.chargeDir = this.faceOverride ?? 1;
          this.chargeStopAt = this.chargeDir > 0 ? 880 : -80;
          this.mode = 'charge';
          if (Math.abs(player.y - 40 - (this.y - 30)) < 55) this.services?.hurtPlayer(20, this.chargeDir);
        }, true);
        break;
      // ---- sushi ----
      case 'sh_smash':
        this.spriter.playAnim('sushi_doubleSmash', this.form.idle, null, true);
        this.canDamage = true;
        this.actionTimer = 2;
        break;
      case 'sh_fish':
        this.spriter.playAnim('sushi_throwFish', 'sushi_idle_noFish', null, true);
        this.after(0.435, () => this.aimedShot(2, 8, player, -80, { rotSpeed: 0.5 }));
        this.after(2.2, () => {
          if (this.alive) this.spriter.playAnim('sushi_catchFish', this.form.idle, null, true);
        });
        this.actionTimer = 2.6;
        break;
      case 'sh_fwdblast':
        this.spriter.playAnim('sushi_pre_forward_blast', '', () => {
          if (!this.alive) return;
          this.spriter.playAnim('sushi_forward_blast', this.form.idle, null, true);
          this.after(0.18, () => {
            const d = this.def(3);
            if (d && this.services) {
              audio.play('projectileShot', 0, 0.5);
              this.services.shake(2);
              this.services.shoot(d, this.x + 40 * (this.faceOverride ?? 1), this.y - 70, 12 * (this.faceOverride ?? 1), 0, { rotSpeed: 1 });
            }
          });
        }, true);
        this.actionTimer = 1.6;
        break;
      case 'sh_blast': {
        // 3 upward wasabi shots, one full sushi_blast anim each (original sushi_blastOne chain),
        // then 3 falling wasabi at 0.425s spacing
        const d = this.def(4);
        this.actionTimer = 9999;
        let count = 0;
        const blastOne = () => {
          if (!this.alive) return;
          this.spriter.playAnim('sushi_blast', '', () => {
            if (!this.alive) return;
            if (++count < 3) {
              blastOne();
            } else {
              this.play(this.form.idle);
              for (let i = 0; i < 3; i++) {
                this.after(i * 0.425, () => {
                  if (this.alive && d && this.services) this.services.shoot(d, [200, 400, 600][i], -50, [-1, 0, 1][i], 10, {});
                });
              }
              this.actionTimer = 3 * 0.425 + 0.5;
            }
          }, true);
          this.after(0.185, () => {
            if (!this.alive || !d || !this.services) return;
            if (this.spriter.currentAnimationName !== 'sushi_blast') return;
            audio.play('projectileShot', 0, 0.5);
            this.services.shoot(d, this.x, this.y - 90, [-2, 0, 2][count], -20, { scale: 0.6 });
          });
        };
        blastOne();
        break;
      }
      case 'sh_rapidcut':
        // sushi_rapidCut: 3s invincible zigzag cut (original burrito sushi_rapidCut)
        this.actionTimer = 9999;
        this.spriter.playAnim('sushi_pre_rapidCut', '', () => {
          if (!this.alive) return;
          this.spriter.playAnim('sushi_rapidCut');
          this.invincible = true;
          this.canDamage = true;
          this.rapidTimer2 = 3;
          this.rapidFlip2 = 0.25;
          this.xVel = 4 * (Math.sign(player.x - this.x) || 1);
          this.faceOverride = Math.sign(this.xVel) || 1;
          this.mode = 'shrapid';
        }, true);
        break;
      // ---- hamburger ----
      case 'hm_shoot360': {
        this.spriter.playAnim('ham_shoot360', this.form.idle, null, true);
        let angle = 0;
        for (let i = 0; i < 15; i++) {
          this.after(0.2 + i * 0.1, () => {
            const d = this.def(1);
            if (!this.alive || !d || !this.services) return;
            angle += 0.42;
            audio.play('projectileShot', 0, 0.25);
            this.services.shoot(d, this.x, this.y - 80, 10 * Math.cos(angle), 10 * Math.sin(angle), { rotation: angle });
          });
        }
        this.actionTimer = 5.0; // original chooseNewActionSoon(5)
        break;
      }
      case 'hm_shoot':
        this.spriter.playAnim('ham_shootAtBunny', this.form.idle, null, true);
        for (let i = 0; i < 4; i++) this.after(0.2 + i * 0.1, () => this.aimedShot(1, 10, player));
        this.actionTimer = 2.5;
        break;
      case 'hm_suck':
        // ham_suck: start_suck -> suck_idle -> 4.5s vacuum pull (mode 'suck')
        this.actionTimer = 9999;
        audio.play('hamburger_suck_start', 0, 0.7);
        this.spriter.playAnim('ham_start_suck', '', () => {
          if (!this.alive) return;
          this.play('ham_suck_idle');
          this.stopSuckLoop = audio.playLoop('hamburger_suck_loop', 0.5);
          this.suckTimer = 4.5;
          this.mode = 'suck';
        }, true);
        break;
      case 'hm_fly':
        // ham_fly: fly up at -15, teleport to a random x, slam down
        this.actionTimer = 9999;
        this.spriter.playAnim('ham_flyUp', '', null, true);
        this.after(0.295, () => {
          this.flying = true;
          this.canGoOffScreen = true;
          this.yVel = -15;
          this.mode = 'hamfly';
        });
        break;
      // ---- combo ----
      case 'cb_smash':
        this.mode = 'approach';
        this.approachRange = 150;
        this.approachThen = 'cb_smash_now';
        break;
      case 'cb_smash_now':
        this.spriter.playAnim('combo_smashArm', this.form.idle, null, true);
        audio.play('combo_down', 0, 0.6);
        this.after(0.7, () => (this.canDamage = true));
        this.actionTimer = 1.5;
        break;
      case 'cb_kick':
        this.mode = 'approach';
        this.approachRange = 200;
        this.approachThen = 'cb_kick_now';
        break;
      case 'cb_kick_now':
        this.spriter.playAnim('combo_footballKick', this.form.idle, null, true);
        audio.play('combo_up', 0, 0.6);
        this.after(0.7, () => (this.canDamage = true));
        this.actionTimer = 1.4;
        break;
      case 'cb_stomp':
        this.spriter.playAnim('combo_stompAcrossLevel', '', null, true);
        this.chargeDir = player.x < this.x ? -1 : 1;
        this.mode = 'stomp';
        audio.playRandom(['combo_stomp1', 'combo_stomp2', 'combo_stomp3'], 0, 0.3);
        break;
      case 'cb_nugget':
        this.spriter.playAnim('combo_handNuggetBlast', this.form.idle, null, true);
        this.after(0.515, () => {
          audio.play('combo_blast', 0, 0.6);
          this.services?.shake(2);
          this.aimedShot(5, 10, player, -120, { scale: 0.5 });
        });
        this.actionTimer = 1.2;
        break;
    }
  }

  private endSuck(): void {
    this.stopSuckLoop?.();
    this.stopSuckLoop = null;
  }

  dispose(): void {
    this.endSuck();
  }

  protected onDeath(): void {
    super.onDeath();
    this.endSuck();
    this.clearMinions();
    audio.play('combo_die', 0, 0.8);
  }
}

// ---------------------------------------------------------------------------
/**
 * Boss_MagicMan — the true final fight (condensed solo version of the
 * original duo). Energy shots, teleport staff smashes, eagle swoops across
 * the arena, side-blast volleys, and a rapid-fire barrage below half HP that
 * only stops when you land a hit.
 */
class MagicManBoss extends Boss {
  // SOLO-CONDENSED: original duo loop is [shoot2, sideFlyToMiddle, flyThenStaffSmash,
  // smashDown, fartAndLaugh, sideBlasts, highfiveshots, eagleSwoop]. sideFlyToMiddle
  // (the two MMs laser-rushing each other) needs the partner and is omitted; the rest
  // follow the original order with staffSmash standing in for flyThenStaffSmash and
  // rapidshot for highfiveshots.
  private actions = ['shoot2', 'staffSmash', 'smashDown', 'fartAndLaugh', 'sideBlasts', 'rapidshot', 'eagleSwoop'];
  private actionIndex = 0;
  private actionTimer = 0;
  private glide: { x: number; y: number; time: number; total: number; sx: number; sy: number; then?: () => void } | null = null;
  private swooping = false;
  private swoopCount = 0;
  private rapidFiring = false;
  private rapidT = 0;
  private rapidX1 = 140;
  private rapidX2 = 340;
  private farting = false;
  private fartTimer = 0;
  private fartPuff = 0;
  private stopFartLoop: (() => void) | null = null;
  /** teleport fade-in (original alpha 0 -> 1 over 0.25s) */
  private fadeIn = 0;

  spawnAt(x: number, _y: number): void {
    Enemy.prototype.spawnAt.call(this, x, 250);
    this.flying = true;
    this.canGoOffScreen = true;
    this.canDamage = false;
    this.faceOverride = -1;
    if (this.spriter.hasAnim('spawn')) this.spriter.playAnim('spawn', 'idle', null, true);
    this.actionTimer = 4.5;
  }

  private startGlide(x: number, y: number, seconds: number, then?: () => void): void {
    this.xVel = 0;
    this.yVel = 0;
    this.glide = { x, y, time: 0, total: seconds, sx: this.x, sy: this.y, then };
  }

  private energyBall(player: PlayerView, speed = 8): void {
    const d = this.projectileMap?.get(0);
    if (!d || !this.services || !this.alive) return;
    audio.play('projectileShot', 0, 0.5);
    const sx = this.x + 30 * (this.faceOverride ?? 1);
    const sy = this.y - 60;
    const dx = player.x - sx;
    const dy = player.y - 30 - sy;
    const len = Math.max(1, Math.hypot(dx, dy));
    this.services.shoot(d, sx, sy, (dx / len) * speed, (dy / len) * speed, { scale: 0.8 });
  }

  protected runAI(dt: number, player: PlayerView): void {
    this.tickDelayed(dt);
    const t = this.type;

    // teleport fade-in (original Tween alpha -> 1 over 0.25s)
    if (this.fadeIn > 0) {
      this.fadeIn -= dt;
      this.spriter.alpha = Math.min(1, 1 - this.fadeIn / 0.25);
    }

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

    if (this.swooping) {
      const dir = this.faceOverride ?? 1;
      this.xVel = t.maxMovementSpeed * 1.2 * dir * 1.2;
      if ((dir > 0 && this.x > 900) || (dir < 0 && this.x < -100)) {
        this.swoopCount++;
        if (this.swoopCount >= 2) {
          // two passes only (original shoot3Index)
          this.swooping = false;
          this.canDamage = false;
          this.xVel = 0;
          this.actionTimer = 0.5;
        } else {
          // turn around for the second pass at the fixed alternate height (original y=350)
          this.faceOverride = dir * -1;
          this.y = 350;
          this.services?.burst(this.x, this.y, 'explosion_yellow', 6);
        }
      }
      return;
    }

    if (this.rapidFiring) {
      // oscillate between the two side positions, 2s per leg (original rapidTweens)
      this.rapidT += dt;
      const u = (1 - Math.cos((Math.PI * this.rapidT) / 2)) / 2;
      this.x = this.rapidX1 + (this.rapidX2 - this.rapidX1) * u;
      this.xVel = 0;
      return; // ended by onHurt (or the 10s safety timeout)
    }

    if (this.farting) {
      this.fartTimer -= dt;
      // face AWAY from the player while drifting toward them at 0.3x speed (original FARTING update)
      const toward = Math.sign(player.x - this.x) || 1;
      this.faceOverride = -toward;
      const cap = t.maxMovementSpeed * 0.3;
      this.xVel = Math.max(-cap, Math.min(cap, this.xVel + t.acceleration * toward));
      const towardY = Math.sign(player.y - 40 - this.y) || 0;
      this.yVel = Math.max(-cap, Math.min(cap, this.yVel + t.acceleration * 0.5 * towardY));
      // fart cloud puffs trailing on the player side (original fartPS)
      this.fartPuff -= dt;
      if (this.fartPuff <= 0) {
        this.fartPuff = 0.12;
        this.services?.burst(this.x + rand(20, 90) * toward, this.y - 60 + rand(-40, 30), 'explosion_yellow', 2);
      }
      // cloud wedge collision (original checkFartCollision rays out to ±150)
      const dx = (player.x - this.x) * toward;
      const py = player.y - 40;
      if (dx > -10 && dx < 165 && py > this.y - 140 && py < this.y + 20) {
        this.endFart();
        this.spriter.playAnim('finishFart', '', null, true);
        // original: BUNNY_PASS_OUT then teleportSmashForward at +1s
        this.after(1, () => {
          if (this.alive) this.doTeleportSmash(player);
        });
        this.actionTimer = 9999;
        return;
      }
      if (this.fartTimer <= 0) {
        this.endFart();
        this.play('idle');
        this.actionTimer = 0.5;
      }
      return;
    }

    this.xVel *= 0.9;
    this.yVel *= 0.9;
    this.faceOverride = player.x < this.x ? -1 : 1;
    this.actionTimer -= dt;
    if (this.actionTimer <= 0) this.getAction(player);
  }

  private getAction(player: PlayerView): void {
    let action = this.actions[this.actionIndex];
    this.actionIndex = (this.actionIndex + 1) % this.actions.length;
    // rapid-fire barrage only below half HP (original highfiveshots gate)
    if (action === 'rapidshot' && this.hp > this.type.hp / 2) action = 'shoot2';
    this.actionTimer = 9999;
    this.canDamage = false;

    switch (action) {
      case 'shoot2':
        this.startGlide(player.x < 400 ? 700 : 100, 220, 1.0, () => {
          this.faceOverride = player.x < this.x ? -1 : 1;
          this.spriter.playAnim('shootEnergy01', 'idle', null, true);
          this.after(0.5, () => this.energyBall(player));
          this.after(1.5, () => {
            if (!this.alive) return;
            this.spriter.playAnim('shootEnergy01', 'idle', null, true);
            this.after(0.5, () => this.energyBall(player));
          });
          this.actionTimer = 3.5;
        });
        break;

      case 'smashDown':
        // original: fly beside the player at y-30 and smash IN PLACE (no drop), canDamage at +0.3s
        this.startGlide(player.x + (player.x < 400 ? 150 : -150), player.y - 30, 0.5, () => {
          this.faceOverride = player.x < this.x ? -1 : 1;
          this.spriter.playAnim('staffSmashDown', 'idle', null, true);
          audio.play('mm_smashdown', 0, 0.6);
          this.after(0.3, () => {
            this.canDamage = true;
            this.services?.shake(4);
          });
          this.actionTimer = 1.5; // original chooseNewActionSoon(1.5)
        });
        break;

      case 'eagleSwoop':
        // original startEagleSwoop: instant teleport to the boss's CURRENT side,
        // fixed heights (pass 0: y=300, pass 1: y=350), two passes
        this.x = this.x < 400 ? -100 : 900;
        this.y = 300;
        this.faceOverride = this.x < 0 ? 1 : -1;
        this.spriter.playAnim('flySideAttack', '', null, true);
        this.swooping = true;
        this.swoopCount = 0;
        this.canDamage = true;
        break;

      case 'fartAndLaugh':
        // original fartTime: face away, drift toward the player, fart cloud for 5s
        this.farting = true;
        this.fartTimer = 5.1;
        this.fartPuff = 0;
        this.spriter.playAnim('startFart', 'fartIdle', null, true);
        this.stopFartLoop = audio.playLoop('mm_fartloop', 0.5);
        this.actionTimer = 9999;
        break;

      case 'sideBlasts': {
        // original: SUPER_BLAST screen-wide beams (no projectiles), 3 rounds at fixed heights
        const fromLeft = player.x > 400;
        const heights = [100, 250, 350]; // first of each original height pair
        this.startGlide(fromLeft ? -80 : 880, heights[0], 0.5, () => {
          this.faceOverride = fromLeft ? 1 : -1;
          let round = 0;
          const blast = () => {
            if (!this.alive) return;
            this.spriter.playAnim('pre_sideblast', '', () => {
              if (!this.alive) return;
              this.spriter.playAnim('sideblast', 'sideblast_idle', null, true);
              this.services?.shake(3);
              const d = this.projectileMap?.get(0);
              if (d && this.services) {
                this.services.shoot(
                  { ...d, damageDone: 20, effectedByGravity: false, specialAIType: '', boomerang: false },
                  this.x + 40 * (this.faceOverride ?? 1), this.y - 60, this.faceOverride ?? 1, 0,
                  { beam: true, scale: 0.8 },
                );
              }
              round++;
              if (round < 3) {
                this.after(0.5, () => this.startGlide(this.x, heights[round], 0.6, blast));
              } else {
                this.after(0.8, () => {
                  this.startGlide(fromLeft ? 200 : 600, 250, 0.8, () => (this.actionTimer = 1));
                });
              }
            }, true);
          };
          blast();
        });
        break;
      }

      case 'staffSmash':
        this.doTeleportSmash(player);
        break;

      default: {
        // rapidshot (highfiveshots): barrage at 0.3s intervals until the player lands
        // a hit — no shot cap (10s safety timeout only)
        const side: [number, number] = this.x < 400 ? [140, 340] : [460, 660];
        this.startGlide(side[0], 150, 0.7, () => {
          this.spriter.playAnim('aimDownAfterHigh', 'shootDownIdle', null, true);
          this.rapidFiring = true;
          this.rapidT = 0;
          this.rapidX1 = side[0];
          this.rapidX2 = side[1];
          const fire = () => {
            if (!this.alive || !this.rapidFiring) return;
            this.energyBall(player);
            this.after(0.3, fire);
          };
          fire();
          this.after(10, () => this.stopRapid());
        });
      }
    }
  }

  /** teleportSmashForward (original :1209-1248): alpha/scale tween-in beside the player, ray smash */
  private doTeleportSmash(player: PlayerView): void {
    if (!this.alive) return;
    this.canDamage = false;
    this.xVel = 0;
    this.yVel = 0;
    audio.play('teleportQuick', 0, 0.6);
    this.x = player.x + (player.x < 400 ? 100 : -100);
    this.y = player.y; // original: this.y = bunny.y (ground level)
    this.faceOverride = player.x < this.x ? -1 : 1;
    this.fadeIn = 0.25; // original alpha 0 -> 1 / scaleX 0.1 -> SCALE tween
    this.spriter.alpha = 0;
    this.spriter.playAnim('staffSmashForward', 'idle', null, true);
    audio.play('mm_smashforward', 0, 0.6);
    this.after(0.45, () => {
      if (!this.alive) return;
      // checkStaffCollision: two forward ray segments approximated as a wedge box
      const fwd = this.faceOverride ?? 1;
      const dx = (player.x - this.x) * fwd;
      const py = player.y - 40;
      if (dx > -40 && dx < 170 && py > this.y - 160 && py < this.y + 20) {
        // hit: KO smash finisher, condensed solo (original bunnyKOSmash -> staffSmashDown -> doubleLaugh)
        audio.playRandom(['punchImpact1', 'punchImpact2', 'punchImpact3'], 0, 0.7);
        this.services?.hurtPlayer(this.type.attackDmg, fwd);
        this.services?.shake(4);
        this.after(0.4, () => {
          if (!this.alive) return;
          this.spriter.playAnim('staffSmashDown', '', () => {
            if (this.alive) this.spriter.playAnim('laugh01', 'idle', null, true);
          }, true);
        });
        this.actionTimer = 2.75; // doubleLaugh -> chooseNewActionSoon(2)
      } else {
        this.actionTimer = 1; // miss path (original chooseNewActionSoon(1))
      }
    });
  }

  private endFart(): void {
    this.farting = false;
    this.xVel = 0;
    this.yVel = 0;
    this.stopFartLoop?.();
    this.stopFartLoop = null;
  }

  private stopRapid(): void {
    if (!this.rapidFiring) return;
    this.rapidFiring = false;
    this.spriter.playAnim('flyUpOff', '', null, true);
    this.startGlide(this.x < 400 ? 600 : 200, 250, 0.8, () => {
      // original recoverFromGround: standUp stumble before the next action
      this.spriter.playAnim('standUp', 'idle', null, true);
      audio.play('mm_standup', 0, 0.6);
      this.actionTimer = 2.5;
    });
  }

  protected onHurt(): void {
    if (this.rapidFiring) {
      this.stopRapid();
      return;
    }
    if (this.spriter.currentAnimationName === 'idle') {
      this.spriter.playAnim('hurt', 'idle', null, true);
    }
  }

  dispose(): void {
    this.stopFartLoop?.();
  }

  protected onDeath(): void {
    super.onDeath();
    this.endFart();
  }
}
