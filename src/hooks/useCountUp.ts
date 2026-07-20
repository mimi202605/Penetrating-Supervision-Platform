import { useEffect, useRef, useState } from "react";

/** 数字 count-up 动画：从上一次的值平滑过渡到目标值，避免每次都从 0 跳变 */
export function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = fromRef.current;
    if (from === target) return;
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (target - from) * eased;
      setValue(target >= 100 ? Math.round(next) : Math.round(next * 10) / 10);
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}
