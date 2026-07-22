import { apiGet, apiPost, apiPut, apiDelete, buildMainNav, formatCurrency, escapeHtml, setMessage } from './api.js?v=2026062214';

function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

const pageType = window.ORDER_PAGE_TYPE === 'sales' ? 'sales' : 'purchase';
const navKey = pageType === 'sales' ? 'sales-orders' : 'purchase-orders';
const typeLabel = pageType === 'sales' ? '销售' : '采购';
const counterpartLabel = pageType === 'sales' ? '客户' : '供应商';
const statusPendingText = pageType === 'sales' ? '待发货' : '待到货';
const statusCompletedText = pageType === 'sales' ? '已交付' : '已入库';
const actionViewText = '查看';
const actionEditText = '编辑';
const actionCompleteText = pageType === 'sales' ? '标记交付' : '标记入库';
const actionCancelText = '取消';
const actionRevertText = '标记待处理';
const actionDeleteText = '删除';

document.getElementById('main-nav').innerHTML = buildMainNav(navKey);

const statusEl = document.getElementById('page-status');
const messageEl = document.getElementById('page-message');
const createMessageEl = document.getElementById('create-order-message');
const editMessageEl = document.getElementById('edit-order-message');
const editOrderNumberDisplay = document.getElementById('edit-order-number-display');
const editOrderSubtotalDisplay = document.getElementById('edit-order-subtotal-display');
const editOrderShippingDisplay = document.getElementById('edit-order-shipping-display');
const editOrderTotalDisplay = document.getElementById('edit-order-total-display');
const bodyEl = document.getElementById('orders-body');
const supplierSearchInput = document.getElementById('supplier-search-input');
const productSearchInput = document.getElementById('product-search-input');
const statusSelect = document.getElementById('status-select');
const searchButton = document.getElementById('search-button');
const resetButton = document.getElementById('reset-button');
const createOrderSection = document.getElementById('create-order-section');
const openCreateOrderSectionButton = document.getElementById('open-create-order-section');
const closeCreateOrderSectionButton = document.getElementById('close-create-order-section');
const cancelCreateOrderSectionButton = document.getElementById('cancel-create-order-section');
const createOrderButton = document.getElementById('create-order-button');
const createOrderTotalDisplay = document.getElementById('create-order-total-display');
const addOrderItemRowButton = document.getElementById('add-order-item-row');
const createOrderNumber = document.getElementById('create-order-number-display');
const createCustomerSupplier = document.getElementById('create-customer-supplier');
const createOrderDate = document.getElementById('create-order-date');
const createShippingCost = document.getElementById('create-shipping-cost');
const createNotes = document.getElementById('create-notes');
const createSellerName = document.getElementById('create-seller-name');
const createSellerPhone = document.getElementById('create-seller-phone');
const createSellerAddress = document.getElementById('create-seller-address');
const createSellerTaxno = document.getElementById('create-seller-taxno');
const createSellerNote = document.getElementById('create-seller-note');
const createItemsBody = document.getElementById('create-order-items-body');
const orderDetailPanel = document.getElementById('order-detail-panel');
const orderDetailContent = document.getElementById('order-detail-content');
const closeOrderDetailButton = document.getElementById('close-order-detail');
const editCurrentOrderButton = document.getElementById('edit-current-order-button');
const printCurrentOrderButton = document.getElementById('print-current-order-button');
const openPackingListButton = document.getElementById('open-packing-list-button');
const editOrderPanel = document.getElementById('edit-order-panel');
const closeEditOrderButton = document.getElementById('close-edit-order');
const editCustomerSupplier = document.getElementById('edit-customer-supplier');
const editOrderDate = document.getElementById('edit-order-date');
const editShippingCost = document.getElementById('edit-shipping-cost');
const editOrderStatus = document.getElementById('edit-order-status');
const editNotes = document.getElementById('edit-notes');
const editSellerName = document.getElementById('edit-seller-name');
const editSellerPhone = document.getElementById('edit-seller-phone');
const editSellerAddress = document.getElementById('edit-seller-address');
const editSellerTaxno = document.getElementById('edit-seller-taxno');
const editSellerNote = document.getElementById('edit-seller-note');
const editItemsBody = document.getElementById('edit-order-items-body');
const addEditItemRowButton = document.getElementById('add-edit-item-row');
const saveOrderEditButton = document.getElementById('save-order-edit-button');

let products = [];
let createOrderItems = [];
let currentOrder = null;
let editOrderItems = [];

const orderModalBackdrop = document.createElement('div');
orderModalBackdrop.className = 'order-modal-backdrop';
document.body.appendChild(orderModalBackdrop);

function showOrderModal(panel) {
  if (!panel) return;
  orderDetailPanel.style.display = 'none';
  editOrderPanel.style.display = 'none';
  panel.style.display = 'block';
  orderModalBackdrop.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closeOrderModals() {
  orderDetailPanel.style.display = 'none';
  editOrderPanel.style.display = 'none';
  orderModalBackdrop.style.display = 'none';
  document.body.style.overflow = '';
}

function getStatusText(value) {
  if (value === 'completed') return statusCompletedText;
  if (value === 'cancelled') return '已取消';
  return statusPendingText;
}

function getDetailLabels() {
  return pageType === 'sales'
    ? {
        counterpart: '客户名称',
        note: '销售备注',
        shipping: '发货运费',
        seller: '我方主体',
        sellerPhone: '业务电话',
        sellerAddress: '发货地址',
        taxNo: '税号',
        process: '交付状态'
      }
    : {
        counterpart: '供应商名称',
        note: '采购备注',
        shipping: '运费 / 杂费',
        seller: '卖方主体',
        sellerPhone: '供应商电话',
        sellerAddress: '供应商地址',
        taxNo: '卖方税号',
        process: '到货状态'
      };
}

function productOptions(selectedId = null) {
  return '<option value="">选择产品（可选）</option>' + products.map(product =>
    `<option value="${product.id}" ${Number(selectedId) === Number(product.id) ? 'selected' : ''}>${escapeHtml(product.name || '')} (${escapeHtml(product.sku || '')})</option>`
  ).join('');
}

function getItemAmount(item) {
  return Number(item.quantity || 0) * Number(item.unit_price || 0);
}

function formatAmountInputValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? String(Math.round(number * 100) / 100) : '0';
}

function recalculateUnitPriceFromLineTotal(item) {
  const quantity = Number(item.quantity || 0);
  const lineTotal = Number(item.line_total || 0);
  if (quantity > 0 && lineTotal >= 0) {
    item.unit_price = Math.round((lineTotal / quantity) * 10000) / 10000;
  }
}

function updateCreateOrderTotal() {
  if (!createOrderTotalDisplay) return;
  const subtotal = createOrderItems.reduce((sum, item) => sum + getItemAmount(item), 0);
  const shipping = Number(createShippingCost?.value || 0);
  createOrderTotalDisplay.textContent = formatCurrency(subtotal + shipping);
}

function updateEditOrderTotal() {
  const subtotal = editOrderItems.reduce((sum, item) => sum + getItemAmount(item), 0);
  const shipping = Number(editShippingCost?.value || 0);
  if (editOrderSubtotalDisplay) editOrderSubtotalDisplay.textContent = formatCurrency(subtotal);
  if (editOrderShippingDisplay) editOrderShippingDisplay.textContent = formatCurrency(shipping);
  if (editOrderTotalDisplay) editOrderTotalDisplay.textContent = formatCurrency(subtotal + shipping);
}

function updateEditLineAmount(row, item) {
  const amountEl = row?.querySelector('.po-line-amount');
  if (amountEl) amountEl.textContent = formatCurrency(getItemAmount(item));
}


function formatQuantityWithUnit(item) {
  return `${escapeHtml(item.quantity ?? 0)} ${escapeHtml(item.unit || '')}`.trim();
}

function getDisplayItemAmount(item) {
  return item.total_price !== undefined && item.total_price !== null
    ? Number(item.total_price || 0)
    : getItemAmount(item);
}

function calculateDisplayOrderTotal(order, items = []) {
  const itemTotal = items.reduce((sum, item) => sum + getDisplayItemAmount(item), 0);
  const shipping = Number(order.shipping_cost || 0);
  const storedTotal = Number(order.total_amount || 0);
  if (itemTotal > 0 || shipping > 0) return itemTotal + shipping;
  return storedTotal;
}

function wireItemRows(rootSelector, dataList, mode) {
  document.querySelectorAll(`${rootSelector} .item-product`).forEach(el => el.addEventListener('change', (e) => {
    const index = Number(e.target.dataset.index);
    const product = products.find(item => Number(item.id) === Number(e.target.value));
    dataList[index].product_id = e.target.value ? Number(e.target.value) : null;
    if (product) {
      dataList[index].description = product.name || product.sku || '';
      dataList[index].unit_price = Number(product.price || product.unit_price || 0);
      dataList[index].unit = product.unit || '个';
      dataList[index].sku = product.sku || '';
      delete dataList[index].line_total;
    }
    renderRows(document.querySelector(rootSelector), dataList, mode);
  }));
  document.querySelectorAll(`${rootSelector} .item-description`).forEach(el => el.addEventListener('input', (e) => {
    dataList[Number(e.target.dataset.index)].description = e.target.value;
  }));
  document.querySelectorAll(`${rootSelector} .item-quantity`).forEach(el => el.addEventListener('input', (e) => {
    const index = Number(e.target.dataset.index);
    const item = dataList[index];
    item.quantity = Number(e.target.value || 0);
    if (mode === 'create' && pageType === 'purchase' && item.line_total !== undefined) {
      recalculateUnitPriceFromLineTotal(item);
      const row = e.target.closest('tr');
      const unitPriceInput = row?.querySelector('.item-unit-price');
      if (unitPriceInput) unitPriceInput.value = item.unit_price;
    }
    if (mode === 'create') updateCreateOrderTotal();
    if (mode === 'edit') {
      updateEditLineAmount(e.target.closest('tr'), item);
      updateEditOrderTotal();
    }
  }));
  document.querySelectorAll(`${rootSelector} .item-unit-price`).forEach(el => el.addEventListener('input', (e) => {
    const index = Number(e.target.dataset.index);
    const item = dataList[index];
    item.unit_price = Number(e.target.value || 0);
    if (mode === 'create' && pageType === 'purchase') {
      item.line_total = getItemAmount(item);
      const row = e.target.closest('tr');
      const lineTotalInput = row?.querySelector('.item-line-total');
      if (lineTotalInput) lineTotalInput.value = formatAmountInputValue(item.line_total);
    }
    if (mode === 'create') updateCreateOrderTotal();
    if (mode === 'edit') {
      updateEditLineAmount(e.target.closest('tr'), item);
      updateEditOrderTotal();
    }
  }));
  document.querySelectorAll(`${rootSelector} .item-line-total`).forEach(el => el.addEventListener('input', (e) => {
    const index = Number(e.target.dataset.index);
    const item = dataList[index];
    item.line_total = Number(e.target.value || 0);
    recalculateUnitPriceFromLineTotal(item);
    const row = e.target.closest('tr');
    const unitPriceInput = row?.querySelector('.item-unit-price');
    if (unitPriceInput) unitPriceInput.value = item.unit_price;
    updateCreateOrderTotal();
  }));
}

function renderRows(targetBody, dataList, mode) {
  if (mode === 'create') {
    targetBody.innerHTML = dataList.map((item, index) => {
      const amount = getItemAmount(item);
      const amountCell = pageType === 'purchase'
        ? `<input class="input item-line-total" data-index="${index}" type="number" min="0" step="0.01" value="${escapeHtml(formatAmountInputValue(item.line_total ?? amount))}" title="输入总价后按数量自动计算单价" />`
        : formatCurrency(amount);
      return `
        <tr>
          <td><select class="item-product" data-index="${index}">${productOptions(item.product_id)}</select></td>
          <td><input class="input" type="text" value="${escapeHtml(item.sku || '')}" readonly /></td>
          <td><input class="input item-unit-price" data-index="${index}" type="number" min="0" step="0.0001" value="${escapeHtml(item.unit_price ?? 0)}" /></td>
          <td><input class="input" type="text" value="${escapeHtml(item.unit || '个')}" readonly /></td>
          <td><input class="input item-quantity" data-index="${index}" type="number" min="0" step="0.0001" value="${escapeHtml(item.quantity ?? 0)}" /></td>
          <td class="purchase-order-item-amount">${amountCell}</td>
          <td><button class="remove-${mode}-row btn btn-danger btn-sm" data-index="${index}">删除</button></td>
        </tr>
      `;
    }).join('');
  } else {
    targetBody.innerHTML = dataList.map((item, index) => `
      <tr>
        <td><label class="order-edit-cell-label"><span>产品</span><select class="item-product" data-index="${index}">${productOptions(item.product_id)}</select></label></td>
        <td><label class="order-edit-cell-label"><span>${typeLabel}说明</span><input class="input item-description" data-index="${index}" type="text" value="${escapeHtml(item.description || '')}" placeholder="请输入${typeLabel}明细描述" /></label></td>
        <td><label class="order-edit-cell-label"><span>数量</span><input class="input item-quantity" data-index="${index}" type="number" min="1" value="${escapeHtml(item.quantity ?? 1)}" /></label></td>
        <td><label class="order-edit-cell-label"><span>单位</span><input class="input" type="text" value="${escapeHtml(item.unit || '个')}" readonly /></label></td>
        <td><label class="order-edit-cell-label"><span>${typeLabel}单价</span><input class="input item-unit-price" data-index="${index}" type="number" min="0" step="0.01" value="${escapeHtml(item.unit_price ?? 0)}" /></label></td>
        ${pageType === 'purchase' ? `<td class="po-line-amount">${formatCurrency(getItemAmount(item))}</td>` : ''}
        <td><button class="remove-${mode}-row btn btn-danger btn-sm" data-index="${index}">删除</button></td>
      </tr>
    `).join('');
  }

  wireItemRows(`#${targetBody.id}`, dataList, mode);
  document.querySelectorAll(`.remove-${mode}-row`).forEach(el => el.addEventListener('click', (e) => {
    dataList.splice(Number(e.target.dataset.index), 1);
    if (!dataList.length) dataList.push({ product_id: null, description: '', quantity: mode === 'create' ? 0 : 1, unit_price: 0, unit: '个', sku: '' });
    renderRows(targetBody, dataList, mode);
  }));
  if (mode === 'create') updateCreateOrderTotal();
  if (mode === 'edit') updateEditOrderTotal();
}

function renderCreateRows() {
  renderRows(createItemsBody, createOrderItems, 'create');
}

function addCreateRow() {
  createOrderItems.push({ product_id: null, description: '', quantity: 0, unit_price: 0, unit: '个', sku: '' });
  renderCreateRows();
}

function renderEditRows() {
  renderRows(editItemsBody, editOrderItems, 'edit');
}

function addEditRow() {
  editOrderItems.push({ product_id: null, description: '', quantity: 1, unit_price: 0, unit: '个' });
  renderEditRows();
}

async function loadProducts() {
  const result = await apiGet('/products?page=1&per_page=100');
  products = result.data || [];
  if (!createOrderItems.length) addCreateRow();
  else renderCreateRows();
}

async function loadStats() {
  const result = await apiGet('/orders/stats');
  const stats = result.data || {};
  const totalOrders = pageType === 'sales' ? Number(stats.sales_orders || 0) : Number(stats.purchase_orders || 0);
  const totalAmount = pageType === 'sales' ? Number(stats.sales_amount || 0) : Number(stats.purchase_amount || 0);
  const pending = Number(stats[`${pageType}_pending_orders`] || 0);
  const completed = Number(stats[`${pageType}_completed_orders`] || 0);

  document.getElementById('stat-total-orders').textContent = totalOrders;
  document.getElementById('stat-pending-orders').textContent = pending;
  document.getElementById('stat-completed-orders').textContent = completed;
  document.getElementById('stat-total-amount').textContent = formatCurrency(totalAmount);
}

async function postAction(url) {
  return apiPost(url, undefined, '操作失败');
}

async function deleteOrder(id) {
  // 优先使用 POST 兼容端点，避开部分环境对 DELETE 方法的拦截/挂起。
  try {
    return await apiPost(`/orders/${id}/delete`, undefined, '删除订单失败');
  } catch (error) {
    return apiDelete(`/orders/${id}`, error.message || '删除订单失败');
  }
}

async function handleOrderAction(button) {
  const { action, id } = button.dataset;
  if (!action || !id) return;

  try {
    if (action === 'view') {
      const detail = await apiGet(`/orders/${id}`);
      renderOrderDetail(detail.data);
      return;
    }
    if (action === 'edit') {
      const detail = await apiGet(`/orders/${id}`);
      openEditOrder(detail.data);
      return;
    }
    if (action === 'complete') await postAction(`/orders/${id}/complete`);
    if (action === 'revert') await postAction(`/orders/${id}/revert`);
    if (action === 'cancel') await postAction(`/orders/${id}/cancel`);
    if (action === 'delete') {
      button.disabled = true;
      button.textContent = '删除中...';
      await deleteOrder(id);
      button.closest('tr')?.remove();
      closeOrderModals();
    }
    await loadStats();
    await loadOrders();
    setMessage(messageEl, `${typeLabel}订单操作成功`, 'ok');
  } catch (error) {
    button.disabled = false;
    setMessage(messageEl, error.message, 'error');
  }
}

function renderOrderDetail(order) {
  currentOrder = order;
  const items = Array.isArray(order.items) ? order.items : [];
  const labels = getDetailLabels();
  orderDetailContent.innerHTML = `
    <div class="grid two-col">
      <article class="card"><strong>订单号</strong><p>${escapeHtml(order.order_number || '')}</p></article>
      <article class="card"><strong>${labels.counterpart}</strong><p>${escapeHtml(order.customer_supplier || '')}</p></article>
      <article class="card"><strong>订单类型</strong><p>${typeLabel}订单</p></article>
      <article class="card"><strong>${labels.process}</strong><p>${getStatusText(order.status)}</p></article>
      <article class="card"><strong>订单日期</strong><p>${escapeHtml(order.order_date || '')}</p></article>
      <article class="card"><strong>总金额</strong><p>${formatCurrency(calculateDisplayOrderTotal(order, items))}</p></article>
      <article class="card"><strong>${labels.shipping}</strong><p>${formatCurrency(order.shipping_cost ?? 0)}</p></article>
      <article class="card"><strong>${labels.seller}</strong><p>${escapeHtml(order.seller_name || '-')}</p></article>
      <article class="card"><strong>${labels.sellerPhone}</strong><p>${escapeHtml(order.seller_phone || '-')}</p></article>
      <article class="card"><strong>${labels.sellerAddress}</strong><p>${escapeHtml(order.seller_address || '-')}</p></article>
      <article class="card"><strong>${labels.taxNo}</strong><p>${escapeHtml(order.seller_taxNo || '-')}</p></article>
      <article class="card"><strong>${labels.note}</strong><p>${escapeHtml(order.notes || '-')}</p></article>
    </div>
    <div class="table-wrap" style="margin-top:16px;">
      <table class="table">
        <thead><tr><th>#</th><th>描述</th><th>数量</th><th>单价</th><th>金额</th></tr></thead>
        <tbody>
          ${items.map((it, idx) => `<tr><td>${idx + 1}</td><td>${escapeHtml(it.description || it.product_name || '未命名商品')}</td><td>${formatQuantityWithUnit(it)}</td><td>${formatCurrency(it.unit_price ?? 0)}</td><td>${formatCurrency(getDisplayItemAmount(it))}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
  showOrderModal(orderDetailPanel);
}

function printOrder(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal = items.reduce((sum, it) => sum + getDisplayItemAmount(it), 0);
  const shipping = Number(order.shipping_cost || 0);
  const total = subtotal + shipping;
  const labels = getDetailLabels();
  const html = `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <title>${typeLabel}订单 - ${escapeHtml(order.order_number || '')}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; margin: 0; padding: 32px; color: #111827; }
        .sheet { max-width: 980px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #111827; padding-bottom: 16px; margin-bottom: 24px; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
        .panel { border: 1px solid #d1d5db; border-radius: 12px; padding: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #d1d5db; padding: 10px 12px; text-align: left; }
        th { background: #f3f4f6; }
      </style>
    </head>
    <body>
      <div class="sheet">
        <div class="header">
          <div><h1>${typeLabel}订单</h1><div>${pageType === 'sales' ? 'Sales Order' : 'Purchase Order'}</div></div>
          <div>订单号：${escapeHtml(order.order_number || '')}</div>
        </div>
        <div class="meta-grid">
          <div class="panel">
            <p><strong>${labels.counterpart}：</strong>${escapeHtml(order.customer_supplier || '-')}</p>
            <p><strong>订单日期：</strong>${escapeHtml(order.order_date || '-')}</p>
            <p><strong>${labels.process}：</strong>${getStatusText(order.status)}</p>
          </div>
          <div class="panel">
            <p><strong>${labels.seller}：</strong>${escapeHtml(order.seller_name || '-')}</p>
            <p><strong>${labels.sellerPhone}：</strong>${escapeHtml(order.seller_phone || '-')}</p>
            <p><strong>${labels.sellerAddress}：</strong>${escapeHtml(order.seller_address || '-')}</p>
          </div>
        </div>
        <table>
          <thead><tr><th>#</th><th>描述</th><th>数量</th><th>单价</th><th>金额</th></tr></thead>
          <tbody>
            ${items.map((it, idx) => `<tr><td>${idx + 1}</td><td>${escapeHtml(it.description || it.product_name || '未命名商品')}</td><td>${formatQuantityWithUnit(it)}</td><td>${formatCurrency(it.unit_price ?? 0)}</td><td>${formatCurrency(getDisplayItemAmount(it))}</td></tr>`).join('')}
          </tbody>
        </table>
        <p style="margin-top:16px;"><strong>${labels.shipping}：</strong>${formatCurrency(shipping)} | <strong>总金额：</strong>${formatCurrency(total)}</p>
      </div>
    </body>
    </html>
  `;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

function openEditOrder(order) {
  currentOrder = order;
  if (editOrderNumberDisplay) editOrderNumberDisplay.textContent = order.order_number || 'PO-';
  editCustomerSupplier.value = order.customer_supplier || '';
  editOrderDate.value = order.order_date || '';
  editShippingCost.value = Number(order.shipping_cost || 0);
  editOrderStatus.value = order.status || 'pending';
  editNotes.value = order.notes || '';
  editSellerName.value = order.seller_name || '';
  editSellerPhone.value = order.seller_phone || '';
  editSellerAddress.value = order.seller_address || '';
  editSellerTaxno.value = order.seller_taxNo || '';
  editSellerNote.value = order.seller_note || '';
  editOrderItems = (Array.isArray(order.items) ? order.items : []).map(item => ({
    product_id: item.product_id || null,
    description: item.description || item.product_name || '',
    quantity: Number(item.quantity || 1),
    unit_price: Number(item.unit_price || 0),
    unit: item.unit || '个'
  }));
  if (!editOrderItems.length) editOrderItems = [{ product_id: null, description: '', quantity: 1, unit_price: 0, unit: '个' }];
  renderEditRows();
  updateEditOrderTotal();
  showOrderModal(editOrderPanel);
}

async function saveOrderEdit() {
  try {
    if (!currentOrder?.id) throw new Error(`没有可编辑的${typeLabel}订单`);
    const items = editOrderItems
      .map(item => ({
        product_id: item.product_id,
        description: String(item.description || '').trim(),
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        unit: item.unit || '个'
      }))
      .filter(item => item.description && item.quantity > 0 && item.unit_price >= 0);

    if (!editCustomerSupplier.value.trim() || !editOrderDate.value || !items.length) {
      throw new Error(`请完整填写${typeLabel}订单信息，且至少保留一个有效明细项`);
    }

    await apiPut(`/orders/${currentOrder.id}`, {
      order_type: pageType,
      customer_supplier: editCustomerSupplier.value.trim(),
      order_date: editOrderDate.value,
      shipping_cost: Number(editShippingCost.value || 0),
      status: editOrderStatus.value,
      notes: editNotes.value.trim(),
      seller_name: editSellerName.value.trim(),
      seller_phone: editSellerPhone.value.trim(),
      seller_address: editSellerAddress.value.trim(),
      seller_taxNo: editSellerTaxno.value.trim(),
      seller_note: editSellerNote.value.trim(),
      items
    }, '保存订单失败');

    closeOrderModals();
    setMessage(messageEl, `${typeLabel}订单修改成功`, 'ok');
    const refreshed = await apiGet(`/orders/${currentOrder.id}`);
    currentOrder = refreshed.data;
    await loadStats();
    await loadOrders();
  } catch (error) {
    setMessage(editMessageEl, error.message, 'error');
  }
}

async function createOrder() {
  try {
    const items = createOrderItems
      .map(item => ({
        product_id: item.product_id,
        description: String(item.description || item.sku || '').trim(),
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        total_price: item.line_total !== undefined ? Number(item.line_total || 0) : getItemAmount(item),
        unit: item.unit || '个'
      }))
      .filter(item => item.description && item.quantity > 0 && item.unit_price >= 0);

    if (!createCustomerSupplier.value.trim() || !createOrderDate.value || !items.length) {
      throw new Error(`请填写完整${typeLabel}订单信息，且至少保留一个有效明细项`);
    }

    const manualOrderNumber = createOrderNumber?.value.trim();

    // 手动输入订单号时，先检查是否已存在
    if (manualOrderNumber) {
      const searchResult = await apiGet(`/orders?search=${encodeURIComponent(manualOrderNumber)}&per_page=1`);
      const orders = searchResult.data || [];
      if (orders.some(o => (o.order_number || '').trim().toLowerCase() === manualOrderNumber.trim().toLowerCase())) {
        throw new Error(`订单号「${manualOrderNumber}」已存在，请勿重复提交`);
      }
    }

    await apiPost('/orders', {
      ...(manualOrderNumber ? { order_number: manualOrderNumber } : {}),
      order_type: pageType,
      customer_supplier: createCustomerSupplier.value.trim(),
      order_date: createOrderDate.value,
      shipping_cost: Number(createShippingCost.value || 0),
      notes: createNotes.value.trim(),
      seller_name: createSellerName.value.trim(),
      seller_phone: createSellerPhone.value.trim(),
      seller_address: createSellerAddress.value.trim(),
      seller_taxNo: createSellerTaxno.value.trim(),
      seller_note: createSellerNote.value.trim(),
      items,
      status: 'pending'
    }, '创建订单失败');

    if (createOrderNumber) createOrderNumber.value = '';
    createCustomerSupplier.value = '';
    createShippingCost.value = '0';
    createNotes.value = '';
    createSellerName.value = '';
    createSellerPhone.value = '';
    createSellerAddress.value = '';
    createSellerTaxno.value = '';
    createSellerNote.value = '';
    createOrderItems = [{ product_id: null, description: '', quantity: 0, unit_price: 0, unit: '个', sku: '' }];
    renderCreateRows();
    if (createOrderSection) createOrderSection.style.display = 'none';
    setMessage(createMessageEl, `${typeLabel}订单创建成功`, 'ok');
    await loadStats();
    await loadOrders();
  } catch (error) {
    setMessage(createMessageEl, error.message, 'error');
  }
}

async function loadOrders() {
  try {
    statusEl.textContent = `正在加载${typeLabel}订单...`;
    const params = new URLSearchParams({ page: '1', per_page: '50', order_type: pageType });
    if (supplierSearchInput.value.trim()) params.set('supplier', supplierSearchInput.value.trim());
    if (productSearchInput.value.trim()) params.set('product', productSearchInput.value.trim());
    if (statusSelect.value) params.set('status', statusSelect.value);

    const result = await apiGet(`/orders?${params.toString()}`);
    const orders = result.data || [];

    bodyEl.innerHTML = orders.length ? orders.map(item => `
      <tr>
        <td>${escapeHtml(item.order_number || '')}</td>
        <td>${escapeHtml(item.customer_supplier || '')}</td>
        <td>${escapeHtml(item.order_date || '')}</td>
        <td>${formatCurrency(item.total_amount ?? 0)}</td>
        <td>${getStatusText(item.status)}</td>
        <td>
          ${item.status === 'completed'
            ? `<button type="button" class="action-btn" data-action="revert" data-id="${item.id}">${actionRevertText}</button>`
            : `<button type="button" class="action-btn" data-action="complete" data-id="${item.id}">${actionCompleteText}</button>`}
        </td>
        <td>
          <button type="button" class="action-btn" data-action="view" data-id="${item.id}">${actionViewText}</button>
          <button type="button" class="action-btn" data-action="edit" data-id="${item.id}">${actionEditText}</button>
          <button type="button" class="action-btn" data-action="cancel" data-id="${item.id}">${actionCancelText}</button>
          <button type="button" class="action-btn" data-action="delete" data-id="${item.id}">${actionDeleteText}</button>
        </td>
      </tr>
    `).join('') : `<tr><td colspan="7">暂无${typeLabel}订单数据</td></tr>`;


    statusEl.textContent = `已加载 ${orders.length} 条${typeLabel}订单`;
    setMessage(messageEl, `${typeLabel}订单列表加载成功`, 'ok');
  } catch (error) {
    statusEl.textContent = '加载失败';
    setMessage(messageEl, error.message, 'error');
  }
}

bodyEl?.addEventListener('click', (event) => {
  const button = event.target.closest('.action-btn');
  if (!button || !bodyEl.contains(button)) return;
  handleOrderAction(button);
});
searchButton?.addEventListener('click', loadOrders);
supplierSearchInput?.addEventListener('keydown', (event) => { if (event.key === 'Enter') loadOrders(); });
productSearchInput?.addEventListener('keydown', (event) => { if (event.key === 'Enter') loadOrders(); });
supplierSearchInput?.addEventListener('input', debounce(loadOrders, 300));
productSearchInput?.addEventListener('input', debounce(loadOrders, 300));
statusSelect?.addEventListener('change', loadOrders);
resetButton?.addEventListener('click', () => {
  supplierSearchInput.value = '';
  productSearchInput.value = '';
  statusSelect.value = '';
  loadOrders();
});
openCreateOrderSectionButton?.addEventListener('click', () => {
  if (!createOrderSection) return;
  createOrderSection.style.display = 'block';
});
closeCreateOrderSectionButton?.addEventListener('click', () => {
  if (createOrderSection) createOrderSection.style.display = 'none';
});
cancelCreateOrderSectionButton?.addEventListener('click', () => {
  if (createOrderSection) createOrderSection.style.display = 'none';
});
createOrderSection?.addEventListener('click', (event) => {
  if (event.target === createOrderSection) createOrderSection.style.display = 'none';
});
createShippingCost?.addEventListener('input', updateCreateOrderTotal);
editShippingCost?.addEventListener('input', updateEditOrderTotal);
createOrderButton.addEventListener('click', createOrder);
addOrderItemRowButton.addEventListener('click', addCreateRow);
closeOrderDetailButton.addEventListener('click', closeOrderModals);
orderModalBackdrop.addEventListener('click', closeOrderModals);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeOrderModals(); });
editCurrentOrderButton.addEventListener('click', () => { if (currentOrder) openEditOrder(currentOrder); });
printCurrentOrderButton.addEventListener('click', () => { if (currentOrder) printOrder(currentOrder); });
openPackingListButton.addEventListener('click', () => {
  if (currentOrder?.id) window.open(`./packing-list.html?orderId=${currentOrder.id}`, '_blank');
});
closeEditOrderButton.addEventListener('click', closeOrderModals);
addEditItemRowButton.addEventListener('click', addEditRow);
saveOrderEditButton.addEventListener('click', saveOrderEdit);

createOrderDate.value = new Date().toISOString().slice(0, 10);

await loadProducts();
await loadStats();
await loadOrders();
