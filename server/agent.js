import { llmConfig } from './env.js';

const MAX_HISTORY_MESSAGES = 12; // 最近 12 条（约 6 轮）
const MAX_MESSAGE_CHARS = 800; // 单条超长截断
const MAX_WISHLIST_ITEMS = 10; // 只注入待购、最多 10 条
const MAX_ITEM_NAME_CHARS = 50;

// 金额统一转「元」，让模型直接读到人类可理解的数字
function yuan(cents) {
  return (cents / 100).toFixed(2);
}

export function buildSystemPrompt() {
  return [
    '你是用户的私人理财助手「守财奴」。你的原则是「劝阻第一，规划第二」。',
    '1. 先共情，再用数据劝阻：结合给定的大盘（余额、今日结余、待填补超支、本月兴趣预算剩余）说明这笔钱的机会成本。',
    '2. 若用户仍然坚持，建议把它放进愿望单，并强调 3 天冷静期的作用（到第 3 天再决定）。',
    '3. 不要编造数据，不要输出 Markdown 表格，回答控制在 150 字以内。',
    '4. 若用户明确表达想买某物并给出了价格，你必须在 wishlistAction 里填写 add。',
    '5. 若只是闲聊或询问建议，wishlistAction 用 {"type":"none"}。',
    '只输出 JSON，不要代码块，格式二选一：',
    '{"reply":"给用户的话","wishlistAction":{"type":"none"}}',
    '{"reply":"给用户的话","wishlistAction":{"type":"add","itemName":"魔女服","amountYuan":140}}',
  ].join('\n');
}

export function buildDashboardContext(summary, wishlist, currentItem, today) {
  return JSON.stringify({
    today,
    balance: yuan(summary.currentBalance),
    dailyLimit: yuan(summary.dailyMaxBudget),
    todayBalance: yuan(summary.todayBalance),
    outstandingOverBudget: yuan(summary.outstandingOverBudget),
    hobby: {
      budget: yuan(summary.hobbyMonthlyBudget),
      spent: yuan(summary.hobbySpentThisMonth),
      remaining: yuan(summary.hobbyRemaining),
    },
    wishlist: wishlist.slice(0, MAX_WISHLIST_ITEMS).map((item) => ({
      id: item.id,
      name: item.itemName,
      price: yuan(item.amountCents),
      daysWaited: item.daysWaited,
      cooldownRemaining: item.cooldownRemaining,
      dailySaveNeeded: yuan(item.dailySaveNeeded),
    })),
    currentItem: currentItem
      ? { id: currentItem.id, name: currentItem.itemName, price: yuan(currentItem.amountCents) }
      : null,
  });
}

function truncate(text) {
  if (text.length <= MAX_MESSAGE_CHARS) return text;
  return `${text.slice(0, MAX_MESSAGE_CHARS)}…`;
}

// 历史按角色映射为 chat completions 的 user / assistant；超长与超量都在这里截断
export function buildMessages(history, userMessage, contextJson) {
  const recent = history.slice(-MAX_HISTORY_MESSAGES).map((message) => ({
    role: message.role === 'agent' ? 'assistant' : 'user',
    content: truncate(message.content),
  }));

  return [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'system', content: `当前数据（JSON）：${contextJson}` },
    ...recent,
    { role: 'user', content: truncate(userMessage) },
  ];
}

export async function callLlm(messages) {
  const response = await fetch(llmConfig.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llmConfig.apiKey}`,
    },
    body: JSON.stringify({ model: llmConfig.model, messages, temperature: 0.6 }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`模型服务返回 ${response.status}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

// 容忍模型夹带 ```json 或前后废话：优先整体解析，失败则取第一个 { ... } 片段
function extractPayload(raw) {
  const text = raw.trim();

  try {
    return JSON.parse(text);
  } catch {
    // 继续尝试提取片段
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  return null;
}

export function parseAgentReply(raw) {
  const payload = extractPayload(raw);
  if (!payload || typeof payload !== 'object') {
    return { reply: raw.trim(), action: { type: 'none' } };
  }

  const reply = typeof payload.reply === 'string' ? payload.reply.trim() : '';
  const wishlistAction = payload.wishlistAction ?? {};
  const action = { type: 'none' };

  if (wishlistAction.type === 'add') {
    const itemName = typeof wishlistAction.itemName === 'string' ? wishlistAction.itemName.trim() : '';
    const amountYuan = Number(wishlistAction.amountYuan);
    const amountCents = Math.round(amountYuan * 100);

    if (
      itemName &&
      itemName.length <= MAX_ITEM_NAME_CHARS &&
      Number.isFinite(amountYuan) &&
      Number.isInteger(amountCents) &&
      amountCents > 0
    ) {
      action.type = 'add';
      action.itemName = itemName;
      action.amountCents = amountCents;
    }
  }

  return { reply: reply || raw.trim(), action };
}
