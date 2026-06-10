/**
 * Spriter playback math — a verbatim behavioral port of the original game's
 * AS3 runtime (com.acemobe.spriter.data.Animation / TimelineKey).
 * Pure data-in/data-out; no rendering dependencies.
 */
import {
  CurveType,
  fixRotation,
  DEG_TO_RAD,
  ObjectType,
  type MainlineKey,
  type Ref,
  type ResolvedKey,
  type SpriterAnimationData,
  type SpriterData,
  type TimelineKey,
} from './model';

function linear(a: number, b: number, t: number): number {
  return (b - a) * t + a;
}

function quadratic(a: number, b: number, c: number, t: number): number {
  return linear(linear(a, b, t), linear(b, c, t), t);
}

function cubic(a: number, b: number, c: number, d: number, t: number): number {
  return linear(quadratic(a, b, c, t), quadratic(b, c, d, t), t);
}

function angleLinear(angleA: number, angleB: number, spin: number, t: number): number {
  if (spin === 0) return angleA;
  if (spin > 0) {
    if (angleB - angleA < 0) angleB += 360;
  } else {
    if (angleB - angleA > 0) angleB -= 360;
  }
  return linear(angleA, angleB, t);
}

/** Normalized 0..1 progress between keyA and keyB honoring keyA's curve type. */
function getTWithNextKey(keyA: TimelineKey, nextKeyTime: number, currentTime: number): number {
  if (keyA.curveType === CurveType.Instant || keyA.time === nextKeyTime) return 0;
  const t = (currentTime - keyA.time) / (nextKeyTime - keyA.time);
  switch (keyA.curveType) {
    case CurveType.Linear:
      return t;
    case CurveType.Quadratic:
      return quadratic(0, keyA.c1, 1, t);
    case CurveType.Cubic:
      return cubic(0, keyA.c1, keyA.c2, 1, t);
    default:
      return 0;
  }
}

/** Mutable working copy used while resolving a frame. */
interface WorkKey {
  x: number;
  y: number;
  angle: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  pivotX: number;
  pivotY: number;
  useDefaultPivot: boolean;
  source: TimelineKey;
}

function workFromKey(key: TimelineKey): WorkKey {
  return {
    x: key.x,
    y: key.y,
    angle: key.angle,
    scaleX: key.scaleX,
    scaleY: key.scaleY,
    alpha: key.alpha,
    pivotX: key.pivotX,
    pivotY: key.pivotY,
    useDefaultPivot: key.useDefaultPivot,
    source: key,
  };
}

function lerpInto(work: WorkKey, keyB: TimelineKey, t: number): void {
  const a = work;
  a.x = linear(a.x, keyB.x, t);
  a.y = linear(a.y, keyB.y, t);
  a.angle = angleLinear(a.angle, keyB.angle, work.source.spin, t);
  a.scaleX = linear(a.scaleX, keyB.scaleX, t);
  a.scaleY = linear(a.scaleY, keyB.scaleY, t);
  a.alpha = linear(a.alpha, keyB.alpha, t);
  // sprite keys with explicit pivots interpolate them too (matches SpriteTimelineKey.linearKey)
  if (!a.useDefaultPivot) {
    a.pivotX = linear(a.pivotX, keyB.pivotX, t);
    a.pivotY = linear(a.pivotY, keyB.pivotY, t);
  }
}

/** Transform a child's spatial info into its parent's space (verbatim unmapFromParent). */
function unmapFromParent(child: WorkKey, parent: WorkKey): void {
  if (parent.scaleX * parent.scaleY < 0) {
    child.angle = 360 - child.angle + parent.angle;
  } else {
    child.angle += parent.angle;
  }

  child.scaleX *= parent.scaleX;
  child.scaleY *= parent.scaleY;
  child.alpha *= parent.alpha;

  if (child.x !== 0 || child.y !== 0) {
    const newAngle = fixRotation(parent.angle) * DEG_TO_RAD;
    const preMultX = child.x * parent.scaleX;
    const preMultY = child.y * parent.scaleY;
    const s = Math.sin(newAngle);
    const c = Math.cos(newAngle);
    child.x = preMultX * c - preMultY * s;
    child.y = preMultX * s + preMultY * c;
    child.x += parent.x;
    child.y += parent.y;
  } else {
    child.x = parent.x;
    child.y = parent.y;
  }
}

function mainlineKeyFromTime(anim: SpriterAnimationData, time: number): MainlineKey {
  const keys = anim.mainlineKeys;
  let current = 0;
  for (let m = 0; m < keys.length; m++) {
    if (keys[m].time <= time) current = m;
    if (keys[m].time >= time) break;
  }
  return keys[current];
}

function keyFromRef(anim: SpriterAnimationData, ref: Ref, time: number): WorkKey {
  const timeline = anim.timelines[ref.timeline];
  const keyA = timeline.keys[ref.key];
  const work = workFromKey(keyA);

  if (timeline.keys.length === 1) return work;

  let nextKeyIndex = ref.key + 1;
  if (nextKeyIndex >= timeline.keys.length) {
    if (anim.looping) {
      nextKeyIndex = 0;
    } else {
      return work;
    }
  }

  const keyB = timeline.keys[nextKeyIndex];
  let keyBTime = keyB.time;
  if (keyBTime < keyA.time) keyBTime += anim.length;

  lerpInto(work, keyB, getTWithNextKey(keyA, keyBTime, time));
  return work;
}

export interface FrameResult {
  /** resolved drawable/queryable objects in z order */
  objects: ResolvedKey[];
  /** time within the animation (ms) after looping/clamping */
  time: number;
  /** true when the raw time has reached/passed the animation length */
  looped: boolean;
}

/**
 * Resolve the full character pose at `rawTime` ms (verbatim
 * Animation.setCurrentTime + updateCharacter).
 */
export function resolveFrame(data: SpriterData, anim: SpriterAnimationData, rawTime: number): FrameResult {
  const looped = rawTime >= anim.length;
  const time = anim.looping ? (anim.length > 0 ? rawTime % anim.length : 0) : Math.min(rawTime, anim.length);

  const mainKey = mainlineKeyFromTime(anim, time);
  const instant = mainKey.curveType === CurveType.Instant;

  const bones: WorkKey[] = [];
  for (const boneRef of mainKey.boneRefs) {
    const work = instant
      ? workFromKey(anim.timelines[boneRef.timeline].keys[boneRef.key])
      : keyFromRef(anim, boneRef, time);
    if (boneRef.parent >= 0) unmapFromParent(work, bones[boneRef.parent]);
    bones.push(work);
  }

  const objects: ResolvedKey[] = [];
  for (const objectRef of mainKey.objectRefs) {
    const timeline = anim.timelines[objectRef.timeline];
    const work = instant
      ? workFromKey(timeline.keys[objectRef.key])
      : keyFromRef(anim, objectRef, time);
    if (objectRef.parent >= 0) unmapFromParent(work, bones[objectRef.parent]);

    const src = work.source;
    let file = null;
    let folderName = '';
    if (timeline.objectType === ObjectType.Sprite) {
      const folder = data.folders[src.folder];
      folderName = folder?.name ?? '';
      file = folder?.files[src.file] ?? null;
    }

    objects.push({
      timelineName: timeline.name,
      objectType: timeline.objectType,
      x: work.x,
      y: work.y,
      angle: work.angle,
      scaleX: work.scaleX,
      scaleY: work.scaleY,
      alpha: work.alpha,
      file,
      folderName,
      useDefaultPivot: work.useDefaultPivot,
      pivotX: work.pivotX,
      pivotY: work.pivotY,
    });
  }

  return { objects, time, looped };
}
