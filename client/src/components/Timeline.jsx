import { useLayoutEffect, useMemo, useRef } from 'react';
import { addDays, todayLocal, weekdayLabel } from '../date.js';

const RANGE = 30;

export default function Timeline({ selectedDate, onSelect, overBudgetDates = [] }) {
  const containerRef = useRef(null);
  const activeRef = useRef(null);
  const today = todayLocal();

  const overBudgetSet = useMemo(() => new Set(overBudgetDates), [overBudgetDates]);

  const dates = useMemo(
    () => Array.from({ length: RANGE * 2 + 1 }, (_, index) => addDays(selectedDate, index - RANGE)),
    [selectedDate]
  );

  // 手动滚动容器，不用 scrollIntoView，避免连带滚动外层页面
  useLayoutEffect(() => {
    const container = containerRef.current;
    const active = activeRef.current;
    if (!container || !active) return;

    const centerActive = () => {
      const containerRect = container.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const offset =
        activeRect.top +
        activeRect.height / 2 -
        (containerRect.top + containerRect.height / 2);
      container.scrollTop += offset;
    };

    centerActive();
    // 字体/布局在首帧后仍可能微调，下一帧再校正一次
    const frame = requestAnimationFrame(centerActive);
    return () => cancelAnimationFrame(frame);
  }, [selectedDate]);

  return (
    <div className="timeline" ref={containerRef}>
      {dates.map((date) => (
        <button
          key={date}
          type="button"
          ref={date === selectedDate ? activeRef : null}
          className={
            'timeline-item' +
            (date === selectedDate ? ' active' : '') +
            (date === today ? ' is-today' : '') +
            (overBudgetSet.has(date) ? ' over-budget' : '')
          }
          onClick={() => onSelect(date)}
        >
          <span className="timeline-date">{date.slice(5)}</span>
          <span className="timeline-weekday">{weekdayLabel(date)}</span>
        </button>
      ))}
    </div>
  );
}
