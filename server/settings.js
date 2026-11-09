import db from './db.js';
import { parseDate, todayLocal } from './dates.js';

const ACCOUNTING_START_KEY = 'accounting_start_date';
const HOBBY_BUDGET_KEY = 'hobby_monthly_budget';

const selectStmt = db.prepare('SELECT key, value FROM settings');
const upsertStmt = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);
const deleteStmt = db.prepare('DELETE FROM settings WHERE key = ?');

// 废弃的旧配置：PUT 时顺手删除，读取时也完全忽略
const LEGACY_KEYS = [
  'initial_balance',
  'survival_start_date',
  'survival_end_date',
  'daily_min_budget',
];

function parseStoredCents(raw) {
  if (raw === undefined || raw === null || raw === '') return 0;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

// 默认值不落库，读取时合并，空库也能得到完整结构
export function getSettings() {
  const rows = selectStmt.all();
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  // 记账基准日缺失或非法时，把「首次开启功能的当天」固定下来，只写一次，避免起点漂移
  let accountingStartDate = parseDate(stored[ACCOUNTING_START_KEY]);
  if (accountingStartDate === null) {
    accountingStartDate = todayLocal();
    upsertStmt.run(ACCOUNTING_START_KEY, accountingStartDate);
  }

  return {
    dailyMaxBudget: parseStoredCents(stored.daily_max_budget),
    hobbyMonthlyBudget: parseStoredCents(stored[HOBBY_BUDGET_KEY]),
    accountingStartDate,
  };
}

function parseCents(raw, label) {
  if (raw === undefined || raw === null) return { value: 0 };
  if (!Number.isInteger(raw) || raw < 0) {
    return { error: `${label}必须是不小于 0 的整数（单位：分）` };
  }
  return { value: raw };
}

export function validateSettings(input) {
  const body = input ?? {};

  const budget = parseCents(body.dailyMaxBudget, '每日最大可支配开销');
  if (budget.error) return budget;

  const hobbyBudget = parseCents(body.hobbyMonthlyBudget, '每月兴趣消费预算');
  if (hobbyBudget.error) return hobbyBudget;

  // undefined 表示「保留原值」；null / '' 表示清空（读取时重新固定为当天）
  let accountingStartDate;
  if (body.accountingStartDate === undefined) {
    accountingStartDate = undefined;
  } else if (body.accountingStartDate === null || body.accountingStartDate === '') {
    accountingStartDate = null;
  } else {
    accountingStartDate = parseDate(body.accountingStartDate);
    if (accountingStartDate === null) {
      return { error: '记账基准日格式应为 YYYY-MM-DD' };
    }
  }

  return {
    settings: {
      dailyMaxBudget: budget.value,
      hobbyMonthlyBudget: hobbyBudget.value,
      accountingStartDate,
    },
  };
}

const writeTx = db.transaction((settings) => {
  upsertStmt.run('daily_max_budget', String(settings.dailyMaxBudget));
  upsertStmt.run(HOBBY_BUDGET_KEY, String(settings.hobbyMonthlyBudget));

  if (settings.accountingStartDate !== undefined) {
    if (settings.accountingStartDate === null) {
      deleteStmt.run(ACCOUNTING_START_KEY);
    } else {
      upsertStmt.run(ACCOUNTING_START_KEY, settings.accountingStartDate);
    }
  }

  for (const key of LEGACY_KEYS) deleteStmt.run(key);
});

export function saveSettings(settings) {
  writeTx(settings);
  return getSettings();
}
