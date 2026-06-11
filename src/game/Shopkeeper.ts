/**
 * In-run shopkeeper — original InGameShopManager behavior: teleports in
 * opposite the player, waits 6s, opens his wares when the player walks up,
 * sells the GameShop.xml catalog for run coins. The Game layer owns the
 * item effects (ShopBackend); this class is the NPC + the shop UI.
 */
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { TextureMap } from '../assets/starlingAtlas';
import type { SpriterPlayer } from '../spriter/SpriterPlayer';
import { audio } from './Audio';
import type { Input } from './Input';
import type { PlayerController } from './PlayerController';
import { GROUND_Y } from './PlayerController';

export type ShopItemKey = 'stars' | 'armor' | 'chi' | 'healthPotion' | 'invincePotion' | 'luck' | 'dodge' | 'carrot';

export interface ShopBackend {
  coins(): number;
  /** display name of the next purchasable level (sold-out items keep their base name) */
  name(key: ShopItemKey): string;
  /** price of the next level; null = sold out */
  price(key: ShopItemKey): number | null;
  /** deduct coins + apply the effect */
  buy(key: ShopItemKey): 'ok' | 'poor' | 'rejected';
}

const CATALOG: { key: ShopItemKey; icon: string }[] = [
  { key: 'stars', icon: 'GameShopItem_NinjaStars' },
  { key: 'armor', icon: 'GameShopItem_BodyArmor' },
  { key: 'chi', icon: 'GameShopItem_DamageDown' },
  { key: 'healthPotion', icon: 'GameShopItem_LifeBubble' },
  { key: 'invincePotion', icon: 'GameShopItem_InvinceBubble' },
  { key: 'luck', icon: 'GameShopItem_LuckAmulet' },
  { key: 'dodge', icon: 'GameShopItem_DodgeShoes' },
  { key: 'carrot', icon: 'GameShopItem_HealthCarrot' },
];

const SCALE = 0.55;

type State = 'in' | 'idle' | 'open' | 'closing' | 'out' | 'gone';

export class Shopkeeper {
  readonly spriter: SpriterPlayer;
  /** full-screen shop overlay; Game adds this to the stage */
  readonly ui: Container;

  state: State = 'in';
  /** Game pauses the world sim while true */
  get uiOpen(): boolean {
    return this.state === 'open';
  }

  /** shop closed (player done) — Game restores the level music */
  onClosed: (() => void) | null = null;

  private backend: ShopBackend;
  private x: number;
  private leaveTimer = 6;
  private welcomeTimer = 0;
  private closeOutTimer = 0;

  private cards: { icon: Sprite; name: Text; price: Text; ring: Graphics }[] = [];
  private coinLabel!: Text;
  private selected = 0;

  constructor(spriter: SpriterPlayer, menuTextures: TextureMap, backend: ShopBackend, playerX: number) {
    this.spriter = spriter;
    this.backend = backend;

    // spawn opposite the player (original: 700 facing left / 100 facing right)
    this.x = playerX < 400 ? 700 : 100;
    const facing = playerX < 400 ? -1 : 1;
    spriter.scale.set(SCALE * facing, SCALE);
    spriter.position.set(this.x, GROUND_Y - 10);
    spriter.playAnim('teleport_in', 'idle');
    audio.play('teleportBack');

    this.ui = new Container();
    this.ui.visible = false;
    this.buildUi(menuTextures);
  }

  private buildUi(textures: TextureMap): void {
    const dim = new Graphics().rect(0, 0, 800, 480).fill({ color: 0x0a0c14, alpha: 0.82 });
    this.ui.addChild(dim);

    const title = new Text({
      text: 'WHAT ARE YA BUYIN?',
      style: { fontFamily: 'Verdana', fontSize: 26, fill: 0xffe066, fontWeight: 'bold' },
    });
    title.anchor.set(0.5);
    title.position.set(400, 48);
    this.ui.addChild(title);

    this.coinLabel = new Text({
      text: '',
      style: { fontFamily: 'Verdana', fontSize: 16, fill: 0xffe066, fontWeight: 'bold' },
    });
    this.coinLabel.anchor.set(0.5);
    this.coinLabel.position.set(400, 82);
    this.ui.addChild(this.coinLabel);

    CATALOG.forEach((entry, i) => {
      const cx = 130 + (i % 4) * 180;
      const cy = 160 + Math.floor(i / 4) * 150;
      const ring = new Graphics();
      ring.position.set(cx, cy);
      const icon = new Sprite(textures.get(entry.icon));
      icon.anchor.set(0.5);
      icon.scale.set(0.8);
      icon.position.set(cx, cy);
      const name = new Text({
        text: '',
        style: { fontFamily: 'Verdana', fontSize: 11, fill: 0xffffff, fontWeight: 'bold', align: 'center', wordWrap: true, wordWrapWidth: 160 },
      });
      name.anchor.set(0.5, 0);
      name.position.set(cx, cy + 42);
      const price = new Text({
        text: '',
        style: { fontFamily: 'Verdana', fontSize: 12, fill: 0xffe066, fontWeight: 'bold' },
      });
      price.anchor.set(0.5, 0);
      price.position.set(cx, cy + 70);
      this.ui.addChild(ring, icon, name, price);
      this.cards.push({ icon, name, price, ring });
    });

    const hint = new Text({
      text: '← → select  ·  ATTACK (J) buy  ·  ESC / DASH leave',
      style: { fontFamily: 'Verdana', fontSize: 12, fill: 0xcccccc },
    });
    hint.anchor.set(0.5);
    hint.position.set(400, 450);
    this.ui.addChild(hint);
  }

  private refreshUi(): void {
    this.coinLabel.text = `${this.backend.coins()} coins`;
    CATALOG.forEach((entry, i) => {
      const card = this.cards[i];
      const price = this.backend.price(entry.key);
      card.name.text = this.backend.name(entry.key);
      card.price.text = price === null ? 'SOLD OUT' : `${price} c`;
      card.price.style.fill = price === null ? 0x888888 : this.backend.coins() >= (price ?? 0) ? 0xffe066 : 0xff6666;
      card.icon.alpha = price === null ? 0.35 : 1;
      card.ring.clear();
      if (i === this.selected) card.ring.roundRect(-80, -45, 160, 145).stroke({ color: 0xffe066, width: 3 });
    });
  }

  private openShop(): void {
    this.state = 'open';
    this.spriter.playAnim('showwares', 'wares_idle');
    audio.play('shopkeeper_welcome');
    this.welcomeTimer = 1.25; // then "what are ya buyin"
    audio.playMusic('shop', 0.8);
    this.selected = 0;
    this.refreshUi();
    this.ui.visible = true;
  }

  /** player chose to leave (or bought everything they wanted) */
  private closeShop(): void {
    this.state = 'closing';
    this.ui.visible = false;
    audio.play('shopkeeper_comeBack');
    this.spriter.playAnim('hidewares', 'idle');
    this.closeOutTimer = 1.2;
    this.onClosed?.();
  }

  private leave(): void {
    this.state = 'out';
    audio.play('teleportOut');
    this.spriter.playAnim('teleport_out', '', () => {
      this.state = 'gone';
    }, true);
  }

  /** drive the NPC; player may be null while dead */
  update(dt: number, player: PlayerController): void {
    this.spriter.advanceTime(dt);

    if (this.welcomeTimer > 0) {
      this.welcomeTimer -= dt;
      if (this.welcomeTimer <= 0) audio.play('shopkeeper_whatAreYaBuyin');
    }

    switch (this.state) {
      case 'in':
        if (this.spriter.currentAnimationName === 'idle') this.state = 'idle';
        break;
      case 'idle':
        this.leaveTimer -= dt;
        if (this.leaveTimer <= 0) {
          this.leave();
          break;
        }
        if (!player.dead && player.onGround && Math.abs(player.x - this.x) < 55) {
          this.openShop();
        }
        break;
      case 'closing':
        this.closeOutTimer -= dt;
        if (this.closeOutTimer <= 0) this.leave();
        break;
      default:
        break;
    }
  }

  /** shop navigation while the UI is open (world sim is paused) */
  pollInput(input: Input): void {
    if (this.state !== 'open') return;
    if (input.justPressed('left')) {
      this.selected = (this.selected + CATALOG.length - 1) % CATALOG.length;
      this.refreshUi();
    }
    if (input.justPressed('right')) {
      this.selected = (this.selected + 1) % CATALOG.length;
      this.refreshUi();
    }
    if (input.justPressed('attack') || input.justPressed('jump')) {
      const result = this.backend.buy(CATALOG[this.selected].key);
      if (result === 'ok') {
        audio.play('store_itemBought');
        audio.playRandom(['shopkeeper_isThatAll', 'shopkeeper_thankyou'], 0.35);
      } else {
        audio.play('store_notEnough');
      }
      this.refreshUi();
    }
    if (input.justPressed('pause') || input.justPressed('dash')) {
      this.closeShop();
    }
  }

  dispose(): void {
    this.spriter.parent?.removeChild(this.spriter);
    this.spriter.destroy();
    this.ui.destroy({ children: true });
  }
}
