// 旧暦(天保暦準拠の定気法)と六曜
import { ymdToTm, prevChu, prevNibun, prevSaku } from './astro.ts';

export interface Kyureki {
  year: number;
  month: number;
  leap: boolean;
  day: number;
}

export const ROKUYO_NAMES = ['大安', '赤口', '先勝', '友引', '先負', '仏滅'] as const;
export type Rokuyo = (typeof ROKUYO_NAMES)[number];

const cache = new Map<string, Kyureki>();

export function toKyureki(year: number, month: number, day: number): Kyureki {
  const key = `${year}-${month}-${day}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const tm = ymdToTm(year, month, day);

  // 直前の二分二至と、それに続く 3 つの中気
  const chu: [number, number][] = [prevNibun(tm)];
  for (let i = 1; i < 4; i++) chu.push(prevChu(chu[i - 1][0] + 32));

  // 二分二至直前の朔と、それに続く 4 つの朔
  const saku: number[] = [prevSaku(chu[0][0])];
  for (let i = 1; i < 5; i++) {
    saku.push(prevSaku(saku[i - 1] + 30));
    if (Math.abs(Math.floor(saku[i - 1]) - Math.floor(saku[i])) <= 26) {
      saku[i] = prevSaku(saku[i - 1] + 35);
    }
  }

  if (Math.floor(saku[1]) <= Math.floor(chu[0][0])) {
    for (let i = 0; i < 4; i++) saku[i] = saku[i + 1];
    saku[4] = prevSaku(saku[3] + 35);
  } else if (Math.floor(saku[0]) > Math.floor(chu[0][0])) {
    for (let i = 4; i > 0; i--) saku[i] = saku[i - 1];
    saku[0] = prevSaku(saku[0] - 27);
  }

  // 閏月の有無
  let lap = Math.floor(saku[4]) <= Math.floor(chu[3][0]);

  // 月テーブル [月数, 閏フラグ, 朔 tm]
  const m: [number, boolean, number][] = [[Math.floor(chu[0][1] / 30) + 2, false, saku[0]]];
  for (let i = 1; i < 5; i++) {
    if (lap && i !== 1) {
      // 中気 chu[i-1] が前月 (saku[i-1] 〜 saku[i]) に含まれなければ前月は閏月
      const c = Math.floor(chu[i - 1][0]);
      if (c <= Math.floor(saku[i - 1]) || c >= Math.floor(saku[i])) {
        m[i - 1] = [m[i - 2][0], true, saku[i - 1]];
        lap = false;
      }
    }
    let n = m[i - 1][0] + 1;
    if (n > 12) n -= 12;
    m.push([n, false, saku[i]]);
  }
  if (m[0][0] > 12) m[0][0] -= 12;

  let idx = 0;
  for (let i = 0; i < 5; i++) {
    if (Math.floor(tm) < Math.floor(m[i][2])) {
      idx = i - 1;
      break;
    }
    idx = i;
  }
  if (idx < 0) idx = 0;

  const kMonth = m[idx][0];
  const kLeap = m[idx][1];
  const kDay = Math.floor(tm) - Math.floor(m[idx][2]) + 1;
  let kYear = year;
  if (kMonth > 9 && kMonth > month) kYear -= 1;

  const result = { year: kYear, month: kMonth, leap: kLeap, day: kDay };
  cache.set(key, result);
  return result;
}

export function rokuyoOf(year: number, month: number, day: number): Rokuyo {
  const k = toKyureki(year, month, day);
  return ROKUYO_NAMES[(k.month + k.day) % 6];
}

export function formatKyureki(k: Kyureki): string {
  return `旧${k.leap ? '閏' : ''}${k.month}/${k.day}`;
}
