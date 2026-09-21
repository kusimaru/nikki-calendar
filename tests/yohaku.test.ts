import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertToYohakuPage, encodeChunks, YOHAKU_PAGE_WIDTH } from '../src/lib/yohakuConvert.ts';

const layers = [
  { id: 'L1', name: 'レイヤー 1', color: '#202124' },
  { id: 'Lwork', name: '仕事', color: '#d93025' },
];

test('フリースペースの線を 1200 幅に拡大して変換する', () => {
  const page = convertToYohakuPage({
    gridStrokes: [],
    freeStrokes: [{ points: [[0, 0, 0.3], [1000, 500, 1]], color: '#D93025', size: 2.5, pen: true, layer: 'Lwork' }],
    freeHeight: 600,
    layers,
    defaultLayerId: 'L1',
    title: '2026年9月 フリースペース',
    sectionId: 'sec:メモ',
    id: 'page-1',
    now: 1700000000000,
  });
  assert.equal(page.id, 'page-1');
  assert.equal(page.sectionId, 'sec:メモ');
  assert.equal(page.height, 760); // 600*1.2+40=760 → 下限と同じ
  assert.deepEqual(page.layers.map((l) => l.id), ['Lwork']);
  assert.equal(page.activeLayer, 'Lwork');
  const s = page.strokes[0];
  assert.equal(s.color, '#d93025');
  assert.equal(s.pressure, true);
  assert.equal(s.layer, 'Lwork');
  assert.deepEqual(s.points[1], [YOHAKU_PAGE_WIDTH, 600, 1]);
  assert.ok(s.width >= 1 && s.width <= 24);
});

test('カレンダー上の線を含めると上部 900 の領域に置き、フリースペースはその下', () => {
  const page = convertToYohakuPage({
    gridStrokes: [{ points: [[500, 1000, 0.5]], color: '#202124', size: 4, pen: false }],
    freeStrokes: [{ points: [[0, 0, 0.5]], color: '#202124', size: 4, pen: false, layer: 'L1' }],
    freeHeight: 1000,
    layers,
    defaultLayerId: 'L1',
    title: 't',
    id: 'p',
    now: 1,
  });
  assert.deepEqual(page.strokes[0].points[0], [600, 900, 0.5]);
  assert.deepEqual(page.strokes[1].points[0], [0, 940, 0.5]);
  assert.equal(page.height, 900 + 40 + 1200 + 40);
  assert.equal(page.strokes[0].pressure, false);
  assert.equal(page.sectionId, undefined);
});

test('未知のレイヤー ID は先頭レイヤーへ寄せ、高さは上限で止まる', () => {
  const page = convertToYohakuPage({
    gridStrokes: [],
    freeStrokes: [{ points: [[10, 10, 0.5]], color: 'red', size: 100, pen: false, layer: 'gone' }],
    freeHeight: 99999,
    layers,
    defaultLayerId: 'L1',
    title: '',
    id: 'p',
    now: 1,
  });
  assert.equal(page.height, 6000);
  assert.equal(page.strokes[0].layer, 'L1');
  assert.equal(page.strokes[0].color, '#202124');
  assert.equal(page.strokes[0].width, 24);
  assert.equal(page.title, '日記カレンダー');
});

test('base64 分割は余白ノートと同じ規則', () => {
  const chunks = encodeChunks({ a: 'あ' });
  assert.equal(chunks.length, 1);
  assert.equal(Buffer.from(chunks[0], 'base64').toString('utf8'), '{"a":"あ"}');
});
