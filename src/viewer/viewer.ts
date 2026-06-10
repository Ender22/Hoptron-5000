/**
 * Animation viewer — debug tool for auditing every Spriter character,
 * entity, and animation in the game, including reverse playback (the
 * fall-attack audition) and pose scrubbing.
 */
import { Application, Container, Graphics, Ticker } from 'pixi.js';
import { loadStarlingAtlas, mergeTextureMaps } from '../assets/starlingAtlas';
import { parseScon } from '../spriter/parseScon';
import { SpriterPlayer } from '../spriter/SpriterPlayer';
import type { SpriterData } from '../spriter/model';
import { CHARACTERS, type CharacterEntry } from './manifest';

const STAGE_W = 800;
const STAGE_H = 480;
const GROUND_Y = 325; // original LevelBase.groundY

interface LoadedCharacter {
  entry: CharacterEntry;
  data: SpriterData;
  player: SpriterPlayer;
}

export async function startViewer(root: HTMLElement): Promise<void> {
  root.innerHTML = `
    <div style="display:flex; height:100vh;">
      <div id="panel" style="width:300px; min-width:300px; overflow-y:auto; padding:12px; background:#16213e; box-sizing:border-box;">
        <h2 style="margin:0 0 4px;">Hoptron 5001</h2>
        <div style="opacity:0.7; font-size:12px; margin-bottom:12px;">Animation Viewer</div>

        <label style="font-size:12px;">Character</label>
        <select id="charSelect" style="width:100%; margin:4px 0 10px; padding:4px;"></select>

        <label style="font-size:12px;">Entity</label>
        <select id="entitySelect" style="width:100%; margin:4px 0 10px; padding:4px;"></select>

        <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
          <button id="playPause" style="padding:4px 10px;">Pause</button>
          <label style="font-size:12px;"><input type="checkbox" id="reverse"> Reverse</label>
          <label style="font-size:12px;"><input type="checkbox" id="flip"> Flip X</label>
        </div>

        <label style="font-size:12px;">Speed: <span id="speedVal">1.00</span>x</label>
        <input type="range" id="speed" min="5" max="200" value="100" style="width:100%;">

        <label style="font-size:12px;">Scrub: <span id="timeVal">0 / 0 ms</span></label>
        <input type="range" id="scrub" min="0" max="1000" value="0" style="width:100%;">

        <label style="font-size:12px;">Zoom: <span id="zoomVal">1.0</span>x</label>
        <input type="range" id="zoom" min="25" max="300" value="100" style="width:100%; margin-bottom:10px;">

        <div id="animList"></div>
      </div>
      <div id="stageHolder" style="flex:1; display:flex; align-items:center; justify-content:center; background:#0f0f23;"></div>
    </div>
  `;

  const app = new Application();
  await app.init({ width: STAGE_W, height: STAGE_H, background: 0x2a2a4a, antialias: true });
  document.getElementById('stageHolder')!.appendChild(app.canvas);
  app.canvas.style.maxWidth = '100%';
  app.canvas.style.maxHeight = '100%';

  // ground reference line + origin marker
  const guides = new Graphics();
  guides.moveTo(0, GROUND_Y).lineTo(STAGE_W, GROUND_Y).stroke({ width: 1, color: 0x55ff88, alpha: 0.5 });
  app.stage.addChild(guides);

  const world = new Container();
  world.position.set(STAGE_W / 2, GROUND_Y);
  app.stage.addChild(world);

  const originMarker = new Graphics();
  originMarker.circle(0, 0, 3).fill({ color: 0xff5555, alpha: 0.8 });
  world.addChild(originMarker);

  const charSelect = document.getElementById('charSelect') as HTMLSelectElement;
  const entitySelect = document.getElementById('entitySelect') as HTMLSelectElement;
  const animList = document.getElementById('animList') as HTMLDivElement;
  const playPauseBtn = document.getElementById('playPause') as HTMLButtonElement;
  const reverseChk = document.getElementById('reverse') as HTMLInputElement;
  const flipChk = document.getElementById('flip') as HTMLInputElement;
  const speedSlider = document.getElementById('speed') as HTMLInputElement;
  const speedVal = document.getElementById('speedVal')!;
  const scrubSlider = document.getElementById('scrub') as HTMLInputElement;
  const timeVal = document.getElementById('timeVal')!;
  const zoomSlider = document.getElementById('zoom') as HTMLInputElement;
  const zoomVal = document.getElementById('zoomVal')!;

  for (const c of CHARACTERS) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.label;
    charSelect.appendChild(opt);
  }

  const cache = new Map<string, LoadedCharacter>();
  let current: LoadedCharacter | null = null;
  let playing = true;
  let scrubbing = false;

  async function loadCharacter(id: string): Promise<void> {
    const entry = CHARACTERS.find((c) => c.id === id)!;

    if (current) {
      world.removeChild(current.player);
    }

    let loaded = cache.get(id);
    if (!loaded) {
      const [sconJson, ...atlases] = await Promise.all([
        fetch(entry.scon).then((r) => {
          if (!r.ok) throw new Error(`Failed to load ${entry.scon}`);
          return r.json();
        }),
        ...entry.atlases.map(loadStarlingAtlas),
      ]);
      const data = parseScon(sconJson);
      const player = new SpriterPlayer(entry.id, data, mergeTextureMaps(atlases));
      loaded = { entry, data, player };
      cache.set(id, loaded);
    }

    current = loaded;
    // re-apply UI state to the (possibly cached) player
    loaded.player.reverse = reverseChk.checked;
    loaded.player.scale.x = flipChk.checked ? -1 : 1;
    loaded.player.playbackSpeed = Number(speedSlider.value) / 100;
    world.addChild(loaded.player);
    populateEntities();
  }

  function populateEntities(): void {
    if (!current) return;
    entitySelect.innerHTML = '';
    for (const e of current.data.entities) {
      const opt = document.createElement('option');
      opt.value = e.name;
      opt.textContent = `${e.name} (${e.animations.length} anims)`;
      entitySelect.appendChild(opt);
    }
    selectEntity(current.data.entities[0].name);
  }

  function selectEntity(name: string): void {
    if (!current) return;
    current.player.setEntity(name);
    populateAnimations();
  }

  function populateAnimations(): void {
    if (!current) return;
    animList.innerHTML = '';
    const entity = current.player.entity;
    for (const anim of entity.animations) {
      const btn = document.createElement('button');
      btn.textContent = `${anim.name}  (${anim.length}ms)`;
      btn.style.cssText =
        'display:block; width:100%; text-align:left; margin:2px 0; padding:5px 8px; background:#0f3460; color:#eee; border:none; border-radius:4px; cursor:pointer; font-size:12px;';
      btn.onclick = () => {
        for (const b of Array.from(animList.children)) (b as HTMLElement).style.background = '#0f3460';
        btn.style.background = '#e94560';
        current!.player.playAnim(anim.name, '', null, true);
        scrubSlider.max = String(anim.length);
      };
      animList.appendChild(btn);
    }
    (animList.firstChild as HTMLButtonElement | null)?.click();
  }

  // ----- controls -----
  charSelect.onchange = () => void loadCharacter(charSelect.value);
  entitySelect.onchange = () => selectEntity(entitySelect.value);

  playPauseBtn.onclick = () => {
    playing = !playing;
    playPauseBtn.textContent = playing ? 'Pause' : 'Play';
  };
  reverseChk.onchange = () => {
    if (current) current.player.reverse = reverseChk.checked;
  };
  flipChk.onchange = () => {
    if (current) current.player.scale.x = flipChk.checked ? -1 : 1;
  };
  speedSlider.oninput = () => {
    const v = Number(speedSlider.value) / 100;
    speedVal.textContent = v.toFixed(2);
    if (current) current.player.playbackSpeed = v;
  };
  zoomSlider.oninput = () => {
    const v = Number(zoomSlider.value) / 100;
    zoomVal.textContent = v.toFixed(1);
    world.scale.set(v);
  };
  scrubSlider.onpointerdown = () => {
    scrubbing = true;
    playing = false;
    playPauseBtn.textContent = 'Play';
  };
  scrubSlider.onpointerup = () => {
    scrubbing = false;
  };
  scrubSlider.oninput = () => {
    if (!current) return;
    current.player.timeMs = Number(scrubSlider.value);
    current.player.advanceTime(0);
  };

  app.ticker.add((ticker: Ticker) => {
    if (!current) return;
    if (playing) {
      current.player.advanceTime(ticker.deltaMS / 1000);
    }
    const anim = current.player.currentAnimation;
    if (anim && !scrubbing) {
      const t = Math.floor(anim.looping ? current.player.timeMs % Math.max(anim.length, 1) : Math.min(current.player.timeMs, anim.length));
      timeVal.textContent = `${t} / ${anim.length} ms`;
      scrubSlider.value = String(t);
    }
  });

  await loadCharacter(CHARACTERS[0].id);
}
