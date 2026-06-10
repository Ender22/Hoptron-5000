/**
 * Loader for Starling/Sparrow-format texture atlases (the original game's
 * TexturePacker output): a PNG plus an XML of <SubTexture> rects.
 */
import { Assets, Rectangle, Texture } from 'pixi.js';

export type TextureMap = Map<string, Texture>;

export function parseStarlingAtlas(xmlText: string, sheet: Texture): TextureMap {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const result: TextureMap = new Map();

  for (const node of Array.from(doc.querySelectorAll('SubTexture'))) {
    const name = node.getAttribute('name')!;
    const x = Number(node.getAttribute('x'));
    const y = Number(node.getAttribute('y'));
    const width = Number(node.getAttribute('width'));
    const height = Number(node.getAttribute('height'));

    // Trimmed sprites (TexturePacker "frame" attrs); unused by this game's
    // atlases but supported for safety. Starling stores frameX/Y negated.
    const frameX = Number(node.getAttribute('frameX') ?? 0);
    const frameY = Number(node.getAttribute('frameY') ?? 0);
    const frameWidth = Number(node.getAttribute('frameWidth') ?? width);
    const frameHeight = Number(node.getAttribute('frameHeight') ?? height);

    const trimmed = frameX !== 0 || frameY !== 0 || frameWidth !== width || frameHeight !== height;

    result.set(
      name,
      new Texture({
        source: sheet.source,
        frame: new Rectangle(x, y, width, height),
        orig: trimmed ? new Rectangle(0, 0, frameWidth, frameHeight) : undefined,
        trim: trimmed ? new Rectangle(-frameX, -frameY, width, height) : undefined,
      }),
    );
  }

  return result;
}

export async function loadStarlingAtlas(xmlUrl: string): Promise<TextureMap> {
  const pngUrl = xmlUrl.replace(/\.xml$/, '.png');
  const [xmlText, sheet] = await Promise.all([
    fetch(xmlUrl).then((r) => {
      if (!r.ok) throw new Error(`Failed to load atlas xml: ${xmlUrl}`);
      return r.text();
    }),
    Assets.load<Texture>(pngUrl),
  ]);
  return parseStarlingAtlas(xmlText, sheet);
}

/** Merge several atlases into one lookup (later atlases win on name clashes). */
export function mergeTextureMaps(maps: TextureMap[]): TextureMap {
  const merged: TextureMap = new Map();
  for (const map of maps) {
    for (const [name, tex] of map) merged.set(name, tex);
  }
  return merged;
}
