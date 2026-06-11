/**
 * Plays the original game's .pex particle definitions (Particle Designer
 * format, used by Starling's PDParticleSystem). One-shot burst playback —
 * enemy deaths, explosions — using the original particle_*.png textures.
 * Continuous emitters (portals, flames) can come later if needed.
 */
import { Assets, Container, Sprite, Texture } from 'pixi.js';

interface PexConfig {
  textureName: string;
  speed: number;
  speedVariance: number;
  life: number;
  lifeVariance: number;
  angle: number;
  angleVariance: number;
  gravityX: number;
  gravityY: number;
  startColor: [number, number, number, number];
  finishColor: [number, number, number, number];
  maxParticles: number;
  startSize: number;
  startSizeVariance: number;
  finishSize: number;
  rotationStart: number;
  rotationStartVariance: number;
  additive: boolean;
}

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  age: number;
  life: number;
  startScale: number;
  endScale: number;
  cfg: PexConfig;
}

const PARTICLE_DIR = 'assets/particles/';
/** .pex defs were authored in 2x retina coordinates (-hd era) — halve for our 1x stage */
const PEX_SCALE = 0.5;
// .pex texture refs are mostly the generic "texture.png" — pick sensible defaults
const TEXTURE_FOR: Record<string, string> = {
  'texture.png': 'particle_circle.png',
  'bubble.png': 'particle_bubble.png',
  'particle_circle.png': 'particle_circle.png',
  'particle_ring.png': 'particle_ring.png',
};

function rgba(el: Element | null): [number, number, number, number] {
  if (!el) return [1, 1, 1, 1];
  const get = (n: string) => Number(el.getAttribute(n)) || 0;
  return [get('red'), get('green'), get('blue'), get('alpha')];
}

function value(doc: Document, tag: string, fallback = 0): number {
  const el = doc.querySelector(tag);
  const v = Number(el?.getAttribute('value'));
  return Number.isNaN(v) ? fallback : v;
}

export function parsePex(xmlText: string): PexConfig {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const gravity = doc.querySelector('gravity');
  return {
    textureName: doc.querySelector('texture')?.getAttribute('name') ?? 'texture.png',
    speed: value(doc, 'speed', 100),
    speedVariance: value(doc, 'speedVariance', 0),
    life: value(doc, 'particleLifeSpan', 0.8),
    lifeVariance: value(doc, 'particleLifespanVariance', 0),
    angle: value(doc, 'angle', 0),
    angleVariance: value(doc, 'angleVariance', 360),
    gravityX: Number(gravity?.getAttribute('x')) || 0,
    gravityY: Number(gravity?.getAttribute('y')) || 0,
    startColor: rgba(doc.querySelector('startColor')),
    finishColor: rgba(doc.querySelector('finishColor')),
    maxParticles: value(doc, 'maxParticles', 60),
    startSize: value(doc, 'startParticleSize', 30),
    startSizeVariance: value(doc, 'startParticleSizeVariance', 0),
    finishSize: value(doc, 'finishParticleSize', 5),
    rotationStart: value(doc, 'rotationStart', 0),
    rotationStartVariance: value(doc, 'rotationStartVariance', 0),
    // GL blendFuncDestination 1 = GL_ONE → additive
    additive: value(doc, 'blendFuncDestination', 0) === 1,
  };
}

export class PexSystem extends Container {
  private configs = new Map<string, PexConfig>();
  private textures = new Map<string, Texture>();
  private active: Particle[] = [];

  /** fetch + parse a set of .pex defs (missing files are skipped quietly) */
  async load(names: string[]): Promise<void> {
    await Promise.all(
      names.map(async (name) => {
        if (this.configs.has(name)) return;
        try {
          const res = await fetch(`${PARTICLE_DIR}${name}.pex`);
          if (!res.ok) return;
          const cfg = parsePex(await res.text());
          const file = TEXTURE_FOR[cfg.textureName] ?? 'particle_circle.png';
          if (!this.textures.has(file)) {
            this.textures.set(file, await Assets.load<Texture>(`${PARTICLE_DIR}${file}`));
          }
          this.configs.set(name, cfg);
        } catch {
          // viewer/dev servers without the file — code bursts remain the fallback
        }
      }),
    );
  }

  has(name: string): boolean {
    return this.configs.has(name);
  }

  /** one-shot burst at (x, y); intensity scales the particle count */
  burst(name: string, x: number, y: number, intensity = 1): void {
    const cfg = this.configs.get(name);
    if (!cfg) return;
    const texture = this.textures.get(TEXTURE_FOR[cfg.textureName] ?? 'particle_circle.png');
    if (!texture) return;
    const count = Math.min(90, Math.round(Math.min(cfg.maxParticles, 50) * intensity));

    for (let i = 0; i < count; i++) {
      const angle = ((cfg.angle + (Math.random() - 0.5) * 2 * cfg.angleVariance) * Math.PI) / 180;
      const speed = (cfg.speed + (Math.random() - 0.5) * 2 * cfg.speedVariance) * PEX_SCALE;
      const life = Math.max(0.15, cfg.life + (Math.random() - 0.5) * 2 * cfg.lifeVariance);
      const startSize = Math.max(2, (cfg.startSize + (Math.random() - 0.5) * 2 * cfg.startSizeVariance) * PEX_SCALE);

      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(x, y);
      sprite.rotation = ((cfg.rotationStart + (Math.random() - 0.5) * 2 * cfg.rotationStartVariance) * Math.PI) / 180;
      sprite.blendMode = cfg.additive ? 'add' : 'normal';
      this.addChild(sprite);

      this.active.push({
        sprite,
        vx: Math.cos(angle) * speed,
        vy: -Math.sin(angle) * speed, // pex angles are y-up
        age: 0,
        life,
        startScale: startSize / texture.width,
        endScale: Math.max(1, cfg.finishSize * PEX_SCALE) / texture.width,
        cfg,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.age += dt;
      if (p.age >= p.life) {
        p.sprite.destroy();
        this.active.splice(i, 1);
        continue;
      }
      p.vx += p.cfg.gravityX * PEX_SCALE * dt;
      p.vy += p.cfg.gravityY * PEX_SCALE * dt;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;

      const t = p.age / p.life;
      const s = p.startScale + (p.endScale - p.startScale) * t;
      p.sprite.scale.set(s);
      const c0 = p.cfg.startColor;
      const c1 = p.cfg.finishColor;
      const r = Math.max(0, Math.min(1, c0[0] + (c1[0] - c0[0]) * t));
      const g = Math.max(0, Math.min(1, c0[1] + (c1[1] - c0[1]) * t));
      const b = Math.max(0, Math.min(1, c0[2] + (c1[2] - c0[2]) * t));
      p.sprite.tint = (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
      p.sprite.alpha = Math.max(0, c0[3] + (c1[3] - c0[3]) * t);
    }
  }

  clear(): void {
    for (const p of this.active) p.sprite.destroy();
    this.active.length = 0;
  }
}
