// 余白ノート(Firebase)への接続。余白ノートと同じ SDK・同じ保存形式を使う
import { encodeChunks, type YohakuPage } from './yohakuConvert.ts';

// 余白ノートの sync.mjs に書かれている公開設定(Web アプリの Firebase 設定は公開値)
const SDK_VERSION = '10.14.1';
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD39zOakI_jQFvkSPj03zv9ByPUugXKMew',
  authDomain: 'yohaku-note-3c146.firebaseapp.com',
  projectId: 'yohaku-note-3c146',
  storageBucket: 'yohaku-note-3c146.firebasestorage.app',
  messagingSenderId: '402523531846',
  appId: '1:402523531846:web:84e8fbbbc0f83b3d37f847',
};

export interface YohakuUser {
  uid: string;
  email: string;
}

export interface YohakuSection {
  id: string;
  notebookId: string;
  name: string;
  color: string;
}

export interface YohakuNotebook {
  id: string;
  name: string;
  color: string;
}

export interface YohakuMeta {
  notebooks: YohakuNotebook[];
  sections: YohakuSection[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Transport {
  auth: any;
  A: any;
  F: any;
  db: any;
}

let transportPromise: Promise<Transport> | null = null;

function loadTransport(): Promise<Transport> {
  if (transportPromise) return transportPromise;
  transportPromise = (async () => {
    const base = `https://www.gstatic.com/firebasejs/${SDK_VERSION}/`;
    const [{ initializeApp }, A, F] = await Promise.all([
      import(/* @vite-ignore */ base + 'firebase-app.js'),
      import(/* @vite-ignore */ base + 'firebase-auth.js'),
      import(/* @vite-ignore */ base + 'firebase-firestore.js'),
    ]);
    const app = initializeApp(FIREBASE_CONFIG, 'yohaku');
    const auth = A.getAuth(app);
    let db: any;
    try {
      db = F.initializeFirestore(app, { localCache: F.memoryLocalCache() });
    } catch {
      db = F.getFirestore(app);
    }
    return { auth, A, F, db };
  })();
  transportPromise.catch(() => (transportPromise = null));
  return transportPromise;
}

export function describeAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code.includes('invalid-email')) return 'メールアドレスの形が正しくありません。';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
    return 'メールアドレスかパスワードが違います。';
  if (code.includes('too-many-requests')) return '試行回数が多すぎます。しばらく待ってからやり直してください。';
  if (code.includes('network-request-failed')) return 'インターネットに接続できません。';
  if (code.includes('permission-denied')) return '書き込みが許可されませんでした(余白ノートのアカウントを確認してください)。';
  return (e as Error)?.message ?? String(e);
}

/** 現在のログイン状態を監視する(初回は保存済みセッションの復元を待つ) */
export async function watchUser(cb: (u: YohakuUser | null) => void): Promise<() => void> {
  const { auth, A } = await loadTransport();
  return A.onAuthStateChanged(auth, (u: any) => cb(u ? { uid: u.uid, email: u.email ?? '' } : null));
}

export async function signInYohaku(email: string, password: string): Promise<void> {
  const { auth, A } = await loadTransport();
  await A.signInWithEmailAndPassword(auth, email, password);
}

export async function signOutYohaku(): Promise<void> {
  const { auth, A } = await loadTransport();
  await A.signOut(auth);
}

/** ノートブック・セクションの一覧(余白ノートが一度も同期していなければ空) */
export async function readMeta(uid: string): Promise<YohakuMeta> {
  const { F, db } = await loadTransport();
  const snap = await F.getDoc(F.doc(db, 'users', uid, 'meta', 'notebook'));
  if (!snap.exists()) return { notebooks: [], sections: [] };
  const d = snap.data();
  return {
    notebooks: Array.isArray(d.notebooks) ? d.notebooks : [],
    sections: Array.isArray(d.sections) ? d.sections : [],
  };
}

/** ページを余白ノートの形式(メタ + base64 分割本文)で書き込む */
export async function writePage(uid: string, page: YohakuPage): Promise<void> {
  const { F, db } = await loadTransport();
  const chunks = encodeChunks(page);
  const batch = F.writeBatch(db);
  batch.set(F.doc(db, 'users', uid, 'pages', page.id), {
    updatedAt: page.updatedAt,
    title: page.title,
    category: '',
    deleted: false,
    chunks: chunks.length,
    rev: page.updatedAt,
  });
  chunks.forEach((d, i) => batch.set(F.doc(db, 'users', uid, 'pages', page.id, 'parts', String(i)), { d }));
  await batch.commit();
}
