/**
 * Audio manager — fills the role of the original's SoundAS/MGC sound layer:
 * named one-shot SFX (with random-pick groups and delays) and looping music
 * with fades. Howler unlocks audio on first user gesture automatically.
 */
import { Howl } from 'howler';

const FX_PATH = 'assets/sounds/fx/';
const MUSIC_PATH = 'assets/sounds/music/';

class AudioManager {
  private sfx = new Map<string, Howl>();
  private music: Howl | null = null;
  private musicName = '';
  sfxVolume = 0.9;
  musicVolume = 0.45;
  muted = false;

  /** preload a list of fx names (no extension), matching MGC.loadLotsOfSounds */
  loadFx(names: string[]): void {
    for (const name of names) {
      if (this.sfx.has(name)) continue;
      this.sfx.set(name, new Howl({ src: [`${FX_PATH}${name}.mp3`], preload: true }));
    }
  }

  play(name: string, delaySec = 0, volume = 1): void {
    if (this.muted) return;
    const howl = this.sfx.get(name);
    if (!howl) {
      console.warn(`[audio] sfx not loaded: ${name}`);
      return;
    }
    const fire = () => {
      const id = howl.play();
      howl.volume(this.sfxVolume * volume, id);
    };
    delaySec > 0 ? setTimeout(fire, delaySec * 1000) : fire();
  }

  playRandom(names: string[], delaySec = 0, volume = 1): void {
    this.play(names[Math.floor(Math.random() * names.length)], delaySec, volume);
  }

  /** start a looping fx (Blaster flame etc.); returns a stop function */
  playLoop(name: string, volume = 1): () => void {
    const howl = this.sfx.get(name);
    if (!howl || this.muted) return () => {};
    const id = howl.play();
    howl.loop(true, id);
    howl.volume(this.sfxVolume * volume, id);
    return () => howl.stop(id);
  }

  playMusic(name: string, fadeInSec = 1): void {
    if (this.musicName === name) return;
    this.stopMusic(0.5);
    this.musicName = name;
    const howl = new Howl({ src: [`${MUSIC_PATH}${name}.mp3`], loop: true, volume: 0 });
    this.music = howl;
    howl.play();
    howl.fade(0, this.muted ? 0 : this.musicVolume, fadeInSec * 1000);
  }

  stopMusic(fadeOutSec = 1): void {
    const old = this.music;
    if (!old) return;
    this.music = null;
    this.musicName = '';
    old.fade(old.volume() as number, 0, fadeOutSec * 1000);
    setTimeout(() => old.unload(), fadeOutSec * 1000 + 100);
  }
}

export const audio = new AudioManager();
