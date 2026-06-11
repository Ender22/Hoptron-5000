# Phase F spec — mined from SceneManager.as / MGC.as (2026-06-11 session)

## Scenes.xml format (copied to public/data/Scenes.xml)

- `<SCENES><MAIN_SCENES>` (story, by array index) + `<EXTRA_SCENES>` (between-level jokes, cycled by extraSceneReached counter, wraps).
- Scene = sequence of `<action>` nodes. Per-action fields (all optional):
  - `@delay` (s before processing), `@continueTime` (s auto-advance — no tap)
  - `<hoptron>` text (left speaker) / `<magicMan>` text (right speaker); `@voice` = scene mp3; `@cus_var="deaths"` replaces `$$` with total deaths
  - `<sound>name</sound>`, `<music>track</music>`, `<stopmusic/>`, `<normalmusic/>`
  - `<mm_animation @nextAnimation>`, `<ht_animation>`, `<currentEnemy_animation/setTalk/setIdle>`
  - `<trigger>`: BlurBG/UnBlurBG, TweenInTalkSequence, ChangeMusic(@music,@fadeInTime), StealUpgrades, mm_flip, giveBurritoSequence1/2, shootBurrito01/02, startBurrito, throwCake, disableContinuePress (unskippable farts), loadFinal, startFinalBattle, showDB

## Scene selection (original initSceneManager, runs when MM enters after the boss dies)

- level < 10: first time (furthestSceneReached < currentLevel) → MAIN_SCENES[currentLevel], bump furthest; else EXTRA_SCENES[extraSceneReached++ % count]
- level == 10 → MAIN_SCENES[10] pre-final; 11..14 hardcoded final-zone chain (burrito/MM phase2/identity/DikBot reveal w/ scene ids 6/7 + showDB)

## Presentation numbers

- Bubbles: BigTalkBG9 (left, scale9 352,0,3,14) / BigTalk2BG9 (right, scale9 0,0,2,14), 800x130 at y=350. Standalone PNGs in public/assets/textures/.
- Icons: talkicon_Hoptron x=50 y=415, talkicon_MM x=750 y=415 (pivot center, pop in EASE_OUT_BACK 0.2s, out 0.1s); talkicon_DB swap on showDB.
- Text: 500x120, size 22 white; left x=140, right x=180, y=340.
- Typewriter: 1 letter / 0.015s; per-letter sfx bunny_letter / mm_letter; tap during typing = dump full text + bunny_talk_speedup / mm_talk_speedup; tap after = continueScene.
- BG gets BlurFilter(2,2) during scenes. MM + bunny stage actors animate behind the box (magicman_scon + TA_Magicman-hd has dance01/startFart/fartIdle/exitThroughPortal etc.).
- Scene sounds in assets/sounds/scenes/ (Fart1/2/4, mm_laugh01/02, gotBurrito, sadloop, romanticloop, introNarration, tvCutTone, dikbot_revealed...).

## Intro (MGC) — NOT BUILT YET

intro1-3.jpg + introSubs.xml subtitles (`<sub><duration><text|sidetext>`; y=435 over black strip), narration mp3, timeline 0→77.5s (bunny sitTurnToCamera @14s, MM portal @27.8, steal burrito @47.5, shoot bunny @51.5...). Music: bunny_eating_burrito → magic_man_appears → through_wormhole.

## Credits (Credits.xml in public/data) — NOT BUILT YET

`<credit fontSize addSpace>` list; stack at y=520 +40 spacing (addSpace ×2.2), scroll up 0.75px/frame, visible <500, removed <100; CreditsImage.png; music ending_happy_loop → ending_credits; bossModeUnlocked=1 set after.

## Remake status (this session)

- Achievements: BUILT (Achievements.ts + Game wiring; boss-trick ones dormant).
- Dialogue scenes: BUILT as condensed SceneManager (DialogueScene.ts): MAIN/EXTRA selection per original, typewriter + letter sfx + speedup, talk icons pop, bubble PNGs, voice/sound/music actions, blur bg, continueTime/delay, deaths cus_var, Esc skips scene. NOT built: MM/bunny stage actors + burrito/cake/steal trigger sequences, final-zone scene chain (11-14), intro, credits, DikBot.
