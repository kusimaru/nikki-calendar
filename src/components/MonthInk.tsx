// 月表示のグリッドに重ねる手書きレイヤー
import { useEffect, useRef, type RefObject } from 'react';
import type { Stroke } from '../lib/diary.ts';
import { outlinePath, type InkState } from '../lib/ink.ts';

const LOGICAL = 1000;

interface Props {
  /** 描画対象のグリッド要素(この要素のポインタ入力を横取りする) */
  containerRef: RefObject<HTMLDivElement | null>;
  strokes: Stroke[];
  state: InkState;
  /** 手書きモード(すべての入力で描く) */
  active: boolean;
  /** モード外でもペン入力なら描く */
  penAlways: boolean;
  onChange(strokes: Stroke[]): void;
}

function paint(ctx: CanvasRenderingContext2D, strokes: Stroke[], sx: number, sy: number) {
  for (const s of strokes) {
    ctx.fillStyle = s.color;
    const pts = s.points.map((p) => [p[0] * sx, p[1] * sy, p[2]]);
    ctx.fill(outlinePath(pts, s.size * sx, s.pen));
  }
}

export default function MonthInk({ containerRef, strokes, state, active, penAlways, onChange }: Props) {
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
  const penAlwaysRef = useRef(penAlways);
  const onChangeRef = useRef(onChange);
  strokesRef.current = strokes;
  stateRef.current = state;
  activeRef.current = active;
  penAlwaysRef.current = penAlways;
  onChangeRef.current = onChange;

  const dpr = window.devicePixelRatio || 1;

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
    paint(octx, strokesRef.current, w / LOGICAL, h / LOGICAL);
    renderLive();
  };

  const renderLive = () => {
    const c = canvasRef.current;
    const off = offRef.current;
    const { w, h } = sizeRef.current;
    if (!c || !off) return;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(off, 0, 0);
    const d = drawing.current;
    const st = stateRef.current;
    if (d && st.tool === 'pen' && d.points.length > 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(ctx, [{ points: d.points, color: st.color, size: st.size, pen: d.pen }], w / LOGICAL, h / LOGICAL);
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

  // ストローク変更時に再描画
  useEffect(() => {
    renderAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes]);

  // ポインタ入力の横取り
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const toLogical = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * LOGICAL, ((e.clientY - r.top) / r.height) * LOGICAL, e.pressure];
    };

    const eraseAt = (x: number, y: number) => {
      const { w, h } = sizeRef.current;
      const rx = (14 / w) * LOGICAL;
      const ry = (14 / h) * LOGICAL;
      const remain = strokesRef.current.filter(
        (s) => !s.points.some((p) => Math.abs(p[0] - x) < rx && Math.abs(p[1] - y) < ry),
      );
      if (remain.length !== strokesRef.current.length) onChangeRef.current(remain);
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (e.pointerType === 'pen') penSeen.current = true;
      const st = stateRef.current;
      const draw = activeRef.current
        ? !(e.pointerType === 'touch' && (st.penOnly || penSeen.current))
        : penAlwaysRef.current && e.pointerType === 'pen';
      if (!draw) return;
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
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
      e.stopPropagation();
      drawing.current = null;
      justDrew.current = true;
      window.setTimeout(() => (justDrew.current = false), 400);
      const st = stateRef.current;
      if (st.tool === 'pen' && d.points.length > 0) {
        onChangeRef.current([...strokesRef.current, { points: d.points, color: st.color, size: st.size, pen: d.pen }]);
      } else {
        renderLive();
      }
    };

    const swallowClick = (e: MouseEvent) => {
      if (justDrew.current || drawing.current) {
        e.stopPropagation();
        e.preventDefault();
      }
    };

    el.addEventListener('pointerdown', onDown, { capture: true });
    el.addEventListener('pointermove', onMove, { capture: true });
    el.addEventListener('pointerup', onUp, { capture: true });
    el.addEventListener('pointercancel', onUp, { capture: true });
    el.addEventListener('click', swallowClick, { capture: true });
    el.addEventListener('dblclick', swallowClick, { capture: true });
    return () => {
      el.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('pointermove', onMove, { capture: true });
      el.removeEventListener('pointerup', onUp, { capture: true });
      el.removeEventListener('pointercancel', onUp, { capture: true });
      el.removeEventListener('click', swallowClick, { capture: true });
      el.removeEventListener('dblclick', swallowClick, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  return <canvas ref={canvasRef} className="month-ink" aria-hidden="true" />;
}
