// 月ボタンの帯(Google カレンダー iPad 版風)。前年〜翌年の月を横スクロールで並べる
import { useEffect, useRef } from 'react';

interface Props {
  year: number;
  month0: number;
  onChange(year: number, month0: number): void;
}

export default function MonthStrip({ year, month0, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // 選択中の月を帯の中央に寄せる(ページ全体は動かさない)
  useEffect(() => {
    const wrap = wrapRef.current;
    const chip = activeRef.current;
    if (!wrap || !chip) return;
    const left = chip.offsetLeft - (wrap.clientWidth - chip.offsetWidth) / 2;
    wrap.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [year, month0]);

  const now = new Date();
  const years = [year - 1, year, year + 1];
  return (
    <div ref={wrapRef} className="month-strip" role="tablist" aria-label="月の選択">
      {years.map((y) => (
        <div key={y} className="strip-year-group">
          <button type="button" className="strip-year" onClick={() => onChange(y, 0)} title={`${y}年1月へ`}>
            {y}
          </button>
          {Array.from({ length: 12 }, (_, m) => {
            const active = y === year && m === month0;
            const isToday = y === now.getFullYear() && m === now.getMonth();
            return (
              <button
                key={m}
                ref={active ? activeRef : undefined}
                type="button"
                role="tab"
                aria-selected={active}
                className={'strip-chip' + (active ? ' active' : '') + (isToday ? ' today' : '')}
                title={isToday ? '今月' : undefined}
                onClick={() => onChange(y, m)}
              >
                {m + 1}月
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
