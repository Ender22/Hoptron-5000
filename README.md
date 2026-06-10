# Hoptron 5001

Browser remake of **Hoptron 5000 / SamuraiRobotBunny** (2015 Flash/Adobe AIR + Starling), rebuilt in TypeScript + PixiJS v8. Original game data (Spriter animations, texture atlases, enemy/level XML, sounds, particles) is reused as-is; all code is new.

## Run

```
npm install
npm run dev
```

- `http://localhost:5173/` — game (keyboard + gamepad)
- `http://localhost:5173/?viewer` — animation viewer (every character/entity/animation, scrub, speed, reverse playback)

## Controls (v1)

| Action | Keyboard | Gamepad |
|---|---|---|
| Move | A/D or ←/→ | Stick / d-pad |
| Jump (double) | Space / W / ↑ | A |
| Attack combo | J / X | X |
| Dash | K / C | B |
| Throw | L / V | Y |
| Spells | Q / E | LB / RB |

## Architecture

- `src/spriter/` — Spriter (.scon) runtime: parser + playback math (verbatim behavioral port of the original game's AS3 runtime, which was BrashMonkey's reference implementation) + Pixi-based `SpriterPlayer` with animation chaining, sound triggers, points/boxes, reverse playback.
- `src/assets/` — Starling-format texture atlas loader.
- `src/game/` — game shell: unified input (keyboard+gamepad, buffering), `PlayerController` with the original's physics constants (retuned per design: faster accel, double jump, dash).
- `src/viewer/` — animation debug viewer.
- `public/assets/` — original game assets (atlases, .scon animations, sounds, particles, fonts).
- `public/data/` — original game design data (enemies, wave segments, shops, credits).

Design decisions and original-code findings are tracked in the project memory (see `D:\Dropbox\MyGames\SamuraiRobot2.0` for original source).
