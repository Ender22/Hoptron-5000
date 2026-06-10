/**
 * WaveManager — drives a level's segment sequence from the original XML:
 * keeps the on-screen enemy count between min/max, advances on kill quota
 * (continueAfterKills) or timer (continueAfterTime), honors segment delays.
 * Boss/shopkeeper/chest segments are skipped for now (logged).
 */
import { Container } from 'pixi.js';
import { SpriterPlayer } from '../spriter/SpriterPlayer';
import type { SpriterData } from '../spriter/model';
import type { TextureMap } from '../assets/starlingAtlas';
import { Enemy, type PlayerView } from './Enemy';
import { GROUND_Y } from './PlayerController';
import type { EnemyType, Segment } from './data/levelData';

export class WaveManager {
  enemies: Enemy[] = [];
  killsThisSegment = 0;
  totalKills = 0;
  segmentIndex = -1;
  levelComplete = false;

  private segments: Segment[];
  private types: Map<string, EnemyType>;
  private sconData: SpriterData;
  private textures: TextureMap;
  private layer: Container;

  private delayTimer = 0;
  private segmentTimer = 0;
  private spawnTimer = 0;
  private current: Segment | null = null;

  constructor(segments: Segment[], types: Map<string, EnemyType>, sconData: SpriterData, textures: TextureMap, layer: Container) {
    this.segments = segments;
    this.types = types;
    this.sconData = sconData;
    this.textures = textures;
    this.layer = layer;
    this.nextSegment();
  }

  private nextSegment(): void {
    this.segmentIndex++;
    this.killsThisSegment = 0;
    this.segmentTimer = 0;
    this.spawnTimer = 0.4;

    while (this.segmentIndex < this.segments.length) {
      const seg = this.segments[this.segmentIndex];
      // skip special segments not implemented yet
      if (seg.boss || seg.shopkeeper || seg.rewardChest || seg.enemies.length === 0) {
        console.log(`[wave] skipping special segment ${this.segmentIndex}`, {
          boss: seg.boss,
          shopkeeper: seg.shopkeeper,
          chest: seg.rewardChest,
        });
        this.segmentIndex++;
        continue;
      }
      this.current = seg;
      this.delayTimer = seg.delay;
      console.log(`[wave] segment ${this.segmentIndex}: kill ${seg.continueAfterKills}, max ${seg.maxEnemies}`);
      return;
    }

    this.current = null;
    this.levelComplete = true;
    console.log('[wave] level complete!');
  }

  get aliveCount(): number {
    return this.enemies.filter((e) => e.alive).length;
  }

  /** current segment's kill quota (0 = timed segment) */
  get currentQuota(): number {
    return this.current?.continueAfterKills ?? 0;
  }

  update(dt: number, player: PlayerView): void {
    // update all enemies (including dying ones still animating)
    for (const enemy of this.enemies) enemy.update(dt, player);

    const seg = this.current;
    if (!seg) return;

    if (this.delayTimer > 0) {
      this.delayTimer -= dt;
      return;
    }

    this.segmentTimer += dt;

    // spawn to keep the arena populated
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const alive = this.aliveCount;
      const wantMore =
        alive < seg.minEnemies ||
        (alive < seg.maxEnemies && this.killsThisSegment + alive < Math.max(seg.continueAfterKills, seg.maxEnemies));
      if (wantMore) {
        this.spawnOne(seg);
        this.spawnTimer = alive < seg.minEnemies ? 0.35 : 0.9 + Math.random() * 0.8;
      } else {
        this.spawnTimer = 0.5;
      }
    }

    // advance conditions
    if (seg.continueAfterKills > 0 && this.killsThisSegment >= seg.continueAfterKills) {
      this.clearStragglers();
      this.nextSegment();
    } else if (seg.continueAfterTime > 0 && this.segmentTimer >= seg.continueAfterTime) {
      this.nextSegment();
    }
  }

  /** called by the combat system when an enemy dies */
  onKill(): void {
    this.killsThisSegment++;
    this.totalKills++;
  }

  private clearStragglers(): void {
    // segment cleared — despawn leftovers gently (they got their kill quota)
    for (const e of this.enemies) {
      if (e.alive) e.hurt(9999, e.x < 400 ? -1 : 1);
    }
  }

  private spawnOne(seg: Segment): void {
    // weighted pick
    const total = seg.enemies.reduce((sum, e) => sum + e.spawnFreq, 0);
    let roll = Math.random() * total;
    let pick = seg.enemies[0];
    for (const e of seg.enemies) {
      roll -= e.spawnFreq;
      if (roll <= 0) {
        pick = e;
        break;
      }
    }
    const type = this.types.get(pick.name);
    if (!type) {
      console.warn(`[wave] unknown enemy type: ${pick.name}`);
      return;
    }

    const spriter = new SpriterPlayer(`enemy-${type.name}-${this.enemies.length}`, this.sconData, this.textures);
    const enemy = new Enemy(type, spriter);
    const [x, y] = this.spawnPosition(type.spawnType);
    enemy.spawnAt(x, y);
    this.layer.addChild(spriter);
    this.enemies.push(enemy);
  }

  private spawnPosition(spawnType: string): [number, number] {
    const side = Math.random() < 0.5 ? -40 : 840;
    switch (spawnType) {
      case 'fly_from_side':
        return [side, GROUND_Y - 100 - Math.random() * 150];
      case 'from_ground':
        return [120 + Math.random() * 560, GROUND_Y + 40];
      case 'from_sky':
        return [120 + Math.random() * 560, -60];
      case 'random_offscreen': {
        const r = Math.random();
        if (r < 0.5) return [side, GROUND_Y - 60 - Math.random() * 180];
        return [120 + Math.random() * 560, -60];
      }
      default: // from_side
        return [side, GROUND_Y];
    }
  }

  /** remove finished corpses; returns removed spriters for disposal */
  cleanup(): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) {
        const anim = e.spriter.currentAnimation;
        const doneDying = !anim || anim.name !== 'die' || e.spriter.timeMs >= anim.length;
        if (doneDying) {
          e.spriter.parent?.removeChild(e.spriter);
          e.spriter.destroy();
          this.enemies.splice(i, 1);
        }
      }
    }
  }
}
