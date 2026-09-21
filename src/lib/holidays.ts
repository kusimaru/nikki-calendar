// 日本の祝日(国民の祝日に関する法律)。2000 年以降を対象に規則ベースで算出する。
import { solveSunLongitude, tmToYmd, ymdToTm } from './astro.ts';

const cache = new Map<number, Map<string, string>>();

function key(m: number, d: number): string {
  return `${m}-${d}`;
}

/** month の n 番目の月曜日(ハッピーマンデー) */
function nthMonday(year: number, month: number, n: number): number {
  const first = new Date(year, month - 1, 1).getDay(); // 0=日
  const offset = (8 - first) % 7; // 最初の月曜までの日数
  return 1 + offset + (n - 1) * 7;
}

function equinoxDay(year: number, lng: 0 | 180): number {
  // 天文計算で春分/秋分の日付を求める(官報の暦要項と一致する)
  const guess = ymdToTm(year, lng === 0 ? 3 : 9, 21);
  return tmToYmd(solveSunLongitude(guess, lng)).day;
}

function baseHolidays(year: number): Map<string, string> {
  const h = new Map<string, string>();
  h.set(key(1, 1), '元日');
  h.set(key(1, nthMonday(year, 1, 2)), '成人の日');
  h.set(key(2, 11), '建国記念の日');
  if (year >= 2020) h.set(key(2, 23), '天皇誕生日');
  h.set(key(3, equinoxDay(year, 0)), '春分の日');
  h.set(key(4, 29), year >= 2007 ? '昭和の日' : 'みどりの日');
  h.set(key(5, 3), '憲法記念日');
  if (year >= 2007) h.set(key(5, 4), 'みどりの日');
  h.set(key(5, 5), 'こどもの日');
  if (year === 2020) h.set(key(7, 23), '海の日');
  else if (year === 2021) h.set(key(7, 22), '海の日');
  else if (year >= 2003) h.set(key(7, nthMonday(year, 7, 3)), '海の日');
  else h.set(key(7, 20), '海の日');
  if (year === 2020) h.set(key(8, 10), '山の日');
  else if (year === 2021) h.set(key(8, 8), '山の日');
  else if (year >= 2016) h.set(key(8, 11), '山の日');
  h.set(key(9, nthMonday(year, 9, 3)), '敬老の日');
  h.set(key(9, equinoxDay(year, 180)), '秋分の日');
  if (year === 2020) h.set(key(7, 24), 'スポーツの日');
  else if (year === 2021) h.set(key(7, 23), 'スポーツの日');
  else h.set(key(10, nthMonday(year, 10, 2)), year >= 2020 ? 'スポーツの日' : '体育の日');
  h.set(key(11, 3), '文化の日');
  h.set(key(11, 23), '勤労感謝の日');
  if (year <= 2018) h.set(key(12, 23), '天皇誕生日');
  if (year === 2019) {
    h.set(key(5, 1), '天皇の即位の日');
    h.set(key(10, 22), '即位礼正殿の儀');
  }
  return h;
}

export function holidaysOfYear(year: number): Map<string, string> {
  const hit = cache.get(year);
  if (hit) return hit;
  const h = baseHolidays(year);

  // 振替休日: 祝日が日曜なら、その後の最初の平日(祝日でない日)が休日
  const fixed = Array.from(h.keys());
  for (const k of fixed) {
    const [m, d] = k.split('-').map(Number);
    const date = new Date(year, m - 1, d);
    if (date.getDay() !== 0) continue;
    const next = new Date(date);
    do {
      next.setDate(next.getDate() + 1);
    } while (h.has(key(next.getMonth() + 1, next.getDate())));
    if (next.getFullYear() === year) h.set(key(next.getMonth() + 1, next.getDate()), '振替休日');
  }

  // 国民の休日: 前日と翌日が祝日で、その日が日曜・祝日でない場合
  for (let m = 1; m <= 12; m++) {
    for (let d = 2; d <= 30; d++) {
      const date = new Date(year, m - 1, d);
      if (date.getMonth() !== m - 1) continue;
      if (h.has(key(m, d)) || date.getDay() === 0) continue;
      const prev = new Date(year, m - 1, d - 1);
      const next = new Date(year, m - 1, d + 1);
      if (
        h.has(key(prev.getMonth() + 1, prev.getDate())) &&
        h.has(key(next.getMonth() + 1, next.getDate())) &&
        h.get(key(prev.getMonth() + 1, prev.getDate())) !== '振替休日'
      ) {
        h.set(key(m, d), '国民の休日');
      }
    }
  }
  cache.set(year, h);
  return h;
}

/** 祝日名を返す(祝日でなければ undefined) */
export function holidayName(year: number, month: number, day: number): string | undefined {
  return holidaysOfYear(year).get(key(month, day));
}
