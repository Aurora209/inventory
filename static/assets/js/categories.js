import { apiGet, apiPost, apiPut, apiDelete, buildMainNav, escapeHtml, setMessage } from './api.js?v=2026062214';

document.getElementById('main-nav').innerHTML = buildMainNav('categories');

const statusEl = document.getElementById('page-status');
const messageEl = document.getElementById('page-message');
const treeEl = document.getElementById('categories-tree');
const modalEl = document.getElementById('category-modal');
const modalTitle = document.getElementById('category-modal-title');
const nameEl = document.getElementById('category-name');
const parentEl = document.getElementById('category-parent');
const modalMessageEl = document.getElementById('category-modal-message');
let categories = [];
let flatCategories = [];
let editingCategory = null;
const collapsedCategories = new Set(JSON.parse(localStorage.getItem('collapsedCategories') || '[]'));

function flatten(nodes = [], level = 1, parentPath = '', parentName = '') {
  return nodes.flatMap(node => {
    const nodeLevel = Number(node.level || level);
    const path = parentPath ? `${parentPath} / ${node.name}` : node.name;
    return [{ ...node, level: nodeLevel, path, parentName }].concat(flatten(node.children || [], nodeLevel + 1, path, node.name));
  });
}
function renderParentOptions(excludeId = null) { parentEl.innerHTML = '<option value="">顶级分类</option>' + flatCategories.filter(c => Number(c.id) !== Number(excludeId)).map(c => `<option value="${c.id}">${'　'.repeat(Math.max(0, c.level - 1))}${escapeHtml(c.name)}</option>`).join(''); }
function getCategoryById(id) { return flatCategories.find(c => Number(c.id) === Number(id)); }
function categoryLevel(category, fallback = 1) { return Number(category.level || fallback || 1); }
function renderCategoryNode(category, fallbackLevel = 1, parentName = '') {
  const level = categoryLevel(category, fallbackLevel);
  const children = category.children || [];
  const hasChildren = children.length > 0;
  const collapsed = collapsedCategories.has(Number(category.id));
  const parentLabel = category.parentName || parentName;
  const productCount = category.product_count !== undefined ? `<span class="category-product-count">产品: ${Number(category.product_count) || 0}</span>` : '';
  const parentId = category.parent_id || '';
  return `
    <div class="category-node category-node-level-${level} ${collapsed ? 'is-collapsed' : ''}" data-id="${category.id}" data-parent-id="${parentId}">
      <div class="category-item level-${Math.min(level, 3)} ${hasChildren ? 'has-children' : ''}">
        <div class="category-content" data-drop-id="${category.id}" data-parent-id="${parentId}" ${hasChildren ? `data-toggle-id="${category.id}" role="button" tabindex="0" title="点击展开/收缩子分类"` : ''}>
          <div class="category-info">
            <span class="category-drag-handle" draggable="true" data-drag-id="${category.id}" data-parent-id="${parentId}" title="拖动调整同级顺序">⋮⋮</span>
            <div class="category-toggle">${hasChildren ? (collapsed ? '▶' : '▼') : ''}</div>
            <div class="category-icon"><span class="icon">${level === 1 ? '📁' : '📄'}</span></div>
            <div class="category-details">
              <div class="category-name">${escapeHtml(category.name)}</div>
              <div class="category-meta">
                <span class="category-id">ID: ${category.id}</span>
                <span class="category-level">层级: ${level}</span>
                ${parentLabel ? `<span class="category-parent">父级: ${escapeHtml(parentLabel)}</span>` : ''}
                ${productCount}
              </div>
            </div>
          </div>
          <div class="category-actions">
            <button class="btn btn-sm btn-success add-child" data-id="${category.id}">➕ 添加子分类</button>
            <button class="btn btn-sm btn-secondary edit-category" data-id="${category.id}">✏️ 编辑</button>
            <button class="btn btn-sm btn-danger delete-category" data-id="${category.id}">🗑️ 删除</button>
          </div>
        </div>
      </div>
      ${hasChildren && !collapsed ? `<div class="children-container">${children.map(child => renderCategoryNode({ ...child, parentName: category.name }, level + 1, category.name)).join('')}</div>` : ''}
    </div>`;
}
function renderTree() {
  flatCategories = flatten(categories);
  if (!flatCategories.length) {
    treeEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📂</div><h3>暂无分类数据</h3><p>还没有创建任何产品分类</p><button class="btn btn-primary" id="empty-add-category">添加第一个分类</button></div>';
    document.getElementById('empty-add-category')?.addEventListener('click', () => openModal());
    return;
  }
  treeEl.innerHTML = `<div class="tree-container">${categories.map(category => renderCategoryNode(category, 1)).join('')}</div>`;
  document.querySelectorAll('[data-toggle-id]').forEach(row => {
    const toggle = () => {
      const id = Number(row.dataset.toggleId);
      if (collapsedCategories.has(id)) collapsedCategories.delete(id);
      else collapsedCategories.add(id);
      localStorage.setItem('collapsedCategories', JSON.stringify([...collapsedCategories]));
      renderTree();
    };
    row.addEventListener('click', e => { if (!e.target.closest('button')) toggle(); });
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });
  setupDragSorting();
  document.querySelectorAll('.add-child').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openModal(null, Number(b.dataset.id)); }));
  document.querySelectorAll('.edit-category').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openModal(Number(b.dataset.id)); }));
  document.querySelectorAll('.delete-category').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); deleteCategory(Number(b.dataset.id)); }));
}
function normalizeParentId(parentId) { return parentId ? Number(parentId) : null; }
function getSiblingList(parentId) {
  const normalizedParentId = normalizeParentId(parentId);
  if (!normalizedParentId) return categories;
  const parent = getCategoryById(normalizedParentId);
  return parent?.children || [];
}
async function saveSiblingOrder(parentId, orderedIds) {
  await apiPut('/categories/reorder', { parent_id: normalizeParentId(parentId), ordered_ids: orderedIds }, '保存分类排序失败');
}
function setupDragSorting() {
  let draggedId = null;
  let draggedParentId = null;
  document.querySelectorAll('.category-drag-handle').forEach(handle => {
    handle.addEventListener('click', e => e.stopPropagation());
    handle.addEventListener('dragstart', e => {
      draggedId = Number(handle.dataset.dragId);
      draggedParentId = handle.dataset.parentId || '';
      e.stopPropagation();
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(draggedId));
      document.querySelector(`[data-id="${draggedId}"]`)?.classList.add('is-dragging');
    });
    handle.addEventListener('dragend', () => {
      document.querySelectorAll('.is-dragging, .drag-over').forEach(el => el.classList.remove('is-dragging', 'drag-over'));
      draggedId = null;
      draggedParentId = null;
    });
  });
  document.querySelectorAll('.category-content').forEach(row => {
    row.addEventListener('dragover', e => {
      if (!draggedId || row.dataset.parentId !== draggedParentId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.closest('.category-node')?.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.closest('.category-node')?.classList.remove('drag-over'));
    row.addEventListener('drop', async e => {
      if (!draggedId || row.dataset.parentId !== draggedParentId) return;
      e.preventDefault();
      e.stopPropagation();
      const targetId = Number(row.dataset.dropId);
      row.closest('.category-node')?.classList.remove('drag-over');
      if (!targetId || targetId === draggedId) return;

      const siblings = getSiblingList(draggedParentId);
      const fromIndex = siblings.findIndex(item => Number(item.id) === draggedId);
      const toIndex = siblings.findIndex(item => Number(item.id) === targetId);
      if (fromIndex < 0 || toIndex < 0) return;

      const [moved] = siblings.splice(fromIndex, 1);
      siblings.splice(toIndex, 0, moved);
      const orderedIds = siblings.map(item => Number(item.id));
      renderTree();
      try {
        statusEl.textContent = '正在保存分类排序...';
        await saveSiblingOrder(draggedParentId, orderedIds);
        statusEl.textContent = '分类排序已保存';
        setMessage(messageEl, '分类排序已保存', 'ok');
      } catch (error) {
        setMessage(messageEl, error.message, 'error');
        await loadCategories();
      }
    });
  });
}
async function loadCategories() { try { statusEl.textContent = '正在加载分类...'; const result = await apiGet('/categories/tree', '加载分类失败'); categories = result.data.categories || []; renderTree(); statusEl.textContent = `已加载 ${categories.length} 个顶级分类`; setMessage(messageEl, '分类树加载成功', 'ok'); } catch (error) { statusEl.textContent = '加载失败'; setMessage(messageEl, error.message, 'error'); } }
function openModal(id = null, parentId = null) {
  editingCategory = id ? getCategoryById(id) : null;
  const parentCategory = parentId ? getCategoryById(parentId) : null;
  modalTitle.textContent = editingCategory ? '编辑分类' : (parentCategory ? '添加子分类' : '添加一级分类');
  renderParentOptions(id);
  nameEl.value = editingCategory?.name || '';
  parentEl.value = editingCategory?.parent_id || parentId || '';
  parentEl.disabled = !!editingCategory || !!parentCategory;
  setMessage(modalMessageEl, parentCategory ? `父级分类：${parentCategory.name}，分类层级：${categoryLevel(parentCategory) + 1}` : '', '');
  modalEl.style.display = 'block';
  document.body.style.overflow = 'hidden';
  nameEl.focus();
}
function closeModal() { modalEl.style.display = 'none'; document.body.style.overflow = ''; editingCategory = null; }
async function saveCategory() { const name = nameEl.value.trim(); if (!name) return setMessage(modalMessageEl, '请输入分类名称', 'error'); try { if (editingCategory) await apiPut(`/categories/${editingCategory.id}`, { name }, '更新分类失败'); else await apiPost('/categories', { name, parent_id: parentEl.value ? Number(parentEl.value) : null }, '创建分类失败'); closeModal(); await loadCategories(); setMessage(messageEl, editingCategory ? '分类已更新' : '分类已创建', 'ok'); } catch (error) { setMessage(modalMessageEl, error.message, 'error'); } }
async function deleteCategory(id) { try { const usage = await apiGet(`/categories/${id}/usage`, '检查分类使用情况失败'); const count = usage.data.product_count || 0; const category = flatCategories.find(c => Number(c.id) === id); const children = flatCategories.filter(c => c.path.startsWith(`${category?.path || ''} /`)).length; const warning = count || children ? `该分类下有 ${count} 个产品、${children} 个子分类，确认删除？` : '确认删除这个分类？'; if (!confirm(warning)) return; await apiDelete(`/categories/${id}`, '删除分类失败'); await loadCategories(); setMessage(messageEl, '分类已删除', 'ok'); } catch (error) { setMessage(messageEl, error.message, 'error'); } }

document.getElementById('add-root-category').addEventListener('click', () => openModal()); document.getElementById('refresh-categories')?.addEventListener('click', loadCategories); document.getElementById('close-category-modal').addEventListener('click', closeModal); document.getElementById('cancel-category').addEventListener('click', closeModal); document.getElementById('save-category').addEventListener('click', saveCategory); modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModal(); }); nameEl.addEventListener('keydown', e => { if (e.key === 'Enter') saveCategory(); });
await loadCategories();
