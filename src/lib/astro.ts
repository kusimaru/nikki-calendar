// 太陽・月の視黄経の近似計算(高野英明氏の QREKI アルゴリズムに基づく)
// 時刻の扱い: このモジュール内の tm は「JST の 0 時が整数になる日番号」(= JD - 0.5 を JST で読んだもの)

const K = Math.PI / 180;

export function normalizeAngle(a: number): number {
  a = a % 360;
  return a < 0 ? a + 360 : a;
}

/** JST の年月日(時分秒)→ tm(JST 0 時が整数) */
export function ymdToTm(year: number, month: number, day: number, hour = 0, min = 0, sec = 0): number {
  if (month < 3) {
    year -= 1;
    month += 12;
  }
  const jd =
    Math.floor(365.25 * year) +
    Math.floor(year / 400) -
    Math.floor(year / 100) +
    Math.floor(30.59 * (month - 2)) +
    day +
    1721088;
  return jd + (hour + min / 60 + sec / 3600) / 24;
}

/** tm → JST の年月日 */
export function tmToYmd(tm: number): { year: number; month: number; day: number } {
  const jd = Math.floor(tm) + 1; // 正午基準の真の JD 相当
  const a = Math.floor(jd + 0.5);
  const b = a + 1537;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  const day = b - d - Math.floor(30.6001 * e);
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;
  return { year, month, day };
}

/** tm → J2000.0 からのユリウス世紀数(UT 換算) */
function tmToT(tm: number): number {
  const tm1 = Math.floor(tm);
  const tm2 = tm - tm1 - 9 / 24;
  return (tm2 + 0.5) / 36525 + (tm1 - 2451545) / 36525;
}

export function sunLongitude(t: number): number {
  let th = 0.0004 * Math.cos(K * (31557.0 * t + 161.0));
  th += 0.0004 * Math.cos(K * (29930.0 * t + 48.0));
  th += 0.0005 * Math.cos(K * (2281.0 * t + 221.0));
  th += 0.0005 * Math.cos(K * (155.0 * t + 118.0));
  th += 0.0006 * Math.cos(K * (33718.0 * t + 316.0));
  th += 0.0007 * Math.cos(K * (9038.0 * t + 64.0));
  th += 0.0007 * Math.cos(K * (3035.0 * t + 110.0));
  th += 0.0007 * Math.cos(K * (65929.0 * t + 45.0));
  th += 0.0013 * Math.cos(K * (22519.0 * t + 352.0));
  th += 0.0015 * Math.cos(K * (45038.0 * t + 254.0));
  th += 0.0018 * Math.cos(K * (445267.0 * t + 208.0));
  th += 0.0018 * Math.cos(K * (19.0 * t + 159.0));
  th += 0.002 * Math.cos(K * (32964.0 * t + 158.0));
  th += 0.02 * Math.cos(K * (71998.1 * t + 265.1));
  th -= 0.0048 * t * Math.cos(K * (35999.05 * t + 267.52));
  th += 1.9147 * Math.cos(K * (35999.05 * t + 267.52));
  let ang = normalizeAngle(36000.7695 * t);
  ang = normalizeAngle(ang + 280.4659);
  return normalizeAngle(th + ang);
}

export function moonLongitude(t: number): number {
  let th = 0.0003 * Math.cos(K * (2322131.0 * t + 191.0));
  th += 0.0003 * Math.cos(K * (4067.0 * t + 70.0));
  th += 0.0003 * Math.cos(K * (549197.0 * t + 220.0));
  th += 0.0003 * Math.cos(K * (1808933.0 * t + 58.0));
  th += 0.0003 * Math.cos(K * (349472.0 * t + 337.0));
  th += 0.0003 * Math.cos(K * (381404.0 * t + 354.0));
  th += 0.0003 * Math.cos(K * (958465.0 * t + 340.0));
  th += 0.0004 * Math.cos(K * (12006.0 * t + 187.0));
  th += 0.0004 * Math.cos(K * (39871.0 * t + 223.0));
  th += 0.0005 * Math.cos(K * (509131.0 * t + 242.0));
  th += 0.0005 * Math.cos(K * (1745069.0 * t + 24.0));
  th += 0.0005 * Math.cos(K * (1908795.0 * t + 90.0));
  th += 0.0006 * Math.cos(K * (2258267.0 * t + 156.0));
  th += 0.0006 * Math.cos(K * (111869.0 * t + 38.0));
  th += 0.0007 * Math.cos(K * (27864.0 * t + 127.0));
  th += 0.0007 * Math.cos(K * (485333.0 * t + 186.0));
  th += 0.0007 * Math.cos(K * (405201.0 * t + 50.0));
  th += 0.0007 * Math.cos(K * (790672.0 * t + 114.0));
  th += 0.0008 * Math.cos(K * (1403732.0 * t + 98.0));
  th += 0.0009 * Math.cos(K * (858602.0 * t + 129.0));
  th += 0.0011 * Math.cos(K * (1920802.0 * t + 186.0));
  th += 0.0012 * Math.cos(K * (1267871.0 * t + 249.0));
  th += 0.0016 * Math.cos(K * (1856938.0 * t + 152.0));
  th += 0.0018 * Math.cos(K * (401329.0 * t + 274.0));
  th += 0.0021 * Math.cos(K * (341337.0 * t + 16.0));
  th += 0.0021 * Math.cos(K * (71998.0 * t + 85.0));
  th += 0.0021 * Math.cos(K * (990397.0 * t + 357.0));
  th += 0.0022 * Math.cos(K * (818536.0 * t + 151.0));
  th += 0.0023 * Math.cos(K * (922466.0 * t + 163.0));
  th += 0.0024 * Math.cos(K * (99863.0 * t + 122.0));
  th += 0.0026 * Math.cos(K * (1379739.0 * t + 17.0));
  th += 0.0027 * Math.cos(K * (918399.0 * t + 182.0));
  th += 0.0028 * Math.cos(K * (1934.0 * t + 145.0));
  th += 0.0037 * Math.cos(K * (541062.0 * t + 259.0));
  th += 0.0038 * Math.cos(K * (1781068.0 * t + 21.0));
  th += 0.004 * Math.cos(K * (133.0 * t + 29.0));
  th += 0.004 * Math.cos(K * (1844932.0 * t + 56.0));
  th += 0.004 * Math.cos(K * (1331734.0 * t + 283.0));
  th += 0.005 * Math.cos(K * (481266.0 * t + 205.0));
  th += 0.0052 * Math.cos(K * (31932.0 * t + 107.0));
  th += 0.0068 * Math.cos(K * (926533.0 * t + 323.0));
  th += 0.0079 * Math.cos(K * (449334.0 * t + 188.0));
  th += 0.0085 * Math.cos(K * (826671.0 * t + 111.0));
  th += 0.01 * Math.cos(K * (1431597.0 * t + 315.0));
  th += 0.0107 * Math.cos(K * (1303870.0 * t + 246.0));
  th += 0.011 * Math.cos(K * (489205.0 * t + 142.0));
  th += 0.0125 * Math.cos(K * (1443603.0 * t + 52.0));
  th += 0.0154 * Math.cos(K * (75870.0 * t + 41.0));
  th += 0.0304 * Math.cos(K * (513197.9 * t + 222.5));
  th += 0.0347 * Math.cos(K * (445267.1 * t + 27.9));
  th += 0.0409 * Math.cos(K * (441199.8 * t + 47.4));
  th += 0.0458 * Math.cos(K * (854535.2 * t + 148.2));
  th += 0.0533 * Math.cos(K * (1367733.1 * t + 280.7));
  th += 0.0571 * Math.cos(K * (377336.3 * t + 13.2));
  th += 0.0588 * Math.cos(K * (63863.5 * t + 124.2));
  th += 0.1144 * Math.cos(K * (966404.0 * t + 276.5));
  th += 0.1851 * Math.cos(K * (35999.05 * t + 87.53));
  th += 0.2136 * Math.cos(K * (954397.74 * t + 179.93));
  th += 0.6583 * Math.cos(K * (890534.22 * t + 145.7));
  th += 1.274 * Math.cos(K * (413335.35 * t + 10.74));
  th += 6.2888 * Math.cos(K * (477198.868 * t + 44.963));
  let ang = normalizeAngle(481267.8809 * t);
  ang = normalizeAngle(ang + 218.3162);
  return normalizeAngle(th + ang);
}

/** tm 時点の太陽黄経 */
export function sunLongitudeAt(tm: number): number {
  return sunLongitude(tmToT(tm));
}

/** 太陽黄経が target(度)になる時刻を tm の近傍で求める(結果は tm 単位・JST) */
export function solveSunLongitude(tm: number, target: number): number {
  let tm1 = Math.floor(tm);
  let tm2 = tm - tm1 - 9 / 24;
  for (let i = 0; i < 50; i++) {
    const t = (tm2 + 0.5) / 36525 + (tm1 - 2451545) / 36525;
    let delta = sunLongitude(t) - target;
    if (delta > 180) delta -= 360;
    else if (delta < -180) delta += 360;
    const d = (delta * 365.2) / 360;
    const d1 = Math.trunc(d);
    const d2 = d - d1;
    tm1 -= d1;
    tm2 -= d2;
    if (tm2 < 0) {
      tm2 += 1;
      tm1 -= 1;
    }
    if (Math.abs(d1 + d2) <= 1 / 86400) break;
  }
  return tm2 + tm1 + 9 / 24;
}

/** tm 直前(または当日)の中気(黄経 30° 刻み)。戻り値: [tm, 黄経] */
export function prevChu(tm: number): [number, number] {
  const target = 30 * Math.floor(sunLongitudeAt(tm) / 30);
  return [solveSunLongitude(tm, target), target];
}

/** tm 直前(または当日)の二分二至(黄経 90° 刻み) */
export function prevNibun(tm: number): [number, number] {
  const target = 90 * Math.floor(sunLongitudeAt(tm) / 90);
  return [solveSunLongitude(tm, target), target];
}

/** tm 直前(または当日)の朔(新月)の時刻(tm 単位・JST) */
export function prevSaku(tm: number): number {
  let tm1 = Math.floor(tm);
  let tm2 = tm - tm1 - 9 / 24;
  for (let lc = 1; lc <= 30; lc++) {
    const t = (tm2 + 0.5) / 36525 + (tm1 - 2451545) / 36525;
    const rmSun = sunLongitude(t);
    const rmMoon = moonLongitude(t);
    let delta = rmMoon - rmSun;
    if (lc === 1 && delta < 0) {
      delta = normalizeAngle(delta);
    } else if (rmSun >= 0 && rmSun <= 20 && rmMoon >= 300) {
      delta = normalizeAngle(delta);
      delta = 360 - delta;
    } else if (Math.abs(delta) > 40) {
      delta = normalizeAngle(delta);
    }
    const d = (delta * 29.530589) / 360;
    const d1 = Math.trunc(d);
    const d2 = d - d1;
    tm1 -= d1;
    tm2 -= d2;
    if (tm2 < 0) {
      tm2 += 1;
      tm1 -= 1;
    }
    if (lc === 15 && Math.abs(d1 + d2) > 1 / 86400) {
      tm1 = Math.floor(tm - 26);
      tm2 = 0;
    } else if (Math.abs(d1 + d2) <= 1 / 86400) {
      break;
    }
  }
  return tm2 + tm1 + 9 / 24;
}
