// 月表示(月曜始まり・Google カレンダー風)
import { useRef } from 'react';
import { WEEKDAYS_JA, isSameDay, monthGrid, ymdKey, formatTime } from '../lib/date.ts';
import { getDayInfo } from '../lib/dayInfo.ts';
import type { CalEvent } from '../lib/google/calendar.ts';
import type { Stroke } from '../lib/diary.ts';
import type { InkState } from '../lib/ink.ts';
import MonthInk from './MonthInk.tsx';

const MAX_CHIPS = 3;

interface Props {
  year: number;
  month0: number;
  eventsByDay: Map<string, CalEvent[]>;
  diaryDays: Set<string>;
  selectedKey: string | null;
  onSelect(date: Date): void;
  onCreate(date: Date): void;
  onOpenEvent(ev: CalEvent): void;
  ink?: {
    strokes: Stroke[];
    state: InkState;
    active: boolean;
    onChange(strokes: Stroke[]): void;
  };
}

export default function MonthView({ year, month0, eventsByDay, diaryDays, selectedKey, onSelect, onCreate, onOpenEvent, ink }: Props) {
  const today = new Date();
  const weeks = monthGrid(year, month0);
  const bodyRef = useRef<HTMLDivElement>(null);

  return (
    <div className="month">
      <div className="month-head">
        {WEEKDAYS_JA.map((w, i) => (
          <div key={w} className={'month-head-cell' + (i === 5 ? ' sat' : i === 6 ? ' sun' : '')}>
            {w}
          </div>
        ))}
      </div>
      <div ref={bodyRef} className={'month-body' + (ink?.active ? ' inking' : '')}>
        {weeks.map((week, wi) => (
          <div key={wi} className="month-row">
            {week.map((d) => {
              const key = ymdKey(d);
              const info = getDayInfo(d);
              const events = eventsByDay.get(key) ?? [];
              const cls = [
                'cell',
                d.getMonth() !== month0 ? 'other' : '',
                isSameDay(d, today) ? 'today' : '',
                selectedKey === key ? 'selected' : '',
                info.isSunday || info.holiday ? 'sun' : info.isSaturday ? 'sat' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <div
                  key={key}
                  className={cls}
                  onClick={() => onSelect(d)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onCreate(d);
                  }}
                >
                  <div className="cell-head">
                    <span className="cell-num">{d.getDate() === 1 ? `${d.getMonth() + 1}/1` : d.getDate()}</span>
                    {info.holiday && <span className="cell-holiday">{info.holiday}</span>}
                  </div>
                  <div className="cell-sub">
                    <span className="cell-rokuyo">{info.rokuyo}</span>
                    {info.seasonal.length > 0 && <span className="cell-season">{info.seasonal.join('・')}</span>}
                  </div>
                  {diaryDays.has(key) && <span className="cell-diary" title="日記あり">✎</span>}
                  <div className="chips">
                    {events.slice(0, MAX_CHIPS).map((ev) => (
                      <button
                        key={ev.calendarId + ev.id}
                        type="button"
                        className={'chip' + (ev.allDay ? ' allday' : '')}
                        style={ev.allDay ? { background: ev.color } : undefined}
                        title={ev.summary}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenEvent(ev);
                        }}
                      >
                        {!ev.allDay && <span className="chip-dot" style={{ background: ev.color }} />}
                        {!ev.allDay && <span className="chip-time">{formatTime(ev.start)}</span>}
                        <span className="chip-title">{ev.summary}</span>
                      </button>
                    ))}
                    {events.length > MAX_CHIPS && <div className="chip-more">他 {events.length - MAX_CHIPS} 件</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {ink && (
          <MonthInk
            containerRef={bodyRef}
            strokes={ink.strokes}
            state={ink.state}
            active={ink.active}
            onChange={ink.onChange}
          />
        )}
      </div>
    </div>
  );
}
