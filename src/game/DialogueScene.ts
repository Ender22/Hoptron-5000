/**
 * Between-level dialogue scenes — condensed port of SceneManager.as playing
 * public/data/Scenes.xml. Typewriter text with per-letter voice blips,
 * tap to speed up / advance, talk icons that pop in per speaker, voice
 * lines + scene sounds/music, auto-advance actions. Esc skips the scene.
 *
 * NOT ported (fidelity follow-ups, see notes/phase-f-spec.md): the Magic
 * Man / bunny stage actors and their animation actions, burrito/cake/steal
 * trigger sequences, the final-zone scene chain, intro and credits.
 */
import { Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { audio } from './Audio';
import type { Input } from './Input';

interface SceneLine {
  speaker: 'hoptron' | 'magicMan';
  text: string;
  voice: string;
  cusVar: string;
}

interface SceneAction {
  delay: number;
  continueTime: number;
  line: SceneLine | null;
  sounds: string[];
  music: string | null;
  stopMusic: boolean;
  normalMusic: boolean;
  triggers: string[];
}

export interface SceneDef {
  id: string;
  actions: SceneAction[];
}

function parseScene(el: Element): SceneDef {
  const actions: SceneAction[] = [];
  for (const a of Array.from(el.querySelectorAll(':scope > action'))) {
    const lineEl = a.querySelector(':scope > hoptron') ?? a.querySelector(':scope > magicMan');
    actions.push({
      delay: Number(a.getAttribute('delay')) || 0,
      continueTime: Number(a.getAttribute('continueTime')) || 0,
      line: lineEl
        ? {
            speaker: lineEl.tagName === 'hoptron' ? 'hoptron' : 'magicMan',
            text: lineEl.textContent?.trim() ?? '',
            voice: lineEl.getAttribute('voice')?.trim() ?? '',
            cusVar: lineEl.getAttribute('cus_var')?.trim() ?? '',
          }
        : null,
      sounds: Array.from(a.querySelectorAll(':scope > sound')).map((s) => s.textContent?.trim() ?? ''),
      music: a.querySelector(':scope > music')?.textContent?.trim() ?? null,
      stopMusic: a.querySelector(':scope > stopmusic') != null,
      normalMusic: a.querySelector(':scope > normalmusic') != null,
      triggers: Array.from(a.querySelectorAll(':scope > trigger')).map((t) => t.textContent?.trim() ?? ''),
    });
  }
  return { id: el.getAttribute('id') ?? '', actions };
}

export async function loadScenes(url = 'data/Scenes.xml'): Promise<{ main: SceneDef[]; extra: SceneDef[] }> {
  const xml = new DOMParser().parseFromString(await (await fetch(url)).text(), 'application/xml');
  return {
    main: Array.from(xml.querySelectorAll('MAIN_SCENES > scene')).map(parseScene),
    extra: Array.from(xml.querySelectorAll('EXTRA_SCENES > scene')).map(parseScene),
  };
}

const LETTER_TIME = 0.015; // original DelayedCall interval
const TEXTURE_DIR = 'assets/textures/';

export class DialogueScene extends Container {
  onFinished: (() => void) | null = null;
  /** Game blurs/unblurs the world behind the scene */
  onBlur: ((blurred: boolean) => void) | null = null;

  private scene: SceneDef | null = null;
  private actionIndex = -1;
  private deaths = 0;

  private state: 'idle' | 'delay' | 'typing' | 'waiting' = 'idle';
  private timer = 0;
  private autoTimer = 0; // continueTime countdown (0 = tap to advance)
  private skipLocked = false; // disableContinuePress (farts are unskippable)
  private revealed = 0;
  private fullText = '';

  private bubbleLeft!: Sprite;
  private bubbleRight!: Sprite;
  private iconLeft!: Sprite;
  private iconRight!: Sprite;
  private textLeft!: Text;
  private textRight!: Text;
  private hint!: Text;
  private iconPop = 0;
  private loaded = false;

  constructor() {
    super();
    this.visible = false;
  }

  /** lazy-load the talk textures on first use */
  private async ensureBuilt(): Promise<void> {
    if (this.loaded) return;
    const [bgL, bgR, icoL, icoR] = await Promise.all([
      Assets.load<Texture>(`${TEXTURE_DIR}BigTalkBG9.png`),
      Assets.load<Texture>(`${TEXTURE_DIR}BigTalk2BG9.png`),
      Assets.load<Texture>(`${TEXTURE_DIR}talkicon_Hoptron.png`),
      Assets.load<Texture>(`${TEXTURE_DIR}talkicon_MM.png`),
    ]);
    const shade = new Graphics().rect(0, 0, 800, 480).fill({ color: 0x000000, alpha: 0.25 });
    this.addChild(shade);

    this.bubbleLeft = new Sprite(bgL);
    this.bubbleRight = new Sprite(bgR);
    for (const b of [this.bubbleLeft, this.bubbleRight]) {
      b.position.set(0, 350);
      b.width = 800;
      b.height = 130;
      this.addChild(b);
    }
    this.iconLeft = new Sprite(icoL);
    this.iconLeft.anchor.set(0.5);
    this.iconLeft.position.set(50, 415);
    this.iconRight = new Sprite(icoR);
    this.iconRight.anchor.set(0.5);
    this.iconRight.position.set(750, 415);
    const style = { fontFamily: 'Verdana', fontSize: 17, fill: 0xffffff, wordWrap: true, wordWrapWidth: 540 } as const;
    this.textLeft = new Text({ text: '', style: { ...style } });
    this.textLeft.position.set(140, 368);
    this.textRight = new Text({ text: '', style: { ...style } });
    this.textRight.position.set(150, 368);
    this.hint = new Text({
      text: 'J / SPACE: next  ·  ESC: skip scene',
      style: { fontFamily: 'Verdana', fontSize: 10, fill: 0x999999 },
    });
    this.hint.anchor.set(1, 0);
    this.hint.position.set(795, 463);
    this.addChild(this.iconLeft, this.iconRight, this.textLeft, this.textRight, this.hint);
    this.loaded = true;
  }

  get active(): boolean {
    return this.scene !== null;
  }

  async play(scene: SceneDef, deaths: number): Promise<void> {
    await this.ensureBuilt();
    this.scene = scene;
    this.deaths = deaths;
    this.actionIndex = -1;
    this.skipLocked = false;
    this.visible = true;
    this.onBlur?.(true);
    this.clearSpeakers();
    this.advance();
  }

  private clearSpeakers(): void {
    this.bubbleLeft.visible = this.bubbleRight.visible = false;
    this.iconLeft.visible = this.iconRight.visible = false;
    this.textLeft.text = this.textRight.text = '';
  }

  private finish(): void {
    if (!this.cancelInternal()) return;
    this.onFinished?.();
  }

  /** abort without firing onFinished (level switched out from under the scene) */
  cancel(): void {
    this.cancelInternal();
  }

  private cancelInternal(): boolean {
    if (!this.scene) return false;
    this.scene = null;
    this.state = 'idle';
    this.visible = false;
    audio.stopFxMusic();
    this.onBlur?.(false);
    return true;
  }

  private advance(): void {
    if (!this.scene) return;
    this.actionIndex++;
    const action = this.scene.actions[this.actionIndex];
    if (!action) {
      this.finish();
      return;
    }
    if (action.delay > 0) {
      this.state = 'delay';
      this.timer = action.delay;
      return;
    }
    this.processAction(action);
  }

  private processAction(action: SceneAction): void {
    for (const t of action.triggers) {
      if (t === 'disableContinuePress') this.skipLocked = true;
      // BlurBG/TweenInTalkSequence are implicit in play(); stage-actor triggers are not ported
    }
    for (const s of action.sounds) audio.play(s, 0, 0.9);
    if (action.stopMusic) {
      audio.stopMusic(0.8);
      audio.stopFxMusic();
    }
    if (action.music) audio.playFxAsMusic(action.music);
    if (action.normalMusic) audio.stopFxMusic();

    this.autoTimer = action.continueTime;

    if (action.line) {
      const line = action.line;
      this.fullText = line.cusVar === 'deaths' ? line.text.replace('$$', String(this.deaths)) : line.text;
      this.revealed = 0;
      this.timer = 0;
      this.state = 'typing';
      this.iconPop = 0;
      const left = line.speaker === 'hoptron';
      this.bubbleLeft.visible = left;
      this.bubbleRight.visible = !left;
      this.iconLeft.visible = left;
      this.iconRight.visible = !left;
      this.textLeft.text = this.textRight.text = '';
      if (line.voice) audio.play(line.voice, 0, 1);
    } else {
      this.state = 'waiting';
      // action with no text and no timer would deadlock — nudge it along
      if (this.autoTimer <= 0) this.autoTimer = 0.1;
    }
  }

  private get activeText(): Text {
    return this.bubbleLeft.visible ? this.textLeft : this.textRight;
  }

  private completeTyping(): void {
    this.revealed = this.fullText.length;
    this.activeText.text = this.fullText;
    this.state = 'waiting';
  }

  update(dt: number): void {
    if (!this.scene) return;

    this.iconPop = Math.min(1, this.iconPop + dt * 5);
    const pop = 0.5 + 0.5 * this.iconPop;
    if (this.iconLeft.visible) this.iconLeft.scale.set(pop);
    if (this.iconRight.visible) this.iconRight.scale.set(pop);

    if (this.state === 'delay') {
      this.timer -= dt;
      if (this.timer <= 0) {
        const action = this.scene.actions[this.actionIndex];
        if (action) this.processAction(action);
      }
      return;
    }

    if (this.state === 'typing') {
      this.timer += dt;
      const target = Math.min(this.fullText.length, Math.floor(this.timer / LETTER_TIME));
      if (target > this.revealed) {
        // letter blips every other character to keep the spam musical
        if (target % 2 === 0) {
          audio.play(this.bubbleLeft.visible ? 'bunny_letter' : 'mm_letter', 0, 0.4);
        }
        this.revealed = target;
        this.activeText.text = this.fullText.slice(0, this.revealed);
      }
      if (this.revealed >= this.fullText.length) this.state = 'waiting';
      return;
    }

    if (this.state === 'waiting' && this.autoTimer > 0) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0) {
        this.skipLocked = false;
        this.advance();
      }
    }
  }

  pollInput(input: Input): void {
    if (!this.scene) return;
    if (input.justPressed('pause')) {
      if (!this.skipLocked) this.finish(); // farts are unskippable
      return;
    }
    if (input.justPressed('attack') || input.justPressed('jump')) {
      if (this.state === 'typing') {
        audio.play(this.bubbleLeft.visible ? 'bunny_talk_speedup' : 'mm_talk_speedup', 0, 0.7);
        this.completeTyping();
      } else if (this.state === 'waiting' && this.autoTimer <= 0) {
        this.advance();
      }
    }
  }
}
