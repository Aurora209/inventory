import { apiGet, buildMainNav, escapeHtml, setMessage } from './api.js?v=2026062214';

document.getElementById('main-nav').innerHTML = buildMainNav('labels');

const inputTable = document.getElementById('inputTable');
const tbody = document.querySelector('#inputTable tbody');
const labels = document.getElementById('labels');
const rowTemplate = document.getElementById('rowTemplate');
const statusEl = document.getElementById('page-status');
const messageEl = document.getElementById('page-message');
const orderIdInput = document.getElementById('order-id-input');
const appLayout = document.getElementById('appLayout');
const inputPanel = document.querySelector('.input-panel');
const panelResizer = document.getElementById('panelResizer');

const defaultRow = () => ({
  sku: '', name: '', qty: '', poNo: '', cartonNo: '', sizeCm: '', sizeInch: '', gwKg: '', gwLbs: '', nwKg: '', nwLbs: ''
});

let rows = [];
let labelSize = localStorage.getItem('label-size') || '100x100';
const labelPageSizes = {
  '100x100': { width: '100mm', height: '100mm' },
  '150x100': { width: '150mm', height: '100mm' }
};
const FIT_SAFETY_PX = 1;

function safe(v) { return (v ?? '').toString().trim(); }

function getLabelPageSize() {
  return labelPageSizes[labelSize] || labelPageSizes['100x100'];
}

function updatePrintPageSize() {
  const { width, height } = getLabelPageSize();
  document.documentElement.style.setProperty('--label-page-width', width);
  document.documentElement.style.setProperty('--label-page-height', height);
  let styleEl = document.getElementById('label-print-page-size');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'label-print-page-size';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
@media print {
  @page label-page { size: ${width} ${height}; margin: 0; }
  @page { size: ${width} ${height}; margin: 0; }
}`;
}

function loadRows() {
  try {
    const saved = localStorage.getItem('label-batch-rows');
    if (saved) rows = JSON.parse(saved);
  } catch (_) {}
  if (!Array.isArray(rows) || rows.length === 0) rows = Array.from({ length: 10 }, () => defaultRow());
}
function saveRows() { localStorage.setItem('label-batch-rows', JSON.stringify(rows)); }
function getPanelWidthBounds() {
  const appWidth = appLayout.getBoundingClientRect().width || window.innerWidth;
  const minLeft = 520;
  const minPreview = 400;
  const resizerWidth = 12;
  const maxLeft = Math.max(minLeft, appWidth - minPreview - resizerWidth);
  return { minLeft, maxLeft };
}
function clampPanelWidth(px) {
  const { minLeft, maxLeft } = getPanelWidthBounds();
  return Math.min(Math.max(minLeft, Number(px) || minLeft), maxLeft);
}
function loadPanelWidth() {
  const savedWidth = parseFloat(localStorage.getItem('label-left-panel-width') || '760');
  savePanelWidth(savedWidth);
}
function savePanelWidth(px) {
  const value = `${Math.round(clampPanelWidth(px))}px`;
  appLayout.style.setProperty('--left-panel-width', value);
  localStorage.setItem('label-left-panel-width', value);
}
function syncPanelHeights() {
  if (window.matchMedia('(max-width: 1100px)').matches) {
    appLayout.style.removeProperty('--label-panel-height');
    return;
  }
  const height = Math.max(360, Math.ceil(inputPanel.getBoundingClientRect().height || 0));
  appLayout.style.setProperty('--label-panel-height', `${height}px`);
}
function applySavedColumnWidths() {
  try {
    const widths = JSON.parse(localStorage.getItem('label-table-column-widths') || '[]');
    if (!Array.isArray(widths)) return;
    widths.forEach((width, index) => {
      if (Number(width) > 20) inputTable.style.setProperty(`--label-col-${index}`, `${Math.round(Number(width))}px`);
    });
  } catch (_) {}
}
function initColumnResizing() {
  const headers = Array.from(inputTable.querySelectorAll('thead th'));
  headers.forEach((th, index) => {
    if (th.querySelector('.column-resize-handle')) return;
    const handle = document.createElement('span');
    handle.className = 'column-resize-handle';
    handle.title = '拖动调整列宽';
    th.appendChild(handle);
    handle.addEventListener('mousedown', event => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = th.getBoundingClientRect().width;
      th.classList.add('resizing');
      const onMove = e => {
        const nextWidth = Math.max(44, startWidth + e.clientX - startX);
        inputTable.style.setProperty(`--label-col-${index}`, `${Math.round(nextWidth)}px`);
      };
      const onUp = () => {
        th.classList.remove('resizing');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        const widths = headers.map((header, i) => {
          const value = inputTable.style.getPropertyValue(`--label-col-${i}`).trim();
          return value.endsWith('px') ? parseFloat(value) : Math.round(header.getBoundingClientRect().width);
        });
        localStorage.setItem('label-table-column-widths', JSON.stringify(widths));
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  });
}

function normalizeSizeCm(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const cleaned = text.replace(/×/g, 'x').replace(/\*/g, 'x').replace(/\s+/g, '').replace(/cm/gi, '');
  if (!/^\d+(?:\.\d+)?x\d+(?:\.\d+)?x\d+(?:\.\d+)?$/i.test(cleaned)) return '';
  return cleaned;
}
function formatSizeCm(value) {
  const text = safe(value);
  if (!text) return '';
  const normalized = normalizeSizeCm(text);
  const withoutUnit = normalized || text.replace(/\s*cm\s*$/i, '').trim();
  return withoutUnit ? `${withoutUnit} cm` : '';
}
function convertCmToInch(sizeCm) {
  const raw = (sizeCm || '').trim().toLowerCase();
  if (!raw) return '';
  const cleaned = raw.replace(/\s*cm\s*$/i, '').trim();
  const parts = cleaned.split(/\s*[x×*]\s*/).map(s => s.trim()).filter(Boolean);
  if (!parts.length) return '';
  return `${parts.map(part => {
    const n = Number(part);
    return Number.isNaN(n) ? part : (Math.round((n / 2.54) * 100) / 100).toFixed(2);
  }).join('x')} inch`;
}
function convertKgToLbs(kg) {
  const text = String(kg || '').trim();
  if (!text) return '';
  const n = Number(text);
  if (Number.isNaN(n)) return '';
  return (Math.round(n * 2.2046226218 * 100) / 100).toFixed(2);
}
function fillDerivedFieldsForRow(row) {
  if (safe(row.sizeCm)) row.sizeInch = convertCmToInch(row.sizeCm);
  if (safe(row.gwKg)) row.gwLbs = convertKgToLbs(row.gwKg);
  if (safe(row.nwKg)) row.nwLbs = convertKgToLbs(row.nwKg);
}
function handleRowAutoConvert(row, changedKey) {
  if (changedKey === 'sizeCm') {
    const normalized = normalizeSizeCm(row.sizeCm);
    if (normalized) row.sizeCm = normalized;
    row.sizeInch = convertCmToInch(row.sizeCm);
  }
  if (changedKey === 'gwKg') row.gwLbs = convertKgToLbs(row.gwKg);
  if (changedKey === 'nwKg') row.nwLbs = convertKgToLbs(row.nwKg);
}
function formatQty(v) {
  const text = String(v ?? '').trim();
  if (!text) return '';
  const match = text.match(/^(\d+(?:\.\d+)?)\s*([（(].*[)）])$/);
  if (match) return `${match[1]} pcs ${match[2]}`;
  if (/\bpcs\b/i.test(text)) return text;
  return `${text} pcs`;
}

function buildLabelMarkup(row) {
  return `
    <div class="label-inner" data-size="${labelSize}">
      <table class="label-grid">
        <tr class="row-h"><td class="left">SKU:</td><td class="right" colspan="2">${escapeHtml(safe(row.sku))}</td></tr>
        <tr class="row-h"><td class="left">NAME:</td><td class="right" colspan="2">${escapeHtml(safe(row.name))}</td></tr>
        <tr class="row-h"><td class="left">QTY:</td><td class="right" colspan="2">${escapeHtml(formatQty(row.qty))}</td></tr>
        <tr class="row-h"><td class="left">PO NO:</td><td class="right" colspan="2">${escapeHtml(safe(row.poNo))}</td></tr>
        <tr class="row-h"><td class="left left-carton">CARTON NO:</td><td class="right" colspan="2">${escapeHtml(safe(row.cartonNo))}</td></tr>
        <tr class="row-size-top"><td class="left size-left" rowspan="2">SIZE:</td><td class="size-box" colspan="2">${escapeHtml(formatSizeCm(row.sizeCm))}</td></tr>
        <tr class="row-size-bottom"><td class="size-box" colspan="2">${escapeHtml(safe(row.sizeInch))}</td></tr>
        <tr class="row-weight"><td class="left">G.W.:</td><td class="double-cell">${escapeHtml(safe(row.gwKg))}${safe(row.gwKg) ? ' kg' : ''}</td><td class="double-cell">${escapeHtml(safe(row.gwLbs))}${safe(row.gwLbs) ? ' lbs' : ''}</td></tr>
        <tr class="row-weight"><td class="left">N.W.:</td><td class="double-cell">${escapeHtml(safe(row.nwKg))}${safe(row.nwKg) ? ' kg' : ''}</td><td class="double-cell">${escapeHtml(safe(row.nwLbs))}${safe(row.nwLbs) ? ' lbs' : ''}</td></tr>
      </table>
      <div class="country">MADE IN CHINA</div>
    </div>`;
}
function getPrintableRows() {
  const editableKeys = ['sku', 'name', 'qty', 'poNo', 'cartonNo', 'sizeCm', 'sizeInch', 'gwKg', 'gwLbs', 'nwKg', 'nwLbs'];
  const printableRows = rows.filter(r => editableKeys.some(key => String(r[key] || '').trim() !== ''));
  return printableRows.length ? printableRows : rows.slice(0, 1);
}
function fitTextToSingleLine(root = document) {
  root.querySelectorAll('.right, .size-box, .double-cell').forEach(el => {
    const computed = window.getComputedStyle(el);
    const baseSize = parseFloat(el.dataset.baseFontSize || computed.fontSize);
    if (!el.dataset.baseFontSize) el.dataset.baseFontSize = String(baseSize);
    let size = parseFloat(el.dataset.baseFontSize);
    el.style.fontSize = `${size}px`;
    while (el.scrollWidth > el.clientWidth - FIT_SAFETY_PX && size > 5) {
      size -= 0.2;
      el.style.fontSize = `${size}px`;
    }
  });

  root.querySelectorAll('.country').forEach(el => {
    const computed = window.getComputedStyle(el);
    const baseSize = parseFloat(el.dataset.baseFontSize || computed.fontSize);
    if (!el.dataset.baseFontSize) el.dataset.baseFontSize = String(baseSize);
    let size = parseFloat(el.dataset.baseFontSize);
    el.style.fontSize = `${size}px`;
    while (el.scrollWidth > el.clientWidth - FIT_SAFETY_PX && size > 18) {
      size -= 0.2;
      el.style.fontSize = `${size}px`;
    }
  });
}
function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}
async function prepareLabelsForPrint() {
  updatePrintPageSize();
  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch (_) {}
  }
  await nextFrame();
  fitTextToSingleLine(labels);
  await nextFrame();
  fitTextToSingleLine(labels);
}
function scheduleLabelFit() {
  requestAnimationFrame(() => {
    fitTextToSingleLine(labels);
    setTimeout(() => fitTextToSingleLine(labels), 80);
    setTimeout(() => fitTextToSingleLine(labels), 250);
  });
}
function renderLabels() {
  updatePrintPageSize();
  labels.innerHTML = '';
  getPrintableRows().forEach(row => {
    fillDerivedFieldsForRow(row);
    const div = document.createElement('div');
    div.className = 'label-sheet';
    div.setAttribute('data-size', labelSize);
    div.innerHTML = buildLabelMarkup(row);
    labels.appendChild(div);
  });
  scheduleLabelFit();
  requestAnimationFrame(syncPanelHeights);
}
function renderTable() {
  tbody.innerHTML = '';
  rows.forEach((row, index) => {
    fillDerivedFieldsForRow(row);
    const fragment = rowTemplate.content.cloneNode(true);
    const tr = fragment.querySelector('tr');
    tr.querySelectorAll('input, textarea').forEach(input => {
      const key = input.dataset.key;
      input.value = key === 'sizeCm' ? (normalizeSizeCm(row[key]) || String(row[key] ?? '').replace(/\s*cm\s*$/i, '').trim()) : (row[key] ?? '');
      input.addEventListener('input', e => { rows[index][key] = e.target.value; saveRows(); renderLabels(); });
      input.addEventListener('blur', e => { rows[index][key] = e.target.value; handleRowAutoConvert(rows[index], key); saveRows(); renderTable(); renderLabels(); });
    });
    tr.querySelector('.delete-row').addEventListener('click', () => {
      rows.splice(index, 1);
      if (rows.length === 0) rows.push(defaultRow());
      saveRows(); renderTable(); renderLabels();
    });
    tbody.appendChild(fragment);
  });
  requestAnimationFrame(syncPanelHeights);
}
function addRows(count) { for (let i = 0; i < count; i++) rows.push(defaultRow()); saveRows(); renderTable(); renderLabels(); }

function normalizeBulkSourceFields() {
  const bulkSizeCm = document.getElementById('bulkSizeCm');
  const normalizedSize = normalizeSizeCm(bulkSizeCm.value);
  if (bulkSizeCm.value.trim() && normalizedSize) bulkSizeCm.value = normalizedSize;
}
function getBulkValues() {
  normalizeBulkSourceFields();
  const sizeCm = normalizeSizeCm(document.getElementById('bulkSizeCm').value) || document.getElementById('bulkSizeCm').value.trim();
  const gwKg = document.getElementById('bulkGwKg').value.trim();
  const nwKg = document.getElementById('bulkNwKg').value.trim();
  return {
    sku: document.getElementById('bulkSku').value.trim(),
    name: document.getElementById('bulkName').value.trim(),
    qty: document.getElementById('bulkQty').value.trim(),
    poNo: document.getElementById('bulkPoNo').value.trim(),
    sizeCm,
    sizeInch: convertCmToInch(sizeCm),
    gwKg,
    gwLbs: convertKgToLbs(gwKg),
    nwKg,
    nwLbs: convertKgToLbs(nwKg)
  };
}
function applyBulkValues(onlyEmpty) {
  const bulk = getBulkValues();
  rows = rows.map(row => {
    const next = { ...row };
    Object.entries(bulk).forEach(([key, value]) => {
      if (value === '') return;
      if (!onlyEmpty || safe(next[key]) === '') next[key] = value;
    });
    fillDerivedFieldsForRow(next);
    return next;
  });
  saveRows(); renderTable(); renderLabels();
}
function fillSample() {
  rows = Array.from({ length: 10 }, (_, i) => ({ sku: 'BBK3OZ3PK', name: 'Essential Oil Spray', qty: '20', poNo: '20260320', cartonNo: `C${String(i + 1).padStart(3, '0')}`, sizeCm: '40x25.5x17', sizeInch: '15.75x10.04x6.69 inch', gwKg: '6.98', gwLbs: '15.39', nwKg: '6.63', nwLbs: '14.62' }));
  saveRows(); renderTable(); renderLabels();
}
function generateCartons() {
  const prefix = document.getElementById('cartonPrefix').value || '';
  const start = Number(document.getElementById('cartonStart').value || 1);
  const digits = Number(document.getElementById('cartonDigits').value || 3);
  const count = Number(document.getElementById('cartonCount').value || rows.length || 1);
  while (rows.length < count) rows.push(defaultRow());
  for (let i = 0; i < count; i++) rows[i].cartonNo = `${prefix}${String(start + i).padStart(digits, '0')}`;
  saveRows(); renderTable(); renderLabels();
}

function normalizeImportedRow(item) {
  const get = (...keys) => {
    for (const key of keys) if (item[key] !== undefined && item[key] !== null) return String(item[key]).trim();
    return '';
  };
  const sizeCm = normalizeSizeCm(get('sizeCm', 'SIZE_CM', 'SIZE CM'));
  const gwKg = get('gwKg', 'GW_KG', 'G.W. KG');
  const nwKg = get('nwKg', 'NW_KG', 'N.W. KG');
  return { ...defaultRow(), sku: get('sku', 'SKU'), name: get('name', 'NAME'), qty: get('qty', 'QTY'), poNo: get('poNo', 'PO_NO', 'PO NO'), cartonNo: get('cartonNo', 'CARTON_NO', 'CARTON NO'), sizeCm, sizeInch: get('sizeInch', 'SIZE_INCH', 'SIZE INCH') || convertCmToInch(sizeCm), gwKg, gwLbs: get('gwLbs', 'GW_LBS', 'G.W. LBS') || convertKgToLbs(gwKg), nwKg, nwLbs: get('nwLbs', 'NW_LBS', 'N.W. LBS') || convertKgToLbs(nwKg) };
}
function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 2) throw new Error('CSV 至少需要表头和一行数据');
  const parseLine = (line) => {
    const result = []; let current = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } else inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
      else current += ch;
    }
    result.push(current);
    return result.map(v => v.trim());
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => { const values = parseLine(line); const obj = {}; headers.forEach((h, i) => obj[h] = values[i] ?? ''); return normalizeImportedRow(obj); });
}

function calculateBoxCount(item) {
  const qty = Math.max(0, Math.ceil(Number(item.quantity || 0)));
  const units = Math.max(1, Math.ceil(Number(item.units_per_box || 1)));
  return Math.max(1, Math.ceil(qty / units));
}
function rowsFromOrder(order) {
  const poNo = order.order_number || '';
  const result = [];
  (order.items || []).forEach(item => {
    const totalQty = Math.max(0, Number(item.quantity || 0));
    const unitsPerBox = Math.max(1, Number(item.units_per_box || 1));
    const boxCount = calculateBoxCount(item);
    for (let i = 0; i < boxCount; i++) {
      const qty = i === boxCount - 1 ? totalQty - unitsPerBox * (boxCount - 1) : unitsPerBox;
      result.push({
        ...defaultRow(),
        sku: item.product_sku || '',
        name: item.description || item.product_name || '',
        qty: qty > 0 ? String(qty) : String(unitsPerBox),
        poNo,
        cartonNo: `C${String(result.length + 1).padStart(3, '0')}`,
        sizeCm: normalizeSizeCm(item.packaging || '')
      });
    }
  });
  return result.length ? result : [defaultRow()];
}
async function loadOrder(orderId) {
  if (!orderId) return;
  try {
    statusEl.textContent = '正在读取订单...';
    const payload = await apiGet(`/orders/${orderId}`, '读取订单失败');
    rows = rowsFromOrder(payload.data || {});
    saveRows(); renderTable(); renderLabels();
    statusEl.textContent = '已从订单生成';
    setMessage(messageEl, `已生成 ${rows.length} 张箱唛标签；如需毛重/净重/尺寸，可在表格或公共字段里补充。`, 'ok');
  } catch (error) {
    statusEl.textContent = '读取失败';
    setMessage(messageEl, error.message, 'error');
  }
}
function getQueryOrderId() { return new URLSearchParams(window.location.search).get('orderId') || ''; }

['bulkSizeCm', 'bulkGwKg', 'bulkNwKg'].forEach(id => document.getElementById(id).addEventListener('blur', normalizeBulkSourceFields));
document.getElementById('addRowBtn').addEventListener('click', () => addRows(1));
document.getElementById('add10Btn').addEventListener('click', () => addRows(10));
document.getElementById('fillSampleBtn').addEventListener('click', fillSample);
document.getElementById('clearBtn').addEventListener('click', () => { rows = Array.from({ length: 10 }, () => defaultRow()); saveRows(); renderTable(); renderLabels(); });
document.getElementById('applyBulkAllBtn').addEventListener('click', () => applyBulkValues(false));
document.getElementById('applyBulkEmptyBtn').addEventListener('click', () => applyBulkValues(true));
document.getElementById('generateCartonBtn').addEventListener('click', generateCartons);
document.getElementById('printBtn').addEventListener('click', async () => {
  renderLabels();
  await prepareLabelsForPrint();
  window.print();
});

// 标签尺寸选择器
const labelSizeSelect = document.getElementById('labelSizeSelect');
const labelSizeSelectTop = document.getElementById('labelSizeSelectTop');

function syncLabelSizeSelect() {
  if (labelSizeSelect) labelSizeSelect.value = labelSize;
  if (labelSizeSelectTop) labelSizeSelectTop.value = labelSize;
}

[labelSizeSelect, labelSizeSelectTop].forEach(sel => {
  if (sel) {
    sel.addEventListener('change', () => {
      labelSize = sel.value;
      localStorage.setItem('label-size', labelSize);
      updatePrintPageSize();
      renderLabels();
    });
  }
});
document.getElementById('load-order-button').addEventListener('click', () => loadOrder(orderIdInput.value));

document.getElementById('exportJsonBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'label-data.json'; a.click(); URL.revokeObjectURL(a.href);
});
const jsonInput = document.getElementById('jsonFileInput');
document.getElementById('importJsonBtn').addEventListener('click', () => jsonInput.click());
jsonInput.addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try { const parsed = JSON.parse(await file.text()); if (!Array.isArray(parsed)) throw new Error('JSON 必须是数组'); rows = parsed.map(normalizeImportedRow); saveRows(); renderTable(); renderLabels(); setMessage(messageEl, 'JSON 导入成功', 'ok'); } catch (err) { setMessage(messageEl, `导入失败：${err.message}`, 'error'); }
  e.target.value = '';
});
const csvInput = document.getElementById('csvFileInput');
document.getElementById('importCsvBtn').addEventListener('click', () => csvInput.click());
csvInput.addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try { rows = parseCsv(await file.text()); saveRows(); renderTable(); renderLabels(); setMessage(messageEl, 'CSV 导入成功', 'ok'); } catch (err) { setMessage(messageEl, `CSV 导入失败：${err.message}`, 'error'); }
  e.target.value = '';
});

panelResizer.addEventListener('mousedown', event => {
  event.preventDefault(); panelResizer.classList.add('dragging');
  const onMove = e => {
    const appLeft = appLayout.getBoundingClientRect().left;
    savePanelWidth(e.clientX - appLeft);
    syncPanelHeights();
  };
  const onUp = () => { panelResizer.classList.remove('dragging'); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
});
window.addEventListener('resize', () => { loadPanelWidth(); scheduleLabelFit(); syncPanelHeights(); });
window.addEventListener('beforeprint', () => {
  updatePrintPageSize();
});
if (document.fonts?.ready) {
  document.fonts.ready.then(() => scheduleLabelFit()).catch(() => {});
}
window.addEventListener('load', () => { scheduleLabelFit(); syncPanelHeights(); });

loadRows(); loadPanelWidth(); applySavedColumnWidths(); initColumnResizing(); renderTable(); syncLabelSizeSelect(); renderLabels(); syncPanelHeights();
const initialOrderId = getQueryOrderId();
if (initialOrderId) { orderIdInput.value = initialOrderId; loadOrder(initialOrderId); }
