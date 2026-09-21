// 横スワイプ判定(iPad Safari 対応)
// スクロールできる領域では、ブラウザが縦横を問わずスクロール操作として先に取ってしまい、
// ポインターイベントが打ち切られる。touchmove の最初の動きで横と判定したら preventDefault して防ぐ。
export interface SwipeOptions {
  /** 判定を有効にするか(手書きモード中は無効、など) */
  isEnabled?: () => boolean;
  /** この要素上で始まった動きは無視する */
  isExcluded?: (target: EventTarget | null) => boolean;
  /** 指に追従させる(dx はピクセル) */
  follow?: (dx: number) => void;
  /** 追従の解除 */
  reset?: () => void;
  /** 判定成立。left = 左へ払った(次へ) */
  onSwipe: (dir: 'left' | 'right') => void;
  /** 成立に必要な距離(px) */
  threshold?: number;
}

export function installSwipe(el: HTMLElement, opts: SwipeOptions): () => void {
  let start: { id: number; x: number; y: number } | null = null;
  let decided: 'swipe' | 'no' | null = null;
  const threshold = opts.threshold ?? 50;
  const findTouch = (list: TouchList, id: number) => {
    for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
    return null;
  };

  const onStart = (e: TouchEvent) => {
    if (opts.isEnabled && !opts.isEnabled()) return;
    if (e.touches.length !== 1 || opts.isExcluded?.(e.target)) {
      start = null;
      return;
    }
    const t = e.touches[0];
    start = { id: t.identifier, x: t.clientX, y: t.clientY };
    decided = null;
  };
  const onMove = (e: TouchEvent) => {
    if (!start) return;
    if (e.touches.length !== 1) {
      start = null;
      opts.reset?.();
      return;
    }
    const t = findTouch(e.touches, start.id);
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (decided === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      decided = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'swipe' : 'no';
    }
    if (decided !== 'swipe') return;
    if (e.cancelable) e.preventDefault();
    opts.follow?.(dx);
  };
  const onEnd = (e: TouchEvent) => {
    if (!start) return;
    const t = findTouch(e.changedTouches, start.id);
    const wasSwipe = decided === 'swipe';
    const dx = t ? t.clientX - start.x : 0;
    start = null;
    decided = null;
    opts.reset?.();
    if (!wasSwipe || e.type === 'touchcancel' || !t) return;
    if (dx <= -threshold) opts.onSwipe('left');
    else if (dx >= threshold) opts.onSwipe('right');
  };

  el.addEventListener('touchstart', onStart, { passive: true });
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
