import db from './db.js';
import { diffDaysBetween, monthBounds, parseDate, todayLocal } from './dates.js';
import { getSettings } from './settings.js';

const totalsStmt = db.prepare(
  'SELECT type, SUM(amount_cents) AS total FROM records GROUP BY type'
);
const earliestStmt = db.prepare('SELECT MIN(date) AS earliest FROM records');
// 一天多条记录合并成净流出：支出为正、收入为负；只查询计算区间内的日期
const dailyNetStmt = db.prepare(`
  SELECT date,
         SUM(CASE WHEN type = 'income' THEN -amount_cents ELSE amount_cents END) AS net_expense
  FROM records
  WHERE date >= ? AND date <= ?
  GROUP BY date
  ORDER BY date ASC
`);

// 爱好支出：一个 JOIN + 一次聚合，避免 N+1；收入与非「爱好」标签不计入
const hobbySpentStmt = db.prepare(`
  SELECT COALESCE(SUM(r.amount_cents), 0) AS total
  FROM records r
  JOIN record_tags rt ON rt.record_id = r.id
  JOIN tags t ON t.id = rt.tag_id
  WHERE t.name = '爱好'
    AND r.type = 'expense'
    AND r.date >= ? AND r.date <= ?
`);

export function getHobbySpent(startDate, endDate) {
  return hobbySpentStmt.get(startDate, endDate).total;
}

export function splitTotals(rows) {
  let income = 0;
  let expense = 0;

  for (const row of rows) {
    if (row.type === 'income') income = row.total;
    else if (row.type === 'expense') expense = row.total;
  }

  return { income, expense };
}

export function getBalance() {
  const settings = getSettings();
  const totals = splitTotals(totalsStmt.all());

  return {
    settings,
    totals,
    currentBalance: totals.income - totals.expense,
  };
}

const todayTotalsStmt = db.prepare(
  'SELECT type, SUM(amount_cents) AS total FROM records WHERE date = ? GROUP BY type'
);

// 大盘快照：summary 路由与 Agent 共用同一份口径，避免两处数字漂移
export function buildSummary(today = todayLocal()) {
  const { settings, totals, currentBalance } = getBalance();
  const todayTotals = splitTotals(todayTotalsStmt.all(today));
  const { start, end } = monthBounds(today);
  const hobbySpentThisMonth = getHobbySpent(start, end);
  const overBudget = computeOverBudget(
    {
      dailyMaxBudget: settings.dailyMaxBudget,
      accountingStartDate: settings.accountingStartDate,
    },
    today
  );

  return {
    totalIncome: totals.income,
    totalExpense: totals.expense,
    currentBalance,
    dailyMaxBudget: settings.dailyMaxBudget,
    todayIncome: todayTotals.income,
    todayExpense: todayTotals.expense,
    todayBalance: todayTotals.income - todayTotals.expense,
    hobbyMonthlyBudget: settings.hobbyMonthlyBudget,
    hobbySpentThisMonth,
    hobbyRemaining: settings.hobbyMonthlyBudget - hobbySpentThisMonth,
    outstandingOverBudget: overBudget.outstanding,
    overBudgetDates: overBudget.dates,
  };
}

// 单段空白日最多折算的额度天数，避免长期不记账「凭空印钱」
const MAX_EMPTY_DAYS = 30;

function emptyResult() {
  return { outstanding: 0, dates: [] };
}

/**
 * 按日期顺序遍历账本：
 * - 有效起点 = max(记账基准日, 账本最早记录日)，起点之前的记录只计入总余额，不参与超支与结转
 * - 起点当天没有记录时，从起点到首条记录前一天整段按每日额度折算结余（单段最多 30 天）
 * - 两条记录之间的空白日按「空白天数 × 每日额度」折算结余（单段最多 30 天），优先 FIFO 填补历史超支
 * - 最后一条记录日到今天之间「已结束」的空白日同样折算（单段最多 30 天）；今天尚未结束，预算不算已节省
 * - 填补后剩余的结余进入结转池，抵消后续新产生的超支
 */
export function computeOverBudget(
  { dailyMaxBudget, accountingStartDate } = {},
  today = todayLocal()
) {
  if (!Number.isInteger(dailyMaxBudget) || dailyMaxBudget <= 0) {
    return emptyResult();
  }

  const baseline = parseDate(accountingStartDate);
  if (baseline === null) return emptyResult();

  const earliest = earliestStmt.get().earliest;
  if (earliest === null) return emptyResult();

  // YYYY-MM-DD 固定长度格式，字符串比较即等价于日期比较
  const effectiveStart = baseline > earliest ? baseline : earliest;
  if (effectiveStart > today) return emptyResult();

  const rows = dailyNetStmt.all(effectiveStart, today);
  if (rows.length === 0) return emptyResult();

  const queue = [];
  let buffer = 0;

  function applySavings(amount) {
    let rest = amount;

    while (rest > 0 && queue.length > 0) {
      const head = queue[0];
      const used = Math.min(rest, head.amount);
      head.amount -= used;
      rest -= used;
      if (head.amount === 0) queue.shift();
    }

    buffer += rest;
  }

  function applyDeficit(date, amount) {
    let rest = amount;

    if (buffer > 0) {
      const used = Math.min(buffer, rest);
      buffer -= used;
      rest -= used;
    }

    if (rest > 0) queue.push({ date, amount: rest });
  }

  // 起点段：从 effectiveStart（含）到首条记录日前一天（含）的空白日
  const leadingEmptyDays = diffDaysBetween(effectiveStart, rows[0].date);
  if (leadingEmptyDays > 0) {
    applySavings(Math.min(leadingEmptyDays, MAX_EMPTY_DAYS) * dailyMaxBudget);
  }

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];

    // 中间空白日：先按时间顺序补结余，再算当天净开销
    if (i > 0) {
      const emptyDays = diffDaysBetween(rows[i - 1].date, row.date) - 1;
      if (emptyDays > 0) {
        applySavings(Math.min(emptyDays, MAX_EMPTY_DAYS) * dailyMaxBudget);
      }
    }

    if (row.net_expense > dailyMaxBudget) {
      applyDeficit(row.date, row.net_expense - dailyMaxBudget);
    } else {
      applySavings(dailyMaxBudget - row.net_expense);
    }
  }

  // 末尾空白日：最后一条记录日（不含）到今天（不含）之间已结束的空白日
  const tailEmptyDays = diffDaysBetween(rows[rows.length - 1].date, today) - 1;
  if (tailEmptyDays > 0) {
    applySavings(Math.min(tailEmptyDays, MAX_EMPTY_DAYS) * dailyMaxBudget);
  }

  return {
    outstanding: queue.reduce((sum, item) => sum + item.amount, 0),
    dates: queue.map((item) => item.date),
  };
}
