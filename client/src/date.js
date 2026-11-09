export function todayLocal() {
  return formatDate(new Date());
}

export function toDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  // 用本地中午 12 点，避免夏令时/时区把日期算少一天
  return new Date(year, month - 1, day, 12);
}

export function formatDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function addDays(dateStr, delta) {
  const date = toDate(dateStr);
  date.setDate(date.getDate() + delta);
  return formatDate(date);
}

export function weekdayLabel(dateStr) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][toDate(dateStr).getDay()];
}

export function monthLabel(year, monthIndex) {
  return `${year} 年 ${monthIndex + 1} 月`;
}
