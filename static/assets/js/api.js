import { API_BASE, API_ORIGIN } from './config.js?v=2026051301';

function getErrorMessage(response, data, fallback = '请求失败') {
  return data?.error?.message || data?.message || `${fallback}: ${response.status}`;
}

export async function apiRequest(path, options = {}, fallback = '请求失败') {
  const response = await fetch(`${API_BASE}${path}`, { cache: 'no-store', ...options });
  const data = await response.json();
  if (!response.ok || data.success === false) {
    throw new Error(getErrorMessage(response, data, fallback));
  }
  return data;
}

export async function apiGet(path, fallback = '请求失败') {
  return apiRequest(path, {}, fallback);
}

export async function apiPost(path, body, fallback = '请求失败') {
  return apiRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  }, fallback);
}

export async function apiPut(path, body, fallback = '请求失败') {
  return apiRequest(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, fallback);
}

export async function apiDelete(path, fallback = '请求失败') {
  const response = await fetch(`${API_BASE}${path}`, { method: 'DELETE' });
  if (response.status === 204) {
    return { success: true };
  }
  const data = await response.json();
  if (!response.ok || data.success === false) {
    throw new Error(getErrorMessage(response, data, fallback));
  }
  return data;
}

export async function fetchJsonByUrl(url, fallback = '请求失败', options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok || data.success === false) {
    throw new Error(getErrorMessage(response, data, fallback));
  }
  return data;
}

export { API_ORIGIN };

export function formatCurrency(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2
  }).format(number);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function setMessage(el, text, type = '') {
  if (!el) return;
  el.className = `message ${type}`.trim();
  el.textContent = text;
}

export function buildMainNav(current = '') {
  const primaryLinks = [
    ['/', '仪表板', '⌂', current === 'dashboard'],
    ['/pages/products.html', '产品管理', '□', current === 'products'],
    ['/pages/purchase-orders.html', '采购订单', '↙', current === 'purchase-orders'],
    ['/pages/sales-orders.html', '销售订单', '↗', current === 'sales-orders'],
    ['/pages/bom.html', 'BOM管理', '◇', current === 'bom'],
    ['/pages/production.html', '生产管理', '⚙', current === 'production'],
    ['/pages/inventory.html', '库存管理', '≡', current === 'inventory']
  ];

  const toolLinks = [
    ['/pages/system-config.html', '系统配置', '⚙', current === 'system-config'],
    ['/pages/unit-converter.html', '单位换算器', '⇄', current === 'unit-converter'],
    ['/pages/exchange-rate.html', '汇率换算', '¥', current === 'exchange-rate'],
    ['/pages/categories.html', '产品分类', '▦', current === 'categories'],
    ['/pages/reports.html', '报表中心', '▤', current === 'reports'],
    ['/pages/packing-list.html', '装箱单', '▣', current === 'packing-list'],
    ['/pages/labels.html', '箱唛标签', '⌑', current === 'labels']
  ];

  const renderNavLabel = (icon, label) =>
    `<span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span>`;

  const primaryHtml = primaryLinks.map(([href, label, icon, active]) =>
    `<li><a href="${href}" class="nav-link${active ? ' active' : ''}">${renderNavLabel(icon, label)}</a></li>`
  ).join('');

  const toolHtml = toolLinks.map(([href, label, icon, active]) =>
    `<li><a href="${href}" class="nav-link${active ? ' active' : ''}">${renderNavLabel(icon, label)}</a></li>`
  ).join('');

  return `
    <div class="nav-container">
      <ul class="nav-list">
        ${primaryHtml}
        <li class="dropdown">
          <a href="javascript:void(0)" class="nav-link dropdown-toggle">${renderNavLabel('⋯', '辅助工具')}</a>
          <ul class="dropdown-menu">
            ${toolHtml}
          </ul>
        </li>
      </ul>
    </div>
  `;
}
