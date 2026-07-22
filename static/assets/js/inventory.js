import { apiGet, apiPost, buildMainNav, formatCurrency, escapeHtml, setMessage } from './api.js?v=2026062214';

document.getElementById('main-nav').innerHTML = buildMainNav('inventory');

const statusEl = document.getElementById('page-status');
const messageEl = document.getElementById('page-message');
const bodyEl = document.getElementById('inventory-body');
const searchInput = document.getElementById('search-input');
const categorySelect = document.getElementById('category-select');
const searchButton = document.getElementById('search-button');
const selectAllEl = document.getElementById('select-all');
const selectedCountEl = document.getElementById('selected-count');
const openCheckButton = document.getElementById('open-check-button');
const checkPanelEl = document.getElementById('inventory-check-panel');
const checkBodyEl = document.getElementById('check-body');
const submitCheckButton = document.getElementById('submit-check-button');
const cancelCheckButton = document.getElementById('cancel-check-button');

let products = [];
let selectedIds = new Set();

const inventoryCheckBackdrop = document.createElement('div');
inventoryCheckBackdrop.className = 'inventory-check-backdrop';
document.body.appendChild(inventoryCheckBackdrop);

function openCheckModal() {
  checkPanelEl.style.display = 'block';
  inventoryCheckBackdrop.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closeCheckModal() {
  checkPanelEl.style.display = 'none';
  inventoryCheckBackdrop.style.display = 'none';
  document.body.style.overflow = '';
}

function flattenCategories(categories, level = 0) {
  return categories.flatMap(category => {
    const current = [{ id: category.id, name: `${'　'.repeat(level)}${category.name}` }];
    return current.concat(flattenCategories(category.children || [], level + 1));
  });
}

function getStockStatus(item) {
  const qty = Number(item.current_stock ?? item.stock_quantity ?? item.quantity ?? 0);
  const min = Number(item.min_stock ?? 0);
  if (qty <= 0) return '缺货';
  if (qty <= min) return '低库存';
  return '正常';
}

function updateSelectedCount() {
  selectedCountEl.textContent = `已选 ${selectedIds.size} 项`;
}

function renderInventoryTable(items) {
  bodyEl.innerHTML = items.length ? items.map(item => {
    const id = Number(item.id);
    const qty = Number(item.current_stock ?? item.stock_quantity ?? item.quantity ?? 0);
    const price = Number(item.unit_price ?? item.price ?? 0);
    const checked = selectedIds.has(id) ? 'checked' : '';
    return `
      <tr>
        <td><input type="checkbox" class="row-check" value="${id}" ${checked}></td>
        <td>${escapeHtml(item.sku || '')}</td>
        <td>${escapeHtml(item.name || '')}</td>
        <td>${escapeHtml(item.category_name || '-')}</td>
        <td>${qty} ${escapeHtml(item.unit || '')}</td>
        <td>${escapeHtml(item.min_stock ?? 0)} ${escapeHtml(item.unit || '')}</td>
        <td>${formatCurrency(price)}</td>
        <td>${formatCurrency(qty * price)}</td>
        <td>${getStockStatus(item)}</td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="9">没有找到库存数据</td></tr>';

  document.querySelectorAll('.row-check').forEach(el => {
    el.addEventListener('change', (event) => {
      const id = Number(event.target.value);
      if (event.target.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      updateSelectedCount();
    });
  });
}

async function loadCategories() {
  const result = await apiGet('/products/categories');
  const categories = flattenCategories(result.data.categories || []);
  categorySelect.innerHTML = '<option value="">全部分类</option>' + categories
    .map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`)
    .join('');
}

async function loadStats() {
  const result = await apiGet('/dashboard');
  const summary = result.data.summary;
  document.getElementById('stat-total-products').textContent = summary.total_products ?? 0;
  document.getElementById('stat-total-value').textContent = formatCurrency(summary.total_inventory_value ?? 0);
  document.getElementById('stat-today-incoming').textContent = summary.today_incoming ?? 0;
  document.getElementById('stat-today-outgoing').textContent = summary.today_outgoing ?? 0;
}

async function loadProducts() {
  statusEl.textContent = '正在加载库存...';
  const params = new URLSearchParams({ page: '1', per_page: '100' });
  if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
  if (categorySelect.value) params.set('category_id', categorySelect.value);

  const result = await apiGet(`/products?${params.toString()}`);
  products = result.data || [];
  renderInventoryTable(products);
  statusEl.textContent = `已加载 ${products.length} 条库存记录`;
  updateSelectedCount();
}

function buildCheckPanel() {
  const selectedProducts = products.filter(item => selectedIds.has(Number(item.id)));
  if (!selectedProducts.length) {
    setMessage(messageEl, '请先选择至少一个产品再盘点', 'error');
    return;
  }

  checkBodyEl.innerHTML = selectedProducts.map(item => {
    const qty = Number(item.current_stock ?? item.stock_quantity ?? item.quantity ?? 0);
    return `
      <tr data-id="${item.id}" data-system="${qty}">
        <td>${escapeHtml(item.name || '')}</td>
        <td>${qty} ${escapeHtml(item.unit || '')}</td>
        <td><input class="input actual-input" type="number" min="0" value="${qty}" /> ${escapeHtml(item.unit || '')}</td>
        <td class="difference-cell">0</td>
      </tr>
    `;
  }).join('');

  openCheckModal();

  document.querySelectorAll('.actual-input').forEach(input => {
    input.addEventListener('input', (event) => {
      const row = event.target.closest('tr');
      const systemQty = Number(row.dataset.system);
      const actualQty = Number(event.target.value || 0);
      row.querySelector('.difference-cell').textContent = actualQty - systemQty;
    });
  });
}

async function submitInventoryCheck() {
  try {
    const items = Array.from(checkBodyEl.querySelectorAll('tr')).map(row => {
      const productId = Number(row.dataset.id);
      const systemQty = Number(row.dataset.system);
      const actualQty = Number(row.querySelector('.actual-input').value || 0);
      return {
        product_id: productId,
        system_quantity: systemQty,
        actual_quantity: actualQty,
        difference: actualQty - systemQty
      };
    });

    await apiPost('/inventory/check', { items }, '库存盘点失败');

    setMessage(messageEl, '库存盘点提交成功', 'ok');
    closeCheckModal();
    await loadStats();
    await loadProducts();
  } catch (error) {
    setMessage(messageEl, error.message, 'error');
  }
}

searchButton.addEventListener('click', loadProducts);
searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') loadProducts(); });
selectAllEl.addEventListener('change', (event) => {
  if (event.target.checked) products.forEach(item => selectedIds.add(Number(item.id)));
  else selectedIds.clear();
  renderInventoryTable(products);
  updateSelectedCount();
});
openCheckButton.addEventListener('click', buildCheckPanel);
submitCheckButton.addEventListener('click', submitInventoryCheck);
cancelCheckButton.addEventListener('click', closeCheckModal);
inventoryCheckBackdrop.addEventListener('click', closeCheckModal);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeCheckModal(); });

await loadCategories();
await loadStats();
await loadProducts();
setMessage(messageEl, '库存页面已就绪', 'ok');
