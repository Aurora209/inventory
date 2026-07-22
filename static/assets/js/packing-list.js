import { apiGet, apiPut, buildMainNav, escapeHtml, setMessage } from './api.js?v=2026062214';

document.getElementById('main-nav').innerHTML = buildMainNav('packing-list');

const statusEl = document.getElementById('page-status');
const messageEl = document.getElementById('page-message');
const contentEl = document.getElementById('packing-content');
const orderIdInput = document.getElementById('order-id-input');
const saveButton = document.getElementById('save-packing-list');
const printButton = document.getElementById('print-packing-list');
const printLabelsButton = document.getElementById('print-labels');
let selectedOrder = null;

function showIdleState() {
  statusEl.textContent = '等待输入订单 ID';
  saveButton.style.display = 'none';
  printButton.style.display = 'none';
  printLabelsButton.style.display = 'none';
  contentEl.innerHTML = `
    <div class="card">
      <p>请输入订单 ID 后加载装箱单预览。</p>
      <p>可维护每箱数量和普通包装规格。</p>
    </div>
  `;
  setMessage(messageEl, '当前没有可直接预览的装箱单', '');
}

function getQueryOrderId() {
  return new URLSearchParams(window.location.search).get('orderId') || '';
}

function ensurePackingDefaults(order) {
  order.items = Array.isArray(order.items) ? order.items : [];
  order.items.forEach(item => {
    item.units_per_box = Number(item.units_per_box || 1);
    item.packaging = item.packaging || '';
  });
  return order;
}

function numericInputValue(name, idx) {
  const el = document.querySelector(`[data-field="${name}"][data-index="${idx}"]`);
  return el?.value === '' ? null : Number(el?.value || 0);
}

function textInputValue(name, idx) {
  const el = document.querySelector(`[data-field="${name}"][data-index="${idx}"]`);
  return el?.value || '';
}

function collectFormValues() {
  selectedOrder.items.forEach((item, idx) => {
    item.units_per_box = numericInputValue('units_per_box', idx) || 1;
    item.packaging = textInputValue('packaging', idx).trim();
  });
}

function calcBoxCount(item) {
  const quantity = Number(item.quantity || 0);
  const unitsPerBox = Number(item.units_per_box || 1) || 1;
  return Math.ceil(quantity / unitsPerBox);
}

function renderEditor() {
  const items = selectedOrder.items || [];
  contentEl.innerHTML = `
    <div class="print-sheet packing-sheet">
      <div class="print-header">
        <div>
          <h2>装箱单 / Packing List</h2>
          <p>订单号：${escapeHtml(selectedOrder.order_number || '')}</p>
        </div>
        <div class="print-badge">日期：${escapeHtml(selectedOrder.order_date || '')}</div>
      </div>
      <div class="print-meta-grid">
        <div class="print-panel">
          <h3>客户/供应商</h3>
          <p>${escapeHtml(selectedOrder.customer_supplier || '')}</p>
        </div>
        <div class="print-panel">
          <h3>说明</h3>
          <p>请核对数量、每箱数量和包装规格。</p>
        </div>
      </div>
      ${items.map((item, idx) => `
        <div class="card packing-editor-card no-print">
          <div class="packing-item-header">
            <strong>${idx + 1}. ${escapeHtml(item.description || item.product_name || '未命名商品')}</strong>
            <span>数量：${escapeHtml(item.quantity ?? 0)} ${escapeHtml(item.unit || '')}</span>
          </div>
          <div class="form-grid">
            <label>
              <span>每箱数量</span>
              <input class="input" data-index="${idx}" data-field="units_per_box" type="number" min="1" value="${escapeHtml(item.units_per_box || 1)}">
            </label>
            <label>
              <span>包装规格</span>
              <input class="input" data-index="${idx}" data-field="packaging" type="text" value="${escapeHtml(item.packaging || '')}" placeholder="例如：12瓶/箱、独立袋装、纸箱包装">
            </label>
          </div>
        </div>
      `).join('')}
      <div id="packing-preview"></div>
    </div>
  `;
  document.querySelectorAll('[data-field]').forEach(el => el.addEventListener('input', () => {
    collectFormValues();
    renderPreview();
  }));
  renderPreview();
}

function renderPreview() {
  const previewEl = document.getElementById('packing-preview');
  if (!previewEl) return;

  const rows = selectedOrder.items.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(item.description || item.product_name || '')}</td>
      <td>${escapeHtml(item.quantity ?? 0)} ${escapeHtml(item.unit || '')}</td>
      <td>${escapeHtml(item.units_per_box || 1)}</td>
      <td>${calcBoxCount(item)}</td>
      <td>${escapeHtml(item.packaging || '-')}</td>
    </tr>
  `);

  const totalBoxes = selectedOrder.items.reduce((sum, item) => sum + calcBoxCount(item), 0);
  previewEl.innerHTML = `
    <div class="section-header">
      <h3>打印预览</h3>
      <p class="message">共 ${totalBoxes} 箱</p>
    </div>
    <div class="table-container">
      <table class="data-table print-table">
        <thead><tr><th>#</th><th>品名</th><th>数量</th><th>每箱数量</th><th>箱数</th><th>包装规格</th></tr></thead>
        <tbody>${rows.join('') || '<tr><td colspan="6">暂无明细</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

async function loadOrder(orderId) {
  if (!orderId) return showIdleState();
  try {
    statusEl.textContent = '正在加载订单...';
    const payload = await apiGet(`/orders/${orderId}`, '加载订单失败');
    selectedOrder = ensurePackingDefaults(payload.data);
    renderEditor();
    saveButton.style.display = 'inline-flex';
    printButton.style.display = 'inline-flex';
    printLabelsButton.style.display = 'inline-flex';
    statusEl.textContent = '加载完成';
    setMessage(messageEl, '装箱单已生成，可编辑包装规格后保存或打印', 'ok');
  } catch (error) {
    selectedOrder = null;
    contentEl.innerHTML = '';
    saveButton.style.display = 'none';
    printButton.style.display = 'none';
    printLabelsButton.style.display = 'none';
    statusEl.textContent = '加载失败';
    setMessage(messageEl, error.message, 'error');
  }
}

async function savePackingList() {
  if (!selectedOrder) return;
  collectFormValues();
  const items = selectedOrder.items.map(item => ({
    product_id: item.product_id,
    description: item.description || item.product_name || '',
    quantity: Number(item.quantity || 0),
    unit_price: Number(item.unit_price || 0),
    unit: item.unit || '个',
    units_per_box: Number(item.units_per_box || 1),
    packaging: item.packaging || '',
    notes: item.notes || ''
  }));
  await apiPut(`/orders/${selectedOrder.id}`, { ...selectedOrder, items }, '保存装箱配置失败');
  setMessage(messageEl, '包装规格已保存', 'ok');
}

document.getElementById('load-order-button').addEventListener('click', () => loadOrder(orderIdInput.value));
saveButton.addEventListener('click', savePackingList);
printButton.addEventListener('click', () => { collectFormValues(); renderPreview(); window.print(); });
printLabelsButton.addEventListener('click', () => {
  if (!selectedOrder?.id) return;
  window.location.href = `/pages/labels.html?orderId=${selectedOrder.id}`;
});
const initialOrderId = getQueryOrderId();
if (initialOrderId) {
  orderIdInput.value = initialOrderId;
  loadOrder(initialOrderId);
} else showIdleState();
