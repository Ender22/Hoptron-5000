/**
 * Game-feel toolkit: screenshake, hitstop clock, and procedural particle
 * bursts (code-drawn — no art assets).
 */
import { Container, Graphics } from 'pixi.js';

export class ScreenShake {
  private amplitude = 0;
  private target: Container;

  constructor(target: Container) {
    this.target = target;
  }

  add(amount: number): void {
    this.amplitude = Math.min(14, this.amplitude + amount);
  }

  update(dt: number): void {
    if (this.amplitude > 0.2) {
      this.target.position.set((Math.random() - 0.5) * 2 * this.amplitude, (Math.random() - 0.5) * 2 * this.amplitude);
      this.amplitude *= Math.exp(-9 * dt);
    } else {
      this.amplitude = 0;
      this.target.position.set(0, 0);
    }
  }
}

/** world-freeze on impact: update(dt) returns true while frozen */
export class Hitstop {
  private timer = 0;

  freeze(seconds: number): void {
    this.timer = Math.max(this.timer, seconds);
  }

  update(dt: number): boolean {
    if (this.timer > 0) {
      this.timer -= dt;
      return true;
    }
    return false;
  }
}

interface BurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  age: number;
  life: number;
  color: number;
}

const DEATH_COLORS: Record<string, number> = {
  explosion_red: 0xff4444,
  explosion_yellow: 0xffd24d,
  explosion_purple: 0xc06bff,
  explosion_green: 0x6bff7f,
  explosion_orange: 0xff9a3d,
  explosion_blue: 0x5db9ff,
  explosion_white: 0xffffff,
  explosion_pink: 0xff7fc4,
};

export class ParticleBursts extends Graphics {
  private particles: BurstParticle[] = [];

  burst(x: number, y: number, deathPS: string, count = 16): void {
    const color = DEATH_COLORS[deathPS] ?? 0xffd24d;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      this.particles.push({
        x,
        y: y - 30,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        size: 3 + Math.random() * 6,
        age: 0,
        life: 0.4 + Math.random() * 0.4,
        color,
      });
    }
  }

  update(dt: number): void {
    this.clear();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.25; // gravity
      const t = 1 - p.age / p.life;
      this.circle(p.x, p.y, p.size * t).fill({ color: p.color, alpha: 0.9 * t });
    }
  }
}
