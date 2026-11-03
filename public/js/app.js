// ==============================================================
// CAMHOUSE BY C&A — FRONTEND APPLICATION CONTROLLER
// ==============================================================

const socket = io();

// State
let currentLine = 'linea_reclutamiento'; // 'linea_reclutamiento' | 'linea_administracion'
let currentContactId = null;
let currentFilterTag = 'all';
let currentSearchQuery = '';
let currentChats = [];
let knowledgeBaseData = {};
let allLinesStatus = {};
let soundEnabled = true;

// Audio alert
const alertAudio = document.getElementById('audio-alert');

// ==============================================================
// INITIALIZATION & REAL-TIME EVENTS
// ==============================================================

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  setupLiveClock();
  setupSocketListeners();
  loadKnowledgeBase();
  loadMetrics();
  loadChats();
  checkAppUpdates();
});

// Verificación periódica de actualizaciones cada 15 minutos
setInterval(checkAppUpdates, 15 * 60 * 1000);

async function checkAppUpdates() {
  try {
    const res = await fetch('/api/system/check-update', { method: 'POST' });
    const data = await res.json();
    if (data && data.updateAvailable) {
      const banner = document.getElementById('ota-update-banner');
      const tag = document.getElementById('ota-version-tag');
      const changelog = document.getElementById('ota-changelog-text');
      if (tag) tag.textContent = `v${data.latestVersion}`;
      if (changelog && data.changelog) changelog.textContent = data.changelog;
      if (banner) banner.classList.remove('hidden');
    }
  } catch (e) {
    // Silencioso si no hay internet o GitHub no responde
  }
}

function dismissUpdateBanner() {
  document.getElementById('ota-update-banner')?.classList.add('hidden');
}

async function applySystemUpdate() {
  const btn = document.getElementById('btn-apply-update');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Instalando actualización...';
  }

  showToast('Descargando e instalando actualización desde GitHub...', 'normal');

  try {
    const res = await fetch('/api/system/apply-update', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      if (btn) btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> ¡Listo! Reiniciando...';
      showToast('¡Actualización completada! Reiniciando la app en 3 segundos...', 'success');

      setTimeout(() => {
        window.location.reload();
      }, 3500);
    } else {
      throw new Error(data.error || 'Error desconocido al actualizar');
    }
  } catch (err) {
    alert(`No se pudo aplicar la actualización: ${err.message}`);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Reintentar Actualización';
    }
  }
}

// Reloj digital en vivo en cabecera
function setupLiveClock() {
  const clockElem = document.getElementById('live-clock-text');
  function updateTime() {
    const now = new Date();
    if (clockElem) {
      clockElem.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  }
  updateTime();
  setInterval(updateTime, 1000);
}

function setupSocketListeners() {
  // Inicialización de estado completo
  socket.on('init_status', (data) => {
    allLinesStatus = data.lines || {};
    updateActiveLineHeaderStatus();
    updateQRScreen();
    updateLineTabsStatus();
    if (data.metrics) {
      renderKPISummary(data.metrics.summary);
      initMetricsCharts(data.metrics);
    }
  });

  // Cambio de estado o QR de alguna línea
  socket.on('line_status_change', (lineState) => {
    allLinesStatus[lineState.key] = lineState;
    updateLineTabsStatus();
    if (lineState.key === currentLine) {
      updateActiveLineHeaderStatus();
      updateQRScreen();
    }
  });

  // Mensaje nuevo
  socket.on('new_message', (data) => {
    if (data.line === currentLine) {
      if (currentContactId === data.chatId) {
        appendMessageToPane(data.message);
        scrollChatToBottom();
      }
      loadChats(false);
    }
  });

  // Chat actualizado
  socket.on('chat_updated', (data) => {
    if (data.line === currentLine) {
      if (currentContactId === data.chat.id) {
        updateActiveChatHeader(data.chat);
      }
      loadChats(false);
    }
  });

  // ALERTA DE DERIVACIÓN A ASESOR HUMANO (Handoff)
  socket.on('human_handoff_requested', (alertData) => {
    console.warn('¡ALERTA DE DERIVACIÓN DETECTADA!', alertData);
    if (soundEnabled) playAlertSound();

    // Activar indicador parpadeante en el selector de línea correspondiente
    const badgeId = alertData.line === 'linea_reclutamiento' ? 'badge-derivation-line1' : 'badge-derivation-line2';
    document.getElementById(badgeId)?.classList.remove('hidden');

    showToast(`🚨 ${alertData.contactName} solicita: "${alertData.reason}"`, 'alert');

    if (currentLine === alertData.line && currentContactId === alertData.chatId) {
      showEscalationBanner();
    }

    loadChats(false);
  });

  // Alerta en chat manual
  socket.on('operator_alert', (data) => {
    showToast(`💬 ${data.name}: ${data.text}`, 'normal');
  });

  // Chat eliminado en tiempo real
  socket.on('chat_deleted', (data) => {
    if (data.line === currentLine) {
      if (currentContactId === data.contactId) {
        currentContactId = null;
        closeChatDrawer();
      }
      loadChats(false);
    }
  });

  // Lista vaciada en tiempo real
  socket.on('all_chats_cleared', (data) => {
    if (data.line === currentLine) {
      currentContactId = null;
      closeChatDrawer();
      loadChats(false);
    }
  });

  // Métricas actualizadas en tiempo real
  socket.on('metrics_updated', (data) => {
    if (data.metrics) {
      renderKPISummary(data.metrics.summary);
      initMetricsCharts(data.metrics);
    }
  });
}

function playAlertSound() {
  if (alertAudio && soundEnabled) {
    alertAudio.currentTime = 0;
    alertAudio.play().catch(() => {});
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  const btn = document.getElementById('btn-toggle-sound');
  if (btn) {
    btn.innerHTML = soundEnabled ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
    btn.style.color = soundEnabled ? 'var(--text-secondary)' : 'var(--status-rose)';
  }
  showToast(soundEnabled ? 'Sonido activado' : 'Sonido silenciado', 'normal');
}

function showToast(message, type = 'normal') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-item ${type === 'alert' ? 'alert' : 'success'}`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'alert' ? 'fa-bell fa-shake' : 'fa-circle-check'}"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 4500);
}

// ==============================================================
// SELECTOR DE LÍNEA (Línea 1 Reclutamiento vs Línea 2 Admin)
// ==============================================================

function switchActiveLine(lineKey) {
  currentLine = lineKey;

  // Actualizar botones de selector
  document.getElementById('btn-line-1')?.classList.toggle('active', lineKey === 'linea_reclutamiento');
  document.getElementById('btn-line-2')?.classList.toggle('active', lineKey === 'linea_administracion');
  document.getElementById('qr-tab-line1')?.classList.toggle('active', lineKey === 'linea_reclutamiento');
  document.getElementById('qr-tab-line2')?.classList.toggle('active', lineKey === 'linea_administracion');
  document.getElementById('hdr-btn-line1')?.classList.toggle('active', lineKey === 'linea_reclutamiento');
  document.getElementById('hdr-btn-line2')?.classList.toggle('active', lineKey === 'linea_administracion');

  // Quitar alerta visual de esta línea
  const badgeId = lineKey === 'linea_reclutamiento' ? 'badge-derivation-line1' : 'badge-derivation-line2';
  document.getElementById(badgeId)?.classList.add('hidden');

  // Actualizar descripciones de la vista QR
  const qrDesc = document.getElementById('qr-target-line-desc');
  const sessionFolder = document.getElementById('txt-session-folder');
  if (qrDesc) {
    qrDesc.textContent = lineKey === 'linea_reclutamiento'
      ? 'Escanea con tu WhatsApp para conectar la Línea 1 (Reclutamiento)'
      : 'Escanea con tu WhatsApp para conectar la Línea 2 (Reclutamiento 2)';
  }
  if (sessionFolder) {
    sessionFolder.textContent = `./auth_sessions/${lineKey}`;
  }

  // Actualizar títulos de la tabla de monitoreo
  const monTitle = document.getElementById('txt-monitoring-title');
  const monSub = document.getElementById('txt-monitoring-subtitle');
  if (monTitle) {
    monTitle.textContent = lineKey === 'linea_reclutamiento'
      ? 'Monitoreo de Aspirantes y Estado del Asistente (Línea 1)'
      : 'Monitoreo de Aspirantes y Estado del Asistente (Línea 2)';
  }
  if (monSub) {
    monSub.textContent = 'Supervisa las conversaciones activas y pausa o reactiva la IA con un solo clic.';
  }

  updateActiveLineHeaderStatus();
  updateQRScreen();
  updateLineTabsStatus();

  currentContactId = null;
  loadChats(true);
}

function updateLineTabsStatus() {
  const l1State = allLinesStatus['linea_reclutamiento'];
  const l2State = allLinesStatus['linea_administracion'];

  const pillL1 = document.getElementById('qr-pill-status-line1');
  if (pillL1) {
    const isL1ActuallyConnected = l1State && (l1State.status === 'connected' || (l1State.user?.phone && !l1State.qrDataUrl && l1State.status !== 'disconnected'));
    if (isL1ActuallyConnected) {
      pillL1.textContent = l1State.user?.phone ? `● Conectado (+${l1State.user.phone})` : '● Conectado';
      pillL1.style.color = 'var(--status-emerald)';
    } else if (l1State && l1State.status === 'qr_ready') {
      pillL1.textContent = '● Esperando Escaneo QR';
      pillL1.style.color = 'var(--status-amber)';
    } else {
      pillL1.textContent = '● Desconectado / Iniciando...';
      pillL1.style.color = 'var(--status-rose)';
    }
  }

  const pillL2 = document.getElementById('qr-pill-status-line2');
  if (pillL2) {
    const isL2ActuallyConnected = l2State && (l2State.status === 'connected' || (l2State.user?.phone && !l2State.qrDataUrl && l2State.status !== 'disconnected'));
    if (isL2ActuallyConnected) {
      pillL2.textContent = l2State.user?.phone ? `● Conectado (+${l2State.user.phone})` : '● Conectado';
      pillL2.style.color = 'var(--status-emerald)';
    } else if (l2State && l2State.status === 'qr_ready') {
      pillL2.textContent = '● Esperando Escaneo QR';
      pillL2.style.color = 'var(--status-amber)';
    } else {
      pillL2.textContent = '● Desconectado / Iniciando...';
      pillL2.style.color = 'var(--status-rose)';
    }
  }

  document.getElementById('qr-tab-line1')?.classList.toggle('active', currentLine === 'linea_reclutamiento');
  document.getElementById('qr-tab-line2')?.classList.toggle('active', currentLine === 'linea_administracion');
  document.getElementById('hdr-btn-line1')?.classList.toggle('active', currentLine === 'linea_reclutamiento');
  document.getElementById('hdr-btn-line2')?.classList.toggle('active', currentLine === 'linea_administracion');
}

// ==============================================================
// TABS DE NAVEGACIÓN
// ==============================================================

const tabHeaders = {
  qr: { title: 'Conexión de WhatsApp', subtitle: 'Vincula y monitorea el estado del asistente en tiempo real' },
  chats: { title: 'Gestión de Visitantes & Asesores', subtitle: 'Control de chats activos y alternancia entre IA y atención humana' },
  knowledge: { title: 'Base de Conocimiento', subtitle: 'Edita los porcentajes, sedes y reglas de CamHouse sincronizadas con IA' },
  metrics: { title: 'Métricas & Conversión', subtitle: 'Analítica de aspirantes, horarios pico y efectividad de casting' },
  simulator: { title: 'Simulador de Pruebas', subtitle: 'Verifica respuestas y derivaciones con Groq AI en ultra-baja latencia' }
};

function switchTab(tabId) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(el => el.classList.remove('active'));

  const targetTab = document.getElementById(`tab-${tabId}`);
  if (targetTab) targetTab.classList.add('active');

  const clickedNav = Array.from(document.querySelectorAll('.nav-item')).find(el => el.getAttribute('onclick')?.includes(`'${tabId}'`));
  if (clickedNav) clickedNav.classList.add('active');

  // Actualizar Header
  const headerMeta = tabHeaders[tabId];
  if (headerMeta) {
    const titleEl = document.getElementById('page-title');
    const subEl = document.getElementById('page-subtitle');
    if (titleEl) titleEl.textContent = headerMeta.title;
    if (subEl) subEl.textContent = headerMeta.subtitle;
  }

  if (tabId === 'qr') updateQRScreen();
  if (tabId === 'metrics') loadMetrics();
}

// ==============================================================
// VISTA QR Y CONEXIÓN
// ==============================================================

function updateActiveLineHeaderStatus() {
  const lineState = allLinesStatus[currentLine];
  const pill = document.getElementById('pill-current-status');
  const txt = document.getElementById('txt-current-status');
  const dotQR = document.getElementById('dot-nav-qr');

  if (!lineState || !pill || !txt) return;

  const isPaired = Boolean(lineState.user?.phone);
  const isActuallyConnected = lineState.status === 'connected' || (isPaired && !lineState.qrDataUrl && lineState.status !== 'disconnected');

  if (isActuallyConnected) {
    pill.className = 'connection-status-pill';
    txt.textContent = lineState.user?.phone ? `● Conectado (+${lineState.user.phone})` : '● Conectado';
    if (dotQR) dotQR.style.background = 'var(--status-emerald)';
  } else if (lineState.status === 'qr_ready') {
    pill.className = 'connection-status-pill connecting';
    txt.textContent = '● Esperando Escaneo QR';
    if (dotQR) dotQR.style.background = 'var(--status-amber)';
  } else {
    pill.className = 'connection-status-pill connecting';
    txt.textContent = '● Desconectado / Iniciando...';
    if (dotQR) dotQR.style.background = 'var(--status-rose)';
  }
}

function updateQRScreen() {
  const lineState = allLinesStatus[currentLine];
  if (!lineState) return;

  const loadingBox = document.getElementById('qr-state-loading');
  const imgQR = document.getElementById('img-qr-code');
  const connectedBox = document.getElementById('box-qr-connected');
  const phoneTxt = document.getElementById('txt-connected-phone');

  const isPaired = Boolean(lineState.user?.phone);
  const isActuallyConnected = lineState.status === 'connected' || (isPaired && !lineState.qrDataUrl && lineState.status !== 'disconnected');

  if (isActuallyConnected) {
    if (loadingBox) loadingBox.classList.add('hidden');
    if (imgQR) imgQR.classList.add('hidden');
    if (connectedBox) connectedBox.classList.remove('hidden');
    if (phoneTxt) phoneTxt.textContent = lineState.user?.phone ? `+${lineState.user.phone}` : 'Sesión Activa';
  } else if (lineState.qrDataUrl) {
    // Mantener el código QR fijo y visible sin parpadeos mientras el usuario escanea
    if (loadingBox) loadingBox.classList.add('hidden');
    if (connectedBox) connectedBox.classList.add('hidden');
    if (imgQR) {
      imgQR.src = lineState.qrDataUrl;
      imgQR.classList.remove('hidden');
    }
  } else {
    if (imgQR) imgQR.classList.add('hidden');
    if (connectedBox) connectedBox.classList.add('hidden');
    if (loadingBox) loadingBox.classList.remove('hidden');
  }
}

async function restartActiveWhatsAppLine() {
  try {
    showToast(`Reiniciando conexión para ${currentLine}...`, 'normal');
    await fetch(`/api/lines/${currentLine}/restart`, { method: 'POST' });
  } catch (e) {
    console.error(e);
  }
}

async function logoutActiveWhatsAppLine() {
  if (!confirm(`¿Deseas desvincular la sesión de WhatsApp de la línea actual? Tendrás que escanear un nuevo código.`)) return;
  try {
    showToast(`Desvinculando cuenta de ${currentLine}...`, 'normal');
    await fetch(`/api/lines/${currentLine}/logout`, { method: 'POST' });
  } catch (e) {
    console.error(e);
  }
}

// ==============================================================
// BANDEJA DE CHATS & ASESORES
// ==============================================================

async function loadChats(autoSelectFirst = false) {
  try {
    const res = await fetch(`/api/chats/${currentLine}`);
    const json = await res.json();
    if (json.success) {
      currentChats = json.chats || [];
      renderContactsList();

      const totalCount = currentChats.length;
      const badgeElem = document.getElementById('badge-pending-chats');
      if (badgeElem) badgeElem.textContent = totalCount;

      if ((autoSelectFirst || !currentContactId) && currentChats.length > 0) {
        selectChat(currentChats[0].id);
      }
    }
  } catch (err) {
    console.error('Error cargando chats:', err);
  }
}

function renderContactsList() {
  const tableBody = document.getElementById('visitors-table-body');
  if (!tableBody) return;

  let filtered = currentChats.filter(chat => {
    const q = currentSearchQuery.toLowerCase();
    const matchSearch = chat.name.toLowerCase().includes(q) || chat.phone.toLowerCase().includes(q) || (chat.last_message || '').toLowerCase().includes(q);
    if (!matchSearch) return false;

    if (currentFilterTag === 'human') return chat.requires_human;
    if (currentFilterTag === 'ai') return chat.ai_mode;
    if (currentFilterTag === 'manual') return !chat.ai_mode;
    return true;
  });

  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 36px 16px; text-align: center; color: var(--text-tertiary); font-size: 13px;">
          <i class="fa-solid fa-inbox" style="font-size: 22px; margin-bottom: 8px; display: block;"></i>
          No se encontraron visitantes o conversaciones en este filtro.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filtered.map(chat => {
    const initials = chat.name ? chat.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
    const timeFormatted = formatTime(chat.last_timestamp);
    const lastMsgSnippet = chat.last_message ? `"${escapeHtml(chat.last_message)}"` : '<em>Sin mensajes recientes</em>';

    // Estado del bot pill badge
    let statusPill = '';
    if (chat.requires_human) {
      statusPill = `<span class="pill-status-bot pill-bot-handoff"><i class="fa-solid fa-triangle-exclamation"></i> Asesor Requerido</span>`;
    } else if (chat.ai_mode) {
      statusPill = `<span class="pill-status-bot pill-bot-ai"><i class="fa-solid fa-robot"></i> Atendido por IA</span>`;
    } else {
      statusPill = `<span class="pill-status-bot pill-bot-manual"><i class="fa-solid fa-user-pen"></i> Modo Manual</span>`;
    }

    // Botón de acción rápida (Pausar / Reanudar IA)
    const toggleAIBtn = chat.ai_mode
      ? `<button class="btn-table-action btn-table-pause" onclick="event.stopPropagation(); toggleAIModeForContact('${chat.id}', false)"><i class="fa-solid fa-pause"></i> Pausar</button>`
      : `<button class="btn-table-action btn-table-resume" onclick="event.stopPropagation(); toggleAIModeForContact('${chat.id}', true)"><i class="fa-solid fa-play"></i> Reanudar</button>`;

    return `
      <tr onclick="openChatDrawer('${chat.id}')">
        <td>
          <div class="visitor-cell">
            <div class="visitor-avatar ${chat.requires_human ? 'avatar-handoff' : ''}">
              ${initials}
            </div>
            <span class="visitor-name">${escapeHtml(chat.name)}</span>
          </div>
        </td>
        <td class="phone-cell">${escapeHtml(chat.phone || 'WhatsApp Directo')}</td>
        <td class="last-message-cell" title="${escapeHtml(chat.last_message || '')}">${lastMsgSnippet}</td>
        <td class="time-cell">${timeFormatted}</td>
        <td>${statusPill}</td>
        <td>
          <div class="actions-cell">
            ${toggleAIBtn}
            <button class="btn-table-action btn-table-open" onclick="event.stopPropagation(); openChatDrawer('${chat.id}')">
              <i class="fa-solid fa-comments"></i> Abrir Chat
            </button>
            <button class="btn-table-action btn-table-delete" onclick="event.stopPropagation(); deleteOrClearChat('${escapeHtml(chat.id)}')" title="Eliminar Conversación">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openChatDrawer(contactId) {
  selectChat(contactId);
  const modal = document.getElementById('drawer-chat-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeChatDrawer() {
  const modal = document.getElementById('drawer-chat-modal');
  if (modal) modal.classList.add('hidden');
}

async function toggleAIModeForContact(contactId, enabled) {
  try {
    const res = await fetch(`/api/chats/${currentLine}/${encodeURIComponent(contactId)}/ai-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_mode: enabled })
    });
    const json = await res.json();
    if (json.success) {
      showToast(enabled ? '🤖 Modo IA activado para el contacto' : '⏸ IA pausada para el contacto', 'normal');
      loadChats(false);
    }
  } catch (e) {
    console.error(e);
  }
}

async function clearAllChatsList() {
  if (!confirm('¿Estás seguro de que deseas vaciar y eliminar todas las conversaciones de esta lista?')) return;
  
  // Actualización optimista inmediata
  currentChats = [];
  currentContactId = null;
  renderContactsList();
  closeChatDrawer();
  const badgeElemClear = document.getElementById('badge-pending-chats');
  if (badgeElemClear) badgeElemClear.textContent = '0';

  try {
    const res = await fetch(`/api/chats/${currentLine}`, {
      method: 'DELETE'
    });
    const json = await res.json();
    if (json.success) {
      showToast('🗑️ Lista de conversaciones vaciada con éxito', 'normal');
    }
  } catch (e) {
    console.error('Error vaciando lista (intentando fallback):', e);
    try {
      await fetch(`/api/chats/${currentLine}/clear-all`, { method: 'POST' });
      showToast('🗑️ Lista de conversaciones vaciada con éxito', 'normal');
    } catch (e2) {
      console.error('Fallback falló:', e2);
      loadChats(false);
    }
  }
}

// Mantener alias por compatibilidad con cualquier llamada legacy
function clearChatsFilter() {
  clearAllChatsList();
}

async function deleteOrClearChat(contactId) {
  if (!confirm('¿Deseas eliminar permanentemente esta conversación de la lista?')) return;

  // Actualización optimista inmediata: desaparece de la vista al instante
  currentChats = currentChats.filter(c => c.id !== contactId && c.phone !== contactId);
  renderContactsList();
  const badgeElemDel = document.getElementById('badge-pending-chats');
  if (badgeElemDel) badgeElemDel.textContent = currentChats.length;

  if (currentContactId === contactId) {
    currentContactId = null;
    closeChatDrawer();
  }

  try {
    const res = await fetch(`/api/chats/${currentLine}/${encodeURIComponent(contactId)}`, {
      method: 'DELETE'
    });
    const json = await res.json();
    if (json.success) {
      showToast('🗑️ Conversación eliminada con éxito', 'normal');
    }
  } catch (e) {
    console.error('Error eliminando chat (intentando fallback):', e);
    try {
      await fetch(`/api/chats/${currentLine}/${encodeURIComponent(contactId)}/delete`, { method: 'POST' });
      showToast('🗑️ Conversación eliminada con éxito', 'normal');
    } catch (e2) {
      console.error('Fallback falló:', e2);
      loadChats(false);
    }
  }
}

function deleteActiveChat() {
  if (currentContactId) {
    deleteOrClearChat(currentContactId);
  }
}

async function selectChat(contactId) {
  currentContactId = contactId;
  renderContactsList();

  try {
    const res = await fetch(`/api/chats/${currentLine}/${encodeURIComponent(contactId)}`);
    const json = await res.json();
    if (json.success && json.chat) {
      renderActiveChat(json.chat);
    }
  } catch (err) {
    console.error('Error seleccionando chat:', err);
  }
}

function renderActiveChat(chat) {
  updateActiveChatHeader(chat);

  const messagesContainer = document.getElementById('chat-messages-container');
  if (messagesContainer) {
    messagesContainer.innerHTML = (chat.messages || []).map(msg => renderMessageBubble(msg)).join('');
    scrollChatToBottom();
  }

  const banner = document.getElementById('escalation-alert-banner');
  if (banner) {
    if (chat.requires_human) {
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }
}

function updateActiveChatHeader(chat) {
  const nameElem = document.getElementById('chat-active-name');
  const phoneElem = document.getElementById('chat-active-phone');
  const avatarElem = document.getElementById('chat-active-avatar');
  const badgeElem = document.getElementById('chat-active-badge-status');
  const chkAIMode = document.getElementById('chk-ai-mode');

  if (nameElem) nameElem.textContent = chat.name;
  if (phoneElem) phoneElem.textContent = chat.phone;
  if (avatarElem) {
    avatarElem.textContent = chat.name ? chat.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
  }
  if (badgeElem) {
    badgeElem.textContent = chat.status || (chat.requires_human ? 'Asesor Requerido' : 'Activo');
  }
  if (chkAIMode) {
    chkAIMode.checked = Boolean(chat.ai_mode);
  }
}

function renderMessageBubble(msg) {
  const isIncoming = !msg.fromMe;
  const timeFormatted = formatTime(msg.timestamp);

  let bubbleClass = '';
  let metaSender = '';

  if (isIncoming) {
    bubbleClass = '';
    metaSender = `<span>${escapeHtml(msg.sender || 'Aspirante')}</span>`;
  } else if (msg.isAI) {
    bubbleClass = `bubble-ai ${msg.handoffAlert ? 'bubble-handoff-alert' : ''}`;
    metaSender = `<span class="meta-sender-ai"><i class="fa-solid fa-robot"></i> ${escapeHtml(msg.sender || 'CamHouse AI')}</span>`;
  } else {
    bubbleClass = 'bubble-human';
    metaSender = `<span class="meta-sender-human"><i class="fa-solid fa-user-check"></i> ${escapeHtml(msg.sender || 'Operador CamHouse')}</span>`;
  }

  return `
    <div class="message-row ${isIncoming ? 'incoming' : 'outgoing'}">
      <div class="message-bubble ${bubbleClass}">
        ${escapeHtml(msg.text)}
      </div>
      <div class="message-meta">
        ${metaSender}
        <span>${timeFormatted}</span>
      </div>
    </div>
  `;
}

function appendMessageToPane(msg) {
  const container = document.getElementById('chat-messages-container');
  if (!container) return;
  container.insertAdjacentHTML('beforeend', renderMessageBubble(msg));
}

function scrollChatToBottom() {
  const container = document.getElementById('chat-messages-container');
  if (container) container.scrollTop = container.scrollHeight;
}

async function toggleAIMode(enabled) {
  if (!currentContactId) return;
  try {
    const res = await fetch(`/api/chats/${currentLine}/${encodeURIComponent(currentContactId)}/ai-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_mode: enabled })
    });
    const json = await res.json();
    if (json.success) {
      showToast(enabled ? '🤖 Modo IA reactivado' : '👤 Modo manual activado (Bot pausado)', 'normal');
      if (enabled) {
        document.getElementById('escalation-alert-banner')?.classList.add('hidden');
      }
    }
  } catch (err) {
    console.error(err);
  }
}

function takeChatManual() {
  const chk = document.getElementById('chk-ai-mode');
  if (chk) {
    chk.checked = false;
    toggleAIMode(false);
  }
}

function resolveHandoff() {
  takeChatManual();
  document.getElementById('escalation-alert-banner')?.classList.add('hidden');
  insertTemplate('entrevista');
  showToast('Chat tomado por asesor humano. Redacta la confirmación de casting.', 'normal');
}

function showEscalationBanner() {
  document.getElementById('escalation-alert-banner')?.classList.remove('hidden');
}

async function sendManualMessage() {
  const input = document.getElementById('txt-message-input');
  if (!input || !currentContactId) return;

  const text = input.value.trim();
  if (!text) return;

  try {
    input.value = '';
    await fetch(`/api/chats/${currentLine}/${encodeURIComponent(currentContactId)}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, sender: 'Operadora CamHouse' })
    });
  } catch (err) {
    console.error('Error enviando mensaje manual:', err);
  }
}

function handleInputKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendManualMessage();
  }
}

function insertTemplate(type) {
  const input = document.getElementById('txt-message-input');
  if (!input) return;

  const templates = {
    entrevista: '¡Hola! Con mucho gusto agendamos tu cita en CamHouse By C&A. ¿Te quedaría bien asistir mañana a las 3:00 PM a nuestra sede de El Poblado o prefieres videollamada virtual?',
    geobloqueo: 'Te confirmamos que en CamHouse By C&A contamos con Geobloqueo 100% blindado para Colombia y toda Latinoamérica. Nadie de tus conocidos podrá ver tus transmisiones.',
    porcentajes: 'Nuestros porcentajes son del 50% al 60% en presencial (con todo el equipamiento 4K de lujo incluido) y hasta 80% en satélite. Pagos quincenales exactos.',
    sedes: 'Nuestras sedes principales quedan en Medellín (El Poblado / Provenza) y Bogotá (Chapinero Alto). Ambas son discretas, privadas y seguras.',
    requisitos: 'Solo necesitas ser mayor de 18 años con cédula original vigente y excelente actitud. Nosotros te brindamos la capacitación integral desde cero gratis.'
  };

  input.value = templates[type] || '';
  input.focus();
}

function filterContacts() {
  currentSearchQuery = document.getElementById('input-search-chats')?.value || '';
  renderContactsList();
}

function filterByTag(tag, buttonElem) {
  currentFilterTag = tag;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (buttonElem) buttonElem.classList.add('active');
  renderContactsList();
}

// ==============================================================
// BASE DE CONOCIMIENTO
// ==============================================================

async function loadKnowledgeBase() {
  try {
    const res = await fetch('/api/knowledge-base');
    const json = await res.json();
    if (json.success && json.data) {
      knowledgeBaseData = json.data;
      populateKBForm(json.data);
    }
  } catch (err) {
    console.error('Error cargando KB:', err);
  }
}

function populateKBForm(kb) {
  const studio = kb.studio_info || {};
  const rec = kb.linea_reclutamiento || {};
  const adm = kb.linea_administracion || {};

  setValue('kb-studio-name', studio.name || 'CamHouse By C&A');
  setValue('kb-studio-desc', studio.description || '');
  setValue('kb-studio-locations', (studio.locations || []).map(l => `${l.city} (${l.neighborhood}): ${l.address}`).join('\n'));

  const modPresencial = rec.modalidades?.presencial?.porcentajes || '50% al 60%';
  const modSatelite = rec.modalidades?.satelite?.porcentajes || 'Hasta el 70%-80%';
  setValue('kb-rec-pct-presencial', modPresencial);
  setValue('kb-rec-pct-satelite', modSatelite);
  setValue('kb-rec-geoblock', rec.seguridad_y_privacidad?.geobloqueo || '');
  setValue('kb-rec-requirements', (rec.requisitos || []).join('\n'));

  setValue('kb-adm-corte', adm.cortes_y_pagos?.fechas_corte || '');
  setValue('kb-adm-pago', adm.cortes_y_pagos?.fechas_pago || '');
  setValue('kb-adm-turnos', adm.turnos_y_asistencia?.politica_cambio || '');
  setValue('kb-adm-soporte', adm.soporte_tecnico?.fallas_comunes || '');

  const faqs = rec.faq || [];
  setValue('kb-faq-ingles', faqs[0]?.respuesta || '');
  setValue('kb-faq-limites', faqs[1]?.respuesta || '');
  setValue('kb-faq-ganancias', faqs[2]?.respuesta || '');
}

async function saveKnowledgeBase() {
  try {
    const updated = {
      ...knowledgeBaseData,
      studio_info: {
        ...knowledgeBaseData.studio_info,
        name: getValue('kb-studio-name'),
        description: getValue('kb-studio-desc')
      },
      linea_reclutamiento: {
        ...knowledgeBaseData.linea_reclutamiento,
        modalidades: {
          ...knowledgeBaseData.linea_reclutamiento?.modalidades,
          presencial: {
            ...knowledgeBaseData.linea_reclutamiento?.modalidades?.presencial,
            porcentajes: getValue('kb-rec-pct-presencial')
          },
          satelite: {
            ...knowledgeBaseData.linea_reclutamiento?.modalidades?.satelite,
            porcentajes: getValue('kb-rec-pct-satelite')
          }
        },
        seguridad_y_privacidad: {
          ...knowledgeBaseData.linea_reclutamiento?.seguridad_y_privacidad,
          geobloqueo: getValue('kb-rec-geoblock')
        }
      },
      linea_administracion: {
        ...knowledgeBaseData.linea_administracion,
        cortes_y_pagos: {
          ...knowledgeBaseData.linea_administracion?.cortes_y_pagos,
          fechas_corte: getValue('kb-adm-corte'),
          fechas_pago: getValue('kb-adm-pago')
        }
      }
    };

    const res = await fetch('/api/knowledge-base', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
    const json = await res.json();
    if (json.success) {
      knowledgeBaseData = json.data;
      showToast('✨ Base de Conocimiento guardada y activa en Groq AI', 'normal');
    }
  } catch (err) {
    console.error('Error guardando KB:', err);
  }
}

// ==============================================================
// MÉTRICAS
// ==============================================================

async function loadMetrics() {
  try {
    const res = await fetch('/api/metrics');
    const json = await res.json();
    if (json.success && json.metrics) {
      renderKPISummary(json.metrics.summary);
      initMetricsCharts(json.metrics);
    }
  } catch (err) {
    console.error('Error cargando métricas:', err);
  }
}

function renderKPISummary(summary) {
  if (!summary) return;
  const total = summary.total_aspirantes_mes || 0;
  const interviews = summary.entrevistas_agendadas || 0;
  const convRate = summary.tasa_conversion_entrevista || 0;
  const iaRate = summary.tasa_resolucion_ia || 0;

  setText('kpi-aspirantes', total);
  setText('kpi-entrevistas', interviews);
  setText('kpi-conversion', `${convRate}%`);
  setText('kpi-ia-rate', `${iaRate}%`);

  // Actualizar embudo de conversión
  const validated = Math.round(total * 0.68);
  const activeModels = Math.round(interviews * 0.45);

  setText('funnel-step-1', `100% (${total} contactos)`);
  setText('funnel-step-2', total > 0 ? `68% (${validated} evaluadas)` : `0% (0 evaluadas)`);
  setText('funnel-step-3', `${convRate}% (${interviews} agendadas)`);
  setText('funnel-step-4', total > 0 ? `${(activeModels / (total || 1) * 100).toFixed(1)}% (${activeModels} modelos)` : `0.0% (0 modelos)`);
}

async function resetAllMetrics() {
  if (!confirm('¿Estás seguro de que deseas reiniciar todas las métricas, contadores y gráficos a cero (0)?')) return;

  try {
    const res = await fetch('/api/metrics/reset', { method: 'POST' });
    const json = await res.json();
    if (json.success && json.metrics) {
      renderKPISummary(json.metrics.summary);
      initMetricsCharts(json.metrics);
      showToast('🔄 Métricas y contadores reiniciados a 0 con éxito', 'normal');
    }
  } catch (err) {
    console.error('Error reiniciando métricas (intentando fallback):', err);
    try {
      const res = await fetch('/api/metrics', { method: 'DELETE' });
      const json = await res.json();
      if (json.success && json.metrics) {
        renderKPISummary(json.metrics.summary);
        initMetricsCharts(json.metrics);
        showToast('🔄 Métricas y contadores reiniciados a 0 con éxito', 'normal');
      }
    } catch (e2) {
      console.error('Fallback falló:', e2);
      showToast('Error al reiniciar métricas', 'alert');
    }
  }
}

// ==============================================================
// SIMULADOR
// ==============================================================

async function runSimTest(text) {
  const input = document.getElementById('sim-text-input');
  if (input) input.value = text;
  await sendSimulatedMessage();
}

async function sendSimulatedMessage() {
  const input = document.getElementById('sim-text-input');
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  const body = document.getElementById('sim-chat-body');
  body.insertAdjacentHTML('beforeend', `<div class="phone-msg msg-from-user">${escapeHtml(text)}</div>`);
  body.scrollTop = body.scrollHeight;

  logSim(`[Aspirante] "${text}"`);

  try {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        line: currentLine,
        senderName: 'Aspirante de Prueba',
        text: text
      })
    });

    const json = await res.json();
    if (json.success) {
      logSim(`[Groq AI] Solicitud procesada en ultra-baja latencia.`, 'success');
      setTimeout(async () => {
        const chatsRes = await fetch(`/api/chats/${currentLine}`);
        const chatsJson = await chatsRes.json();
        if (chatsJson.success && chatsJson.chats?.length > 0) {
          const lastMsg = chatsJson.chats[0].messages.slice(-1)[0];
          if (lastMsg && lastMsg.fromMe) {
            body.insertAdjacentHTML('beforeend', `
              <div class="phone-msg msg-from-bot ${lastMsg.handoffAlert ? 'bubble-handoff-alert' : ''}">
                ${escapeHtml(lastMsg.text)}
              </div>
            `);
            body.scrollTop = body.scrollHeight;
            if (lastMsg.handoffAlert) {
              logSim(`[DERIVACIÓN DETECTADA] ¡Alerta de Derivación disparada! Bot pausado para operador humano.`, 'alert');
            }
          }
        }
      }, 700);
    }
  } catch (err) {
    console.error(err);
  }
}

function handleSimKeyDown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendSimulatedMessage();
  }
}

function logSim(msg, type = 'neutral') {
  const logContainer = document.getElementById('sim-logs');
  if (!logContainer) return;
  const p = document.createElement('p');
  p.className = type === 'alert' ? 'term-alert' : (type === 'success' ? 'term-success' : 'term-neutral');
  p.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logContainer.appendChild(p);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// ==============================================================
// MODAL API KEY
// ==============================================================

function openKeyModal() {
  document.getElementById('modal-gemini')?.classList.remove('hidden');
}

function closeKeyModal() {
  document.getElementById('modal-gemini')?.classList.add('hidden');
}

async function saveGeminiKey() {
  const input = document.getElementById('input-gemini-key');
  if (!input) return;

  const key = input.value.trim();
  try {
    const res = await fetch('/api/settings/gemini-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key })
    });
    const json = await res.json();
    if (json.success) {
      showToast('Clave API actualizada correctamente.');
      closeKeyModal();
    }
  } catch (err) {
    console.error(err);
  }
}

// Utilities
function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getValue(id) {
  return document.getElementById(id)?.value || '';
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

// ==============================================================
// AUTENTICACIÓN & LOGIN (CamHouse By C&A)
// ==============================================================

function checkAuth() {
  const token = localStorage.getItem('camhouse_session_token');
  const user = localStorage.getItem('camhouse_session_user');
  const overlay = document.getElementById('login-overlay');

  if (token) {
    document.body.classList.remove('not-authenticated');
    if (overlay) overlay.classList.add('hidden');
    if (user) {
      setText('user-display-name', user);
    }
  } else {
    document.body.classList.add('not-authenticated');
    if (overlay) overlay.classList.remove('hidden');
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  const errorBox = document.getElementById('login-error-msg');
  const errorText = document.getElementById('login-error-text');
  const submitBtn = document.getElementById('btn-login-submit');

  const username = usernameInput?.value.trim();
  const password = passwordInput?.value;

  if (!username || !password) return;

  if (errorBox) errorBox.classList.add('hidden');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Verificando...</span>';
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success && data.token) {
      document.body.classList.remove('not-authenticated');
      localStorage.setItem('camhouse_session_token', data.token);
      localStorage.setItem('camhouse_session_user', data.user?.username || username);
      
      const overlay = document.getElementById('login-overlay');
      if (overlay) {
        overlay.style.transition = 'opacity 0.25s ease';
        overlay.style.opacity = '0';
        setTimeout(() => {
          overlay.classList.add('hidden');
          overlay.style.opacity = '1';
        }, 250);
      }

      setText('user-display-name', data.user?.username || username);
      showToast('✨ Bienvenido a CamHouse By C&A', 'normal');
      loadChats(true);
      loadMetrics();
    } else {
      if (errorBox) {
        errorBox.classList.remove('hidden');
        if (errorText) errorText.textContent = data.error || 'Credenciales inválidas';
      }
    }
  } catch (err) {
    console.error('Error al iniciar sesión:', err);
    if (errorBox) {
      errorBox.classList.remove('hidden');
      if (errorText) errorText.textContent = 'Error de conexión con el servidor local';
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Ingresar al Panel</span> <i class="fa-solid fa-arrow-right"></i>';
    }
  }
}

function handleLogout() {
  if (!confirm('¿Deseas cerrar tu sesión actual en CamHouse By C&A?')) return;
  localStorage.removeItem('camhouse_session_token');
  localStorage.removeItem('camhouse_session_user');
  document.body.classList.add('not-authenticated');
  
  const overlay = document.getElementById('login-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
  }

  const passInput = document.getElementById('login-password');
  if (passInput) passInput.value = '';

  showToast('Sesión finalizada con éxito', 'normal');
}

function togglePasswordVisibility() {
  const passInput = document.getElementById('login-password');
  const eyeIcon = document.getElementById('icon-eye-pass');
  if (!passInput) return;

  if (passInput.type === 'password') {
    passInput.type = 'text';
    if (eyeIcon) eyeIcon.className = 'fa-solid fa-eye-slash';
  } else {
    passInput.type = 'password';
    if (eyeIcon) eyeIcon.className = 'fa-solid fa-eye';
  }
}
