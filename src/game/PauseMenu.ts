/**
 * Pause menu (original pause overlay, LevelBase 11682-11906 simplified):
 * resume / restart / quit to title + music & sfx mute toggles persisted
 * to the save. Esc or Start toggles; world sim freezes while open.
 */
import { Container, Graphics, Text } from 'pixi.js';
import { audio } from './Audio';
import type { Input } from './Input';
import { writeSave, type SaveData } from './SaveData';

type ItemId = 'resume' | 'restart' | 'title' | 'music' | 'sfx';

const ITEMS: { id: ItemId; label: (save: SaveData) => string }[] = [
  { id: 'resume', label: () => 'RESUME' },
  { id: 'restart', label: () => 'RESTART LEVEL' },
  { id: 'title', label: () => 'QUIT TO TITLE' },
  { id: 'music', label: (s) => `MUSIC: ${s.musicMuted ? 'OFF' : 'ON'}` },
  { id: 'sfx', label: (s) => `SOUND FX: ${s.sfxMuted ? 'OFF' : 'ON'}` },
];

export class PauseMenu extends Container {
  onRestart: (() => void) | null = null;
  onQuit: (() => void) | null = null;

  private save: SaveData;
  private labels: Text[] = [];
  private selected = 0;

  constructor(save: SaveData) {
    super();
    this.save = save;
    this.visible = false;

    const dim = new Graphics().rect(0, 0, 800, 480).fill({ color: 0x0a0c14, alpha: 0.8 });
    this.addChild(dim);

    const title = new Text({
      text: 'PAUSED',
      style: { fontFamily: 'Verdana', fontSize: 38, fill: 0xffe066, fontWeight: 'bold', stroke: { color: 0x000000, width: 5 } },
    });
    title.anchor.set(0.5);
    title.position.set(400, 105);
    this.addChild(title);

    ITEMS.forEach((item, i) => {
      const label = new Text({
        text: item.label(save),
        style: { fontFamily: 'Verdana', fontSize: 20, fill: 0xffffff, fontWeight: 'bold' },
      });
      label.anchor.set(0.5);
      label.position.set(400, 175 + i * 44);
      this.addChild(label);
      this.labels.push(label);
    });

    const hint = new Text({
      text: '← → select  ·  ATTACK (J) / JUMP confirm  ·  ESC resume',
      style: { fontFamily: 'Verdana', fontSize: 12, fill: 0xcccccc },
    });
    hint.anchor.set(0.5);
    hint.position.set(400, 420);
    this.addChild(hint);
  }

  open(): void {
    this.selected = 0;
    this.refresh();
    this.visible = true;
  }

  private refresh(): void {
    ITEMS.forEach((item, i) => {
      const label = this.labels[i];
      label.text = item.label(this.save);
      label.style.fill = i === this.selected ? 0xffe066 : 0xffffff;
      label.scale.set(i === this.selected ? 1.12 : 1);
    });
  }

  private activate(): void {
    switch (ITEMS[this.selected].id) {
      case 'resume':
        this.visible = false;
        break;
      case 'restart':
        this.visible = false;
        this.onRestart?.();
        break;
      case 'title':
        this.visible = false;
        this.onQuit?.();
        break;
      case 'music':
        this.save.musicMuted = !this.save.musicMuted;
        audio.musicMuted = this.save.musicMuted;
        writeSave(this.save);
        this.refresh();
        break;
      case 'sfx':
        this.save.sfxMuted = !this.save.sfxMuted;
        audio.sfxMuted = this.save.sfxMuted;
        writeSave(this.save);
        this.refresh();
        break;
    }
  }

  pollInput(input: Input): void {
    if (!this.visible) return;
    if (input.justPressed('left') || input.justPressed('throw')) {
      this.selected = (this.selected + ITEMS.length - 1) % ITEMS.length;
      this.refresh();
    }
    if (input.justPressed('right') || input.justPressed('down')) {
      this.selected = (this.selected + 1) % ITEMS.length;
      this.refresh();
    }
    if (input.justPressed('attack') || input.justPressed('jump')) this.activate();
    if (input.justPressed('pause')) this.visible = false;
  }
}
