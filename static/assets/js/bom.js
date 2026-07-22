import { apiGet, apiPost, apiDelete, fetchJsonByUrl, buildMainNav, formatCurrency, escapeHtml, setMessage } from './api.js?v=2026062214';
import { API_ORIGIN } from './config.js?v=2026051301';

document.getElementById('main-nav').innerHTML = buildMainNav('bom');

const statusEl = document.getElementById('page-status');
const messageEl = document.getElementById('page-message');
const summaryEl = document.getElementById('bom-summary');
const searchInput = document.getElementById('search-input');
const categoryFilterSelect = document.getElementById('category-filter-select');
const bomBodyEl = document.getElementById('bom-body');
const addBomModalEl = document.getElementById('add-bom-modal');
const closeAddBomModalButton = document.getElementById('close-add-bom-modal');
const cancelAddBomButton = document.getElementById('cancel-add-bom-button');
const saveAddBomButton = document.getElementById('save-add-bom-button');
const addBomProductSelect = document.getElementById('add-bom-product-select');
const addBomProductName = document.getElementById('add-bom-product-name');
const addBomProductSku = document.getElementById('add-bom-product-sku');
const addBomProductQuantity = document.getElementById('add-bom-product-quantity');
const addBomProductUnit = document.getElementById('add-bom-product-unit');
const addBomUsageCount = document.getElementById('add-bom-usage-count');
const addBomDescription = document.getElementById('add-bom-description');
const addBomMaterialCategorySelect = document.getElementById('add-bom-material-category-select');
const addBomMaterialSelect = document.getElementById('add-bom-material-select');
const addBomMaterialName = document.getElementById('add-bom-material-name');
const addBomMaterialSku = document.getElementById('add-bom-material-sku');
const addBomMaterialUnit = document.getElementById('add-bom-material-unit');
const addBomMaterialQuantity = document.getElementById('add-bom-material-quantity');
const addBomMaterialPrice = document.getElementById('add-bom-material-price');
const addBomTempItemButton = document.getElementById('add-bom-temp-item-button');
const addBomItemsBody = document.getElementById('add-bom-items-body');
const addBomTotalCost = document.getElementById('add-bom-total-cost');
const addBomMessageEl = document.getElementById('add-bom-message');
const detailSectionEl = document.getElementById('detail-section');
const detailModalContentEl = detailSectionEl.querySelector('.modal-content');
const detailTitleEl = document.getElementById('detail-title');
const detailSubtitleEl = document.getElementById('detail-subtitle');
const detailBodyEl = document.getElementById('detail-body');
const detailReadonlyBannerEl = document.getElementById('detail-readonly-banner');
const detailEditorToolbarEl = document.getElementById('detail-editor-toolbar');
const detailActionHeadEl = document.getElementById('detail-action-head');
const closeDetailButton = document.getElementById('close-detail-button');
const productSelect = document.getElementById('product-select');
const detailMaterialCategorySelect = document.getElementById('detail-material-category-select');
const materialSelect = document.getElementById('material-select');
const quantityInput = document.getElementById('quantity-input');
const unitInput = document.getElementById('unit-input');
const addItemButton = document.getElementById('add-item-button');
const addBomButton = document.getElementById('add-bom-button');
const bomReportButton = document.getElementById('bom-report-button');

let bomProducts = [];
let allProducts = [];
let categories = [];
let categoryPathMap = new Map();
let categoryChildrenMap = new Map();
let selectedProduct = null;
let detailMode = 'view';
let newBomItems = [];
let bomMaterialCandidates = [];
let selectedBomItemIds = new Set();
let currentDetailItems = [];
let currentDetailRawItems = [];

function formatDate(value) {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 10);
}

function normalizeBomItem(item) {
  return {
    id: item.id,
    materialId: item.material_id ?? item.materialId ?? 0,
    materialName: item.material_name || item.materialName || '',
    materialSku: item.material_sku || item.materialSku || '',
    materialCategoryId: item.material_category_id ?? item.materialCategoryId ?? null,
    materialCategoryName: item.material_category_name || item.materialCategoryName || '',
    materialCategoryParentId: item.material_category_parent_id ?? item.materialCategoryParentId ?? null,
    materialProductType: item.material_product_type || item.materialProductType || '',
    quantityRequired: item.quantity_required ?? item.quantityRequired ?? 0,
    currentStock: item.current_stock ?? item.currentStock ?? item.material_quantity ?? 0,
    materialPrice: item.material_price ?? item.materialPrice ?? 0,
    itemCost: item.item_cost ?? item.itemCost ?? 0,
    unit: item.unit || '',
    __groupKey: item.__groupKey
  };
}

function flattenCategories(items, level = 0, parentPath = '') {
  return items.flatMap(category => {
    const path = parentPath ? `${parentPath} > ${category.name}` : category.name;
    const current = [{ id: category.id, name: `${'　'.repeat(level)}${category.name}`, path }];
    const children = flattenCategories(category.children || [], level + 1, path);
    return current.concat(children);
  });
}

function buildCategoryChildrenMap(items) {
  const map = new Map();
  function visit(category) {
    const id = String(category.id);
    const children = category.children || [];
    map.set(id, children.map(child => String(child.id)));
    children.forEach(visit);
  }
  items.forEach(visit);
  return map;
}

function getDescendantCategoryIds(categoryId) {
  if (!categoryId) return null;
  const ids = new Set();
  const stack = [String(categoryId)];
  while (stack.length) {
    const current = stack.pop();
    if (ids.has(current)) continue;
    ids.add(current);
    (categoryChildrenMap.get(current) || []).forEach(childId => stack.push(childId));
  }
  return ids;
}

function getCategoryPath(item) {
  return categoryPathMap.get(String(item.category_id || '')) || item.category_name || '未分类';
}

function getMaterialCategoryPath(item) {
  if (item.materialCategoryId) return categoryPathMap.get(String(item.materialCategoryId)) || item.materialCategoryName || '';
  if (item.category_id) return categoryPathMap.get(String(item.category_id)) || item.category_name || '';
  return item.materialCategoryName || item.category_name || '';
}

function classifyMaterial(item = {}) {
  const product = allProducts.find(productItem => Number(productItem.id) === Number(item.materialId || item.id));
  const categoryPath = getMaterialCategoryPath(item) || (product ? getCategoryPath(product) : '');
  const text = [categoryPath, item.materialCategoryName, product?.name, product?.sku, item.materialName, item.materialSku]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/纸箱|标签|包装|瓶|盖|袋|盒|carton|box|label|packaging/.test(text)) {
    return { key: 'packaging', label: '包装材料', className: 'packaging' };
  }
  if (/辅材|辅料|配件|耗材|胶带|说明书|贴纸|赠品|accessory|aux/.test(text)) {
    return { key: 'auxiliary', label: '辅材', className: 'auxiliary' };
  }
  return { key: 'main', label: '主原材料', className: 'main' };
}

function getMaterialSortMeta(item = {}) {
  const product = allProducts.find(productItem => Number(productItem.id) === Number(item.materialId || item.id));
  const categoryPath = getMaterialCategoryPath(item) || (product ? getCategoryPath(product) : '');
  const text = [categoryPath, item.materialCategoryName, product?.name, product?.sku, item.materialName, item.materialSku]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const isLabel = /标签|label/.test(text);
  const isPrintedLabel = /印刷标签|printed label/.test(text);
  const isPrintedTag = /打印标签|print label/.test(text);
  const isBlankLabel = /空白标签|白色标签|blank label/.test(text);
  const isPackaging = !isLabel && /纸箱|包装|瓶|盖|袋|盒|carton|box|packaging/.test(text);
  const group = isLabel ? 'label' : (isPackaging ? 'packaging' : 'raw');
  const groupRank = group === 'raw' ? 0 : group === 'packaging' ? 1 : 2;
  let labelRank = 0;
  if (isLabel) {
    if (isPrintedLabel) labelRank = 0;
    else if (isPrintedTag) labelRank = 1;
    else if (isBlankLabel) labelRank = 2;
    else labelRank = 3;
  }
  return { group, groupRank, labelRank, text };
}

function sortBomDisplayItems(items = []) {
  return [...items].sort((a, b) => {
    const metaA = getMaterialSortMeta(a);
    const metaB = getMaterialSortMeta(b);
    if (metaA.groupRank !== metaB.groupRank) return metaA.groupRank - metaB.groupRank;

    if (metaA.group === 'raw') {
      const quantityDiff = Number(b.quantityRequired || 0) - Number(a.quantityRequired || 0);
      if (Math.abs(quantityDiff) > 0.0001) return quantityDiff;
    }

    if (metaA.group === 'label' && metaA.labelRank !== metaB.labelRank) {
      return metaA.labelRank - metaB.labelRank;
    }

    const categoryCompare = getMaterialCategoryLabel(a).localeCompare(getMaterialCategoryLabel(b), 'zh-CN');
    if (categoryCompare !== 0) return categoryCompare;
    const nameCompare = String(a.materialName || a.name || '').localeCompare(String(b.materialName || b.name || ''), 'zh-CN');
    if (nameCompare !== 0) return nameCompare;
    return String(a.materialSku || a.sku || '').localeCompare(String(b.materialSku || b.sku || ''), 'zh-CN');
  });
}

function getProductCategoryLabel(item = {}) {
  return getCategoryPath(item) || item.category_name || '未分类';
}

function getMaterialCategoryLabel(item = {}) {
  return getMaterialCategoryPath(item) || '未分类';
}

function renderMaterialCategoryBadge(item) {
  return `<span class="bom-category-badge">${escapeHtml(getMaterialCategoryLabel(item))}</span>`;
}

function summarizeMaterialCategories(items = []) {
  const counts = new Map();
  items.forEach(rawItem => {
    const item = normalizeBomItem(rawItem);
    const label = getMaterialCategoryLabel(item);
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  const parts = Array.from(counts.entries()).slice(0, 3).map(([label, count]) => `${label} ${count}`);
  if (counts.size > 3) parts.push(`等 ${counts.size} 类`);
  return parts.join(' / ') || '未分类';
}

function getProductMaterialKind(item) {
  return classifyMaterial({
    id: item.id,
    materialId: item.id,
    category_id: item.category_id,
    category_name: item.category_name,
    materialName: item.name,
    materialSku: item.sku
  });
}

function isBomMaterialCandidate(item) {
  if (!item || item.is_composite) return false;
  if (item.product_type === 'raw_material') return true;
  const materialKind = getProductMaterialKind(item);
  return item.product_type === 'finished' && materialKind.key !== 'main';
}

function isFinishedProductCandidate(item) {
  if (item.product_type !== 'finished') return false;
  return getProductMaterialKind(item).key === 'main';
}

function getMaterialCandidatesByCategory(categoryId) {
  if (!categoryId) return [];
  const categoryIds = getDescendantCategoryIds(categoryId) || new Set([String(categoryId)]);
  return bomMaterialCandidates.filter(item => categoryIds.has(String(item.category_id || '')));
}

function renderMaterialProductOptions(selectEl, categoryId, emptyText) {
  if (!selectEl) return;
  const materials = getMaterialCandidatesByCategory(categoryId);
  const placeholder = categoryId ? emptyText : '请先选择分类';
  selectEl.innerHTML = `<option value="">${placeholder}</option>${materials.map(item => `<option value="${item.id}">${escapeHtml(item.name)} (${escapeHtml(item.sku || '')})</option>`).join('')}`;
}

function renderMaterialCategorySelects() {
  const options = categories
    .filter(item => {
      const descendantIds = getDescendantCategoryIds(item.id) || new Set([String(item.id)]);
      return Array.from(descendantIds).some(id => bomMaterialCandidates.some(product => String(product.category_id || '') === String(id)));
    })
    .map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`)
    .join('');

  if (addBomMaterialCategorySelect) addBomMaterialCategorySelect.innerHTML = `<option value="">请选择分类</option>${options}`;
  if (detailMaterialCategorySelect) detailMaterialCategorySelect.innerHTML = `<option value="">选择物料分类</option>${options}`;
  renderMaterialProductOptions(addBomMaterialSelect, addBomMaterialCategorySelect?.value, '请选择物料');
  renderMaterialProductOptions(materialSelect, detailMaterialCategorySelect?.value, '选择物料');
}

function renderCategoryOptions() {
  categoryFilterSelect.innerHTML = '<option value="">所有分类</option>' + categories
    .map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`)
    .join('');

  const finishedProducts = allProducts.filter(isFinishedProductCandidate);
  bomMaterialCandidates = allProducts.filter(isBomMaterialCandidate);
  const configuredBomProductIds = new Set(bomProducts.map(item => Number(item.id)));
  const availableProducts = finishedProducts.filter(item => !configuredBomProductIds.has(Number(item.id)));
  productSelect.innerHTML = `<option value="">选择成品</option>${finishedProducts.map(item => `<option value="${item.id}">${escapeHtml(item.name)} (${escapeHtml(item.sku || '')})</option>`).join('')}`;
  addBomProductSelect.innerHTML = `<option value="">请选择产品</option>${availableProducts.map(item => `<option value="${item.id}">${escapeHtml(item.name)} (${escapeHtml(item.sku || '')})</option>`).join('')}`;
  renderMaterialCategorySelects();
}

function downloadBomReport(productId = null) {
  const suffix = productId ? `?product_id=${productId}` : '';
  window.open(`${API_ORIGIN}/api/reports/bom/export${suffix}`, '_blank');
}

function renderBomList(items) {
  bomBodyEl.innerHTML = items.length ? items.map(item => {
    const bomItems = item.bomItems || item.bom_items || [];
    const count = bomItems.length;
    return `
      <tr>
        <td><span class="bom-sku-badge">${escapeHtml(item.sku || '')}</span></td>
        <td class="bom-product-name">${escapeHtml(item.name || '')}</td>
        <td><span class="bom-category-badge">${escapeHtml(getCategoryPath(item))}</span></td>
        <td><div class="bom-material-summary"><strong>${count} 项</strong><span>${escapeHtml(summarizeMaterialCategories(bomItems))}</span></div></td>
        <td><span class="bom-cost-text">${formatCurrency(item.totalCost ?? item.total_cost ?? 0)}</span></td>
        <td><span class="bom-status-badge">已配置</span></td>
        <td>${escapeHtml(formatDate(item.updated_at || item.updatedAt))}</td>
        <td>
          <div class="bom-action-group">
            <button class="bom-icon-btn view open-view-btn" title="查看" data-id="${item.id}">👁️</button>
            <button class="bom-icon-btn edit open-edit-btn" title="编辑" data-id="${item.id}">✏️</button>
            <button class="bom-icon-btn report open-report-btn" title="报表" data-id="${item.id}">📋</button>
            <button class="bom-icon-btn delete open-delete-btn" title="删除" data-id="${item.id}">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="8">暂无 BOM 数据</td></tr>';

  document.querySelectorAll('.open-view-btn').forEach(button => {
    button.addEventListener('click', () => openDetails(Number(button.dataset.id), 'view'));
  });
  document.querySelectorAll('.open-edit-btn').forEach(button => {
    button.addEventListener('click', () => openDetails(Number(button.dataset.id), 'edit'));
  });
  document.querySelectorAll('.open-report-btn').forEach(button => {
    button.addEventListener('click', () => downloadBomReport(Number(button.dataset.id)));
  });
  document.querySelectorAll('.open-delete-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const productId = Number(button.dataset.id);
      const product = items.find(item => Number(item.id) === productId);
      if (!confirm(`确认删除产品“${product?.name || '当前产品'}”的整个 BOM 吗？`)) return;
      try {
        await apiDelete(`/bom/product/${productId}`, '删除整个产品BOM失败');
        if (selectedProduct && Number(selectedProduct.id) === productId) closeDetails();
        await loadBomList();
        setMessage(messageEl, '整个产品 BOM 已删除', 'ok');
      } catch (error) {
        setMessage(messageEl, error.message, 'error');
      }
    });
  });
}

async function loadBaseData() {
  const [productsResult, categoriesResult] = await Promise.all([
    apiGet('/products?page=1&per_page=100'),
    apiGet('/products/categories')
  ]);
  allProducts = productsResult.data || [];
  const categoryTree = categoriesResult.data.categories || [];
  categories = flattenCategories(categoryTree);
  categoryPathMap = new Map(categories.map(item => [String(item.id), item.path]));
  categoryChildrenMap = buildCategoryChildrenMap(categoryTree);
  renderCategoryOptions();
}

async function loadBomList() {
  try {
    statusEl.textContent = '正在加载 BOM...';
    const data = await fetchJsonByUrl(`${API_ORIGIN}/api/bom`, '加载 BOM 失败');
    const rawItems = Array.isArray(data?.data) ? data.data : [];
    bomProducts = rawItems.filter(item => item.product_type === 'finished' && (item.bomItems?.length || item.bom_items?.length || 0) > 0);
    renderCategoryOptions();

    const keyword = searchInput.value.trim().toLowerCase();
    let filtered = keyword
      ? bomProducts.filter(item => String(item.name || '').toLowerCase().includes(keyword) || String(item.sku || '').toLowerCase().includes(keyword))
      : bomProducts;

    if (categoryFilterSelect.value) {
      const categoryIds = getDescendantCategoryIds(categoryFilterSelect.value);
      filtered = filtered.filter(item => categoryIds.has(String(item.category_id || '')));
    }

    renderBomList(filtered);
    summaryEl.textContent = `共 ${filtered.length} 个产品`;
    statusEl.textContent = `已加载 ${filtered.length} 个成品 BOM`;
    setMessage(messageEl, 'BOM 列表加载成功', 'ok');
  } catch (error) {
    statusEl.textContent = '加载失败';
    setMessage(messageEl, error.message, 'error');
  }
}

function applyDetailMode(mode) {
  detailMode = mode;
  const editing = mode === 'edit';
  detailReadonlyBannerEl.style.display = editing ? 'none' : 'block';
  detailReadonlyBannerEl.textContent = editing ? '' : '当前为查看模式，仅展示该成品的 BOM 详情。';
  detailEditorToolbarEl.style.display = editing ? 'flex' : 'none';
  if (detailActionHeadEl) detailActionHeadEl.textContent = editing ? '操作' : '说明';

  // 切换模式时更新打印按钮显示状态
  const printBtn = document.getElementById('print-selected-bom-button');
  if (printBtn) {
    const checked = document.querySelectorAll('.bom-item-checkbox:checked');
    printBtn.style.display = checked.length > 0 && !editing ? 'inline-flex' : 'none';
  }
}

function getDetailGroupKey(item = {}) {
  const meta = getMaterialSortMeta(item);
  if (meta.group === 'raw') return 'raw';
  if (meta.group === 'packaging') return 'packaging';
  return 'label';
}

function getDetailGroupLabel(groupKey) {
  if (groupKey === 'raw') return '原材料';
  if (groupKey === 'packaging') return '包装材料';
  return '标签';
}

function getSelectedItems() {
  const checked = document.querySelectorAll('.bom-item-checkbox:checked');
  const ids = new Set(Array.from(checked).map(cb => String(cb.dataset.id)));
  return currentDetailRawItems.filter(item => ids.has(String(item.id)));
}

function printSelectedBom() {
  const selected = getSelectedItems();
  if (!selected.length) {
    setMessage(messageEl, '请至少勾选一个物料项', 'error');
    return;
  }
  const sorted = sortBomDisplayItems(selected);
  const grouped = { raw: [], packaging: [], label: [] };
  sorted.forEach(item => grouped[getDetailGroupKey(item)].push(item));
  const rawTotalQuantity = grouped.raw.reduce((sum, item) => sum + Number(item.quantityRequired || 0), 0);

  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) return setMessage(messageEl, '浏览器拦截了弹窗，请允许后重试', 'error');

  let html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>BOM 物料需求单 - ${escapeHtml(selectedProduct?.name || '')}</title>
<style>
@page { margin: 15mm; }
* { box-sizing: border-box; }
body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #1a1a2e; padding: 20px; }
h1 { text-align: center; font-size: 22px; margin-bottom: 4px; }
h2 { text-align: center; color: #666; font-size: 14px; font-weight: normal; margin-top: 0; }
.info { display: flex; justify-content: space-between; margin: 16px 0; padding: 12px; background: #f8f9fa; border-radius: 6px; font-size: 14px; }
.group-title { font-size: 16px; font-weight: bold; margin: 24px 0 8px; padding-left: 8px; border-left: 4px solid #4361ee; }
.group-title:first-of-type { margin-top: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: center; }
th { background: #f0f1ff; color: #333; font-weight: 600; }
.subtotal { font-weight: bold; background: #fafafa; }
.grand-total { text-align: right; font-size: 15px; margin-top: 16px; padding: 10px; background: #f8f9fa; border-radius: 6px; }
.footer { margin-top: 30px; display: flex; justify-content: space-between; font-size: 12px; color: #999; }
.no-print { display: none; }
@media screen { .no-print { display: block; } .footer { display: none; } }
</style></head><body>
<h1>📦 BOM 物料需求单</h1>
<h2>${escapeHtml(selectedProduct?.sku || '')} - ${escapeHtml(selectedProduct?.name || '')}</h2>
<div class="info">
  <span>打印时间：${new Date().toLocaleString('zh-CN')}</span>
  <span>已选 ${selected.length} / ${currentDetailRawItems.length} 项</span>
</div>`;

  const groupOrder = ['raw', 'packaging', 'label'];
  const groupLabels = { raw: '原材料', packaging: '包装材料', label: '标签' };
  groupOrder.forEach(key => {
    if (!grouped[key].length) return;
    html += `<div class="group-title">${groupLabels[key]}</div>`;
    html += `<table><thead><tr><th>序号</th><th>物料名称</th><th>SKU</th><th>用量</th><th>单位</th>`;
    if (key === 'raw') html += '<th>使用比例</th>';
    html += '<th>单价</th><th>成本</th></tr></thead><tbody>';
    grouped[key].forEach((item, index) => {
      const ratio = key === 'raw' && rawTotalQuantity > 0 ? `${((Number(item.quantityRequired || 0) / rawTotalQuantity) * 100).toFixed(2)}%` : '';
      html += `<tr><td>${index + 1}</td><td style="text-align:left">${escapeHtml(item.materialName)}</td><td>${escapeHtml(item.materialSku)}</td><td>${formatNumber(item.quantityRequired)}</td><td>${escapeHtml(item.unit)}</td>`;
      if (key === 'raw') html += `<td>${ratio}</td>`;
      html += `<td>${formatCurrency(item.materialPrice)}</td><td>${formatCurrency(item.itemCost)}</td></tr>`;
    });
    const subtotal = grouped[key].reduce((s, i) => s + Number(i.quantityRequired || 0), 0);
    const subCost = grouped[key].reduce((s, i) => s + Number(i.itemCost || 0), 0);
    html += `<tr class="subtotal"><td colspan="3"></td><td>小计：${formatNumber(subtotal)}</td><td></td>`;
    if (key === 'raw') html += `<td>${rawTotalQuantity > 0 ? ((subtotal / rawTotalQuantity) * 100).toFixed(2) : '0.00'}%</td>`;
    html += `<td></td><td>${formatCurrency(subCost)}</td></tr>`;
    html += '</tbody></table>';
  });

  const totalCost = selected.reduce((s, i) => s + Number(i.itemCost || 0), 0);
  html += `<div class="grand-total">选中项总计成本：<strong>${formatCurrency(totalCost)}</strong></div>`;
  html += `<div class="footer">打印人：__________ &nbsp;&nbsp;&nbsp;&nbsp; 审核人：__________ &nbsp;&nbsp;&nbsp;&nbsp; 日期：__________</div>`;
  html += `</body></html>`;

  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); }, 300);
}

function renderDetailGroupTable(groupKey, items, rawTotalQuantity) {
  const showRatio = groupKey === 'raw';
  const subtotalQuantity = items.reduce((sum, item) => sum + Number(item.quantityRequired || 0), 0);
  const subtotalCost = items.reduce((sum, item) => sum + Number(item.itemCost || 0), 0);
  return `
    <section class="bom-detail-group-section">
      <h4>${getDetailGroupLabel(groupKey)}：</h4>
      <div class="table-container bom-detail-group-table-wrap">
        <table class="data-table bom-detail-group-table">
          <thead>
            <tr>
              <th><input type="checkbox" class="bom-select-all" data-group="${groupKey}" title="全选"></th>
              <th>序号</th>
              <th>物料名称</th>
              <th>SKU</th>
              <th>用量</th>
              ${showRatio ? '<th>使用比例</th>' : ''}
              <th>单价</th>
              <th>成本</th>
              ${detailMode === 'edit' ? '<th>操作</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${items.map((item, index) => {
              const ratio = showRatio && rawTotalQuantity > 0 ? `${((Number(item.quantityRequired || 0) / rawTotalQuantity) * 100).toFixed(2)}%` : '';
              return `
                <tr>
                  <td><input type="checkbox" class="bom-item-checkbox" data-id="${item.id}" data-group="${groupKey}" checked></td>
                  <td>${index + 1}</td>
                  <td>${escapeHtml(item.materialName)}</td>
                  <td>${escapeHtml(item.materialSku)}</td>
                  <td>${escapeHtml(formatNumber(item.quantityRequired))} ${escapeHtml(item.unit)}</td>
                  ${showRatio ? `<td>${ratio}</td>` : ''}
                  <td>${formatCurrency(item.materialPrice)}</td>
                  <td>${formatCurrency(item.itemCost)}</td>
                  ${detailMode === 'edit' ? `<td><button class="delete-bom-btn btn btn-danger btn-sm" data-id="${item.id}">删除</button></td>` : ''}
                </tr>
              `;
            }).join('')}
            <tr class="bom-detail-subtotal-row">
              <td colspan="3"></td>
              <td>小计：${formatNumber(subtotalQuantity)}</td>
              ${showRatio ? `<td>${rawTotalQuantity > 0 ? ((subtotalQuantity / rawTotalQuantity) * 100).toFixed(2) : '0.00'}%</td>` : ''}
              <td></td>
              <td>${formatCurrency(subtotalCost)}</td>
              ${detailMode === 'edit' ? '<td></td>' : ''}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderDetailItems(items) {
  const sortedItems = sortBomDisplayItems(items);
  if (!sortedItems.length) {
    detailBodyEl.innerHTML = '<div class="table-container"><table class="data-table"><tbody><tr><td>该产品暂无 BOM 项</td></tr></tbody></table></div>';
    return;
  }

  currentDetailRawItems = sortedItems.map(item => normalizeBomItem(item));
  selectedBomItemIds = new Set(currentDetailRawItems.map(item => String(item.id)));

  const grouped = { raw: [], packaging: [], label: [] };
  sortedItems.forEach(item => grouped[getDetailGroupKey(item)].push(item));
  const rawTotalQuantity = grouped.raw.reduce((sum, item) => sum + Number(item.quantityRequired || 0), 0);
  const totalCost = sortedItems.reduce((sum, item) => sum + Number(item.itemCost || 0), 0);

  detailBodyEl.innerHTML = `
    ${grouped.raw.length ? renderDetailGroupTable('raw', grouped.raw, rawTotalQuantity) : ''}
    ${grouped.packaging.length ? renderDetailGroupTable('packaging', grouped.packaging, rawTotalQuantity) : ''}
    ${grouped.label.length ? renderDetailGroupTable('label', grouped.label, rawTotalQuantity) : ''}
    <div class="bom-detail-grand-total">总计：<strong>${formatCurrency(totalCost)}</strong></div>
  `;

  // 绑定全选/取消全选
  document.querySelectorAll('.bom-select-all').forEach(cb => {
    cb.addEventListener('change', () => {
      const group = cb.dataset.group;
      const checkboxes = document.querySelectorAll(`.bom-item-checkbox[data-group="${group}"]`);
      checkboxes.forEach(c => c.checked = cb.checked);
    });
  });

  // 监听勾选变化，控制打印按钮显示
  const updatePrintButton = () => {
    const checked = document.querySelectorAll('.bom-item-checkbox:checked');
    const printBtn = document.getElementById('print-selected-bom-button');
    if (printBtn) printBtn.style.display = checked.length > 0 && detailMode === 'view' ? 'inline-flex' : 'none';
  };
  // 先给每个复选框设置 data-group，再绑定事件和初始化按钮
  document.querySelectorAll('.bom-item-checkbox').forEach(cb => {
    cb.addEventListener('change', updatePrintButton);
  });
  updatePrintButton();

  if (detailMode === 'edit') {
    document.querySelectorAll('.delete-bom-btn').forEach(button => {
      button.addEventListener('click', async () => {
        if (!confirm('确认删除这个 BOM 项？')) return;
        try {
          await apiDelete(`/bom/${button.dataset.id}`, '删除失败');
          await loadBomList();
          await openDetails(selectedProduct.id, 'edit');
          setMessage(messageEl, 'BOM 项已删除', 'ok');
        } catch (error) {
          setMessage(messageEl, error.message, 'error');
        }
      });
    });
  }
}

async function openDetails(productId, mode = 'view') {
  try {
    statusEl.textContent = mode === 'edit' ? '正在加载 BOM 编辑器...' : '正在加载 BOM 详情...';
    const data = await fetchJsonByUrl(`${API_ORIGIN}/api/bom?product_id=${productId}`, '加载 BOM 详情失败');
    const payload = data.data || {};
    selectedProduct = bomProducts.find(item => Number(item.id) === productId) || allProducts.find(item => Number(item.id) === productId) || { id: productId };
    applyDetailMode(mode);
    detailSectionEl.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    detailTitleEl.textContent = `${selectedProduct.name || '产品'} - ${mode === 'edit' ? '编辑 BOM' : '查看 BOM'}`;
    detailSubtitleEl.textContent = `总成本：${formatCurrency(payload.total_cost ?? payload.totalCost ?? 0)}`;
    productSelect.value = String(productId);
    const items = Array.isArray(payload.items) ? payload.items.map(normalizeBomItem) : [];
    renderDetailItems(items);
    statusEl.textContent = mode === 'edit' ? 'BOM 编辑器已加载' : 'BOM 详情已加载';
  } catch (error) {
    statusEl.textContent = '详情加载失败';
    setMessage(messageEl, error.message, 'error');
  }
}

function resetAddBomForm() {
  addBomProductSelect.value = '';
  addBomProductName.value = '';
  addBomProductSku.value = '';
  addBomProductQuantity.value = '';
  addBomProductUnit.value = '';
  addBomUsageCount.value = '1';
  addBomDescription.value = '';
  if (addBomMaterialCategorySelect) addBomMaterialCategorySelect.value = '';
  renderMaterialProductOptions(addBomMaterialSelect, '', '请选择物料');
  addBomMaterialName.value = '';
  addBomMaterialSku.value = '';
  addBomMaterialUnit.value = '个';
  addBomMaterialQuantity.value = '1';
  addBomMaterialPrice.value = '0';
  newBomItems = [];
  renderNewBomItems();
  setMessage(addBomMessageEl, '', '');
}

function openAddBomModal() {
  resetAddBomForm();
  addBomModalEl.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closeAddBomModal() {
  addBomModalEl.style.display = 'none';
  document.body.style.overflow = '';
}

function onAddBomProductChange() {
  const product = allProducts.find(item => Number(item.id) === Number(addBomProductSelect.value));
  addBomProductName.value = product?.name || '';
  addBomProductSku.value = product?.sku || '';
}

function normalizeUnit(unit) {
  return String(unit || '个').trim();
}

function unitFactor(unit = '') {
  const factors = {
    kg: 1000,
    g: 1,
    mg: 0.001,
    l: 1000,
    L: 1000,
    ml: 1,
    'm³': 1000000,
    m3: 1000000
  };
  const normalized = String(unit || '').trim();
  return factors[normalized] ?? factors[normalized.toLowerCase()];
}

function convertQuantity(value, fromUnit = '', toUnit = '') {
  const numericValue = Number(value || 0);
  const fromFactor = unitFactor(fromUnit);
  const toFactor = unitFactor(toUnit);
  if (normalizeUnit(fromUnit).toLowerCase() === normalizeUnit(toUnit).toLowerCase() || fromFactor === undefined || toFactor === undefined) {
    return numericValue;
  }
  return (numericValue * fromFactor) / toFactor;
}

function roundUpToTwoDecimals(value) {
  const numericValue = Number(value || 0);
  return Math.ceil((numericValue - Number.EPSILON) * 100) / 100;
}

function formatNumber(value) {
  const roundedValue = roundUpToTwoDecimals(value);
  return Number.isInteger(roundedValue) ? String(roundedValue) : roundedValue.toFixed(2).replace(/\.?0+$/, '');
}

function convertUnitForBOM(originalUnit) {
  const unit = normalizeUnit(originalUnit);
  const unitConversionMap = {
    'kg': 'g',
    'kgs': 'g',
    'kg(s)': 'g',
    'l': 'ml',
    'L': 'ml',
    'l(s)': 'ml',
    'L(s)': 'ml',
    'm³': 'ml',
    '吨': 'g',
    '立方米': 'ml'
  };
  return unitConversionMap[unit] || unitConversionMap[unit.toLowerCase()] || unit;
}

function calculateUnitPrice(basePrice, baseUnit, targetUnit) {
  const price = Number(basePrice || 0);
  if (!price) return 0;
  const fromUnit = normalizeUnit(baseUnit);
  const toUnit = normalizeUnit(targetUnit);
  if (fromUnit === toUnit) return price;

  const unitConversions = {
    'kg': 1000,
    'g': 1,
    'mg': 0.001,
    'l': 1000,
    'L': 1000,
    'ml': 1,
    'm³': 1000000,
    '个': 1,
    '件': 1,
    '套': 1,
    '箱': 1,
    '包': 1
  };
  const baseFactor = unitConversions[fromUnit] ?? unitConversions[fromUnit.toLowerCase()];
  const targetFactor = unitConversions[toUnit] ?? unitConversions[toUnit.toLowerCase()];
  if (!baseFactor || !targetFactor) return price;
  return (price / baseFactor) * targetFactor;
}

function refreshAddBomMaterialPrice() {
  const material = allProducts.find(item => Number(item.id) === Number(addBomMaterialSelect.value));
  if (!material) return;
  addBomMaterialPrice.value = calculateUnitPrice(material.price || 0, material.unit || '个', addBomMaterialUnit.value || material.unit || '个');
}

function onAddBomMaterialCategoryChange() {
  renderMaterialProductOptions(addBomMaterialSelect, addBomMaterialCategorySelect.value, '请选择物料');
  addBomMaterialSelect.value = '';
  addBomMaterialName.value = '';
  addBomMaterialSku.value = '';
  addBomMaterialUnit.value = '个';
  addBomMaterialPrice.value = '0';
}

function onAddBomMaterialChange() {
  const material = allProducts.find(item => Number(item.id) === Number(addBomMaterialSelect.value));
  addBomMaterialName.value = material?.name || '';
  addBomMaterialSku.value = material?.sku || '';
  addBomMaterialUnit.value = material ? convertUnitForBOM(material.unit || '个') : '个';
  refreshAddBomMaterialPrice();
}

function getMainMaterialPercentTotal() {
  return newBomItems
    .filter(item => item.materialType === 'main')
    .reduce((sum, item) => sum + Number(item.baseQuantity || 0), 0);
}

function renderNewBomItems() {
  const total = newBomItems.reduce((sum, item) => sum + Number(item.quantityRequired || 0) * Number(item.materialPrice || 0), 0);
  const mainPercentTotal = getMainMaterialPercentTotal();
  const sortedItems = sortBomDisplayItems(newBomItems).map(item => ({ ...item, __originalIndex: newBomItems.indexOf(item) }));
  addBomTotalCost.textContent = `${formatCurrency(total)}｜主原材料配比 ${formatNumber(mainPercentTotal)}%`;
  addBomItemsBody.innerHTML = sortedItems.length ? sortedItems.map((item, index) => {
    return `
    <tr>
      <td>${renderMaterialCategoryBadge(item)}</td>
      <td>${escapeHtml(item.materialName)}</td>
      <td>${escapeHtml(item.materialSku)}</td>
      <td>${item.calculationText ? escapeHtml(item.calculationText) : `${escapeHtml(item.baseQuantity)} × ${escapeHtml(item.usageCount)} = <strong>${escapeHtml(item.quantityRequired)}</strong>`}</td>
      <td>${escapeHtml(item.unit)}</td>
      <td>${formatCurrency(item.materialPrice)}</td>
      <td>${formatCurrency(Number(item.quantityRequired || 0) * Number(item.materialPrice || 0))}</td>
      <td><button class="btn btn-danger btn-sm remove-new-bom-item" data-index="${item.__originalIndex}">删除</button></td>
    </tr>
  `;
  }).join('') : '<tr><td colspan="8" class="empty-state"><div class="empty-content"><div class="empty-icon">📦</div><p>暂无BOM物料</p></div></td></tr>';

  document.querySelectorAll('.remove-new-bom-item').forEach(button => {
    button.addEventListener('click', () => {
      newBomItems.splice(Number(button.dataset.index), 1);
      renderNewBomItems();
    });
  });
}

function addNewBomTempItem() {
  const materialId = Number(addBomMaterialSelect.value);
  const material = allProducts.find(item => Number(item.id) === materialId);
  const productId = Number(addBomProductSelect.value);
  const inputValue = Number(addBomMaterialQuantity.value);
  const productCapacity = Number(addBomProductQuantity.value);
  const productCapacityUnit = addBomProductUnit.value.trim();
  const materialKind = getProductMaterialKind(material);
  const usageCount = Math.max(Number(addBomUsageCount.value || 1), 1);
  const unit = addBomMaterialUnit.value.trim() || material?.unit || '个';
  const materialPrice = Number(addBomMaterialPrice.value || material?.price || 0);
  const productCapacityInBomUnit = convertQuantity(productCapacity, productCapacityUnit, unit);
  const rawQuantityRequired = materialKind.key === 'main'
    ? productCapacityInBomUnit * (inputValue / 100) * usageCount
    : inputValue * usageCount;
  const quantityRequired = roundUpToTwoDecimals(rawQuantityRequired);
  const calculationText = materialKind.key === 'main'
    ? `${formatNumber(productCapacityInBomUnit)} ${unit} × ${formatNumber(inputValue)}% × ${usageCount} = ${formatNumber(quantityRequired)} ${unit}`
    : `${formatNumber(inputValue)} ${unit} × ${usageCount} = ${formatNumber(quantityRequired)} ${unit}`;

  if (!productId) {
    setMessage(addBomMessageEl, '请先选择成品', 'error');
    return;
  }
  if (!materialId || !material || !inputValue) {
    setMessage(addBomMessageEl, '请选择物料并填写配比百分比/用量', 'error');
    return;
  }
  if (materialKind.key === 'main' && (!productCapacity || !productCapacityUnit)) {
    setMessage(addBomMessageEl, '主原材料需要先填写产品容量/总量和单位', 'error');
    return;
  }
  if (productId === materialId) {
    setMessage(addBomMessageEl, '成品不能把自己作为物料', 'error');
    return;
  }
  if (newBomItems.some(item => Number(item.materialId) === materialId)) {
    setMessage(addBomMessageEl, '该物料已添加到当前BOM中', 'error');
    return;
  }

  newBomItems.push({
    materialId,
    materialName: material.name || addBomMaterialName.value,
    materialSku: material.sku || addBomMaterialSku.value,
    materialCategoryId: material.category_id || null,
    materialCategoryName: material.category_name || '',
    materialProductType: material.product_type || '',
    materialType: materialKind.key,
    baseQuantity: inputValue,
    usageCount,
    quantityRequired,
    calculationText,
    unit,
    materialPrice
  });
  if (addBomMaterialCategorySelect) addBomMaterialCategorySelect.value = String(material.category_id || '');
  renderMaterialProductOptions(addBomMaterialSelect, addBomMaterialCategorySelect?.value, '请选择物料');
  addBomMaterialSelect.value = '';
  addBomMaterialName.value = '';
  addBomMaterialSku.value = '';
  addBomMaterialUnit.value = '个';
  addBomMaterialQuantity.value = '1';
  addBomMaterialPrice.value = '0';
  setMessage(addBomMessageEl, '', '');
  renderNewBomItems();
}

async function saveNewBom() {
  const productId = Number(addBomProductSelect.value);
  if (!productId) {
    setMessage(addBomMessageEl, '请选择产品', 'error');
    return;
  }
  if (!newBomItems.length) {
    setMessage(addBomMessageEl, '请至少添加一个物料项', 'error');
    return;
  }
  const mainPercentTotal = getMainMaterialPercentTotal();
  if (Math.abs(mainPercentTotal - 100) > 0.001) {
    const direction = mainPercentTotal < 100 ? '不足' : '超过';
    setMessage(addBomMessageEl, `主原材料配比合计必须等于 100%，当前为 ${formatNumber(mainPercentTotal)}%，${direction} 100%，请修改后再创建 BOM。`, 'error');
    return;
  }

  saveAddBomButton.disabled = true;
  let successCount = 0;
  const failMessages = [];
  try {
    for (const item of newBomItems) {
      try {
        await apiPost('/bom', {
          product_id: productId,
          material_id: item.materialId,
          quantity_required: roundUpToTwoDecimals(item.quantityRequired),
          unit_price: Number(item.materialPrice || 0),
          unit: item.unit
        }, '创建BOM项失败');
        successCount += 1;
      } catch (itemError) {
        failMessages.push(`添加物料 ${item.materialName || item.materialId} 时出错: ${itemError.message || itemError}`);
      }
    }

    if (successCount === newBomItems.length) {
      await loadBomList();
      closeAddBomModal();
      await openDetails(productId, 'edit');
      setMessage(messageEl, `成功添加 ${successCount} 个物料项`, 'ok');
    } else {
      await loadBomList();
      const failCount = newBomItems.length - successCount;
      setMessage(addBomMessageEl, `成功添加 ${successCount} 个物料项，${failCount} 个失败。${failMessages[0] || ''}`, 'error');
    }
  } finally {
    saveAddBomButton.disabled = false;
  }
}

async function addBomItem() {
  try {
    const productId = Number(productSelect.value || selectedProduct?.id);
    const materialId = Number(materialSelect.value);
    const quantityRequired = roundUpToTwoDecimals(quantityInput.value);
    const unit = unitInput.value.trim() || '个';
    if (!productId || !materialId || !quantityRequired) {
      throw new Error('请填写完整的成品、物料和用量');
    }
    await apiPost('/bom', { product_id: productId, material_id: materialId, quantity_required: quantityRequired, unit }, '新增 BOM 项失败');
    quantityInput.value = '';
    unitInput.value = '';
    materialSelect.value = '';
    await loadBomList();
    await openDetails(productId, 'edit');
    setMessage(messageEl, 'BOM 项新增成功', 'ok');
  } catch (error) {
    setMessage(messageEl, error.message, 'error');
  }
}

function closeDetails() {
  detailSectionEl.style.display = 'none';
  document.body.style.overflow = '';
}

function onDetailMaterialCategoryChange() {
  renderMaterialProductOptions(materialSelect, detailMaterialCategorySelect.value, '选择物料');
  materialSelect.value = '';
}

function onDetailMaterialChange() {
  const material = allProducts.find(item => Number(item.id) === Number(materialSelect.value));
  if (!material) return;
  if (!unitInput.value.trim()) {
    unitInput.value = convertUnitForBOM(material.unit || '个');
  }
}

searchInput?.addEventListener('keydown', (event) => { if (event.key === 'Enter') loadBomList(); });
categoryFilterSelect?.addEventListener('change', loadBomList);
closeDetailButton?.addEventListener('click', closeDetails);
addBomProductSelect?.addEventListener('change', onAddBomProductChange);
addBomMaterialCategorySelect?.addEventListener('change', onAddBomMaterialCategoryChange);
addBomMaterialSelect?.addEventListener('change', onAddBomMaterialChange);
addBomMaterialUnit?.addEventListener('input', refreshAddBomMaterialPrice);
detailMaterialCategorySelect?.addEventListener('change', onDetailMaterialCategoryChange);
materialSelect?.addEventListener('change', onDetailMaterialChange);
addBomTempItemButton?.addEventListener('click', addNewBomTempItem);
closeAddBomModalButton?.addEventListener('click', closeAddBomModal);
cancelAddBomButton?.addEventListener('click', closeAddBomModal);
saveAddBomButton?.addEventListener('click', saveNewBom);
addBomModalEl?.addEventListener('click', (event) => {
  if (event.target === addBomModalEl) closeAddBomModal();
});
detailSectionEl?.addEventListener('click', (event) => {
  if (event.target === detailSectionEl) closeDetails();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && addBomModalEl?.style.display !== 'none') closeAddBomModal();
  if (event.key === 'Escape' && detailSectionEl?.style.display !== 'none') closeDetails();
});
detailModalContentEl?.addEventListener('click', (event) => event.stopPropagation());
addItemButton?.addEventListener('click', addBomItem);
addBomButton?.addEventListener('click', () => {
  if (allProducts.filter(item => item.product_type === 'finished').length) openAddBomModal();
  else setMessage(messageEl, '请先创建成品后再配置 BOM。', '');
});
bomReportButton?.addEventListener('click', () => downloadBomReport());
document.getElementById('print-selected-bom-button')?.addEventListener('click', printSelectedBom);

try {
  await loadBaseData();
  await loadBomList();
} catch (error) {
  statusEl.textContent = '加载失败';
  setMessage(messageEl, error.message || 'BOM 页面初始化失败', 'error');
}
