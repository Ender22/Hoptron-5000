/** localStorage save — replaces the original's SharedObject profiles */

/** permanent AP meta-shop levels (original upgrades_fight_* fields) */
export interface FightUpgrades {
  hp: number; // maxHP = 50 + 40*L (max 6)
  damage: number; // sword 30+16*L, star 10+5*L (max 6)
  sword: number; // sword length 240+20*L (max 6)
  slash: number; // attack-again 0.65-0.05*L (max 6)
}

export interface SaveData {
  furthestLevel: number; // 0-based highest unlocked level index
  bestScore: number;
  bestKills: number;
  totalCoins: number;
  loadout: string[];
  /** banked Awesomeness Points (original totalAwesomenessPoints) */
  ap: number;
  fight: FightUpgrades;
  /** spell id -> level (0/absent = locked, 1-4; levels shorten cooldown) */
  spells: Record<string, number>;
  /** achievement id -> progress value (done when >= endValue) */
  achievements: Record<string, number>;
  /** total deaths (the Magic Man mocks you with this in the scenes) */
  deaths: number;
  /** story-scene progress (original furthestSceneReached / extraSceneReached) */
  furthestSceneReached: number;
  extraSceneReached: number;
  musicMuted: boolean;
  sfxMuted: boolean;
}

const KEY = 'hoptron5001-save';
const DEFAULT_SPELLS = { freeze: 1, ninjaRain: 1 };

function defaults(): SaveData {
  return {
    furthestLevel: 0,
    bestScore: 0,
    bestKills: 0,
    totalCoins: 0,
    loadout: ['freeze', 'ninjaRain'],
    ap: 0,
    fight: { hp: 0, damage: 0, sword: 0, slash: 0 },
    spells: { ...DEFAULT_SPELLS },
    achievements: {},
    deaths: 0,
    furthestSceneReached: -1,
    extraSceneReached: 0,
    musicMuted: false,
    sfxMuted: false,
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const fight = data.fight ?? {};
      const spells: Record<string, number> =
        typeof data.spells === 'object' && data.spells ? data.spells : { ...DEFAULT_SPELLS };
      // legacy saves may carry now-locked spells in the loadout
      let loadout: string[] =
        Array.isArray(data.loadout) && data.loadout.length === 2 ? data.loadout : ['freeze', 'ninjaRain'];
      if (loadout.some((id) => (spells[id] ?? 0) < 1)) loadout = ['freeze', 'ninjaRain'];
      return {
        furthestLevel: Number(data.furthestLevel) || 0,
        bestScore: Number(data.bestScore) || 0,
        bestKills: Number(data.bestKills) || 0,
        totalCoins: Number(data.totalCoins) || 0,
        loadout,
        ap: Number(data.ap) || 0,
        fight: {
          hp: Number(fight.hp) || 0,
          damage: Number(fight.damage) || 0,
          sword: Number(fight.sword) || 0,
          slash: Number(fight.slash) || 0,
        },
        spells,
        achievements: typeof data.achievements === 'object' && data.achievements ? data.achievements : {},
        deaths: Number(data.deaths) || 0,
        furthestSceneReached: Number.isFinite(Number(data.furthestSceneReached)) ? Number(data.furthestSceneReached) : -1,
        extraSceneReached: Number(data.extraSceneReached) || 0,
        musicMuted: !!data.musicMuted,
        sfxMuted: !!data.sfxMuted,
      };
    }
  } catch (e) {
    console.warn('[save] failed to load', e);
  }
  return defaults();
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('[save] failed to write', e);
  }
}
