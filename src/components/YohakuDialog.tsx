// 「余白ノートへ送る」ダイアログ
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Stroke } from '../lib/diary.ts';
import type { InkLayer } from '../lib/layers.ts';
import {
  TARGET_NOTEBOOK,
  TARGET_SECTION,
  describeAuthError,
  ensureTargetSection,
  findTargetSection,
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
  /** ページ題名の初期値 */
  defaultTitle: string;
  /** カレンダー上の線(指定すると「含める」の選択肢が出る) */
  gridStrokes?: Stroke[];
  /** 主となる手書き(フリースペース or 日付の手書き欄。幅 1000 基準) */
  freeStrokes: Stroke[];
  freeHeight: number;
  /** 一緒に送れる文章(日記の本文など) */
  text?: string;
  layers: InkLayer[];
  defaultLayerId: string;
  onClose(): void;
}


export default function YohakuDialog(p: Props) {
  const [user, setUser] = useState<YohakuUser | null | undefined>(undefined);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [meta, setMeta] = useState<YohakuMeta | null>(null);
  const [sectionId, setSectionId] = useState('');
  const [targetMissing, setTargetMissing] = useState(false);
  const [includeGrid, setIncludeGrid] = useState(false);
  const [includeText, setIncludeText] = useState(true);
  const [title, setTitle] = useState(p.defaultTitle);
  const hasText = Boolean(p.text && p.text.trim());
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
      .then((m) => {
        if (!alive) return;
        setMeta(m);
        // 既定の送り先(データ受け取り › 日記カレンダー)を選ぶ。無ければ作成ボタンを出す
        const target = findTargetSection(m);
        if (target) {
          setSectionId(target.id);
          setTargetMissing(false);
        } else {
          setTargetMissing(true);
        }
      })
      .catch((e) => alive && setMessage({ kind: 'error', text: describeAuthError(e) }));
    return () => {
      alive = false;
    };
  }, [user]);

  const createTarget = async () => {
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await ensureTargetSection(user.uid);
      setMeta(r.meta);
      setSectionId(r.sectionId);
      setTargetMissing(false);
      setMessage({ kind: 'ok', text: `余白ノートに「${TARGET_NOTEBOOK} › ${TARGET_SECTION}」を作りました。` });
    } catch (err) {
      setMessage({ kind: 'error', text: describeAuthError(err) });
    } finally {
      setBusy(false);
    }
  };

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

  const strokeCount = p.freeStrokes.length + (includeGrid ? (p.gridStrokes?.length ?? 0) : 0);
  const canSend = strokeCount > 0 || (hasText && includeText);

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
        gridStrokes: includeGrid ? (p.gridStrokes ?? []) : [],
        freeStrokes: p.freeStrokes,
        freeHeight: p.freeHeight,
        text: hasText && includeText ? p.text : undefined,
        layers: p.layers,
        defaultLayerId: p.defaultLayerId,
        title,
        sectionId: sectionId || undefined,
        id: crypto.randomUUID(),
        now: Date.now(),
      });
      await writePage(user.uid, page);
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
            {meta && targetMissing && (
              <p className="muted small">
                既定の送り先「{TARGET_NOTEBOOK} › {TARGET_SECTION}」が余白ノートにまだありません。{' '}
                <button type="button" className="link-btn" disabled={busy} onClick={createTarget}>
                  作成して送り先にする
                </button>
              </p>
            )}
            {p.gridStrokes && (
              <label className="row check">
                <input type="checkbox" checked={includeGrid} onChange={(e) => setIncludeGrid(e.target.checked)} />
                カレンダー上の手書きもページの上部に含める
              </label>
            )}
            {hasText && (
              <label className="row check">
                <input type="checkbox" checked={includeText} onChange={(e) => setIncludeText(e.target.checked)} />
                日記の文章もページの上部に文字として含める
              </label>
            )}
            <p className="muted small">
              送る線の数: {strokeCount} 本{hasText && includeText ? '、文章あり' : ''}。レイヤー分けは余白ノートのレイヤーとして引き継がれます。
            </p>
            <div className="modal-actions">
              <span className="spacer" />
              <button type="button" className="btn" onClick={p.onClose}>
                閉じる
              </button>
              <button type="button" className="btn primary" disabled={busy || !canSend} onClick={send}>
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
