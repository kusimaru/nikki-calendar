// Google Identity Services によるトークン取得(ブラウザのみで完結する暗黙フロー)
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPES = ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/drive.file'].join(' ');
const STORAGE_KEY = 'google_token';
/** 「自分でサインアウトするまでサインインしたままにする」意思。トークンが切れても残る */
const INTENT_KEY = 'google_signed_in';

interface Token {
  accessToken: string;
  expiresAt: number;
}

interface TokenClient {
  requestAccessToken(opts?: { prompt?: string }): void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => void;
            error_callback?: (err: { type: string; message?: string }) => void;
          }): TokenClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

export class AuthError extends Error {}

let token: Token | null = loadToken();
const listeners = new Set<() => void>();
// この変更より前にサインインしていた端末でも自動再開が効くよう、有効なトークンがあれば意思ありとみなす
if (token) {
  try {
    localStorage.setItem(INTENT_KEY, '1');
  } catch {
    /* ignore */
  }
}

function loadToken(): Token | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as Token;
    return t.expiresAt > Date.now() ? t : null;
  } catch {
    return null;
  }
}

function setToken(t: Token | null) {
  token = t;
  try {
    if (t) localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function onAuthChange(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function hasClientId(): boolean {
  return Boolean(CLIENT_ID);
}

export function getAccessToken(): string | null {
  if (token && token.expiresAt > Date.now() + 30_000) return token.accessToken;
  return null;
}

export function isSignedIn(): boolean {
  return getAccessToken() !== null;
}

/** トークンの残り時間(ミリ秒)。無ければ 0 */
export function tokenRemainingMs(): number {
  return token ? Math.max(0, token.expiresAt - Date.now()) : 0;
}

/** 以前サインインしていて、まだ自分でサインアウトしていないか */
export function hasSignInIntent(): boolean {
  try {
    return localStorage.getItem(INTENT_KEY) === '1';
  } catch {
    return false;
  }
}

let gisLoading: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google の認証スクリプトを読み込めませんでした'));
    document.head.appendChild(s);
  });
  return gisLoading;
}

/**
 * サインイン。silent=true のときは同意画面を出さずに再取得を試みる。
 * 注意: ポップアップを使うため、ユーザー操作(クリック)の直後に呼ぶこと。
 */
export async function signIn(silent = false): Promise<void> {
  if (!CLIENT_ID) throw new AuthError('VITE_GOOGLE_CLIENT_ID が設定されていません(.env を確認)');
  await loadGis();
  await new Promise<void>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new AuthError(resp.error ?? 'トークンを取得できませんでした'));
          return;
        }
        setToken({
          accessToken: resp.access_token,
          expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000,
        });
        try {
          localStorage.setItem(INTENT_KEY, '1');
        } catch {
          /* ignore */
        }
        resolve();
      },
      error_callback: (err) => reject(new AuthError(err.message ?? err.type)),
    });
    client.requestAccessToken({ prompt: silent ? '' : 'consent' });
  });
}

export function signOut(): void {
  const t = token?.accessToken;
  try {
    localStorage.removeItem(INTENT_KEY);
  } catch {
    /* ignore */
  }
  setToken(null);
  if (t && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(t);
}

/** Authorization ヘッダ付き fetch。401 のときはトークンを破棄して AuthError を投げる */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const at = getAccessToken();
  if (!at) throw new AuthError('サインインが必要です');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${at}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    setToken(null);
    throw new AuthError('セッションの有効期限が切れました。再度サインインしてください');
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      msg = j?.error?.message ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res;
}
