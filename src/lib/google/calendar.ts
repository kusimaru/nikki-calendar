// Google Calendar API v3
import { authFetch } from './auth.ts';
import { ymdKey } from '../date.ts';

const BASE = 'https://www.googleapis.com/calendar/v3';

export interface CalendarInfo {
  id: string;
  summary: string;
  backgroundColor: string;
  foregroundColor: string;
  primary: boolean;
  writable: boolean;
}

export interface CalEvent {
  id: string;
  calendarId: string;
  summary: string;
  description?: string;
  location?: string;
  allDay: boolean;
  start: Date;
  /** 終日イベントは Google 同様に排他的終了日(翌日 0 時) */
  end: Date;
  colorId?: string;
  color: string;
  htmlLink?: string;
}

// Google カレンダーのイベント色パレット(colorId → 背景色)
export const EVENT_COLORS: Record<string, string> = {
  '1': '#7986cb',
  '2': '#33b679',
  '3': '#8e24aa',
  '4': '#e67c73',
  '5': '#f6bf26',
  '6': '#f4511e',
  '7': '#039be5',
  '8': '#616161',
  '9': '#3f51b5',
  '10': '#0b8043',
  '11': '#d50000',
};

interface RawEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  colorId?: string;
  htmlLink?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
}

export async function listCalendars(): Promise<CalendarInfo[]> {
  const res = await authFetch(`${BASE}/users/me/calendarList?minAccessRole=reader&maxResults=250`);
  const j = await res.json();
  return (j.items ?? []).map((c: Record<string, unknown>) => ({
    id: c.id as string,
    summary: (c.summaryOverride as string) || (c.summary as string),
    backgroundColor: (c.backgroundColor as string) ?? '#4285f4',
    foregroundColor: (c.foregroundColor as string) ?? '#ffffff',
    primary: Boolean(c.primary),
    writable: c.accessRole === 'owner' || c.accessRole === 'writer',
  }));
}

function parseDate(s: { date?: string; dateTime?: string }): Date {
  if (s.dateTime) return new Date(s.dateTime);
  const [y, m, d] = (s.date as string).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export async function listEvents(cal: CalendarInfo, timeMin: Date, timeMax: Date): Promise<CalEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '2500',
  });
  const res = await authFetch(`${BASE}/calendars/${encodeURIComponent(cal.id)}/events?${params}`);
  const j = await res.json();
  return (j.items ?? [])
    .filter((e: RawEvent) => e.status !== 'cancelled')
    .map((e: RawEvent) => ({
      id: e.id,
      calendarId: cal.id,
      summary: e.summary ?? '(タイトルなし)',
      description: e.description,
      location: e.location,
      allDay: Boolean(e.start.date),
      start: parseDate(e.start),
      end: parseDate(e.end),
      colorId: e.colorId,
      color: (e.colorId && EVENT_COLORS[e.colorId]) || cal.backgroundColor,
      htmlLink: e.htmlLink,
    }));
}

export interface EventInput {
  summary: string;
  description?: string;
  location?: string;
  allDay: boolean;
  start: Date;
  end: Date;
  colorId?: string;
}

function toBody(input: EventInput) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';
  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description || undefined,
    location: input.location || undefined,
  };
  if (input.allDay) {
    body.start = { date: ymdKey(input.start) };
    body.end = { date: ymdKey(input.end) };
  } else {
    body.start = { dateTime: input.start.toISOString(), timeZone: tz };
    body.end = { dateTime: input.end.toISOString(), timeZone: tz };
  }
  if (input.colorId) body.colorId = input.colorId;
  return body;
}

export async function createEvent(calendarId: string, input: EventInput): Promise<void> {
  await authFetch(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toBody(input)),
  });
}

export async function updateEvent(calendarId: string, eventId: string, input: EventInput): Promise<void> {
  await authFetch(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toBody(input)),
  });
}

export async function deleteEvent(calendarId: string, eventId: string): Promise<void> {
  await authFetch(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  });
}

/** イベントを日付キーごとに振り分ける(終日の複数日イベントは各日に載せる) */
export function groupByDay(events: CalEvent[]): Map<string, CalEvent[]> {
  const map = new Map<string, CalEvent[]>();
  for (const e of events) {
    const days: string[] = [];
    if (e.allDay) {
      for (let d = new Date(e.start); d < e.end; d.setDate(d.getDate() + 1)) days.push(ymdKey(d));
    } else {
      const endInclusive = new Date(e.end.getTime() - 1);
      for (let d = new Date(e.start.getFullYear(), e.start.getMonth(), e.start.getDate()); d <= endInclusive; d.setDate(d.getDate() + 1)) {
        days.push(ymdKey(d));
      }
    }
    for (const k of days) {
      const arr = map.get(k) ?? [];
      arr.push(e);
      map.set(k, arr);
    }
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime());
  }
  return map;
}
