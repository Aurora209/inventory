import { apiGet, fetchJsonByUrl, buildMainNav, formatCurrency, escapeHtml, setMessage } from './api.js?v=2026062214';
import { API_ORIGIN } from './config.js?v=2026051301';

document.getElementById('main-nav').innerHTML = buildMainNav('reports');

const statusEl = document.getElementById('page-status');
const headEl = document.getElementById('report-head');
const bodyEl = document.getElementById('report-body');
const titleEl = document.getElementById('report-title');
const messageEl = document.getElementById('page-message');
const packingSummaryEl = document.getElementById('packing-summary');
const bomSection = document.getElementById('bom-export-section');
const tableSection = document.getElementById('report-table-section');
const tabs = Array.from(document.querySelectorAll('.report-tab'));
let currentRows = [];
let currentHeaders = [];

const reports = {
  material: { title: '物料需求计划', url: '/api/reports/material-requirements', headers: ['物料SKU', '物料名称', '单位', '总需求数量', '当前库存', '缺货数量'] },
  cost: { title: '成本分析', url: '/api/reports/cost-analysis', headers: ['产品SKU', '产品名称', '物料数量', '总成本', '单位成本'] },
  purchase: { title: '采购清单', url: '/api/reports/purchase-list', headers: ['物料SKU', '物料名称', '单位', '总需求数量', '当前库存', '缺货数量', '采购单价', '采购金额'] }
};
function formatCell(header, value) { if (typeof value === 'number') return /金额|成本|单价/.test(header) ? formatCurrency(value) : Number(value.toFixed(2)); return value ?? ''; }
async function loadReport(key = 'bom-export') {
  tabs.forEach(tab => { const active = tab.dataset.tab === key; tab.classList.toggle('active', active); tab.classList.toggle('btn-primary', active); tab.classList.toggle('btn-secondary', !active); });
  if (key === 'bom-export') { bomSection.style.display = 'block'; tableSection.style.display = 'none'; statusEl.textContent = 'BOM 导出已就绪'; setMessage(messageEl, '可直接导出 BOM Excel', 'ok'); return; }
  try { statusEl.textContent = '正在加载报表...'; bomSection.style.display = 'none'; tableSection.style.display = 'block'; const config = reports[key]; titleEl.textContent = config.title; const data = await fetchJsonByUrl(`${API_ORIGIN}${config.url}`, '报表加载失败'); currentRows = Array.isArray(data?.data) ? data.data : []; currentHeaders = config.headers; headEl.innerHTML = `<tr>${config.headers.map(h => `<th>${h}</th>`).join('')}</tr>`; bodyEl.innerHTML = currentRows.length ? currentRows.map(row => `<tr>${config.headers.map(h => `<td>${escapeHtml(formatCell(h, row[h]))}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${config.headers.length}">暂无数据</td></tr>`; statusEl.textContent = `已加载 ${currentRows.length} 行`; setMessage(messageEl, `${config.title}加载成功`, 'ok'); } catch (error) { statusEl.textContent = '加载失败'; setMessage(messageEl, error.message, 'error'); }
}
function exportCsv() { if (!currentRows.length) return setMessage(messageEl, '当前报表暂无数据可导出', 'error'); const csv = [currentHeaders.join(','), ...currentRows.map(row => currentHeaders.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n'); const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${titleEl.textContent || 'report'}.csv`; a.click(); URL.revokeObjectURL(url); }
function buildPackingSummary(order) { const items = Array.isArray(order.items) ? order.items : []; return `<h4>订单 ${escapeHtml(order.order_number || '')}</h4><ul>${items.map((item, index) => `<li>${index + 1}. ${escapeHtml(item.description || item.product_name || '未命名商品')} - 数量 ${escapeHtml(item.quantity ?? 0)} ${escapeHtml(item.unit || '')} - 每箱 ${escapeHtml(item.units_per_box ?? 1)} - 包装规格 ${escapeHtml(item.packaging || '-')}</li>`).join('')}</ul><div class="form-actions"><a class="btn btn-secondary" href="/pages/packing-list.html?orderId=${order.id}">打开完整装箱单</a><button id="print-report-packing" class="btn btn-secondary">打印当前页</button></div>`; }

document.getElementById('export-bom-button').addEventListener('click', () => { window.open(`${API_ORIGIN}/api/reports/bom/export`, '_blank'); }); document.getElementById('export-current-csv').addEventListener('click', exportCsv); tabs.forEach(tab => tab.addEventListener('click', () => loadReport(tab.dataset.tab))); document.getElementById('load-packing-order').addEventListener('click', async () => { const orderId = document.getElementById('packing-order-id').value; if (!orderId) return setMessage(messageEl, '请先输入订单 ID', 'error'); try { const data = await apiGet(`/orders/${orderId}`, '加载订单失败'); packingSummaryEl.innerHTML = buildPackingSummary(data.data); document.getElementById('print-report-packing')?.addEventListener('click', () => window.print()); } catch (error) { packingSummaryEl.innerHTML = ''; setMessage(messageEl, error.message, 'error'); } });
loadReport('bom-export');
