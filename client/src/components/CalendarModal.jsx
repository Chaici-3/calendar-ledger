import { useEffect, useMemo, useState } from 'react';
import { formatDate, monthLabel, todayLocal } from '../date.js';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

export default function CalendarModal({
  selectedDate,
  onSelect,
  onClose,
  overBudgetDates = [],
}) {
  const [selectedYear, selectedMonth] = selectedDate.split('-').map(Number);
  const [viewYear, setViewYear] = useState(selectedYear);
  const [viewMonth, setViewMonth] = useState(selectedMonth - 1);
  const today = todayLocal();
  const overBudgetSet = useMemo(() => new Set(overBudgetDates), [overBudgetDates]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function shiftMonth(delta) {
    const next = new Date(viewYear, viewMonth + delta, 1, 12);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  const first = new Date(viewYear, viewMonth, 1, 12);
  const leading = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(viewYear, viewMonth, index - leading + 1, 12);
    return {
      key: formatDate(date),
      day: date.getDate(),
      muted: date.getMonth() !== viewMonth,
    };
  });

  return (
    <div
      className="calendar-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="选择日期"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="calendar-modal">
        <div className="calendar-header">
          <button type="button" className="calendar-nav" onClick={() => shiftMonth(-1)} aria-label="上个月">
            ‹
          </button>
          <span className="calendar-title">{monthLabel(viewYear, viewMonth)}</span>
          <button type="button" className="calendar-nav" onClick={() => shiftMonth(1)} aria-label="下个月">
            ›
          </button>
          <button type="button" className="calendar-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="calendar-weekdays">
          {WEEKDAYS.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>

        <div className="calendar-grid">
          {cells.map((cell) => (
            <button
              key={cell.key}
              type="button"
              className={
                'calendar-cell' +
                (cell.muted ? ' muted' : '') +
                (cell.key === today ? ' today' : '') +
                (overBudgetSet.has(cell.key) ? ' over-budget' : '') +
                (cell.key === selectedDate ? ' selected' : '')
              }
              onClick={() => onSelect(cell.key)}
            >
              {cell.day}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
