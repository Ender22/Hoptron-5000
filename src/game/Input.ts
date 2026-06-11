/**
 * Unified keyboard + gamepad input with edge detection and input buffering.
 * Buffered presses are the backbone of the combo system (the original game
 * buffered attack taps mid-swing via `attackPressedAgain`).
 */

export type GameAction = 'left' | 'right' | 'down' | 'jump' | 'attack' | 'dash' | 'throw' | 'spell1' | 'spell2' | 'pause';

const KEY_BINDINGS: Record<string, GameAction> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'jump',
  KeyW: 'jump',
  ArrowUp: 'jump',
  KeyJ: 'attack',
  KeyX: 'attack',
  KeyK: 'dash',
  KeyC: 'dash',
  KeyL: 'throw',
  KeyV: 'throw',
  KeyQ: 'spell1',
  KeyE: 'spell2',
  Escape: 'pause',
};

// standard gamepad mapping
const PAD_BUTTONS: Partial<Record<number, GameAction>> = {
  0: 'jump', // A / Cross
  2: 'attack', // X / Square
  1: 'dash', // B / Circle
  3: 'throw', // Y / Triangle
  4: 'spell1', // LB
  5: 'spell2', // RB
  9: 'pause', // Start
  13: 'down', // d-pad
  14: 'left',
  15: 'right',
};

const ACTIONS: GameAction[] = ['left', 'right', 'down', 'jump', 'attack', 'dash', 'throw', 'spell1', 'spell2', 'pause'];
const STICK_DEADZONE = 0.35;

export class Input {
  private down = new Set<GameAction>();
  private pressedThisFrame = new Set<GameAction>();
  private keyboardDown = new Set<GameAction>();
  private bufferTimes = new Map<GameAction, number>();
  private now = 0;

  /** -1..1 horizontal movement (stick overrides buttons when larger) */
  axisX = 0;
  /** -1..1 vertical (for aiming / fall-attack input later) */
  axisY = 0;

  constructor() {
    window.addEventListener('keydown', (e) => {
      const action = KEY_BINDINGS[e.code];
      if (!action) return;
      e.preventDefault();
      if (!this.keyboardDown.has(action)) {
        this.keyboardDown.add(action);
        this.onPress(action);
      }
    });
    window.addEventListener('keyup', (e) => {
      const action = KEY_BINDINGS[e.code];
      if (action) this.keyboardDown.delete(action);
    });
    window.addEventListener('blur', () => this.keyboardDown.clear());
  }

  private onPress(action: GameAction): void {
    this.pressedThisFrame.add(action);
    this.bufferTimes.set(action, this.now);
  }

  /** call once per frame BEFORE game logic; dt in seconds */
  update(dt: number): void {
    this.now += dt;

    // ---- gamepad poll ----
    const padDown = new Set<GameAction>();
    let stickX = 0;
    let stickY = 0;
    for (const pad of navigator.getGamepads()) {
      if (!pad) continue;
      for (const [index, action] of Object.entries(PAD_BUTTONS)) {
        if (pad.buttons[Number(index)]?.pressed && action) padDown.add(action);
      }
      if (Math.abs(pad.axes[0] ?? 0) > Math.abs(stickX)) stickX = pad.axes[0] ?? 0;
      if (Math.abs(pad.axes[1] ?? 0) > Math.abs(stickY)) stickY = pad.axes[1] ?? 0;
      break; // first connected pad wins
    }
    if (Math.abs(stickX) < STICK_DEADZONE) stickX = 0;
    if (Math.abs(stickY) < STICK_DEADZONE) stickY = 0;
    if (stickX < 0) padDown.add('left');
    if (stickX > 0) padDown.add('right');
    if (stickY > 0.5) padDown.add('down');

    // gamepad edge detection
    for (const action of padDown) {
      if (!this.down.has(action) && !this.keyboardDown.has(action)) this.onPress(action);
    }

    // merge keyboard + pad held state
    const newDown = new Set<GameAction>(this.keyboardDown);
    for (const a of padDown) newDown.add(a);
    this.down = newDown;

    // movement axis
    if (stickX !== 0) {
      this.axisX = stickX;
    } else {
      this.axisX = (this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0);
    }
    this.axisY = stickY;
  }

  /** call once per frame AFTER game logic */
  postUpdate(): void {
    this.pressedThisFrame.clear();
  }

  isDown(action: GameAction): boolean {
    return this.down.has(action);
  }

  /** true only on the frame the action was first pressed */
  justPressed(action: GameAction): boolean {
    return this.pressedThisFrame.has(action);
  }

  /** true if pressed within the last `window` seconds (input buffering) */
  buffered(action: GameAction, window: number): boolean {
    const t = this.bufferTimes.get(action);
    return t !== undefined && this.now - t <= window;
  }

  /** consume a buffered press so it can't double-trigger */
  consumeBuffer(action: GameAction): void {
    this.bufferTimes.delete(action);
  }
}
