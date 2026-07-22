import { apiGet, apiPost, apiPut, apiDelete, buildMainNav, escapeHtml, setMessage } from './api.js?v=2026062214';

document.getElementById('main-nav').innerHTML = buildMainNav('unit-converter');

const statusEl = document.getElementById('page-status');
const messageEl = document.getElementById('page-message');
const tabsEl = document.getElementById('unit-tabs');
const fromEl = document.getElementById('unit-from');
const toEl = document.getElementById('unit-to');
const valueEl = document.getElementById('unit-value');
const resultEl = document.getElementById('unit-result');
const formulaEl = document.getElementById('unit-formula');
const referenceEl = document.getElementById('unit-reference');
const customProductSelect = document.getElementById('custom-product-select');
const rulesTitle = document.getElementById('rules-title');
const rulesList = document.getElementById('custom-rules-list');
const customValue = document.getElementById('custom-value');
const customFrom = document.getElementById('custom-from');
const customTo = document.getElementById('custom-to');
const customResult = document.getElementById('custom-result');
const modalEl = document.getElementById('rule-modal');
const ruleProduct = document.getElementById('rule-product');
const ruleFrom = document.getElementById('rule-from');
const ruleTo = document.getElementById('rule-to');
const ruleRate = document.getElementById('rule-rate');
const ruleDesc = document.getElementById('rule-desc');
const rulePreview = document.getElementById('rule-preview');
const ruleTitle = document.getElementById('rule-modal-title');

const categories = {
  length: { name: '长度', base: 'm', units: { mm: { name: '毫米', factor: 0.001 }, cm: { name: '厘米', factor: 0.01 }, m: { name: '米', factor: 1 }, km: { name: '千米', factor: 1000 }, inch: { name: '英寸', factor: 0.0254 }, ft: { name: '英尺', factor: 0.3048 } }, refs: ['1 m = 100 cm', '1 inch = 2.54 cm', '1 ft = 12 inch'] },
  weight: { name: '重量', base: 'g', units: { mg: { name: '毫克', factor: 0.001 }, g: { name: '克', factor: 1 }, kg: { name: '千克', factor: 1000 }, t: { name: '吨', factor: 1000000 }, lb: { name: '磅', factor: 453.59237 }, oz: { name: '盎司', factor: 28.349523125 } }, refs: ['1 kg = 1000 g', '1 lb ≈ 453.592 g', '1 oz ≈ 28.35 g'] },
  volume: { name: '体积/容量', base: 'ml', units: { ml: { name: '毫升', factor: 1 }, l: { name: '升', factor: 1000 }, m3: { name: '立方米', factor: 1000000 }, tsp: { name: '茶匙', factor: 4.92892 }, tbsp: { name: '汤匙', factor: 14.7868 }, floz: { name: '液体盎司', factor: 29.5735 } }, refs: ['1 L = 1000 ml', '1 m³ = 1000000 ml', '1 fl oz ≈ 29.57 ml'] },
  area: { name: '面积', base: 'm2', units: { cm2: { name: '平方厘米', factor: 0.0001 }, m2: { name: '平方米', factor: 1 }, km2: { name: '平方千米', factor: 1000000 }, sqft: { name: '平方英尺', factor: 0.092903 }, acre: { name: '英亩', factor: 4046.8564224 } }, refs: ['1 m² = 10000 cm²', '1 sqft ≈ 0.0929 m²', '1 acre ≈ 4046.86 m²'] },
  temperature: { name: '温度', base: 'c', units: { c: { name: '摄氏度' }, f: { name: '华氏度' }, k: { name: '开尔文' } }, refs: ['°F = °C × 9/5 + 32', 'K = °C + 273.15'] }
};
let activeCategory = 'length';
let products = [];
let productConversions = [];
let editingRuleId = null;

function unitLabel(key, unit) { return `${unit.name} (${key})`; }
function renderTabs() { tabsEl.innerHTML = Object.entries(categories).map(([key, cat]) => `<button type="button" class="btn ${key === activeCategory ? 'btn-primary' : 'btn-secondary'} unit-tab" data-key="${key}">${escapeHtml(cat.name)}</button>`).join(''); document.querySelectorAll('.unit-tab').forEach(btn => btn.addEventListener('click', () => switchCategory(btn.dataset.key))); }
function renderUnits() { const cat = categories[activeCategory]; const options = Object.entries(cat.units).map(([key, unit]) => `<option value="${key}">${escapeHtml(unitLabel(key, unit))}</option>`).join(''); fromEl.innerHTML = options; toEl.innerHTML = options; const keys = Object.keys(cat.units); fromEl.value = keys[0]; toEl.value = keys[1] || keys[0]; referenceEl.innerHTML = cat.refs.map(ref => `<div class="reference-item">${escapeHtml(ref)}</div>`).join(''); convert(); }
function switchCategory(key) { activeCategory = key; renderTabs(); renderUnits(); }
function toCelsius(value, unit) { if (unit === 'f') return (value - 32) * 5 / 9; if (unit === 'k') return value - 273.15; return value; }
function fromCelsius(value, unit) { if (unit === 'f') return value * 9 / 5 + 32; if (unit === 'k') return value + 273.15; return value; }
function convert() { const value = Number(valueEl.value || 0); let result; if (activeCategory === 'temperature') { const c = toCelsius(value, fromEl.value); result = fromCelsius(c, toEl.value); formulaEl.textContent = `以摄氏度为中间基准换算`; } else { const cat = categories[activeCategory]; const base = value * cat.units[fromEl.value].factor; result = base / cat.units[toEl.value].factor; formulaEl.textContent = `${value} × ${cat.units[fromEl.value].factor} ÷ ${cat.units[toEl.value].factor}`; } resultEl.textContent = `${Number(result.toFixed(6)).toLocaleString('zh-CN')} ${toEl.value}`; }

async function loadProducts() { const res = await apiGet('/products?page=1&per_page=100', '加载产品失败'); products = res.data || []; const opts = '<option value="">选择产品</option>' + products.map(p => `<option value="${p.id}">${escapeHtml(p.sku || '')} - ${escapeHtml(p.name || '')}</option>`).join(''); customProductSelect.innerHTML = opts; ruleProduct.innerHTML = opts; }
async function loadProductConversions() { const id = Number(customProductSelect.value); if (!id) { productConversions = []; renderRules(); return; } const res = await apiGet(`/products/${id}/conversions`, '加载转换规则失败'); productConversions = res.data || []; renderRules(); }
function getProductUnits() { const units = new Set(); productConversions.forEach(r => { units.add(r.from_unit); units.add(r.to_unit); }); return Array.from(units); }
function renderRules() { const product = products.find(p => Number(p.id) === Number(customProductSelect.value)); rulesTitle.textContent = product ? `${product.name} 的转换规则` : '转换规则'; if (!product) { rulesList.innerHTML = '<p class="message">请选择产品后管理自定义单位规则</p>'; customFrom.innerHTML = customTo.innerHTML = '<option value="">选择单位</option>'; convertCustomUnits(); return; } rulesList.innerHTML = productConversions.length ? productConversions.map(r => `<div class="list-row"><div><strong>1 ${escapeHtml(r.from_unit)} = ${escapeHtml(r.conversion_rate)} ${escapeHtml(r.to_unit)}</strong><p class="message">${escapeHtml(r.description || '')}</p></div><div class="bom-action-group"><button class="btn btn-secondary btn-sm edit-rule" data-id="${r.id}">编辑</button><button class="btn btn-danger btn-sm delete-rule" data-id="${r.id}">删除</button></div></div>`).join('') : '<p class="message">该产品还没有设置自定义单位转换规则</p>'; const unitOptions = '<option value="">选择单位</option>' + getProductUnits().map(u => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join(''); customFrom.innerHTML = unitOptions; customTo.innerHTML = unitOptions; document.querySelectorAll('.edit-rule').forEach(b => b.addEventListener('click', () => openRuleModal(Number(b.dataset.id)))); document.querySelectorAll('.delete-rule').forEach(b => b.addEventListener('click', () => deleteRule(Number(b.dataset.id)))); convertCustomUnits(); }
function findPath(from, to) { const graph = {}; productConversions.forEach(r => { (graph[r.from_unit] ||= []).push([r.to_unit, Number(r.conversion_rate)]); (graph[r.to_unit] ||= []).push([r.from_unit, 1 / Number(r.conversion_rate)]); }); const queue = [[from, 1]]; const seen = new Set([from]); while (queue.length) { const [u, rate] = queue.shift(); if (u === to) return rate; (graph[u] || []).forEach(([v, r]) => { if (!seen.has(v)) { seen.add(v); queue.push([v, rate * r]); } }); } return null; }
function convertCustomUnits() { const value = Number(customValue.value || 0); if (!customProductSelect.value || !customFrom.value || !customTo.value) { customResult.textContent = '请选择产品和单位'; return; } if (customFrom.value === customTo.value) { customResult.textContent = `${value} ${customTo.value}`; return; } const rate = findPath(customFrom.value, customTo.value); customResult.textContent = rate ? `${value} ${customFrom.value} = ${Number((value * rate).toFixed(6)).toLocaleString('zh-CN')} ${customTo.value}` : '未找到可用转换路径'; }
function openRuleModal(id = null) { editingRuleId = id; const rule = productConversions.find(r => Number(r.id) === id); ruleTitle.textContent = rule ? '编辑转换规则' : '添加自定义转换'; ruleProduct.value = rule?.product_id || customProductSelect.value || ''; ruleProduct.disabled = !!rule; ruleFrom.value = rule?.from_unit || ''; ruleTo.value = rule?.to_unit || ''; ruleRate.value = rule?.conversion_rate || 1; ruleDesc.value = rule?.description || ''; updatePreview(); modalEl.style.display = 'block'; document.body.style.overflow = 'hidden'; }
function closeRuleModal() { modalEl.style.display = 'none'; document.body.style.overflow = ''; editingRuleId = null; }
function updatePreview() { rulePreview.textContent = ruleFrom.value && ruleTo.value && ruleRate.value ? `预览：1 ${ruleFrom.value} = ${ruleRate.value} ${ruleTo.value}` : ''; }
async function saveRule() { const productId = Number(ruleProduct.value); const payload = { from_unit: ruleFrom.value.trim(), to_unit: ruleTo.value.trim(), conversion_rate: Number(ruleRate.value), description: ruleDesc.value.trim() }; if (!productId || !payload.from_unit || !payload.to_unit || !payload.conversion_rate) return setMessage(rulePreview, '请填写完整规则信息', 'error'); if (editingRuleId) await apiPut(`/products/${productId}/conversions/${editingRuleId}`, payload, '保存转换规则失败'); else await apiPost(`/products/${productId}/conversions`, payload, '保存转换规则失败'); customProductSelect.value = String(productId); await loadProductConversions(); closeRuleModal(); setMessage(messageEl, '转换规则已保存', 'ok'); }
async function deleteRule(id) { if (!confirm('确定要删除这个转换规则吗？')) return; await apiDelete(`/products/${customProductSelect.value}/conversions/${id}`, '删除转换规则失败'); await loadProductConversions(); setMessage(messageEl, '转换规则已删除', 'ok'); }

renderTabs(); renderUnits();
valueEl.addEventListener('input', convert); fromEl.addEventListener('change', convert); toEl.addEventListener('change', convert); document.getElementById('unit-swap').addEventListener('click', () => { const t = fromEl.value; fromEl.value = toEl.value; toEl.value = t; convert(); });
customProductSelect.addEventListener('change', loadProductConversions); customValue.addEventListener('input', convertCustomUnits); customFrom.addEventListener('change', convertCustomUnits); customTo.addEventListener('change', convertCustomUnits); document.getElementById('open-rule-modal').addEventListener('click', () => openRuleModal()); document.getElementById('close-rule-modal').addEventListener('click', closeRuleModal); document.getElementById('cancel-rule').addEventListener('click', closeRuleModal); document.getElementById('save-rule').addEventListener('click', saveRule); [ruleFrom, ruleTo, ruleRate].forEach(el => el.addEventListener('input', updatePreview)); modalEl.addEventListener('click', e => { if (e.target === modalEl) closeRuleModal(); });
try { await loadProducts(); statusEl.textContent = '已就绪'; } catch (error) { statusEl.textContent = '加载失败'; setMessage(messageEl, error.message, 'error'); }
