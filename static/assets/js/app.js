import { API_ORIGIN, getDefaultApiOrigin, saveApiOrigin } from './config.js?v=2026051301';

const apiOriginInput = document.createElement('input');
apiOriginInput.className = 'input';
apiOriginInput.value = API_ORIGIN;
apiOriginInput.style.minWidth = '260px';

const saveButton = document.createElement('button');
saveButton.textContent = '保存 API 地址';
saveButton.addEventListener('click', () => {
  saveApiOrigin(apiOriginInput.value.trim() || getDefaultApiOrigin());
  window.location.reload();
});

document.querySelector('.hero')?.insertAdjacentElement('afterend', (() => {
  const section = document.createElement('section');
  section.className = 'card';
  section.style.marginTop = '16px';
  const title = document.createElement('h3');
  title.textContent = '后端 API 配置';
  const desc = document.createElement('p');
  desc.textContent = `默认地址为当前页面地址（${getDefaultApiOrigin()}），也可以改成其他后端服务地址。`;
  const row = document.createElement('div');
  row.className = 'toolbar';
  row.appendChild(apiOriginInput);
  row.appendChild(saveButton);
  section.appendChild(title);
  section.appendChild(desc);
  section.appendChild(row);
  return section;
})());

async function checkHealth() {
  const statusEl = document.getElementById('api-status');
  try {
    const res = await fetch(`${API_ORIGIN}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (statusEl) {
      statusEl.textContent = `API 正常：${data.status}`;
      statusEl.style.background = '#ecfdf5';
      statusEl.style.color = '#059669';
    }
  } catch (error) {
    if (statusEl) {
      statusEl.textContent = 'API 未连接';
      statusEl.style.background = '#fef2f2';
      statusEl.style.color = '#dc2626';
    }
  }
}

document.getElementById('check-health')?.addEventListener('click', checkHealth);
checkHealth();
