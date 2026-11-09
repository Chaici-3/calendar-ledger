// "12.5" -> 1250，按字符串拆分，避免浮点误差
export function parseAmountToCents(raw) {
  if (raw === null || raw === undefined || typeof raw === 'boolean' || typeof raw === 'object') {
    return null;
  }

  const text = String(raw).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;

  const [intPart, decPart = ''] = text.split('.');
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, '0'));
  return cents > 0 ? cents : null;
}
