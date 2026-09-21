// 手書き共通(ペン設定・ストローク描画)
import { getStroke } from 'perfect-freehand';

export const INK_COLORS = ['#202124', '#d93025', '#1a73e8', '#188038', '#f9ab00'];
export type InkTool = 'pen' | 'eraser';

export interface InkState {
  tool: InkTool;
  color: string;
  size: number;
  penOnly: boolean;
}

export const PEN_ONLY_KEY = 'handwriting_pen_only';

export function defaultInkState(size: number): InkState {
  return {
    tool: 'pen',
    color: INK_COLORS[0],
    size,
    penOnly: typeof localStorage !== 'undefined' && localStorage.getItem(PEN_ONLY_KEY) === '1',
  };
}

/**
 * 入力の筆圧を描画用に正規化する。
 * ペンは筆圧 0 でも線が消えないよう 0.3〜1.0 に圧縮し、マウス・指は一定(0.5)にする。
 */
export function pressureOf(e: { pressure: number; pointerType: string }): number {
  if (e.pointerType === 'pen') return 0.3 + 0.7 * Math.min(1, Math.max(0, e.pressure));
  return 0.5;
}

/** マウスは左ボタンのみ。ペン・指はボタン情報がブラウザごとに揺れるので常に受け付ける */
export function isPrimaryButton(e: { pointerType: string; button: number }): boolean {
  return e.pointerType === 'mouse' ? e.button === 0 : true;
}

/** 確定済みストロークの輪郭キャッシュ(ストロークオブジェクトと描画倍率ごと) */
const pathCache = new WeakMap<object, { key: string; path: Path2D }>();
export function cachedPath(stroke: { points: number[][]; size: number; pen: boolean }, sx: number, sy: number): Path2D {
  const key = sx + ':' + sy;
  const hit = pathCache.get(stroke);
  if (hit && hit.key === key) return hit.path;
  const pts = sx === 1 && sy === 1 ? stroke.points : stroke.points.map((p) => [p[0] * sx, p[1] * sy, p[2]]);
  const path = outlinePath(pts, stroke.size * sx, stroke.pen);
  pathCache.set(stroke, { key, path });
  return path;
}

/** 診断用: 直近のポインタイベントを記録する(?debug=1 で画面に表示) */
export const inkLog: string[] = [];
export function logPointer(
  where: string,
  e: { type: string; pointerType: string; button: number; buttons: number; pressure: number; pointerId: number },
) {
  const t = new Date();
  const hms = [t.getHours(), t.getMinutes(), t.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
  inkLog.push(`${hms} ${where} ${e.type} ${e.pointerType} id=${e.pointerId} b=${e.button}/${e.buttons} p=${e.pressure.toFixed(2)}`);
  if (inkLog.length > 14) inkLog.shift();
}

/**
 * iPad Safari 向け: 描画面のタッチ既定動作(スクロール・拡大)を確実に止める。
 * ペンの縦線がスクロールと誤認されるのを防ぐため、手書き中は 1 本指も含めて全て止める。
 * 代わりに 2 本指で触れたときは、指定のスクロール要素を自前で上下に動かす。
 */
export function blockTouchGestures(
  el: HTMLElement,
  isActive: () => boolean,
  getScroller?: () => HTMLElement | null,
): () => void {
  let lastY: number | null = null;
  // ペン(stylus)の接触を除いた「指」だけを数える。置いた手のひら + ペン先を 2 本指と誤認しないため
  const fingers = (e: TouchEvent): Touch[] => {
    const out: Touch[] = [];
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i] as Touch & { touchType?: string };
      if (t.touchType !== 'stylus') out.push(t);
    }
    return out;
  };
  const avgY = (ts: Touch[]) => ts.reduce((sum, t) => sum + t.clientY, 0) / ts.length;
  const onStart = (e: TouchEvent) => {
    if (!isActive()) return;
    if (e.cancelable) e.preventDefault();
    const f = fingers(e);
    lastY = f.length >= 2 ? avgY(f) : null;
  };
  const onMove = (e: TouchEvent) => {
    if (!isActive()) return;
    if (e.cancelable) e.preventDefault();
    const f = fingers(e);
    if (f.length >= 2) {
      const y = avgY(f);
      if (lastY !== null) {
        const sc = getScroller?.();
        if (sc) sc.scrollTop -= y - lastY;
      }
      lastY = y;
    } else {
      lastY = null;
    }
  };
  const onEnd = (e: TouchEvent) => {
    const f = fingers(e);
    lastY = f.length >= 2 ? avgY(f) : null;
  };
  el.addEventListener('touchstart', onStart, { passive: false });
  el.addEventListener('touchmove', onMove, { passive: false });
  el.addEventListener('touchend', onEnd);
  el.addEventListener('touchcancel', onEnd);
  return () => {
    el.removeEventListener('touchstart', onStart);
    el.removeEventListener('touchmove', onMove);
    el.removeEventListener('touchend', onEnd);
    el.removeEventListener('touchcancel', onEnd);
  };
}

/** perfect-freehand で輪郭を作り Path2D にする(points は既に描画座標系) */
export function outlinePath(points: number[][], size: number, pen: boolean): Path2D {
  const outline = getStroke(points, {
    size,
    thinning: 0.4,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: !pen,
    last: true,
  });
  const p = new Path2D();
  if (outline.length === 0) return p;
  p.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) p.lineTo(outline[i][0], outline[i][1]);
  p.closePath();
  return p;
}
