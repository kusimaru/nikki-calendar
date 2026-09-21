import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MonthView from './components/MonthView.tsx';
import DayPanel from './components/DayPanel.tsx';
import EventEditor from './components/EventEditor.tsx';
import InkToolbar from './components/InkToolbar.tsx';
import LayerBar from './components/LayerBar.tsx';
import MonthStrip from './components/MonthStrip.tsx';
import { layerOf } from './components/MonthInk.tsx';
import {
  DEFAULT_LAYER_ID,
  loadActiveLayer,
  loadDimOthers,
  loadHiddenLayers,
  loadSettings,
  localSettings,
  newLayerId,
  saveActiveLayer,
  saveDimOthers,
  saveHiddenLayers,
  saveSettings,
  type InkSettings,
} from './lib/layers.ts';
import { defaultInkState, inkLog, type InkState } from './lib/ink.ts';
import { emptyMonthInk, loadMonthInk, monthKey, saveMonthInk, type MonthInk } from './lib/monthInk.ts';
import { addDays, addMonths, monthGrid, ymdKey } from './lib/date.ts';
import { AuthError, hasClientId, isSignedIn, onAuthChange, signIn, signOut } from './lib/google/auth.ts';
import {
  createEvent,
  deleteEvent,
  groupByDay,
  listCalendars,
  listEvents,
  updateEvent,
  type CalEvent,
  type CalendarInfo,
  type EventInput,
} from './lib/google/calendar.ts';
import {
  addImage,
  emptyEntry,
  flushPending,
  loadEntry,
  loadMonthIndex,
  localDates,
  removeImageFile,
  saveEntry,
  type DiaryEntry,
  type DiaryImage,
  type SaveState,
} from './lib/diary.ts';

const SELECTED_CALS_KEY = 'selected_calendars';
const INK_SIZES: [string, number][] = [
  ['細', 1.5],
  ['中', 2.5],
  ['太', 4],
];

type EditorState = { mode: 'create'; date: Date } | { mode: 'edit'; event: CalEvent } | null;

// 月ごとのヘッダー色(季節の淡い色)
const MONTH_COLORS = [
  '#e3ecf7', // 1月 雪空
  '#f6e3ec', // 2月 梅
  '#fbe4ea', // 3月 桜
  '#e6f2df', // 4月 若葉
  '#dff0e8', // 5月 新緑
  '#e6e4f4', // 6月 紫陽花
  '#dcefff', // 7月 夏空
  '#fdf1cf', // 8月 向日葵
  '#f9e6d3', // 9月 月見
  '#fbe3cc', // 10月 紅葉はじめ
  '#f4dcd3', // 11月 紅葉
  '#e2e8f2', // 12月 冬
];

const DEBUG = new URLSearchParams(location.search).has('debug');

/** ?debug=1 のとき、直近のペン・タッチイベントを画面に出す */
function DebugOverlay() {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 300);
    return () => window.clearInterval(id);
  }, []);
  return (
    <pre className="debug-overlay">
      {`UA: ${navigator.userAgent}\nstandalone: ${String((navigator as { standalone?: boolean }).standalone)}\n`}
      {inkLog.join('\n') || '(まだイベントなし)'}
    </pre>
  );
}

export default function App() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState<Date | null>(null);
  const [signedIn, setSignedIn] = useState(isSignedIn());
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [hiddenCals, setHiddenCals] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(SELECTED_CALS_KEY) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [diaryDays, setDiaryDays] = useState<Set<string>>(() => localDates());
  const [entry, setEntry] = useState<DiaryEntry | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [uploading, setUploading] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // 広い画面での折りたたみ(狭い画面では sidebarOpen のオーバーレイ表示を使う)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === '1');
  const toggleSidebar = () => {
    if (window.matchMedia('(max-width: 1100px)').matches) {
      setSidebarOpen((v) => !v);
    } else {
      setSidebarCollapsed((v) => {
        localStorage.setItem('sidebar_collapsed', v ? '0' : '1');
        return !v;
      });
    }
  };
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [inkMode, setInkMode] = useState(false);
  const [inkState, setInkState] = useState<InkState>(() => defaultInkState(INK_SIZES[1][1]));
  const [monthInk, setMonthInk] = useState<MonthInk | null>(null);
  const [inkSave, setInkSave] = useState<SaveState>('idle');
  const monthInkRef = useRef<MonthInk | null>(null);
  const inkTimer = useRef<number | null>(null);
  const inkDirty = useRef(false);
  const [inkSettings, setInkSettings] = useState<InkSettings>(() => localSettings());
  const [activeLayer, setActiveLayer] = useState(() => loadActiveLayer());
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(() => loadHiddenLayers());
  const [dimOthers, setDimOthers] = useState(() => loadDimOthers());

  const entryRef = useRef<DiaryEntry | null>(null);
  const saveTimer = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  const inkModeRef = useRef(inkMode);
  inkModeRef.current = inkMode;
  const [slide, setSlide] = useState<'left' | 'right' | null>(null);

  const year = month.getFullYear();
  const month0 = month.getMonth();
  const monthColor = MONTH_COLORS[month0];

  // PWA のステータスバー色も月に合わせる
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', monthColor);
  }, [monthColor]);

  const report = useCallback((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    setError(msg);
    if (e instanceof AuthError) setSignedIn(false);
  }, []);

  // ---- 認証状態 ----
  useEffect(() => onAuthChange(() => setSignedIn(isSignedIn())), []);

  const doSignIn = async (silent = false) => {
    try {
      setError(null);
      await signIn(silent);
      await flushPending();
    } catch (e) {
      report(e);
    }
  };

  // ---- カレンダー一覧 ----
  useEffect(() => {
    if (!signedIn) {
      setCalendars([]);
      setEvents([]);
      return;
    }
    listCalendars().then(setCalendars).catch(report);
  }, [signedIn, report]);

  const visibleCals = useMemo(() => calendars.filter((c) => !hiddenCals.has(c.id)), [calendars, hiddenCals]);

  // ---- 予定の取得 ----
  const range = useMemo(() => {
    const g = monthGrid(year, month0);
    return { from: g[0][0], to: addDays(g[5][6], 1) };
  }, [year, month0]);

  const refreshEvents = useCallback(async () => {
    if (!signedIn || visibleCals.length === 0) {
      setEvents([]);
      return;
    }
    setLoadingEvents(true);
    try {
      const lists = await Promise.all(visibleCals.map((c) => listEvents(c, range.from, range.to)));
      setEvents(lists.flat());
    } catch (e) {
      report(e);
    } finally {
      setLoadingEvents(false);
    }
  }, [signedIn, visibleCals, range, report]);

  useEffect(() => {
    refreshEvents();
  }, [refreshEvents]);

  const eventsByDay = useMemo(() => groupByDay(events), [events]);

  // ---- 日記の有無(月ごと) ----
  useEffect(() => {
    let alive = true;
    loadMonthIndex(year, month0)
      .then((days) => {
        if (!alive) return;
        setDiaryDays((prev) => {
          const next = new Set(prev);
          const prefix = `${year}-${String(month0 + 1).padStart(2, '0')}-`;
          for (const d of prev) if (d.startsWith(prefix)) next.delete(d);
          for (const d of days) next.add(d);
          return next;
        });
      })
      .catch(report);
    return () => {
      alive = false;
    };
  }, [year, month0, signedIn, report]);

  // ---- 手書きレイヤー定義(全月共通) ----
  useEffect(() => {
    let alive = true;
    loadSettings().then((s) => alive && setInkSettings(s));
    return () => {
      alive = false;
    };
  }, [signedIn]);

  // 選択中レイヤーが存在しなければ先頭にする
  useEffect(() => {
    if (!inkSettings.layers.some((l) => l.id === activeLayer)) {
      const id = inkSettings.layers[0]?.id ?? DEFAULT_LAYER_ID;
      setActiveLayer(id);
      saveActiveLayer(id);
    }
  }, [inkSettings, activeLayer]);

  const updateLayers = (mutate: (layers: InkSettings['layers']) => InkSettings['layers']) => {
    const next: InkSettings = { ...inkSettings, layers: mutate(inkSettings.layers), updatedAt: new Date().toISOString() };
    setInkSettings(next);
    saveSettings(next).catch(report);
  };

  const selectLayer = (id: string) => {
    setActiveLayer(id);
    saveActiveLayer(id);
    const layer = inkSettings.layers.find((l) => l.id === id);
    if (layer) setInkState((s) => ({ ...s, color: layer.color, tool: 'pen' }));
    // 描く先が非表示なら表示に戻す
    if (hiddenLayers.has(id)) toggleLayerVisible(id);
  };

  const toggleLayerVisible = (id: string) => {
    setHiddenLayers((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      saveHiddenLayers(s);
      return s;
    });
  };

  // ---- 月表示の手書き(月ごと) ----
  const flushInk = useCallback(async () => {
    if (inkTimer.current) {
      window.clearTimeout(inkTimer.current);
      inkTimer.current = null;
    }
    const ink = monthInkRef.current;
    if (!ink || !inkDirty.current) return;
    inkDirty.current = false;
    setInkSave('saving');
    try {
      setInkSave(await saveMonthInk(ink));
    } catch (err) {
      setInkSave('error');
      report(err);
    }
  }, [report]);

  useEffect(() => {
    const key = monthKey(year, month0);
    let alive = true;
    setMonthInk(null);
    monthInkRef.current = null;
    loadMonthInk(key)
      .then((ink) => {
        if (!alive) return;
        setMonthInk(ink);
        monthInkRef.current = ink;
        inkDirty.current = false;
        setInkSave('idle');
      })
      .catch(() => {
        if (!alive) return;
        const ink = emptyMonthInk(key);
        setMonthInk(ink);
        monthInkRef.current = ink;
      });
    return () => {
      alive = false;
      flushInk();
    };
  }, [year, month0, signedIn, flushInk]);

  const changeInk = (strokes: MonthInk['strokes']) => {
    const cur = monthInkRef.current;
    if (!cur) return;
    const next = { ...cur, strokes, updatedAt: new Date().toISOString() };
    monthInkRef.current = next;
    setMonthInk(next);
    inkDirty.current = true;
    if (inkTimer.current) window.clearTimeout(inkTimer.current);
    inkTimer.current = window.setTimeout(flushInk, 1000);
  };

  // ---- 日記の読み込み・保存 ----
  const flushSave = useCallback(async () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const e = entryRef.current;
    if (!e || !dirtyRef.current) return;
    dirtyRef.current = false;
    setSaveState('saving');
    try {
      const st = await saveEntry(e);
      setSaveState(st);
    } catch (err) {
      setSaveState('error');
      report(err);
    }
  }, [report]);

  useEffect(() => {
    if (!selected) {
      setEntry(null);
      entryRef.current = null;
      return;
    }
    const key = ymdKey(selected);
    let alive = true;
    setEntry(null);
    setSaveState('idle');
    loadEntry(key)
      .then((e) => {
        if (!alive) return;
        setEntry(e);
        entryRef.current = e;
        dirtyRef.current = false;
      })
      .catch((err) => {
        if (!alive) return;
        report(err);
        const e = emptyEntry(key);
        setEntry(e);
        entryRef.current = e;
      });
    return () => {
      alive = false;
      flushSave();
    };
  }, [selected, signedIn, flushSave, report]);

  const changeEntry = (patch: Partial<DiaryEntry>) => {
    const cur = entryRef.current;
    if (!cur) return;
    const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    entryRef.current = next;
    setEntry(next);
    dirtyRef.current = true;
    setDiaryDays((prev) => {
      const s = new Set(prev);
      if (next.text.trim() || next.images.length || next.strokes.length) s.add(next.date);
      else s.delete(next.date);
      return s;
    });
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushSave, 1000);
  };

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        flushSave();
        flushInk();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [flushSave, flushInk]);

  const handleAddImages = async (files: File[]) => {
    const cur = entryRef.current;
    if (!cur) return;
    setUploading(true);
    try {
      const added: DiaryImage[] = [];
      for (const f of files) added.push(await addImage(cur.date, f));
      changeEntry({ images: [...(entryRef.current?.images ?? []), ...added] });
      await flushSave();
    } catch (e) {
      report(e);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = async (img: DiaryImage) => {
    const cur = entryRef.current;
    if (!cur) return;
    changeEntry({ images: cur.images.filter((i) => i.id !== img.id) });
    await removeImageFile(img);
  };

  // ---- 予定の作成・更新・削除 ----
  const saveEvent = async (calendarId: string, input: EventInput) => {
    setBusy(true);
    try {
      if (editor?.mode === 'edit') await updateEvent(editor.event.calendarId, editor.event.id, input);
      else await createEvent(calendarId, input);
      setEditor(null);
      await refreshEvents();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };

  const removeEvent = async () => {
    if (editor?.mode !== 'edit') return;
    if (!confirm(`「${editor.event.summary}」を削除しますか?`)) return;
    setBusy(true);
    try {
      await deleteEvent(editor.event.calendarId, editor.event.id);
      setEditor(null);
      await refreshEvents();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };

  // ---- 横スワイプで月移動(指・ペン。手書きモード中は無効) ----
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    let start: { id: number; x: number; y: number } | null = null;
    let decided: 'swipe' | 'no' | null = null;
    const monthEl = () => el.querySelector<HTMLElement>('.month');

    const onDown = (e: PointerEvent) => {
      if (inkModeRef.current || e.pointerType === 'mouse') return;
      start = { id: e.pointerId, x: e.clientX, y: e.clientY };
      decided = null;
    };
    const onMove = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (decided === null && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
        decided = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'swipe' : 'no';
      }
      if (decided !== 'swipe') return;
      e.preventDefault();
      const m = monthEl();
      if (m) {
        m.style.transition = 'none';
        m.style.transform = `translateX(${Math.max(-80, Math.min(80, dx * 0.35))}px)`;
      }
    };
    const finish = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const wasSwipe = decided === 'swipe';
      start = null;
      decided = null;
      const m = monthEl();
      if (m) {
        m.style.transition = '';
        m.style.transform = '';
      }
      if (!wasSwipe || e.type === 'pointercancel') return;
      if (dx <= -50) {
        setSlide('left');
        setMonth((cur) => addMonths(cur, 1));
      } else if (dx >= 50) {
        setSlide('right');
        setMonth((cur) => addMonths(cur, -1));
      }
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove, { passive: false });
    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', finish);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', finish);
      el.removeEventListener('pointercancel', finish);
    };
  }, []);

  useEffect(() => {
    if (!slide) return;
    const id = window.setTimeout(() => setSlide(null), 220);
    return () => window.clearTimeout(id);
  }, [slide]);

  // ---- キーボード操作(Google カレンダー準拠) ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (editor || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      if (e.key === 't') setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
      else if (e.key === 'j' || e.key === 'n') setMonth((m) => addMonths(m, 1));
      else if (e.key === 'k' || e.key === 'p') setMonth((m) => addMonths(m, -1));
      else if (e.key === 'Escape') {
        if (inkMode) setInkMode(false);
        else setSelected(null);
      }
      else if (e.key === 'c' && selected && signedIn) setEditor({ mode: 'create', date: selected });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, selected, signedIn, inkMode]);

  const toggleCal = (id: string) => {
    setHiddenCals((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      localStorage.setItem(SELECTED_CALS_KEY, JSON.stringify([...s]));
      return s;
    });
  };

  const primaryCal = calendars.find((c) => c.primary)?.id ?? calendars.find((c) => c.writable)?.id ?? 'primary';
  const selectedKey = selected ? ymdKey(selected) : null;

  return (
    <div
      className={'app' + (selected ? ' has-panel' : '') + (inkMode ? ' inking' : '')}
      style={{ ['--month-bg' as string]: monthColor }}
    >
      <header className="topbar">
        <button type="button" className="icon-btn" aria-label="メニュー" onClick={toggleSidebar}>
          ☰
        </button>
        <span className="brand">日記カレンダー</span>
        <button type="button" className="btn" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
          今日
        </button>
        <button type="button" className="icon-btn" aria-label="前の月" onClick={() => setMonth((m) => addMonths(m, -1))}>
          ‹
        </button>
        <button type="button" className="icon-btn" aria-label="次の月" onClick={() => setMonth((m) => addMonths(m, 1))}>
          ›
        </button>
        <h1 className="month-title">
          {year}年{month0 + 1}月
        </h1>
        {loadingEvents && <span className="muted small">読み込み中…</span>}
        <span className="spacer" />
        <button
          type="button"
          className={'btn' + (inkMode ? ' active' : '')}
          onClick={() => setInkMode((v) => !v)}
          title="月表示の上に手書きする(押している間は日付を開きません)"
        >
          {inkMode ? '✎ 手書き中' : '✎ 手書き'}
        </button>
        {signedIn ? (
          <button type="button" className="btn" onClick={() => refreshEvents()}>
            更新
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={() => doSignIn(false)} disabled={!hasClientId()}>
            サインイン
          </button>
        )}
      </header>

      {inkMode && monthInk && (
        <div className="ink-bar">
          <InkToolbar
            state={inkState}
            sizes={INK_SIZES}
            canUndo={monthInk.strokes.some((s) => layerOf(s) === activeLayer)}
            onChange={setInkState}
            onUndo={() => {
              // 選択中レイヤーの最後の線だけ取り消す
              let idx = -1;
              for (let i = monthInk.strokes.length - 1; i >= 0; i--) {
                if (layerOf(monthInk.strokes[i]) === activeLayer) {
                  idx = i;
                  break;
                }
              }
              if (idx >= 0) changeInk(monthInk.strokes.filter((_, i) => i !== idx));
            }}
            onClear={() => changeInk(monthInk.strokes.filter((s) => layerOf(s) !== activeLayer))}
          />
          <span className="spacer" />
          <span className="save-state">
            {inkSave === 'saving' ? '保存中…' : inkSave === 'saved' ? 'ドライブに保存済み' : inkSave === 'local' ? 'この端末のみに保存' : inkSave === 'error' ? '保存に失敗' : ''}
          </span>
          <button type="button" className="btn primary" onClick={() => setInkMode(false)}>
            完了
          </button>
          <LayerBar
            layers={inkSettings.layers}
            activeId={activeLayer}
            hidden={hiddenLayers}
            dimOthers={dimOthers}
            strokeCounts={monthInk.strokes.reduce((m, s) => m.set(layerOf(s), (m.get(layerOf(s)) ?? 0) + 1), new Map<string, number>())}
            onSelect={selectLayer}
            onToggleVisible={toggleLayerVisible}
            onShowAll={() => {
              const s = new Set<string>();
              saveHiddenLayers(s);
              setHiddenLayers(s);
            }}
            onAdd={(name, color) => {
              const id = newLayerId();
              updateLayers((ls) => [...ls, { id, name, color }]);
              setActiveLayer(id);
              saveActiveLayer(id);
              setInkState((s) => ({ ...s, color, tool: 'pen' }));
            }}
            onRename={(id, name) => updateLayers((ls) => ls.map((l) => (l.id === id ? { ...l, name } : l)))}
            onRecolor={(id, color) => {
              updateLayers((ls) => ls.map((l) => (l.id === id ? { ...l, color } : l)));
              if (id === activeLayer) setInkState((s) => ({ ...s, color }));
            }}
            onRemove={(id) => {
              updateLayers((ls) => ls.filter((l) => l.id !== id));
              changeInk(monthInk.strokes.filter((s) => layerOf(s) !== id));
            }}
            onDimChange={(v) => {
              setDimOthers(v);
              saveDimOthers(v);
            }}
          />
        </div>
      )}

      {error && (
        <div className="banner error">
          <span>{error}</span>
          {!signedIn && hasClientId() && (
            <button type="button" className="btn-small" onClick={() => doSignIn(true)}>
              再サインイン
            </button>
          )}
          <button type="button" className="icon-btn" aria-label="閉じる" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
      {!hasClientId() && (
        <div className="banner">
          <span>
            Google 連携を使うには <code>.env</code> に <code>VITE_GOOGLE_CLIENT_ID</code> を設定してください(README 参照)。設定前でもカレンダーと日記(この端末のみ)は使えます。
          </span>
        </div>
      )}

      <div className="body">
        <nav className={'sidebar' + (sidebarOpen ? ' open' : '') + (sidebarCollapsed ? ' collapsed' : '')}>
          <div className="sidebar-head">
            <span>メニュー</span>
            <button type="button" className="icon-btn" aria-label="メニューを閉じる" onClick={() => setSidebarOpen(false)}>
              ×
            </button>
          </div>
          <h2>マイカレンダー</h2>
          {calendars.length === 0 && <p className="muted small">{signedIn ? '読み込み中…' : 'サインインすると表示されます'}</p>}
          <ul className="cal-list">
            {calendars.map((c) => (
              <li key={c.id}>
                <label>
                  <input type="checkbox" checked={!hiddenCals.has(c.id)} onChange={() => toggleCal(c.id)} />
                  <span className="cal-color" style={{ background: c.backgroundColor }} />
                  <span className="cal-name">{c.summary}</span>
                </label>
              </li>
            ))}
          </ul>
          {signedIn && (
            <>
              <h2>アカウント</h2>
              <button
                type="button"
                className="btn-small"
                onClick={() => {
                  if (confirm('サインアウトしますか?\n予定の表示とドライブへの保存が止まります(この端末に保存済みの日記は残ります)。')) {
                    signOut();
                    setSidebarOpen(false);
                  }
                }}
              >
                サインアウト
              </button>
            </>
          )}
          <h2>操作</h2>
          <ul className="help">
            <li>日付をクリック: その日の予定・日記を開く</li>
            <li>ダブルクリック / c キー: 予定を作成</li>
            <li>t: 今日, j/k: 翌月/前月</li>
            <li>✎ 手書き: 押すと月表示の上に直接書けます。書き終えたら「完了」</li>
          </ul>
        </nav>
        {sidebarOpen && <button type="button" className="scrim" aria-label="メニューを閉じる" onClick={() => setSidebarOpen(false)} />}

        <main ref={mainRef} className="main">
          <MonthStrip year={year} month0={month0} onChange={(y, m) => setMonth(new Date(y, m, 1))} />
          <div className={'month-slide' + (slide ? ' slide-' + slide : '')}>
          <MonthView
            year={year}
            month0={month0}
            eventsByDay={eventsByDay}
            diaryDays={diaryDays}
            selectedKey={selectedKey}
            onSelect={(d) => setSelected(d)}
            onCreate={(d) => {
              setSelected(d);
              if (signedIn) setEditor({ mode: 'create', date: d });
            }}
            onOpenEvent={(ev) => setEditor({ mode: 'edit', event: ev })}
            ink={
              monthInk
                ? {
                    strokes: monthInk.strokes,
                    state: inkState,
                    active: inkMode,
                    activeLayer,
                    hiddenLayers,
                    dimOthers,
                    onChange: changeInk,
                  }
                : undefined
            }
          />
          </div>
        </main>

        {selected && (
          <DayPanel
            date={selected}
            events={eventsByDay.get(selectedKey!) ?? []}
            entry={entry}
            saveState={saveState}
            signedIn={signedIn}
            uploading={uploading}
            onChangeEntry={changeEntry}
            onAddImages={handleAddImages}
            onRemoveImage={handleRemoveImage}
            onCreateEvent={() => setEditor({ mode: 'create', date: selected })}
            onOpenEvent={(ev) => setEditor({ mode: 'edit', event: ev })}
            onClose={() => setSelected(null)}
          />
        )}
      </div>

      {DEBUG && <DebugOverlay />}

      {editor && (
        <EventEditor
          calendars={calendars}
          event={editor.mode === 'edit' ? editor.event : undefined}
          initialDate={editor.mode === 'create' ? editor.date : undefined}
          defaultCalendarId={primaryCal}
          busy={busy}
          onSave={saveEvent}
          onDelete={removeEvent}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
