/**
 * In-game debug panel (Phase A tooling). DOM overlay so it never touches the
 * Pixi stage; toggled with backquote, starts open with ?debug in the URL.
 * Everything routes through DebugHooks implemented in Game.ts.
 */

export interface DebugHooks {
  levelCount: number;
  gotoLevel(n: number): void; // 1-based
  bossNow(): void;
  spawnEnemy(name: string): void;
  enemyNames(): string[];
  giveCoins(amount: number): void;
  giveStars(amount: number): void;
  fullHeal(): void;
  toggleGod(): boolean;
  killAll(): void;
  resetCooldowns(): void;
  setGameSpeed(scale: number): void;
  toggleHitboxes(): boolean;
}

const PANEL_CSS = `
  position: fixed; top: 8px; right: 8px; z-index: 1000;
  background: rgba(10, 12, 20, 0.92); color: #cfe2ff;
  font: 11px/1.5 Consolas, monospace; padding: 10px; border-radius: 8px;
  border: 1px solid #2f5cff; width: 220px; user-select: none;
`;
const BTN_CSS = `
  background: #1b2440; color: #cfe2ff; border: 1px solid #3a4a80;
  border-radius: 4px; font: 11px Consolas, monospace; padding: 2px 7px;
  margin: 1px; cursor: pointer;
`;

export class DebugPanel {
  private el: HTMLDivElement;
  private hooks: DebugHooks;
  private godBtn!: HTMLButtonElement;
  private hitboxBtn!: HTMLButtonElement;
  private enemySelect!: HTMLSelectElement;
  private speedBtns: HTMLButtonElement[] = [];

  constructor(hooks: DebugHooks) {
    this.hooks = hooks;
    this.el = document.createElement('div');
    this.el.style.cssText = PANEL_CSS;
    this.el.style.display = new URLSearchParams(location.search).has('debug') ? 'block' : 'none';
    this.build();
    document.body.appendChild(this.el);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote') {
        e.preventDefault();
        this.el.style.display = this.el.style.display === 'none' ? 'block' : 'none';
        if (this.el.style.display === 'block') this.refreshEnemyList();
      }
    });
  }

  get visible(): boolean {
    return this.el.style.display !== 'none';
  }

  /** repopulate the enemy dropdown (call after level changes) */
  refreshEnemyList(): void {
    const names = this.hooks.enemyNames();
    this.enemySelect.innerHTML = '';
    for (const n of names) {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      this.enemySelect.appendChild(opt);
    }
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.style.cssText = BTN_CSS;
    b.textContent = label;
    b.addEventListener('click', () => {
      onClick();
      b.blur(); // keep keyboard input going to the game
    });
    return b;
  }

  private row(...children: HTMLElement[]): HTMLDivElement {
    const d = document.createElement('div');
    d.style.margin = '2px 0';
    d.append(...children);
    return d;
  }

  private label(text: string): HTMLSpanElement {
    const s = document.createElement('span');
    s.textContent = text;
    s.style.cssText = 'display:inline-block;width:52px;color:#7f97d9;';
    return s;
  }

  private build(): void {
    const title = document.createElement('div');
    title.textContent = 'DEBUG  (` to hide)';
    title.style.cssText = 'font-weight:bold;color:#5d8bff;margin-bottom:6px;';
    this.el.appendChild(title);

    // level skip
    const levelRow = this.row(this.label('level'));
    for (let n = 1; n <= this.hooks.levelCount; n++) {
      levelRow.appendChild(this.button(String(n), () => {
        this.hooks.gotoLevel(n);
        setTimeout(() => this.refreshEnemyList(), 500);
      }));
    }
    this.el.appendChild(levelRow);
    this.el.appendChild(this.row(this.label('boss'), this.button('jump to boss', () => this.hooks.bossNow())));

    // enemy spawn
    this.enemySelect = document.createElement('select');
    this.enemySelect.style.cssText = BTN_CSS + 'width:110px;';
    this.el.appendChild(
      this.row(this.label('spawn'), this.enemySelect, this.button('go', () => this.hooks.spawnEnemy(this.enemySelect.value))),
    );
    this.refreshEnemyList();

    // resources
    this.el.appendChild(
      this.row(
        this.label('give'),
        this.button('+500c', () => this.hooks.giveCoins(500)),
        this.button('+30★', () => this.hooks.giveStars(30)),
        this.button('heal', () => this.hooks.fullHeal()),
      ),
    );

    // combat toggles
    this.godBtn = this.button('god: off', () => {
      this.godBtn.textContent = `god: ${this.hooks.toggleGod() ? 'ON' : 'off'}`;
    });
    this.el.appendChild(
      this.row(
        this.label('combat'),
        this.godBtn,
        this.button('kill all', () => this.hooks.killAll()),
        this.button('reset cd', () => this.hooks.resetCooldowns()),
      ),
    );

    // game speed
    const speedRow = this.row(this.label('speed'));
    for (const s of [0.25, 0.5, 1, 2]) {
      const b = this.button(String(s), () => {
        this.hooks.setGameSpeed(s);
        for (const sb of this.speedBtns) sb.style.background = '#1b2440';
        b.style.background = '#2f5cff';
      });
      if (s === 1) b.style.background = '#2f5cff';
      this.speedBtns.push(b);
      speedRow.appendChild(b);
    }
    this.el.appendChild(speedRow);

    // hitboxes
    this.hitboxBtn = this.button('hitboxes: off', () => {
      this.hitboxBtn.textContent = `hitboxes: ${this.hooks.toggleHitboxes() ? 'ON' : 'off'}`;
    });
    this.el.appendChild(this.row(this.label('view'), this.hitboxBtn));
  }
}
