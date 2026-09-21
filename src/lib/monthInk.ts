// 月表示に重ねる手書き(月ごとに 1 ファイル)
import type { SaveState, Stroke } from './diary.ts';
import { isSignedIn } from './google/auth.ts';
import { deleteFile, downloadJson, ensureFolders, findFileByName, uploadJson } from './google/drive.ts';

export interface MonthInk {
  version: 1;
  /** "YYYY-MM" */
  month: string;
  /** 座標はグリッド全体に対する比率 × 1000(x, y とも) */
  strokes: Stroke[];
  /** 月表示の下のフリースペース(幅 1000 基準の論理座標。高さは伸ばせる) */
  free?: { strokes: Stroke[]; height: number };
  updatedAt: string;
}

export const FREE_DEFAULT_HEIGHT = 600;

export function freeOf(ink: MonthInk): { strokes: Stroke[]; height: number } {
  return ink.free ?? { strokes: [], height: FREE_DEFAULT_HEIGHT };
}

function isEmptyInk(ink: MonthInk): boolean {
  return ink.strokes.length === 0 && freeOf(ink).strokes.length === 0;
}

const LS_PREFIX = 'monthink:';
const fileIds = new Map<string, string>();

export function monthKey(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}`;
}

export function emptyMonthInk(month: string): MonthInk {
  return { version: 1, month, strokes: [], updatedAt: new Date(0).toISOString() };
}

function readLocal(month: string): MonthInk | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + month);
    return raw ? (JSON.parse(raw) as MonthInk) : null;
  } catch {
    return null;
  }
}

function writeLocal(ink: MonthInk) {
  try {
    if (isEmptyInk(ink)) localStorage.removeItem(LS_PREFIX + ink.month);
    else localStorage.setItem(LS_PREFIX + ink.month, JSON.stringify(ink));
  } catch {
    /* ignore */
  }
}

export async function loadMonthInk(month: string): Promise<MonthInk> {
  const local = readLocal(month);
  if (!isSignedIn()) return local ?? emptyMonthInk(month);
  try {
    const f = await ensureFolders();
    const file = await findFileByName(`${month}.json`, f.months);
    if (!file) return local ?? emptyMonthInk(month);
    fileIds.set(month, file.id);
    const remote = await downloadJson<MonthInk>(file.id);
    if (local && local.updatedAt > remote.updatedAt) return local;
    writeLocal(remote);
    return remote;
  } catch {
    return local ?? emptyMonthInk(month);
  }
}

export async function saveMonthInk(ink: MonthInk): Promise<SaveState> {
  writeLocal(ink);
  if (!isSignedIn()) return 'local';
  const f = await ensureFolders();
  let id = fileIds.get(ink.month);
  if (!id) {
    const file = await findFileByName(`${ink.month}.json`, f.months);
    if (file) id = file.id;
  }
  if (isEmptyInk(ink)) {
    if (id) {
      await deleteFile(id);
      fileIds.delete(ink.month);
    }
    return 'saved';
  }
  const newId = await uploadJson(`${ink.month}.json`, f.months, ink, id);
  fileIds.set(ink.month, newId);
  return 'saved';
}
