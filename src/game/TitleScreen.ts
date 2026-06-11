/**
 * Title flow, two screens (playtest: the old single screen drew a text logo
 * on top of the original title art = "two title screens stacked"):
 *  1. splash — the original MainTitleBG art (it contains the logo), PRESS ENTER
 *  2. setup  — level select + pick-2 spell loadout + start
 * All keyboard/gamepad driven; S opens the AP shop from either screen.
 */
import { Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { TextureMap } from '../assets/starlingAtlas';
import type { Input } from './Input';
import { SPELLS } from './Spells';
import type { SaveData } from './SaveData';

const SPELL_ORDER = ['freeze', 'ninjaRain', 'slash', 'growth', 'coin', 'magnet', 'time', 'akuma'];

export class TitleScreen extends Container {
  onStart: ((levelIndex: number, loadout: string[]) => void) | null = null;

  /** suppress all title input while an overlay (AP shop) is open */
  locked = false;

  selectedLevel = 0;
  loadout: string[];

  private mode: 'splash' | 'setup' = 'splash';
  private save: SaveData;
  private levelCount: number;
  private splashUI!: Container;
  private setupUI!: Container;
  private pressStart!: Text;
  private levelLabel!: Text;
  private spellIcons: { sprite: Sprite; ring: Graphics; id: string }[] = [];
  private statsLabel!: Text;
  private keyHandler: (e: KeyboardEvent) => void;
  private pulse = 0;

  constructor(save: SaveData, levelCount: number, effectsAtlas: TextureMap) {
    super();
    this.save = save;
    this.levelCount = levelCount;
    this.loadout = [...save.loadout];
    this.selectedLevel = save.furthestLevel;
    this.build(effectsAtlas);

    this.keyHandler = (e) => {
      if (!this.visible || this.locked) return;
      if (this.mode === 'splash') {
        if (e.code === 'Enter' || e.code === 'Space') this.showSetup();
        return;
      }
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.changeLevel(-1);
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.changeLevel(1);
      if (/^Digit[1-8]$/.test(e.code)) {
        this.toggleSpell(SPELL_ORDER[Number(e.code.slice(5)) - 1]);
      }
      if (e.code === 'Enter' || e.code === 'Space') this.start();
      if (e.code === 'Escape') this.showSplash();
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  /** poll gamepad nav each frame while visible */
  pollInput(input: Input): void {
    if (!this.visible || this.locked) return;
    this.pulse += 1 / 60;
    this.pressStart.alpha = 0.55 + 0.45 * Math.sin(this.pulse * 4);
    if (this.mode === 'splash') {
      if (input.justPressed('jump') || input.justPressed('pause') || input.justPressed('attack')) this.showSetup();
      return;
    }
    if (input.justPressed('left')) this.changeLevel(-1);
    if (input.justPressed('right')) this.changeLevel(1);
    if (input.justPressed('jump') || input.justPressed('pause')) this.start();
  }

  refresh(save: SaveData): void {
    this.save = save;
    this.selectedLevel = Math.min(this.selectedLevel, save.furthestLevel);
    this.updateLabels();
  }

  /** back to the splash art (used when returning from a run) */
  showSplash(): void {
    this.mode = 'splash';
    this.splashUI.visible = true;
    this.setupUI.visible = false;
  }

  private showSetup(): void {
    this.mode = 'setup';
    this.splashUI.visible = false;
    this.setupUI.visible = true;
    this.updateLabels();
  }

  private build(atlas: TextureMap): void {
    // original title art at full strength — it IS the title screen
    void Assets.load<Texture>('assets/textures/titleMenu/MainTitleBG.jpg').then((tex) => {
      const bg = new Sprite(tex);
      bg.width = 800;
      bg.height = 480;
      this.addChildAt(bg, 0);
    });

    // ---- splash ----
    this.splashUI = new Container();
    this.addChild(this.splashUI);

    const remake = new Text({
      text: 'the 5001 remake',
      style: { fontFamily: 'Verdana', fontSize: 14, fill: 0xffffff, stroke: { color: 0x000000, width: 4 } },
    });
    remake.anchor.set(0.5);
    remake.position.set(400, 300);
    this.splashUI.addChild(remake);

    this.pressStart = new Text({
      text: 'PRESS ENTER',
      style: { fontFamily: 'Verdana', fontSize: 26, fill: 0xffe066, fontWeight: 'bold', stroke: { color: 0x000000, width: 5 } },
    });
    this.pressStart.anchor.set(0.5);
    this.pressStart.position.set(400, 360);
    this.splashUI.addChild(this.pressStart);

    const splashHint = new Text({
      text: 'S: AP shop',
      style: { fontFamily: 'Verdana', fontSize: 12, fill: 0xdddddd, stroke: { color: 0x000000, width: 3 } },
    });
    splashHint.anchor.set(0.5);
    splashHint.position.set(400, 400);
    this.splashUI.addChild(splashHint);

    // ---- setup (level + loadout) ----
    this.setupUI = new Container();
    this.setupUI.visible = false;
    this.addChild(this.setupUI);

    const dim = new Graphics().rect(0, 0, 800, 480).fill({ color: 0x0d0d20, alpha: 0.88 });
    this.setupUI.addChild(dim);

    const header = new Text({
      text: 'CHOOSE YOUR HUNT',
      style: { fontFamily: 'Verdana', fontSize: 30, fill: 0xffe066, fontWeight: 'bold', stroke: { color: 0x000000, width: 5 } },
    });
    header.anchor.set(0.5);
    header.position.set(400, 80);
    this.setupUI.addChild(header);

    this.levelLabel = new Text({
      text: '',
      style: { fontFamily: 'Verdana', fontSize: 22, fill: 0xffffff, fontWeight: 'bold' },
    });
    this.levelLabel.anchor.set(0.5);
    this.levelLabel.position.set(400, 150);
    this.setupUI.addChild(this.levelLabel);

    const spellHint = new Text({
      text: 'spells (press 1-8 to pick two):',
      style: { fontFamily: 'Verdana', fontSize: 12, fill: 0xaaaaaa },
    });
    spellHint.anchor.set(0.5);
    spellHint.position.set(400, 215);
    this.setupUI.addChild(spellHint);

    SPELL_ORDER.forEach((id, i) => {
      const def = SPELLS[id];
      const x = 400 + (i - (SPELL_ORDER.length - 1) / 2) * 80;
      const ring = new Graphics();
      ring.position.set(x, 270);
      const sprite = new Sprite(atlas.get(def.icon));
      sprite.anchor.set(0.5);
      sprite.scale.set(0.85);
      sprite.position.set(x, 270);
      const num = new Text({ text: String(i + 1), style: { fontFamily: 'Verdana', fontSize: 11, fill: 0xffffff } });
      num.anchor.set(0.5);
      num.position.set(x, 312);
      this.setupUI.addChild(ring, sprite, num);
      this.spellIcons.push({ sprite, ring, id });
    });

    const startHint = new Text({
      text: 'ENTER / SPACE / (A) start  ·  ←→ level  ·  S: AP shop  ·  ESC back',
      style: { fontFamily: 'Verdana', fontSize: 13, fill: 0xdddddd },
    });
    startHint.anchor.set(0.5);
    startHint.position.set(400, 370);
    this.setupUI.addChild(startHint);

    const controlsHint = new Text({
      text: 'in game: move ←→ · jump SPACE · attack J · dash K · throw L · plunge ↓+J in air · spells Q/E · pause ESC',
      style: { fontFamily: 'Verdana', fontSize: 11, fill: 0x999999 },
    });
    controlsHint.anchor.set(0.5);
    controlsHint.position.set(400, 400);
    this.setupUI.addChild(controlsHint);

    this.statsLabel = new Text({
      text: '',
      style: { fontFamily: 'Verdana', fontSize: 12, fill: 0xffe066 },
    });
    this.statsLabel.anchor.set(0.5);
    this.statsLabel.position.set(400, 440);
    this.setupUI.addChild(this.statsLabel);

    this.updateLabels();
  }

  private changeLevel(dir: number): void {
    this.selectedLevel = Math.max(0, Math.min(this.save.furthestLevel, this.selectedLevel + dir));
    this.updateLabels();
  }

  private toggleSpell(id: string): void {
    if ((this.save.spells[id] ?? 0) < 1) return; // locked — unlock in the AP shop
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
    this.statsLabel.text = `best score ${this.save.bestScore}  ·  coins banked ${this.save.totalCoins}  ·  ${this.save.ap} AP`;
    for (const icon of this.spellIcons) {
      const unlocked = (this.save.spells[icon.id] ?? 0) >= 1;
      const picked = this.loadout.includes(icon.id);
      icon.sprite.alpha = !unlocked ? 0.12 : picked ? 1 : 0.35;
      icon.ring.clear();
      if (!unlocked) {
        icon.ring.circle(0, 0, 30).stroke({ color: 0x555555, width: 2 });
        icon.ring.moveTo(-21, -21).lineTo(21, 21).stroke({ color: 0x555555, width: 2 });
      } else if (picked) {
        icon.ring.circle(0, 0, 34).stroke({ color: 0xffe066, width: 3 });
      }
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keyHandler);
    super.destroy({ children: true });
  }
}
