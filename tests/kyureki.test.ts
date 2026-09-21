import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toKyureki, rokuyoOf } from '../src/lib/kyureki.ts';
import { tmToYmd, ymdToTm } from '../src/lib/astro.ts';

test('tm と年月日の相互変換', () => {
  assert.equal(ymdToTm(2000, 1, 1), 2451544);
  assert.deepEqual(tmToYmd(ymdToTm(2026, 9, 21)), { year: 2026, month: 9, day: 21 });
  assert.deepEqual(tmToYmd(ymdToTm(2024, 2, 29)), { year: 2024, month: 2, day: 29 });
});

test('旧正月', () => {
  assert.deepEqual(toKyureki(2026, 2, 17), { year: 2026, month: 1, leap: false, day: 1 });
  assert.deepEqual(toKyureki(2025, 1, 29), { year: 2025, month: 1, leap: false, day: 1 });
  assert.deepEqual(toKyureki(2024, 2, 10), { year: 2024, month: 1, leap: false, day: 1 });
});

test('閏月 (2025年 閏6月は 7/25 開始)', () => {
  assert.deepEqual(toKyureki(2025, 7, 25), { year: 2025, month: 6, leap: true, day: 1 });
  assert.deepEqual(toKyureki(2025, 7, 24), { year: 2025, month: 6, leap: false, day: 30 });
});

test('中秋の名月 2026-09-25 = 旧8/15', () => {
  assert.deepEqual(toKyureki(2026, 9, 25), { year: 2026, month: 8, leap: false, day: 15 });
});

test('年末年始の旧暦年', () => {
  const k = toKyureki(2026, 1, 1);
  assert.equal(k.year, 2025);
  assert.equal(k.month, 11);
});

test('六曜', () => {
  // 2026-02-17 旧1/1 → (1+1)%6=2 → 先勝
  assert.equal(rokuyoOf(2026, 2, 17), '先勝');
  // 2026-09-25 旧8/15 → 23%6=5 → 仏滅
  assert.equal(rokuyoOf(2026, 9, 25), '仏滅');
});
