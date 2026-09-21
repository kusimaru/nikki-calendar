// 日記エントリの保存(Google ドライブ + ブラウザ内キャッシュ)
import { isSignedIn } from './google/auth.ts';
import { deleteFile, downloadJson, ensureFolders, listFiles, uploadBlob, uploadJson } from './google/drive.ts';

export interface Stroke {
  /** [x, y, pressure] の配列(論理座標 幅 1000 基準) */
  points: number[][];
  color: string;
  size: number;
  /** ペン入力(筆圧あり)かどうか。false なら描画時に筆圧を擬似生成 */
  pen: boolean;
  /** 月表示の手書きのみ: レイヤー ID(無ければ既定レイヤー) */
  layer?: string;
}

export interface DiaryImage {
  id: string;
  name: string;
  mime: string;
}

export interface DiaryEntry {
  version: 1;
  date: string;
  text: string;
  images: DiaryImage[];
  strokes: Stroke[];
  canvasHeight: number;
  updatedAt: string;
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'local' | 'error';

const LS_PREFIX = 'diary:';
const PENDING_KEY = 'diary_pending';

const fileIds = new Map<string, string>();
const indexedMonths = new Set<string>();

export function emptyEntry(date: string): DiaryEntry {
  return { version: 1, date, text: '', images: [], strokes: [], canvasHeight: 700, updatedAt: new Date(0).toISOString() };
}

export function isEmptyEntry(e: DiaryEntry): boolean {
  return e.text.trim() === '' && e.images.length === 0 && e.strokes.length === 0;
}

function readLocal(date: string): DiaryEntry | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + date);
    return raw ? (JSON.parse(raw) as DiaryEntry) : null;
  } catch {
    return null;
  }
}

function writeLocal(e: DiaryEntry) {
  try {
    if (isEmptyEntry(e)) localStorage.removeItem(LS_PREFIX + e.date);
    else localStorage.setItem(LS_PREFIX + e.date, JSON.stringify(e));
  } catch {
    /* 容量超過などは無視(ドライブ側が正) */
  }
}

function readPending(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function writePending(s: Set<string>) {
  localStorage.setItem(PENDING_KEY, JSON.stringify([...s]));
}

/** ブラウザ内キャッシュにある日付一覧 */
export function localDates(): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(LS_PREFIX)) out.add(k.slice(LS_PREFIX.length));
  }
  return out;
}

/** 月内に日記があるか(ドライブの一覧を取得しファイル ID を覚える) */
export async function loadMonthIndex(year: number, month0: number): Promise<Set<string>> {
  const prefix = `${year}-${String(month0 + 1).padStart(2, '0')}-`;
  const out = new Set<string>();
  for (const d of localDates()) if (d.startsWith(prefix)) out.add(d);
  if (!isSignedIn()) return out;
  const f = await ensureFolders();
  const files = await listFiles(f.entries, prefix);
  for (const file of files) {
    const date = file.name.replace(/\.json$/, '');
    if (!date.startsWith(prefix)) continue;
    fileIds.set(date, file.id);
    out.add(date);
  }
  indexedMonths.add(prefix);
  return out;
}

export async function loadEntry(date: string): Promise<DiaryEntry> {
  const local = readLocal(date);
  if (!isSignedIn()) return local ?? emptyEntry(date);
  const prefix = date.slice(0, 8);
  if (!indexedMonths.has(prefix)) {
    const [y, m] = date.split('-').map(Number);
    await loadMonthIndex(y, m - 1);
  }
  const id = fileIds.get(date);
  if (!id) return local ?? emptyEntry(date);
  try {
    const remote = await downloadJson<DiaryEntry>(id);
    if (local && local.updatedAt > remote.updatedAt) return local; // 未送信の変更が残っている
    writeLocal(remote);
    return remote;
  } catch {
    return local ?? emptyEntry(date);
  }
}

export async function saveEntry(entry: DiaryEntry): Promise<SaveState> {
  writeLocal(entry);
  const pending = readPending();
  if (!isSignedIn()) {
    pending.add(entry.date);
    writePending(pending);
    return 'local';
  }
  try {
    const f = await ensureFolders();
    const id = fileIds.get(entry.date);
    if (isEmptyEntry(entry)) {
      if (id) {
        await deleteFile(id);
        fileIds.delete(entry.date);
      }
    } else {
      const newId = await uploadJson(`${entry.date}.json`, f.entries, entry, id);
      fileIds.set(entry.date, newId);
    }
    pending.delete(entry.date);
    writePending(pending);
    return 'saved';
  } catch (e) {
    pending.add(entry.date);
    writePending(pending);
    throw e;
  }
}

/** オフライン中などに保存できなかった分を送る */
export async function flushPending(): Promise<void> {
  if (!isSignedIn()) return;
  for (const date of readPending()) {
    const local = readLocal(date);
    if (!local) continue;
    try {
      await saveEntry(local);
    } catch {
      /* 次回に再試行 */
    }
  }
}

export async function addImage(date: string, file: File): Promise<DiaryImage> {
  const f = await ensureFolders();
  const safe = file.name.replace(/[\\/:*?"<>|]/g, '_') || 'image';
  const name = `${date}_${Date.now()}_${safe}`;
  const id = await uploadBlob(name, f.images, file);
  return { id, name, mime: file.type || 'image/jpeg' };
}

export async function removeImageFile(img: DiaryImage): Promise<void> {
  try {
    await deleteFile(img.id);
  } catch {
    /* 既に無い場合などは無視 */
  }
}
