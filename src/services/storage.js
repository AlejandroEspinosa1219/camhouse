const fs = require('fs');
const path = require('path');
const config = require('../config');

class StorageService {
  constructor() {
    this.kbCache = null;
    this.chatsCache = null;
    this.metricsCache = null;
    this.init();
  }

  init() {
    // Asegurar directorios
    const dataDir = path.dirname(config.DATA_PATHS.knowledge_base);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  // --- KNOWLEDGE BASE ---
  getKnowledgeBase() {
    try {
      if (!this.kbCache && fs.existsSync(config.DATA_PATHS.knowledge_base)) {
        const raw = fs.readFileSync(config.DATA_PATHS.knowledge_base, 'utf-8');
        this.kbCache = JSON.parse(raw);
      }
      return this.kbCache || {};
    } catch (err) {
      console.error('[Storage] Error leyendo base de conocimiento:', err);
      return {};
    }
  }

  updateKnowledgeBase(data) {
    try {
      this.kbCache = { ...this.getKnowledgeBase(), ...data };
      fs.writeFileSync(config.DATA_PATHS.knowledge_base, JSON.stringify(this.kbCache, null, 2), 'utf-8');
      return { success: true, data: this.kbCache };
    } catch (err) {
      console.error('[Storage] Error actualizando base de conocimiento:', err);
      return { success: false, error: err.message };
    }
  }

  // --- CHATS STORE ---
  getChatsStore() {
    try {
      if (!this.chatsCache && fs.existsSync(config.DATA_PATHS.chats_store)) {
        const raw = fs.readFileSync(config.DATA_PATHS.chats_store, 'utf-8');
        this.chatsCache = JSON.parse(raw);
      }
      if (!this.chatsCache) {
        this.chatsCache = { linea_reclutamiento: [], linea_administracion: [] };
      }
      return this.chatsCache;
    } catch (err) {
      console.error('[Storage] Error leyendo chats:', err);
      return { linea_reclutamiento: [], linea_administracion: [] };
    }
  }

  saveChatsStore() {
    try {
      if (this.chatsCache) {
        fs.writeFileSync(config.DATA_PATHS.chats_store, JSON.stringify(this.chatsCache, null, 2), 'utf-8');
      }
    } catch (err) {
      console.error('[Storage] Error guardando chats:', err);
    }
  }

  getChats(line) {
    const store = this.getChatsStore();
    return store[line] || [];
  }

  getChat(line, contactId) {
    const chats = this.getChats(line);
    return chats.find(c => c.id === contactId);
  }

  getOrCreateChat(line, contactId, senderName = '', phoneFormatted = '') {
    const store = this.getChatsStore();
    if (!store[line]) store[line] = [];

    let chat = store[line].find(c => c.id === contactId);
    if (!chat) {
      const cleanPhone = phoneFormatted || contactId.replace('@s.whatsapp.net', '');
      chat = {
        id: contactId,
        phone: cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`,
        name: senderName || cleanPhone,
        line: line,
        ai_mode: true, // Modo IA activo por defecto
        requires_human: false,
        status: 'Aspirante Nueva',
        last_message: '',
        last_timestamp: new Date().toISOString(),
        unread_count: 0,
        messages: []
      };
      store[line].unshift(chat);
      this.saveChatsStore();
    } else if (senderName && (chat.name === chat.phone || !chat.name)) {
      chat.name = senderName;
    }
    return chat;
  }

  updateChatContactName(line, contactId, newName) {
    const store = this.getChatsStore();
    if (!store[line]) return null;
    const chat = store[line].find(c => c.id === contactId);
    if (chat && newName && typeof newName === 'string') {
      chat.name = newName.trim();
      this.saveChatsStore();
      return chat;
    }
    return null;
  }

  addMessage(line, contactId, msgData, options = {}) {
    const store = this.getChatsStore();
    const chat = this.getOrCreateChat(line, contactId, options.senderName, options.phone);

    const message = {
      id: msgData.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      fromMe: Boolean(msgData.fromMe),
      sender: msgData.sender || (msgData.fromMe ? 'CamHouse AI Bot' : chat.name),
      text: msgData.text || '',
      timestamp: msgData.timestamp || new Date().toISOString(),
      isAI: Boolean(msgData.isAI),
      isImage: Boolean(msgData.isImage),
      isVoice: Boolean(msgData.isVoice),
      handoffAlert: Boolean(msgData.handoffAlert)
    };

    chat.messages.push(message);
    chat.last_message = message.text;
    chat.last_timestamp = message.timestamp;

    if (!message.fromMe) {
      chat.unread_count = (chat.unread_count || 0) + 1;
    } else {
      chat.unread_count = 0;
    }

    if (msgData.handoffAlert) {
      chat.requires_human = true;
      chat.ai_mode = false; // Pausar bot automáticamente solo ante solicitud explícita de humano
      chat.status = 'Entrevista Solicitada / Asesor';
    } else if (msgData.isSuccessfulClose) {
      chat.status = 'Aspirante Aprobada';
      // Cierre exitoso: El Modo IA permanece activo (ai_mode: true) para resolver dudas pos-cierre
      chat.requires_human = false;
    } else if (msgData.isRejected) {
      chat.status = msgData.rejectionStatus || 'No Apto - Hombre';
      chat.ai_mode = false;
      chat.requires_human = false;
    }

    // Reordenar chats para colocar el más reciente arriba
    store[line] = store[line].filter(c => c.id !== contactId);
    store[line].unshift(chat);

    this.saveChatsStore();
    return { chat, message };
  }

  setAIMode(line, contactId, aiMode) {
    const chat = this.getChat(line, contactId);
    if (chat) {
      chat.ai_mode = Boolean(aiMode);
      if (chat.ai_mode) {
        chat.requires_human = false; // Al reactivar IA, limpiar alerta
      }
      this.saveChatsStore();
      return chat;
    }
    return null;
  }

  markChatAsRead(line, contactId) {
    const chat = this.getChat(line, contactId);
    if (chat) {
      chat.unread_count = 0;
      this.saveChatsStore();
      return chat;
    }
    return null;
  }

  deleteChat(line, contactId) {
    const store = this.getChatsStore();
    if (store[line]) {
      const decoded = decodeURIComponent(contactId);
      const cleanPhone = contactId.replace('@s.whatsapp.net', '').replace('@lid', '').replace('+', '').trim();
      const initialCount = store[line].length;
      store[line] = store[line].filter(c => {
        if (c.id === contactId || c.id === decoded) return false;
        if (c.phone === contactId || c.phone === decoded) return false;
        if (cleanPhone && cleanPhone.length > 5 && (c.id.includes(cleanPhone) || (c.phone && c.phone.includes(cleanPhone)))) return false;
        return true;
      });
      this.saveChatsStore();
      return store[line].length < initialCount || true;
    }
    return false;
  }

  clearAllChats(line) {
    const store = this.getChatsStore();
    if (store[line]) {
      store[line] = [];
      this.saveChatsStore();
      return true;
    }
    return false;
  }

  // --- METRICS ---
  getMetrics() {
    try {
      if (!this.metricsCache && fs.existsSync(config.DATA_PATHS.metrics)) {
        const raw = fs.readFileSync(config.DATA_PATHS.metrics, 'utf-8');
        this.metricsCache = JSON.parse(raw);
      }
      return this.metricsCache || {};
    } catch (err) {
      console.error('[Storage] Error leyendo métricas:', err);
      return {};
    }
  }

  resetMetrics() {
    try {
      const emptyMetrics = {
        summary: {
          total_aspirantes_mes: 0,
          entrevistas_agendadas: 0,
          tasa_conversion_entrevista: 0,
          mensajes_ia_respondidos: 0,
          tasa_resolucion_ia: 100,
          derivaciones_humanas: 0,
          modelos_activas_atendidas: 0
        },
        aspirantes_por_dia: [
          { dia: "Lunes", aspirantes: 0, entrevistas: 0 },
          { dia: "Martes", aspirantes: 0, entrevistas: 0 },
          { dia: "Miércoles", aspirantes: 0, entrevistas: 0 },
          { dia: "Jueves", aspirantes: 0, entrevistas: 0 },
          { dia: "Viernes", aspirantes: 0, entrevistas: 0 },
          { dia: "Sábado", aspirantes: 0, entrevistas: 0 },
          { dia: "Domingo", aspirantes: 0, entrevistas: 0 }
        ],
        horas_pico: [
          { hora: "08:00 - 10:00", consultas: 0 },
          { hora: "10:00 - 12:00", consultas: 0 },
          { hora: "12:00 - 14:00", consultas: 0 },
          { hora: "14:00 - 16:00", consultas: 0 },
          { hora: "16:00 - 18:00", consultas: 0 },
          { hora: "18:00 - 20:00", consultas: 0 },
          { hora: "20:00 - 22:00", consultas: 0 },
          { hora: "22:00 - 00:00", consultas: 0 }
        ],
        top_intereses: [
          { tema: "Privacidad y Geobloqueo", porcentaje: 0 },
          { tema: "Porcentajes y Ganancias", porcentaje: 0 },
          { tema: "Agendamiento de Entrevista", porcentaje: 0 },
          { tema: "Modalidad Satélite / Casa", porcentaje: 0 },
          { tema: "Requisitos de Edad / Documento", porcentaje: 0 }
        ]
      };
      this.metricsCache = emptyMetrics;
      fs.writeFileSync(config.DATA_PATHS.metrics, JSON.stringify(emptyMetrics, null, 2), 'utf-8');
      return { success: true, data: emptyMetrics };
    } catch (err) {
      console.error('[Storage] Error reiniciando métricas:', err);
      return { success: false, error: err.message };
    }
  }

  recordInteraction(line, isHandoff = false, topic = null, isSuccessfulClose = false) {
    try {
      const metrics = this.getMetrics();
      if (!metrics.summary) {
        metrics.summary = {
          total_aspirantes_mes: 0,
          entrevistas_agendadas: 0,
          tasa_conversion_entrevista: 0,
          mensajes_ia_respondidos: 0,
          tasa_resolucion_ia: 0,
          derivaciones_humanas: 0
        };
      }

      if (line === 'linea_reclutamiento' || line === 'linea_administracion') {
        metrics.summary.total_aspirantes_mes = (metrics.summary.total_aspirantes_mes || 0) + 1;
        if (isSuccessfulClose) {
          metrics.summary.entrevistas_agendadas = (metrics.summary.entrevistas_agendadas || 0) + 1;
        }
        if (isHandoff) {
          metrics.summary.derivaciones_humanas = (metrics.summary.derivaciones_humanas || 0) + 1;
        }
      }

      if (!isHandoff) {
        metrics.summary.mensajes_ia_respondidos = (metrics.summary.mensajes_ia_respondidos || 0) + 1;
      }

      // Recalcular porcentajes
      const total = metrics.summary.total_aspirantes_mes || 1;
      metrics.summary.tasa_conversion_entrevista = +(
        ((metrics.summary.entrevistas_agendadas || 0) / total) * 100
      ).toFixed(1);

      const totalMsg = (metrics.summary.mensajes_ia_respondidos || 0) + (metrics.summary.derivaciones_humanas || 0);
      if (totalMsg > 0) {
        metrics.summary.tasa_resolucion_ia = +(
          ((metrics.summary.mensajes_ia_respondidos || 0) / totalMsg) * 100
        ).toFixed(1);
      }

      // Actualizar día de la semana
      const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const currentDay = dayNames[new Date().getDay()];
      if (Array.isArray(metrics.aspirantes_por_dia)) {
        let dayObj = metrics.aspirantes_por_dia.find(d => d.dia === currentDay);
        if (dayObj) {
          dayObj.aspirantes = (dayObj.aspirantes || 0) + 1;
          if (isHandoff) dayObj.entrevistas = (dayObj.entrevistas || 0) + 1;
        }
      }

      // Actualizar horas pico
      const hour = new Date().getHours();
      let hourSlot = '08:00 - 10:00';
      if (hour >= 10 && hour < 12) hourSlot = '10:00 - 12:00';
      else if (hour >= 12 && hour < 14) hourSlot = '12:00 - 14:00';
      else if (hour >= 14 && hour < 16) hourSlot = '14:00 - 16:00';
      else if (hour >= 16 && hour < 18) hourSlot = '16:00 - 18:00';
      else if (hour >= 18 && hour < 20) hourSlot = '18:00 - 20:00';
      else if (hour >= 20 && hour < 22) hourSlot = '20:00 - 22:00';
      else if (hour >= 22 || hour < 8) hourSlot = '22:00 - 00:00';

      if (Array.isArray(metrics.horas_pico)) {
        let hObj = metrics.horas_pico.find(h => h.hora === hourSlot);
        if (hObj) {
          hObj.consultas = (hObj.consultas || 0) + 1;
        }
      }

      this.metricsCache = metrics;
      fs.writeFileSync(config.DATA_PATHS.metrics, JSON.stringify(metrics, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Storage] Error actualizando métricas:', err);
    }
  }
}

module.exports = new StorageService();
