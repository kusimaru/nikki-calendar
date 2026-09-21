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

/** perfect-freehand で輪郭を作り Path2D にする(points は既に描画座標系) */
export function outlinePath(points: number[][], size: number, pen: boolean): Path2D {
  const outline = getStroke(points, {
    size,
    thinning: 0.6,
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
