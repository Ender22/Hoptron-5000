/** localStorage save — replaces the original's SharedObject profiles */

export interface SaveData {
  furthestLevel: number; // 0-based highest unlocked level index
  bestScore: number;
  totalCoins: number;
  loadout: string[];
}

const KEY = 'hoptron5001-save';

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return {
        furthestLevel: Number(data.furthestLevel) || 0,
        bestScore: Number(data.bestScore) || 0,
        totalCoins: Number(data.totalCoins) || 0,
        loadout: Array.isArray(data.loadout) && data.loadout.length === 2 ? data.loadout : ['freeze', 'ninjaRain'],
      };
    }
  } catch (e) {
    console.warn('[save] failed to load', e);
  }
  return { furthestLevel: 0, bestScore: 0, totalCoins: 0, loadout: ['freeze', 'ninjaRain'] };
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('[save] failed to write', e);
  }
}
