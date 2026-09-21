// Google Drive API v3(drive.file スコープ: このアプリが作ったファイルのみ扱う)
import { authFetch } from './auth.ts';

const BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ROOT_NAME = '日記カレンダー';
const FOLDER_CACHE_KEY = 'drive_folders';

export interface Folders {
  root: string;
  entries: string;
  images: string;
  months: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
}

let folders: Folders | null = null;

function q(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findFolder(name: string, parent: string): Promise<string | null> {
  const query = `name = '${q(name)}' and mimeType = '${FOLDER_MIME}' and '${parent}' in parents and trashed = false`;
  const res = await authFetch(`${BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`);
  const j = await res.json();
  return j.files?.[0]?.id ?? null;
}

async function createFolder(name: string, parent: string): Promise<string> {
  const res = await authFetch(`${BASE}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] }),
  });
  return (await res.json()).id;
}

async function ensureFolder(name: string, parent: string): Promise<string> {
  return (await findFolder(name, parent)) ?? (await createFolder(name, parent));
}

/** 保存先フォルダ(マイドライブ/日記カレンダー/{entries,images})を用意する */
export async function ensureFolders(): Promise<Folders> {
  if (folders) return folders;
  try {
    const cached = localStorage.getItem(FOLDER_CACHE_KEY);
    if (cached) {
      const f = JSON.parse(cached) as Folders;
      // 存在確認(削除されていたら作り直す)
      const res = await authFetch(`${BASE}/files/${f.root}?fields=id,trashed`);
      const j = await res.json();
      if (!j.trashed) {
        if (!f.months) {
          f.months = await ensureFolder('months', f.root);
          localStorage.setItem(FOLDER_CACHE_KEY, JSON.stringify(f));
        }
        folders = f;
        return f;
      }
    }
  } catch {
    /* 作り直す */
  }
  const root = await ensureFolder(ROOT_NAME, 'root');
  const entries = await ensureFolder('entries', root);
  const images = await ensureFolder('images', root);
  const months = await ensureFolder('months', root);
  folders = { root, entries, images, months };
  localStorage.setItem(FOLDER_CACHE_KEY, JSON.stringify(folders));
  return folders;
}

export function resetFolderCache() {
  folders = null;
  localStorage.removeItem(FOLDER_CACHE_KEY);
}

export async function listFiles(parent: string, namePrefix?: string): Promise<DriveFile[]> {
  let query = `'${parent}' in parents and trashed = false`;
  if (namePrefix) query += ` and name contains '${q(namePrefix)}'`;
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: query,
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime)',
      pageSize: '1000',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await authFetch(`${BASE}/files?${params}`);
    const j = await res.json();
    out.push(...(j.files ?? []));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return out;
}

/** フォルダ内で名前が一致するファイルを探す */
export async function findFileByName(name: string, parent: string): Promise<DriveFile | null> {
  const query = `name = '${q(name)}' and '${parent}' in parents and trashed = false`;
  const res = await authFetch(`${BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)&pageSize=1`);
  const j = await res.json();
  return j.files?.[0] ?? null;
}

export async function downloadJson<T>(fileId: string): Promise<T> {
  const res = await authFetch(`${BASE}/files/${fileId}?alt=media`);
  return res.json();
}

function multipart(metadata: unknown, content: Blob | string, contentType: string): { body: Blob; type: string } {
  const boundary = '-------nikki' + Math.random().toString(36).slice(2);
  const parts: (string | Blob)[] = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
    content,
    `\r\n--${boundary}--`,
  ];
  return { body: new Blob(parts), type: `multipart/related; boundary=${boundary}` };
}

/** JSON を新規作成(fileId 無し)または上書き(fileId あり) */
export async function uploadJson(name: string, parent: string, data: unknown, fileId?: string): Promise<string> {
  const metadata = fileId ? { name } : { name, parents: [parent] };
  const { body, type } = multipart(metadata, JSON.stringify(data), 'application/json');
  const url = fileId ? `${UPLOAD}/files/${fileId}?uploadType=multipart&fields=id` : `${UPLOAD}/files?uploadType=multipart&fields=id`;
  const res = await authFetch(url, { method: fileId ? 'PATCH' : 'POST', headers: { 'Content-Type': type }, body });
  return (await res.json()).id;
}

export async function uploadBlob(name: string, parent: string, blob: Blob): Promise<string> {
  const { body, type } = multipart({ name, parents: [parent] }, blob, blob.type || 'application/octet-stream');
  const res = await authFetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': type },
    body,
  });
  return (await res.json()).id;
}

export async function deleteFile(fileId: string): Promise<void> {
  await authFetch(`${BASE}/files/${fileId}`, { method: 'DELETE' });
}

const blobUrlCache = new Map<string, Promise<string>>();

/** 画像などを取得して blob: URL にする(同一セッション内でキャッシュ) */
export function fileBlobUrl(fileId: string): Promise<string> {
  let p = blobUrlCache.get(fileId);
  if (!p) {
    p = authFetch(`${BASE}/files/${fileId}?alt=media`)
      .then((r) => r.blob())
      .then((b) => URL.createObjectURL(b));
    blobUrlCache.set(fileId, p);
    p.catch(() => blobUrlCache.delete(fileId));
  }
  return p;
}
