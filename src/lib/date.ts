// 日付ユーティリティ(月曜始まり)
export const WEEKDAYS_JA = ['月', '火', '水', '木', '金', '土', '日'];

export function ymdKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** 月曜始まりの週グリッド。その月の日を含む週だけ(4〜6 週)。翌月だけの週は含めない */
export function monthGrid(year: number, month0: number): Date[][] {
  const first = new Date(year, month0, 1);
  const offset = (first.getDay() + 6) % 7; // 月曜=0
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const rows = Math.ceil((offset + daysInMonth) / 7);
  const start = addDays(first, -offset);
  const weeks: Date[][] = [];
  for (let w = 0; w < rows; w++) {
    const row: Date[] = [];
    for (let i = 0; i < 7; i++) row.push(addDays(start, w * 7 + i));
    weeks.push(row);
  }
  return weeks;
}

export function formatTime(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function toLocalInputValue(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${ymdKey(d)}T${h}:${m}`;
}
