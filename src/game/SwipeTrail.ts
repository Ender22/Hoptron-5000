/**
 * Procedural sword swipe trail — no art assets, pure math.
 *
 * Samples the live blade segment (hilt→tip) each fixed tick and renders a
 * fading ribbon between consecutive samples. Brightness scales with tip
 * speed, so the trail naturally appears during the fast part of a swing
 * and vanishes during anticipation/recovery (a standard "sword trail"
 * best practice). Rendered in two additive passes: a wide colored glow
 * and a thin white-hot core.
 */
import { Graphics, Point } from 'pixi.js';

interface TrailSample {
  hiltX: number;
  hiltY: number;
  tipX: number;
  tipY: number;
  age: number;
  /** 0..1 — derived from tip speed at sample time */
  strength: number;
}

const LIFETIME = 0.16; // seconds a sample stays visible
const MIN_TIP_SPEED = 6; // px/tick below which no trail is emitted
const FULL_TIP_SPEED = 30; // px/tick at which the trail is at max strength

export class SwipeTrail extends Graphics {
  glowColor = 0x66ccff;

  private samples: TrailSample[] = [];
  private lastTip: Point | null = null;

  /** call every fixed tick with the blade segment in this object's parent space */
  addSample(hilt: Point, tip: Point): void {
    let strength = 0;
    if (this.lastTip) {
      const speed = Math.hypot(tip.x - this.lastTip.x, tip.y - this.lastTip.y);
      strength = Math.min(1, Math.max(0, (speed - MIN_TIP_SPEED) / (FULL_TIP_SPEED - MIN_TIP_SPEED)));
    }
    this.lastTip = new Point(tip.x, tip.y);
    this.samples.push({ hiltX: hilt.x, hiltY: hilt.y, tipX: tip.x, tipY: tip.y, age: 0, strength });
  }

  /** call when the blade is sheathed/invisible so stale segments don't connect */
  break_(): void {
    this.lastTip = null;
  }

  update(dt: number): void {
    for (const s of this.samples) s.age += dt;
    this.samples = this.samples.filter((s) => s.age < LIFETIME);
    this.redraw();
  }

  private redraw(): void {
    this.clear();
    this.blendMode = 'add';

    for (let i = 1; i < this.samples.length; i++) {
      const a = this.samples[i - 1];
      const b = this.samples[i];
      const strength = Math.min(a.strength, b.strength);
      if (strength <= 0) continue;

      const fade = 1 - b.age / LIFETIME;
      const alpha = strength * fade;

      // wide glow ribbon: hilt->tip quad between consecutive samples
      this.poly([a.hiltX, a.hiltY, a.tipX, a.tipY, b.tipX, b.tipY, b.hiltX, b.hiltY]).fill({
        color: this.glowColor,
        alpha: alpha * 0.35,
      });

      // hot core: thin ribbon along the outer half of the blade
      const aMidX = a.hiltX + (a.tipX - a.hiltX) * 0.45;
      const aMidY = a.hiltY + (a.tipY - a.hiltY) * 0.45;
      const bMidX = b.hiltX + (b.tipX - b.hiltX) * 0.45;
      const bMidY = b.hiltY + (b.tipY - b.hiltY) * 0.45;
      this.poly([aMidX, aMidY, a.tipX, a.tipY, b.tipX, b.tipY, bMidX, bMidY]).fill({
        color: 0xffffff,
        alpha: alpha * 0.55,
      });
    }
  }
}
