/**
 * Spriter (BrashMonkey) data model, matching the structures of the original
 * game's AS3 runtime (com.acemobe.spriter). Field semantics are kept
 * deliberately identical to that runtime because all the game's .scon data
 * was authored against it:
 *  - `y` values are stored NEGATED (Spriter is Y-up, screen is Y-down)
 *  - file names have their ".png" extension stripped
 *  - sprite pivot defaults are (0, 1) i.e. top-left after Y-flip
 */

export enum CurveType {
  Instant = 0,
  Linear = 1,
  Quadratic = 2,
  Cubic = 3,
}

export enum ObjectType {
  Sprite = 0,
  Bone = 1,
  Box = 2,
  Point = 3,
}

export interface SpriterFile {
  id: number;
  /** image name with folder path, ".png" stripped (e.g. "bunny/Bunny_Body") */
  name: string;
  /** name after the last "/" — the atlas SubTexture name (e.g. "Bunny_Body") */
  shortName: string;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
}

export interface SpriterFolder {
  id: number;
  name: string;
  files: SpriterFile[];
}

/** One keyframe on one timeline. Doubles as the per-frame interpolation result. */
export interface TimelineKey {
  id: number;
  time: number;
  spin: number;
  curveType: CurveType;
  c1: number;
  c2: number;

  // spatial info
  x: number;
  y: number;
  angle: number;
  scaleX: number;
  scaleY: number;
  alpha: number;

  // sprite-only fields (unused for bones/points/boxes)
  folder: number;
  file: number;
  useDefaultPivot: boolean;
  pivotX: number;
  pivotY: number;
}

export interface Timeline {
  id: number;
  name: string;
  objectType: ObjectType;
  keys: TimelineKey[];
}

export interface Ref {
  id: number;
  parent: number; // index into mainline key's boneRefs, -1 = none
  timeline: number;
  key: number;
  zIndex: number;
}

export interface MainlineKey {
  id: number;
  time: number;
  curveType: CurveType;
  boneRefs: Ref[];
  objectRefs: Ref[];
}

export interface SpriterAnimationData {
  id: number;
  name: string;
  /** duration in ms */
  length: number;
  looping: boolean;
  mainlineKeys: MainlineKey[];
  timelines: Timeline[];
}

export interface SpriterEntity {
  id: number;
  name: string;
  animations: SpriterAnimationData[];
}

export interface SpriterData {
  folders: SpriterFolder[];
  entities: SpriterEntity[];
}

/** A resolved (interpolated, parent-transformed) object for the current frame. */
export interface ResolvedKey {
  timelineName: string;
  objectType: ObjectType;
  x: number;
  y: number;
  angle: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  // sprite-only
  file: SpriterFile | null;
  folderName: string;
  useDefaultPivot: boolean;
  pivotX: number;
  pivotY: number;
}

/** Matches the original Spriter.fixRotation(): Spriter angles are CCW-positive, screen is CW. */
export function fixRotation(rotation: number): number {
  while (rotation < 0) rotation += 360;
  while (rotation >= 360) rotation -= 360;
  return 360 - rotation;
}

export const DEG_TO_RAD = Math.PI / 180;
