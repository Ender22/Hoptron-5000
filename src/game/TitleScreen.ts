/**
 * Title screen - level select (capped at furthest unlocked) and the
 * pick-2 spell loadout, all keyboard/gamepad driven.
 * Layout: <- -> level · 1-4 toggle spells · Enter/Space/jump to start.
 */
import { Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { TextureMap } from '../assets/starlingAtlas';
import type { Input } from './Input';
import { SPELLS } from './Spells';
import type { SaveData } from './SaveData';

const SPELL_ORDER = ['freeze', 'ninjaRain', 'slash', 'growth'];

export class TitleScreen extends Container {
  onStart: ((levelIndex: number, loadout: string[]) => void) | null = null;

  selectedLevel = 0;
  loadout: string[];

  private save: SaveData;
  private levelCount: number;
  private levelLabel!: Text;
  private spellIcons: { sprite: Sprite; ring: Graphics; id: string }[] = [];
  private statsLabel!: Text;
  private keyHandler: (e: KeyboardEvent) => void;

  constructor(save: SaveData, levelCount: number, effectsAtlas: TextureMap) {
    super();
    this.save = save;
    this.levelCount = levelCount;
    this.loadout = [...save.loadout];
    this.selectedLevel = save.furthestLevel;
    this.build(effectsAtlas);

    this.keyHandler = (e) => {
      if (!this.visible) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.changeLevel(-1);
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.changeLevel(1);
      if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
        this.toggleSpell(SPELL_ORDER[Number(e.code.slice(5)) - 1]);
      }
      if (e.code === 'Enter' || e.code === 'Space') this.start();
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  /** poll gamepad nav each frame while visible */
  pollInput(input: Input): void {
    if (!this.visible) return;
    if (input.justPressed('left')) this.changeLevel(-1);
    if (input.justPressed('right')) this.changeLevel(1);
    if (input.justPressed('jump') || input.justPressed('pause')) this.start();
  }

  refresh(save: SaveData): void {
    this.save = save;
    this.selectedLevel = Math.min(this.selectedLevel, save.furthestLevel);
    this.updateLabels();
  }

  private build(atlas: TextureMap): void {
    const dim = new Graphics().rect(0, 0, 800, 480).fill({ color: 0x0d0d20, alpha: 0.88 });
    this.addChild(dim);

    void Assets.load<Texture>('assets/textures/titleMenu/MainTitleBG.jpg').then((tex) => {
      const bg = new Sprite(tex);
      bg.width = 800;
      bg.height = 480;
      bg.alpha = 0.45;
      this.addChildAt(bg, 0);
    });

    const title = new Text({
      text: 'HOPTRON 5001',
      style: { fontFamily: 'Verdana', fontSize: 52, fill: 0xffe066, fontWeight: 'bold', stroke: { color: 0x000000, width: 6 } },
    });
    title.anchor.set(0.5);
    title.position.set(400, 110);
    this.addChild(title);

    const subtitle = new Text({
      text: 'a samurai robot bunny remake',
      style: { fontFamily: 'Verdana', fontSize: 14, fill: 0xcccccc },
    });
    subtitle.anchor.set(0.5);
    subtitle.position.set(400, 150);
    this.addChild(subtitle);

    this.levelLabel = new Text({
      text: '',
      style: { fontFamily: 'Verdana', fontSize: 22, fill: 0xffffff, fontWeight: 'bold' },
    });
    this.levelLabel.anchor.set(0.5);
    this.levelLabel.position.set(400, 220);
    this.addChild(this.levelLabel);

    const spellHint = new Text({
      text: 'spells (press 1-4 to pick two):',
      style: { fontFamily: 'Verdana', fontSize: 12, fill: 0xaaaaaa },
    });
    spellHint.anchor.set(0.5);
    spellHint.position.set(400, 270);
    this.addChild(spellHint);

    SPELL_ORDER.forEach((id, i) => {
      const def = SPELLS[id];
      const x = 400 + (i - (SPELL_ORDER.length - 1) / 2) * 80;
      const ring = new Graphics();
      ring.position.set(x, 320);
      const sprite = new Sprite(atlas.get(def.icon));
      sprite.anchor.set(0.5);
      sprite.scale.set(0.85);
      sprite.position.set(x, 320);
      const num = new Text({ text: String(i + 1), style: { fontFamily: 'Verdana', fontSize: 11, fill: 0xffffff } });
      num.anchor.set(0.5);
      num.position.set(x, 360);
      this.addChild(ring, sprite, num);
      this.spellIcons.push({ sprite, ring, id });
    });

    const startHint = new Text({
      text: 'ENTER / SPACE / (A) to start  ·  in game: move ←→  jump SPACE  attack J  dash K  throw L  spells Q/E',
      style: { fontFamily: 'Verdana', fontSize: 12, fill: 0xdddddd },
    });
    startHint.anchor.set(0.5);
    startHint.position.set(400, 410);
    this.addChild(startHint);

    this.statsLabel = new Text({
      text: '',
      style: { fontFamily: 'Verdana', fontSize: 12, fill: 0xffe066 },
    });
    this.statsLabel.anchor.set(0.5);
    this.statsLabel.position.set(400, 440);
    this.addChild(this.statsLabel);

    this.updateLabels();
  }

  private changeLevel(dir: number): void {
    this.selectedLevel = Math.max(0, Math.min(this.save.furthestLevel, this.selectedLevel + dir));
    this.updateLabels();
  }

  private toggleSpell(id: string): void {
    if (this.loadout.includes(id)) {
      if (this.loadout.length > 1) this.loadout = this.loadout.filter((s) => s !== id);
    } else {
      this.loadout = [...this.loadout, id].slice(-2);
    }
    this.updateLabels();
  }

  private start(): void {
    if (this.loadout.length !== 2) return;
    this.onStart?.(this.selectedLevel, [...this.loadout]);
  }

  private updateLabels(): void {
    const max = this.save.furthestLevel;
    const left = this.selectedLevel > 0 ? '◀ ' : '   ';
    const right = this.selectedLevel < max ? ' ▶' : '   ';
    this.levelLabel.text = `${left}Level ${this.selectedLevel + 1}${right}   (unlocked: ${max + 1})`;
    this.statsLabel.text = `best score ${this.save.bestScore}  ·  coins banked ${this.save.totalCoins}`;
    for (const icon of this.spellIcons) {
      const picked = this.loadout.includes(icon.id);
      icon.sprite.alpha = picked ? 1 : 0.35;
      icon.ring.clear();
      if (picked) icon.ring.circle(0, 0, 34).stroke({ color: 0xffe066, width: 3 });
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keyHandler);
    super.destroy({ children: true });
  }
}
