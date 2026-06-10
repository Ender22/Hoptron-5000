/**
 * Parses the original game's level design XML (AdventureModeEnemies.xml +
 * AdventureModeSegmentsReal.xml) — enemy stat blocks and wave sequencing.
 */

export interface LootEntry {
  item: string;
  freq: number;
  minAmount: number;
  maxAmount: number;
}

export interface EnemyType {
  id: number;
  name: string;
  scon: string;
  atlas: string;
  hp: number;
  attackDmg: number;
  acceleration: number;
  maxMovementSpeed: number;
  effectedByGravity: boolean;
  deathPS: string;
  spawnType: string;
  aiType: string;
  difficulty: number;
  pointsAward: number;
  /** seconds of overlap before the enemy damages the player */
  timeToDamage: number;
  maxNum: number;
  loot: LootEntry[];
  /** boss-only: projectile texture name in the level atlas (e.g. Watermelon_Seed) */
  projectileImage: string;
}

export interface LevelEnemies {
  foodCategory: string;
  types: Map<string, EnemyType>;
  /** boss entries (from <boss> elements), indexed by their XML id */
  bosses: EnemyType[];
}

export interface SegmentEnemy {
  id: number;
  name: string;
  spawnFreq: number;
}

export interface Segment {
  delay: number;
  maxEnemies: number;
  minEnemies: number;
  continueAfterKills: number;
  continueAfterTime: number;
  enemies: SegmentEnemy[];
  boss: string | null;
  bossWarning: boolean;
  rewardChest: boolean;
  shopkeeper: boolean;
}

function text(parent: Element, tag: string, fallback = ''): string {
  return parent.querySelector(`:scope > ${tag}`)?.textContent?.trim() ?? fallback;
}

function num(parent: Element, tag: string, fallback = 0): number {
  const v = Number(text(parent, tag));
  return Number.isNaN(v) || text(parent, tag) === '' ? fallback : v;
}

function attr(el: Element, name: string, fallback = 0): number {
  const v = Number(el.getAttribute(name));
  return el.hasAttribute(name) && !Number.isNaN(v) ? v : fallback;
}

export async function loadEnemyTypes(url = 'data/AdventureModeEnemies.xml'): Promise<LevelEnemies[]> {
  const xml = new DOMParser().parseFromString(await (await fetch(url)).text(), 'application/xml');
  const levels: LevelEnemies[] = [];

  function parseType(e: Element): EnemyType {
    return {
      id: num(e, 'id'),
      name: text(e, 'name'),
      scon: text(e, 'scon'),
      atlas: text(e, 'atlas'),
      hp: num(e, 'hp', 10),
      attackDmg: num(e, 'attackDmg', 5),
      acceleration: num(e, 'acceleration', 0.5),
      maxMovementSpeed: num(e, 'maxMovementSpeed', 2),
      effectedByGravity: num(e, 'effectedByGravity', 1) === 1,
      deathPS: text(e, 'deathPS'),
      spawnType: text(e, 'spawnType'),
      aiType: text(e, 'aiType'),
      difficulty: num(e, 'difficulty', 1),
      pointsAward: num(e, 'pointsAward', 10),
      timeToDamage: num(e, 'time_to_damage', 0.2),
      maxNum: attr(e, 'maxNum', 10),
      loot: Array.from(e.querySelectorAll('lootItem')).map((l) => ({
        item: l.textContent?.trim() ?? '',
        freq: attr(l, 'freq', 0),
        minAmount: attr(l, 'minAmount', 1),
        maxAmount: attr(l, 'maxAmount', 1),
      })),
      projectileImage: text(e, 'image'),
    };
  }

  for (const levelEl of Array.from(xml.querySelectorAll('ENEMIES > level'))) {
    const types = new Map<string, EnemyType>();
    for (const e of Array.from(levelEl.querySelectorAll(':scope > enemyType'))) {
      const type = parseType(e);
      types.set(type.name, type);
    }
    const bosses = Array.from(levelEl.querySelectorAll(':scope > boss'))
      .map(parseType)
      .sort((a, b) => a.id - b.id);
    levels.push({ foodCategory: levelEl.getAttribute('foodCategory') ?? '', types, bosses });
  }
  return levels;
}

export async function loadSegments(url = 'data/AdventureModeSegmentsReal.xml'): Promise<Segment[][]> {
  const xml = new DOMParser().parseFromString(await (await fetch(url)).text(), 'application/xml');
  const levels: Segment[][] = [];

  for (const levelEl of Array.from(xml.querySelectorAll('SEGMENTS > level'))) {
    const segments: Segment[] = [];
    for (const s of Array.from(levelEl.querySelectorAll(':scope > segment'))) {
      segments.push({
        delay: attr(s, 'delay', 0),
        maxEnemies: attr(s, 'maxEnemies', 0),
        minEnemies: attr(s, 'minEnemies', 0),
        continueAfterKills: attr(s, 'continueAfterKills', 0),
        continueAfterTime: attr(s, 'continueAfterTime', 0),
        enemies: Array.from(s.querySelectorAll(':scope > enemy')).map((e) => ({
          id: attr(e, 'id', 0),
          name: e.textContent?.trim() ?? '',
          spawnFreq: attr(e, 'spawnFreq', 100),
        })),
        // <bossWarning> doubles as the boss spawn marker in the shipped data
        boss:
          s.querySelector(':scope > boss')?.textContent?.trim() ??
          s.querySelector(':scope > bossWarning')?.textContent?.trim() ??
          null,
        bossWarning: s.querySelector(':scope > bossWarning') != null,
        rewardChest: s.querySelector(':scope > rewardChest') != null,
        shopkeeper: s.querySelector(':scope > shopkeeper') != null,
      });
    }
    levels.push(segments);
  }
  return levels;
}
