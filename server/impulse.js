import db from './db.js';
import { diffDaysBetween, monthBounds, todayLocal } from './dates.js';

// 冷静期固定 3 天，由 created_at 推导，不额外存列
export const COOLDOWN_DAYS = 3;

const listStmt = db.prepare(`
  SELECT id, item_name, amount_cents, status, created_at,
         CAST(julianday(?) - julianday(date(created_at)) AS INTEGER) AS days_waited
  FROM impulse_records
  WHERE status = ?
  ORDER BY created_at ASC, id ASC
`);
const listAllStmt = db.prepare(`
  SELECT id, item_name, amount_cents, status, created_at,
         CAST(julianday(?) - julianday(date(created_at)) AS INTEGER) AS days_waited
  FROM impulse_records
  ORDER BY created_at ASC, id ASC
`);
const getStmt = db.prepare(`
  SELECT id, item_name, amount_cents, status, created_at,
         CAST(julianday(?) - julianday(date(created_at)) AS INTEGER) AS days_waited
  FROM impulse_records
  WHERE id = ?
`);
const insertStmt = db.prepare(
  'INSERT INTO impulse_records (item_name, amount_cents) VALUES (?, ?)'
);
const updateStatusStmt = db.prepare('UPDATE impulse_records SET status = ? WHERE id = ?');
const deleteStmt = db.prepare('DELETE FROM impulse_records WHERE id = ?');

// 「每天需要省下多少」：按本月剩余天数（含今天）均摊，向上取整到分
export function dailySaveNeeded(amountCents, today) {
  const { end } = monthBounds(today);
  const daysLeft = diffDaysBetween(today, end) + 1;
  return Math.ceil(amountCents / daysLeft);
}

function toImpulse(row, today) {
  const daysWaited = Math.max(0, row.days_waited ?? 0);

  return {
    id: row.id,
    itemName: row.item_name,
    amountCents: row.amount_cents,
    status: row.status,
    createdAt: row.created_at,
    daysWaited,
    cooldownRemaining: Math.max(0, COOLDOWN_DAYS - daysWaited),
    dailySaveNeeded: dailySaveNeeded(row.amount_cents, today),
  };
}

export function listImpulses(status = 'waiting', today = todayLocal()) {
  const rows = status === 'all' ? listAllStmt.all(today) : listStmt.all(today, status);
  return rows.map((row) => toImpulse(row, today));
}

export function getImpulse(id, today = todayLocal()) {
  const row = getStmt.get(today, id);
  return row ? toImpulse(row, today) : null;
}

export function createImpulse(itemName, amountCents) {
  const info = insertStmt.run(itemName, amountCents);
  return getImpulse(info.lastInsertRowid);
}

export function setImpulseStatus(id, status) {
  return updateStatusStmt.run(status, id).changes > 0;
}

export function deleteImpulse(id) {
  return deleteStmt.run(id).changes > 0;
}
