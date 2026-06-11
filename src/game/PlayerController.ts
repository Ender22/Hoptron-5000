/**
 * Hoptron player controller.
 *
 * Physics + animation transitions ported from LevelBase.updateBunny /
 * doBunnyJump / onAttackTouch / attackAgainTime, with the agreed v1 retune:
 * faster acceleration, double jump (airJump), dash on a button, and
 * buffered button combos instead of touch taps. All per-frame constants
 * assume the original's 60fps step — the game loop runs a fixed 60Hz tick.
 */
import type { SpriterPlayer } from '../spriter/SpriterPlayer';
import { audio } from './Audio';
import type { Input } from './Input';
import type { FightUpgrades } from './SaveData';

// per-combo-stage swing sounds (matches original onAttackTouch/attackAgainTime)
const SWING_SOUNDS: string[][] = [
  ['swipe1_01', 'swipe1_02', 'swipe1_03'],
  ['swipe2_01', 'swipe2_02'],
  ['swipe3_01'],
  ['swipe4_01'],
];

// ---- original feel constants (LevelBase) ----
export const GROUND_Y = 325;
export const WALL_LEFT = 40;
export const WALL_RIGHT = 760;
const FRICTION = 0.8;
const BUNNY_SCALE = 0.375;

// ---- v1 retune (original values in comments) ----
const GRAVITY = 0.68; // 0.8 — felt too heavy in playtest
const JUMP_VELOCITY = -12; // -11
const DOUBLE_JUMP_VELOCITY = -10.5; // (no double jump in original)
const JUMP_CUT_FACTOR = 0.45; // releasing jump while rising cuts velocity (variable jump height)
const ACCELERATION = 1.3; // 0.7 — snappier starts
const MAX_MOVE_SPEED = 10.5; // 10
const DASH_SPEED = 19;
const DASH_TIME = 0.16; // s
const DASH_COOLDOWN = 0.32; // s
const JUMP_BUFFER = 0.12; // s
const COYOTE_TIME = 0.08; // s
const ATTACK_BUFFER = 0.3; // s

interface ComboStage {
  anim: string;
  /** time before the chain window check (original resetBunnyAttackTimer values, divided by speed) */
  chainTime: number;
  impulse: number;
  /** animation playback multiplier — attacks sped up per playtest feedback */
  speed: number;
}

// original 4-hit chain: anims + forward impulses from onAttackTouch/attackAgainTime.
// chainTime = original window / speed so logic stays in sync with the visuals.
// impulses reduced from original 8/7/4/6 per playtest ("attacks push forward too much")
const COMBO: ComboStage[] = [
  { anim: 'attack1', chainTime: 0.25 / 1.35, impulse: 4.5, speed: 1.35 },
  { anim: 'attack1_to_2', chainTime: 0.25 / 1.4, impulse: 4, speed: 1.4 },
  { anim: 'attack2_to_3', chainTime: 0.45 / 1.85, impulse: 2.5, speed: 1.85 }, // 600ms anim, the sluggish one
  { anim: 'attack3_to_4', chainTime: 0.5 / 1.4, impulse: 3.5, speed: 1.4 },
];
/** while attacking airborne, gravity is damped and fall speed capped (air combos) */
const AIR_ATTACK_GRAVITY_FACTOR = 0.3;
const AIR_ATTACK_MAX_FALL = 2.5;
/** after this fraction of a stage, jump can cancel the recovery (dash cancels anytime) */
const CANCEL_WINDOW = 0.55;

/** plunge (fall attack): reverse-played Attack_FromGtoA + fast fall, AoE on land */
const PLUNGE_FALL_ACCEL = GRAVITY * 2.2;
const PLUNGE_MAX_FALL = 17;

type State = 'ground' | 'air' | 'dash' | 'attack' | 'plunge';

export class PlayerController {
  x = 400;
  y = GROUND_Y;
  xVel = 0;
  yVel = 0;
  facing = 1; // 1 right, -1 left
  state: State = 'ground';
  onGround = true;

  /** i-frames flag (dash) — combat will honor this */
  invincible = false;
  /** debug-panel god mode: never takes damage */
  godMode = false;

  // original BUNNY_DEFAULT_MAX_HP = 50
  maxHp = 50;
  hp = 50;
  dead = false;
  /** original BUNNY_DEFAULT_DMG_SWORD = 30, +16 per AP damage level */
  swordDamage = 30;
  /** sword hit-segment scale: (240 + 20*swordLevel) / 240 */
  swordLengthFactor = 1;
  // ---- in-run shop stats (GameShop items, reset each run) ----
  /** armor pool — absorbs (resisted) damage until it breaks */
  armorHp = 0;
  /** chi enhancer: incoming damage multiplier (1 → 0.45) */
  dmgResistance = 1;
  /** dodge shoes: % chance to auto-dodge a hit */
  dodgeChance = 0;
  /** swift armor bonuses */
  speedBonus = 0;
  accelBonus = 0;
  /** invincibility potion timer (seconds) */
  potionInvinceTimer = 0;
  private slashLevel = 0;
  /** growth spell: visual scale + damage multiplier */
  sizeScale = 1;
  damageMultiplier = 1;
  private iframeTimer = 0;
  private hurtFlashOn = false;

  private spriter: SpriterPlayer;
  private input: Input;

  private jumpsUsed = 0;
  private coyoteTimer = 0;
  private dashTimer = 0;
  private dashCooldown = 0;
  private comboStage = -1;
  private comboTimer = 0;
  private attackQueued = false;
  private throwCooldown = 0;

  /** fired when a ninja star should spawn (x, y, dir) */
  onThrow: ((x: number, y: number, dir: number) => void) | null = null;
  /** fired when a plunge attack hits the ground (AoE + shockwave in Game) */
  onPlungeLand: ((x: number, y: number) => void) | null = null;
  /** fired when the dodge shoes auto-dodge a hit (achievement 037) */
  onDodge: (() => void) | null = null;

  constructor(spriter: SpriterPlayer, input: Input) {
    this.spriter = spriter;
    this.input = input;
    spriter.scale.set(BUNNY_SCALE);
    spriter.playAnim('idle');
    this.applyTransform();
  }

  /** permanent AP upgrades, applied at run start (original initBunny reads SharedObject levels) */
  applyFightUpgrades(fight: FightUpgrades): void {
    this.maxHp = 50 + 40 * fight.hp;
    this.swordDamage = 30 + 16 * fight.damage;
    this.swordLengthFactor = (240 + 20 * fight.sword) / 240;
    this.slashLevel = fight.slash;
  }

  /** reset the per-run shop stats (new run) */
  resetRunStats(): void {
    this.armorHp = 0;
    this.dmgResistance = 1;
    this.dodgeChance = 0;
    this.speedBonus = 0;
    this.accelBonus = 0;
    this.potionInvinceTimer = 0;
  }

  /** apply damage; returns false if it was dodged/ignored */
  hurt(amount: number, knockDir: number): boolean {
    if (this.godMode || this.invincible || this.iframeTimer > 0 || this.potionInvinceTimer > 0 || this.dead) return false;
    this.spriter.reverse = false; // an interrupted plunge must not stick its reverse flag
    // dodge shoes: auto-dodge roll (original: invincible + dodge anim + slide away)
    if (this.dodgeChance > 0 && Math.random() * 100 < this.dodgeChance) {
      this.iframeTimer = 1.5;
      this.xVel = 13 * knockDir;
      this.spriter.playbackSpeed = 1;
      this.comboStage = -1;
      this.state = this.onGround ? 'ground' : 'air';
      this.spriter.playAnim('dodge', this.onGround ? 'idle' : 'idle_air', null, true);
      this.onDodge?.();
      return false;
    }
    amount *= this.dmgResistance;
    // armor absorbs the hit until the pool breaks
    if (this.armorHp > 0) {
      this.armorHp -= amount;
      amount = this.armorHp < 0 ? -this.armorHp : 0;
      if (this.armorHp < 0) this.armorHp = 0;
      if (amount <= 0) {
        this.iframeTimer = 0.8;
        this.xVel = 4 * knockDir;
        return true;
      }
    }
    this.hp -= amount;
    audio.play('bunny_hurt');
    this.xVel = 6 * knockDir;
    this.yVel = -4;
    this.onGround = false;
    this.spriter.playbackSpeed = 1;
    this.comboStage = -1;

    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      audio.play('you_died', 0.4);
      this.spriter.playAnim('die', 'die_idle', null, true, true);
      return true;
    }
    this.iframeTimer = 1.1;
    this.state = 'air';
    this.spriter.playAnim('hurt', 'idle_air', null, true);
    return true;
  }

  respawn(x: number): void {
    this.dead = false;
    this.hp = this.maxHp;
    this.x = x;
    this.y = GROUND_Y;
    this.xVel = 0;
    this.yVel = 0;
    this.state = 'ground';
    this.onGround = true;
    this.iframeTimer = 1;
    this.spriter.playbackSpeed = 1;
    this.spriter.alpha = 1;
    this.spriter.playAnim('respawn', 'idle', null, true);
  }

  get hasIFrames(): boolean {
    return this.godMode || this.invincible || this.iframeTimer > 0 || this.potionInvinceTimer > 0;
  }

  /** active combo stage index (-1 when not attacking) — used for per-swing hit sets */
  get comboStageIndex(): number {
    return this.comboStage;
  }

  /** fixed 60Hz tick; dt is always 1/60 but passed for the spriter clock */
  update(dt: number): void {
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);

    // invincibility potion: golden pulse (original boosted brightness/saturation)
    if (this.potionInvinceTimer > 0) {
      this.potionInvinceTimer -= dt;
      this.spriter.setColor(Math.sin(this.potionInvinceTimer * 18) > 0 ? 0xffe066 : 0xffffff);
      if (this.potionInvinceTimer <= 0) this.spriter.setColor(0xffffff);
    }

    // i-frame flicker after getting hit
    if (this.iframeTimer > 0) {
      this.iframeTimer -= dt;
      this.hurtFlashOn = !this.hurtFlashOn;
      this.spriter.alpha = this.hurtFlashOn ? 0.45 : 0.9;
      if (this.iframeTimer <= 0) this.spriter.alpha = 1;
    }

    if (this.dead) {
      this.xVel *= 0.9;
      this.integrate();
      this.applyTransform();
      this.spriter.advanceTime(dt);
      return;
    }

    switch (this.state) {
      case 'dash':
        this.updateDash(dt);
        break;
      case 'attack':
        this.updateAttack(dt);
        break;
      case 'plunge':
        this.xVel *= 0.85; // x damps hard — it's a committed drop
        break;
      default:
        this.updateMove(dt);
    }

    this.integrate();
    this.applyTransform();
    this.spriter.advanceTime(dt);
  }

  // ---- movement (ground + air) ----
  private updateMove(dt: number): void {
    const axis = this.input.axisX;

    if (axis !== 0) {
      const maxSpeed = MAX_MOVE_SPEED + this.speedBonus;
      this.xVel += (ACCELERATION + this.accelBonus) * axis;
      if (this.xVel > maxSpeed) this.xVel = maxSpeed;
      if (this.xVel < -maxSpeed) this.xVel = -maxSpeed;
      this.face(Math.sign(axis));
      if (this.onGround && this.spriter.currentAnimationName !== 'Run') {
        this.spriter.playAnim('Run');
      }
    } else {
      // original: friction when no input; stop + idle below accel/4 threshold
      this.xVel *= FRICTION;
      if (this.onGround) {
        if (Math.abs(this.xVel) > 3 && this.spriter.currentAnimationName === 'Run') {
          this.spriter.playAnim('Slow'); // skid
          audio.play('slide_to_stop', 0, 0.5);
        } else if (Math.abs(this.xVel) < ACCELERATION / 4) {
          this.xVel = 0;
          if (this.spriter.currentAnimationName === 'Slow' || this.spriter.currentAnimationName === 'Run') {
            this.spriter.playAnim('idle');
          }
        }
      }
    }

    // jump (buffered + coyote)
    if (this.input.buffered('jump', JUMP_BUFFER)) {
      if (this.onGround || this.coyoteTimer > 0) {
        this.input.consumeBuffer('jump');
        this.doJump(false);
      } else if (this.jumpsUsed < 2) {
        this.input.consumeBuffer('jump');
        this.doJump(true);
      }
    }

    // dash
    if (this.input.buffered('dash', 0.1) && this.dashCooldown <= 0) {
      this.input.consumeBuffer('dash');
      this.startDash();
      return;
    }

    // attack — or plunge when holding down in the air (the phase-2 fall attack)
    if (this.input.buffered('attack', 0.1)) {
      this.input.consumeBuffer('attack');
      if (!this.onGround && this.input.isDown('down')) {
        this.startPlunge();
      } else {
        this.startCombo();
      }
      return;
    }

    // ninja star throw (doesn't change state — original isThrowing was a 200ms overlay)
    this.throwCooldown = Math.max(0, this.throwCooldown - dt);
    if (this.input.buffered('throw', 0.1) && this.throwCooldown <= 0) {
      this.input.consumeBuffer('throw');
      this.throwCooldown = 0.22;
      const back = this.onGround ? (this.input.axisX !== 0 ? 'Run' : 'idle') : 'idle_air';
      this.spriter.playAnim(this.onGround && this.input.axisX !== 0 ? 'Throw_Run' : 'Throw', back, null, true);
      this.onThrow?.(this.x, this.y, this.facing);
    }

    if (!this.onGround) {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }
  }

  private jumpCutDone = false;

  private doJump(double: boolean): void {
    this.jumpCutDone = false;
    audio.play('jumpSound', double ? 0 : 0.05);
    if (double) {
      this.yVel = DOUBLE_JUMP_VELOCITY;
      this.jumpsUsed = 2;
      this.spriter.playAnim('airJump', 'idle_air', null, true);
    } else {
      this.yVel = JUMP_VELOCITY;
      this.jumpsUsed = 1;
      this.coyoteTimer = 0;
      this.spriter.playAnim('jump_straight', 'idle_air', null, true);
    }
    this.onGround = false;
    this.state = 'air';
  }

  // ---- dash ----
  private startDash(): void {
    this.state = 'dash';
    this.dashTimer = DASH_TIME;
    this.dashCooldown = DASH_COOLDOWN;
    this.invincible = true;
    const dir = this.input.axisX !== 0 ? Math.sign(this.input.axisX) : this.facing;
    this.face(dir);
    this.xVel = DASH_SPEED * dir;
    this.yVel = 0;
    this.spriter.playAnim('dash_forward', this.onGround ? 'idle' : 'idle_air', null, true);
  }

  private updateDash(dt: number): void {
    this.dashTimer -= dt;
    if (this.dashTimer <= 0) {
      this.invincible = false;
      this.xVel *= 0.5;
      this.state = this.onGround ? 'ground' : 'air';
      if (this.onGround) this.spriter.playAnim(this.input.axisX !== 0 ? 'Run' : 'idle');
    }
  }

  // ---- plunge (fall attack) ----
  private startPlunge(): void {
    this.state = 'plunge';
    this.xVel *= 0.4;
    if (this.yVel < 2) this.yVel = 2;
    // no authored downward attack — Attack_FromGtoA played in REVERSE is the move
    this.spriter.reverse = true;
    this.spriter.playbackSpeed = 1.25;
    this.spriter.playAnim('Attack_FromGtoA', '', null, true);
    audio.playRandom(SWING_SOUNDS[2], 0.02);
  }

  // ---- attack combo ----
  private startCombo(): void {
    this.state = 'attack';
    this.comboStage = 0;
    this.beginComboStage();
  }

  private beginComboStage(): void {
    const stage = COMBO[this.comboStage];
    // slash booster: original attack-again 0.65 - 0.05*L, applied as a chain-window factor
    this.comboTimer = stage.chainTime * ((0.65 - 0.05 * this.slashLevel) / 0.65);
    this.attackQueued = false;
    this.xVel = stage.impulse * this.facing;
    this.spriter.playbackSpeed = stage.speed;
    this.spriter.playAnim(stage.anim, '', null, true);
    if (this.comboStage === 0) audio.play('bunny_drawSword');
    audio.playRandom(SWING_SOUNDS[this.comboStage], 0.02);
  }

  private exitAttack(): void {
    this.comboStage = -1;
    this.spriter.playbackSpeed = 1;
    this.state = this.onGround ? 'ground' : 'air';
  }

  private updateAttack(dt: number): void {
    // original: attack decelerates with *0.98 per frame
    this.xVel *= 0.98;
    this.comboTimer -= dt;

    if (this.input.justPressed('attack')) this.attackQueued = true;

    const stage = COMBO[this.comboStage];
    const elapsed = 1 - this.comboTimer / stage.chainTime;

    // dash cancels any attack instantly — core responsiveness move
    if (this.input.buffered('dash', 0.1) && this.dashCooldown <= 0) {
      this.input.consumeBuffer('dash');
      this.exitAttack();
      this.startDash();
      return;
    }

    // jump cancels the back half of a swing (recovery)
    if (elapsed > CANCEL_WINDOW && this.input.buffered('jump', JUMP_BUFFER) && (this.onGround || this.jumpsUsed < 2)) {
      this.input.consumeBuffer('jump');
      const wasGrounded = this.onGround || this.coyoteTimer > 0;
      this.exitAttack();
      this.doJump(!wasGrounded);
      return;
    }

    if (this.comboTimer <= 0) {
      if (this.attackQueued && this.comboStage < COMBO.length - 1) {
        this.comboStage++;
        this.beginComboStage();
      } else {
        // recover to idle via the matching transition anim
        const recover = ['attack1_to_idle', 'attack2_to_idle', 'attack3_to_idle', 'attack4_to_idle'][this.comboStage];
        this.exitAttack();
        this.spriter.playAnim(recover, this.onGround ? 'idle' : 'idle_air');
      }
    }
  }

  // ---- shared physics ----
  private integrate(): void {
    this.x += this.xVel;
    this.y += this.yVel;

    // variable jump height: releasing jump while rising cuts the ascent
    if (!this.onGround && !this.jumpCutDone && this.yVel < -2 && !this.input.isDown('jump')) {
      this.yVel *= JUMP_CUT_FACTOR;
      this.jumpCutDone = true;
    }

    if (!this.onGround && this.state !== 'dash') {
      if (this.state === 'attack') {
        // float during air attacks so combos can stay airborne
        this.yVel += GRAVITY * AIR_ATTACK_GRAVITY_FACTOR;
        if (this.yVel > AIR_ATTACK_MAX_FALL) this.yVel = AIR_ATTACK_MAX_FALL;
      } else if (this.state === 'plunge') {
        this.yVel += PLUNGE_FALL_ACCEL;
        if (this.yVel > PLUNGE_MAX_FALL) this.yVel = PLUNGE_MAX_FALL;
      } else {
        this.yVel += GRAVITY;
      }
    }

    // ground
    if (this.y >= GROUND_Y) {
      this.y = GROUND_Y;
      this.yVel = 0;
      if (!this.onGround) {
        this.onGround = true;
        this.jumpsUsed = 0;
        if (this.state === 'plunge') {
          this.state = 'ground';
          this.spriter.reverse = false;
          this.spriter.playbackSpeed = 1;
          this.spriter.playAnim('land', 'idle', null, true);
          this.onPlungeLand?.(this.x, this.y);
        } else if (this.state === 'air') {
          this.state = 'ground';
          if (this.input.axisX !== 0) {
            this.spriter.playAnim('Run');
          } else if (Math.abs(this.xVel) > 3) {
            this.spriter.playAnim('Slow');
          } else {
            this.spriter.playAnim('land', 'idle');
          }
        }
      }
    } else if (this.y < GROUND_Y && this.onGround) {
      this.onGround = false;
      this.coyoteTimer = COYOTE_TIME;
    }

    // walls (original bounces with *-0.8)
    if (this.x > WALL_RIGHT) {
      this.x = WALL_RIGHT;
      this.xVel *= -0.8;
    } else if (this.x < WALL_LEFT) {
      this.x = WALL_LEFT;
      this.xVel *= -0.8;
    }
  }

  private face(dir: number): void {
    if (dir !== 0) this.facing = dir;
  }

  private applyTransform(): void {
    this.spriter.position.set(this.x, this.y);
    const s = BUNNY_SCALE * this.sizeScale;
    this.spriter.scale.set(s * this.facing, s);
  }
}
