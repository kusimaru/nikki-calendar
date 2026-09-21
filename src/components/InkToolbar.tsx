// 手書きツールバー(色・太さ・消しゴム・元に戻す・全消去・ペンのみ)
import type { ReactNode } from 'react';
import { INK_COLORS, PEN_ONLY_KEY, type InkState } from '../lib/ink.ts';

interface Props {
  state: InkState;
  sizes: [string, number][];
  canUndo: boolean;
  onChange(next: InkState): void;
  onUndo(): void;
  onClear(): void;
  extra?: ReactNode;
}

export default function InkToolbar({ state, sizes, canUndo, onChange, onUndo, onClear, extra }: Props) {
  return (
    <div className="hw-toolbar">
      <div className="hw-group">
        {INK_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={'hw-color' + (state.tool === 'pen' && state.color === c ? ' active' : '')}
            style={{ background: c }}
            aria-label={`色 ${c}`}
            onClick={() => onChange({ ...state, color: c, tool: 'pen' })}
          />
        ))}
      </div>
      <div className="hw-group">
        {sizes.map(([label, s]) => (
          <button
            key={s}
            type="button"
            className={'btn-small' + (state.tool === 'pen' && state.size === s ? ' active' : '')}
            onClick={() => onChange({ ...state, size: s, tool: 'pen' })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="hw-group">
        <button
          type="button"
          className={'btn-small' + (state.tool === 'eraser' ? ' active' : '')}
          onClick={() => onChange({ ...state, tool: 'eraser' })}
        >
          消しゴム
        </button>
        <button type="button" className="btn-small" disabled={!canUndo} onClick={onUndo}>
          元に戻す
        </button>
        <button
          type="button"
          className="btn-small"
          disabled={!canUndo}
          onClick={() => {
            if (confirm('手書きをすべて消しますか?')) onClear();
          }}
        >
          全消去
        </button>
      </div>
      <div className="hw-group">
        <label className="hw-check">
          <input
            type="checkbox"
            checked={state.penOnly}
            onChange={(e) => {
              localStorage.setItem(PEN_ONLY_KEY, e.target.checked ? '1' : '0');
              onChange({ ...state, penOnly: e.target.checked });
            }}
          />
          ペンのみ
        </label>
        {extra}
      </div>
    </div>
  );
}
