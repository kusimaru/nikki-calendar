// 予定の作成・編集ダイアログ
import { useEffect, useState } from 'react';
import type { CalEvent, CalendarInfo, EventInput } from '../lib/google/calendar.ts';
import { EVENT_COLORS } from '../lib/google/calendar.ts';
import { addDays, parseKey, toLocalInputValue, ymdKey } from '../lib/date.ts';

interface Props {
  calendars: CalendarInfo[];
  event?: CalEvent;
  initialDate?: Date;
  defaultCalendarId: string;
  busy: boolean;
  onSave(calendarId: string, input: EventInput): void;
  onDelete(): void;
  onClose(): void;
}

function defaultStart(d: Date): Date {
  const now = new Date();
  const s = new Date(d);
  if (ymdKey(d) === ymdKey(now)) s.setHours(now.getHours() + 1, 0, 0, 0);
  else s.setHours(9, 0, 0, 0);
  return s;
}

export default function EventEditor({ calendars, event, initialDate, defaultCalendarId, busy, onSave, onDelete, onClose }: Props) {
  const [summary, setSummary] = useState(event?.summary ?? '');
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [start, setStart] = useState<Date>(() => event?.start ?? defaultStart(initialDate ?? new Date()));
  const [end, setEnd] = useState<Date>(() => {
    if (event) return event.allDay ? addDays(event.end, -1) : event.end; // 終日は表示上「含む終了日」
    const s = defaultStart(initialDate ?? new Date());
    return new Date(s.getTime() + 60 * 60 * 1000);
  });
  const [calendarId, setCalendarId] = useState(event?.calendarId ?? defaultCalendarId);
  const [colorId, setColorId] = useState(event?.colorId ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [description, setDescription] = useState(event?.description ?? '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const writable = calendars.filter((c) => c.writable);

  const changeStart = (d: Date) => {
    const duration = end.getTime() - start.getTime();
    setStart(d);
    setEnd(new Date(d.getTime() + Math.max(duration, 0)));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) return;
    let s = start;
    let en = end;
    if (allDay) {
      s = parseKey(ymdKey(start));
      en = addDays(parseKey(ymdKey(end < start ? start : end)), 1); // 排他的終了日
    } else if (en <= s) {
      en = new Date(s.getTime() + 30 * 60 * 1000);
    }
    onSave(calendarId, { summary: summary.trim(), allDay, start: s, end: en, colorId: colorId || undefined, location, description });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <input
          className="modal-title"
          placeholder="タイトルを追加"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          autoFocus
          required
        />
        <label className="row">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> 終日
        </label>
        <div className="row two">
          <label>
            開始
            {allDay ? (
              <input type="date" value={ymdKey(start)} onChange={(e) => e.target.value && changeStart(parseKey(e.target.value))} />
            ) : (
              <input
                type="datetime-local"
                value={toLocalInputValue(start)}
                onChange={(e) => e.target.value && changeStart(new Date(e.target.value))}
              />
            )}
          </label>
          <label>
            終了
            {allDay ? (
              <input type="date" value={ymdKey(end)} onChange={(e) => e.target.value && setEnd(parseKey(e.target.value))} />
            ) : (
              <input type="datetime-local" value={toLocalInputValue(end)} onChange={(e) => e.target.value && setEnd(new Date(e.target.value))} />
            )}
          </label>
        </div>
        <div className="row two">
          <label>
            カレンダー
            <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)} disabled={Boolean(event)}>
              {writable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.summary}
                </option>
              ))}
            </select>
          </label>
          <label>
            色
            <select value={colorId} onChange={(e) => setColorId(e.target.value)}>
              <option value="">カレンダーの色</option>
              {Object.keys(EVENT_COLORS).map((id) => (
                <option key={id} value={id}>
                  色 {id}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="row">
          場所
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="場所を追加" />
        </label>
        <label className="row">
          説明
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="説明を追加" />
        </label>
        <div className="modal-actions">
          {event && (
            <button type="button" className="btn danger" disabled={busy} onClick={onDelete}>
              削除
            </button>
          )}
          <span className="spacer" />
          {event?.htmlLink && (
            <a className="btn" href={event.htmlLink} target="_blank" rel="noreferrer">
              Google で開く
            </a>
          )}
          <button type="button" className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button type="submit" className="btn primary" disabled={busy || writable.length === 0}>
            保存
          </button>
        </div>
      </form>
    </div>
  );
}
