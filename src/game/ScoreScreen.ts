/**
 * Post-level score tally (original gotoScoreScreen): kills / score / AP
 * earned with count-up animations, record callouts, continue on input.
 */
import { Container, Graphics, Text } from 'pixi.js';
import { audio } from './Audio';
import type { Input } from './Input';

export interface LevelTally {
  levelNumber: number; // 1-based, for the header
  kills: number;
  score: number;
  apEarned: number;
  newBestScore: boolean;
  finalLevel: boolean;
  /** run ended in death: header + controls change (retry instead of continue) */
  death?: boolean;
}

const COUNT_TIME = 0.7; // seconds per line
const LINE_STAGGER = 0.45;

export class ScoreScreen extends Container {
  onContinue: (() => void) | null = null;

  private header!: Text;
  private lines: { label: Text; value: Text; target: number }[] = [];
  private recordText!: Text;
  private continueText!: Text;
  private tally: LevelTally | null = null;
  private elapsed = 0;
  private recordPlayed = false;

  constructor() {
    super();
    this.visible = false;
    this.build();
  }

  private build(): void {
    const dim = new Graphics().rect(0, 0, 800, 480).fill({ color: 0x0a0c14, alpha: 0.78 });
    this.addChild(dim);

    this.header = new Text({
      text: '',
      style: { fontFamily: 'Verdana', fontSize: 34, fill: 0xffe066, fontWeight: 'bold', stroke: { color: 0x000000, width: 5 } },
    });
    this.header.anchor.set(0.5);
    this.header.position.set(400, 110);
    this.addChild(this.header);

    const labels = ['KILLS', 'SCORE', 'AWESOMENESS'];
    labels.forEach((text, i) => {
      const label = new Text({
        text,
        style: { fontFamily: 'Verdana', fontSize: 18, fill: 0xaaaaaa, fontWeight: 'bold' },
      });
      label.anchor.set(1, 0.5);
      label.position.set(390, 190 + i * 52);
      const value = new Text({
        text: '',
        style: { fontFamily: 'Verdana', fontSize: 24, fill: 0xffffff, fontWeight: 'bold' },
      });
      value.anchor.set(0, 0.5);
      value.position.set(420, 190 + i * 52);
      this.addChild(label, value);
      this.lines.push({ label, value, target: 0 });
    });

    this.recordText = new Text({
      text: 'NEW RECORD!',
      style: { fontFamily: 'Verdana', fontSize: 20, fill: 0xff5d5d, fontWeight: 'bold' },
    });
    this.recordText.anchor.set(0.5);
    this.recordText.position.set(400, 360);
    this.addChild(this.recordText);

    this.continueText = new Text({
      text: 'JUMP / ENTER to continue',
      style: { fontFamily: 'Verdana', fontSize: 14, fill: 0xdddddd },
    });
    this.continueText.anchor.set(0.5);
    this.continueText.position.set(400, 420);
    this.addChild(this.continueText);
  }

  show(tally: LevelTally): void {
    this.tally = tally;
    this.elapsed = 0;
    this.recordPlayed = false;
    this.header.text = tally.death ? 'YOU DIED' : tally.finalLevel ? 'GAME COMPLETE!' : `LEVEL ${tally.levelNumber} CLEAR!`;
    this.header.style.fill = tally.death ? 0xff5555 : 0xffe066;
    this.continueText.text = tally.death
      ? 'JUMP: retry  ·  T: title  ·  S: spend AP in the shop'
      : 'JUMP / ENTER: continue  ·  S: spend AP in the shop';
    this.lines[0].target = tally.kills;
    this.lines[1].target = tally.score;
    this.lines[2].target = tally.apEarned;
    for (const line of this.lines) line.value.text = '0';
    this.lines[2].value.text = '+0 AP';
    this.recordText.visible = false;
    this.continueText.visible = false;
    this.visible = true;
  }

  /** count-ups; returns nothing — Game keeps simulating the world behind it */
  update(dt: number): void {
    if (!this.visible || !this.tally) return;
    this.elapsed += dt;

    this.lines.forEach((line, i) => {
      const t = Math.max(0, Math.min(1, (this.elapsed - i * LINE_STAGGER) / COUNT_TIME));
      const v = Math.round(line.target * (1 - (1 - t) ** 2));
      line.value.text = i === 2 ? `+${v} AP` : String(v);
    });

    const done = this.elapsed > 2 * LINE_STAGGER + COUNT_TIME;
    if (done) {
      this.continueText.visible = true;
      this.continueText.alpha = 0.6 + 0.4 * Math.sin(this.elapsed * 5);
      if (this.tally.newBestScore) {
        this.recordText.visible = true;
        this.recordText.scale.set(1 + 0.05 * Math.sin(this.elapsed * 7));
        if (!this.recordPlayed) {
          this.recordPlayed = true;
          audio.play('new_record');
        }
      }
    }
  }

  pollInput(input: Input): void {
    if (!this.visible || !this.tally) return;
    const done = this.elapsed > 2 * LINE_STAGGER + COUNT_TIME;
    if (input.justPressed('jump') || input.justPressed('attack') || input.justPressed('pause')) {
      if (!done) {
        // skip straight to the totals
        this.elapsed = 2 * LINE_STAGGER + COUNT_TIME + 0.01;
        return;
      }
      this.visible = false;
      this.tally = null;
      this.onContinue?.();
    }
  }
}
