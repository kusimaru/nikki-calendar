// 月表示の下のフリースペース(月ごとの自由手書き。幅 1000 の論理座標で高さは伸ばせる)
import { useEffect, useRef, useState } from 'react';
import type { Stroke } from '../lib/diary.ts';
import type { InkState } from '../lib/ink.ts';
import MonthInk, { LOGICAL } from './MonthInk.tsx';

interface Props {
  strokes: Stroke[];
  /** 論理高さ(幅 1000 基準) */
  height: number;
  state: InkState;
  active: boolean;
  activeLayer: string;
  hiddenLayers: Set<string>;
  dimOthers: boolean;
  onChange(strokes: Stroke[]): void;
  onGrow(): void;
  onSend(): void;
}

export default function FreeSpace(p: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const scale = width > 0 ? width / LOGICAL : 0;

  return (
    <section className="free-space">
      <div className="free-space-head">
        <h3>フリースペース</h3>
        <span className="muted small">{p.active ? 'ここにも自由に書けます' : '「✎ 手書き」を押すと書けます'}</span>
        <span className="spacer" />
        <button type="button" className="btn-small" onClick={p.onSend} title="この月の手書きを余白ノートの新しいページとして送ります">
          余白ノートへ送る
        </button>
        <button type="button" className="btn-small" onClick={p.onGrow} title="下に 1 段分伸ばします。下端近くまで書くと自動でも伸びます">
          用紙を伸ばす
        </button>
      </div>
      <div ref={wrapRef} className={'free-space-paper' + (p.active ? ' inking' : '')} style={{ height: p.height * scale }}>
        <MonthInk
          containerRef={wrapRef}
          uniform
          strokes={p.strokes}
          state={p.state}
          active={p.active}
          activeLayer={p.activeLayer}
          hiddenLayers={p.hiddenLayers}
          dimOthers={p.dimOthers}
          onChange={p.onChange}
          onNearBottom={p.onGrow}
        />
      </div>
    </section>
  );
}
