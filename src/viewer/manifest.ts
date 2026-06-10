/**
 * Maps every Spriter .scon to the texture atlas(es) its sprites live in.
 * Pairings taken from the original game's XML data (BossModeEnemies.xml,
 * AdventureModeEnemies.xml) and LevelBase/MGC loading code.
 *
 * Not listed: dikbot_scml.scml and ending_magicman.scml (old XML format —
 * only used in cutscenes; SCML support can come later if needed).
 */
export interface CharacterEntry {
  id: string;
  label: string;
  scon: string;
  atlases: string[];
}

const SCML = 'assets/scml';
const TA = 'assets/textureAtlas';

export const CHARACTERS: CharacterEntry[] = [
  { id: 'bunny', label: 'Hoptron (bunny)', scon: `${SCML}/bunny_scon.scon`, atlases: [`${TA}/bunny/TA_Bunny-hd.xml`] },
  { id: 'magicman', label: 'Magic Man (story)', scon: `${SCML}/magicman_scon.scon`, atlases: [`${TA}/magicman/TA_Magicman-hd.xml`] },
  { id: 'magicman_fight', label: 'Magic Man (boss fight)', scon: `${SCML}/magicMan_Fight_scon.scon`, atlases: [`${TA}/magicman/TA_Magicman-hd.xml`] },
  { id: 'shopkeeper', label: 'Shopkeeper', scon: `${SCML}/shopkeeper_scon.scon`, atlases: [`${TA}/shopkeeper/TA_Shopkeeper-hd.xml`] },
  { id: 'heart', label: 'Heart (boss mode HP)', scon: `${SCML}/heart_scon.scon`, atlases: [`${TA}/heart/TA_Heart-hd.xml`] },

  { id: 'fruit', label: 'Enemies: Fruit (L1)', scon: `${SCML}/fruit_scon.scon`, atlases: [`${TA}/enemies/fruit/fruit_enemies-hd.xml`] },
  { id: 'veg', label: 'Enemies: Veg (L2)', scon: `${SCML}/veg_scon.scon`, atlases: [`${TA}/enemies/veg/veg_enemies-hd.xml`] },
  { id: 'dessert', label: 'Enemies: Dessert (L3)', scon: `${SCML}/dessert_scon.scon`, atlases: [`${TA}/enemies/dessert/dessert_enemies-hd.xml`] },
  { id: 'asian', label: 'Enemies: Asian (L4)', scon: `${SCML}/asian_scon.scon`, atlases: [`${TA}/enemies/asian/asian_enemies-hd.xml`] },
  { id: 'ffood', label: 'Enemies: Fast Food (L5)', scon: `${SCML}/ffood_scon.scon`, atlases: [`${TA}/enemies/ffood/ffood_enemies-hd.xml`] },
  { id: 'final', label: 'Enemies: Final (L6)', scon: `${SCML}/final_scon.scon`, atlases: [`${TA}/enemies/final/final_enemies-hd.xml`] },

  { id: 'boss_watermelon', label: 'Boss: Watermelon', scon: `${SCML}/boss_watermelon.scon`, atlases: [`${TA}/enemies/fruit/fruit_enemies-hd.xml`] },
  { id: 'boss_durian', label: 'Boss: Durian', scon: `${SCML}/boss_durian.scon`, atlases: [`${TA}/enemies/fruit/fruit_enemies-hd.xml`] },
  { id: 'boss_eggplant', label: 'Boss: Eggplant', scon: `${SCML}/boss_eggplant.scon`, atlases: [`${TA}/enemies/veg/veg_enemies-hd.xml`] },
  { id: 'boss_pumpkin', label: 'Boss: Pumpkin', scon: `${SCML}/boss_pumpkin.scon`, atlases: [`${TA}/enemies/veg/veg_enemies-hd.xml`] },
  { id: 'boss_sundae', label: 'Boss: Sundae', scon: `${SCML}/boss_sundae.scon`, atlases: [`${TA}/enemies/dessert/dessert_enemies-hd.xml`] },
  { id: 'boss_cake', label: 'Boss: Cake', scon: `${SCML}/boss_cake.scon`, atlases: [`${TA}/enemies/dessert/dessert_enemies-hd.xml`] },
  { id: 'boss_noodles', label: 'Boss: Noodles', scon: `${SCML}/boss_noodles.scon`, atlases: [`${TA}/enemies/asian/asian_enemies-hd.xml`] },
  { id: 'boss_sushichef', label: 'Boss: Sushi Chef', scon: `${SCML}/boss_sushichef.scon`, atlases: [`${TA}/enemies/asian/asian_enemies-hd.xml`] },
  { id: 'boss_hamburger', label: 'Boss: Hamburger', scon: `${SCML}/boss_hamburger.scon`, atlases: [`${TA}/enemies/ffood/ffood_enemies-hd.xml`] },
  { id: 'boss_combo', label: 'Boss: Combo', scon: `${SCML}/boss_combo.scon`, atlases: [`${TA}/enemies/ffood/ffood_enemies-hd.xml`] },

  { id: 'introbunny', label: 'Intro: Bunny', scon: `${SCML}/introbunny_scon.scon`, atlases: [`${TA}/bunny/TA_Bunny-hd.xml`, `${TA}/titleOnly/titleOnly-hd.xml`] },
  { id: 'intro_magicman', label: 'Intro: Magic Man', scon: `${SCML}/intro_magicman.scon`, atlases: [`${TA}/magicman/TA_Magicman-hd.xml`, `${TA}/titleOnly/titleOnly-hd.xml`] },
];
