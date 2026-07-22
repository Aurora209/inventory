import { apiGet, buildMainNav, formatCurrency, escapeHtml, setMessage } from './api.js?v=2026062214';

document.getElementById('main-nav').innerHTML = buildMainNav('dashboard');

const DEFAULT_LIST_ITEMS = 5;

const statusEl = document.getElementById('page-status');
const messageEl = document.getElementById('page-message');
const summaryEl = document.getElementById('summary-cards');
const alertsEl = document.getElementById('alerts-body');
const transactionsEl = document.getElementById('transactions-body');
const alertCategoryFilterEl = document.getElementById('alert-category-filter');
const transactionCategoryFilterEl = document.getElementById('transaction-category-filter');
const transactionFilterEl = document.getElementById('transaction-type-filter');
const alertLimitFilterEl = document.getElementById('alert-limit-filter');
const transactionLimitFilterEl = document.getElementById('transaction-limit-filter');

function getListLimit(selectEl) {
  const value = Number(selectEl?.value || DEFAULT_LIST_ITEMS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_LIST_ITEMS;
}

function getTransactionMeta(type) {
  const normalized = String(type || '').toLowerCase();
  const isIn = ['in', 'incoming', '入库', 'purchase', 'purchase_in'].some(keyword => normalized.includes(keyword));
  const isOut = ['out', 'outgoing', '出库', 'sale', 'sales_out'].some(keyword => normalized.includes(keyword));

  if (isIn) return { label: '入库', className: 'in' };
  if (isOut) return { label: '出库', className: 'out' };
  return { label: type || '交易', className: 'other' };
}

function flattenCategories(items, level = 0) {
  return items.flatMap(category => {
    const current = [{ id: category.id, name: `${'　'.repeat(level)}${category.name}` }];
    return current.concat(flattenCategories(category.children || [], level + 1));
  });
}

function renderCategoryOptions(selectEl, categories) {
  if (!selectEl) return;
  const currentValue = selectEl.value;
  selectEl.innerHTML = '<option value="">全部分类</option>' + categories
    .map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`)
    .join('');
  selectEl.value = currentValue;
}

function withQuery(path, params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function renderAlerts(alerts) {
  alertsEl.innerHTML = alerts.length ? alerts.map(item => `
    <article class="warning-item">
      <strong>${escapeHtml(item.product_name)}</strong>
      <div class="warning-meta">
        <span>SKU: ${escapeHtml(item.sku)}</span>
        ${item.category_name ? `<span>分类: ${escapeHtml(item.category_name)}</span>` : ''}
        <span>当前库存: ${escapeHtml(item.current_quantity)} ${escapeHtml(item.unit || '')}</span>
        <span>最低库存: ${escapeHtml(item.min_stock)} ${escapeHtml(item.unit || '')}</span>
        <span class="warning-badge">${item.status === 'zero' ? '库存为零' : '低库存'}</span>
      </div>
    </article>
  `).join('') : '<div class="empty-state compact">暂无库存预警</div>';
}

function renderTransactions(transactions) {
  transactionsEl.innerHTML = transactions.length ? transactions.map(item => {
    const meta = getTransactionMeta(item.transaction_type);
    return `
      <article class="transaction-item">
        <strong>${escapeHtml(item.product_name)}</strong>
        <div class="transaction-meta">
          <span class="transaction-badge ${meta.className}">${escapeHtml(meta.label)}</span>
          <span class="transaction-quantity">${escapeHtml(item.quantity)} ${escapeHtml(item.unit || '')}</span>
          ${item.category_name ? `<span>${escapeHtml(item.category_name)}</span>` : ''}
          <span>${escapeHtml(item.transaction_date)}</span>
        </div>
      </article>
    `;
  }).join('') : '<div class="empty-state compact">暂无交易记录</div>';
}

async function loadCategories() {
  const result = await apiGet('/products/categories');
  const tree = result.data.categories || [];
  const categories = flattenCategories(tree);
  renderCategoryOptions(alertCategoryFilterEl, categories);
  renderCategoryOptions(transactionCategoryFilterEl, categories);
}

async function loadSummary() {
  const summaryRes = await apiGet('/dashboard');
  const summary = summaryRes.data.summary;
  const cards = [
    ['💰', '库存总值', formatCurrency(summary.total_inventory_value)],
    ['📥', '今日入库', summary.today_incoming],
    ['📤', '今日出库', summary.today_outgoing],
    ['⚠️', '库存预警', summary.low_stock_count]
  ];

  summaryEl.innerHTML = cards.map(([icon, label, value]) => `
    <article class="dashboard-stat-card">
      <div class="stat-icon">${icon}</div>
      <div>
        <p class="stat-value">${escapeHtml(value)}</p>
        <p class="stat-label">${escapeHtml(label)}</p>
      </div>
    </article>
  `).join('');
}

async function loadAlerts() {
  const result = await apiGet(withQuery('/dashboard/alerts', {
    category_id: alertCategoryFilterEl.value,
    limit: getListLimit(alertLimitFilterEl)
  }));
  renderAlerts(result.data.alerts || []);
}

async function loadTransactions() {
  const type = transactionFilterEl.value === 'all' ? '' : transactionFilterEl.value;
  const transactionsRes = await apiGet(withQuery('/dashboard/transactions', {
    category_id: transactionCategoryFilterEl.value,
    type,
    limit: getListLimit(transactionLimitFilterEl)
  }));
  renderTransactions(transactionsRes.data.transactions || []);
}

async function loadDashboard() {
  try {
    statusEl.textContent = '正在加载数据...';
    await loadCategories();
    await Promise.all([loadSummary(), loadAlerts(), loadTransactions()]);
    statusEl.textContent = '加载完成';
    setMessage(messageEl, '仪表板数据已更新，预警和交易默认显示 5 条，可按需调整显示条数', 'ok');
  } catch (error) {
    statusEl.textContent = '加载失败';
    setMessage(messageEl, error.message, 'error');
  }
}

async function reloadAlerts() {
  try {
    statusEl.textContent = '正在筛选预警...';
    await loadAlerts();
    statusEl.textContent = '加载完成';
  } catch (error) {
    statusEl.textContent = '加载失败';
    setMessage(messageEl, error.message, 'error');
  }
}

async function reloadTransactions() {
  try {
    statusEl.textContent = '正在筛选交易...';
    await loadTransactions();
    statusEl.textContent = '加载完成';
  } catch (error) {
    statusEl.textContent = '加载失败';
    setMessage(messageEl, error.message, 'error');
  }
}

alertCategoryFilterEl?.addEventListener('change', reloadAlerts);
alertCategoryFilterEl?.addEventListener('input', reloadAlerts);
alertLimitFilterEl?.addEventListener('change', reloadAlerts);
alertLimitFilterEl?.addEventListener('input', reloadAlerts);
transactionCategoryFilterEl?.addEventListener('change', reloadTransactions);
transactionCategoryFilterEl?.addEventListener('input', reloadTransactions);
transactionFilterEl?.addEventListener('change', reloadTransactions);
transactionFilterEl?.addEventListener('input', reloadTransactions);
transactionLimitFilterEl?.addEventListener('change', reloadTransactions);
transactionLimitFilterEl?.addEventListener('input', reloadTransactions);

loadDashboard();
