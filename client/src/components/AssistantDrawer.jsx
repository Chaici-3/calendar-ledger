import { useEffect, useRef, useState } from 'react';

function formatYuan(cents) {
  return (Math.abs(cents) / 100).toFixed(2);
}

async function readJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '请求失败');
  return data;
}

function cooldownText(item) {
  return item.daysWaited === 0 ? '今天是冷静期第 1 天' : `已冷静 ${item.daysWaited} 天`;
}

export default function AssistantDrawer({ onClose, onPurchased }) {
  const [items, setItems] = useState([]);
  const [configured, setConfigured] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const [listError, setListError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const messagesRef = useRef(null);

  async function loadItems() {
    const res = await fetch('/api/impulse?status=waiting');
    const data = await readJson(res);
    setItems(data.items);
  }

  async function loadMessages(impulseId) {
    const query = impulseId === null ? '' : `?impulseId=${impulseId}`;
    const res = await fetch(`/api/agent/messages${query}`);
    const data = await readJson(res);
    setMessages(data.messages);
  }

  useEffect(() => {
    Promise.all([
      loadItems().catch((err) => setListError(err.message)),
      fetch('/api/agent/status')
        .then(readJson)
        .then((data) => setConfigured(data.configured))
        .catch(() => setConfigured(false)),
      loadMessages(null).catch((err) => setChatError(err.message)),
    ]);
  }, []);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function selectItem(id) {
    setSelectedId(id);
    setChatError('');
    try {
      await loadMessages(id);
    } catch (err) {
      setChatError(err.message);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending || !configured) return;

    setSending(true);
    setChatError('');
    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, impulseId: selectedId ?? undefined }),
      });
      const data = await readJson(res);

      setInput('');
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: 'user', content: text },
        { id: `a-${Date.now()}`, role: 'agent', content: data.reply },
      ]);

      if (data.impulse) {
        await loadItems();
        setSelectedId(data.impulse.id);
      }
    } catch (err) {
      setChatError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function purchase(item) {
    if (item.cooldownRemaining > 0) {
      const ok = window.confirm(`冷静期还剩 ${item.cooldownRemaining} 天，确定现在就买？`);
      if (!ok) return;
    }

    setBusyId(item.id);
    setListError('');
    try {
      const res = await fetch(`/api/impulse/${item.id}/purchase`, { method: 'POST' });
      await readJson(res);
      await loadItems();
      if (selectedId === item.id) {
        setSelectedId(null);
        await loadMessages(null);
      }
      onPurchased();
    } catch (err) {
      setListError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function abandon(item) {
    setBusyId(item.id);
    setListError('');
    try {
      const res = await fetch(`/api/impulse/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'abandoned' }),
      });
      await readJson(res);
      await loadItems();
      if (selectedId === item.id) {
        setSelectedId(null);
        await loadMessages(null);
      }
    } catch (err) {
      setListError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(event) => event.stopPropagation()}>
        <header className="drawer-header">
          <span className="drawer-title">愿望单 / 理财助手</span>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <section className="wishlist">
          <div className="wishlist-head">
            <span className="wishlist-title">待买清单</span>
            <button
              type="button"
              className="wishlist-new"
              onClick={() => {
                setSelectedId(null);
                setChatError('');
                loadMessages(null).catch((err) => setChatError(err.message));
              }}
            >
              + 新对话
            </button>
          </div>

          {listError && <p className="drawer-error">{listError}</p>}

          {items.length === 0 ? (
            <p className="drawer-hint">还没有记录，和助手聊聊你想买的东西吧</p>
          ) : (
            <ul className="wishlist-list">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`wishlist-row${selectedId === item.id ? ' selected' : ''}`}
                  onClick={() => selectItem(item.id)}
                >
                  <div className="wishlist-main">
                    <span className="wishlist-name">{item.itemName}</span>
                    <span className="wishlist-price">¥{formatYuan(item.amountCents)}</span>
                  </div>
                  <div className="wishlist-meta">
                    <span>每天需省 ¥{formatYuan(item.dailySaveNeeded)}</span>
                    <span className="cooldown-badge">
                      {item.cooldownRemaining > 0
                        ? `${cooldownText(item)}，还需 ${item.cooldownRemaining} 天`
                        : '冷静期已满'}
                    </span>
                  </div>
                  <div className="wishlist-actions" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => purchase(item)}
                    >
                      买下
                    </button>
                    <button
                      type="button"
                      className="plain"
                      disabled={busyId === item.id}
                      onClick={() => abandon(item)}
                    >
                      放弃
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="chat">
          <div className="chat-messages" ref={messagesRef}>
            {messages.length === 0 && (
              <p className="drawer-hint">
                说说你想买什么、价格多少，助手会先帮你踩个刹车。
              </p>
            )}
            {messages.map((message) => (
              <div key={message.id} className={`bubble ${message.role === 'user' ? 'user' : 'agent'}`}>
                {message.content}
              </div>
            ))}
            {chatError && <p className="chat-error">{chatError}</p>}
          </div>

          {configured === false && (
            <p className="drawer-hint">
              请先配置 API Key（项目根目录 .env，参考 .env.example）
            </p>
          )}

          <div className="chat-input">
            <textarea
              rows={2}
              value={input}
              disabled={sending || configured === false}
              placeholder={configured === false ? '未配置 API Key，暂时无法对话' : '说说你想买什么…'}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <button type="button" disabled={sending || configured === false} onClick={send}>
              {sending ? '思考中…' : '发送'}
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}
