/**
 * Permanent AP meta-shop on the title screen (original ShopManager/ShopScreen).
 * Fight tab formulas from the original: maxHP 50+40L, sword dmg 30+16L,
 * star dmg 10+5L, sword length 240+20L, attack-again 0.65-0.05L.
 * Magic items unlock/level the remake's loadout spells (levels shorten
 * cooldowns); prices are the original store's where one existed.
 */
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { TextureMap } from '../assets/starlingAtlas';
import { audio } from './Audio';
import type { Input } from './Input';
import { SPELLS } from './Spells';
import { writeSave, type SaveData } from './SaveData';

type FightKey = 'hp' | 'damage' | 'sword' | 'slash';

interface MetaItem {
  kind: 'fight' | 'spell';
  key: string;
  name: string;
  icon: string;
  iconAtlas: 'store' | 'effects';
  prices: number[];
  effect: (level: number) => string;
}

const ITEMS: MetaItem[] = [
  { kind: 'fight', key: 'hp', name: 'Health Booster', icon: 'Shopitem_Fight_Health', iconAtlas: 'store', prices: [200, 600, 1200, 2000, 2900, 4000], effect: (l) => `max HP ${50 + 40 * l}` },
  { kind: 'fight', key: 'damage', name: 'Damage Booster', icon: 'Shopitem_Fight_Damage', iconAtlas: 'store', prices: [150, 500, 1100, 1800, 2600, 3500], effect: (l) => `sword ${30 + 16 * l} · star ${10 + 5 * l}` },
  { kind: 'fight', key: 'sword', name: 'Sword Booster', icon: 'Shopitem_Fight_Sword', iconAtlas: 'store', prices: [80, 300, 700, 1200, 1800, 2500], effect: (l) => `reach +${Math.round((l * 20 * 100) / 240)}%` },
  { kind: 'fight', key: 'slash', name: 'Slash Booster', icon: 'Shopitem_Fight_Slash', iconAtlas: 'store', prices: [100, 350, 800, 1500, 2200, 2900], effect: (l) => `combo speed +${Math.round((1 - (0.65 - 0.05 * l) / 0.65) * 100)}%` },
  { kind: 'spell', key: 'freeze', name: 'Frost Mountain Winds', icon: 'Shopitem_Magic_Freeze', iconAtlas: 'store', prices: [200, 400, 800, 1300], effect: spellEffect },
  { kind: 'spell', key: 'ninjaRain', name: "Heaven's Rain of Death", icon: 'Shopitem_Magic_Rain', iconAtlas: 'store', prices: [300, 600, 1000, 1500], effect: spellEffect },
  { kind: 'spell', key: 'slash', name: 'Ultimate Dragon Slash', icon: 'Shopitem_Magic_Slash', iconAtlas: 'store', prices: [200, 500, 1000, 1500], effect: spellEffect },
  { kind: 'spell', key: 'growth', name: "Giant's Rage", icon: 'Shopitem_Magic_Mushroom', iconAtlas: 'store', prices: [500, 900, 1300, 1700], effect: spellEffect },
  { kind: 'spell', key: 'coin', name: 'Cursed Gold', icon: 'Shopitem_Magic_Coins', iconAtlas: 'store', prices: [800, 1200, 1600, 2000], effect: spellEffect },
  { kind: 'spell', key: 'magnet', name: 'Loot Magnet', icon: 'Shopitem_Magic_Magnet', iconAtlas: 'store', prices: [50, 150, 250, 400], effect: spellEffect },
  // no original store entries for these two (time is new, akuma was arena-earned) — priced in-family
  { kind: 'spell', key: 'time', name: 'Sands of Time', icon: 'MagicBubble_Time', iconAtlas: 'effects', prices: [400, 800, 1200, 1600], effect: spellEffect },
  { kind: 'spell', key: 'akuma', name: 'Akuma Beam', icon: 'Shopitem_Magic_Akuma', iconAtlas: 'store', prices: [1000, 1500, 2000, 2500], effect: spellEffect },
];

function spellEffect(level: number): string {
  if (level === 0) return 'LOCKED';
  return `cooldown −${Math.round(12 * (level - 1))}%`;
}

export class MetaShop extends Container {
  /** fired after any purchase or on close so the title can re-gate spells */
  onChanged: (() => void) | null = null;

  private save: SaveData;
  private cards: { icon: Sprite; name: Text; level: Text; effect: Text; price: Text; ring: Graphics }[] = [];
  private apLabel!: Text;
  private selected = 0;

  constructor(save: SaveData, storeTextures: TextureMap, effectsTextures: TextureMap) {
    super();
    this.save = save;
    this.visible = false;
    this.build(storeTextures, effectsTextures);
  }

  private itemLevel(item: MetaItem): number {
    return item.kind === 'fight' ? this.save.fight[item.key as FightKey] : (this.save.spells[item.key] ?? 0);
  }

  private build(store: TextureMap, effects: TextureMap): void {
    const dim = new Graphics().rect(0, 0, 800, 480).fill({ color: 0x0a0c14, alpha: 0.92 });
    this.addChild(dim);

    const title = new Text({
      text: 'AWESOMENESS SHOP',
      style: { fontFamily: 'Verdana', fontSize: 26, fill: 0xffe066, fontWeight: 'bold' },
    });
    title.anchor.set(0.5);
    title.position.set(400, 34);
    this.addChild(title);

    this.apLabel = new Text({
      text: '',
      style: { fontFamily: 'Verdana', fontSize: 15, fill: 0x9fdcff, fontWeight: 'bold' },
    });
    this.apLabel.anchor.set(0.5);
    this.apLabel.position.set(400, 62);
    this.addChild(this.apLabel);

    ITEMS.forEach((item, i) => {
      const cx = 100 + (i % 4) * 200;
      const cy = 130 + Math.floor(i / 4) * 130;
      const ring = new Graphics();
      ring.position.set(cx, cy);
      const icon = new Sprite((item.iconAtlas === 'store' ? store : effects).get(item.icon));
      icon.anchor.set(0.5);
      icon.scale.set(0.62);
      icon.position.set(cx - 55, cy);
      const name = new Text({
        text: item.name,
        style: { fontFamily: 'Verdana', fontSize: 10, fill: 0xffffff, fontWeight: 'bold', wordWrap: true, wordWrapWidth: 110 },
      });
      name.anchor.set(0, 0.5);
      name.position.set(cx - 22, cy - 28);
      const level = new Text({ text: '', style: { fontFamily: 'Verdana', fontSize: 10, fill: 0xaaaaaa } });
      level.anchor.set(0, 0.5);
      level.position.set(cx - 22, cy - 6);
      const effect = new Text({ text: '', style: { fontFamily: 'Verdana', fontSize: 9, fill: 0x9fdcff } });
      effect.anchor.set(0, 0.5);
      effect.position.set(cx - 22, cy + 12);
      const price = new Text({ text: '', style: { fontFamily: 'Verdana', fontSize: 11, fill: 0xffe066, fontWeight: 'bold' } });
      price.anchor.set(0, 0.5);
      price.position.set(cx - 22, cy + 32);
      this.addChild(ring, icon, name, level, effect, price);
      this.cards.push({ icon, name, level, effect, price, ring });
    });

    const hint = new Text({
      text: '← → select  ·  ATTACK (J) / JUMP buy  ·  ESC close',
      style: { fontFamily: 'Verdana', fontSize: 12, fill: 0xcccccc },
    });
    hint.anchor.set(0.5);
    hint.position.set(400, 460);
    this.addChild(hint);
  }

  open(): void {
    this.selected = 0;
    this.refresh();
    this.visible = true;
  }

  private refresh(): void {
    this.apLabel.text = `${this.save.ap} AP  ·  earn Awesomeness Points by clearing levels`;
    ITEMS.forEach((item, i) => {
      const card = this.cards[i];
      const level = this.itemLevel(item);
      const maxed = level >= item.prices.length;
      const nextPrice = maxed ? null : item.prices[level];
      card.level.text = item.kind === 'spell' && level === 0 ? 'LOCKED' : `Lv ${level}/${item.prices.length}`;
      card.effect.text = item.effect(level);
      card.price.text = nextPrice === null ? 'MAXED' : `${nextPrice} AP`;
      card.price.style.fill = nextPrice === null ? 0x888888 : this.save.ap >= nextPrice ? 0xffe066 : 0xff6666;
      card.icon.alpha = item.kind === 'spell' && level === 0 ? 0.4 : 1;
      card.ring.clear();
      card.ring.roundRect(-90, -52, 180, 108).stroke({ color: i === this.selected ? 0xffe066 : 0x2a3a66, width: i === this.selected ? 3 : 1 });
    });
  }

  private buy(): void {
    const item = ITEMS[this.selected];
    const level = this.itemLevel(item);
    if (level >= item.prices.length) {
      audio.play('store_notEnough', 0, 0.6);
      return;
    }
    const price = item.prices[level];
    if (this.save.ap < price) {
      audio.play('store_notEnough');
      return;
    }
    this.save.ap -= price;
    if (item.kind === 'fight') {
      this.save.fight[item.key as FightKey] = level + 1;
    } else {
      this.save.spells[item.key] = level + 1;
    }
    writeSave(this.save);
    audio.play('store_itemBought');
    this.refresh();
    this.onChanged?.();
  }

  pollInput(input: Input): void {
    if (!this.visible) return;
    if (input.justPressed('left')) {
      this.selected = (this.selected + ITEMS.length - 1) % ITEMS.length;
      this.refresh();
    }
    if (input.justPressed('right')) {
      this.selected = (this.selected + 1) % ITEMS.length;
      this.refresh();
    }
    if (input.justPressed('attack') || input.justPressed('jump')) this.buy();
    if (input.justPressed('pause')) {
      this.visible = false;
      this.onChanged?.();
    }
  }
}

/** spell ids that exist (used by the title to gate the loadout) */
export const ALL_SPELL_IDS = Object.keys(SPELLS);
