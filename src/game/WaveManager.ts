/**
 * WaveManager — drives a level's segment sequence from the original XML:
 * keeps the on-screen enemy count between min/max, advances on kill quota
 * (continueAfterKills) or timer (continueAfterTime), honors segment delays.
 * Shopkeeper/chest segments are skipped for now (logged).
 */
import { Container } from 'pixi.js';
import { SpriterPlayer } from '../spriter/SpriterPlayer';
import type { SpriterData } from '../spriter/model';
import type { TextureMap } from '../assets/starlingAtlas';
import { Enemy, type EnemyServices, type PlayerView } from './Enemy';
import { createEnemy, MiddleSlammer } from './EnemyBehaviors';
import { GROUND_Y } from './PlayerController';
import type { LevelEnemies, Segment } from './data/levelData';

export class WaveManager {
  enemies: Enemy[] = [];
  killsThisSegment = 0;
  totalKills = 0;
  segmentIndex = -1;
  levelComplete = false;

  private segments: Segment[];
  private level: LevelEnemies;
  private sconData: SpriterData;
  private textures: TextureMap;
  private layer: Container;
  private services: EnemyServices;

  private delayTimer = 0;
  private segmentTimer = 0;
  private spawnTimer = 0;
  private current: Segment | null = null;

  constructor(
    segments: Segment[],
    level: LevelEnemies,
    sconData: SpriterData,
    textures: TextureMap,
    layer: Container,
    services: EnemyServices,
  ) {
    this.segments = segments;
    this.level = level;
    this.sconData = sconData;
    this.textures = textures;
    this.layer = layer;
    this.services = services;
    this.nextSegment();
  }

  /** boss id (from the segment XML) waiting for the Game layer to spawn */
  needsBoss: number | null = null;
  /** chest level waiting for the Game layer to spawn (original rewardChest) */
  needsChest: number | null = null;
  /** shopkeeper segment reached — Game layer spawns the NPC */
  needsShopkeeper = false;
  private activeBoss: Enemy | null = null;

  chestSpawned(): void {
    this.needsChest = null;
  }

  shopkeeperSpawned(): void {
    this.needsShopkeeper = false;
  }

  private nextSegment(): void {
    this.segmentIndex++;
    this.killsThisSegment = 0;
    this.segmentTimer = 0;
    this.spawnTimer = 0.4;
    this.needsBoss = null;
    this.activeBoss = null;

    while (this.segmentIndex < this.segments.length) {
      const seg = this.segments[this.segmentIndex];
      if (seg.boss !== null) {
        this.current = seg;
        this.delayTimer = Math.max(seg.delay, 0.8);
        this.needsBoss = Number(seg.boss) || 0;
        console.log(`[wave] segment ${this.segmentIndex}: BOSS ${this.needsBoss}`);
        return;
      }
      // reward chest: timed segment, the Game layer spawns the chest visual
      if (seg.rewardChest !== null) {
        this.current = seg;
        this.delayTimer = seg.delay;
        this.needsChest = seg.rewardChest;
        console.log(`[wave] segment ${this.segmentIndex}: CHEST level ${seg.rewardChest}`);
        return;
      }
      // shopkeeper: timed segment (continueAfterTime 7); the shop itself runs
      // concurrently and can outlive the segment (original behavior)
      if (seg.shopkeeper) {
        this.current = seg;
        this.delayTimer = seg.delay;
        this.needsShopkeeper = true;
        console.log(`[wave] segment ${this.segmentIndex}: SHOPKEEPER`);
        return;
      }
      // skip degenerate segments (no enemies, no marker, no timer)
      if (seg.enemies.length === 0 && seg.continueAfterTime <= 0) {
        console.log(`[wave] skipping empty segment ${this.segmentIndex}`);
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

  /** dev helper: jump straight to this level's boss segment */
  skipToBoss(): void {
    const idx = this.segments.findIndex((s) => s.boss !== null);
    if (idx === -1) return;
    for (const e of this.enemies) {
      if (e.alive) e.hurt(99999, 1);
    }
    this.segmentIndex = idx - 1;
    this.nextSegment();
  }

  /** Game layer hands over the spawned boss */
  bossSpawned(boss: Enemy): void {
    this.needsBoss = null;
    this.activeBoss = boss;
    boss.services = this.services;
    this.enemies.push(boss);
  }

  get boss(): Enemy | null {
    return this.activeBoss;
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

    // boss segment: wait for spawn (Game layer handles it), advance on death
    if (seg.boss !== null) {
      if (this.activeBoss && !this.activeBoss.alive) this.nextSegment();
      return;
    }

    this.segmentTimer += dt;

    // spawn to keep the arena populated — population counts only THIS
    // segment's spawns (carry-overs must not block the quota's spawns:
    // quota kills are same-segment only, so gating on total alive could
    // deadlock a segment behind leftover enemies)
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && seg.enemies.length > 0) {
      const alive = this.enemies.filter((e) => e.alive && e.waveSegment === this.segmentIndex).length;
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

    // advance conditions — leftovers LIVE into the next segment (playtest:
    // the old mass-despawn looked like "all enemies suddenly explode")
    if (seg.continueAfterKills > 0 && this.killsThisSegment >= seg.continueAfterKills) {
      this.nextSegment();
    } else if (seg.continueAfterTime > 0 && this.segmentTimer >= seg.continueAfterTime) {
      this.nextSegment();
    }
  }

  /** called by the combat system when an enemy dies */
  onKill(enemy?: Enemy): void {
    if (!enemy || enemy.waveSegment === this.segmentIndex) this.killsThisSegment++;
    this.totalKills++;
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
    this.spawnNamed(pick.name);
  }

  /** spawn a specific enemy type by name (also used by the debug panel) */
  spawnNamed(name: string): Enemy | null {
    const type = this.level.types.get(name);
    if (!type) {
      console.warn(`[wave] unknown enemy type: ${name}`);
      return null;
    }

    const spriter = new SpriterPlayer(`enemy-${type.name}-${this.enemies.length}`, this.sconData, this.textures);
    const enemy = createEnemy(type, spriter);
    enemy.services = this.services;
    enemy.waveSegment = this.segmentIndex;
    enemy.projectileDef = this.level.projectiles.get(type.projectileIds[0] ?? -1) ?? null;
    const [x, y] = this.spawnPosition(type.spawnType);
    enemy.spawnAt(x, y);
    this.layer.addChild(spriter);
    this.enemies.push(enemy);

    // MiddleSlammers come in linked pairs flying at each other from both walls
    if (enemy instanceof MiddleSlammer) {
      const partnerSpriter = new SpriterPlayer(`enemy-${type.name}-${this.enemies.length}`, this.sconData, this.textures);
      const partner = createEnemy(type, partnerSpriter) as MiddleSlammer;
      partner.services = this.services;
      partner.projectileDef = enemy.projectileDef;
      enemy.spawnAt(-30, GROUND_Y);
      partner.spawnAt(830, GROUND_Y);
      enemy.slammingRight = true;
      partner.slammingRight = false;
      enemy.partner = partner;
      partner.partner = enemy;
      this.layer.addChild(partnerSpriter);
      this.enemies.push(partner);
    }
    return enemy;
  }

  /** spawn a child enemy with explicit position + velocity (scoops, balls, nuggets) */
  spawnChildAt(name: string, x: number, y: number, xVel: number, yVel: number): Enemy | null {
    const type = this.level.types.get(name);
    if (!type) {
      console.warn(`[wave] unknown child enemy type: ${name}`);
      return null;
    }
    // honor the XML maxNum cap (original pooled enemies per type)
    const aliveOfType = this.enemies.filter((e) => e.alive && e.type.name === name).length;
    if (aliveOfType >= Math.min(type.maxNum, 20)) return null;
    const spriter = new SpriterPlayer(`enemy-${type.name}-${this.enemies.length}`, this.sconData, this.textures);
    const enemy = createEnemy(type, spriter);
    enemy.services = this.services;
    enemy.waveSegment = this.segmentIndex;
    enemy.projectileDef = this.level.projectiles.get(type.projectileIds[0] ?? -1) ?? null;
    enemy.spawnAt(x, y);
    enemy.y = y; // keep the launcher's altitude even for grounded types
    enemy.xVel = xVel;
    enemy.yVel = yVel;
    this.layer.addChild(spriter);
    this.enemies.push(enemy);
    return enemy;
  }

  private spawnPosition(spawnType: string): [number, number] {
    // playtest: -40/840 left slow archetypes invisible too long
    const side = Math.random() < 0.5 ? -20 : 820;
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
      case 'at_ground_pos': // appears in place on screen (corn turret)
        return [120 + Math.random() * 560, GROUND_Y];
      case 'offscreen_left':
        return [-40, GROUND_Y];
      case 'jump_from_side':
        return [side, GROUND_Y];
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
        const doneDying = !e.spriter.visible || !anim || anim.name !== e.deathAnim || e.spriter.timeMs >= anim.length;
        if (doneDying) {
          e.dispose();
          e.spriter.parent?.removeChild(e.spriter);
          e.spriter.destroy();
          this.enemies.splice(i, 1);
        }
      }
    }
  }
}
