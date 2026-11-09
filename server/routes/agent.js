import { Router } from 'express';
import db from '../db.js';
import {
  buildDashboardContext,
  buildMessages,
  callLlm,
  parseAgentReply,
} from '../agent.js';
import { todayLocal } from '../dates.js';
import { isLlmConfigured } from '../env.js';
import { createImpulse, getImpulse, listImpulses } from '../impulse.js';
import { buildSummary } from '../overview.js';

const router = Router();

const MAX_HISTORY_IN_PROMPT = 12;
const MAX_MESSAGES_IN_LIST = 50;

const listByImpulseStmt = db.prepare(`
  SELECT id, impulse_id, role, content, created_at
  FROM impulse_messages
  WHERE impulse_id = ?
  ORDER BY id DESC
  LIMIT ?
`);
const listSoloStmt = db.prepare(`
  SELECT id, impulse_id, role, content, created_at
  FROM impulse_messages
  WHERE impulse_id IS NULL
  ORDER BY id DESC
  LIMIT ?
`);
const insertMessageStmt = db.prepare(
  'INSERT INTO impulse_messages (impulse_id, role, content) VALUES (?, ?, ?)'
);

function parseImpulseId(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function recentMessages(impulseId, limit) {
  const rows =
    impulseId === null
      ? listSoloStmt.all(limit)
      : listByImpulseStmt.all(impulseId, limit);

  return rows.reverse().map((row) => ({
    id: row.id,
    impulseId: row.impulse_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  }));
}

// 先建物品（若模型识别出想买的东西），再把本轮两句话一起落到同一个 impulse_id
const saveTurnTx = db.transaction((impulseId, itemName, amountCents, userMessage, reply) => {
  let targetId = impulseId;
  let impulse = null;

  if (itemName) {
    impulse = createImpulse(itemName, amountCents);
    targetId = impulse.id;
  }

  insertMessageStmt.run(targetId, 'user', userMessage);
  insertMessageStmt.run(targetId, 'agent', reply);

  return { impulse, impulseId: targetId };
});

router.get('/status', (req, res) => {
  res.json({ configured: isLlmConfigured });
});

router.get('/messages', (req, res) => {
  const raw = req.query.impulseId;
  const impulseId = parseImpulseId(raw);
  if (raw !== undefined && impulseId === null) {
    return res.status(400).json({ error: 'impulseId 无效' });
  }

  res.json({ messages: recentMessages(impulseId, MAX_MESSAGES_IN_LIST) });
});

router.post('/chat', async (req, res) => {
  if (!isLlmConfigured) {
    return res.status(503).json({
      error: '请先配置 API Key（在项目根目录 .env 设置 LLM_API_KEY 与 LLM_API_URL）',
    });
  }

  const body = req.body ?? {};
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return res.status(400).json({ error: '消息不能为空' });
  }

  const impulseId = parseImpulseId(body.impulseId);
  if (body.impulseId !== undefined && impulseId === null) {
    return res.status(400).json({ error: 'impulseId 无效' });
  }

  const today = todayLocal();
  const currentItem = impulseId === null ? null : getImpulse(impulseId, today);
  const contextJson = buildDashboardContext(buildSummary(today), listImpulses('waiting', today), currentItem, today);
  const messages = buildMessages(recentMessages(impulseId, MAX_HISTORY_IN_PROMPT), message, contextJson);

  let raw;
  try {
    raw = await callLlm(messages);
  } catch (error) {
    const reason = error?.name === 'TimeoutError' ? '请求超时' : error.message;
    return res.status(502).json({ error: `助手暂时不可用：${reason}` });
  }

  const { reply, action } = parseAgentReply(raw);
  const saved = saveTurnTx(
    impulseId,
    action.type === 'add' ? action.itemName : null,
    action.type === 'add' ? action.amountCents : 0,
    message,
    reply
  );

  res.json({
    reply,
    impulse: saved.impulse,
    impulseId: saved.impulseId,
    configured: true,
  });
});

export default router;
