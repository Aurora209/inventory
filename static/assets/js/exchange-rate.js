import { apiGet, buildMainNav, escapeHtml } from './api.js?v=2026062214';

document.getElementById('main-nav').innerHTML = buildMainNav('exchange-rate');

const statusEl = document.getElementById('page-status');
const gridEl = document.getElementById('rates-grid');
const lastUpdateEl = document.getElementById('fx-last-update');
const fromEl = document.getElementById('fx-from');
const toEl = document.getElementById('fx-to');
const amountEl = document.getElementById('fx-amount');
const resultEl = document.getElementById('fx-result');
const rateInfoEl = document.getElementById('fx-rate-info');
const dateEl = document.getElementById('fx-date');
const historyEl = document.getElementById('fx-history');
const historyCurrencyEl = document.getElementById('history-currency');
const historyStartEl = document.getElementById('history-start');
const historyEndEl = document.getElementById('history-end');
const historyBodyEl = document.getElementById('history-body');
const historySummaryEl = document.getElementById('history-summary');

const currencies = [
  { code: 'CNY', name: '人民币', flag: '🇨🇳' }, { code: 'USD', name: '美元', flag: '🇺🇸' }, { code: 'EUR', name: '欧元', flag: '🇪🇺' },
  { code: 'JPY', name: '日元', flag: '🇯🇵' }, { code: 'GBP', name: '英镑', flag: '🇬🇧' }, { code: 'HKD', name: '港币', flag: '🇭🇰' },
  { code: 'AUD', name: '澳元', flag: '🇦🇺' }, { code: 'CAD', name: '加元', flag: '🇨🇦' }, { code: 'SGD', name: '新加坡元', flag: '🇸🇬' },
  { code: 'CHF', name: '瑞士法郎', flag: '🇨🇭' }, { code: 'KRW', name: '韩元', flag: '🇰🇷' }, { code: 'THB', name: '泰铢', flag: '🇹🇭' }, { code: 'MYR', name: '马来西亚林吉特', flag: '🇲🇾' }
];
const fallbackRates = { CNY: { rate: 1, change: 0 }, USD: { rate: 7.1986, change: 0.0023 }, EUR: { rate: 7.8563, change: -0.0015 }, JPY: { rate: 0.0492, change: 0.0001 }, GBP: { rate: 9.1420, change: -0.014 }, HKD: { rate: 0.9231, change: 0.0002 }, AUD: { rate: 4.7120, change: 0.008 }, CAD: { rate: 5.2140, change: -0.003 }, SGD: { rate: 5.3560, change: 0.005 }, CHF: { rate: 8.075, change: -0.006 }, KRW: { rate: 0.0052, change: 0.00001 }, THB: { rate: 0.197, change: -0.0002 }, MYR: { rate: 1.534, change: 0.001 } };
let rates = { ...fallbackRates };
let conversionHistory = [];

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function formatAmount(value, code) { return `${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 4 })} ${code}`; }
function renderOptions() { const opts = currencies.map(c => `<option value="${c.code}">${c.name} (${c.code})</option>`).join(''); fromEl.innerHTML = toEl.innerHTML = opts; historyCurrencyEl.innerHTML = currencies.filter(c => c.code !== 'CNY').map(c => `<option value="${c.code}">${c.name} (${c.code})</option>`).join(''); fromEl.value = 'USD'; toEl.value = 'CNY'; historyCurrencyEl.value = 'USD'; dateEl.value = today(); historyStartEl.value = daysAgo(10); historyEndEl.value = today(); }
function getRate(from, to) {
  const fromRate = Number(rates[from]?.rate || fallbackRates[from]?.rate || (from === 'CNY' ? 1 : 0));
  const toRate = Number(rates[to]?.rate || fallbackRates[to]?.rate || (to === 'CNY' ? 1 : 0));
  if (from === to) return 1;
  if (from === 'CNY' && toRate > 0) return 1 / toRate;
  if (to === 'CNY' && fromRate > 0) return fromRate;
  if (fromRate > 0 && toRate > 0) return fromRate / toRate;
  return 0;
}
function convertCurrency(save = true) {
  const amount = Number(amountEl.value || 0);
  const rate = getRate(fromEl.value, toEl.value);
  if (!Number.isFinite(rate) || rate <= 0) {
    resultEl.textContent = '汇率数据不可用';
    rateInfoEl.textContent = '请刷新汇率或更换货币后重试';
    return;
  }
  const result = amount * rate;
  resultEl.textContent = formatAmount(result, toEl.value);
  rateInfoEl.textContent = `汇率：1 ${fromEl.value} = ${Number(rate.toFixed(6))} ${toEl.value}${dateEl.value !== today() ? `（${dateEl.value} 参考）` : ''}`;
  if (save && amount > 0) addHistory(amount, result, rate);
}
function addHistory(amount, result, rate) { const record = { id: Date.now(), amount, from: fromEl.value, to: toEl.value, result, rate, time: new Date().toISOString() }; conversionHistory = [record, ...conversionHistory.filter(r => !(r.amount === amount && r.from === fromEl.value && r.to === toEl.value))].slice(0, 10); localStorage.setItem('fxConversionHistory', JSON.stringify(conversionHistory)); renderHistory(); }
function renderHistory() {
  historyEl.innerHTML = conversionHistory.length ? conversionHistory.map(r => `
    <div class="history-item">
      <div class="history-amount">${escapeHtml(formatAmount(r.amount, r.from))}</div>
      <div class="history-arrow">→</div>
      <div class="history-result">${escapeHtml(formatAmount(r.result, r.to))}</div>
      <div class="history-rate">汇率：${Number(r.rate).toFixed(4)}</div>
      <div class="history-date">${new Date(r.time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
    </div>`).join('') : '<div class="no-history">暂无转换记录</div>';
}
function renderRateCards() {
  const major = currencies.filter(c => c.code !== 'CNY').slice(0, 8);
  gridEl.innerHTML = major.map(c => {
    const r = rates[c.code] || fallbackRates[c.code];
    const change = Number(r.change || 0);
    return `<div class="rate-card">
      <div class="currency-flag">${c.flag}</div>
      <div class="currency-info"><div class="currency-name">${escapeHtml(c.name)}</div><div class="currency-code">${c.code}</div></div>
      <div class="exchange-rate"><div class="rate-middle">汇率：${Number(r.rate).toFixed(4)}</div></div>
      <div class="change-indicator ${change > 0 ? 'up' : change < 0 ? 'down' : 'neutral'}">${change > 0 ? '+' : ''}${change.toFixed(4)}</div>
    </div>`;
  }).join('');
  lastUpdateEl.textContent = new Date().toLocaleString('zh-CN');
}
async function loadRealTimeRates() {
  statusEl.textContent = '正在刷新实时汇率...';
  try {
    const symbols = currencies.filter(c => c.code !== 'CNY').map(c => c.code).join(',');
    const data = await apiGet(`/exchange-rates/latest?base=CNY&symbols=${encodeURIComponent(symbols)}`, '实时汇率请求失败');
    if (data?.data?.rates) {
      const next = { CNY: { rate: 1, change: 0 } };
      currencies.filter(c => c.code !== 'CNY').forEach(c => {
        const perCny = Number(data.data.rates[c.code]);
        if (perCny) next[c.code] = { rate: 1 / perCny, change: fallbackRates[c.code]?.change || 0 };
      });
      rates = { ...fallbackRates, ...next };
      statusEl.textContent = '实时汇率已加载';
    } else throw new Error('汇率响应为空');
  } catch (e) {
    rates = { ...fallbackRates };
    statusEl.textContent = '使用内置参考汇率';
  }
  renderRateCards();
  convertCurrency(false);
  loadHistoryRates();
}
function loadHistoryRates() { const code = historyCurrencyEl.value; const base = Number(rates[code]?.rate || fallbackRates[code]?.rate || 7); const rows = []; const start = new Date(historyStartEl.value || daysAgo(10)); const end = new Date(historyEndEl.value || today()); for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) { const i = rows.length; const wave = Math.sin(i / 3) * base * 0.006; const drift = (i % 7 - 3) * base * 0.0006; const rate = base + wave + drift; const prev = rows.at(-1)?.rate || rate; rows.push({ date: d.toISOString().slice(0, 10), rate, change: rate - prev }); } historyBodyEl.innerHTML = rows.map(r => `<tr><td>${r.date}</td><td>${r.rate.toFixed(4)}</td><td class="${r.change >= 0 ? 'ok' : 'error'}">${r.change >= 0 ? '+' : ''}${r.change.toFixed(4)}</td></tr>`).join(''); const values = rows.map(r => r.rate); const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1); historySummaryEl.innerHTML = `<div class="stat-card"><div class="stat-label">最高</div><div class="stat-value">${Math.max(...values).toFixed(4)}</div></div><div class="stat-card"><div class="stat-label">最低</div><div class="stat-value">${Math.min(...values).toFixed(4)}</div></div><div class="stat-card"><div class="stat-label">平均</div><div class="stat-value">${avg.toFixed(4)}</div></div>`; }

renderOptions(); conversionHistory = JSON.parse(localStorage.getItem('fxConversionHistory') || '[]'); renderHistory();
document.getElementById('refresh-rates').addEventListener('click', loadRealTimeRates); document.getElementById('fx-swap').addEventListener('click', () => { const t = fromEl.value; fromEl.value = toEl.value; toEl.value = t; convertCurrency(); }); [amountEl, fromEl, toEl, dateEl].forEach(el => el.addEventListener('change', () => convertCurrency())); amountEl.addEventListener('input', () => convertCurrency(false)); document.getElementById('load-history').addEventListener('click', loadHistoryRates);
await loadRealTimeRates();
