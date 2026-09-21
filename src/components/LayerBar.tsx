// 月表示の手書きレイヤー操作(選択・表示切替・追加・名前変更・削除)
import { INK_COLORS } from '../lib/ink.ts';
import { MAX_LAYERS, type InkLayer } from '../lib/layers.ts';

interface Props {
  layers: InkLayer[];
  activeId: string;
  hidden: Set<string>;
  dimOthers: boolean;
  /** レイヤーごとの線の本数(削除確認用) */
  strokeCounts: Map<string, number>;
  onSelect(id: string): void;
  onToggleVisible(id: string): void;
  onShowAll(): void;
  onAdd(name: string, color: string): void;
  onRename(id: string, name: string): void;
  onRecolor(id: string, color: string): void;
  onRemove(id: string): void;
  onDimChange(v: boolean): void;
}

export default function LayerBar(p: Props) {
  const active = p.layers.find((l) => l.id === p.activeId);

  const add = () => {
    const name = prompt('新しいレイヤーの名前', `レイヤー ${p.layers.length + 1}`);
    if (!name?.trim()) return;
    const color = INK_COLORS[p.layers.length % INK_COLORS.length];
    p.onAdd(name.trim(), color);
  };

  const rename = () => {
    if (!active) return;
    const name = prompt('レイヤーの名前', active.name);
    if (!name?.trim() || name.trim() === active.name) return;
    p.onRename(active.id, name.trim());
  };

  const remove = () => {
    if (!active || p.layers.length <= 1) return;
    const n = p.strokeCounts.get(active.id) ?? 0;
    const msg = n > 0 ? `レイヤー「${active.name}」を削除しますか?\nこの月に描いた ${n} 本の線も消えます(他の月の線も同様に消えます)。` : `レイヤー「${active.name}」を削除しますか?`;
    if (confirm(msg)) p.onRemove(active.id);
  };

  return (
    <div className="layer-bar">
      <span className="layer-label">レイヤー</span>
      <div className="layer-list">
        {p.layers.map((l) => {
          const isHidden = p.hidden.has(l.id);
          const isActive = l.id === p.activeId;
          return (
            <div key={l.id} className={'layer-chip' + (isActive ? ' active' : '') + (isHidden ? ' hidden' : '')}>
              <button
                type="button"
                className="layer-eye"
                title={isHidden ? '表示する' : '非表示にする'}
                aria-label={(isHidden ? '表示: ' : '非表示: ') + l.name}
                onClick={() => p.onToggleVisible(l.id)}
              >
                {isHidden ? '◌' : '●'}
              </button>
              <button
                type="button"
                className="layer-name"
                title="このレイヤーに描く"
                onClick={() => p.onSelect(l.id)}
              >
                <span className="layer-dot" style={{ background: l.color }} />
                {l.name}
              </button>
            </div>
          );
        })}
      </div>
      <div className="hw-group">
        <button type="button" className="btn-small" onClick={p.onShowAll} disabled={p.hidden.size === 0}>
          すべて表示
        </button>
        <button type="button" className="btn-small" onClick={add} disabled={p.layers.length >= MAX_LAYERS}>
          + 追加
        </button>
        <button type="button" className="btn-small" onClick={rename} disabled={!active}>
          名前変更
        </button>
        <select
          className="layer-color-select"
          title="このレイヤーの既定の色"
          value={active?.color ?? ''}
          onChange={(e) => active && p.onRecolor(active.id, e.target.value)}
          disabled={!active}
        >
          {INK_COLORS.map((c, i) => (
            <option key={c} value={c}>
              色 {i + 1}
            </option>
          ))}
          {active && !INK_COLORS.includes(active.color) && <option value={active.color}>現在の色</option>}
        </select>
        <button type="button" className="btn-small" onClick={remove} disabled={!active || p.layers.length <= 1}>
          削除
        </button>
        <label className="hw-check" title="描いている間、選択中以外のレイヤーを薄く表示する">
          <input type="checkbox" checked={p.dimOthers} onChange={(e) => p.onDimChange(e.target.checked)} />
          他を薄く
        </label>
      </div>
    </div>
  );
}
