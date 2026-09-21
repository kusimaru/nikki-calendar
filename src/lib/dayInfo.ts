// 1 日分の暦情報をまとめて返す
import { holidayName } from './holidays.ts';
import { formatKyureki, rokuyoOf, toKyureki, type Rokuyo } from './kyureki.ts';
import { dayEto, seasonalNames } from './seasonal.ts';

export interface DayInfo {
  holiday?: string;
  seasonal: string[];
  rokuyo: Rokuyo;
  kyureki: string;
  eto: string;
  isSunday: boolean;
  isSaturday: boolean;
}

const cache = new Map<string, DayInfo>();

export function getDayInfo(d: Date): DayInfo {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const key = `${y}-${m}-${day}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const info: DayInfo = {
    holiday: holidayName(y, m, day),
    seasonal: seasonalNames(y, m, day),
    rokuyo: rokuyoOf(y, m, day),
    kyureki: formatKyureki(toKyureki(y, m, day)),
    eto: dayEto(y, m, day),
    isSunday: d.getDay() === 0,
    isSaturday: d.getDay() === 6,
  };
  cache.set(key, info);
  return info;
}
