import { apiGet, apiPost, apiPut, apiDelete, buildMainNav, formatCurrency, escapeHtml, setMessage } from './api.js?v=2026062214';

document.getElementById('main-nav').innerHTML = buildMainNav('products');

const statusEl = document.getElementById('page-status');
const messageEl = document.getElementById('page-message');
const createMessageEl = document.getElementById('create-product-message');
const editMessageEl = document.getElementById('edit-product-message');
const bodyEl = document.getElementById('products-body');
const searchInput = document.getElementById('search-input');
const categorySelect = document.getElementById('category-select');
const searchButton = document.getElementById('search-button');
const exportProductsButton = document.getElementById('export-products-button');
const openCreateProductModalButton = document.getElementById('open-create-product-modal');
const createModal = document.getElementById('create-product-modal');
const closeCreateProductModalButton = document.getElementById('close-create-product-modal');
const createProductButton = document.getElementById('create-product-button');
const productsSummaryEl = document.getElementById('products-summary');
const createSku = document.getElementById('create-sku');
const createName = document.getElementById('create-name');
const createCategorySelect = document.getElementById('create-category-select');
const createQuantity = document.getElementById('create-quantity');
const createMinStock = document.getElementById('create-min-stock');
const createPrice = document.getElementById('create-price');
const createUnit = document.getElementById('create-unit');
const createDescription = document.getElementById('create-description');
const editModal = document.getElementById('edit-product-modal');
const closeEditModalButton = document.getElementById('close-edit-product-modal');
const cancelEditProductButton = document.getElementById('cancel-edit-product-button');
const editSku = document.getElementById('edit-sku');
const editName = document.getElementById('edit-name');
const editProductType = document.getElementById('edit-product-type');
const editCategorySelect = document.getElementById('edit-category-select');
const editQuantity = document.getElementById('edit-quantity');
const editMinStock = document.getElementById('edit-min-stock');
const editPrice = document.getElementById('edit-price');
const editUnit = document.getElementById('edit-unit');
const editDescription = document.getElementById('edit-description');
const saveProductButton = document.getElementById('save-product-button');

let categories = [];
let categoryPathMap = new Map();
let currentEditingProduct = null;

function formatProductType(value) {
  return value === 'raw_material' ? '原材料' : '成品';
}

function flattenCategories(items, level = 0, parentPath = '') {
  return items.flatMap(category => {
    const path = parentPath ? `${parentPath} > ${category.name}` : category.name;
    const current = [{ id: category.id, name: `${'　'.repeat(level)}${category.name}`, path }];
    const children = flattenCategories(category.children || [], level + 1, path);
    return current.concat(children);
  });
}

function getCategoryPath(categoryId, fallback = '-') {
  return categoryPathMap.get(String(categoryId)) || fallback || '-';
}

function getProductStatus(item) {
  const quantity = Number(item.quantity ?? item.current_stock ?? 0);
  const minStock = Number(item.min_stock ?? 0);
  if (quantity === 0) return { label: '缺货', className: 'danger' };
  if (minStock > 0 && quantity <= minStock) return { label: '低库存', className: 'warning' };
  return { label: '正常', className: 'ok' };
}

function renderCategoryOptions(selectEl, includeBlankLabel) {
  selectEl.innerHTML = `<option value="">${includeBlankLabel}</option>` + categories
    .map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`)
    .join('');
}

async function loadCategories() {
  const result = await apiGet('/products/categories');
  categories = flattenCategories(result.data.categories || []);
  categoryPathMap = new Map(categories.map(item => [String(item.id), item.path]));
  renderCategoryOptions(categorySelect, '所有分类');
  renderCategoryOptions(createCategorySelect, '选择分类');
  renderCategoryOptions(editCategorySelect, '选择分类');
}

function inferProductType(categoryId, fallback = 'finished') {
  const path = getCategoryPath(categoryId, '').trim();
  const rootName = path.split(' > ')[0] || '';
  if (!path) return fallback;
  if (rootName.includes('成品')) return 'finished';
  if (rootName.includes('原料') || rootName.includes('原材料') || rootName.includes('包装') || rootName.includes('辅材')) return 'raw_material';
  return fallback;
}

function getProductPayload(mode = 'create') {
  const prefix = mode === 'edit' ? 'edit' : 'create';
  const categoryId = prefix === 'edit' ? editCategorySelect.value : createCategorySelect.value;
  const source = {
    sku: prefix === 'edit' ? editSku.value : createSku.value,
    name: prefix === 'edit' ? editName.value : createName.value,
    product_type: inferProductType(categoryId, prefix === 'edit' ? (editProductType.value || 'finished') : 'finished'),
    category_id: categoryId,
    quantity: prefix === 'edit' ? editQuantity.value : createQuantity.value,
    min_stock: prefix === 'edit' ? editMinStock.value : createMinStock.value,
    price: prefix === 'edit' ? editPrice.value : createPrice.value,
    unit: prefix === 'edit' ? editUnit.value : createUnit.value,
    description: prefix === 'edit' ? editDescription.value : createDescription.value
  };

  if (!source.sku.trim() || !source.name.trim()) {
    throw new Error('请至少填写 SKU 和产品名称');
  }

  return {
    sku: source.sku.trim(),
    name: source.name.trim(),
    product_type: source.product_type,
    category_id: source.category_id ? Number(source.category_id) : null,
    quantity: Number(source.quantity || 0),
    min_stock: source.min_stock === '' ? null : Number(source.min_stock || 0),
    price: Number(source.price || 0),
    unit: String(source.unit || '个').trim() || '个',
    description: String(source.description || '').trim()
  };
}

function openCreateModal() {
  createModal.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closeCreateModal() {
  createModal.style.display = 'none';
  document.body.style.overflow = '';
}

function resetCreateForm() {
  createSku.value = '';
  createName.value = '';
  createCategorySelect.value = '';
  createQuantity.value = '0';
  createMinStock.value = '0';
  createPrice.value = '0';
  createUnit.value = '个';
  createDescription.value = '';
}

function openEditModal(product) {
  currentEditingProduct = product;
  editSku.value = product.sku || '';
  editName.value = product.name || '';
  editProductType.value = product.product_type || 'finished';
  editCategorySelect.value = product.category_id || '';
  editQuantity.value = product.quantity ?? 0;
  editMinStock.value = product.min_stock ?? 0;
  editPrice.value = product.price ?? 0;
  editUnit.value = product.unit || '个';
  editDescription.value = product.description || '';
  editModal.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closeEditModal() {
  editModal.style.display = 'none';
  document.body.style.overflow = '';
  currentEditingProduct = null;
}

async function createProduct() {
  try {
    const payload = getProductPayload('create');
    await apiPost('/products', payload, '创建产品失败');
    resetCreateForm();
    closeCreateModal();
    setMessage(createMessageEl, '产品创建成功', 'ok');
    await loadProducts();
  } catch (error) {
    setMessage(createMessageEl, error.message, 'error');
  }
}

async function saveProduct() {
  try {
    if (!currentEditingProduct?.id) throw new Error('没有可编辑的产品');
    const payload = getProductPayload('edit');
    await apiPut(`/products/${currentEditingProduct.id}`, payload, '保存产品失败');
    closeEditModal();
    setMessage(editMessageEl, '产品保存成功', 'ok');
    await loadProducts();
  } catch (error) {
    setMessage(editMessageEl, error.message, 'error');
  }
}

async function deleteProduct(product) {
  if (!window.confirm(`确定删除产品「${product.name || product.sku}」吗？`)) return;

  try {
    await apiDelete(`/products/${product.id}`, '删除产品失败');
    setMessage(messageEl, '产品删除成功', 'ok');
    await loadProducts();
  } catch (error) {
    setMessage(messageEl, error.message, 'error');
  }
}

async function loadProducts() {
  try {
    statusEl.textContent = '正在加载产品...';
    const params = new URLSearchParams();
    if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
    if (categorySelect.value) params.set('category_id', categorySelect.value);
    params.set('page', '1');
    params.set('per_page', '100');

    const result = await apiGet(`/products?${params.toString()}`);
    let products = result.data || [];

    const lowStockCount = products.filter(item => Number(item.quantity ?? 0) > 0 && Number(item.min_stock ?? 0) > 0 && Number(item.quantity ?? 0) <= Number(item.min_stock ?? 0)).length;
    const zeroStockCount = products.filter(item => Number(item.quantity ?? 0) === 0).length;
    document.getElementById('stat-total-products').textContent = products.length;
    document.getElementById('stat-low-stock').textContent = lowStockCount;
    document.getElementById('stat-zero-stock').textContent = zeroStockCount;
    document.getElementById('stat-total-categories').textContent = categories.length;
    productsSummaryEl.textContent = `共 ${products.length} 个产品`;

    bodyEl.innerHTML = products.length ? products.map(item => {
      const quantity = Number(item.current_stock ?? item.quantity ?? 0);
      const price = Number(item.unit_price ?? item.price ?? 0);
      const status = getProductStatus(item);
      return `
        <tr>
          <td>${escapeHtml(item.sku || '')}</td>
          <td>${escapeHtml(item.name || '')}</td>
          <td>${escapeHtml(getCategoryPath(item.category_id, item.category_name))}</td>
          <td>${escapeHtml(quantity)}${escapeHtml(item.unit || '')}</td>
          <td>${formatCurrency(price)}</td>
          <td>${formatCurrency(quantity * price)}</td>
          <td><span class="product-status-badge ${status.className}">${escapeHtml(status.label)}</span></td>
          <td>
            <div class="products-row-actions">
              <button class="edit-product-btn btn btn-secondary btn-sm" data-id="${item.id}">编辑</button>
              <button class="delete-product-btn btn btn-danger btn-sm" data-id="${item.id}">删除</button>
            </div>
          </td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="8">没有找到产品</td></tr>';

    document.querySelectorAll('.edit-product-btn').forEach(button => {
      button.addEventListener('click', () => {
        const product = products.find(item => Number(item.id) === Number(button.dataset.id));
        if (product) openEditModal(product);
      });
    });

    document.querySelectorAll('.delete-product-btn').forEach(button => {
      button.addEventListener('click', async () => {
        const product = products.find(item => Number(item.id) === Number(button.dataset.id));
        if (product) await deleteProduct(product);
      });
    });

    statusEl.textContent = `已加载 ${products.length} 条产品`;
    setMessage(messageEl, '产品列表加载成功', 'ok');
  } catch (error) {
    statusEl.textContent = '加载失败';
    setMessage(messageEl, error.message, 'error');
  }
}

searchButton?.addEventListener('click', loadProducts);
searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') loadProducts();
});
categorySelect.addEventListener('change', loadProducts);
exportProductsButton?.addEventListener('click', () => {
  setMessage(messageEl, '导出功能稍后补充，当前可先使用筛选和编辑功能。', '');
});
openCreateProductModalButton.addEventListener('click', openCreateModal);
createProductButton.addEventListener('click', createProduct);
saveProductButton.addEventListener('click', saveProduct);
closeCreateProductModalButton.addEventListener('click', closeCreateModal);
closeEditModalButton.addEventListener('click', closeEditModal);
cancelEditProductButton.addEventListener('click', closeEditModal);
createModal.addEventListener('click', (event) => {
  if (event.target === createModal) closeCreateModal();
});
editModal.addEventListener('click', (event) => {
  if (event.target === editModal) closeEditModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && createModal.style.display !== 'none') closeCreateModal();
  if (event.key === 'Escape' && editModal.style.display !== 'none') closeEditModal();
});

await loadCategories();
await loadProducts();
