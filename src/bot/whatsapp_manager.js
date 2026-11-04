const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  fetchLatestWaWebVersion,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  Browsers,
  normalizeMessageContent
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const storage = require('../services/storage');
const geminiAgent = require('./gemini_agent');

class WhatsAppManager {
  constructor() {
    this.io = null;
    this.lines = {
      linea_reclutamiento: {
        name: 'Línea 1 - Reclutamiento & Aspirantes',
        folder: config.SESSIONS.linea_reclutamiento,
        socket: null,
        status: 'disconnected', // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
        qr: null,
        qrDataUrl: null,
        user: null,
        reconnectAttempts: 0,
        reconnectTimer: null,
        isStarting: false
      },
      linea_administracion: {
        name: 'Línea 2 - Reclutamiento & Aspirantes',
        folder: config.SESSIONS.linea_administracion,
        socket: null,
        status: 'disconnected',
        qr: null,
        qrDataUrl: null,
        user: null,
        reconnectAttempts: 0,
        reconnectTimer: null,
        isStarting: false
      }
    };
    this.messageDebounceMap = new Map(); // key: `${lineKey}:${contactJid}` -> { timer, texts: [] }
    this.DEBOUNCE_DELAY = 2800; // 2.8s de espera inteligente para acumular ráfagas de mensajes
    this.sentByBotIds = new Set(); // IDs de mensajes enviados por el propio bot/panel
    this.chatProcessingLocks = new Map(); // Mutex por chat para evitar doble respuesta simultánea
  }

  setSocketIO(ioInstance) {
    this.io = ioInstance;
  }

  getLineState(lineKey) {
    const line = this.lines[lineKey];
    if (!line) return null;
    return {
      key: lineKey,
      name: line.name,
      status: line.status,
      qrDataUrl: line.qrDataUrl,
      user: line.user
    };
  }

  getAllLinesState() {
    return {
      linea_reclutamiento: this.getLineState('linea_reclutamiento'),
      linea_administracion: this.getLineState('linea_administracion')
    };
  }

  broadcastLineStatus(lineKey) {
    if (this.io) {
      const state = this.getLineState(lineKey);
      this.io.emit('line_status_change', state);
    }
  }

  async startLine(lineKey) {
    const line = this.lines[lineKey];
    if (!line) {
      console.error(`[WhatsAppManager] Línea desconocida: ${lineKey}`);
      return;
    }

    // 1. Candado de concurrencia: evitar que múltiples llamadas simultáneas creen sockets duplicados
    if (line.isStarting) {
      console.log(`[WhatsAppManager] [${line.name}] Ya hay un proceso de conexión en curso. Ignorando llamada duplicada.`);
      return;
    }
    line.isStarting = true;

    // 2. Cancelar cualquier temporizador de reconexión pendiente
    if (line.reconnectTimer) {
      clearTimeout(line.reconnectTimer);
      line.reconnectTimer = null;
    }

    // 3. Destrucción limpia y completa de cualquier socket previo antes de iniciar uno nuevo
    if (line.socket) {
      try {
        console.log(`[WhatsAppManager] [${line.name}] Cerrando socket previo de forma limpia...`);
        line.socket.ev.removeAllListeners();
        line.socket.end(undefined);
      } catch (_) {}
      line.socket = null;
    }

    // Asegurar directorio de sesión
    if (!fs.existsSync(line.folder)) {
      fs.mkdirSync(line.folder, { recursive: true });
    }

    const hasCredsOnDisk = fs.existsSync(path.join(line.folder, 'creds.json'));
    console.log(`[WhatsAppManager] Iniciando conexión para ${line.name} (Credenciales en disco: ${hasCredsOnDisk ? 'SÍ' : 'NO'})`);

    // Si no estaba conectada previamente y no tiene QR listo, reflejar estado conectando
    if (line.status !== 'connected') {
      line.status = line.qrDataUrl ? 'qr_ready' : 'connecting';
      this.broadcastLineStatus(lineKey);
    }

    try {
      const { state, saveCreds } = await useMultiFileAuthState(line.folder);
      const { version } = await fetchLatestBaileysVersion();
      const logger = pino({ level: 'silent' });

      const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        browser: Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        generateHighQualityLinkPreview: false,
        getMessage: async (key) => {
          const chat = storage.getChat(lineKey, key.remoteJid);
          if (chat && chat.messages) {
            const found = chat.messages.find(m => m.id === key.id);
            if (found && found.text) {
              return { conversation: found.text };
            }
          }
          return { conversation: 'Hola' };
        }
      });

      line.socket = sock;
      line.isStarting = false;

      // Evento de credenciales actualizadas (serializado para garantizar escritura completa en disco antes de reconectar)
      let credsSavePromise = Promise.resolve();
      sock.ev.on('creds.update', () => {
        credsSavePromise = credsSavePromise.then(() => saveCreds()).catch(() => {});
      });

      // Evento de conexión con filtro anti-parpadeo y auto-reconexión robusta
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          line.isStarting = false;
          line.qr = qr;
          line.status = 'qr_ready';
          line.reconnectAttempts = 0;
          try {
            line.qrDataUrl = await QRCode.toDataURL(qr, {
              margin: 2,
              width: 320,
              color: {
                dark: '#8B5CF6',
                light: '#0B0B0F'
              }
            });
          } catch (qrErr) {
            console.error('[WhatsAppManager] Error generando QR DataURL:', qrErr);
          }
          console.log(`[WhatsAppManager] [${line.name}] Código QR generado y listo para escanear.`);
          this.broadcastLineStatus(lineKey);
        }

        if (connection === 'close') {
          line.isStarting = false;
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          console.warn(`[WhatsAppManager] [${line.name}] Conexión cerrada. Status: ${statusCode}`);

          // Caso A: Reinicio de flujo requerido por WhatsApp (Status 515 restartRequired tras escanear QR)
          if (statusCode === DisconnectReason.restartRequired) {
            console.log(`[WhatsAppManager] [${line.name}] Completando vinculación inmediata tras escaneo QR (515)...`);
            await credsSavePromise;
            line.reconnectTimer = setTimeout(() => this.startLine(lineKey), 250);
            return;
          }

          // Caso B: Sesión inválida, corrupta o cerrada desde el celular (401, 403, 405, 411, 500)
          const isInvalidSession = (
            statusCode === DisconnectReason.loggedOut ||
            statusCode === DisconnectReason.badSession ||
            statusCode === DisconnectReason.forbidden ||
            statusCode === DisconnectReason.multideviceMismatch ||
            statusCode === 405
          );

          line.reconnectAttempts = (line.reconnectAttempts || 0) + 1;

          if (isInvalidSession || (!line.user && hasCredsOnDisk && line.reconnectAttempts >= 2)) {
            line.status = 'disconnected';
            line.qr = null;
            line.qrDataUrl = null;
            line.user = null;
            line.reconnectAttempts = 0;
            this.broadcastLineStatus(lineKey);
            console.log(`[WhatsAppManager] [${line.name}] Limpiando sesión previa incompleta/cerrada (Status: ${statusCode}) para generar QR limpio...`);
            this.cleanFolder(line.folder);
            line.reconnectTimer = setTimeout(() => this.startLine(lineKey), 1000);
            return;
          }

          // Caso C: Conexión reemplazada por otra sesión (Status 440)
          if (statusCode === DisconnectReason.connectionReplaced) {
            console.log(`[WhatsAppManager] [${line.name}] Conexión reemplazada (440). Esperando 5s para reconectar limpiamente...`);
            line.reconnectTimer = setTimeout(() => this.startLine(lineKey), 5000);
            return;
          }

          // Caso D: Micro-corte de red / Timeout rutinario
          const hasPhone = Boolean(line.user?.phone);
          if (!hasPhone || line.reconnectAttempts > 3) {
            line.status = line.qrDataUrl ? 'qr_ready' : 'connecting';
            this.broadcastLineStatus(lineKey);
          }

          const delay = Math.min(line.reconnectAttempts * 1500, 8000);
          console.log(`[WhatsAppManager] [${line.name}] Reintentando conexión en ${delay / 1000}s (intento #${line.reconnectAttempts})...`);
          line.reconnectTimer = setTimeout(() => this.startLine(lineKey), delay);
        } else if (connection === 'open') {
          line.isStarting = false;
          line.reconnectAttempts = 0;
          line.status = 'connected';
          line.qr = null;
          line.qrDataUrl = null;
          line.user = {
            id: sock.user?.id || '',
            name: sock.user?.name || line.name,
            phone: sock.user?.id ? sock.user.id.split(':')[0] : ''
          };
          console.log(`[WhatsAppManager] [${line.name}] ¡CONECTADO CON ÉXITO Y TOTALMENTE ESTABLE! ID: ${line.user.id} (+${line.user.phone})`);
          this.broadcastLineStatus(lineKey);
        }
      });

      // Evento de mensajes entrantes
      sock.ev.on('messages.upsert', async (m) => {
        if (!m.messages || m.messages.length === 0) return;
        if (m.type !== 'notify' && m.type !== 'append') return;

        for (const msg of m.messages) {
          if (!msg.message) continue;

          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast' || remoteJid.endsWith('@newsletter')) continue;

          // Si el mensaje fue enviado desde nuestro propio WhatsApp (por un asesor humano en el celular/Web),
          // lo guardamos en el historial para que la IA tenga contexto de lo que el asesor ya preguntó.
          if (msg.key.fromMe) {
            if (this.sentByBotIds.has(msg.key.id)) {
              this.sentByBotIds.delete(msg.key.id);
              continue;
            }
            const rawOut = normalizeMessageContent(msg.message) || msg.message;
            const outText = (rawOut.conversation || rawOut.extendedTextMessage?.text || '').trim();
            if (outText) {
              const { chat, message } = storage.addMessage(lineKey, remoteJid, {
                id: msg.key.id,
                fromMe: true,
                sender: 'Asesor CamHouse',
                text: outText,
                timestamp: new Date().toISOString(),
                isAI: false
              });
              if (this.io && chat) {
                this.io.emit('new_message', {
                  line: lineKey,
                  chatId: remoteJid,
                  message: message,
                  chatMeta: {
                    name: chat.name,
                    phone: chat.phone,
                    status: chat.status,
                    ai_mode: chat.ai_mode,
                    requires_human: chat.requires_human
                  }
                });
              }
            }
            continue;
          }

          const senderName = msg.pushName || 'Contacto WhatsApp';
          
          // Desempaquetar contenido de mensaje sin importar envoltorios de WhatsApp
          let raw = normalizeMessageContent(msg.message) || msg.message;
          if (raw.ephemeralMessage?.message) raw = normalizeMessageContent(raw.ephemeralMessage.message) || raw.ephemeralMessage.message;
          if (raw.viewOnceMessage?.message) raw = normalizeMessageContent(raw.viewOnceMessage.message) || raw.viewOnceMessage.message;

          let text = '';
          let isVoice = false;
          let isImage = false;

          // 1. Texto estándar
          if (raw.conversation) {
            text = raw.conversation;
          } else if (raw.extendedTextMessage?.text) {
            text = raw.extendedTextMessage.text;
          } else if (raw.buttonsResponseMessage?.selectedDisplayText) {
            text = raw.buttonsResponseMessage.selectedDisplayText;
          } else if (raw.listResponseMessage?.title) {
            text = raw.listResponseMessage.title;
          }

          // 2. 📸 Detección universal de fotos (imageMessage, albumMessage, documentMessage de tipo imagen o wrappers)
          if (
            raw.imageMessage ||
            raw.albumMessage ||
            msg.message.imageMessage ||
            (raw.documentMessage && ((raw.documentMessage.mimetype || '').toLowerCase().startsWith('image/') || /\.(jpe?g|png|webp|heic|bmp)$/i.test(raw.documentMessage.fileName || ''))) ||
            Object.keys(raw).some(k => k.toLowerCase().includes('image') || k.toLowerCase().includes('album') || k.toLowerCase().includes('photo'))
          ) {
            isImage = true;
            const caption = raw.imageMessage?.caption || raw.documentMessage?.caption || msg.message.imageMessage?.caption || '';
            text = `📸 [Foto enviada por la candidata${caption ? ` - "${caption}"` : ''}]`;
            console.log(`[WhatsAppManager] [${lineKey}] 📸 Foto recibida de ${senderName} (${remoteJid})`);
          }

          // 3. 🎙️ Transcripción inteligente de notas de voz con Groq Whisper
          const audioMsg = raw.audioMessage || msg.message.audioMessage;
          if (audioMsg) {
            isVoice = true;
            try {
              console.log(`[WhatsAppManager] [${lineKey}] 🎙️ Nota de voz recibida de ${senderName}. Descargando y transcribiendo con Groq Whisper...`);
              const buffer = await downloadMediaMessage(
                msg,
                'buffer',
                {},
                { logger: pino({ level: 'silent' }) }
              );
              if (buffer) {
                const transcribed = await geminiAgent.transcribeAudio(lineKey, buffer);
                if (transcribed && transcribed.trim()) {
                  text = transcribed.trim();
                  console.log(`[WhatsAppManager] [${lineKey}] 🎙️ Audio transcrito con éxito: "${text}"`);
                }
              }
            } catch (audioErr) {
              console.error(`[WhatsAppManager] [${lineKey}] Error al transcribir nota de voz:`, audioErr.message);
            }
          }

          // 4. Si aún no hay texto pero hay contenido (stickers, videos, docs)
          if (!text.trim()) {
            if (raw.videoMessage) {
              text = '🎥 [Video enviado por la candidata]';
              isImage = true;
            } else if (raw.stickerMessage) {
              text = '[Sticker enviado]';
            } else if (raw.documentMessage) {
              text = `📎 [Archivo adjunto: ${raw.documentMessage.fileName || 'documento'}]`;
            } else if (Object.keys(raw).length > 0) {
              text = '📸 [Foto / Contenido recibido]';
              isImage = true;
            }
          }

          if (!text.trim()) continue;

          await this.handleIncomingMessage(lineKey, remoteJid, senderName, text, msg.key.id, isVoice, isImage);
        }
      });
    } catch (err) {
      console.error(`[WhatsAppManager] Error inicializando socket para ${lineKey}:`, err);
      line.status = 'disconnected';
      this.broadcastLineStatus(lineKey);
    } finally {
      line.isStarting = false;
    }
  }

  // Detector auxiliar de nombres para actualizar la ficha de contacto
  extractPotentialName(text, history = []) {
    if (!text || typeof text !== 'string') return null;
    const detected = geminiAgent.extractCandidateName(text, history);
    if (detected && detected !== 'linda' && detected !== 'hermosa') {
      return detected;
    }
    return null;
  }

  async handleIncomingMessage(lineKey, contactJid, senderName, text, messageId, isVoice = false, isImage = false) {
    const displayText = isVoice ? `🎙️ [Audio]: "${text}"` : text;
    console.log(`[WhatsAppManager] [${lineKey}] ${isVoice ? '🎙️ Audio transcrito' : (isImage ? '📸 Foto' : 'Mensaje')} de ${senderName} (${contactJid}): "${text}"`);

    // 1. Detectar si el mensaje incluye el nombre de la aspirante para actualizar el contacto
    const existingChat = storage.getChat(lineKey, contactJid);
    const existingHistory = existingChat ? existingChat.messages : [];
    const detectedName = this.extractPotentialName(text, existingHistory);
    if (detectedName) {
      storage.updateChatContactName(lineKey, contactJid, detectedName);
    }

    // 2. Guardar mensaje entrante del usuario en la base de datos local de inmediato
    const { chat, message: savedUserMsg } = storage.addMessage(
      lineKey,
      contactJid,
      {
        id: messageId,
        fromMe: false,
        sender: senderName,
        text: displayText,
        timestamp: new Date().toISOString(),
        isAI: false,
        isVoice: isVoice,
        isImage: isImage
      },
      { senderName }
    );

    // Emitir mensaje recibido a los clientes web en tiempo real
    if (this.io) {
      this.io.emit('new_message', {
        line: lineKey,
        chatId: contactJid,
        message: savedUserMsg,
        chatMeta: {
          name: chat.name,
          phone: chat.phone,
          status: chat.status,
          ai_mode: chat.ai_mode,
          requires_human: chat.requires_human
        }
      });
    }

    // 3. Comprobar si el chat está en "Modo Manual" (bot pausado)
    if (!chat.ai_mode) {
      console.log(`[WhatsAppManager] [${lineKey}] Chat con ${contactJid} está en MODO MANUAL. No responde IA.`);
      if (this.io) {
        this.io.emit('operator_alert', {
          line: lineKey,
          chatId: contactJid,
          name: chat.name,
          text: text,
          reason: 'Mensaje recibido en chat tomado por operador humano'
        });
      }
      return;
    }

    // 4. ESPERA INTELIGENTE (Buffer Debounce Anti-Ráfagas):
    // Si la persona envía varios mensajes seguidos en poco tiempo, los acumulamos
    // para que la IA responda a la idea completa de forma coherente en vez de cruzarse.
    const debounceKey = `${lineKey}:${contactJid}`;
    let pending = this.messageDebounceMap.get(debounceKey);

    if (pending) {
      clearTimeout(pending.timer);
      pending.texts.push(text);
    } else {
      pending = { texts: [text] };
    }

    pending.timer = setTimeout(async () => {
      this.messageDebounceMap.delete(debounceKey);
      await this.processDebouncedAIResponse(lineKey, contactJid, pending.texts);
    }, this.DEBOUNCE_DELAY);

    this.messageDebounceMap.set(debounceKey, pending);
  }

  async processDebouncedAIResponse(lineKey, contactJid, textsArray) {
    const lockKey = `${lineKey}:${contactJid}`;
    // Si ya hay una respuesta de IA en curso para este mismo chat, esperar su turno
    if (this.chatProcessingLocks.get(lockKey)) {
      try {
        await this.chatProcessingLocks.get(lockKey);
      } catch (_) {}
    }

    let releaseLock;
    const lockPromise = new Promise(resolve => { releaseLock = resolve; });
    this.chatProcessingLocks.set(lockKey, lockPromise);

    try {
      const combinedText = textsArray.join('\n');
      const line = this.lines[lineKey];

      // Verificar nuevamente si el chat sigue con Modo IA activo antes de responder
      const currentChat = storage.getChat(lineKey, contactJid);
      if (currentChat && !currentChat.ai_mode) {
        return;
      }

      // Simular presencia de tipeo humano en WhatsApp ("Escribiendo...")
      if (line && line.socket && line.status === 'connected') {
        try {
          await line.socket.sendPresenceUpdate('composing', contactJid);
        } catch (_) {}
      }

      // Obtener el historial completo actualizado
      const history = currentChat ? currentChat.messages : [];
      const knownName = (currentChat && currentChat.name && !currentChat.name.startsWith('+') && currentChat.name !== 'Contacto WhatsApp') ? currentChat.name : '';

      // Llamar a la IA con el mensaje unificado y el nombre conocido
      const aiResult = await geminiAgent.generateResponse(lineKey, combinedText, history, knownName);

      // Dividir en múltiples burbujas si contiene separador ---SPLIT---
      const rawText = aiResult.text || '';
      const messageParts = rawText.split('---SPLIT---').map(p => p.trim()).filter(Boolean);
      const partsToSend = messageParts.length > 0 ? messageParts : [rawText];

      let updatedChat = null;

      for (let i = 0; i < partsToSend.length; i++) {
        const partText = partsToSend[i];

        if (i === 0) {
          // Pausa natural inicial
          await new Promise(resolve => setTimeout(resolve, 800));
        } else {
          // Pausa y presencia de tipeo humano ("Escribiendo...") para el siguiente mensaje consecutivo
          if (line && line.socket && line.status === 'connected') {
            try {
              await line.socket.sendPresenceUpdate('composing', contactJid);
            } catch (_) {}
          }
          await new Promise(resolve => setTimeout(resolve, 1800));
        }

        // Enviar por WhatsApp
        if (line && line.socket) {
          try {
            const sentMsg = await line.socket.sendMessage(contactJid, { text: partText });
            if (sentMsg?.key?.id) {
              this.sentByBotIds.add(sentMsg.key.id);
            }
            try {
              await line.socket.sendPresenceUpdate('paused', contactJid);
            } catch (_) {}
          } catch (sendErr) {
            console.warn(`[WhatsAppManager] [${lineKey}] Error enviando mensaje a ${contactJid}:`, sendErr.message);
          }
        }

        // Guardar cada burbuja en la base de datos
        const isLastPart = (i === partsToSend.length - 1);
        const addResult = storage.addMessage(
          lineKey,
          contactJid,
          {
            fromMe: true,
            sender: 'CamHouse AI Bot',
            text: partText,
            timestamp: new Date().toISOString(),
            isAI: true,
            handoffAlert: isLastPart ? Boolean(aiResult.isHandoff) : false,
            isSuccessfulClose: isLastPart ? Boolean(aiResult.isSuccessfulClose) : false,
            isRejected: isLastPart ? Boolean(aiResult.isRejected) : false,
            rejectionStatus: isLastPart ? (aiResult.rejectionStatus || null) : null
          }
        );
        updatedChat = addResult.chat;
        const savedBotMsg = addResult.message;

        // Emitir mensaje individual a la interfaz web en tiempo real
        if (this.io && updatedChat) {
          this.io.emit('new_message', {
            line: lineKey,
            chatId: contactJid,
            message: savedBotMsg,
            chatMeta: {
              name: updatedChat.name,
              phone: updatedChat.phone,
              status: updatedChat.status,
              ai_mode: updatedChat.ai_mode,
              requires_human: updatedChat.requires_human
            }
          });
        }
      }

      // Registrar métrica
      storage.recordInteraction(lineKey, aiResult.isHandoff, null, Boolean(aiResult.isSuccessfulClose));

      // Si se activó la derivación (número del coordinador entregado en cierre exitoso)
      if (aiResult.isHandoff && this.io && updatedChat) {
        this.io.emit('human_handoff_requested', {
          line: lineKey,
          chatId: contactJid,
          contactName: updatedChat.name,
          phone: updatedChat.phone,
          reason: aiResult.reason || 'Cierre Exitoso / Derivación a Coordinador',
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error(`[WhatsAppManager] Error procesando respuesta IA diferida para ${contactJid}:`, err);
    } finally {
      if (releaseLock) releaseLock();
      this.chatProcessingLocks.delete(lockKey);
    }
  }

  // Enviar mensaje manual desde el panel de control web
  async sendMessageFromDashboard(lineKey, contactJid, text, sender = 'Operador CamHouse') {
    const line = this.lines[lineKey];
    if (!line) throw new Error('Línea inválida');

    // Si el socket está conectado, enviar mensaje real
    if (line.socket && line.status === 'connected') {
      try {
        const sentMsg = await line.socket.sendMessage(contactJid, { text });
        if (sentMsg?.key?.id) {
          this.sentByBotIds.add(sentMsg.key.id);
        }
      } catch (err) {
        console.warn(`[WhatsAppManager] No se pudo enviar por WhatsApp real (${err.message}). Guardando en BD local.`);
      }
    }

    // Guardar en almacenamiento
    const { chat, message } = storage.addMessage(lineKey, contactJid, {
      fromMe: true,
      sender: sender,
      text: text,
      timestamp: new Date().toISOString(),
      isAI: false
    });

    if (this.io) {
      this.io.emit('new_message', {
        line: lineKey,
        chatId: contactJid,
        message: message,
        chatMeta: {
          name: chat.name,
          phone: chat.phone,
          status: chat.status,
          ai_mode: chat.ai_mode,
          requires_human: chat.requires_human
        }
      });
    }

    return { chat, message };
  }

  // Simulador de pruebas: permite al usuario probar ambos bots y derivación sin escanear QR inmediatamente
  async simulateInboundMessage(lineKey, contactJid, senderName, text) {
    const fakeMsgId = `sim_${Date.now()}`;
    await this.handleIncomingMessage(lineKey, contactJid, senderName, text, fakeMsgId);
    return { success: true };
  }

  cleanFolder(folderPath) {
    try {
      if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true, force: true });
      }
    } catch (e) {
      try {
        if (fs.existsSync(folderPath)) {
          const files = fs.readdirSync(folderPath);
          for (const f of files) {
            try { fs.unlinkSync(path.join(folderPath, f)); } catch (_) {}
          }
        }
      } catch (_) {}
    }
  }

  // Reiniciar / Desconectar línea
  async restartLine(lineKey) {
    const line = this.lines[lineKey];
    if (line) {
      if (line.reconnectTimer) {
        clearTimeout(line.reconnectTimer);
        line.reconnectTimer = null;
      }

      if (line.socket) {
        try {
          line.socket.ev.removeAllListeners();
          line.socket.end(undefined);
        } catch (e) {}
        line.socket = null;
      }

      // Si la línea no estaba conectada con éxito, limpiamos credenciales para forzar un QR nuevo
      if (line.status !== 'connected') {
        this.cleanFolder(line.folder);
      }

      line.isStarting = false;
      line.status = 'connecting';
      line.qr = null;
      line.qrDataUrl = null;
      line.user = null;
      this.broadcastLineStatus(lineKey);

      await this.startLine(lineKey);
    }
  }

  async logoutLine(lineKey) {
    const line = this.lines[lineKey];
    if (line) {
      if (line.reconnectTimer) {
        clearTimeout(line.reconnectTimer);
        line.reconnectTimer = null;
      }

      if (line.socket) {
        try {
          line.socket.ev.removeAllListeners();
          line.socket.end(undefined);
        } catch (e) {}
        line.socket = null;
      }

      // Limpiar carpeta de credenciales para permitir un nuevo escaneo limpio
      this.cleanFolder(line.folder);

      line.isStarting = false;
      line.status = 'disconnected';
      line.qr = null;
      line.qrDataUrl = null;
      line.user = null;
      this.broadcastLineStatus(lineKey);

      // Reiniciar automáticamente para generar un nuevo código QR de inmediato
      line.reconnectTimer = setTimeout(() => this.startLine(lineKey), 1200);
    }
  }
}

module.exports = new WhatsAppManager();
