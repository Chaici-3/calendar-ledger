import { useEffect, useState } from 'react';

function centsToInput(cents) {
  return (cents / 100).toFixed(2);
}

// "12.5" -> 1250，按字符串拆分，避免浮点误差
function parseYuanToCents(raw, label) {
  const text = raw.trim();
  if (text === '') return { value: 0 };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return { error: `${label}格式无效，请输入不小于 0 的最多两位小数的数字` };
  }

  const [intPart, decPart = ''] = text.split('.');
  return { value: Number(intPart) * 100 + Number(decPart.padEnd(2, '0')) };
}

export default function SettingsModal({ onClose, onSaved }) {
  const [dailyMaxBudget, setDailyMaxBudget] = useState('');
  const [hobbyMonthlyBudget, setHobbyMonthlyBudget] = useState('');
  const [accountingStartDate, setAccountingStartDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then((res) =>
        res.json().then((data) => {
          if (!res.ok) throw new Error(data.error ?? '设置加载失败');
          return data.settings;
        })
      )
      .then((settings) => {
        setDailyMaxBudget(centsToInput(settings.dailyMaxBudget));
        setHobbyMonthlyBudget(centsToInput(settings.hobbyMonthlyBudget));
        setAccountingStartDate(settings.accountingStartDate ?? '');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleSave(event) {
    event.preventDefault();

    const budget = parseYuanToCents(dailyMaxBudget, '每日最大可支配开销');
    if (budget.error) return setError(budget.error);

    const hobbyBudget = parseYuanToCents(hobbyMonthlyBudget, '每月兴趣消费预算');
    if (hobbyBudget.error) return setError(hobbyBudget.error);

    setError('');
    setSaving(true);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dailyMaxBudget: budget.value,
          hobbyMonthlyBudget: hobbyBudget.value,
          accountingStartDate: accountingStartDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '保存失败');

      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="calendar-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="calendar-modal settings-modal">
        <div className="calendar-header">
          <span className="calendar-title">设置</span>
          <button type="button" className="calendar-close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>

        <form className="settings-form" onSubmit={handleSave}>
          <div className="field">
            <label htmlFor="daily-max-budget">每日最大可支配开销（元）</label>
            <input
              id="daily-max-budget"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={dailyMaxBudget}
              disabled={loading}
              onChange={(event) => setDailyMaxBudget(event.target.value)}
            />
            <span className="field-note">每天固定可用额度，未花完可结转填补超支</span>
          </div>

          <div className="field">
            <label htmlFor="hobby-monthly-budget">每月兴趣消费预算（元）</label>
            <input
              id="hobby-monthly-budget"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={hobbyMonthlyBudget}
              disabled={loading}
              onChange={(event) => setHobbyMonthlyBudget(event.target.value)}
            />
            <span className="field-note">
              只统计带「爱好」标签的支出，按自然月重置；0 表示未设置
            </span>
          </div>

          <div className="field">
            <label htmlFor="accounting-start-date">记账基准日</label>
            <input
              id="accounting-start-date"
              type="date"
              value={accountingStartDate}
              disabled={loading}
              onChange={(event) => setAccountingStartDate(event.target.value)}
            />
            <span className="field-note">
              此日期之前的记录只计入总余额，不参与超支与结转；清空则从今天重新开始
            </span>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="settings-actions">
            <button type="button" className="plain" onClick={onClose}>
              取消
            </button>
            <button type="submit" disabled={loading || saving}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
