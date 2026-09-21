// 月の手書き(フリースペース・カレンダー上)を「余白ノート」のページ形式に変換する
import type { Stroke } from './diary.ts';
import type { InkLayer } from './layers.ts';

/** 余白ノートのページ幅・高さ制約(model.mjs と同じ値) */
export const YOHAKU_PAGE_WIDTH = 1200;
export const YOHAKU_MIN_HEIGHT = 760;
export const YOHAKU_MAX_HEIGHT = 6000;
export const YOHAKU_MAX_LAYERS = 10;

export interface YohakuLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
}

export interface YohakuStroke {
  points: number[][];
  color: string;
  width: number;
  pressure: boolean;
  layer: string;
}

export interface YohakuPage {
  id: string;
  title: string;
  sectionId?: string;
  blocks: never[];
  height: number;
  strokes: YohakuStroke[];
  layers: YohakuLayer[];
  activeLayer: string;
  updatedAt: number;
}

export interface ConvertInput {
  /** カレンダー上の線(x, y とも 0〜1000 の比率)。含めない場合は空配列 */
  gridStrokes: Stroke[];
  /** フリースペースの線(幅 1000 基準、y は論理高さまで) */
  freeStrokes: Stroke[];
  /** フリースペースの論理高さ */
  freeHeight: number;
  layers: InkLayer[];
  defaultLayerId: string;
  title: string;
  sectionId?: string;
  id: string;
  now: number;
}

/** カレンダー上の線を載せる領域の高さ(ページ幅 1200 に対して 4:3) */
const GRID_AREA_HEIGHT = 900;
const GAP = 40;
const SCALE = YOHAKU_PAGE_WIDTH / 1000;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function toColor(c: string): string {
  return /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : '#202124';
}

/** 線の太さを余白ノートの width(1〜24)へ。描画方式の違いを補正して見た目を近づける */
function toWidth(size: number): number {
  return clamp(Math.round(size * SCALE * 0.8 * 10) / 10, 1, 24);
}

function convertStrokes(
  strokes: Stroke[],
  sx: number,
  sy: number,
  offsetY: number,
  maxY: number,
  layerIds: Set<string>,
  defaultLayerId: string,
): YohakuStroke[] {
  const out: YohakuStroke[] = [];
  for (const s of strokes) {
    if (s.points.length === 0) continue;
    const layer = s.layer && layerIds.has(s.layer) ? s.layer : defaultLayerId;
    const points = s.points.map((p) => [
      clamp(p[0] * sx, 0, YOHAKU_PAGE_WIDTH),
      clamp(p[1] * sy + offsetY, 0, maxY),
      clamp(p[2] ?? 0.5, 0, 1),
    ]);
    out.push({ points, color: toColor(s.color), width: toWidth(s.size), pressure: s.pen, layer });
  }
  return out;
}

export function convertToYohakuPage(input: ConvertInput): YohakuPage {
  const used = new Set<string>();
  for (const s of [...input.gridStrokes, ...input.freeStrokes]) used.add(s.layer ?? input.defaultLayerId);

  // レイヤーは定義順に、線が使っているものだけ(無ければ先頭を 1 つ)
  let layers: YohakuLayer[] = input.layers
    .filter((l) => used.has(l.id))
    .map((l) => ({ id: l.id, name: l.name.slice(0, 40) || 'レイヤー', visible: true, locked: false, opacity: 1 }));
  const known = new Set(input.layers.map((l) => l.id));
  const fallbackId = layers[0]?.id ?? input.layers[0]?.id ?? input.defaultLayerId;
  if (layers.length === 0 || [...used].some((id) => !known.has(id))) {
    if (!layers.some((l) => l.id === fallbackId)) {
      const def = input.layers.find((l) => l.id === fallbackId);
      layers.unshift({ id: fallbackId, name: def?.name.slice(0, 40) || 'レイヤー 1', visible: true, locked: false, opacity: 1 });
    }
  }
  layers = layers.slice(0, YOHAKU_MAX_LAYERS);
  const layerIds = new Set(layers.map((l) => l.id));

  const hasGrid = input.gridStrokes.length > 0;
  const freeOffset = hasGrid ? GRID_AREA_HEIGHT + GAP : 0;
  const freeMaxY = freeOffset + input.freeHeight * SCALE;
  const height = clamp(Math.ceil(freeMaxY + GAP), YOHAKU_MIN_HEIGHT, YOHAKU_MAX_HEIGHT);

  const strokes: YohakuStroke[] = [
    ...convertStrokes(input.gridStrokes, SCALE, GRID_AREA_HEIGHT / 1000, 0, height, layerIds, fallbackId),
    ...convertStrokes(input.freeStrokes, SCALE, SCALE, freeOffset, height, layerIds, fallbackId),
  ];

  const page: YohakuPage = {
    id: input.id,
    title: input.title.slice(0, 120) || '日記カレンダー',
    blocks: [],
    height,
    strokes,
    layers,
    activeLayer: layers[0].id,
    updatedAt: input.now,
  };
  if (input.sectionId) page.sectionId = input.sectionId;
  return page;
}

/** 余白ノート sync.mjs と同じ分割 base64(JSON → UTF-8 → 600000 バイトごと) */
const CHUNK_BYTES = 600000;
export function encodeChunks(obj: unknown): string[] {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK_BYTES) {
    const slice = bytes.subarray(i, i + CHUNK_BYTES);
    let s = '';
    for (let j = 0; j < slice.length; j += 8192) s += String.fromCharCode(...slice.subarray(j, j + 8192));
    out.push(btoa(s));
  }
  return out.length ? out : [''];
}
