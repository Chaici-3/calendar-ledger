import { Router } from 'express';
import db from '../db.js';
import { todayLocal } from '../dates.js';
import {
  createImpulse,
  deleteImpulse,
  getImpulse,
  listImpulses,
  setImpulseStatus,
} from '../impulse.js';
import { parseAmountToCents } from '../money.js';

const router = Router();

const ALLOWED_STATUS = ['waiting', 'purchased', 'abandoned'];

const insertRecordStmt = db.prepare(
  'INSERT INTO records (amount_cents, note, is_hobby, date, type) VALUES (?, ?, 0, ?, ?)'
);
const getRecordStmt = db.prepare(
  'SELECT id, amount_cents, note, is_hobby, date, type, created_at FROM records WHERE id = ?'
);

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseItemName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  return name && name.length <= 50 ? name : null;
}

// 买下：写一条支出账单并把愿望单标记为 purchased，两个动作必须同成同败
const purchaseTx = db.transaction((impulse, date) => {
  const info = insertRecordStmt.run(impulse.amountCents, impulse.itemName, date, 'expense');
  setImpulseStatus(impulse.id, 'purchased');
  return info.lastInsertRowid;
});

router.get('/', (req, res) => {
  const status = req.query.status ?? 'waiting';
  if (status !== 'all' && !ALLOWED_STATUS.includes(status)) {
    return res.status(400).json({ error: 'status 只能是 waiting / purchased / abandoned / all' });
  }

  res.json({ items: listImpulses(status) });
});

router.post('/', (req, res) => {
  const body = req.body ?? {};
  const itemName = parseItemName(body.itemName);
  if (itemName === null) {
    return res.status(400).json({ error: '物品名称不能为空且不超过 50 个字符' });
  }

  const amountCents = parseAmountToCents(body.amount);
  if (amountCents === null) {
    return res.status(400).json({ error: '金额格式无效，请输入大于 0 的最多两位小数的数字' });
  }

  res.status(201).json(createImpulse(itemName, amountCents));
});

router.patch('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'id 无效' });

  const status = req.body?.status;
  if (!ALLOWED_STATUS.includes(status)) {
    return res.status(400).json({ error: 'status 只能是 waiting / purchased / abandoned' });
  }

  if (!getImpulse(id)) return res.status(404).json({ error: '愿望单条目不存在' });

  setImpulseStatus(id, status);
  res.json(getImpulse(id));
});

router.post('/:id/purchase', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'id 无效' });

  const impulse = getImpulse(id);
  if (!impulse) return res.status(404).json({ error: '愿望单条目不存在' });
  if (impulse.status !== 'waiting') {
    return res.status(400).json({ error: '只有待购买的条目可以买下' });
  }

  const date = todayLocal();
  const recordId = purchaseTx(impulse, date);
  const row = getRecordStmt.get(recordId);

  res.status(201).json({
    item: getImpulse(id),
    record: {
      id: row.id,
      amountCents: row.amount_cents,
      note: row.note,
      isHobby: Boolean(row.is_hobby),
      date: row.date,
      type: row.type,
      createdAt: row.created_at,
      tags: [],
    },
  });
});

router.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'id 无效' });

  if (!deleteImpulse(id)) return res.status(404).json({ error: '愿望单条目不存在' });
  res.status(204).end();
});

export default router;
