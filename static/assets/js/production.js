import { apiGet, apiPost, apiPut, apiDelete, fetchJsonByUrl, buildMainNav, formatCurrency, escapeHtml, setMessage } from './api.js?v=2026062214';
import { API_ORIGIN } from './config.js?v=2026051301';

document.getElementById('main-nav').innerHTML = buildMainNav('production');

const statusEl = document.getElementById('page-status');
const pageMessageEl = document.getElementById('page-message');
const calculatorMessageEl = document.getElementById('calculator-message');
const calculatorProductSelect = document.getElementById('calculator-product-select');
const calculatorQuantityInput = document.getElementById('calculator-quantity-input');
const calculateButton = document.getElementById('calculate-button');
const printRequirementsButton = document.getElementById('print-requirements-button');
const resetCalculatorButton = document.getElementById('reset-calculator-button');
const requirementsBodyEl = document.getElementById('requirements-body');
const requirementsSummaryEl = document.getElementById('requirements-summary');
const requirementsTotalCostEl = document.getElementById('requirements-total-cost');
const requirementsTotalQuantityEl = document.getElementById('requirements-total-quantity');
const planStatusSelect = document.getElementById('plan-status-select');
const loadPlansButton = document.getElementById('load-plans-button');
const openCreatePlanButton = document.getElementById('open-create-plan-button');
const emptyCreatePlanButton = document.getElementById('empty-create-plan-button');
const createPlanModal = document.getElementById('create-plan-modal');
const closeCreatePlanModal = document.getElementById('close-create-plan-modal');
const plansEmptyStateEl = document.getElementById('plans-empty-state');
const plansTableSectionEl = document.getElementById('plans-table-section');
const newPlanProductSelect = document.getElementById('new-plan-product-select');
const newPlanQuantity = document.getElementById('new-plan-quantity');
const newPlanDate = document.getElementById('new-plan-date');
const newPlanNotes = document.getElementById('new-plan-notes');
const createPlanButton = document.getElementById('create-plan-button');
const plansBodyEl = document.getElementById('plans-body');

let allProducts = [];
let calculatorProducts = [];
let categoryPathMap = new Map();
let lastCalculatedItems = [];

function normalizeUnit(unit = '') {
  return String(unit || '').trim().toLowerCase();
}

function unitFactor(unit = '') {
  const factors = {
    kg: 1000,
    g: 1,
    mg: 0.001,
    l: 1000,
    ml: 1,
    'm³': 1000000,
    m3: 1000000
  };
  return factors[normalizeUnit(unit)];
}

function unitsCompatible(fromUnit = '', toUnit = '') {
  return unitFactor(fromUnit) !== undefined && unitFactor(toUnit) !== undefined;
}

function convertQuantity(value, fromUnit = '', toUnit = '') {
  const numericValue = Number(value || 0);
  const fromFactor = unitFactor(fromUnit);
  const toFactor = unitFactor(toUnit);
  if (normalizeUnit(fromUnit) === normalizeUnit(toUnit) || fromFactor === undefined || toFactor === undefined) {
    return numericValue;
  }
  return (numericValue * fromFactor) / toFactor;
}

function roundUpToTwoDecimals(value) {
  const numericValue = Number(value || 0);
  return Math.ceil((numericValue - Number.EPSILON) * 100) / 100;
}

function formatRoundedNumber(value) {
  const roundedValue = roundUpToTwoDecimals(value);
  return Number.isInteger(roundedValue) ? String(roundedValue) : roundedValue.toFixed(2).replace(/\.?0+$/, '');
}

function formatMaterialAmount(value, unit = '') {
  const numericValue = Number(value || 0);
  const originalUnit = String(unit || '').trim();
  const normalizedUnit = normalizeUnit(originalUnit);

  if (normalizedUnit === 'g' && Math.abs(numericValue) >= 1000) {
    return `${formatRoundedNumber(numericValue / 1000)} kg`;
  }

  if (normalizedUnit === 'ml' && Math.abs(numericValue) >= 1000) {
    return `${formatRoundedNumber(numericValue / 1000)} L`;
  }

  const displayValue = formatRoundedNumber(numericValue);
  return originalUnit ? `${displayValue} ${originalUnit}` : displayValue;
}

function getDominantUnit(items) {
  if (!items?.length) return '';
  const counts = {};
  items.forEach(item => {
    const u = String(item.unit || '').trim();
    if (u) counts[u] = (counts[u] || 0) + 1;
  });
  let top = '', topCount = 0;
  for (const [u, c] of Object.entries(counts)) {
    if (c > topCount) { topCount = c; top = u; }
  }
  return top;
}

function getStockInfo(item) {
  const stock = Number(item.current_stock || 0);
  const bomUnit = item.unit || '';
  const stockUnit = item.material_unit || bomUnit;
  return {
    displayValue: stock,
    displayUnit: stockUnit,
    comparableValue: unitsCompatible(stockUnit, bomUnit) ? convertQuantity(stock, stockUnit, bomUnit) : stock
  };
}

function normalizeBomItem(item = {}) {
  return {
    id: item.id,
    materialId: item.material_id ?? item.materialId ?? 0,
    materialName: item.material_name || item.materialName || '',
    materialSku: item.material_sku || item.materialSku || '',
    materialCategoryId: item.material_category_id ?? item.materialCategoryId ?? item.category_id ?? null,
    materialCategoryName: item.material_category_name || item.materialCategoryName || item.category_name || '',
    materialProductType: item.material_product_type || item.materialProductType || '',
    quantityRequired: item.quantity_required ?? item.quantityRequired ?? 0,
    currentStock: item.current_stock ?? item.currentStock ?? item.material_quantity ?? 0,
    materialUnit: item.material_unit || item.materialUnit || item.unit || '',
    materialPrice: item.material_price ?? item.materialPrice ?? 0,
    itemCost: item.item_cost ?? item.itemCost ?? 0,
    unit: item.unit || ''
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

function getMaterialCategoryPath(item = {}) {
  if (item.materialCategoryId) return categoryPathMap.get(String(item.materialCategoryId)) || item.materialCategoryName || '';
  return item.materialCategoryName || '';
}

function getMaterialSortMeta(item = {}) {
  const text = [getMaterialCategoryPath(item), item.materialCategoryName, item.materialName, item.materialSku]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const isLabel = /\u6807\u7b7e|label/.test(text);
  const isPrintedLabel = /\u5370\u5237\u6807\u7b7e|printed label/.test(text);
  const isPrintedTag = /\u6253\u5370\u6807\u7b7e|print label/.test(text);
  const isBlankLabel = /\u7a7a\u767d\u6807\u7b7e|\u767d\u8272\u6807\u7b7e|blank label/.test(text);
  const isPackaging = !isLabel && /\u7eb8\u7bb1|\u5305\u88c5|\u74f6|\u76d6|\u888b|\u76d2|carton|box|pack/.test(text);
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

function getRequirementGroupMeta(item = {}) {
  const meta = getMaterialSortMeta(item);
  if (meta.group === 'packaging') {
    return { key: 'packaging', label: '\u5305\u88c5', badgeLabel: '\u5305\u88c5', className: 'packaging', order: 1 };
  }
  if (meta.group === 'label') {
    return { key: 'label', label: '\u6807\u7b7e', badgeLabel: '\u6807\u7b7e', className: 'label', order: 2 };
  }
  return { key: 'raw', label: '\u539f\u6750\u6599', badgeLabel: '\u539f\u6750\u6599', className: 'main', order: 0 };
}

function sortRequirementItems(items = []) {
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

    const categoryCompare = String(a.materialCategoryName || '').localeCompare(String(b.materialCategoryName || ''), 'zh-CN');
    if (categoryCompare !== 0) return categoryCompare;
    const nameCompare = String(a.materialName || '').localeCompare(String(b.materialName || b.name || ''), 'zh-CN');
    if (nameCompare !== 0) return nameCompare;
    return String(a.materialSku || '').localeCompare(String(b.materialSku || ''), 'zh-CN');
  });
}

function renderMaterialTypeBadge(item) {
  const group = getRequirementGroupMeta(item);
  return `<span class="bom-material-type-badge ${group.className}">${escapeHtml(group.badgeLabel)}</span>`;
}

function renderRequirementRow(item, quantity) {
  const perUnit = Number(item.quantityRequired || 0);
  const requiredQty = perUnit * quantity;
  const stockInfo = getStockInfo({ ...item, current_stock: item.currentStock, material_unit: item.materialUnit, unit: item.unit });
  const shortage = Math.max(requiredQty - stockInfo.comparableValue, 0);
  const cost = Number(item.itemCost || 0) * quantity;
  return `
    <tr>
      <td>${renderMaterialTypeBadge(item)}</td>
      <td>${escapeHtml(item.materialName || '')}</td>
      <td>${escapeHtml(item.materialSku || '')}</td>
      <td>${escapeHtml(formatMaterialAmount(perUnit, item.unit || ''))}</td>
      <td>${escapeHtml(formatMaterialAmount(stockInfo.displayValue, stockInfo.displayUnit))}</td>
      <td>${escapeHtml(formatMaterialAmount(shortage, item.unit || ''))}</td>
      <td>${formatCurrency(cost)}</td>
      <td>${escapeHtml(formatMaterialAmount(requiredQty, item.unit || ''))}</td>
    </tr>
  `;
}

function renderRequirementGroup(label, items, quantity) {
  if (!items.length) return '';
  const subtotalCost = items.reduce((sum, item) => sum + Number(item.itemCost || 0) * quantity, 0);
  const subtotalQty = items.reduce((sum, item) => {
    const perUnit = Number(item.quantityRequired || 0);
    const reqQty = perUnit * quantity;
    const unit = String(item.unit || '').trim().toLowerCase();
    if (unit === 'l') return sum + reqQty * 1000;
    if (unit === 'ml') return sum + reqQty;
    if (unit === 'kg') return sum + reqQty * 1000;
    if (unit === 'g') return sum + reqQty;
    return sum + reqQty;
  }, 0);
  return `
    <tr class="production-requirement-group-row">
      <td colspan="8">${escapeHtml(label)} <span>${items.length} 项</span></td>
    </tr>
    ${items.map(item => renderRequirementRow(item, quantity)).join('')}
    <tr class="production-requirement-subtotal-row">
      <td colspan="6">${escapeHtml(label)}小计</td>
      <td>${formatCurrency(subtotalCost)}</td>
      <td>${escapeHtml(formatMaterialAmount(subtotalQty, getDominantUnit(items)))}</td>
    </tr>
  `;
}

function renderRequirementRows(items, quantity) {
  if (!items.length) return '<tr><td colspan="8">\u8be5\u4ea7\u54c1\u6682\u65e0 BOM \u7269\u6599\u4fe1\u606f</td></tr>';
  const sortedItems = sortRequirementItems(items.map(normalizeBomItem));
  const groups = {
    raw: { label: '\u539f\u6750\u6599', items: [] },
    packaging: { label: '\u5305\u88c5', items: [] },
    label: { label: '\u6807\u7b7e', items: [] }
  };
  sortedItems.forEach(item => groups[getRequirementGroupMeta(item).key].items.push(item));
  return Object.values(groups).map(group => renderRequirementGroup(group.label, group.items, quantity)).join('');
}

function selectedProductName() {
  const selectedOption = calculatorProductSelect?.selectedOptions?.[0];
  return selectedOption?.textContent || '';
}

function updateRequirementsSummary(items, quantity) {
  if (!requirementsSummaryEl || !requirementsTotalCostEl || !requirementsTotalQuantityEl) {
    return;
  }

  if (!items.length) {
    requirementsSummaryEl.style.display = 'none';
    requirementsTotalCostEl.textContent = formatCurrency(0);
    requirementsTotalQuantityEl.textContent = '0 ml';
    return;
  }

  const totalCost = items.reduce((sum, item) => sum + Number(item.itemCost ?? item.item_cost ?? 0) * quantity, 0);
  const totalVolumeMl = items.reduce((sum, item) => {
    const requiredQty = Number(item.quantityRequired ?? item.quantity_required ?? 0) * quantity;
    const unit = String(item.unit || '').trim().toLowerCase();

    if (unit === 'l') return sum + requiredQty * 1000;
    if (unit === 'ml') return sum + requiredQty;
    if (unit === 'g' || unit === 'kg') return sum + (unit === 'kg' ? requiredQty * 1000 : requiredQty);
    return sum + requiredQty;
  }, 0);

  requirementsTotalCostEl.textContent = formatCurrency(totalCost);
  requirementsTotalQuantityEl.textContent = formatMaterialAmount(totalVolumeMl, 'ml');
  requirementsSummaryEl.style.display = 'flex';
}

function printRequirements() {
  if (!lastCalculatedItems.length) {
    setMessage(calculatorMessageEl, '请先计算需求，再打印结果', 'error');
    return;
  }

  const productName = selectedProductName();
  const quantity = calculatorQuantityInput.value || '0';
  
  // 获取勾选的打印分组
  const printRaw = document.getElementById('print-filter-raw')?.checked ?? true;
  const printPackaging = document.getElementById('print-filter-packaging')?.checked ?? true;
  const printLabel = document.getElementById('print-filter-label')?.checked ?? true;
  
  // 过滤物料
  const filteredItems = lastCalculatedItems.filter(item => {
    const meta = getRequirementGroupMeta(item);
    if (meta.key === 'raw') return printRaw;
    if (meta.key === 'packaging') return printPackaging;
    if (meta.key === 'label') return printLabel;
    return true;
  });
  
  if (filteredItems.length === 0) {
    setMessage(calculatorMessageEl, '请至少选择一个打印分组', 'error');
    return;
  }

  const rows = renderRequirementRows(filteredItems, Number(quantity));

  // 按选中分组重新计算汇总
  const filteredTotalCost = filteredItems.reduce((sum, item) => sum + Number(item.itemCost || 0) * Number(quantity), 0);
  const filteredTotalQty = filteredItems.reduce((sum, item) => {
    const perUnit = Number(item.quantityRequired || 0);
    const reqQty = perUnit * Number(quantity);
    const unit = String(item.unit || '').trim().toLowerCase();
    if (unit === 'l') return sum + reqQty * 1000;
    if (unit === 'ml') return sum + reqQty;
    if (unit === 'kg') return sum + reqQty * 1000;
    if (unit === 'g') return sum + reqQty;
    return sum + reqQty;
  }, 0);

  const printWindow = window.open('', '_blank', 'width=1100,height=760');
  if (!printWindow) {
    setMessage(calculatorMessageEl, '打印窗口被浏览器拦截，请允许弹窗后重试', 'error');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <title>BOM物料需求打印</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; padding: 24px; color: #1f2937; }
        h1 { margin: 0 0 8px; font-size: 28px; }
        p { margin: 4px 0; color: #4b5563; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #d1d5db; padding: 10px 12px; text-align: left; font-size: 14px; }
        th { background: #f3f4f6; }
        .meta { margin-top: 16px; display: grid; gap: 4px; }
        .production-requirement-group-row td { background: #eaf3ff; color: #1f3555; font-weight: 800; }
        .production-requirement-subtotal-row td { background: #f8fafc; font-weight: 700; }
        .bom-material-type-badge { display: inline-flex; min-width: 72px; justify-content: center; padding: 4px 8px; border-radius: 999px; font-size: 12px; font-weight: 800; }
        .bom-material-type-badge.main { background: #e0f2fe; color: #0369a1; }
        .bom-material-type-badge.packaging { background: #fef3c7; color: #b45309; }
        .bom-material-type-badge.label { background: #dcfce7; color: #15803d; }
      </style>
    </head>
    <body>
      <h1>BOM物料需求单</h1>
      <div class="meta">
        <p><strong>产品：</strong>${escapeHtml(productName)}</p>
        <p><strong>生产数量：</strong>${escapeHtml(quantity)}</p>
        <p><strong>打印时间：</strong>${escapeHtml(new Date().toLocaleString('zh-CN'))}</p>
      </div>
      <table>
        <thead>
          <tr><th>分组</th><th>物料名称</th><th>SKU</th><th>单位用量</th><th>当前库存</th><th>缺口</th><th>需求成本</th><th>需求总数量</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top: 18px; display: flex; gap: 24px; justify-content: flex-end; font-size: 15px;">
        <p><strong>总成本：</strong>${formatCurrency(filteredTotalCost)}</p>
        <p><strong>需求总数量：</strong>${escapeHtml(formatMaterialAmount(filteredTotalQty, 'ml'))}</p>
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function openCreatePlanModal() {
  if (createPlanModal) {
    createPlanModal.style.display = 'block';
  }
}

function closeCreatePlanDialog() {
  if (createPlanModal) {
    createPlanModal.style.display = 'none';
  }
}

function renderCalculatorPlaceholder() {
  requirementsBodyEl.innerHTML = '<tr><td colspan="8">请选择产品并点击“计算需求”</td></tr>';
  updateRequirementsSummary([], 0);
}

function resetCalculator() {
  calculatorProductSelect.value = '';
  calculatorQuantityInput.value = '100';
  lastCalculatedItems = [];
  renderCalculatorPlaceholder();
  setMessage(calculatorMessageEl, '已重置计算条件', 'ok');
  const filterBar = document.getElementById('print-filter-bar');
  if (filterBar) filterBar.style.display = 'none';
}

function statusText(status) {
  if (status === 'completed') return '已完成';
  if (status === 'cancelled') return '已取消';
  if (status === 'in_progress') return '进行中';
  return '待处理';
}

function renderProductOptions() {
  const calculatorOptions = calculatorProducts
    .map(item => `<option value="${item.id}">${escapeHtml(item.name)} (${escapeHtml(item.sku || '')})</option>`)
    .join('');
  const planOptions = allProducts
    .map(item => `<option value="${item.id}">${escapeHtml(item.name)} (${escapeHtml(item.sku || '')})</option>`)
    .join('');
  calculatorProductSelect.innerHTML = `<option value="">选择产品</option>${calculatorOptions}`;
  newPlanProductSelect.innerHTML = `<option value="">选择产品</option>${planOptions}`;
}

async function loadProducts() {
  const [productsResult, bomResult, categoriesResult] = await Promise.all([
    apiGet('/products?page=1&per_page=100'),
    apiGet('/bom'),
    apiGet('/products/categories')
  ]);
  allProducts = productsResult.data || [];
  calculatorProducts = (bomResult.data || []).filter(item => {
    const bomItems = item.bomItems || item.bom_items || [];
    return item.product_type === 'finished' && bomItems.length > 0;
  });
  const categoryTree = categoriesResult.data?.categories || [];
  categoryPathMap = new Map(flattenCategories(categoryTree).map(item => [String(item.id), item.path]));
  renderProductOptions();
}

async function calculateRequirements() {
  try {
    const productId = Number(calculatorProductSelect.value);
    const quantity = Number(calculatorQuantityInput.value || 0);
    if (!productId || quantity <= 0) throw new Error('请选择产品并填写有效生产数量');

    const data = await fetchJsonByUrl(`${API_ORIGIN}/api/bom?product_id=${productId}`, '获取 BOM 失败');

    const items = (data?.data?.items || []).map(normalizeBomItem);
    lastCalculatedItems = items;
    requirementsBodyEl.innerHTML = renderRequirementRows(items, quantity);

    updateRequirementsSummary(items, quantity);
    setMessage(calculatorMessageEl, `物料需求计算完成，共 ${items.length} 项`, 'ok');
    
    // 显示打印过滤栏
    const filterBar = document.getElementById('print-filter-bar');
    if (filterBar) filterBar.style.display = 'block';
    // 全选
    const rawCb = document.getElementById('print-filter-raw');
    const pkgCb = document.getElementById('print-filter-packaging');
    const labelCb = document.getElementById('print-filter-label');
    if (rawCb) rawCb.checked = true;
    if (pkgCb) pkgCb.checked = true;
    if (labelCb) labelCb.checked = true;
  } catch (error) {
    lastCalculatedItems = [];
    requirementsBodyEl.innerHTML = '<tr><td colspan="8">暂无数据</td></tr>';
    updateRequirementsSummary([], 0);
    setMessage(calculatorMessageEl, error.message, 'error');
  }
}

async function loadPlans() {
  try {
    statusEl.textContent = '正在加载生产计划...';
    const qs = planStatusSelect.value ? `?status=${encodeURIComponent(planStatusSelect.value)}` : '';
    const data = await fetchJsonByUrl(`${API_ORIGIN}/api/production${qs}`, '获取生产计划失败');

    const plans = Array.isArray(data?.data) ? data.data : [];
    if (plansEmptyStateEl) {
      plansEmptyStateEl.style.display = plans.length ? 'none' : 'block';
    }
    if (plansTableSectionEl) {
      plansTableSectionEl.style.display = plans.length ? 'block' : 'none';
    }

    plansBodyEl.innerHTML = plans.length ? plans.map(item => `
      <tr>
        <td>${item.id}</td>
        <td>${escapeHtml(item.product_name || '')}</td>
        <td>${escapeHtml(item.product_sku || '')}</td>
        <td>${escapeHtml(item.quantity ?? 0)}</td>
        <td>${escapeHtml(item.produced_quantity ?? 0)}</td>
        <td>${escapeHtml(item.scheduled_date || '')}</td>
        <td>${statusText(item.status)}</td>
        <td>${escapeHtml(item.notes || '')}</td>
        <td>
          <button class="plan-action-btn" data-action="progress" data-id="${item.id}">更新进度</button>
          <button class="plan-action-btn" data-action="complete" data-id="${item.id}">标记完成</button>
          <button class="plan-action-btn" data-action="delete" data-id="${item.id}">删除</button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="9">暂无生产计划</td></tr>';

    document.querySelectorAll('.plan-action-btn').forEach(button => {
      button.addEventListener('click', async () => {
        const action = button.dataset.action;
        const id = Number(button.dataset.id);
        const current = plans.find(p => Number(p.id) === id);
        try {
          if (action === 'delete') {
            if (!confirm('确认删除该生产计划？')) return;
            await apiDelete(`/production/${id}`, '删除失败');
          } else {
            const produced = action === 'progress'
              ? Number(prompt('请输入已生产数量', current?.produced_quantity ?? 0))
              : Number(current?.quantity ?? 0);
            const status = action === 'complete' ? 'completed' : 'in_progress';
            await apiPut(`/production/${id}`, { produced_quantity: produced, status }, '更新失败');
          }
          await loadPlans();
          setMessage(pageMessageEl, '生产计划操作成功', 'ok');
        } catch (error) {
          setMessage(pageMessageEl, error.message, 'error');
        }
      });
    });

    statusEl.textContent = `已加载 ${plans.length} 条生产计划`;
    setMessage(pageMessageEl, '生产计划加载成功', 'ok');
  } catch (error) {
    statusEl.textContent = '加载失败';
    setMessage(pageMessageEl, error.message, 'error');
  }
}

async function createPlan() {
  try {
    const productId = Number(newPlanProductSelect.value);
    const quantity = Number(newPlanQuantity.value || 0);
    const scheduledDate = newPlanDate.value;
    const notes = newPlanNotes.value.trim();

    if (!productId || quantity <= 0 || !scheduledDate) {
      throw new Error('请填写完整的生产计划信息');
    }

    await apiPost('/production', {
      product_id: productId,
      quantity,
      scheduled_date: scheduledDate,
      notes
    }, '创建生产计划失败');

    newPlanQuantity.value = '';
    newPlanDate.value = '';
    newPlanNotes.value = '';
    closeCreatePlanDialog();
    await loadPlans();
    setMessage(pageMessageEl, '生产计划创建成功', 'ok');
  } catch (error) {
    setMessage(pageMessageEl, error.message, 'error');
  }
}

calculatorProductSelect?.addEventListener('change', async () => {
  if (calculatorProductSelect.value) {
    await calculateRequirements();
  } else {
    lastCalculatedItems = [];
    renderCalculatorPlaceholder();
    setMessage(calculatorMessageEl, '已重置计算条件', 'ok');
    const filterBar = document.getElementById('print-filter-bar');
    if (filterBar) filterBar.style.display = 'none';
  }
});

// 打印分组过滤切换
document.querySelectorAll('#print-filter-raw, #print-filter-packaging, #print-filter-label').forEach(cb => {
  cb.addEventListener('change', () => {
    if (lastCalculatedItems.length > 0) {
      // 不刷新表格，只在打印时应用过滤
    }
  });
});

calculateButton?.addEventListener('click', calculateRequirements);
printRequirementsButton?.addEventListener('click', printRequirements);
resetCalculatorButton?.addEventListener('click', resetCalculator);

// 数量变化时也自动重新计算
calculatorQuantityInput?.addEventListener('change', async () => {
  if (calculatorProductSelect.value) {
    await calculateRequirements();
  }
});
loadPlansButton?.addEventListener('click', loadPlans);
// 新建生产计划弹窗：选择产品后自动填充物料需求预览
let planMaterialPreview = null;

newPlanProductSelect?.addEventListener('change', async () => {
  const productId = Number(newPlanProductSelect.value);
  if (!productId) {
    planMaterialPreview = null;
    return;
  }
  try {
    const data = await fetchJsonByUrl(`${API_ORIGIN}/api/bom?product_id=${productId}&expand=true`, '获取 BOM 失败');
    const items = (data?.data?.items || []).map(normalizeBomItem);
    planMaterialPreview = items;
    const qty = Number(newPlanQuantity.value) || 1;
    const totalCost = items.reduce((sum, item) => sum + Number(item.itemCost || 0) * qty, 0);
    console.log(`[生产计划] 产品 "${newPlanProductSelect.selectedOptions[0]?.textContent}" 物料需求: ${items.length} 项, 总成本 ¥${totalCost.toFixed(2)}`);
  } catch (err) {
    planMaterialPreview = null;
    console.warn('[生产计划] 自动计算物料失败:', err.message);
  }
});

createPlanButton?.addEventListener('click', createPlan);
openCreatePlanButton?.addEventListener('click', openCreatePlanModal);
emptyCreatePlanButton?.addEventListener('click', openCreatePlanModal);
closeCreatePlanModal?.addEventListener('click', closeCreatePlanDialog);
createPlanModal?.addEventListener('click', event => {
  if (event.target === createPlanModal) {
    closeCreatePlanDialog();
  }
});

renderCalculatorPlaceholder();
await loadProducts();
await loadPlans();
