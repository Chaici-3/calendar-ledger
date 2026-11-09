import { Router } from 'express';
import db from '../db.js';
import { monthBounds, parseDate, todayLocal } from '../dates.js';
import { parseAmountToCents } from '../money.js';
import { getHobbySpent } from '../overview.js';
import { getSettings } from '../settings.js';

const router = Router();

const COLUMNS = 'id, amount_cents, note, is_hobby, date, type, created_at';

const listStmt = db.prepare(`SELECT ${COLUMNS} FROM records ORDER BY id DESC`);
const listByDateStmt = db.prepare(
  `SELECT ${COLUMNS} FROM records WHERE date = ? ORDER BY id DESC`
);
const getStmt = db.prepare(`SELECT ${COLUMNS} FROM records WHERE id = ?`);
const insertStmt = db.prepare(
  'INSERT INTO records (amount_cents, note, is_hobby, date, type) VALUES (?, ?, ?, ?, ?)'
);
const updateAmountStmt = db.prepare('UPDATE records SET amount_cents = ? WHERE id = ?');
const updateNoteStmt = db.prepare('UPDATE records SET note = ? WHERE id = ?');
const updateTypeStmt = db.prepare('UPDATE records SET type = ? WHERE id = ?');
const deleteStmt = db.prepare('DELETE FROM records WHERE id = ?');

const tagsByRecordStmt = db.prepare(`
  SELECT t.name
  FROM record_tags rt
  JOIN tags t ON t.id = rt.tag_id
  WHERE rt.record_id = ?
  ORDER BY t.id ASC
`);
const insertTagStmt = db.prepare(
  'INSERT INTO tags (name, is_preset) VALUES (?, 0) ON CONFLICT(name) DO NOTHING'
);
const selectTagIdStmt = db.prepare('SELECT id FROM tags WHERE name = ?');
const deleteRecordTagsStmt = db.prepare('DELETE FROM record_tags WHERE record_id = ?');
const insertRecordTagStmt = db.prepare(
  'INSERT OR IGNORE INTO record_tags (record_id, tag_id) VALUES (?, ?)'
);

function toRecord(row, tags = []) {
  return {
    id: row.id,
    amountCents: row.amount_cents,
    note: row.note,
    isHobby: Boolean(row.is_hobby),
    date: row.date,
    type: row.type,
    createdAt: row.created_at,
    tags,
  };
}

function tagNames(recordId) {
  return tagsByRecordStmt.all(recordId).map((row) => row.name);
}

// 记录 + 标签固定 2 条 SQL：一次批量取所有关联，避免按记录逐条查询（N+1）
function tagsForRecords(ids) {
  const grouped = new Map();
  if (ids.length === 0) return grouped;

  const placeholders = ids.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT rt.record_id AS recordId, t.name
       FROM record_tags rt
       JOIN tags t ON t.id = rt.tag_id
       WHERE rt.record_id IN (${placeholders})
       ORDER BY t.id ASC`
    )
    .all(...ids);

  for (const row of rows) {
    if (!grouped.has(row.recordId)) grouped.set(row.recordId, []);
    grouped.get(row.recordId).push(row.name);
  }
  return grouped;
}

function attachTags(rows) {
  const grouped = tagsForRecords(rows.map((row) => row.id));
  return rows.map((row) => toRecord(row, grouped.get(row.id) ?? []));
}

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseIsHobby(raw) {
  if (raw === undefined) return 0;
  if (raw === 0 || raw === 1 || raw === false || raw === true) return raw ? 1 : 0;
  return null;
}

function parseType(raw) {
  if (raw === 'expense' || raw === 'income') return raw;
  return null;
}

function normalizeTags(raw) {
  if (!Array.isArray(raw)) return { error: 'tags 必须是字符串数组' };

  const names = [];
  for (const item of raw) {
    if (typeof item !== 'string') return { error: 'tags 必须是字符串数组' };

    const name = item.trim();
    if (!name) continue;
    if (name.length > 20) return { error: '标签名不能超过 20 个字符' };
    if (!names.includes(name)) names.push(name);
  }

  if (names.length > 10) return { error: '单条记录最多 10 个标签' };
  return { names };
}

// 标签按名查/建（依赖 name 的唯一约束），再整体替换关联
function replaceRecordTags(recordId, names) {
  deleteRecordTagsStmt.run(recordId);

  for (const name of names) {
    insertTagStmt.run(name);
    const tag = selectTagIdStmt.get(name);
    insertRecordTagStmt.run(recordId, tag.id);
  }
}

const createRecordTx = db.transaction((amountCents, note, isHobby, date, type, names) => {
  const info = insertStmt.run(amountCents, note, isHobby, date, type);
  replaceRecordTags(info.lastInsertRowid, names);
  return info.lastInsertRowid;
});

const saveRecordTx = db.transaction((payload) => {
  if (payload.hasAmount) {
    updateAmountStmt.run(payload.amountCents, payload.id);
  }
  if (payload.hasNote) {
    updateNoteStmt.run(payload.note, payload.id);
  }
  if (payload.hasType) {
    updateTypeStmt.run(payload.type, payload.id);
  }
  if (payload.hasTags) {
    replaceRecordTags(payload.id, payload.names);
  }
});

// 仅在「本条是爱好支出」且该月已超预算时返回警告文案
function hobbyWarningFor(record, hobbyBudget) {
  if (hobbyBudget <= 0) return null;
  if (record.type !== 'expense' || !record.tags.includes('爱好')) return null;

  const { start, end } = monthBounds(record.date);
  const spent = getHobbySpent(start, end);
  return spent > hobbyBudget ? '本月兴趣消费已超额' : null;
}

// 保存后用最终落库状态判断，金额/标签/类型任意改动都能覆盖
function respondWithHobbyWarning(res, status, id) {
  const record = toRecord(getStmt.get(id), tagNames(id));
  const { hobbyMonthlyBudget } = getSettings();
  res.status(status).json({ ...record, warning: hobbyWarningFor(record, hobbyMonthlyBudget) });
}

router.get('/', (req, res) => {
  if (req.query.date === undefined) {
    return res.json({ records: attachTags(listStmt.all()) });
  }

  const date = parseDate(req.query.date);
  if (date === null) {
    return res.status(400).json({ error: 'date 格式应为 YYYY-MM-DD' });
  }

  res.json({ records: attachTags(listByDateStmt.all(date)) });
});

router.post('/', (req, res) => {
  const body = req.body ?? {};

  const amountCents = parseAmountToCents(body.amount);
  if (amountCents === null) {
    return res.status(400).json({ error: '金额格式无效，请输入大于 0 的最多两位小数的数字' });
  }

  const isHobby = parseIsHobby(body.isHobby);
  if (isHobby === null) {
    return res.status(400).json({ error: 'isHobby 只能是 0 或 1' });
  }

  const date = body.date === undefined ? todayLocal() : parseDate(body.date);
  if (date === null) {
    return res.status(400).json({ error: 'date 格式应为 YYYY-MM-DD' });
  }

  const type = body.type === undefined ? 'expense' : parseType(body.type);
  if (type === null) {
    return res.status(400).json({ error: "type 只能是 'expense' 或 'income'" });
  }

  let note = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string') {
      return res.status(400).json({ error: 'note 必须是字符串' });
    }
    note = body.note.trim() || null;
  }

  const tags = body.tags === undefined ? { names: [] } : normalizeTags(body.tags);
  if (tags.error) {
    return res.status(400).json({ error: tags.error });
  }

  const id = createRecordTx(amountCents, note, isHobby, date, type, tags.names);
  respondWithHobbyWarning(res, 201, id);
});

router.patch('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: 'id 无效' });
  }

  const body = req.body ?? {};
  const hasAmount = body.amount !== undefined;
  const hasNote = body.note !== undefined;
  const hasType = body.type !== undefined;
  const hasTags = body.tags !== undefined;

  if (!hasAmount && !hasNote && !hasType && !hasTags) {
    return res.status(400).json({ error: '没有需要更新的字段' });
  }

  let amountCents;
  if (hasAmount) {
    amountCents = parseAmountToCents(body.amount);
    if (amountCents === null) {
      return res.status(400).json({ error: '金额格式无效，请输入大于 0 的最多两位小数的数字' });
    }
  }

  let note;
  if (hasNote) {
    if (body.note !== null && typeof body.note !== 'string') {
      return res.status(400).json({ error: 'note 必须是字符串' });
    }
    note = typeof body.note === 'string' ? body.note.trim() || null : null;
  }

  const tags = hasTags ? normalizeTags(body.tags) : { names: [] };
  if (tags.error) {
    return res.status(400).json({ error: tags.error });
  }

  let type;
  if (hasType) {
    type = parseType(body.type);
    if (type === null) {
      return res.status(400).json({ error: "type 只能是 'expense' 或 'income'" });
    }
  }

  if (!getStmt.get(id)) {
    return res.status(404).json({ error: '记录不存在' });
  }

  saveRecordTx({
    id,
    hasAmount,
    amountCents,
    hasNote,
    note,
    hasType,
    type,
    hasTags,
    names: tags.names,
  });

  respondWithHobbyWarning(res, 200, id);
});

router.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: 'id 无效' });
  }

  const info = deleteStmt.run(id);
  if (info.changes === 0) {
    return res.status(404).json({ error: '记录不存在' });
  }

  res.status(204).end();
});

export default router;
