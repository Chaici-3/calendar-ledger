export function todayLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 两个 YYYY-MM-DD 相差的整天数（to - from），用 UTC 计算避免夏令时偏移
export function diffDaysBetween(from, to) {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
  const [toYear, toMonth, toDay] = to.split('-').map(Number);
  const fromUtc = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const toUtc = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.round((toUtc - fromUtc) / 86400000);
}

// 返回 dateStr 所在自然月的首末日（含），如 '2026-11-05' -> { start: '2026-11-01', end: '2026-11-30' }
export function monthBounds(dateStr) {
  const [year, month] = dateStr.split('-').map(Number);
  const start = `${dateStr.slice(0, 7)}-01`;
  // Date.UTC(year, month, 0) = 下月第 0 天 = 本月最后一天
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${dateStr.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

// 严格校验 YYYY-MM-DD，并确认是真实存在的日期（拒绝 2026-02-30）
export function parseDate(raw) {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

  const [year, month, day] = raw.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return raw;
}
