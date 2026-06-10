/**
 * SpriterPlayer — the display object that plays Spriter animations,
 * behaviorally matching the original game's com.acemobe.spriter.Spriter:
 * playAnim(name, nextAnim, callback, force, uninterruptable), per-frame
 * pose resolution, attachment points / hitboxes, and timed sound triggers.
 *
 * Additions over the original: reverse playback (for the fall-attack
 * experiment) and a pluggable sound trigger callback instead of a hard
 * dependency on the global sound manager.
 */
import { Container, Sprite } from 'pixi.js';
import { fixRotation, DEG_TO_RAD, ObjectType, type ResolvedKey, type SpriterAnimationData, type SpriterData, type SpriterEntity } from './model';
import { resolveFrame } from './playback';
import type { TextureMap } from '../assets/starlingAtlas';

export interface AnimationSound {
  /** one is picked at random when several are given */
  soundNames: string[];
  /** trigger time in ms within the animation */
  time: number;
  /** if false, plays only on the first loop (matches AnimationSoundObject.shouldResetAfterLoop) */
  resetAfterLoop: boolean;
  played?: boolean;
}

export type SoundTriggerCallback = (groupName: string, soundName: string) => void;
export type PlayerCallback = (player: SpriterPlayer) => void;

export class SpriterPlayer extends Container {
  readonly data: SpriterData;

  playbackSpeed = 1;
  /** play the current animation backwards (display time = length - t) */
  reverse = false;

  /** point objects (sword tips, attachment anchors) resolved this frame */
  activePoints: ResolvedKey[] = [];
  /** box objects (hitboxes) resolved this frame */
  activeBoxes: ResolvedKey[] = [];

  onSoundTrigger: SoundTriggerCallback | null = null;
  onFrame: PlayerCallback | null = null;

  private entityIndex = 0;
  private animIndex = -1;
  private currentTime = 0; // seconds, matches original
  private loopTime = 0; // ms within current loop, for sound triggers
  private nextAnim = '';
  private completeCallback: PlayerCallback | null = null;
  private uninterruptable = false;

  private textures: TextureMap;
  private spritesByName = new Map<string, Sprite>();
  private soundsByAnim = new Map<string, AnimationSound[]>();
  private missingTextures = new Set<string>();

  constructor(name: string, data: SpriterData, textures: TextureMap) {
    super();
    this.label = name;
    this.data = data;
    this.textures = textures;
    this.sortableChildren = true;
  }

  // ----- entity / animation selection -------------------------------------

  get entity(): SpriterEntity {
    return this.data.entities[this.entityIndex];
  }

  setEntity(name: string): void {
    const idx = this.data.entities.findIndex((e) => e.name === name);
    if (idx === -1) throw new Error(`Spriter entity not found: ${name}`);
    if (idx !== this.entityIndex) {
      this.entityIndex = idx;
      this.animIndex = -1;
      this.currentAnimationName = '';
      // entity switch invalidates the sprite cache (names may collide across entities)
      for (const sprite of this.spritesByName.values()) sprite.destroy();
      this.spritesByName.clear();
    }
  }

  currentAnimationName = '';

  get currentAnimation(): SpriterAnimationData | null {
    return this.animIndex >= 0 ? this.entity.animations[this.animIndex] : null;
  }

  hasAnim(animName: string): boolean {
    return this.entity.animations.some((a) => a.name === animName);
  }

  /** current position within the animation, in ms */
  get timeMs(): number {
    return this.currentTime * 1000;
  }

  set timeMs(ms: number) {
    this.currentTime = ms / 1000;
    this.loopTime = ms;
  }

  /**
   * Same contract as the original: switching to the already-playing
   * animation does nothing unless `force`, finished non-looping animations
   * restart, `uninterruptable` blocks switches until the animation completes.
   */
  playAnim(
    animName: string,
    nextAnim = '',
    callback: PlayerCallback | null = null,
    force = false,
    uninterruptable = false,
  ): void {
    this.resetSoundsPlayed(this.currentAnimationName, false);
    if (!uninterruptable && this.uninterruptable) return;

    const entity = this.entity;
    this.uninterruptable = uninterruptable;
    this.currentAnimationName = animName;
    this.nextAnim = nextAnim;
    this.completeCallback = callback;
    this.loopTime = 0;

    for (let a = 0; a < entity.animations.length; a++) {
      const anim = entity.animations[a];
      if (anim.name !== animName) continue;

      if (this.animIndex !== a || force) {
        this.animIndex = a;
        this.currentTime = 0;
      } else if (this.timeMs >= anim.length) {
        this.currentTime = 0;
      }

      if (!this.visible) {
        this.visible = true;
        this.currentTime = 0;
      }

      this.advanceTime(0.01);
      return;
    }
    console.warn(`SpriterPlayer "${this.label}": animation not found: ${entity.name}/${animName}`);
  }

  // ----- sounds ------------------------------------------------------------

  setAnimationSounds(animName: string, sounds: AnimationSound[]): void {
    this.soundsByAnim.set(animName, sounds.map((s) => ({ ...s, played: false })));
  }

  private resetSoundsPlayed(animName: string, fromLoop: boolean): void {
    const sounds = this.soundsByAnim.get(animName);
    if (!sounds) return;
    for (const s of sounds) {
      if (fromLoop && !s.resetAfterLoop) continue;
      s.played = false;
    }
  }

  private checkSoundTriggers(animTime: number): void {
    if (!this.onSoundTrigger) return;
    const sounds = this.soundsByAnim.get(this.currentAnimationName);
    if (!sounds) return;
    for (const s of sounds) {
      if (animTime > s.time && !s.played) {
        s.played = true;
        const name = s.soundNames.length === 1 ? s.soundNames[0] : s.soundNames[Math.floor(Math.random() * s.soundNames.length)];
        this.onSoundTrigger(this.label, name);
      }
    }
  }

  // ----- per-frame update ----------------------------------------------------

  /** advance by `time` seconds (negative allowed; reverse flag flips display time) */
  advanceTime(time: number): void {
    if (!this.visible) return;
    const anim = this.currentAnimation;
    if (!anim) return;

    this.currentTime += time * this.playbackSpeed;
    if (this.currentTime < 0) this.currentTime = 0;
    this.loopTime += time * this.playbackSpeed * 1000;
    if (this.loopTime >= anim.length) {
      this.resetSoundsPlayed(this.currentAnimationName, true);
      this.loopTime -= anim.length;
    }

    const rawMs = this.timeMs;
    const displayMs = this.reverse ? Math.max(0, anim.length - (anim.looping ? rawMs % Math.max(anim.length, 1) : Math.min(rawMs, anim.length))) : rawMs;

    const frame = resolveFrame(this.data, anim, displayMs);
    this.checkSoundTriggers(this.reverse ? rawMs % Math.max(anim.length, 1) : frame.time);

    this.activePoints.length = 0;
    this.activeBoxes.length = 0;

    // hide everything, then re-show the parts present in this frame
    for (const sprite of this.spritesByName.values()) sprite.visible = false;

    for (let k = 0; k < frame.objects.length; k++) {
      const obj = frame.objects[k];

      if (obj.objectType === ObjectType.Sprite && obj.file) {
        const sprite = this.getSprite(obj.file.name, obj.file.shortName);
        if (!sprite) continue;

        if (!obj.useDefaultPivot) {
          sprite.anchor.set(obj.pivotX, 1 - obj.pivotY);
        } else {
          sprite.anchor.set(obj.file.pivotX, 1 - obj.file.pivotY);
        }
        sprite.position.set(obj.x, obj.y);
        sprite.scale.set(obj.scaleX, obj.scaleY);
        sprite.rotation = fixRotation(obj.angle) * DEG_TO_RAD;
        sprite.zIndex = k;
        sprite.visible = true;
      } else if (obj.objectType === ObjectType.Point) {
        this.activePoints.push(obj);
      } else if (obj.objectType === ObjectType.Box) {
        this.activeBoxes.push(obj);
      }
    }

    // completion / chaining — matches the original's semantics, including
    // firing the callback every loop for looping animations with a callback
    const rawTimeForCompletion = this.timeMs;
    if (rawTimeForCompletion >= anim.length) {
      this.resetSoundsPlayed(this.currentAnimationName, false);
      this.uninterruptable = false;
      const next = this.nextAnim;
      const callback = this.completeCallback;
      if (next !== '') this.playAnim(next);
      if (callback) callback(this);
    } else if (frame.looped && (this.nextAnim !== '' || this.completeCallback)) {
      const next = this.nextAnim;
      const callback = this.completeCallback;
      if (next !== '') this.playAnim(next);
      if (callback) callback(this);
    }

    this.onFrame?.(this);
  }

  // ----- sprite cache ----------------------------------------------------------

  /** tint all parts (damage flash etc.) */
  setColor(color: number): void {
    this.currentColor = color;
    for (const sprite of this.spritesByName.values()) sprite.tint = color;
  }

  private currentColor = 0xffffff;

  private getSprite(name: string, shortName: string): Sprite | null {
    let sprite = this.spritesByName.get(name) ?? null;
    if (sprite) return sprite;

    const texture = this.textures.get(name) ?? this.textures.get(shortName);
    if (!texture) {
      if (!this.missingTextures.has(name)) {
        this.missingTextures.add(name);
        console.warn(`SpriterPlayer "${this.label}": missing texture ${name} (${shortName})`);
      }
      return null;
    }

    sprite = new Sprite(texture);
    sprite.label = name;
    sprite.tint = this.currentColor;
    this.spritesByName.set(name, sprite);
    this.addChild(sprite);
    return sprite;
  }

  /** access a live part sprite (e.g. the sword) for VFX that track it */
  getPart(name: string): Sprite | null {
    const sprite = this.spritesByName.get(name);
    return sprite && sprite.visible ? sprite : null;
  }

  /** first visible part whose texture name matches (e.g. /gun/i for boss muzzles) */
  findPart(re: RegExp): Sprite | null {
    for (const [name, sprite] of this.spritesByName) {
      if (re.test(name) && sprite.visible) return sprite;
    }
    return null;
  }

  destroy(): void {
    this.spritesByName.clear();
    super.destroy({ children: true });
  }
}
