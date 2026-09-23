// 月表示のグリッドに重ねる手書きレイヤー
import { useEffect, useRef, type RefObject } from 'react';
import type { Stroke } from '../lib/diary.ts';
import { blockTouchGestures, cachedPath, circleCursor, isPrimaryButton, logPointer, outlinePath, pressureOf, type InkState } from '../lib/ink.ts';
import { DEFAULT_LAYER_ID } from '../lib/layers.ts';

export const LOGICAL = 1000;

interface Props {
  /** 描画対象のグリッド要素(この要素のポインタ入力を横取りする) */
  containerRef: RefObject<HTMLDivElement | null>;
  strokes: Stroke[];
  state: InkState;
  /** 手書きモード(オンのときだけ描く。オフのときは一切干渉しない) */
  active: boolean;
  /** 描く先のレイヤー */
  activeLayer: string;
  /** 非表示のレイヤー */
  hiddenLayers: Set<string>;
  /** 手書き中、選択中以外のレイヤーを薄く表示する */
  dimOthers: boolean;
  /** true なら縦横同じ倍率(幅 1000 基準)。高さを伸ばしても線が歪まない */
  uniform?: boolean;
  /** uniform 時、下端近くまで描いたら呼ぶ */
  onNearBottom?(): void;
  onChange(strokes: Stroke[]): void;
}

export function layerOf(s: Stroke): string {
  return s.layer ?? DEFAULT_LAYER_ID;
}

function paint(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  sx: number,
  sy: number,
  hidden: Set<string>,
  dimExcept: string | null,
) {
  for (const s of strokes) {
    const layer = layerOf(s);
    if (hidden.has(layer)) continue;
    ctx.globalAlpha = dimExcept !== null && layer !== dimExcept ? 0.3 : 1;
    ctx.fillStyle = s.color;
    ctx.fill(cachedPath(s, sx, sy));
  }
  ctx.globalAlpha = 1;
}

function paintLive(ctx: CanvasRenderingContext2D, points: number[][], color: string, size: number, pen: boolean, sx: number, sy: number) {
  ctx.fillStyle = color;
  const pts = points.map((p) => [p[0] * sx, p[1] * sy, p[2]]);
  ctx.fill(outlinePath(pts, size * sx, pen));
}

export default function MonthInk({
  containerRef,
  strokes,
  state,
  active,
  activeLayer,
  hiddenLayers,
  dimOthers,
  uniform = false,
  onNearBottom,
  onChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const drawing = useRef<{ pointerId: number; pen: boolean; points: number[][] } | null>(null);
  const penSeen = useRef(false);
  const justDrew = useRef(false);

  // 最新の props を参照するための ref(リスナーを張り直さないため)
  const strokesRef = useRef(strokes);
  const stateRef = useRef(state);
  const activeRef = useRef(active);
  const onChangeRef = useRef(onChange);
  const layerRef = useRef(activeLayer);
  const hiddenRef = useRef(hiddenLayers);
  const dimRef = useRef(dimOthers);
  const nearBottomRef = useRef(onNearBottom);
  nearBottomRef.current = onNearBottom;
  strokesRef.current = strokes;
  stateRef.current = state;
  activeRef.current = active;
  onChangeRef.current = onChange;
  layerRef.current = activeLayer;
  hiddenRef.current = hiddenLayers;
  dimRef.current = dimOthers;

  const dpr = window.devicePixelRatio || 1;
  const scales = () => {
    const { w, h } = sizeRef.current;
    const sx = w / LOGICAL;
    return { sx, sy: uniform ? sx : h / LOGICAL };
  };

  const renderAll = () => {
    const c = canvasRef.current;
    const { w, h } = sizeRef.current;
    if (!c || w === 0) return;
    let off = offRef.current;
    if (!off) off = offRef.current = document.createElement('canvas');
    off.width = Math.round(w * dpr);
    off.height = Math.round(h * dpr);
    const octx = off.getContext('2d')!;
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dimExcept = activeRef.current && dimRef.current ? layerRef.current : null;
    const { sx, sy } = scales();
    paint(octx, strokesRef.current, sx, sy, hiddenRef.current, dimExcept);
    renderLive();
  };

  const renderLive = () => {
    const c = canvasRef.current;
    const off = offRef.current;
    if (!c || !off) return;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(off, 0, 0);
    const d = drawing.current;
    const st = stateRef.current;
    if (d && st.tool === 'pen' && d.points.length > 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const { sx, sy } = scales();
      paintLive(ctx, d.points, st.color, st.size, d.pen, sx, sy);
    }
  };

  // サイズ追従
  useEffect(() => {
    const el = containerRef.current;
    const c = canvasRef.current;
    if (!el || !c) return;
    const apply = () => {
      const r = el.getBoundingClientRect();
      sizeRef.current = { w: r.width, h: r.height };
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      renderAll();
    };
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    apply();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, dpr]);

  // ストロークやレイヤー表示の変更時に再描画
  useEffect(() => {
    renderAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, active, activeLayer, hiddenLayers, dimOthers]);

  // ペン先のカーソル(太さと同じ直径の円)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!active) {
      el.style.cursor = '';
      return;
    }
    const { sx } = scales();
    el.style.cursor = state.tool === 'eraser' ? circleCursor(28, true) : circleCursor(state.size * (sx || 1));
    return () => {
      el.style.cursor = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, state.tool, state.size, containerRef]);

  // ポインタ入力の横取り
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const toLogical = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const { sx, sy } = scales();
      return [(e.clientX - r.left) / sx, (e.clientY - r.top) / sy, pressureOf(e)];
    };

    const eraseAt = (x: number, y: number) => {
      const { sx, sy } = scales();
      const rx = 14 / sx;
      const ry = 14 / sy;
      // 消しゴムは選択中のレイヤーの線だけに効く
      const remain = strokesRef.current.filter(
        (s) => layerOf(s) !== layerRef.current || !s.points.some((p) => Math.abs(p[0] - x) < rx && Math.abs(p[1] - y) < ry),
      );
      if (remain.length !== strokesRef.current.length) onChangeRef.current(remain);
    };

    const onDown = (e: PointerEvent) => {
      if (!activeRef.current) return; // 手書きモード外では何もしない
      logPointer('month', e);
      e.preventDefault();
      e.stopPropagation();
      if (!isPrimaryButton(e)) return;
      if (e.pointerType === 'pen') penSeen.current = true;
      const st = stateRef.current;
      // 2 本目の指が触れたらスクロール操作とみなし、指で描きかけの線は捨てる
      if (e.pointerType === 'touch' && drawing.current && !drawing.current.pen) {
        drawing.current = null;
        renderLive();
        return;
      }
      // パームリジェクション: ペンを検出済み(または「ペンのみ」)なら指は無視
      if (e.pointerType === 'touch' && (st.penOnly || penSeen.current)) return;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* iOS ではタッチ・ペンは暗黙にキャプチャされるため失敗しても続行 */
      }
      const p = toLogical(e);
      if (st.tool === 'eraser') {
        drawing.current = { pointerId: e.pointerId, pen: false, points: [] };
        eraseAt(p[0], p[1]);
        return;
      }
      drawing.current = { pointerId: e.pointerId, pen: e.pointerType === 'pen', points: [p] };
      renderLive();
    };

    const onMove = (e: PointerEvent) => {
      const d = drawing.current;
      if (!d || d.pointerId !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      const evs = (e as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] }).getCoalescedEvents?.() ?? [e];
      if (stateRef.current.tool === 'eraser') {
        for (const ev of evs) {
          const p = toLogical(ev);
          eraseAt(p[0], p[1]);
        }
        return;
      }
      for (const ev of evs) d.points.push(toLogical(ev));
      renderLive();
    };

    const onUp = (e: PointerEvent) => {
      const d = drawing.current;
      if (!d || d.pointerId !== e.pointerId) return;
      logPointer('month', e);
      e.stopPropagation();
      drawing.current = null;
      justDrew.current = true;
      window.setTimeout(() => (justDrew.current = false), 400);
      const st = stateRef.current;
      if (st.tool === 'pen' && d.points.length > 0) {
        onChangeRef.current([
          ...strokesRef.current,
          { points: d.points, color: st.color, size: st.size, pen: d.pen, layer: layerRef.current },
        ]);
        if (uniform && nearBottomRef.current) {
          const { sy } = scales();
          const bottom = sizeRef.current.h / sy;
          const maxY = Math.max(...d.points.map((p) => p[1]));
          if (maxY > bottom - 80) nearBottomRef.current();
        }
      } else {
        renderLive();
      }
    };

    const swallowClick = (e: MouseEvent) => {
      // 手書きモード中は日付や予定のクリックを一切通さない
      if (activeRef.current || justDrew.current || drawing.current) {
        e.stopPropagation();
        e.preventDefault();
      }
    };

    // 手書き中は描画面のスクロールを止める(2 本指なら月表示全体をスクロール)
    const unblock = blockTouchGestures(
      el,
      () => activeRef.current,
      () => el.closest<HTMLElement>('.month-slide'),
    );
    el.addEventListener('pointerdown', onDown, { capture: true });
    el.addEventListener('pointermove', onMove, { capture: true });
    el.addEventListener('pointerup', onUp, { capture: true });
    el.addEventListener('pointercancel', onUp, { capture: true });
    el.addEventListener('click', swallowClick, { capture: true });
    el.addEventListener('dblclick', swallowClick, { capture: true });
    return () => {
      unblock();
      el.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('pointermove', onMove, { capture: true });
      el.removeEventListener('pointerup', onUp, { capture: true });
      el.removeEventListener('pointercancel', onUp, { capture: true });
      el.removeEventListener('click', swallowClick, { capture: true });
      el.removeEventListener('dblclick', swallowClick, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, uniform]);

  return <canvas ref={canvasRef} className="month-ink" aria-hidden="true" />;
}
