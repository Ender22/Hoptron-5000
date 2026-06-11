/**
 * Achievements — original Achievements.xml (46 entries) + AchievementHolder
 * toast behavior. Progress persists in the save; rewards pay out AP.
 * Boss-specific trick achievements that need per-boss hooks stay dormant
 * until those hooks exist (their progress simply never advances).
 */
import { Container, Graphics, Text } from 'pixi.js';
import { audio } from './Audio';

export interface AchievementDef {
  id: string;
  type: 'progress' | 'instant';
  name: string;
  endValue: number;
  description: string;
  reward: number; // AP
}

export async function loadAchievements(url = 'data/Achievements.xml'): Promise<AchievementDef[]> {
  const xml = new DOMParser().parseFromString(await (await fetch(url)).text(), 'application/xml');
  return Array.from(xml.querySelectorAll('achievement')).map((el) => {
    const text = (tag: string) => el.querySelector(tag)?.textContent?.trim() ?? '';
    return {
      id: text('id'),
      type: text('type') === 'progress' ? 'progress' : 'instant',
      name: text('name'),
      endValue: Number(text('endValue')) || 1,
      description: text('description'),
      reward: Number(text('reward')) || 0,
    };
  });
}

interface Toast {
  def: AchievementDef;
  age: number;
}

const TOAST_TIME = 3.4;

export class AchievementSystem extends Container {
  /** unlock reward payout (AP) — Game banks it */
  onReward: ((ap: number) => void) | null = null;
  /** persistence — Game writes the save */
  onProgress: ((id: string, value: number) => void) | null = null;

  private defs = new Map<string, AchievementDef>();
  private progressMap: Record<string, number>;
  private toasts: Toast[] = [];
  private box: Graphics;
  private nameText: Text;
  private descText: Text;

  constructor(defs: AchievementDef[], saved: Record<string, number>) {
    super();
    for (const def of defs) this.defs.set(def.id, def);
    this.progressMap = saved;

    this.box = new Graphics();
    this.nameText = new Text({
      text: '',
      style: { fontFamily: 'Verdana', fontSize: 15, fill: 0xffe066, fontWeight: 'bold' },
    });
    this.nameText.anchor.set(0.5, 0);
    this.nameText.position.set(400, 14);
    this.descText = new Text({
      text: '',
      style: { fontFamily: 'Verdana', fontSize: 11, fill: 0xdddddd },
    });
    this.descText.anchor.set(0.5, 0);
    this.descText.position.set(400, 36);
    this.addChild(this.box, this.nameText, this.descText);
    this.visible = false;
  }

  isDone(id: string): boolean {
    const def = this.defs.get(id);
    return !!def && (this.progressMap[id] ?? 0) >= def.endValue;
  }

  /** cumulative progress (kills, coins, dodges) */
  bump(id: string, amount = 1): void {
    this.setProgress(id, (this.progressMap[id] ?? 0) + amount);
  }

  /** high-water-mark progress (score, streaks) */
  best(id: string, value: number): void {
    if (value > (this.progressMap[id] ?? 0)) this.setProgress(id, value);
  }

  /** boolean trick achievements */
  unlock(id: string): void {
    const def = this.defs.get(id);
    if (def) this.setProgress(id, def.endValue);
  }

  private setProgress(id: string, value: number): void {
    const def = this.defs.get(id);
    if (!def || this.isDone(id)) return;
    this.progressMap[id] = value;
    this.onProgress?.(id, value);
    if (value >= def.endValue) {
      this.toasts.push({ def, age: 0 });
      this.onReward?.(def.reward);
    }
  }

  update(dt: number): void {
    const toast = this.toasts[0];
    if (!toast) {
      this.visible = false;
      return;
    }
    if (toast.age === 0) audio.play('achievement_complete', 0, 0.8);
    toast.age += dt;
    if (toast.age >= TOAST_TIME) {
      this.toasts.shift();
      return;
    }
    this.visible = true;
    // slide down, hold, slide back up
    const t = toast.age;
    const slide = t < 0.3 ? t / 0.3 : t > TOAST_TIME - 0.4 ? Math.max(0, (TOAST_TIME - t) / 0.4) : 1;
    this.y = -64 + slide * 64;
    this.nameText.text = `ACHIEVEMENT — ${toast.def.name}  (+${toast.def.reward} AP)`;
    this.descText.text = toast.def.description;
    this.box.clear();
    this.box.roundRect(180, 6, 440, 50, 8).fill({ color: 0x0d1226, alpha: 0.92 }).stroke({ color: 0xffe066, width: 2 });
  }
}
