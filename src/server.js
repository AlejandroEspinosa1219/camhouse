const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const config = require('./config');
const storage = require('./services/storage');
const whatsappManager = require('./bot/whatsapp_manager');
const geminiAgent = require('./bot/gemini_agent');
const updater = require('./services/updater');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Desactivar caché del navegador para desarrollo y cambios en tiempo real
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: false,
  maxAge: 0
}));

// Pasar Socket.IO al WhatsApp Manager
whatsappManager.setSocketIO(io);

// ==========================================
// REST API ROUTES
// ==========================================

// 0. Autenticación de Administrador
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const validUser = config.ADMIN_USER || 'admin';
  const validPass = config.ADMIN_PASS || 'camhouse2026';

  if (username === validUser && password === validPass) {
    const token = 'camhouse_auth_' + Buffer.from(`${username}:${Date.now()}`).toString('base64');
    return res.json({
      success: true,
      token,
      user: { username, role: 'Super Admin', agency: 'CamHouse By C&A' }
    });
  }

  return res.status(401).json({
    success: false,
    error: 'Credenciales inválidas. Verifica tu usuario y contraseña.'
  });
});

app.post('/api/auth/verify', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (token && token.startsWith('camhouse_auth_')) {
    return res.json({ success: true, authenticated: true });
  }
  return res.json({ success: true, authenticated: false });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true });
});

// 1. Estado de las líneas de WhatsApp y Cerebro IA
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    lines: whatsappManager.getAllLinesState(),
    ai: {
      engine: 'Groq AI Ultra-Fast',
      model: config.GROQ_MODEL,
      hasKey: Boolean(geminiAgent.groqKey || config.GROQ_API_KEY),
      maskedKey: geminiAgent.groqKey ? `${geminiAgent.groqKey.substring(0, 7)}...${geminiAgent.groqKey.slice(-4)}` : 'Preconfigurada'
    }
  });
});

// 2. Control de conexión de líneas (Iniciar / Reiniciar / Desconectar)
app.post('/api/lines/:line/start', async (req, res) => {
  const { line } = req.params;
  try {
    await whatsappManager.startLine(line);
    res.json({ success: true, message: `Iniciando conexión para ${line}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/lines/:line/restart', async (req, res) => {
  const { line } = req.params;
  try {
    await whatsappManager.restartLine(line);
    res.json({ success: true, message: `Línea ${line} reiniciada` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/lines/:line/logout', async (req, res) => {
  const { line } = req.params;
  try {
    await whatsappManager.logoutLine(line);
    res.json({ success: true, message: `Sesión de ${line} cerrada` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Gestor de Chats
app.get('/api/chats/:line', (req, res) => {
  const { line } = req.params;
  const chats = storage.getChats(line);
  res.json({ success: true, chats });
});

app.get('/api/chats/:line/:contactId', (req, res) => {
  const { line, contactId } = req.params;
  const chat = storage.getChat(line, contactId);
  if (!chat) {
    return res.status(404).json({ success: false, error: 'Chat no encontrado' });
  }
  storage.markChatAsRead(line, contactId);
  res.json({ success: true, chat });
});

// 4. Enviar mensaje manual desde el panel
app.post('/api/chats/:line/:contactId/message', async (req, res) => {
  const { line, contactId } = req.params;
  const { text, sender } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ success: false, error: 'El mensaje no puede estar vacío' });
  }

  try {
    const result = await whatsappManager.sendMessageFromDashboard(
      line,
      contactId,
      text.trim(),
      sender || 'Operador Velvet'
    );
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Alternar Modo IA vs Modo Manual
app.post('/api/chats/:line/:contactId/ai-mode', (req, res) => {
  const { line, contactId } = req.params;
  const { ai_mode } = req.body;

  const updatedChat = storage.setAIMode(line, contactId, ai_mode);
  if (!updatedChat) {
    return res.status(404).json({ success: false, error: 'Chat no encontrado' });
  }

  io.emit('chat_updated', { line, chat: updatedChat });
  res.json({ success: true, chat: updatedChat });
});

// 5.1 Eliminar un chat individual
app.delete('/api/chats/:line/:contactId', (req, res) => {
  const { line, contactId } = req.params;
  const success = storage.deleteChat(line, contactId);
  io.emit('chat_deleted', { line, contactId });
  res.json({ success });
});

// Fallback POST para eliminar chat individual
app.post('/api/chats/:line/:contactId/delete', (req, res) => {
  const { line, contactId } = req.params;
  const success = storage.deleteChat(line, contactId);
  io.emit('chat_deleted', { line, contactId });
  res.json({ success });
});

// 5.2 Limpiar / vaciar toda la lista de chats de una línea
app.delete('/api/chats/:line', (req, res) => {
  const { line } = req.params;
  const contactId = req.query.contactId || req.body?.contactId;
  if (contactId) {
    const success = storage.deleteChat(line, contactId);
    io.emit('chat_deleted', { line, contactId });
    return res.json({ success });
  }
  const success = storage.clearAllChats(line);
  io.emit('all_chats_cleared', { line });
  res.json({ success });
});

// Fallback POST para vaciar toda la lista
app.post('/api/chats/:line/clear-all', (req, res) => {
  const { line } = req.params;
  const success = storage.clearAllChats(line);
  io.emit('all_chats_cleared', { line });
  res.json({ success });
});

// 6. Base de Conocimiento (Lectura y Edición en tiempo real)
app.get('/api/knowledge-base', (req, res) => {
  const kb = storage.getKnowledgeBase();
  res.json({ success: true, data: kb });
});

app.put('/api/knowledge-base', (req, res) => {
  const updatedData = req.body;
  const result = storage.updateKnowledgeBase(updatedData);
  if (result.success) {
    io.emit('knowledge_base_updated', { data: result.data });
    res.json({ success: true, data: result.data });
  } else {
    res.status(500).json({ success: false, error: result.error });
  }
});

// 7. Métricas y Estadísticas
app.get('/api/metrics', (req, res) => {
  const metrics = storage.getMetrics();
  res.json({ success: true, metrics });
});

// 7.1 Reiniciar métricas a 0
app.post('/api/metrics/reset', (req, res) => {
  const result = storage.resetMetrics();
  if (result.success) {
    io.emit('metrics_updated', { metrics: result.data });
    res.json({ success: true, metrics: result.data });
  } else {
    res.status(500).json({ success: false, error: result.error });
  }
});

app.delete('/api/metrics', (req, res) => {
  const result = storage.resetMetrics();
  if (result.success) {
    io.emit('metrics_updated', { metrics: result.data });
    res.json({ success: true, metrics: result.data });
  } else {
    res.status(500).json({ success: false, error: result.error });
  }
});

// 8. Simulador de Pruebas (Permite probar respuestas de IA y derivaciones en vivo)
app.post('/api/simulate', async (req, res) => {
  const { line, contactId, senderName, text } = req.body;
  if (!line || !text) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros requeridos' });
  }

  try {
    const targetContact = contactId || (line === 'linea_reclutamiento' ? '573118942310@s.whatsapp.net' : '573155551234@s.whatsapp.net');
    const targetName = senderName || 'Aspirante de Prueba';

    await whatsappManager.simulateInboundMessage(line, targetContact, targetName, text);
    res.json({ success: true, message: 'Mensaje simulado procesado correctamente' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Configuración de API Key de Gemini desde la interfaz
app.post('/api/settings/gemini-key', (req, res) => {
  const { apiKey } = req.body;
  const success = geminiAgent.setApiKey(apiKey ? apiKey.trim() : '');
  res.json({
    success: true,
    hasKey: Boolean(geminiAgent.apiKey),
    maskedKey: geminiAgent.apiKey ? `${geminiAgent.apiKey.substring(0, 6)}...${geminiAgent.apiKey.slice(-4)}` : 'Sin configurar'
  });
});

// 10. Sistema Oficial de Auto-Actualización (GitHub OTA Updates)
app.get('/api/system/version', (req, res) => {
  const info = updater.getLocalVersion();
  res.json({ success: true, ...info });
});

app.post('/api/system/check-update', async (req, res) => {
  try {
    const result = await updater.checkForUpdates();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/system/apply-update', async (req, res) => {
  try {
    const result = await updater.downloadAndApplyUpdate();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/system/restart', (req, res) => {
  res.json({ success: true, message: 'Reiniciando motor CamHouse...' });
  setTimeout(() => process.exit(0), 1000);
});

// ==========================================
// SOCKET.IO EVENTS
// ==========================================
io.on('connection', (socket) => {
  console.log(`[Socket.io] Cliente conectado al panel web: ${socket.id}`);

  // Emitir estado actual de ambas líneas inmediatamente al conectar
  socket.emit('init_status', {
    lines: whatsappManager.getAllLinesState(),
    metrics: storage.getMetrics(),
    ai: {
      engine: 'Groq AI Ultra-Fast',
      model: config.GROQ_MODEL,
      hasKey: Boolean(geminiAgent.groqKey || config.GROQ_API_KEY)
    }
  });

  // Verificar actualización OTA inmediatamente al conectar el cliente web
  updater.checkForUpdates().then((updateCheck) => {
    if (updateCheck && updateCheck.updateAvailable) {
      socket.emit('ota_update_available', updateCheck);
    }
  }).catch(() => {});

  socket.on('disconnect', () => {
    // console.log(`[Socket.io] Cliente desconectado: ${socket.id}`);
  });
});

// ==========================================
// START SERVER
// ==========================================
server.listen(config.PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                   CAMHOUSE BY C&A ENTERPRISE                   ║
║          Plataforma de WhatsApp & Panel de Control IA          ║
╠════════════════════════════════════════════════════════════════╣
║  🌐 Servidor Web:      http://localhost:${config.PORT}                ║
║  📱 Línea 1 (Reclutamiento):  ./auth_sessions/linea_reclutamiento║
║  📱 Línea 2 (Administración): ./auth_sessions/linea_admin...    ║
║  ⚡ Cerebro IA:        Groq AI (Qwen 3.8 / LLaMA Ultra-Fast)   ║
╚════════════════════════════════════════════════════════════════╝
  `);

  // Monitor en tiempo real de actualizaciones OTA en GitHub (cada 15 segundos)
  setInterval(async () => {
    try {
      const updateCheck = await updater.checkForUpdates();
      if (updateCheck && updateCheck.updateAvailable) {
        io.emit('ota_update_available', updateCheck);
      }
    } catch (_) {}
  }, 15000);
  whatsappManager.startLine('linea_administracion');
});
