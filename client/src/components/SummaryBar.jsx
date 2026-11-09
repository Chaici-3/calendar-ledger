function formatYuan(cents) {
  return (Math.abs(cents) / 100).toFixed(2);
}

function signPrefix(cents, alwaysSign) {
  if (cents < 0) return '-';
  return alwaysSign ? '+' : '';
}

export default function SummaryBar({ summary, onOpenSettings, onOpenAssistant }) {
  const ready = summary !== null;
  const balance = summary?.currentBalance ?? 0;
  const todayBalance = summary?.todayBalance ?? 0;
  const dailyMaxBudget = summary?.dailyMaxBudget ?? 0;
  const outstanding = summary?.outstandingOverBudget ?? 0;
  const hobbyBudget = summary?.hobbyMonthlyBudget ?? 0;
  const hobbyRemaining = summary?.hobbyRemaining ?? 0;

  return (
    <div className="summary-bar">
      <div className="summary-item">
        <span className="summary-label">当前总余额</span>
        <span className={`summary-value${ready && balance < 0 ? ' negative' : ''}`}>
          {ready ? `${signPrefix(balance)}¥${formatYuan(balance)}` : '--'}
        </span>
      </div>

      <div className="summary-item">
        <span className="summary-label">每日固定额度</span>
        {!ready ? (
          <span className="summary-value">--</span>
        ) : dailyMaxBudget > 0 ? (
          <span className="summary-value">¥{formatYuan(dailyMaxBudget)}</span>
        ) : (
          <span className="summary-hint">
            未设置
            <button type="button" className="summary-link" onClick={onOpenSettings}>
              去设置
            </button>
          </span>
        )}
      </div>

      <div className="summary-item">
        <span className="summary-label">今日结余</span>
        <span
          className={`summary-value${
            ready && todayBalance > 0 ? ' positive' : ''
          }${ready && todayBalance < 0 ? ' negative' : ''}`}
        >
          {ready ? `${signPrefix(todayBalance, true)}¥${formatYuan(todayBalance)}` : '--'}
        </span>
      </div>

      <div className="summary-item">
        <span className="summary-label">本月兴趣预算剩余</span>
        {!ready ? (
          <span className="summary-value">--</span>
        ) : hobbyBudget > 0 ? (
          <span className={`summary-value${hobbyRemaining < 0 ? ' negative' : ''}`}>
            {hobbyRemaining < 0 ? '-' : ''}¥{formatYuan(hobbyRemaining)}
          </span>
        ) : (
          <span className="summary-hint">
            未设置
            <button type="button" className="summary-link" onClick={onOpenSettings}>
              去设置
            </button>
          </span>
        )}
      </div>

      {ready && outstanding > 0 && (
        <div className="summary-item summary-outstanding">
          <span className="summary-label">待填补超支</span>
          <span className="summary-value negative">¥{formatYuan(outstanding)}</span>
        </div>
      )}

      <div className="summary-actions">
        <button type="button" className="settings-btn" onClick={onOpenAssistant}>
          愿望单 / 理财助手
        </button>
        <button type="button" className="settings-btn" onClick={onOpenSettings}>
          设置
        </button>
      </div>
    </div>
  );
}
