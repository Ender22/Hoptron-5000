/**
 * The stateful enemy archetypes, each a faithful port of its original AS3
 * class (com/characterclasses/*.as) — constants, timings, anim names and
 * state conditions match the originals; only the architecture is new.
 * All per-frame velocities assume the fixed 60Hz step.
 */
import type { SpriterPlayer } from '../spriter/SpriterPlayer';
import { audio } from './Audio';
import { AttachedMinion, NoteMinion, PowerSwat } from './BossBehaviors';
import type { EnemyType } from './data/levelData';
import { Enemy, ENEMY_SCALE, type PlayerView } from './Enemy';
import { GROUND_Y } from './PlayerController';

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** factory: aiType -> behavior subclass (others use the base class's switch) */
export function createEnemy(type: EnemyType, spriter: SpriterPlayer): Enemy {
  switch (type.aiType) {
    case 'Crusher':
      return new Crusher(type, spriter);
    case 'GroundPopper':
      return new GroundPopper(type, spriter);
    case 'Shooter':
      return new Shooter(type, spriter);
    case 'Blaster':
      return new Blaster(type, spriter);
    case 'Exploder':
      return new Exploder(type, spriter);
    case 'Bouncer':
      return new Bouncer(type, spriter);
    case 'Dropper':
      return new Dropper(type, spriter);
    case 'Spinner':
      return new Spinner(type, spriter);
    case 'Icecream':
      return new Icecream(type, spriter);
    case 'Fries':
      return new Fries(type, spriter);
    case 'Stick':
      return new Stick(type, spriter);
    case 'Spawner':
      return new Spawner(type, spriter);
    case 'MiddleSlammer':
      return new MiddleSlammer(type, spriter);
    case 'PowerSwat':
      return new PowerSwat(type, spriter);
    case 'Candle':
    case 'HamburgerHeart':
      return new AttachedMinion(type, spriter);
    case 'Note':
      return new NoteMinion(type, spriter);
    default:
      return new Enemy(type, spriter);
  }
}

// ---------------------------------------------------------------------------
/**
 * Crusher (pineapple, drink) — drops in from the sky onto the player once,
 * then chases on the ground. Difficulty >4 (drink): after landing it blasts
 * a soda jet (angled line collision + coke_blast loop) instead of biting.
 */
class Crusher extends Enemy {
  private onScreen = false;
  private crushFinished = false;
  private shooting = false;
  private restTimer = -1;
  private stopLoop: (() => void) | null = null;
  private sprayTimer = 0;

  spawnAt(x: number, y: number): void {
    super.spawnAt(x, y);
    this.flying = true;
    this.canDamage = false;
    this.play('drop_ready');
  }

  protected runAI(dt: number, player: PlayerView): void {
    const t = this.type;
    this.faceOverride = player.x < this.x ? -1 : 1;

    if (this.restTimer > 0) {
      this.restTimer -= dt;
      if (this.restTimer <= 0) this.startMoving();
      return;
    }

    if (!this.onScreen) {
      // descend to hover height y=100
      if (this.y < 100) this.yVel += t.acceleration;
      else {
        this.onScreen = true;
        this.yVel = 0;
      }
      return;
    }

    if (this.crushFinished) {
      // grounded chaser (post-crush)
      const dir = player.x < this.x ? -1 : 1;
      this.xVel = Math.max(-t.maxMovementSpeed, Math.min(t.maxMovementSpeed, this.xVel + t.acceleration * dir));
      if (this.spriter.currentAnimationName !== 'move') this.play('move');

      if (this.shooting) {
        // soda jet: angled line from the nozzle down-forward (original coords)
        const f = this.faceOverride ?? 1;
        const x1 = this.x + 30 * f;
        const y1 = this.y - 80;
        const x2 = this.x + 130 * f;
        const y2 = this.y + 20;
        this.sprayTimer -= dt;
        if (this.sprayTimer <= 0) {
          this.sprayTimer = 0.05;
          const u = Math.random();
          this.services?.burst(x1 + (x2 - x1) * u, y1 + (y2 - y1) * u, 'explosion_white', 2);
        }
        const px = player.x;
        const py = player.y - 40;
        const lenSq = (x2 - x1) ** 2 + (y2 - y1) ** 2;
        const u2 = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / lenSq));
        if (Math.hypot(px - (x1 + u2 * (x2 - x1)), py - (y1 + u2 * (y2 - y1))) < 32) {
          this.services?.hurtPlayer(t.attackDmg, f);
        }
      }
      return;
    }

    // hovering: track the player, then drop
    if (player.x < this.x - 10) {
      if (this.xVel > -t.maxMovementSpeed) this.xVel -= t.acceleration * 2;
    } else if (player.x > this.x + 10) {
      if (this.xVel < t.maxMovementSpeed) this.xVel += t.acceleration * 2;
    } else {
      if (!this.canDamage) audio.play('pineapple_start', 0, 0.5);
      this.xVel = 0;
      this.canDamage = true;
      this.play('drop');
      // fall with gravity/3 (original), locked horizontally while falling fast
      this.yVel += t.acceleration;
      this.flying = false;
    }
    if (!this.flying) {
      this.yVel += 0.5 / 3;
      if (this.y >= GROUND_Y) {
        audio.play('pineapple_thud', 0, 0.8);
        this.services?.shake(2);
        this.y = GROUND_Y;
        this.yVel = 0;
        this.crushFinished = true;
        this.canDamage = false;
        this.play('idle');
        this.restTimer = rand(0.8, 1.7);
      }
    }
  }

  private startMoving(): void {
    if (!this.alive) return;
    this.play('move');
    this.canDamage = true;
    if (this.type.difficulty > 4) {
      // drink: soda-jet mode (body harmless, jet hurts)
      this.canDamage = false;
      this.shooting = true;
      this.stopLoop = audio.playLoop('coke_blast', 0.4);
    }
  }

  dispose(): void {
    this.stopLoop?.();
    this.stopLoop = null;
  }

  protected onDeath(): void {
    this.dispose();
  }
}

// ---------------------------------------------------------------------------
/**
 * GroundPopper (strawberry, carrot) — bursts out of the ground. Difficulty
 * tiers from the original: <3 static biter, 3-5 walker, >=6 sky-crusher.
 */
class GroundPopper extends Enemy {
  private outOfGround = false;
  private inSky = false;
  private crushStarted = false;
  private crushFinished = false;
  private restTimer = 0;
  private dirtTimer = 0;
  private attacking = false;

  spawnAt(x: number, _y: number): void {
    super.spawnAt(x, GROUND_Y + 120); // underground, rising
    this.spriter.visible = false;
    this.canDamage = false;
    this.flying = true; // no gravity while rising
    this.yVel = 0;
  }

  protected runAI(dt: number, player: PlayerView): void {
    const t = this.type;

    if (!this.outOfGround) {
      // rise: yVel -= acceleration, capped at -maxMovementSpeed (original)
      if (this.yVel > -t.maxMovementSpeed) this.yVel -= t.acceleration;
      // dirt trickle telegraph at the ground line so the pop reads visually
      this.dirtTimer -= dt;
      if (this.dirtTimer <= 0) {
        this.dirtTimer = 0.1;
        this.services?.burst(this.x + rand(-12, 12), GROUND_Y + 6, 'explosion_orange', 2);
      }
      if (this.y < GROUND_Y + 45) this.burstOut(player);
      return;
    }

    if (t.difficulty < 3) {
      // static biter (strawberry)
      this.xVel = Math.abs(this.xVel) > 0.2 ? this.xVel * 0.92 : 0;
      const dist = Math.hypot(player.x - this.x, player.y - this.y);
      if (!this.attacking && dist < 105) {
        this.attacking = true;
        audio.play('strawberry_bite', 0, 0.8);
        this.faceOverride = player.x < this.x ? -1 : 1;
        this.spriter.playAnim('attack', '', () => {
          this.attacking = false;
          this.play('idle');
        }, true);
      }
      return;
    }

    if (t.difficulty < 6) {
      this.aiMover(); // walker tier
      return;
    }

    // crusher tier (carrot): fly up -> aim above player -> drop -> repeat
    if (!this.inSky && !this.crushStarted) {
      this.play('flyUp');
      if (this.yVel > -t.maxMovementSpeed * 3) this.yVel -= t.acceleration;
      this.flying = true;
      if (this.y < 40) {
        this.inSky = true;
        this.crushFinished = false;
        this.yVel = 0;
        this.play('lookDown');
      }
    } else if (this.inSky && !this.crushStarted) {
      if (this.y < 50) this.y = 50;
      this.yVel = 0;
      if (Math.abs(player.x - this.x) > 10) {
        const dir = Math.sign(player.x - this.x);
        this.xVel += t.acceleration * 2 * dir;
        this.xVel = Math.max(-t.maxMovementSpeed, Math.min(t.maxMovementSpeed, this.xVel));
      } else {
        // drop!
        this.crushStarted = true;
        this.xVel = 0;
        this.canDamage = true;
        this.flying = false;
        this.play('drop');
      }
    } else if (this.crushStarted && !this.crushFinished) {
      this.yVel += t.acceleration;
      if (this.y >= GROUND_Y) {
        audio.play('pineapple_thud', 0, 0.8);
        this.services?.shake(4);
        this.y = GROUND_Y;
        this.yVel = 0;
        this.canDamage = false;
        this.crushFinished = true;
        this.inSky = false;
        this.restTimer = rand(1.5, 3);
        this.play('idle');
      }
    } else if (this.crushFinished) {
      this.xVel *= 0.92;
      this.restTimer -= dt;
      if (this.restTimer <= 0) {
        // jump back up and repeat (original flyBackUp/flyBackUpNow)
        this.spriter.playAnim('jumpUp', 'lookDown', null, true);
        this.canDamage = true;
        this.yVel = -10;
        this.flying = true;
        this.crushStarted = false;
        this.crushFinished = false;
      }
    }
  }

  private burstOut(player: PlayerView): void {
    this.outOfGround = true;
    this.spriter.visible = true;
    this.canDamage = true;
    this.flying = false;
    this.y = GROUND_Y;
    this.yVel = -10; // original hard overwrite: upward burst
    this.faceOverride = null;
    this.movingLeft = player.x < this.x;
    audio.play('strawberry_burstOut', 0, 0.8);
    this.services?.shake(2);
    this.services?.burst(this.x, GROUND_Y, 'explosion_orange', 14);
    if (this.type.difficulty >= 6 && this.spriter.hasAnim('flyUp')) {
      this.spriter.playAnim('burstOut', 'flyUp', null, true);
    } else {
      this.spriter.playAnim('burstOut', 'idle', null, true);
    }
  }
}

// ---------------------------------------------------------------------------
/**
 * Shooter (corn, dumpling) — fires projectiles on a timer. Difficulty <=2:
 * static turret with aimed shots; >2: paces and fires horizontal tumblers.
 */
class Shooter extends Enemy {
  private canMove = false;
  private shootTimer = 0;
  private fireDelay = -1; // pending shot inside the shoot anim

  spawnAt(x: number, y: number): void {
    super.spawnAt(x, y);
    this.canMove = this.type.difficulty > 2;
    if (this.canMove) {
      this.shootTimer = 0.65;
      this.play('idle');
    } else {
      this.shootTimer = 0.45;
      this.canDamage = false;
      this.invincible = true;
      if (this.spriter.hasAnim('appear')) {
        this.spriter.playAnim('appear', '', () => {
          this.invincible = false;
          this.canDamage = true;
          this.play('idle');
        }, true);
      } else {
        this.invincible = false;
        this.canDamage = true;
        this.play('idle');
      }
    }
  }

  protected runAI(dt: number, player: PlayerView): void {
    const t = this.type;
    if (this.canMove) {
      this.aiMover();
    } else {
      this.xVel = 0;
      this.faceOverride = player.x < this.x ? -1 : 1;
    }

    // pending shot fires partway into the shoot anim (original delayed shootOne)
    if (this.fireDelay >= 0) {
      this.fireDelay -= dt;
      if (this.fireDelay < 0) this.fireOne(player);
    }

    this.shootTimer -= dt;
    if (this.shootTimer <= 0 && !this.invincible) {
      this.shootTimer = this.canMove ? 1.5 : 2.0;
      this.spriter.playAnim('shoot', 'idle', null, true);
      this.fireDelay = this.canMove ? 0.1 : 0.6;
    }
  }

  private fireOne(player: PlayerView): void {
    if (!this.alive || !this.projectileDef || !this.services) return;
    const [mx, my] = this.muzzleOffset();
    const sx = this.x + mx;
    const sy = this.y + my;
    audio.play('projectileShot', 0, 0.6);
    if (this.canMove) {
      // horizontal tumbling shot
      const dir = Math.sign(this.spriter.scale.x) || 1;
      this.services.shoot(this.projectileDef, sx, sy, 5 * dir, 0, { rotSpeed: 0.2 * dir });
    } else {
      // aimed at the bunny, speed 8 (original normalized vector)
      const dx = player.x - sx;
      const dy = player.y - 30 - sy;
      const len = Math.max(1, Math.hypot(dx, dy));
      this.services.shoot(this.projectileDef, sx, sy, (dx / len) * 8, (dy / len) * 8, {
        rotation: Math.atan2(dy, dx) + Math.PI / 2,
      });
    }
  }
}

// ---------------------------------------------------------------------------
/**
 * Blaster (pepper) — flies to a wall at flame height, then sweeps back and
 * forth blasting a diagonal flame line checked against the player each frame.
 */
class Blaster extends Enemy {
  private movingToSide = true;
  private fireToRight = false;
  private firing = false;
  private stopLoop: (() => void) | null = null;
  private flameTimer = 0;

  spawnAt(x: number, y: number): void {
    super.spawnAt(x, y);
    this.flying = true;
    this.canDamage = false;
    this.play('idle');
  }

  protected runAI(dt: number, player: PlayerView): void {
    const t = this.type;
    const fireY = GROUND_Y - 110;

    if (this.movingToSide) {
      // descend to flame height, drift to the nearer wall
      if (this.y < fireY - 5) this.yVel = Math.min(this.yVel + t.acceleration, t.maxMovementSpeed);
      else {
        this.y = fireY;
        this.yVel = 0;
      }
      const targetX = this.x < 400 ? 80 : 720;
      const dir = Math.sign(targetX - this.x);
      this.xVel = Math.max(-t.maxMovementSpeed, Math.min(t.maxMovementSpeed, this.xVel + t.acceleration * dir));
      if (Math.abs(this.x - targetX) < 12 && this.y >= fireY - 6) {
        this.movingToSide = false;
        this.fireToRight = targetX === 80;
        this.xVel = 0;
        this.spriter.playAnim('pre_fire', '', () => {
          this.firing = true;
          this.play('fire');
          this.stopLoop = audio.playLoop('fireLoop', 0.5);
        }, true);
      }
      return;
    }

    if (!this.firing) return;

    // sweep across, flame angled down-forward (original 80,80 diagonal line)
    this.yVel = 0;
    const dir = this.fireToRight ? 1 : -1;
    this.faceOverride = dir;
    this.xVel = Math.max(-t.maxMovementSpeed, Math.min(t.maxMovementSpeed, this.xVel + t.acceleration * dir));
    if ((this.fireToRight && this.x >= 720) || (!this.fireToRight && this.x <= 80)) {
      this.fireToRight = !this.fireToRight;
      this.xVel = 0;
    }

    // flame visual: particles along the line
    this.flameTimer -= dt;
    if (this.flameTimer <= 0) {
      this.flameTimer = 0.04;
      const f = Math.random();
      this.services?.burst(this.x + 80 * dir * f, this.y + 80 * f, 'explosion_orange', 2);
    }

    // line vs player (original CHECK_SPECIAL_COLLISION ray)
    const px = player.x;
    const py = player.y - 40;
    const x1 = this.x;
    const y1 = this.y;
    const x2 = this.x + 80 * dir;
    const y2 = this.y + 80;
    const lenSq = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    const u = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / lenSq));
    const dist = Math.hypot(px - (x1 + u * (x2 - x1)), py - (y1 + u * (y2 - y1)));
    if (dist < 34) {
      this.services?.hurtPlayer(this.type.attackDmg, dir);
    }
  }

  dispose(): void {
    this.stopLoop?.();
    this.stopLoop = null;
  }

  protected onDeath(): void {
    this.dispose();
  }
}

// ---------------------------------------------------------------------------
/**
 * Exploder (berries) — floats at the player and detonates on proximity.
 * Damage window opens 0.8s into the explosion (original canHurt).
 */
class Exploder extends Enemy {
  private exploding = false;
  private blastTimer = 0;
  private blasted = false;

  spawnAt(x: number, y: number): void {
    super.spawnAt(x, y);
    this.flying = true;
    this.canDamage = false; // body doesn't hurt; only the blast does
    this.play('move');
  }

  protected runAI(dt: number, player: PlayerView): void {
    const t = this.type;
    if (this.exploding) {
      this.xVel = 0;
      this.yVel = 0;
      this.blastTimer += dt;
      if (!this.blasted && this.blastTimer >= 0.8) {
        this.blasted = true;
        this.invincible = true;
        this.services?.shake(5);
        this.services?.burst(this.x, this.y, this.type.deathPS || 'explosion_purple', 22);
        if (Math.hypot(player.x - this.x, player.y - 40 - (this.y - 20)) < 80) {
          this.services?.hurtPlayer(t.attackDmg, Math.sign(player.x - this.x) || 1);
        }
      }
      if (this.blastTimer >= 1.1) this.spriter.alpha = Math.max(0, 1 - (this.blastTimer - 1.1) / 0.15);
      if (this.blastTimer >= 1.3) {
        // self-removal (original REMOVED event): no loot, no score
        this.suicided = true;
        this.alive = false;
        this.canDamage = false;
        this.deathAnim = 'explode';
      }
      return;
    }

    // home toward the player (original: y tracking is 15x slower)
    if (this.x < player.x - 30) this.xVel = Math.min(this.xVel + t.acceleration, t.maxMovementSpeed);
    else if (this.x > player.x + 30) this.xVel = Math.max(this.xVel - t.acceleration, -t.maxMovementSpeed);
    else this.xVel = 0;
    const targetY = player.y - 30;
    if (this.y < targetY - 30) this.yVel += t.acceleration / 15;
    else if (this.y > targetY + 30) this.yVel -= t.acceleration / 15;
    else this.yVel = 0;

    if (Math.abs(this.y - (player.y - 30)) < 50 && Math.abs(this.x - player.x) < 50) {
      this.exploding = true;
      this.blastTimer = 0;
      audio.play('berries_explode', 0, 0.8);
      this.spriter.playAnim('explode', '', null, true);
    }
  }
}

// ---------------------------------------------------------------------------
/**
 * Bouncer (cookie) — glides on screen, spins up, then ricochets around the
 * arena. Getting hurt stops the spin; it re-spins 0.6s later.
 */
class Bouncer extends Enemy {
  private goingOnScreen = true;
  private moving = false;
  private movingUp = false;
  private spinDelay = 0;

  spawnAt(x: number, y: number): void {
    super.spawnAt(x, y);
    this.flying = true;
    this.play('idle');
  }

  protected onHurt(): void {
    this.moving = false;
    this.spinDelay = 0.6;
  }

  protected runAI(dt: number, _player: PlayerView): void {
    const t = this.type;

    if (this.goingOnScreen) {
      const cap = t.maxMovementSpeed / 2;
      this.xVel = Math.max(-cap, Math.min(cap, this.xVel + t.acceleration * (this.x < 400 ? 1 : -1)));
      if (this.y < 200) this.yVel = Math.min(cap, this.yVel + t.acceleration);
      if (this.y > GROUND_Y - 50) this.yVel = Math.max(-cap, this.yVel - t.acceleration);
      if (this.x > 50 && this.x < 750 && this.y > 50 && this.y < GROUND_Y - 40) {
        this.goingOnScreen = false;
        this.spinDelay = 0.1;
      }
      return;
    }

    if (this.moving) {
      // ricochet at full speed
      this.xVel = Math.max(-t.maxMovementSpeed, Math.min(t.maxMovementSpeed, this.xVel + t.acceleration * (this.movingLeft ? -1 : 1)));
      this.yVel = Math.max(-t.maxMovementSpeed, Math.min(t.maxMovementSpeed, this.yVel + t.acceleration * (this.movingUp ? -1 : 1)));
      if ((this.x >= 760 && !this.movingLeft) || (this.x <= 40 && this.movingLeft)) {
        this.xVel *= -1;
        this.movingLeft = !this.movingLeft;
        audio.playRandom(['impact1', 'impact2', 'impact3'], 0, 0.5);
      }
      if ((this.y >= GROUND_Y && !this.movingUp) || (this.y <= 40 && this.movingUp)) {
        this.yVel *= -1;
        this.movingUp = !this.movingUp;
        audio.playRandom(['impact1', 'impact2', 'impact3'], 0, 0.5);
      }
      return;
    }

    // waiting to spin up
    this.xVel *= 0.95;
    this.yVel *= 0.95;
    this.spinDelay -= dt;
    if (this.spinDelay > 0) return;
    this.spinDelay = Number.POSITIVE_INFINITY;
    audio.play('spin_start', 0, 0.6);
    this.spriter.playAnim('spinstart', '', () => {
      if (!this.alive) return;
      this.play('spin');
      this.moving = true;
      this.movingLeft = this.x > 400;
      this.movingUp = this.y > 200;
    }, true);
  }
}

// ---------------------------------------------------------------------------
/**
 * Dropper (pie) — flies in from above, patrols at altitude, periodically
 * drops a gravity projectile (Pie_Cherry).
 */
class Dropper extends Enemy {
  private goingOnScreen = true;
  private dropTimer = 0.5;

  spawnAt(x: number, y: number): void {
    super.spawnAt(x, y);
    this.flying = true;
    this.canDamage = false;
    this.play('move');
  }

  protected runAI(dt: number, _player: PlayerView): void {
    const t = this.type;

    if (this.goingOnScreen) {
      const cap = t.maxMovementSpeed / 2;
      this.xVel = Math.max(-cap, Math.min(cap, this.xVel + t.acceleration * (this.x < 400 ? 1 : -1)));
      if (this.y < 100) this.yVel = Math.min(cap, this.yVel + t.acceleration);
      else this.yVel = 0;
      if (this.x > 50 && this.x < 750 && this.y > 75) {
        this.goingOnScreen = false;
        this.movingLeft = this.x > 400;
        this.dropTimer = 0.5;
      }
      return;
    }

    // patrol at fixed height
    this.yVel = 0;
    if (this.movingLeft) {
      this.xVel = Math.max(-t.maxMovementSpeed, this.xVel - t.acceleration);
      if (this.x < 60) this.movingLeft = false;
    } else {
      this.xVel = Math.min(t.maxMovementSpeed, this.xVel + t.acceleration);
      if (this.x > 720) this.movingLeft = true;
    }
    if (this.spriter.currentAnimationName !== 'drop') this.play('move');

    this.dropTimer -= dt;
    if (this.dropTimer <= 0) {
      this.dropTimer = rand(0.5, 1.0);
      if (!this.projectileDef || !this.services) return;
      this.spriter.playAnim('drop', 'move', null, true);
      audio.play('projectileShot', 0, 0.5);
      const [mx, my] = this.muzzleOffset(0, 10);
      const dir = Math.sign(this.spriter.scale.x) || 1;
      this.services.shoot(this.projectileDef, this.x + mx, this.y + my + 10, dir, 1, { scale: 0.5 });
    }
  }
}

// ---------------------------------------------------------------------------
/**
 * Spinner (onion) — telegraphs, then launches horizontally until it crashes
 * into a wall; rests 3s and repeats. Only damages while spinning.
 */
class Spinner extends Enemy {
  private spinning = false;
  private waitTimer = 1.5;

  spawnAt(x: number, y: number): void {
    super.spawnAt(x, y);
    this.canDamage = false;
    this.play('idle');
  }

  protected runAI(dt: number, _player: PlayerView): void {
    const t = this.type;

    if (this.spinning) {
      const dir = this.faceOverride ?? 1;
      this.xVel = Math.max(-t.maxMovementSpeed, Math.min(t.maxMovementSpeed, this.xVel + t.acceleration * dir));
      if ((dir > 0 && this.x >= 730) || (dir < 0 && this.x <= 70)) this.crash();
      return;
    }

    this.xVel *= 0.9;
    this.waitTimer -= dt;
    if (this.waitTimer > 0) return;
    this.waitTimer = Number.POSITIVE_INFINITY;
    // face away from the nearer wall and wind up
    this.faceOverride = this.x < 400 ? 1 : -1;
    audio.play('spin_start', 0, 0.6);
    this.spriter.playAnim('pre_spin', '', () => {
      if (!this.alive) return;
      this.canDamage = true;
      this.spinning = true;
      this.play('spin');
    }, true);
  }

  private crash(): void {
    this.spinning = false;
    this.canDamage = false;
    this.xVel = 0;
    this.waitTimer = 3.0;
    this.services?.shake(2);
    audio.playRandom(['impact1', 'impact2', 'impact3'], 0, 0.6);
    this.spriter.playAnim('crash', '', () => {
      this.faceOverride = this.x < 400 ? 1 : -1;
      this.play('idle');
    }, true);
  }
}

// ---------------------------------------------------------------------------
/** Icecream — plain patroller that splits into two scoop enemies on death. */
class Icecream extends Enemy {
  protected runAI(_dt: number, _player: PlayerView): void {
    this.aiMover();
  }

  protected onDeath(): void {
    if (!this.services) return;
    const p1 = this.spriter.activePoints[1];
    const p0 = this.spriter.activePoints[0];
    const facing = Math.sign(this.spriter.scale.x) || 1;
    const off = (p?: { x: number; y: number }, fx = 15): [number, number] =>
      p ? [p.x * ENEMY_SCALE * facing, p.y * ENEMY_SCALE] : [fx * facing, -40];
    const [x1, y1] = off(p1, 15);
    const [x0, y0] = off(p0, -15);
    this.services.spawnChild('scoop1', this.x + x1, this.y + y1, this.xVel + rand(1, 4), -rand(3, 5));
    this.services.spawnChild('scoop2', this.x + x0, this.y + y0, this.xVel - rand(1, 4), -rand(5, 7));
  }
}

// ---------------------------------------------------------------------------
/**
 * Fries — flies in, flips upside-down, and periodically shakes out a homing
 * FryMissile. Body is harmless.
 */
class Fries extends Enemy {
  private goingOnScreen = true;
  private shootTimer = 1.1;

  spawnAt(x: number, y: number): void {
    super.spawnAt(x, y);
    this.flying = true;
    this.canDamage = false;
    this.play('move');
  }

  protected runAI(dt: number, _player: PlayerView): void {
    const t = this.type;
    if (this.goingOnScreen) {
      const cap = t.maxMovementSpeed / 2;
      this.xVel = Math.max(-cap, Math.min(cap, this.xVel + t.acceleration * (this.x < 400 ? 1 : -1)));
      if (this.y < 150) this.yVel = Math.min(cap, this.yVel + t.acceleration);
      else this.yVel = 0;
      if (this.x > 50 && this.x < 750 && this.y > 125) {
        this.goingOnScreen = false;
        this.xVel = 0;
        this.yVel = 0;
        this.spriter.playAnim('spin', 'upsidedown_idle', null, true);
        this.shootTimer = 1.1;
      }
      return;
    }

    this.xVel = 0;
    this.yVel = 0;
    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      this.shootTimer = rand(2.5, 4.0);
      if (!this.projectileDef || !this.services) return;
      this.spriter.playAnim('shake_fries', 'upsidedown_idle', null, true);
      audio.play('projectileShot', 0, 0.5);
      this.services.shoot(this.projectileDef, this.x, this.y - 30, 0, 1, { scale: 0.7, rotation: Math.PI / 2 });
    }
  }
}

// ---------------------------------------------------------------------------
/**
 * Stick (lollipop) — descends holding 3 candy balls, drops them as child
 * enemies one by one, then chases the player and stabs.
 */
class Stick extends Enemy {
  private onScreen = false;
  private ballsRemaining = 3;
  private stickEmpty = false;
  private stabbing = false;
  private dropTimer = 0.25;
  private dropping = false;

  spawnAt(x: number, y: number): void {
    super.spawnAt(x, y);
    this.flying = true;
    this.canDamage = false;
    this.faceOverride = x > 400 ? -1 : 1;
    this.play('idle');
  }

  protected pickDeathAnim(): string {
    return ['die_stick', 'die1', 'die2', 'die'][this.ballsRemaining] ?? 'die';
  }

  protected runAI(dt: number, player: PlayerView): void {
    const t = this.type;

    if (!this.onScreen) {
      this.yVel = Math.min(t.maxMovementSpeed, this.yVel + t.acceleration);
      if (this.y >= 110) {
        this.onScreen = true;
        this.yVel = 0;
      }
      return;
    }

    if (!this.stickEmpty) {
      this.xVel = 0;
      this.yVel = 0;
      if (this.dropping) return;
      this.dropTimer -= dt;
      if (this.dropTimer <= 0) this.dropBall();
      return;
    }

    // chase & stab
    if (this.y < player.y - 70) {
      this.yVel = Math.min(t.maxMovementSpeed, this.yVel + t.acceleration);
    } else {
      this.yVel = 0;
      const dx = player.x - this.x;
      if (Math.abs(dx) > 90) {
        this.xVel = Math.max(-t.maxMovementSpeed, Math.min(t.maxMovementSpeed, this.xVel + t.acceleration * Math.sign(dx)));
        this.faceOverride = Math.sign(dx) || 1;
      } else {
        this.xVel *= 0.8;
        if (!this.stabbing) this.stab();
      }
    }
  }

  private dropBall(): void {
    this.dropping = true;
    const anims = ['', 'drop1to0', 'drop2to1', 'drop3to2'];
    const idles = ['idle_stick', 'idle3', 'idle2', ''];
    const anim = anims[this.ballsRemaining];
    this.spriter.playAnim(anim, '', () => {
      if (!this.alive) return;
      this.ballsRemaining--;
      audio.play('pineapple_start', 0, 0.1);
      audio.play('spawnSomeone', 0, 0.5);
      const facing = this.faceOverride ?? 1;
      this.services?.spawnChild('ball', this.x + 190 * ENEMY_SCALE * facing, this.y, this.xVel + rand(2, 5) * facing, 1);
      this.play(idles[this.ballsRemaining + 1] || 'idle_stick');
      this.dropping = false;
      if (this.ballsRemaining > 0) {
        this.dropTimer = 0.5;
      } else {
        this.stickEmpty = true;
      }
    }, true);
  }

  private stab(): void {
    this.stabbing = true;
    this.canDamage = true;
    audio.play('woosh', 0, 0.7);
    this.spriter.playAnim('stick_stab', '', () => {
      this.play('idle_stick');
      this.stabbing = false;
      this.canDamage = false;
    }, true);
  }
}

// ---------------------------------------------------------------------------
/** Spawner (nuggetbox) — stationary, pumps out nugget enemies every ~1.35s. */
class Spawner extends Enemy {
  private spawnTimer = 1;
  private pendingSpawn = -1;

  spawnAt(x: number, y: number): void {
    super.spawnAt(x, y);
    this.canDamage = false;
    this.play('idle');
  }

  protected runAI(dt: number, _player: PlayerView): void {
    this.xVel *= 0.95;

    if (this.pendingSpawn >= 0) {
      this.pendingSpawn -= dt;
      if (this.pendingSpawn < 0) {
        audio.play('spawnSomeone', 0, 0.5);
        const dir = Math.sign(this.spriter.scale.x) || 1;
        this.services?.spawnChild('nugget', this.x, this.y - 50, rand(2, 5) * dir, -rand(3, 6));
      }
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.35;
      this.spriter.playAnim('spawnnugget', 'idle', null, true);
      this.pendingSpawn = 0.35;
    }
  }
}

// ---------------------------------------------------------------------------
/**
 * MiddleSlammer (donut, pizza) — spawned as a linked pair that flies together
 * and slams. Low difficulty: bounce apart, laugh, repeat. Difficulty >=3:
 * fuse into one (3x HP, slower) and chase the player.
 */
export class MiddleSlammer extends Enemy {
  partner: MiddleSlammer | null = null;
  slammingRight = false;

  private phase: 'wait' | 'fly' | 'together' | 'apart' | 'movingBack' | 'solo' | 'fused' = 'wait';
  private timer = 1;
  private together = false;

  spawnAt(x: number, y: number): void {
    super.spawnAt(x, y);
    this.flying = true;
    this.y = GROUND_Y - 60;
    this.phase = 'wait';
    this.timer = 1;
    this.play('idle');
  }

  protected onHurt(): void {
    if (this.together && this.spriter.hasAnim('together_hurt')) {
      this.spriter.playAnim('together_hurt', 'together_idle', null, true);
    }
  }

  protected pickDeathAnim(): string {
    return this.together && this.spriter.hasAnim('together_die') ? 'together_die' : 'die';
  }

  protected onDeath(): void {
    if (this.together && this.partner?.alive) {
      // slam pairs die together (original kills the partner too)
      this.partner.suicided = true;
      this.partner.hp = 0;
      this.partner.alive = false;
      this.partner.spriter.visible = false;
    }
    this.partner?.setPartnerDead();
  }

  setPartnerDead(): void {
    this.partner = null;
    if (this.alive && this.phase !== 'fused') {
      this.phase = 'solo';
      this.play('move');
    }
  }

  protected runAI(dt: number, player: PlayerView): void {
    const t = this.type;
    this.timer -= dt;

    switch (this.phase) {
      case 'wait':
        this.xVel *= 0.9;
        if (this.timer <= 0) {
          if (!this.partner?.alive) {
            this.phase = 'solo';
            break;
          }
          this.phase = 'fly';
          audio.play('pineapple_start', 0, 0.1);
          this.play('fly');
        }
        break;

      case 'fly': {
        if (!this.partner?.alive) {
          this.phase = 'solo';
          break;
        }
        const dir = this.slammingRight ? 1 : -1;
        this.xVel = Math.max(-t.maxMovementSpeed, Math.min(t.maxMovementSpeed, this.xVel + t.acceleration * dir));
        const met = this.slammingRight ? this.x >= this.partner.x - 10 : this.x <= this.partner.x + 10;
        if (met) {
          this.slamNow();
          this.partner.slamNow();
        }
        break;
      }

      case 'together':
        this.xVel = 0;
        if (this.timer <= 0 && !this.slammingRight) {
          if (t.difficulty >= 3) break; // fused branch handled in slamNow
          // break apart -> laugh -> separate
          this.spriter.playAnim('break', '', () => {
            if (!this.alive) return;
            this.together = false;
            audio.play('donut_laugh', 0, 0.7);
            this.play('laugh');
            this.xVel = 4;
            if (this.partner) {
              this.partner.together = false;
              this.partner.spriter.visible = true;
              this.partner.canDamage = true;
              this.partner.invincible = false;
              this.partner.play('laugh');
              this.partner.xVel = -4;
              this.partner.phase = 'apart';
              this.partner.timer = 2.1;
            }
            this.phase = 'apart';
            this.timer = 2.1;
          }, true);
          this.timer = Number.POSITIVE_INFINITY;
        }
        break;

      case 'apart':
        this.xVel *= 0.97;
        if (this.timer <= 0) {
          this.phase = 'movingBack';
          this.play('idle');
        }
        break;

      case 'movingBack': {
        const home = this.slammingRight ? 60 : 740;
        const dir = Math.sign(home - this.x);
        this.xVel = dir * (t.maxMovementSpeed / 3);
        if (Math.abs(this.x - home) < 14) {
          this.xVel = 0;
          this.phase = 'wait';
          this.timer = 1;
          this.play('idle');
        }
        break;
      }

      case 'solo':
        // partner died: simple patrol
        this.xVel = Math.max(-t.maxMovementSpeed / 2.5, Math.min(t.maxMovementSpeed / 2.5, this.xVel + t.acceleration * (this.movingLeft ? -1 : 1)));
        if (this.x > 720) this.movingLeft = true;
        if (this.x < 60) this.movingLeft = false;
        this.play('move');
        break;

      case 'fused': {
        // difficulty >=3: chase the player as one
        if (this.timer > 0) break;
        const dir = Math.sign(player.x - this.x) || 1;
        this.xVel = Math.max(-t.maxMovementSpeed / 2, Math.min(t.maxMovementSpeed / 2, this.xVel + (t.acceleration / 3) * dir));
        this.play(this.spriter.hasAnim('together_move') ? 'together_move' : 'move');
        break;
      }
    }
  }

  slamNow(): void {
    if (!this.alive) return;
    this.xVel = 0;
    this.together = true;
    audio.play('slam', 0, 0.7);
    this.services?.shake(3);
    this.spriter.playAnim('slam', 'together_idle', null, true);

    if (this.type.difficulty >= 3) {
      if (this.slammingRight) {
        // this half disappears into the fused one
        this.suicided = true;
        this.alive = false;
        this.canDamage = false;
        this.spriter.visible = false;
        this.partner?.becomeFused();
      } else if (this.phase !== 'fused') {
        // wait for becomeFused (call order between the pair varies)
        this.phase = 'together';
        this.timer = Number.POSITIVE_INFINITY;
      }
    } else {
      if (this.slammingRight) {
        // hidden inside the partner while together
        this.spriter.visible = false;
        this.canDamage = false;
        this.invincible = true;
      }
      this.phase = 'together';
      this.timer = 1;
    }
  }

  becomeFused(): void {
    this.partner = null;
    this.hp *= 3;
    this.phase = 'fused';
    this.timer = 0.7;
  }
}
