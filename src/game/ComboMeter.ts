/**
 * Kill-streak combo meter (adaptation of the original comboBar/COMBO_FILLER):
 * kills within a rolling window build the streak; score gets a multiplier
 * at tier thresholds; getting hit drops the streak.
 */
import { Container, Graphics, Text } from 'pixi.js';

const WINDOW = 3; // seconds to keep the streak alive after a kill
const TIERS: [number, number][] = [
  // [kills needed, score multiplier]
  [20, 3],
  [12, 2],
  [6, 1.5],
];

export class ComboMeter extends Container {
  private streak = 0;
  private timer = 0;
  private text: Text;
  private bar: Graphics;
  private pop = 0;

  constructor() {
    super();
    this.text = new Text({
      text: '',
      style: { fontFamily: 'Verdana', fontSize: 22, fill: 0xffe066, fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } },
    });
    this.text.anchor.set(1, 0);
    this.text.position.set(790, 32);
    this.bar = new Graphics();
    this.addChild(this.text, this.bar);
  }

  get count(): number {
    return this.streak;
  }

  get multiplier(): number {
    for (const [kills, mult] of TIERS) {
      if (this.streak >= kills) return mult;
    }
    return 1;
  }

  onKill(): void {
    this.streak++;
    this.timer = WINDOW;
    this.pop = 1;
  }

  /** player got hit — the streak breaks */
  reset(): void {
    this.streak = 0;
    this.timer = 0;
  }

  update(dt: number): void {
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) this.streak = 0;
    }
    this.pop = Math.max(0, this.pop - dt * 4);

    const show = this.streak >= 2;
    this.text.visible = this.bar.visible = show;
    if (!show) return;

    const mult = this.multiplier;
    this.text.text = mult > 1 ? `${this.streak} COMBO  x${mult}` : `${this.streak} COMBO`;
    this.text.style.fill = mult >= 3 ? 0xff5d5d : mult >= 2 ? 0xffa94d : mult > 1 ? 0xffe066 : 0xffffff;
    this.text.scale.set(1 + this.pop * 0.25);

    // streak window drain bar under the text
    this.bar.clear();
    this.bar.rect(790 - 120 * (this.timer / WINDOW), 58, 120 * (this.timer / WINDOW), 4).fill({ color: 0xffe066, alpha: 0.85 });
  }
}
