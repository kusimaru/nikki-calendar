// 「余白ノートへ送る」ダイアログ
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Stroke } from '../lib/diary.ts';
import type { InkLayer } from '../lib/layers.ts';
import {
  describeAuthError,
  readMeta,
  signInYohaku,
  signOutYohaku,
  watchUser,
  writePage,
  type YohakuMeta,
  type YohakuUser,
} from '../lib/yohaku.ts';
import { convertToYohakuPage } from '../lib/yohakuConvert.ts';

interface Props {
  monthLabel: string;
  gridStrokes: Stroke[];
  freeStrokes: Stroke[];
  freeHeight: number;
  layers: InkLayer[];
  defaultLayerId: string;
  onClose(): void;
}

const SECTION_KEY = 'yohaku_last_section';

export default function YohakuDialog(p: Props) {
  const [user, setUser] = useState<YohakuUser | null | undefined>(undefined);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [meta, setMeta] = useState<YohakuMeta | null>(null);
  const [sectionId, setSectionId] = useState(() => localStorage.getItem(SECTION_KEY) ?? '');
  const [includeGrid, setIncludeGrid] = useState(false);
  const [title, setTitle] = useState(`${p.monthLabel} フリースペース`);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    let alive = true;
    watchUser((u) => alive && setUser(u))
      .then((u) => (unsub = u))
      .catch((e) => alive && setMessage({ kind: 'error', text: describeAuthError(e) }));
    return () => {
      alive = false;
      unsub?.();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setMeta(null);
      return;
    }
    let alive = true;
    readMeta(user.uid)
      .then((m) => alive && setMeta(m))
      .catch((e) => alive && setMessage({ kind: 'error', text: describeAuthError(e) }));
    return () => {
      alive = false;
    };
  }, [user]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') p.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p]);

  const sections = useMemo(() => {
    if (!meta) return [];
    const nbName = (id: string) => meta.notebooks.find((n) => n.id === id)?.name ?? '';
    return meta.sections.map((s) => ({ id: s.id, label: `${nbName(s.notebookId)} › ${s.name}` }));
  }, [meta]);

  const strokeCount = p.freeStrokes.length + (includeGrid ? p.gridStrokes.length : 0);

  const login = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await signInYohaku(email.trim(), password);
      setPassword('');
    } catch (err) {
      setMessage({ kind: 'error', text: describeAuthError(err) });
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      const page = convertToYohakuPage({
        gridStrokes: includeGrid ? p.gridStrokes : [],
        freeStrokes: p.freeStrokes,
        freeHeight: p.freeHeight,
        layers: p.layers,
        defaultLayerId: p.defaultLayerId,
        title,
        sectionId: sectionId || undefined,
        id: crypto.randomUUID(),
        now: Date.now(),
      });
      await writePage(user.uid, page);
      if (sectionId) localStorage.setItem(SECTION_KEY, sectionId);
      setMessage({ kind: 'ok', text: `余白ノートに「${page.title}」を送りました。余白ノートを開くと同期で届きます。` });
    } catch (err) {
      setMessage({ kind: 'error', text: describeAuthError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={p.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-heading">余白ノートへ送る</h2>

        {user === undefined && <p className="muted">余白ノートへの接続を確認しています…</p>}

        {user === null && (
          <form onSubmit={login} className="yohaku-login">
            <p className="muted small">余白ノートのアカウント(メールアドレスとパスワード)でログインします。次回からは不要です。</p>
            <label className="row">
              メールアドレス
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            </label>
            <label className="row">
              パスワード
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </label>
            <div className="modal-actions">
              <span className="spacer" />
              <button type="button" className="btn" onClick={p.onClose}>
                キャンセル
              </button>
              <button type="submit" className="btn primary" disabled={busy}>
                ログイン
              </button>
            </div>
          </form>
        )}

        {user && (
          <>
            <p className="muted small">
              ログイン中: {user.email}{' '}
              <button type="button" className="link-btn" onClick={() => signOutYohaku()}>
                ログアウト
              </button>
            </p>
            <label className="row">
              ページの題名
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
            </label>
            <label className="row">
              送り先のセクション
              <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                <option value="">(指定なし: 余白ノート側の「メモ」へ)</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            {meta && sections.length === 0 && <p className="muted small">セクションの一覧が取得できませんでした。余白ノート側で一度同期すると選べるようになります。</p>}
            <label className="row check">
              <input type="checkbox" checked={includeGrid} onChange={(e) => setIncludeGrid(e.target.checked)} />
              カレンダー上の手書きもページの上部に含める
            </label>
            <p className="muted small">送る線の数: {strokeCount} 本。レイヤー分けは余白ノートのレイヤーとして引き継がれます。</p>
            <div className="modal-actions">
              <span className="spacer" />
              <button type="button" className="btn" onClick={p.onClose}>
                閉じる
              </button>
              <button type="button" className="btn primary" disabled={busy || strokeCount === 0} onClick={send}>
                {busy ? '送信中…' : '送る'}
              </button>
            </div>
          </>
        )}

        {message && <p className={'yohaku-msg ' + message.kind}>{message.text}</p>}
      </div>
    </div>
  );
}
