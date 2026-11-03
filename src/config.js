const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
  PORT: process.env.PORT || 4000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  ADMIN_USER: process.env.ADMIN_USER || 'admin',
  ADMIN_PASS: process.env.ADMIN_PASS || 'camhouse2026',
  GROQ_API_KEY_LINEA_1: process.env.GROQ_API_KEY_LINEA_1 || process.env.GROQ_API_KEY || '',
  GROQ_API_KEY_LINEA_2: process.env.GROQ_API_KEY_LINEA_2 || '',
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  GROQ_MODEL: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
  SESSIONS: {
    linea_reclutamiento: path.resolve(__dirname, '..', process.env.AUTH_SESSION_RECLUTAMIENTO || './auth_sessions/linea_reclutamiento'),
    linea_administracion: path.resolve(__dirname, '..', process.env.AUTH_SESSION_ADMINISTRACION || './auth_sessions/linea_administracion')
  },
  DATA_PATHS: {
    knowledge_base: path.resolve(__dirname, '..', 'data', 'knowledge_base.json'),
    chats_store: path.resolve(__dirname, '..', 'data', 'chats_store.json'),
    metrics: path.resolve(__dirname, '..', 'data', 'metrics.json')
  }
};
