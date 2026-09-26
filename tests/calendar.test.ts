import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holidayName, holidaysOfYear } from '../src/lib/holidays.ts';
import { seasonalNames, solarTermsOfYear, dayEto } from '../src/lib/seasonal.ts';
import { monthGrid } from '../src/lib/date.ts';

test('2026 年の祝日', () => {
  const h = holidaysOfYear(2026);
  const expect: Record<string, string> = {
    '1-1': '元日',
    '1-12': '成人の日',
    '2-11': '建国記念の日',
    '2-23': '天皇誕生日',
    '3-20': '春分の日',
    '4-29': '昭和の日',
    '5-3': '憲法記念日',
    '5-4': 'みどりの日',
    '5-5': 'こどもの日',
    '5-6': '振替休日',
    '7-20': '海の日',
    '8-11': '山の日',
    '9-21': '敬老の日',
    '9-22': '国民の休日',
    '9-23': '秋分の日',
    '10-12': 'スポーツの日',
    '11-3': '文化の日',
    '11-23': '勤労感謝の日',
  };
  assert.deepEqual(Object.fromEntries(h), expect);
});

test('2024 年の祝日(振替休日・秋分 9/22)', () => {
  assert.equal(holidayName(2024, 9, 22), '秋分の日');
  assert.equal(holidayName(2024, 9, 23), '振替休日');
  assert.equal(holidayName(2024, 5, 6), '振替休日');
  assert.equal(holidayName(2024, 8, 12), '振替休日');
  assert.equal(holidayName(2024, 11, 4), '振替休日');
});

test('2026 年の二十四節気', () => {
  const t = Object.fromEntries(solarTermsOfYear(2026).map((x) => [x.name, `${x.month}/${x.day}`]));
  assert.equal(t['立春'], '2/4');
  assert.equal(t['春分'], '3/20');
  assert.equal(t['夏至'], '6/21');
  assert.equal(t['秋分'], '9/23');
  assert.equal(t['冬至'], '12/22');
  assert.equal(t['立秋'], '8/7');
});

test('2026 年の雑節・行事', () => {
  assert.ok(seasonalNames(2026, 2, 3).includes('節分'));
  assert.ok(seasonalNames(2026, 3, 17).includes('彼岸入り'));
  assert.ok(seasonalNames(2026, 3, 23).includes('彼岸明け'));
  assert.ok(seasonalNames(2026, 5, 2).includes('八十八夜'));
  assert.ok(seasonalNames(2026, 6, 11).includes('入梅'));
  assert.ok(seasonalNames(2026, 9, 1).includes('二百十日'));
  assert.ok(seasonalNames(2026, 8, 13).includes('盆入り'));
  assert.ok(seasonalNames(2026, 9, 25).includes('十五夜'));
  assert.ok(seasonalNames(2026, 2, 17).includes('旧正月'));
  assert.ok(seasonalNames(2026, 5, 10).includes('母の日'));
  assert.ok(seasonalNames(2026, 6, 21).includes('父の日'));
  assert.ok(seasonalNames(2026, 9, 20).includes('彼岸入り'));
});

test('日の干支と土用の丑', () => {
  assert.equal(dayEto(2000, 1, 1), '戊午');
  // 2025 年の夏の土用の丑の日は 7/19 と 7/31
  assert.ok(seasonalNames(2025, 7, 19).includes('土用の丑の日'));
  assert.ok(seasonalNames(2025, 7, 31).includes('二の丑'));
});

test('月曜始まりグリッド(その月の日を含む週だけ)', () => {
  const g = monthGrid(2026, 8); // 2026-09: 火曜始まり 30 日 → 5 週
  assert.equal(g.length, 5);
  assert.equal(g[0][0].getDay(), 1);
  assert.equal(g[0][0].getDate(), 31); // 8/31 (月)
  assert.equal(g[0][1].getDate(), 1);
  assert.equal(g[4][6].getDate(), 4); // 最終週の残りは 10/1〜10/4
  assert.equal(monthGrid(2026, 2).length, 6); // 2026-03: 日曜始まり 31 日 → 6 週
  assert.equal(monthGrid(2027, 1).length, 4); // 2027-02: 月曜始まり 28 日 → 4 週
});
