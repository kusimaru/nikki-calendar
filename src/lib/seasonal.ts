// 二十四節気・雑節・年中行事
import { solveSunLongitude, tmToYmd, ymdToTm } from './astro.ts';
import { toKyureki } from './kyureki.ts';

export interface SolarTerm {
  name: string;
  longitude: number;
  month: number;
  day: number;
}

// 黄経 → 節気名と、おおよその月・日(探索の初期値)
const TERMS: [number, string, number, number][] = [
  [285, '小寒', 1, 6],
  [300, '大寒', 1, 20],
  [315, '立春', 2, 4],
  [330, '雨水', 2, 19],
  [345, '啓蟄', 3, 6],
  [0, '春分', 3, 21],
  [15, '清明', 4, 5],
  [30, '穀雨', 4, 20],
  [45, '立夏', 5, 6],
  [60, '小満', 5, 21],
  [75, '芒種', 6, 6],
  [90, '夏至', 6, 21],
  [105, '小暑', 7, 7],
  [120, '大暑', 7, 23],
  [135, '立秋', 8, 8],
  [150, '処暑', 8, 23],
  [165, '白露', 9, 8],
  [180, '秋分', 9, 23],
  [195, '寒露', 10, 8],
  [210, '霜降', 10, 23],
  [225, '立冬', 11, 7],
  [240, '小雪', 11, 22],
  [255, '大雪', 12, 7],
  [270, '冬至', 12, 22],
];

const termCache = new Map<number, SolarTerm[]>();

/** 年内の二十四節気(日付順) */
export function solarTermsOfYear(year: number): SolarTerm[] {
  const hit = termCache.get(year);
  if (hit) return hit;
  const list = TERMS.map(([lng, name, m, d]) => {
    const tm = solveSunLongitude(ymdToTm(year, m, d), lng);
    const ymd = tmToYmd(tm);
    return { name, longitude: lng, month: ymd.month, day: ymd.day };
  });
  termCache.set(year, list);
  return list;
}

/** 黄経 lng に達する日(年内・初期値 month/day 付近) */
function dayAtLongitude(year: number, lng: number, month: number, day: number): { month: number; day: number } {
  const ymd = tmToYmd(solveSunLongitude(ymdToTm(year, month, day), lng));
  return { month: ymd.month, day: ymd.day };
}

const ETO_STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ETO_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** 日の干支(例: 戊午)。index 0 = 甲子 */
export function dayEtoIndex(year: number, month: number, day: number): number {
  const tm = Math.floor(ymdToTm(year, month, day));
  return (((tm + 50) % 60) + 60) % 60;
}

export function dayEto(year: number, month: number, day: number): string {
  const i = dayEtoIndex(year, month, day);
  return ETO_STEMS[i % 10] + ETO_BRANCHES[i % 12];
}

function addDays(year: number, month: number, day: number, n: number): { month: number; day: number } {
  const d = new Date(year, month - 1, day + n);
  return { month: d.getMonth() + 1, day: d.getDate() };
}

function nthSunday(year: number, month: number, n: number): number {
  const first = new Date(year, month - 1, 1).getDay();
  return 1 + ((7 - first) % 7) + (n - 1) * 7;
}

/** 旧暦 month/day に当たる新暦の日付を、探索範囲(月)から求める */
function findLunar(year: number, kMonth: number, kDay: number, fromMonth: number, toMonth: number) {
  for (let m = fromMonth; m <= toMonth; m++) {
    for (let d = 1; d <= 31; d++) {
      const date = new Date(year, m - 1, d);
      if (date.getMonth() !== m - 1) continue;
      const k = toKyureki(year, m, d);
      if (k.month === kMonth && k.day === kDay && !k.leap) return { month: m, day: d };
    }
  }
  return undefined;
}

const seasonalCache = new Map<number, Map<string, string[]>>();

function add(map: Map<string, string[]>, m: number, d: number, name: string) {
  const k = `${m}-${d}`;
  const arr = map.get(k) ?? [];
  if (!arr.includes(name)) arr.push(name);
  map.set(k, arr);
}

/** 年内の雑節・年中行事・節気の一覧(key: "M-D") */
export function seasonalOfYear(year: number): Map<string, string[]> {
  const hit = seasonalCache.get(year);
  if (hit) return hit;
  const map = new Map<string, string[]>();

  // 二十四節気
  const terms = solarTermsOfYear(year);
  for (const t of terms) add(map, t.month, t.day, t.name);
  const term = (name: string) => terms.find((t) => t.name === name)!;

  // 雑節
  const risshun = term('立春');
  const setsubun = addDays(year, risshun.month, risshun.day, -1);
  add(map, setsubun.month, setsubun.day, '節分');
  for (const [nm, n] of [
    ['八十八夜', 87],
    ['二百十日', 209],
    ['二百二十日', 219],
  ] as const) {
    const d = addDays(year, risshun.month, risshun.day, n);
    add(map, d.month, d.day, nm);
  }
  for (const eq of [term('春分'), term('秋分')]) {
    const iri = addDays(year, eq.month, eq.day, -3);
    const ake = addDays(year, eq.month, eq.day, 3);
    add(map, iri.month, iri.day, '彼岸入り');
    add(map, eq.month, eq.day, '彼岸の中日');
    add(map, ake.month, ake.day, '彼岸明け');
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      const d = addDays(year, eq.month, eq.day, i);
      add(map, d.month, d.day, '彼岸');
    }
  }
  const nyubai = dayAtLongitude(year, 80, 6, 11);
  add(map, nyubai.month, nyubai.day, '入梅');
  const hangesho = dayAtLongitude(year, 100, 7, 2);
  add(map, hangesho.month, hangesho.day, '半夏生');
  const doyo: [number, number, number, string][] = [
    [297, 1, 17, '冬'],
    [27, 4, 17, '春'],
    [117, 7, 20, '夏'],
    [207, 10, 20, '秋'],
  ];
  for (const [lng, m, d, season] of doyo) {
    const iri = dayAtLongitude(year, lng, m, d);
    add(map, iri.month, iri.day, `${season}土用入り`);
  }
  // 夏の土用の丑の日(土用入り〜立秋前日)
  const natsuIri = dayAtLongitude(year, 117, 7, 20);
  const risshu = term('立秋');
  let ushiCount = 0;
  for (let i = 0; i < 20; i++) {
    const d = addDays(year, natsuIri.month, natsuIri.day, i);
    if (d.month > risshu.month || (d.month === risshu.month && d.day >= risshu.day)) break;
    if (dayEtoIndex(year, d.month, d.day) % 12 === 1) {
      ushiCount++;
      add(map, d.month, d.day, ushiCount === 1 ? '土用の丑の日' : '二の丑');
    }
  }

  // 固定日の年中行事
  const fixed: [number, number, string][] = [
    [1, 1, '正月'],
    [1, 2, '正月'],
    [1, 3, '正月'],
    [1, 7, '七草'],
    [1, 11, '鏡開き'],
    [2, 14, 'バレンタインデー'],
    [3, 3, 'ひな祭り'],
    [3, 14, 'ホワイトデー'],
    [5, 5, '端午の節句'],
    [7, 7, '七夕'],
    [8, 13, '盆入り'],
    [8, 14, 'お盆'],
    [8, 15, 'お盆'],
    [8, 16, '盆明け'],
    [10, 31, 'ハロウィン'],
    [11, 15, '七五三'],
    [12, 24, 'クリスマスイブ'],
    [12, 25, 'クリスマス'],
    [12, 31, '大晦日'],
  ];
  for (const [m, d, n] of fixed) add(map, m, d, n);
  add(map, 5, nthSunday(year, 5, 2), '母の日');
  add(map, 6, nthSunday(year, 6, 3), '父の日');

  // 旧暦に基づく行事
  const kyushogatsu = findLunar(year, 1, 1, 1, 2);
  if (kyushogatsu) add(map, kyushogatsu.month, kyushogatsu.day, '旧正月');
  const jugoya = findLunar(year, 8, 15, 9, 10);
  if (jugoya) add(map, jugoya.month, jugoya.day, '十五夜');
  const jusanya = findLunar(year, 9, 13, 10, 11);
  if (jusanya) add(map, jusanya.month, jusanya.day, '十三夜');

  seasonalCache.set(year, map);
  return map;
}

export function seasonalNames(year: number, month: number, day: number): string[] {
  return seasonalOfYear(year).get(`${month}-${day}`) ?? [];
}
