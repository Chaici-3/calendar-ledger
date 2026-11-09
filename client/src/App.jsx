import { useEffect, useState } from 'react';
import AssistantDrawer from './components/AssistantDrawer.jsx';
import CalendarModal from './components/CalendarModal.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import SummaryBar from './components/SummaryBar.jsx';
import Timeline from './components/Timeline.jsx';
import { addDays, todayLocal, weekdayLabel } from './date.js';

function chipNames(tags, selected) {
  const names = tags.map((tag) => tag.name);
  for (const name of selected) {
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

export default function App() {
  const [selectedDate, setSelectedDate] = useState(todayLocal);
  const [amount, setAmount] = useState('');
  const [records, setRecords] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [customTag, setCustomTag] = useState('');
  const [draftTags, setDraftTags] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [draftAmount, setDraftAmount] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [rowBusyId, setRowBusyId] = useState(null);
  const [rowError, setRowError] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [steps, setSteps] = useState({ up: 1, down: 1 });
  const [stepEditor, setStepEditor] = useState(null);
  const [stepValue, setStepValue] = useState('');
  const [stepError, setStepError] = useState('');
  const [summary, setSummary] = useState(null);
  const [newType, setNewType] = useState('expense');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [hobbyWarning, setHobbyWarning] = useState('');

  const today = todayLocal();
  const totalCents = records.reduce((sum, record) => sum + record.amountCents, 0);
  const createChips = chipNames(availableTags, selectedTags);
  const editChips = chipNames(availableTags, draftTags);

  async function loadRecords(date) {
    const res = await fetch(`/api/records?date=${encodeURIComponent(date)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '加载失败');
    setRecords(data.records);
  }

  async function loadTags() {
    const res = await fetch('/api/tags');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '标签加载失败');
    setAvailableTags(data.tags);
  }

  async function loadSummary() {
    const res = await fetch('/api/summary');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '大盘加载失败');
    setSummary(data);
  }

  useEffect(() => {
    loadRecords(selectedDate).catch((err) => setError(err.message));
  }, [selectedDate]);

  useEffect(() => {
    loadSummary().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    loadTags().catch((err) => setError(err.message));
  }, []);

  function toggleTag(name, list, setList) {
    setList(list.includes(name) ? list.filter((tag) => tag !== name) : [...list, name]);
  }

  function addCustomTag(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();

    const name = customTag.trim();
    if (!name) return;
    if (!selectedTags.includes(name)) setSelectedTags([...selectedTags, name]);
    setCustomTag('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, date: selectedDate, type: newType, tags: selectedTags }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '保存失败');

      setAmount('');
      setSelectedTags([]);
      setHobbyWarning(data.warning ?? '');
      await Promise.all([loadRecords(selectedDate), loadTags(), loadSummary()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(record) {
    setEditingId(record.id);
    setDraftAmount((record.amountCents / 100).toFixed(2));
    setDraftNote(record.note ?? '');
    setDraftTags(record.tags);
    setRowError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftTags([]);
    setRowError('');
  }

  async function saveEdit(record) {
    setRowBusyId(record.id);
    setRowError('');

    try {
      const res = await fetch(`/api/records/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: draftAmount,
          note: draftNote.trim() || null,
          tags: draftTags,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '保存失败');

      setEditingId(null);
      setDraftTags([]);
      setHobbyWarning(data.warning ?? '');
      await Promise.all([loadRecords(selectedDate), loadSummary()]);
    } catch (err) {
      setRowError(err.message);
    } finally {
      setRowBusyId(null);
    }
  }

  async function deleteRecord(record) {
    if (!window.confirm('确定删除这条记录？')) return;

    setRowBusyId(record.id);
    setError('');

    try {
      const res = await fetch(`/api/records/${record.id}`, { method: 'DELETE' });
      const data = res.status === 204 ? null : await res.json();
      if (!res.ok) throw new Error(data?.error ?? '删除失败');

      await Promise.all([loadRecords(selectedDate), loadSummary()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setRowBusyId(null);
    }
  }

  function go(delta) {
    setStepEditor(null);
    setStepError('');
    setSelectedDate((prev) => addDays(prev, delta));
  }

  function openStepEditor(direction, event) {
    event.preventDefault();
    setStepEditor(direction);
    setStepValue(String(steps[direction]));
    setStepError('');
  }

  function confirmStep() {
    const value = Number(stepValue);
    if (!Number.isInteger(value) || value < 2) {
      setStepError('请输入大于 1 的整数');
      return;
    }

    setSteps((prev) => ({ ...prev, [stepEditor]: value }));
    setStepEditor(null);
    setStepError('');
  }

  function closeStepEditor() {
    setStepEditor(null);
    setStepError('');
  }

  return (
    <main className="page">
      <h1>记账本 v0.5</h1>

      {hobbyWarning && (
        <div className="warning-banner" role="alert">
          <span>{hobbyWarning}</span>
          <button type="button" onClick={() => setHobbyWarning('')}>
            知道了
          </button>
        </div>
      )}

      <div className="layout">
        <Timeline
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          overBudgetDates={summary?.overBudgetDates ?? []}
        />

        <section className="ledger">
          <SummaryBar
            summary={summary}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenAssistant={() => setAssistantOpen(true)}
          />

          <div className="toolbar">
            <button type="button" className="date-trigger" onClick={() => setCalendarOpen(true)}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
              <span>{selectedDate}</span>
            </button>
            <span className="total">
              {selectedDate === today ? '今日合计' : '当日合计'} ¥{(totalCents / 100).toFixed(2)}
            </span>
          </div>

          <div className="pager">
            <div className="pager-side">
              <button
                type="button"
                className="pager-arrow"
                aria-label="前一天"
                onClick={() => go(-steps.up)}
                onContextMenu={(event) => openStepEditor('up', event)}
              >
                {steps.up > 1 ? '▲▲' : '▲'}
              </button>
              {steps.up > 1 && <span className="step-badge">×{steps.up}</span>}
            </div>

            <span className="pager-date">
              {selectedDate} {weekdayLabel(selectedDate)}
            </span>

            <div className="pager-side">
              <button
                type="button"
                className="pager-arrow"
                aria-label="后一天"
                onClick={() => go(steps.down)}
                onContextMenu={(event) => openStepEditor('down', event)}
              >
                {steps.down > 1 ? '▼▼' : '▼'}
              </button>
              {steps.down > 1 && <span className="step-badge">×{steps.down}</span>}
            </div>

            {stepEditor && (
              <div className={`step-popover ${stepEditor}`}>
                <div className="step-row">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    value={stepValue}
                    onChange={(event) => setStepValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') confirmStep();
                      if (event.key === 'Escape') closeStepEditor();
                    }}
                  />
                  <button type="button" onClick={confirmStep}>
                    确定
                  </button>
                  <button type="button" className="plain" onClick={closeStepEditor}>
                    取消
                  </button>
                </div>
                {stepError && <p className="step-error">{stepError}</p>}
              </div>
            )}
          </div>

          <div className="type-toggle" role="group" aria-label="收支类型">
            <button
              type="button"
              className={`type-btn${newType === 'expense' ? ' active expense' : ''}`}
              onClick={() => setNewType('expense')}
            >
              支出
            </button>
            <button
              type="button"
              className={`type-btn${newType === 'income' ? ' active income' : ''}`}
              onClick={() => setNewType('income')}
            >
              收入
            </button>
          </div>

          <form className="form" onSubmit={handleSubmit}>
        <input
          type="text"
          inputMode="decimal"
          placeholder="金额（元）"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button type="submit" disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
      </form>

      <div className="chips">
        {createChips.map((name) => (
          <button
            key={name}
            type="button"
            className={`chip${selectedTags.includes(name) ? ' active' : ''}`}
            onClick={() => toggleTag(name, selectedTags, setSelectedTags)}
          >
            {name}
          </button>
        ))}
        <input
          type="text"
          className="custom-tag"
          placeholder="自定义标签，回车添加"
          value={customTag}
          onChange={(e) => setCustomTag(e.target.value)}
          onKeyDown={addCustomTag}
        />
      </div>

      {error && <p className="error">{error}</p>}

      {records.length === 0 ? (
        <p className="empty">这一天还没有记录</p>
      ) : (
        <ul className="list">
          {records.map((record) => (
            <li key={record.id}>
              {editingId === record.id ? (
                <>
                  <div className="row-edit">
                    <div className="row-edit-fields">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="edit-amount"
                        value={draftAmount}
                        onChange={(e) => setDraftAmount(e.target.value)}
                      />
                      <input
                        type="text"
                        className="edit-note"
                        placeholder="备注（可选）"
                        value={draftNote}
                        onChange={(e) => setDraftNote(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={rowBusyId === record.id}
                        onClick={() => saveEdit(record)}
                      >
                        {rowBusyId === record.id ? '保存中…' : '保存'}
                      </button>
                      <button type="button" className="plain" onClick={cancelEdit}>
                        取消
                      </button>
                    </div>
                    <div className="chips">
                      {editChips.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className={`chip${draftTags.includes(name) ? ' active' : ''}`}
                          onClick={() => toggleTag(name, draftTags, setDraftTags)}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                  {rowError && <p className="row-error">{rowError}</p>}
                </>
              ) : (
                <>
                  <span className={`amount${record.type === 'income' ? ' income' : ''}`}>
                    {record.type === 'income' ? '+' : ''}¥
                    {(record.amountCents / 100).toFixed(2)}
                  </span>
                  {record.note && <span className="note">{record.note}</span>}
                  {record.tags.length > 0 && (
                    <span className="record-tags">
                      {record.tags.map((name) => (
                        <span className="tag-chip" key={name}>
                          {name}
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="time">{record.createdAt.slice(11, 16)}</span>
                  <span className="actions">
                    <button type="button" onClick={() => startEdit(record)}>
                      编辑
                    </button>
                    <button
                      type="button"
                      className="danger"
                      disabled={rowBusyId === record.id}
                      onClick={() => deleteRecord(record)}
                    >
                      删除
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
        </section>
      </div>

      {calendarOpen && (
        <CalendarModal
          selectedDate={selectedDate}
          onSelect={(date) => {
            setSelectedDate(date);
            setCalendarOpen(false);
          }}
          onClose={() => setCalendarOpen(false)}
          overBudgetDates={summary?.overBudgetDates ?? []}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false);
            loadSummary().catch((err) => setError(err.message));
          }}
        />
      )}

      {assistantOpen && (
        <AssistantDrawer
          onClose={() => setAssistantOpen(false)}
          onPurchased={() => {
            loadRecords(selectedDate).catch((err) => setError(err.message));
            loadSummary().catch((err) => setError(err.message));
          }}
        />
      )}
    </main>
  );
}
