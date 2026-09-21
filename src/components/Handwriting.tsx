// 手書きキャンバス(日別パネル用。Apple Pencil / 液タブ / マウス / 指 対応)
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Stroke } from '../lib/diary.ts';
import { blockTouchGestures, cachedPath, defaultInkState, isPrimaryButton, logPointer, outlinePath, pressureOf, type InkState } from '../lib/ink.ts';
import InkToolbar from './InkToolbar.tsx';

export const LOGICAL_WIDTH = 1000;
const SIZES: [string, number][] = [
  ['細', 2],
  ['中', 3],
  ['太', 6],
];

interface Props {
  strokes: Stroke[];
  height: number;
  onChange(strokes: Stroke[]): void;
  onHeightChange(height: number): void;
}

function paintStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  for (const s of strokes) {
    ctx.fillStyle = s.color;
    ctx.fill(cachedPath(s, 1, 1));
  }
}

export default function Handwriting({ strokes, height, onChange, onHeightChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const committedRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(0);
  const [ink, setInk] = useState<InkState>(() => defaultInkState(SIZES[1][1]));
  const penSeen = useRef(false);
  const drawing = useRef<{ pointerId: number; pen: boolean; points: number[][] } | null>(null);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const scrollAfterGrow = useRef(false);

  const grow = (scroll: boolean) => {
    scrollAfterGrow.current = scroll;
    onHeightChange(height + 300);
  };

  // 用紙を伸ばしたら、伸びた部分が見えるようにスクロールする
  useEffect(() => {
    if (!scrollAfterGrow.current) return;
    scrollAfterGrow.current = false;
    wrapRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [height]);

  const scale = width > 0 ? width / LOGICAL_WIDTH : 1;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const renderCommitted = useCallback(() => {
    if (width === 0) return;
    let off = committedRef.current;
    if (!off) off = committedRef.current = document.createElement('canvas');
    off.width = Math.round(width * dpr);
    off.height = Math.round(height * scale * dpr);
    const ctx = off.getContext('2d')!;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.clearRect(0, 0, LOGICAL_WIDTH, height);
    paintStrokes(ctx, strokes);
  }, [strokes, width, height, scale, dpr]);

  const paint = useCallback(() => {
    const c = canvasRef.current;
    const off = committedRef.current;
    if (!c || !off) return;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(off, 0, 0);
    const d = drawing.current;
    if (d && ink.tool === 'pen' && d.points.length > 0) {
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      ctx.fillStyle = ink.color;
      ctx.fill(outlinePath(d.points, ink.size, d.pen));
    }
  }, [ink, scale, dpr]);

  // iPad Safari 向け: キャンバス上のタッチ既定動作を止める
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    // キャンバス上ではブラウザのスクロールを止める(2 本指ならパネルをスクロール)
    return blockTouchGestures(
      c,
      () => true,
      () => c.closest<HTMLElement>('.day-panel'),
    );
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || width === 0) return;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * scale * dpr);
    renderCommitted();
    paint();
  }, [width, height, scale, dpr, renderCommitted, paint]);

  const toLogical = (e: { clientX: number; clientY: number; pressure: number; pointerType: string }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [(e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale, pressureOf(e)];
  };

  const acceptsPointer = (e: ReactPointerEvent) => {
    if (e.pointerType === 'pen') penSeen.current = true;
    if (e.pointerType === 'touch' && (ink.penOnly || penSeen.current)) return false;
    return true;
  };

  const eraseAt = (x: number, y: number) => {
    const r = 14;
    const remain = strokesRef.current.filter((s) => !s.points.some((p) => Math.hypot(p[0] - x, p[1] - y) < r));
    if (remain.length !== strokesRef.current.length) onChange(remain);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    logPointer('day', e);
    if (!acceptsPointer(e) || !isPrimaryButton(e)) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* iOS では暗黙キャプチャ */
    }
    const p = toLogical(e);
    if (ink.tool === 'eraser') {
      drawing.current = { pointerId: e.pointerId, pen: false, points: [] };
      eraseAt(p[0], p[1]);
      return;
    }
    drawing.current = { pointerId: e.pointerId, pen: e.pointerType === 'pen', points: [p] };
    paint();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drawing.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const native = e.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
    const evs = native.getCoalescedEvents?.() ?? [native];
    if (ink.tool === 'eraser') {
      for (const ev of evs) {
        const p = toLogical(ev);
        eraseAt(p[0], p[1]);
      }
      return;
    }
    for (const ev of evs) d.points.push(toLogical(ev));
    paint();
  };

  const finish = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drawing.current;
    if (!d || d.pointerId !== e.pointerId) return;
    logPointer('day', e);
    drawing.current = null;
    if (ink.tool === 'pen' && d.points.length > 0) {
      onChange([...strokesRef.current, { points: d.points, color: ink.color, size: ink.size, pen: d.pen }]);
      // 下端近くまで書いたら自動で用紙を伸ばす
      const maxY = Math.max(...d.points.map((p) => p[1]));
      if (maxY > height - 80) grow(false);
    } else {
      paint();
    }
  };

  // iPad Safari はペンでもスクロール判定を行うため、キャンバス上では常にブラウザのジェスチャーを止める
  const touchAction = 'none';

  return (
    <div className="hw">
      <InkToolbar
        state={ink}
        sizes={SIZES}
        canUndo={strokes.length > 0}
        onChange={setInk}
        onUndo={() => onChange(strokes.slice(0, -1))}
        onClear={() => onChange([])}
        extra={
          <button type="button" className="btn-small" onClick={() => grow(true)} title="下に 1 段分伸ばします。下端近くまで書くと自動でも伸びます">
            用紙を伸ばす
          </button>
        }
      />
      <div ref={wrapRef} className="hw-wrap">
        <canvas
          ref={canvasRef}
          className={'hw-canvas' + (ink.tool === 'eraser' ? ' eraser' : '')}
          style={{ width: '100%', height: height * scale, touchAction }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finish}
          onPointerCancel={finish}
          onPointerLeave={finish}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
    </div>
  );
}
