// 日別パネル: 予定・日記・写真・手書き
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { WEEKDAYS_JA, formatTime } from '../lib/date.ts';
import { getDayInfo } from '../lib/dayInfo.ts';
import type { CalEvent } from '../lib/google/calendar.ts';
import type { DiaryEntry, DiaryImage, SaveState, Stroke } from '../lib/diary.ts';
import { fileBlobUrl } from '../lib/google/drive.ts';
import Handwriting from './Handwriting.tsx';

interface Props {
  date: Date;
  events: CalEvent[];
  entry: DiaryEntry | null;
  saveState: SaveState;
  signedIn: boolean;
  uploading: boolean;
  onChangeEntry(patch: Partial<DiaryEntry>): void;
  onAddImages(files: File[]): void;
  onRemoveImage(img: DiaryImage): void;
  onCreateEvent(): void;
  onOpenEvent(ev: CalEvent): void;
  onClose(): void;
  /** 全画面表示(広い画面のみ意味を持つ) */
  wide: boolean;
  onToggleWide(): void;
}

const SAVE_LABEL: Record<SaveState, string> = {
  idle: '',
  saving: '保存中…',
  saved: 'ドライブに保存済み',
  local: 'この端末のみに保存(サインイン後に同期)',
  error: '保存に失敗しました',
};

function ImageThumb({ img, onRemove }: { img: DiaryImage; onRemove(): void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fileBlobUrl(img.id)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [img.id]);
  return (
    <div className="thumb">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={img.name} />
        </a>
      ) : (
        <div className="thumb-placeholder">{failed ? '読込失敗' : '読込中…'}</div>
      )}
      <button
        type="button"
        className="thumb-del"
        aria-label="削除"
        onClick={() => {
          if (confirm('この写真を削除しますか?')) onRemove();
        }}
      >
        ×
      </button>
    </div>
  );
}

export default function DayPanel(p: Props) {
  const info = getDayInfo(p.date);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const weekday = WEEKDAYS_JA[(p.date.getDay() + 6) % 7];

  const pickImages = (files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (list.length) p.onAddImages(list);
  };

  const onPaste = (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData.items)
      .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter((f): f is File => Boolean(f));
    if (files.length) {
      e.preventDefault();
      p.onAddImages(files);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    pickImages(e.dataTransfer.files);
  };

  return (
    <aside
      className={'day-panel' + (dragOver ? ' drag' : '') + (p.wide ? ' wide' : '')}
      onPaste={onPaste}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <header className="day-head">
        <div>
          <div className="day-title">
            {p.date.getMonth() + 1}月{p.date.getDate()}日
            <span className={'day-week' + (info.isSunday || info.holiday ? ' sun' : info.isSaturday ? ' sat' : '')}>({weekday})</span>
          </div>
          <div className="day-meta">
            {info.holiday && <span className="tag holiday">{info.holiday}</span>}
            {info.seasonal.map((s) => (
              <span key={s} className="tag season">
                {s}
              </span>
            ))}
            <span className="tag">{info.rokuyo}</span>
            <span className="tag">{info.kyureki}</span>
            <span className="tag">{info.eto}</span>
          </div>
        </div>
        <div className="day-head-actions">
          <button
            type="button"
            className="btn-small wide-toggle"
            title={p.wide ? '元の幅に戻す(f キー)' : '全画面にする(f キー)'}
            onClick={p.onToggleWide}
          >
            {p.wide ? '⤡ 戻す' : '⤢ 全画面'}
          </button>
          <button type="button" className="icon-btn" aria-label="閉じる" onClick={p.onClose}>
            ×
          </button>
        </div>
      </header>

      <section className="day-section">
        <div className="section-head">
          <h3>予定</h3>
          <button type="button" className="btn-small" onClick={p.onCreateEvent} disabled={!p.signedIn}>
            + 予定を追加
          </button>
        </div>
        {p.events.length === 0 ? (
          <p className="muted">{p.signedIn ? '予定はありません' : 'サインインすると Google カレンダーの予定が表示されます'}</p>
        ) : (
          <ul className="event-list">
            {p.events.map((ev) => (
              <li key={ev.calendarId + ev.id}>
                <button type="button" className="event-row" onClick={() => p.onOpenEvent(ev)}>
                  <span className="chip-dot" style={{ background: ev.color }} />
                  <span className="event-time">{ev.allDay ? '終日' : `${formatTime(ev.start)} – ${formatTime(ev.end)}`}</span>
                  <span className="event-title">{ev.summary}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="day-section">
        <div className="section-head">
          <h3>日記</h3>
          <span className={'save-state ' + p.saveState}>{SAVE_LABEL[p.saveState]}</span>
        </div>
        {p.entry ? (
          <textarea
            className="diary-text"
            placeholder="今日のできごと…"
            value={p.entry.text}
            onChange={(e) => p.onChangeEntry({ text: e.target.value })}
            rows={6}
          />
        ) : (
          <p className="muted">読み込み中…</p>
        )}
      </section>

      <section className="day-section">
        <div className="section-head">
          <h3>写真</h3>
          <button type="button" className="btn-small" disabled={!p.signedIn || uploadingLabel(p)} onClick={() => fileRef.current?.click()}>
            {p.uploading ? 'アップロード中…' : '+ 写真を追加'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              pickImages(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        {!p.signedIn && <p className="muted">写真の保存にはサインインが必要です</p>}
        {p.entry && p.entry.images.length > 0 && (
          <div className="thumbs">
            {p.entry.images.map((img) => (
              <ImageThumb key={img.id} img={img} onRemove={() => p.onRemoveImage(img)} />
            ))}
          </div>
        )}
        {p.signedIn && <p className="muted small">ドラッグ&ドロップ、または貼り付け(Ctrl+V)でも追加できます</p>}
      </section>

      <section className="day-section">
        <div className="section-head">
          <h3>手書き</h3>
        </div>
        {p.entry && (
          <Handwriting
            strokes={p.entry.strokes}
            height={p.entry.canvasHeight || 700}
            onChange={(strokes: Stroke[]) => p.onChangeEntry({ strokes })}
            onHeightChange={(h) => p.onChangeEntry({ canvasHeight: h })}
          />
        )}
      </section>
    </aside>
  );
}

function uploadingLabel(p: Props): boolean {
  return p.uploading;
}
