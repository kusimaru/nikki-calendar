// 月表示の手書きレイヤー定義(全月共通。ドライブの settings.json に保存)
import { isSignedIn } from './google/auth.ts';
import { downloadJson, ensureFolders, findFileByName, uploadJson } from './google/drive.ts';

export interface InkLayer {
  id: string;
  name: string;
  /** 既定のペン色 */
  color: string;
}

export interface InkSettings {
  version: 1;
  layers: InkLayer[];
  updatedAt: string;
}

export const DEFAULT_LAYER_ID = 'L1';
export const MAX_LAYERS = 8;
const LS_KEY = 'ink_settings';
const HIDDEN_KEY = 'ink_hidden_layers';
const ACTIVE_KEY = 'ink_active_layer';
const DIM_KEY = 'ink_dim_others';
const FILE_NAME = 'settings.json';

let fileId: string | null = null;

export function defaultSettings(): InkSettings {
  return {
    version: 1,
    layers: [{ id: DEFAULT_LAYER_ID, name: 'レイヤー 1', color: '#202124' }],
    updatedAt: new Date(0).toISOString(),
  };
}

export function newLayerId(): string {
  return 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function readLocal(): InkSettings | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as InkSettings) : null;
  } catch {
    return null;
  }
}

function writeLocal(s: InkSettings) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** ローカルキャッシュ(即時)。ドライブ側は loadSettings で取り込む */
export function localSettings(): InkSettings {
  return readLocal() ?? defaultSettings();
}

export async function loadSettings(): Promise<InkSettings> {
  const local = localSettings();
  if (!isSignedIn()) return local;
  try {
    const f = await ensureFolders();
    const file = await findFileByName(FILE_NAME, f.root);
    if (!file) return local;
    fileId = file.id;
    const remote = await downloadJson<InkSettings>(file.id);
    if (local.updatedAt > remote.updatedAt) return local;
    writeLocal(remote);
    return remote;
  } catch {
    return local;
  }
}

export async function saveSettings(s: InkSettings): Promise<void> {
  writeLocal(s);
  if (!isSignedIn()) return;
  const f = await ensureFolders();
  if (!fileId) {
    const file = await findFileByName(FILE_NAME, f.root);
    if (file) fileId = file.id;
  }
  fileId = await uploadJson(FILE_NAME, f.root, s, fileId ?? undefined);
}

// ---- 端末ごとの表示状態 ----

export function loadHiddenLayers(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function saveHiddenLayers(s: Set<string>) {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...s]));
}

export function loadActiveLayer(): string {
  return localStorage.getItem(ACTIVE_KEY) || DEFAULT_LAYER_ID;
}

export function saveActiveLayer(id: string) {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function loadDimOthers(): boolean {
  return localStorage.getItem(DIM_KEY) !== '0';
}

export function saveDimOthers(v: boolean) {
  localStorage.setItem(DIM_KEY, v ? '1' : '0');
}
