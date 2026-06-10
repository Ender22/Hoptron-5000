/**
 * Parser for Spriter .scon (JSON) files, ported from the original game's
 * com.acemobe.spriter.parsers.SpriterJSON + data classes.
 *
 * SCON quirk: many numeric fields arrive as strings ("timeline": "0"),
 * so everything is coerced through num().
 */
import {
  CurveType,
  ObjectType,
  type MainlineKey,
  type Ref,
  type SpriterAnimationData,
  type SpriterData,
  type SpriterEntity,
  type SpriterFile,
  type SpriterFolder,
  type Timeline,
  type TimelineKey,
} from './model';

function num(v: unknown, fallback = 0): number {
  if (v === undefined || v === null) return fallback;
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
}

function has(obj: Record<string, unknown>, key: string): boolean {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}

function parseCurveType(v: unknown): CurveType {
  switch (v) {
    case 'instant':
      return CurveType.Instant;
    case 'quadratic':
      return CurveType.Quadratic;
    case 'cubic':
      return CurveType.Cubic;
    default:
      return CurveType.Linear;
  }
}

function parseFile(data: any): SpriterFile {
  let name: string = String(data.name ?? '');
  const pos = name.lastIndexOf('.png');
  if (pos !== -1) name = name.substring(0, pos);
  const slash = name.lastIndexOf('/');
  return {
    id: num(data.id),
    name,
    shortName: slash !== -1 ? name.substring(slash + 1) : name,
    width: num(data.width),
    height: num(data.height),
    pivotX: num(data.pivot_x, 0),
    pivotY: num(data.pivot_y, 1),
  };
}

function parseFolder(data: any): SpriterFolder {
  return {
    id: num(data.id),
    name: String(data.name ?? ''),
    files: (data.file ?? []).map(parseFile),
  };
}

function parseRef(data: any): Ref {
  return {
    id: num(data.id),
    parent: has(data, 'parent') ? num(data.parent) : -1,
    timeline: num(data.timeline),
    key: num(data.key),
    zIndex: num(data.z_index),
  };
}

function parseMainlineKey(data: any): MainlineKey {
  return {
    id: num(data.id),
    time: num(data.time),
    curveType: has(data, 'curve_type') ? parseCurveType(data.curve_type) : CurveType.Linear,
    boneRefs: (data.bone_ref ?? []).map(parseRef),
    objectRefs: (data.object_ref ?? []).map(parseRef),
  };
}

function parseObjectType(v: unknown): ObjectType {
  switch (v) {
    case 'bone':
      return ObjectType.Bone;
    case 'box':
      return ObjectType.Box;
    case 'point':
      return ObjectType.Point;
    default:
      // original runtime treats missing object_type as sprite
      return ObjectType.Sprite;
  }
}

function parseTimelineKey(data: any, objectType: ObjectType): TimelineKey {
  const key: TimelineKey = {
    id: num(data.id),
    time: num(data.time),
    spin: has(data, 'spin') ? num(data.spin) : 1,
    curveType: has(data, 'curve_type') ? parseCurveType(data.curve_type) : CurveType.Linear,
    c1: num(data.c1),
    c2: num(data.c2),
    x: 0,
    y: 0,
    angle: 0,
    scaleX: 1,
    scaleY: 1,
    alpha: 1,
    folder: 0,
    file: 0,
    useDefaultPivot: true,
    pivotX: 0,
    pivotY: 1,
  };

  // bones store their spatial info under "bone", everything else under "object"
  const spatial = objectType === ObjectType.Bone ? data.bone : data.object;
  if (spatial) {
    if (has(spatial, 'x')) key.x = num(spatial.x);
    if (has(spatial, 'y')) key.y = -num(spatial.y); // Y-up -> Y-down (matches original runtime)
    if (has(spatial, 'angle')) key.angle = num(spatial.angle);
    if (has(spatial, 'scale_x')) key.scaleX = num(spatial.scale_x);
    if (has(spatial, 'scale_y')) key.scaleY = num(spatial.scale_y);
    if (has(spatial, 'a')) key.alpha = num(spatial.a);

    if (objectType === ObjectType.Sprite) {
      key.folder = num(spatial.folder);
      key.file = num(spatial.file);
      if (has(spatial, 'pivot_x')) {
        key.pivotX = num(spatial.pivot_x);
        key.useDefaultPivot = false;
      }
      if (has(spatial, 'pivot_y')) {
        key.pivotY = num(spatial.pivot_y);
        key.useDefaultPivot = false;
      }
    }
  }

  return key;
}

function parseTimeline(data: any): Timeline {
  const objectType = parseObjectType(data.object_type);
  return {
    id: num(data.id),
    name: String(data.name ?? ''),
    objectType,
    keys: (data.key ?? []).map((k: any) => parseTimelineKey(k, objectType)),
  };
}

function parseAnimation(data: any): SpriterAnimationData {
  // original runtime: looping defaults to true; only explicit "false" disables it
  let looping = true;
  if (has(data, 'looping') && (data.looping === false || data.looping === 'false')) {
    looping = false;
  }
  return {
    id: num(data.id),
    name: String(data.name ?? ''),
    length: num(data.length),
    looping,
    mainlineKeys: (data.mainline?.key ?? []).map(parseMainlineKey),
    timelines: (data.timeline ?? []).map(parseTimeline),
  };
}

function parseEntity(data: any): SpriterEntity {
  return {
    id: num(data.id),
    name: String(data.name ?? ''),
    animations: (data.animation ?? []).map(parseAnimation),
  };
}

export function parseScon(data: any): SpriterData {
  return {
    folders: (data.folder ?? []).map(parseFolder),
    entities: (data.entity ?? []).map(parseEntity),
  };
}
