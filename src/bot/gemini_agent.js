const { Groq, toFile } = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');
const storage = require('../services/storage');

class AIAgent {
  constructor() {
    this.groqKey1 = config.GROQ_API_KEY_LINEA_1 || config.GROQ_API_KEY;
    this.groqKey2 = config.GROQ_API_KEY_LINEA_2 || config.GROQ_API_KEY;
    this.groqModel = config.GROQ_MODEL || 'qwen/qwen3.8-27b';
    this.groqClient1 = null;
    this.groqClient2 = null;

    this.openaiKey = config.OPENAI_API_KEY;
    this.openaiModel = config.OPENAI_MODEL || 'gpt-4o-mini';

    this.geminiKey = config.GEMINI_API_KEY;
    this.geminiModel = config.GEMINI_MODEL || 'gemini-1.5-flash';
    this.genAI = null;

    this.init();
  }

  init() {
    if (this.openaiKey) {
      console.log(`[AIAgent] 🚀 OpenAI Principal activado con modelo: ${this.openaiModel} (5,000 req/min | 2M TPM)`);
    }

    // 1. Inicializar Groq Línea 1 (API Key independiente)
    if (this.groqKey1) {
      try {
        this.groqClient1 = new Groq({ apiKey: this.groqKey1 });
        console.log(`[AIAgent] Groq AI Línea 1 activado (Key 1) con modelo: ${this.groqModel}`);
      } catch (e) {
        console.warn('[AIAgent] Error inicializando Groq Línea 1:', e.message);
      }
    }

    // 2. Inicializar Groq Línea 2 (API Key independiente para evitar saturación)
    if (this.groqKey2) {
      try {
        this.groqClient2 = new Groq({ apiKey: this.groqKey2 });
        console.log(`[AIAgent] Groq AI Línea 2 activado (Key 2 Independiente) con modelo: ${this.groqModel}`);
      } catch (e) {
        console.warn('[AIAgent] Error inicializando Groq Línea 2:', e.message);
      }
    }

    // 3. Inicializar Gemini (Alternativa)
    if (this.geminiKey) {
      try {
        this.genAI = new GoogleGenerativeAI(this.geminiKey);
      } catch (e) {
        console.warn('[AIAgent] Error inicializando Gemini:', e.message);
      }
    }
  }

  getGroqClient(line) {
    if (line === 'linea_administracion') {
      return this.groqClient2 || this.groqClient1;
    }
    return this.groqClient1 || this.groqClient2;
  }

  // Transcripción de audios / notas de voz de WhatsApp con Groq Whisper
  async transcribeAudio(line, audioBuffer) {
    try {
      const groqClient = this.getGroqClient(line);
      if (!groqClient) {
        console.warn('[AIAgent] No hay cliente Groq configurado para transcripción de audio');
        return null;
      }

      const file = await toFile(audioBuffer, 'audio_nota_voz.ogg', { type: 'audio/ogg' });
      const transcription = await groqClient.audio.transcriptions.create({
        file: file,
        model: 'whisper-large-v3-turbo',
        language: 'es'
      });

      return transcription?.text?.trim() || null;
    } catch (err) {
      console.error('[AIAgent] Error transcribiendo audio con Groq Whisper:', err.message);
      return null;
    }
  }

  // Detección de solicitud explícita de hablar con un humano
  detectExplicitHumanRequest(text) {
    const lower = (text || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const triggers = [
      'asesor humano',
      'persona de carne y hueso',
      'persona real',
      'quiero hablar con un humano',
      'comunicarme con un humano',
      'pasame a un humano',
      'atencion humana'
    ];
    for (const t of triggers) {
      if (lower.includes(t)) return true;
    }
    return false;
  }

  // Detección de derivación / entrega de número del coordinador
  detectHandoffIntent(text, line = 'linea_reclutamiento') {
    // La entrega del contacto del coordinador es un Cierre Exitoso, NO una emergencia humana.
    // El Modo IA debe mantenerse encendido (isHandoff: false) para que Alejandra responda dudas pos-cierre.
    return { isHandoff: false, reason: null };
  }

  // Validación y limpieza estricta del nombre de la candidata
  cleanAndValidateCandidateName(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const firstWord = raw.trim().replace(/[^a-záéíóúñA-ZÁÉÍÓÚÑ]/g, '');
    if (firstWord.length < 3 || firstWord.length > 18) return null;
    const lower = firstWord.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Regex para risas, onomatopeyas y afirmaciones/negaciones repetidas (ej: 'jaja', 'jeje', 'jajaja', 'sii', 'noo', 'xd', 'lol')
    if (/^(s+i+|n+o+|j+[aeiou]+|h+[aeiou]+|x+d+|l+o+l+|a+y+|u+y+)$/i.test(lower)) return null;

    // Saludos informales y variaciones (ej: 'hols', 'holis', 'holi', 'hola', 'holaa', 'ola', 'buenas', 'buenass', 'wenas', 'hey', 'hello', 'hi')
    if (/^(h+o+l+[aeios]*|o+l+[as]*|b+u+e+n+[as]*|w+e+n+a+s*|h+e+y+|h+e+l+l+o+|h+i+)$/i.test(lower)) return null;

    const blacklist = new Set([
      'hermosa', 'princesa', 'linda', 'reina', 'corazon', 'bella', 'amiga', 'querida', 'amor',
      'claro', 'si', 'sí', 'sii', 'siii', 'sip', 'sipi', 'sep', 'nop', 'nopi', 'nooo', 'noooo',
      'hola', 'buenas', 'buenos', 'dias', 'tardes', 'noches', 'saludos', 'saludo',
      'gracias', 'muchas', 'mil', 'colombia', 'medellin', 'bello', 'envigado', 'itagui',
      'sabaneta', 'castilla', 'belen', 'poblado', 'laureles', 'robledo', 'manrique', 'aranjuez',
      'copacabana', 'girardota', 'caldas', 'estrella', 'bogota', 'cali', 'barranquilla',
      'cartagena', 'bucaramanga', 'cucuta', 'pereira', 'manizales', 'armenia', 'ibague',
      'camhouse', 'modelo', 'webcam', 'casa', 'tengo', 'anos', 'año',
      'vivo', 'desde', 'para', 'con', 'por', 'que', 'como', 'donde', 'cuanto', 'quien', 'cual',
      'todo', 'bien', 'super', 'excelente', 'perfecto', 'genial', 'entendido', 'listo', 'dale',
      'ok', 'okay', 'oki', 'okey', 'vale', 'mujer', 'chica', 'aspirante', 'usuario', 'cliente',
      'nombre', 'edad', 'sector', 'ciudad', 'barrio', 'parte', 'informacion', 'info', 'informes',
      'interesa', 'interesada', 'interesado', 'quiero', 'postulacion', 'postularme', 'oferta', 'trabajo', 'empleo', 'vacante', 'vacantes',
      'tiempo', 'disponibilidad', 'sola', 'pareja', 'system', 'notify', 'bot', 'admin',
      'soporte', 'servicio', 'store', 'tienda', 'bunker', 'android', 'iphone', 'contacto',
      'whatsapp', 'interes', 'requisitos', 'anuncio', 'tiktok', 'instagram', 'facebook',
      'pregunta', 'duda', 'dudita', 'asesora', 'coordinador',
      'jaja', 'jeje', 'jiji', 'jojo', 'jajaja', 'jejeje',
      'jajajaja', 'jejejeje', 'jajajajaja', 'haha', 'hahaha', 'xd', 'lol', 'tambien', 'tambn',
      'tbn', 'obvio', 'seguro', 'verdad', 'exacto', 'correcto', 'entonces', 'pues', 'bueno',
      'mira', 'oye', 'bebe', 'bb', 'porfa', 'porfavor', 'favor', 'uno', 'una', 'unas', 'unos',
      'mas', 'menos', 'muy', 'mucho', 'mucha', 'muchos', 'muchas', 'nada', 'poco', 'poca',
      // Estado civil y convivencia (NUNCA deben tomarse como nombres propios)
      'soltera', 'soltero', 'casada', 'casado', 'divorciada', 'divorciado', 'viuda', 'viudo',
      'separada', 'separado', 'union', 'libre', 'comprometida', 'comprometido',
      // Familia y maternidad
      'mama', 'madre', 'papa', 'padre', 'hijo', 'hija', 'hijos', 'hijas', 'hermano', 'hermana',
      'hermanos', 'hermanas', 'tio', 'tia', 'tios', 'tias', 'primo', 'prima', 'primos', 'primas',
      'abuelo', 'abuela', 'abuelos', 'sobrino', 'sobrina', 'sobrinos', 'novio', 'novia', 'esposo',
      'esposa', 'marido', 'conyuge', 'amigo', 'amiga', 'amigos', 'amigas', 'familia', 'familiares',
      // Ocupaciones / Situaciones
      'estudiante', 'trabajadora', 'trabajador', 'empleada', 'empleado', 'ama', 'profesora', 'independiente',
      // Gentilicios / Género / Descriptores
      'colombiana', 'colombiano', 'venezolana', 'venezolano', 'paisa', 'costena', 'costeno', 'rola', 'rolo',
      'mayor', 'menor', 'joven', 'adulta', 'adulto', 'varon', 'varones', 'senora', 'senor', 'man'
    ]);

    if (blacklist.has(lower)) return null;
    if (this.detectMale(firstWord)) return null;
    return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
  }

  // Extractor centralizado e inquebrantable del nombre de la candidata
  extractCandidateName(userMessage = '', conversationHistory = []) {
    const parseUserTextForName = (txt) => {
      if (!txt || typeof txt !== 'string') return null;
      const patterns = [
        /(?:me llamo|mi nombre es|hablas con)\s+([a-záéíóúñA-ZÁÉÍÓÚÑ]{3,18})/gi,
        /(?:^|\n)\s*([a-záéíóúñA-ZÁÉÍÓÚÑ]{3,18})\s+(?:tengo\s+)?\d{2}\s*(?:años|anos)?/gi,
        /(?:^|\n)\s*hola[,.\s]+(?:mucho gusto[,.\s]+)?([a-záéíóúñA-ZÁÉÍÓÚÑ]{3,18})\s+\d{2}/gi,
        /(?:^|\n)\s*hola[,.\s]+(?:soy|me llamo)\s+([a-záéíóúñA-ZÁÉÍÓÚÑ]{3,18})\b/gi,
        /(?:^|\s)(?:soy|yo soy)\s+([a-záéíóúñA-ZÁÉÍÓÚÑ]{3,18})\b/gi
      ];
      for (const regex of patterns) {
        let match;
        while ((match = regex.exec(txt)) !== null) {
          if (match[1]) {
            const v = this.cleanAndValidateCandidateName(match[1]);
            if (v) return v;
          }
        }
      }
      return null;
    };

    // 1. Buscar en el mensaje actual del usuario lo que ella escribió explícitamente
    const fromCurrentMsg = parseUserTextForName(userMessage);
    if (fromCurrentMsg) return fromCurrentMsg;

    // 2. Si el último mensaje del bot le preguntó el nombre y el usuario respondió
    if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      const lastBotMsg = [...conversationHistory].reverse().find(m => m && m.fromMe);
      if (lastBotMsg && lastBotMsg.text) {
        const askedForName = /(?:tu nombre|te llamas|como es tu nombre|tu nombre completo)/i.test(lastBotMsg.text);
        if (askedForName) {
          const words = (userMessage || '').trim().split(/\s+/).map(w => w.replace(/[^a-záéíóúñA-ZÁÉÍÓÚÑ]/g, ''));
          for (let i = 0; i < words.length; i++) {
            const v = this.cleanAndValidateCandidateName(words[i]);
            if (v) return v;
          }
        }
      }
    }

    // 3. Buscar en el historial previo de mensajes de la candidata
    if (Array.isArray(conversationHistory)) {
      // 3.1 Primero en los mensajes de la candidata
      for (const m of conversationHistory) {
        if (!m || !m.text || m.fromMe) continue;
        const fromUserHist = parseUserTextForName(m.text);
        if (fromUserHist) return fromUserHist;
      }
      // 3.2 Segundo en saludos previos validados del bot
      for (const m of conversationHistory) {
        if (!m || !m.text || !m.fromMe) continue;
        const botMatch =
          m.text.match(/¡?[Mm]ucho gusto,?\s+([A-Za-zÁ-ÿ]+)[!.,]?/) ||
          m.text.match(/¡?[Qq]ué bien,?\s+([A-Za-zÁ-ÿ]+)[!.,]?/) ||
          m.text.match(/¡?[Pp]erfecto,?\s+([A-Za-zÁ-ÿ]+)[!.,]?/) ||
          m.text.match(/¡?[Gg]enial,?\s+([A-Za-zÁ-ÿ]+)[!.,]?/) ||
          m.text.match(/¡?[Ee]xcelente,?\s+([A-Za-zÁ-ÿ]+)[!.,]?/);
        if (botMatch && botMatch[1]) {
          const v = this.cleanAndValidateCandidateName(botMatch[1]);
          if (v) return v;
        }
      }
    }

    return 'linda';
  }

  // Extractor universal e infalible de la edad de la candidata (con soporte para typos comunes como "trngo 44")
  extractCandidateAge(userMessage = '', conversationHistory = []) {
    if (!userMessage || typeof userMessage !== 'string') return null;
    const cleanLower = userMessage.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    // 1. Patrones explícitos en el mensaje del usuario (con tolerancia a typos comunes: tengo, trngo, tngo, tng, etc.)
    const explicitPatterns = [
      /\b(?:tengo|trngo|tngo|tng|tnego|tg|tedad|edad|cumplo|de|con)\s*[:=]?\s*(\d{1,2})\b/i,
      /\b(\d{1,2})\s*(?:anos|años|añitos|anitos|primaveras)\b/i,
      /\bsoy\s+mayor\s+(?:de\s+)?(?:edad\s+)?(?:trngo|tengo|tngo|tng)?\s*(\d{1,2})\b/i
    ];
    for (const pat of explicitPatterns) {
      const match = cleanLower.match(pat);
      if (match && match[1]) {
        const val = parseInt(match[1], 10);
        if (val >= 12 && val <= 90) return val;
      }
    }

    // 2. Si el último mensaje del bot le preguntó específicamente la edad y la usuaria responde con un número
    if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      const lastBotMsg = [...conversationHistory].reverse().find(m => m && m.fromMe && m.text);
      if (lastBotMsg && lastBotMsg.text) {
        const askedForAge = /(?:cuantos anos|cuántos años|tu edad|que edad tienes|cuantos añitos)/i.test(
          lastBotMsg.text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        );
        if (askedForAge) {
          const numMatch = cleanLower.match(/\b(\d{2})\b/);
          if (numMatch && numMatch[1]) {
            const val = parseInt(numMatch[1], 10);
            if (val >= 12 && val <= 90) return val;
          }
        }
      }
    }

    return null;
  }

  // Verificar si la candidata REALMENTE ha enviado al menos una foto en la conversación
  hasRealPhotoInConversation(userMessage = '', conversationHistory = []) {
    const msgStr = String(userMessage || '');
    if (msgStr.includes('📸') || msgStr.includes('[Foto') || msgStr.includes('imagen adjunta')) {
      return true;
    }
    if (Array.isArray(conversationHistory)) {
      return conversationHistory.some(m =>
        !m.fromMe && (
          m.isImage === true ||
          (typeof m.text === 'string' && (m.text.includes('📸') || m.text.includes('[Foto') || m.text.includes('imagen adjunta')))
        )
      );
    }
    return false;
  }

  // Detectar si la persona indica que NO le interesa la oferta para despedirse y apagar IA
  detectDisinterest(userMessage = '', conversationHistory = []) {
    if (!userMessage || typeof userMessage !== 'string') return false;
    const clean = userMessage.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[¡!¿?.,;:]/g, " ").replace(/\s+/g, " ").trim();
    if (!clean) return false;

    // Frases inequívocas de desinterés
    const directPhrases = [
      'no gracias',
      'no muchas gracias',
      'no mil gracias',
      'no me interesa',
      'no me interesa gracias',
      'ya no me interesa',
      'no estoy interesada',
      'no estoy interesado',
      'no quiero gracias',
      'no deseo continuar',
      'no quiero continuar',
      'no quiero seguir',
      'por ahora no gracias',
      'gracias pero no',
      'no es lo que busco',
      'no busco eso',
      'no me llama la atencion',
      'numero equivocado',
      'te equivocaste de numero'
    ];
    for (const phrase of directPhrases) {
      if (clean === phrase || clean.startsWith(phrase + ' ') || clean.endsWith(' ' + phrase) || clean.includes(' ' + phrase + ' ')) {
        return true;
      }
    }

    // Si dice simplemente "no" o "por ahora no" o "no quiero", verificar que NO esté respondiendo a "¿tienes otro trabajo?" o "¿tienes dudas?"
    if (/^(?:no|no quiero|por ahora no|no por ahora)$/.test(clean)) {
      const lastBotMsg = Array.isArray(conversationHistory)
        ? [...conversationHistory].reverse().find(m => m.fromMe && m.text)
        : null;
      const lastBotLower = lastBotMsg ? lastBotMsg.text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : '';

      // Preguntas donde "No" es una respuesta válida del flujo y NO rechazo de la oferta
      const isAnsweringFlowQuestion =
        lastBotLower.includes('otro trabajo') ||
        lastBotLower.includes('algun otro trabajo') ||
        lastBotLower.includes('dudita') ||
        lastBotLower.includes('alguna duda') ||
        lastBotLower.includes('experiencia') ||
        lastBotLower.includes('padres o familiares') ||
        lastBotLower.includes('padres') ||
        lastBotLower.includes('familiares') ||
        lastBotLower.includes('pareja') ||
        lastBotLower.includes('esposo') ||
        lastBotLower.includes('novio') ||
        lastBotLower.includes('hijos') ||
        lastBotLower.includes('privado solo para ti') ||
        lastBotLower.includes('con quien vives') ||
        lastBotLower.includes('espacio privado');

      if (!isAnsweringFlowQuestion) {
        return true;
      }
    }

    return false;
  }

  // System Prompt Oficial CamHouse - Alejandra Ramírez de CamHouse
  buildSystemPrompt(line, isPostHandoff = false, hasBotSpoken = false, candidateName = 'linda') {
    const hasRealName = candidateName && candidateName !== 'linda' && candidateName !== 'hermosa';
    const nameDirective = hasRealName
      ? `\n📌 **NOMBRE REAL DE LA CANDIDATA: "${candidateName}"**\n- Llámala siempre por su nombre real: **${candidateName}**.\n- NUNCA uses corchetes como "[Nombre]" o "[Edad]".`
      : `\n📌 **TRATO CERCANO:**\n- Aún no conoces su nombre. Llámala "linda" con cariño o salúdala amablemente.\n- NUNCA uses corchetes como "[Nombre]" o "[Edad]".`;

    let modeInstruction = '';
    if (isPostHandoff) {
      modeInstruction = `\n\n📌 **ESTADO ACTUAL: POS-CIERRE (COORDINADOR ENTREGADO)**${nameDirective}
Esta candidata ya superó el proceso y tiene el WhatsApp del coordinador (**3215863996**).
- Si hace preguntas adicionales (ganancias, horarios, equipos, etc.), responde su duda puntual con amor y brevedad.
- Recuérdale siempre escribirle al coordinador al **3215863996** diciéndole que habló con **Alejandra Ramírez** para agendar la entrega de sus equipos.\n`;
    } else if (hasBotSpoken) {
      modeInstruction = `\n\n📌 **ESTADO ACTUAL: CONVERSACIÓN EN CURSO**${nameDirective}
Ya estás conversando activamente con ella. Continúa la charla con naturalidad según lo que ella te responda o pregunte. NUNCA reinicies el saludo del Paso 1.\n`;
    } else {
      modeInstruction = `\n\n📌 **ESTADO ACTUAL: PRIMER CONTACTO**${nameDirective}
Si te escribe por primera vez sin datos, salúdala con el saludo oficial del Paso 1 pidiéndole el nombre. Si ya te dio su nombre y edad de entrada, dale la bienvenida por su nombre y avanza de inmediato.\n`;
    }

    return `**Rol e Identidad de Marca:**${modeInstruction}
Tu nombre es **Alejandra Ramírez** (te presentas como "Alejandra de CamHouse"). Eres la reclutadora oficial y la mejor aliada de las chicas en **CamHouse By C&A** en Medellín, Colombia.
Eres una mujer joven, empoderada, cercana, fresca y de total confianza, como una hermana mayor o una amiga paisa que te presenta una excelente oportunidad laboral.

---

### POTENCIADOR A: PROTOCOLO DE ESCUCHA ACTIVA + CIERRE SUAVE (OBLIGATORIO)
Cada una de tus respuestas DEBE cumplir esta estructura de 2 partes:
1. **PARTE 1 (Responder la duda concreta con empatía):**
   - Si la candidata hace CUALQUIER pregunta (ganancias, horarios, opciones, miedos, requisitos, plataformas, etc.), **tu deber absoluto es responder primero y con total claridad su pregunta**.
   - NUNCA evadas una pregunta ni saltes a pedir fotos o datos si ella tiene una duda pendiente.
2. **PARTE 2 (Cierre suave hacia el proceso):**
   - Tras responder su inquietud en 1 o 2 frases claras, hazle una pregunta amable para saber si le quedó claro o para avanzar al siguiente pasito del embudo.

---

### FORMATO Y ESTILO PARA WHATSAPP (ANTI-TEXTOS LARGOS):
* **Respuestas Cortas y Ágiles:** Máximo 2 a 3 párrafos breves (80 a 120 palabras en total). Está PROHIBIDO enviar muros de texto aburridos.
* **Tono Paisa Natural:** Cálido, respetuoso y cercano. Cero tono de telemercadeo robotizado.
* **Cero Melosería Exagerada:** Usa su nombre real (${hasRealName ? candidateName : 'Sofía'}). No repitas "hermosa" o "princesa" en cada frase.
* **Emojis Femeninos y Frescos:** Usa 1 a 3 emojis por mensaje con buen gusto (🙋🏻‍♀️ 👑 💸 ☺️ 🫶🏽 👩🏻‍💻 ✨).
* **Una Sola Pregunta a la Vez:** Nunca bombardees con múltiples preguntas en un mismo mensaje.

---

### POTENCIADOR B: MATRIZ PSICOLÓGICA DE OBJECIONES Y DUDAS FRECUENTES
Cuando la chica pregunte o exprese dudas, respóndele con estos argumentos comprobados:
* **Si pregunta qué opciones hay ("¿Cuáles son las opciones?"):**
  Explícale con dulzura los 4 puntos clave: 1. Ganancias y pagos en USD, 2. Horarios flexibles de 6h, 3. Kit de equipos prestados gratis en su casa, o 4. Proceso de entrega con el coordinador. Pregúntale de cuál le gustaría saber más o si desea continuar.
* **Si pregunta por Horarios, cómo distribuirlos o cuál es el mejor horario:**
  Explícale que son turnos de **6 horas diarias flexibles** (de lunes a sábado) adaptados a ella.
  **RECOMENDACIÓN ESTRELLA OFICIAL:** Recomiéndale siempre la sugerencia clave de CamHouse:
  *(«Te recomendamos súper especialmente que tu primera semana la hagas en el turno de la noche, empezando tipo 8:00 p.m. o 9:00 p.m. (por ejemplo de 8 p.m. a 2 a.m. o de 9 p.m. a 3 a.m.), ya que es el horario con mayor tráfico internacional de usuarios para despegar con toda y generar ingresos mucho más rápido 👑💸»).*
* **Si pregunta por Ganancias / Básico / Tokens:**
  Gana del **60% al 70% libre en USD** (inicia en 60% y sube al 70% al superar $1.000 USD). Con 6 horas al día de lunes a sábado sus semanas serán mínimas de **$800.000 a $1'000.000 COP en su primer mes**, y aumentan mes a mes. Pagos semanales o quincenales a su cuenta bancaria.
* **Si pregunta si tiene que pagar algo o invertir:**
  Enfatiza con tranquilidad: **aquí no tienes que invertir ni un solo peso**. CamHouse le presta todos los equipos en casa completamente gratis (PC para 3 plataformas, cámara 4K, luces, monitor, trípode, decoración) y no necesita experiencia.
* **Si tiene miedo / desconfianza / pregunta si es estafa:**
  Dale total tranquilidad: CamHouse está **100% legalmente constituida ante Cámara de Comercio** con contrato formal. Además, el primer gran voto de confianza lo da la empresa al llevarle equipos de alto valor a su casa sin pedirle dinero.
* **Si tiene miedo a dejar su trabajo actual:**
  Valida su emoción: es súper normal tener miedo al cambio; todas las modelos empezaron con las mismas dudas y hoy ganan el triple que en un trabajo tradicional.
* **Si dice que no tiene experiencia:**
  Tranquilízala: contará con capacitación desde cero y monitoras mujeres especializadas que la acompañan paso a paso todos los días.
* **Si le falta arreglar el cuarto, no tiene puerta o no tiene internet:**
  Dile que no se preocupe, el equipo la apoya para evaluar su habitación y decorarla, y si no tiene internet, CamHouse tiene contactos para instalación rápida prioritaria.
* **Privacidad y Bloqueo:**
  Trabajamos con páginas privadas (Streamate, Flirt4Free) y públicas (Stripchat, Chaturbate) con **bloqueo 100% para toda Colombia**, nadie de su país podrá verla.

---

### POTENCIADOR C: EMBUDO NATURAL INTELIGENTE (GUÍA DE PASOS)
Conduce la postulación paso a paso con naturalidad (si ella responde la pregunta del paso anterior y no tiene dudas, avanza al siguiente):

* **Paso 1: Saludo de Bienvenida:**
  "¡Hola! Soy Alejandra de CamHouse 🙋🏻‍♀️ Con nosotras puedes alcanzar esa independencia financiera que tanto quieres 💸 Esta postulación es para modelo webcam desde casa, ¿Te interesa la oferta? ¿Y cómo es tu nombre? ☺️"
* **Paso 2: Cero Inversión y Edad (Rango 22 a 40 años):**
  Si ya sabes su nombre, salúdala por su nombre; si aún no te ha dicho su nombre, pregúntaselo con cariño junto con su edad. Recálcale con tranquilidad que aquí no debe invertir ni un solo peso y que le prestamos todos los equipos profesionales.
  - REGLA CRÍTICA DE EDAD (22 A 40 AÑOS):
    * Si la candidata indica tener MENOS de 22 años o MÁS de 40 años (por ejemplo 18, 19, 20, 21, 41, 44, 45, etc.): DEBES despedirte de inmediato con el rechazo oficial respetuoso:
      «¡Mucho gusto, ${hasRealName ? candidateName : 'linda'}! ☺️ Agradecemos de corazón tu interés en CamHouse By C&A. Te contamos con mucho respeto que actualmente los lineamientos de nuestra convocatoria requieren una edad entre los **22 y 40 años**, por lo que en esta oportunidad no es posible continuar con el proceso. ¡Te deseamos muchos éxitos en todos tus proyectos! 👑✨»
      Queda TERMINANTEMENTE PROHIBIDO decirle que tiene la edad ideal o continuar con la postulación si está fuera del rango.
* **Paso 3: Motivación:**
  Si cumple con la edad (22-40), felicítala por tener la edad ideal y pregúntale qué la motivó a querer trabajar desde casa como modelo.
* **Paso 4: Espacio Privado y Filtro Estricto de Convivencia:**
  - Primero, conecta con su motivación y pregúntale si cuenta con un espacio privado en su habitación para transmitir y con quién vive (sola, pareja, hijos, familiares o amigos).
  - FILTRO OBLIGATORIO DE CONVIVENCIA Y PRIVACIDAD (ESTRICTO):
    * **Si vive SOLA:** Celebra su independencia: *«¡Uff, genial, ${hasRealName ? candidateName : 'linda'}! Vivir sola es una ventaja maravillosa porque tienes total privacidad e independencia para trabajar a tu propio ritmo 👑✨»*, y de inmediato continúa con el Paso 5.
    * **Si vive ACOMPAÑADA (pareja, padres, familiares, hijos adultos o amigos):** Es OBLIGATORIO confirmar si las personas con quienes vive tienen conocimiento y la apoyan.
      IMPORTANTE: NUNCA asumas que cuenta con el apoyo solo porque te dijo con quién vive. Debes preguntar OBLIGATORIAMENTE:
      *«¡Qué bien, ${hasRealName ? candidateName : 'linda'}! Tener ese espacio privado es una gran ventaja. 😊 Y cuéntame con total confianza: ¿tu pareja / las personas con quienes vives saben y te apoyan con que trabajes como modelo webcam? 🫶🏽»*
      Está TERMINANTEMENTE PROHIBIDO saltar al Paso 5 de horarios o felicitarla diciendo «¡Qué maravilla contar con ese apoyo!» hasta que ella haya respondido explícitamente que SÍ la apoyan.
    * **CRITERIO ESTRICTO DE DESCALIFICACIÓN:**
      - Si la respuesta es NEGATIVA (te indica que NO saben, que se los oculta, que es un secreto, que lo haría a escondidas, o que NO están de acuerdo / NO la apoyan), la candidata NO CUMPLE LOS REQUISITOS.
      - Debes detener el proceso inmediatamente y aplicar el PROTOCOLO DE DESPEDIDA:
        *«Entiendo perfectamente, ${hasRealName ? candidateName : 'linda'}. En CamHouse valoramos ante todo tu tranquilidad y la armonía en tu hogar. Dado que para la modalidad desde casa es un requisito indispensable contar con el pleno conocimiento y apoyo de quienes conviven contigo, en esta oportunidad no podemos continuar con tu proceso. Te deseamos muchos éxitos y bendiciones en tus proyectos 💖✨»*
      - NUNCA continúes con preguntas del proceso ni pases al Paso 5 si no cuenta con el apoyo de las personas con quienes vive.
    * **Si la respuesta es POSITIVA (SÍ saben y la apoyan EXPLÍCITAMENTE):** Felicítala con calidez: *«¡Qué maravilla contar con ese apoyo en casa! Eso te dará muchísima tranquilidad 👑🥰»*, y continúa de inmediato con el **Paso 5 (Disponibilidad de Horarios)**.
* **Paso 5: Disponibilidad de Horarios:**
  Valida si cuenta con 6 horas diarias flexibles (de lunes a sábado) y si podría iniciar pronto (en los próximos 3 días).
* **Paso 6: Plataformas, Bloqueo y Menú Informativo de 4 Opciones:**
  - Explícale sobre las mejores plataformas (privadas como Streamate y Flirt4Free, públicas como Stripchat y Chaturbate), el bloqueo 100% para toda Colombia (nadie de tu país podrá verte jamás), y las ganancias del 60% al 70% libre en USD.
  - Ofrécele con total naturalidad el Menú de 4 puntos clave antes de pasar a la siguiente etapa:
    *«Para que tengas total claridad de cada detalle, dime sobre cuál de estos temas te gustaría saber más o escríbeme el número:
    1. *Ganancias y pagos* 💸
    2. *Horarios de transmisión* ⏰
    3. *Kit de equipos prestados* 💻
    4. *Claridad del proceso de inicio* 👑
    ¿O estás lista para conocer los beneficios y continuar con tus fotos de perfil? ✨»*
  - Si la chica escribe "1", "2", "3", "4" o pregunta por alguno de ellos, respóndele de forma espléndida, estructurada y cálida (como en los ejemplos de la matriz), y luego pregúntale si le quedó claro o si desea continuar al Paso 7.
* **Paso 7: Beneficios y 2 Fotos de Perfil:**
  Menciónale los beneficios (crédito para lencería, fotos, gimnasio, monitoras) y pídele con mucha amabilidad 2 fotos (una de rostro y una de cuerpo) para conocer su perfil, recordándole que no se discrimina a nadie.
* **Paso 8: Confirmación de Ubicación (Valle de Aburrá y Área Metropolitana):**
  - Agradece sus fotos y confirma en qué municipio o sector vive.
  - La convocatoria cubre Medellín (todos sus barrios) y los municipios del Área Metropolitana: Bello, Itagüí, Envigado, Sabaneta, Caldas, La Estrella, San Antonio de Prado, Copacabana, Girardota y Barbosa.
  - REGLA DE ORO DE TRANSPORTE Y EQUIPOS: No te comprometas con entregas ni hagas promesas específicas de transporte a ningún municipio; simplemente valida que pertenece al área metropolitana y avanza al Paso 9.
  - Si vive en cualquier ciudad lejana fuera del área metropolitana (Bogotá, Cali, Barranquilla, Bucaramanga, Pereira, etc. o municipios lejanos de Antioquia como Rionegro), agradece y despídete amablemente indicando que por ahora la convocatoria es solo para Medellín y su Área Metropolitana.
* **Paso 9: Cierre Exitoso y Contacto del Coordinador:**
  Felicítala por completar el proceso y entrégale el contacto de nuestro coordinador al WhatsApp **3215863996**, recordándole siempre decirle que habló con **Alejandra Ramírez** para que él evalúe la ubicación y concrete todos los detalles finales directamente con ella.

---

### REGLAS DE SEGURIDAD INDISPENSABLES:
1. **FILTRO ESTRICTO DE GÉNERO (VACANTE EXCLUSIVAMENTE PARA MUJERES):**
   Esta postulación de modelaje webcam está dirigida 100% y de manera exclusiva a mujeres mayores de edad.
   Si quien escribe es un hombre, indica un nombre típicamente masculino (ej. Jesús, Juan, Carlos, etc.) o se refiere a sí mismo como hombre:
   Debes responder INMEDIATAMENTE y únicamente con el rechazo oficial respetuoso:
   "Hola, [Nombre/amigo]. Agradecemos sinceramente tu interés en CamHouse By C&A. Sin embargo, te informamos de manera muy respetuosa que esta postulación de modelaje webcam está dirigida exclusivamente a mujeres, por lo que en esta oportunidad no es posible continuar con tu proceso. Te deseamos muchos éxitos en tus proyectos."
   Está TERMINANTEMENTE PROHIBIDO tratar a un hombre como mujer, decirle "interesada", "linda", "chica", o continuar con los pasos del embudo.
2. **Cero Frase "no es negociable":** NUNCA uses esa frase.
3. **Fidelidad al Nombre:** Recuerda que la aspirante se llama **${hasRealName ? candidateName : 'linda'}** y tú eres **Alejandra Ramírez**.
4. **FILTRO ESTRICTO DE EDAD (22 A 40 AÑOS OBLIGATORIO):**
   La postulación es estrictamente para mujeres entre 22 y 40 años. Si la persona indica una edad menor a 22 o mayor a 40 años (ej. 44 años), DEBES responder de inmediato con el rechazo oficial por lineamientos de edad. Queda TERMINANTEMENTE PROHIBIDO decirle que tiene la edad ideal o continuar haciéndole preguntas si no cumple la edad.`;
  }

  detectMale(text) {
    if (!text || typeof text !== 'string') return null;

    const cleanLower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!cleanLower) return null;

    // 1. Descartar si el texto es una ubicación, barrio, vereda o corregimiento (ej: "San Félix", "San Cristóbal", "Barrio San Javier", etc.)
    const placePattern = /\b(?:san|santa|santo|vereda|barrio|sector|corregimiento|comuna|calle|carrera|cra|diagonal|diag|transversal|transv)\s+[a-záéíóúñ]+/i;
    if (placePattern.test(cleanLower)) {
      return null;
    }

    // 1.1 Descartar si el mensaje habla de convivencia con familiares ("vivo con mi papa", "mi esposo", etc.)
    const relativePattern = /\b(?:vivo con|con mi|esposo|novio|pareja|padre|papa|papá|hermano|hijo|primo|tio|tío|amigo)\b/i;
    if (relativePattern.test(text) && (cleanLower.includes('vivo con') || cleanLower.includes('con mi'))) {
      return null;
    }

    // 2. Frases directas y pronombres/adjetivos que indican aspirante hombre
    const malePhrases = [
      /\b(?:soy|yo soy|me llamo|mi nombre es)\s+(?:un\s+)?(?:hombre|varon|varón|chico|chico trans|hombre trans|masculino|soltero|casado|paisa hombre|chico gay|man)\b/i,
      /\b(?:soy|yo soy)\s+(?:hombre|varon|varón|chico|masculino|soltero|casado|un man)\b/i,
      /\b(?:estoy|quedo|sigo)\s+(?:muy\s+)?interesado\b/i,
      /\binteresado\s+(?:en\s+la\s+oferta|en\s+el\s+trabajo|en\s+la\s+vacante)\b/i,
      /\b(?:siendo|para|pueden|reciben|aceptan|admiten|trabajo para|postulacion para|vacante para)\s+(?:hombres?|varones?|chicos?|man)\b/i,
      /\b(?:un\s+hombre\s+puede|hombres\s+pueden|reciben\s+hombres|aceptan\s+hombres|trabajan\s+hombres)\b/i,
      /\b(?:puedo\s+postularme\s+siendo\s+hombre|un\s+varon\s+puede|reciben\s+varones|aceptan\s+varones)\b/i,
      /\b(?:modelo|postulacion|vacante)\s+(?:masculino|masculina|para hombres?)\b/i,
      /^(?:hombre|masculino|varon|varón|chico|soltero)$/i
    ];
    for (const regex of malePhrases) {
      if (regex.test(cleanLower)) {
        return 'amigo';
      }
    }

    // 3. Diccionario exhaustivo de nombres masculinos en Colombia y Latinoamérica
    const maleNames = new Set([
      // A
      'aaron', 'abel', 'abelardo', 'abner', 'abraham', 'adalberto', 'adolfo', 'adrian', 'agustin',
      'alain', 'alan', 'albeiro', 'alberto', 'aldo', 'alejandro', 'alejo', 'alejoespinosa', 'alejito',
      'alito', 'alex', 'alexander', 'alexis', 'alfonso', 'alfredo', 'alonso', 'alonzo', 'alvaro',
      'amadeo', 'amado', 'amador', 'amando', 'ambrosio', 'amilcar', 'amos', 'ananias', 'anibal',
      'anselmo', 'antonio', 'antony', 'anthony', 'apolo', 'aquiles', 'ariel', 'armando', 'arnaldo',
      'arnoldo', 'artemio', 'arturo', 'atanasio', 'augusto', 'aurelio', 'axel', 'ayrton',
      // B
      'baldomero', 'baltazar', 'barac', 'bartolo', 'bartolome', 'basilio', 'bautista', 'benedicto',
      'benigno', 'benito', 'benjamin', 'bernabe', 'bernardo', 'blas', 'boris', 'brandon', 'braulio',
      'brayam', 'brayan', 'brian', 'bruno', 'bryan', 'byron',
      // C
      'caleb', 'camilo', 'candido', 'carlos', 'carmelo', 'casimiro', 'cayetano', 'ceferino', 'celestino',
      'celso', 'cesar', 'christian', 'christopher', 'cipriano', 'ciro', 'claudio', 'clemente', 'conrado',
      'constantino', 'cornelio', 'crisanto', 'crispin', 'cristian', 'cristo', 'cristobal',
      // D
      'dairo', 'dalmiro', 'damian', 'damiano', 'daniel', 'danilo', 'dante', 'dario', 'darwin', 'david',
      'deimer', 'demetrio', 'denis', 'derian', 'diego', 'dilan', 'dimas', 'dionisio', 'domingo',
      'donato', 'doroteo', 'duvan', 'dylan',
      // E
      'eder', 'edgar', 'edgard', 'edgardo', 'edison', 'edmundo', 'eduardo', 'edward', 'edwin',
      'efrain', 'eladio', 'eleazar', 'elias', 'eliecer', 'eligio', 'eliseo', 'elkin', 'elmer',
      'eloy', 'emanuel', 'emiliano', 'emilio', 'enmanuel', 'enoc', 'enrique', 'epifanio', 'erasmo',
      'eric', 'erick', 'erik', 'ernesto', 'esteban', 'eugenio', 'eusebio', 'eustaquio', 'evaristo',
      'ever', 'everardo', 'ezequiel',
      // F
      'fabian', 'fabio', 'fabricio', 'facundo', 'faustino', 'fausto', 'federico', 'feliciano',
      'felipe', 'felix', 'fermin', 'fernando', 'fidel', 'florencio', 'florentino', 'fortunato',
      'francisco', 'franco', 'frank', 'franklin', 'freddy', 'fredy', 'froilan', 'fulgencio',
      // G
      'gabriel', 'gael', 'gaspar', 'gaston', 'genaro', 'geovanny', 'gerardo', 'german', 'gerson',
      'gervasio', 'giancarlo', 'gil', 'gilberto', 'giovanni', 'godofredo', 'gonzalo', 'gregorio',
      'guido', 'guillermo', 'gustavo',
      // H
      'harol', 'harold', 'hector', 'heliodoro', 'heraclio', 'heriberto', 'herman', 'hermenegildo',
      'hermes', 'herminio', 'hernan', 'hernando', 'hilario', 'hipolito', 'homero', 'horacio',
      'hugo', 'humberto',
      // I
      'ian', 'ibrahim', 'ignacio', 'igor', 'ildefonso', 'inigo', 'inocencio', 'isaac', 'isaias',
      'isidoro', 'isidro', 'ismael', 'israel', 'ivan',
      // J
      'jacinto', 'jacobo', 'jader', 'jaider', 'jaime', 'jair', 'jairo', 'javier', 'jean', 'jefferson',
      'jeison', 'jeremias', 'jeremy', 'jeronimo', 'jesus', 'jesús', 'jhair', 'jhon', 'jhonatan',
      'jhonny', 'jhony', 'joaquin', 'joel', 'johan', 'john', 'johnny', 'jonas', 'jonathan', 'jordan',
      'jorge', 'jose', 'joseph', 'joshua', 'josue', 'juan', 'judas', 'julian', 'julio', 'justino',
      'justo', 'juvenal',
      // K
      'kevin',
      // L
      'ladislao', 'laureano', 'lazaro', 'leandro', 'leocadio', 'leon', 'leonardo', 'leoncio',
      'leonel', 'leopoldo', 'lino', 'lisandro', 'lorenzo', 'lucas', 'luciano', 'lucio', 'luis',
      // M
      'macario', 'maicol', 'manuel', 'marcelino', 'marcelo', 'marcial', 'marco', 'marcos',
      'mariano', 'marino', 'mario', 'marlon', 'martin', 'mateo', 'matias', 'mauricio', 'mauro',
      'maximiano', 'maximiliano', 'maximo', 'melchor', 'michael', 'miguel', 'misael', 'modesto',
      'moises',
      // N
      'narciso', 'natalio', 'nazario', 'nehemias', 'nelson', 'nemesio', 'nestor', 'nicanor',
      'nicolas', 'noah', 'noe', 'noel', 'norberto',
      // O
      'octavio', 'oliver', 'oliverio', 'omar', 'orazio', 'orestes', 'orlando', 'oscar', 'oseas',
      'osmin', 'osvaldo', 'oswaldo', 'otilio', 'otoniel', 'ovidio',
      // P
      'pablo', 'pancracio', 'panfilo', 'pascual', 'patricio', 'paul', 'paulino', 'pedro', 'pelayo',
      'percy', 'pio', 'placido', 'plutarco', 'policarpo', 'ponciano', 'porfirio', 'primitivo',
      'prospero', 'prudencio',
      // R
      'rafael', 'rami', 'ramiro', 'ramon', 'raul', 'raymundo', 'reimundo', 'reinaldo', 'remigio',
      'renato', 'rene', 'rey', 'reynaldo', 'ricardo', 'richard', 'rigoberto', 'roberto', 'rodolfo',
      'rodrigo', 'rogelio', 'roger', 'rolando', 'ronal', 'ronald', 'roque', 'rosendo', 'ruben',
      'ruperto',
      // S
      'sabino', 'salomon', 'salvador', 'samir', 'samuel', 'sancho', 'santiago', 'santino',
      'santos', 'saturnino', 'saul', 'sebastian', 'segismundo', 'serapio', 'sergio', 'servando',
      'severino', 'severo', 'silverio', 'silvestre', 'silvio', 'simon', 'sixto', 'stewart',
      'steven', 'stiven',
      // T
      'tadeo', 'teodoro', 'teofilo', 'thiago', 'tiago', 'tibursio', 'timoteo', 'tito', 'tomas',
      'toribio',
      // U
      'ulises', 'urbano',
      // V
      'valentin', 'valerio', 'venceslao', 'vicente', 'victor', 'victorio', 'vidal', 'virgilio',
      'vladimir',
      // W
      'walter', 'wenceslao', 'wilfrido', 'williams', 'willy', 'wilmar', 'wilmer', 'wilson',
      // X
      'xavier',
      // Y
      'yadir', 'yeferson', 'yeider', 'yeimer', 'yeison', 'yohan', 'yomar',
      // Z
      'zacarias'
    ]);

    // Detección directa si el usuario dice: "me llamo X", "mi nombre es X", "hablas con X", "soy X"
    const introMatch = cleanLower.match(/\b(?:me llamo|mi nombre es|hablas con|(?:^|\s)soy)\s+([a-z]+)\b/i);
    if (introMatch && introMatch[1]) {
      const candidateNameWord = introMatch[1].trim();
      if (maleNames.has(candidateNameWord)) {
        return candidateNameWord.charAt(0).toUpperCase() + candidateNameWord.slice(1);
      }
    }

    const stopWords = new Set([
      'si', 'no', 'hola', 'buenas', 'dias', 'tardes', 'noches', 'oferta', 'postulacion', 'vacante',
      'modelo', 'webcam', 'casa', 'trabajar', 'interesada', 'interesa', 'tengo', 'anos', 'meses',
      'plata', 'dinero', 'por', 'favor', 'como', 'estas', 'bien', 'claro', 'info', 'informacion',
      'gracias', 'muchas', 'cuanto', 'pagan', 'donde', 'queda', 'medellin', 'bello', 'envigado',
      'quiero', 'saber', 'trabajo', 'requisitos', 'horarios', 'equipos', 'ganancias'
    ]);

    const clean = cleanLower.replace(/[^\w\s]/g, " ").trim();
    const words = clean.split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w));
    for (const w of words) {
      if (maleNames.has(w)) {
        return w.charAt(0).toUpperCase() + w.slice(1);
      }
    }
    return null;
  }

  // Aplicación unificada de blindajes deterministas de texto
  applySafeguards(reply, userMessage, conversationHistory, hasBotSpoken, isPostHandoff, knownName = '') {
    if (!reply) return reply;

    // Extraer el nombre real de la candidata desde todas las fuentes posibles
    let candidateName = this.extractCandidateName(userMessage, conversationHistory, knownName);
    const nameMatchDirect =
      reply.match(/¡?[Pp]erfecto,?\s+([A-Za-zÁ-ÿ]+)[!.,]?/) ||
      reply.match(/¡?[Qq]ué bien,?\s+([A-Za-zÁ-ÿ]+)[!.,]?/) ||
      reply.match(/¡?[Mm]ucho gusto,?\s+([A-Za-zÁ-ÿ]+)[!.,]?/);
    if (
      candidateName === 'linda' &&
      nameMatchDirect &&
      nameMatchDirect[1]
    ) {
      const validatedDirect = this.cleanAndValidateCandidateName(nameMatchDirect[1]);
      if (validatedDirect) {
        candidateName = validatedDirect;
      }
    }

    // Blindaje 0: CERO PLACEHOLDERS LITERALES ([Nombre], [Edad], [Sector], etc.)
    reply = reply.replace(/\[\s*(?:Reacci[oó]n|Instrucci[oó]n|Ejemplo|ej:|Nota|Responde)[^\]]*\]\s*/gi, '');
    reply = reply.replace(/\[[A-Za-zÁ-ÿ\s,.:;¡!¿?]+(?:meta|objetivo|cálida|ejemplo)[^\]]*\]\s*/gi, '');
    reply = reply.replace(/\[\s*(?:nombre|name|candidata|chica|aspirante|usuario|cliente)(?:\s*\/[^\]]*)?\s*\]/gi, candidateName);
    reply = reply.replace(/\{\s*(?:nombre|name|candidata)(?:\s*\/[^\}]*)?\s*\}/gi, candidateName);
    reply = reply.replace(/\[\s*edad\s*\]/gi, 'tus');
    reply = reply.replace(/\[\s*sector\s*\]/gi, 'Tu sector');

    // Blindaje 0.05: Blindaje Anti-Risas / Anti-Blacklist en saludos generados (ej: "Mucho gusto, Jaja", "¡Qué bien, Jaja!", "Mucho gusto, System!")
    reply = reply.replace(/(?:^|[.!?\n]\s*)(¡?[Qq]ué bien|¡?[Mm]ucho gusto|¡?[Pp]erfecto|¡?[Gg]enial|¡?[Hh]ola),?\s+(?:Jaja|Jeje|Jiji|Jojo|Hahaha?|Xd|Lol|System|Notify|Bot|Admin)([!.,]?)/gi, (match, prefix, punct) => {
      if (candidateName && candidateName !== 'linda') {
        return `${prefix}, ${candidateName}${punct || '!'}`;
      }
      return `${prefix}!`;
    });

    // Blindaje 0.1: PROHIBICIÓN TOTAL DE LA FRASE "no es negociable"
    reply = reply.replace(/\s*y\s+\*{0,2}no\s+es\s+negociable\*{0,2},?/gi, '');
    reply = reply.replace(/\*{0,2}no\s+es\s+negociable\*{0,2}/gi, '');

    // Blindaje de Edad (Rango 22 a 40 años): Si la candidata tiene menos de 22 o más de 40 años, NUNCA felicitarla ni avanzar
    const ageInSafeguards = this.extractCandidateAge(userMessage, conversationHistory);
    if (ageInSafeguards !== null && (ageInSafeguards < 22 || ageInSafeguards > 40)) {
      const nameForFarewell = candidateName && candidateName !== 'linda' ? candidateName : 'linda';
      console.warn(`[AIAgent] Se interceptó edad fuera de rango en safeguards (${ageInSafeguards} años). Reemplazando por rechazo formal.`);
      return `¡Mucho gusto, ${nameForFarewell}! ☺️ Agradecemos de corazón tu interés en CamHouse By C&A. Te contamos con mucho respeto que actualmente los lineamientos de nuestra convocatoria requieren una edad entre los **22 y 40 años**, por lo que en esta oportunidad no es posible continuar con el proceso. ¡Te deseamos muchos éxitos en todos tus proyectos! 👑✨`;
    }

    // Blindaje Anti-Hombre en respuesta generada: Si la IA saludó a un hombre (ej: "¡Genial, Jesus!", "¡Qué bien, Juan!", "Mucho gusto, Carlos")
    const maleGreetingMatch = reply.match(/(?:¡?[Qq]u[eé]\s+bien|¡?[Mm]ucho\s+gusto|¡?[Pp]erfecto|¡?[Gg]enial|¡?[Ee]xcelente|¡?[Hh]ola(?:\s+de\s+nuevo)?|¡?[Bb]ienvenid[oa]),?\s+([A-Za-zÁ-ÿ]+)[!.,]?/i);
    if (maleGreetingMatch && maleGreetingMatch[1]) {
      const greeted = maleGreetingMatch[1].trim();
      const isMaleGreeted = this.detectMale(greeted);
      if (isMaleGreeted) {
        console.warn(`[AIAgent] Se interceptó saludo a hombre en respuesta (${greeted}). Reemplazando por rechazo formal.`);
        return `Hola, ${isMaleGreeted}. Agradecemos sinceramente tu interés en CamHouse By C&A. Sin embargo, te informamos de manera muy respetuosa que esta postulación de modelaje webcam está dirigida exclusivamente a mujeres, por lo que en esta oportunidad no es posible continuar con tu proceso. Te deseamos muchos éxitos en tus proyectos.`;
      }
    }

    if (candidateName && candidateName !== 'linda') {
      const isCandidateMale = this.detectMale(candidateName);
      if (isCandidateMale) {
        console.warn(`[AIAgent] Se interceptó candidateName masculino en safeguards (${candidateName}). Reemplazando por rechazo formal.`);
        return `Hola, ${isCandidateMale}. Agradecemos sinceramente tu interés en CamHouse By C&A. Sin embargo, te informamos de manera muy respetuosa que esta postulación de modelaje webcam está dirigida exclusivamente a mujeres, por lo que en esta oportunidad no es posible continuar con tu proceso. Te deseamos muchos éxitos en tus proyectos.`;
      }
    }

    // Blindaje 1: En el primer mensaje de la conversación (cuando el bot nunca ha hablado en este chat):
    if (!hasBotSpoken) {
      // Verificar si en este primer mensaje la chica escribió EXPLÍCITAMENTE su nombre
      const explicitIntroPattern = /(?:me llamo|mi nombre es|hablas con|(?:^|\s)soy)\s+([a-záéíóúñA-ZÁÉÍÓÚÑ]{3,18})/i;
      const mIntro = String(userMessage || '').match(explicitIntroPattern);
      const validatedIntroName = mIntro && mIntro[1] ? this.cleanAndValidateCandidateName(mIntro[1]) : null;

      if (!validatedIntroName) {
        // SIEMPRE saludo oficial institucional del Paso 1
        return '¡Hola! Soy Alejandra de CamHouse 🙋🏻‍♀️ Con nosotras puedes alcanzar esa independencia financiera que tanto quieres 💸 Esta postulación es para modelo webcam desde casa, ¿Te interesa la oferta? ¿Y cómo es tu nombre? ☺️';
      }
    }

    // Blindaje 1.5: Si la candidata ya dio su nombre y edad en el mensaje actual, nunca preguntarle "¿Y cómo es tu nombre?"
    if (reply.includes('¿Te interesa la oferta? ¿Y cómo es tu nombre?') && candidateName !== 'linda') {
      const ageMatch = String(userMessage || '').match(/\b([23]\d|40)\s*(?:años|anos)?\b/i);
      if (ageMatch && ageMatch[1]) {
        reply = `¡Mucho gusto, ${candidateName}! ☺️ Algo súper importante: *aquí no tienes que invertir ni un solo peso*. Nosotras te prestamos todos los equipos desde el primer día y no necesitas experiencia previa. ¡Y con tus ${ageMatch[1]} años cumples con la edad ideal! 👑 Cuéntame, ¿qué te motivó a querer ser modelo webcam y trabajar desde tu casa?`;
      } else {
        reply = `¡Mucho gusto, ${candidateName}! ☺️ Algo súper importante: *aquí no tienes que invertir ni un solo peso*. Nosotras te prestamos todos los equipos desde el primer día y no necesitas experiencia previa. Cuéntame, ¿cuántos años tienes?`;
      }
    }

    // Blindaje 2: Si ya hay conversación activa y por error intentó repetir el saludo de Step 1
    if (hasBotSpoken && (reply.includes('Soy Alejandra de CamHouse') && reply.includes('¿Y cómo es tu nombre?'))) {
      console.warn('[AIAgent] Se interceptó repetición indebida del saludo en conversación activa. Ajustando respuesta...');
      if (isPostHandoff) {
        reply = `¡Claro que sí, ${candidateName}! Recuerda que hablaste con **Alejandra Ramírez** y todos los detalles finales y la entrega de tus equipos los coordinas directamente con nuestro coordinador al WhatsApp **3215863996** 📲. ¡Escríbele para agendar tu cita! 🫶🏽`;
      } else {
        reply = `¡Mucho gusto, ${candidateName}! ☺️ Algo súper importante: *aquí no tienes que invertir ni un solo peso*. Nosotras te prestamos todos los equipos desde el primer día y no necesitas experiencia previa. Cuéntame, ¿cuántos años tienes?`;
      }
    }

    // Blindaje de Convivencia y Apoyo de Pareja/Familia (Paso 4):
    // Si la candidata indica que vive acompañada (novio, esposo, pareja, papás, familia)
    // NUNCA felicitarla por tener apoyo ni pasar al Paso 5 (horarios) si no ha confirmado explícitamente que la apoyan.
    const livesAccompaniedRegex = /\b(?:vivo con|con mi|con mis|con amigos|con amigas|con familiares|mi novio|mi esposo|mi pareja|mis padres|mis papas|mis papás|mi mama|mi mamá|mi papa|mi papá)\b/i;
    const confirmsSupportRegex = /\b(?:si sabe|si saben|si me apoya|si me apoyan|saben y me apoyan|sabe y me apoya|estan de acuerdo|esta de acuerdo|si estan de acuerdo|si esta de acuerdo|me apoya|me apoyan|cuenta con el apoyo|cuento con su apoyo|saben todo|lo saben|estan enterados|esta enterado)\b/i;

    if (livesAccompaniedRegex.test(userMessage) && !confirmsSupportRegex.test(userMessage)) {
      const hadConfirmedSupportBefore = Array.isArray(conversationHistory) && conversationHistory.some(m => !m.fromMe && m.text && confirmsSupportRegex.test(m.text));
      if (!hadConfirmedSupportBefore) {
        const praisesSupport = /(?:maravilla contar con ese apoyo|contar con ese apoyo|gran apoyo en casa|apoyo en casa|maravilla de apoyo)/i.test(reply);
        const skipsToHours = /(?:disponibilidad|6 horas|lunes a sabado|iniciar pronto|proximos 3 dias)/i.test(reply);
        const asksForSupport = /(?:saben y te apoyan|sabe y te apoya|saben y apoyan|cuenta con el apoyo|te apoya|te apoyan)/i.test(reply);

        if (praisesSupport || (skipsToHours && !asksForSupport)) {
          console.warn(`[AIAgent] Se interceptó felicitación indebida de apoyo o salto a horarios cuando la candidata vive acompañada sin confirmación. Forzando pregunta de apoyo.`);
          reply = `¡Qué bien, ${candidateName}! Tener ese espacio privado es una gran ventaja. 😊\n\nY cuéntame con total confianza: ¿tu pareja / las personas con quienes vives saben y te apoyan con que trabajes como modelo webcam? 🫶🏽`;
        }
      }
    }

    // Blindaje 2: Si el mensaje entrega el número del coordinador (3215863996), asegurar que mencione a Alejandra Ramírez
    if ((reply.includes('3215863996') || reply.includes('321 586 3996')) && !reply.includes('Alejandra Ramírez') && !reply.includes('Alejandra Ramirez')) {
      reply = reply
        .replace(/diciendo que vienes de mi parte/gi, 'y recuerda decirle que hablaste con *Alejandra Ramírez*')
        .replace(/menciona que vienes de mi parte/gi, 'recuerda decirle que hablaste con *Alejandra Ramírez*')
        .replace(/dile que ya hablaste conmigo/gi, 'recuérdale que hablaste con *Alejandra Ramírez*');
      if (!reply.includes('Alejandra Ramírez')) {
        reply += '\n\n¡Recuerda decirle a nuestro coordinador que hablaste con *Alejandra Ramírez*! 👑📲';
      }
    }

    return reply;
  }

  // Generador principal de respuesta
  async generateResponse(line, userMessage, conversationHistory = [], knownName = '') {
    const lowerUserMsg = (userMessage || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const candidateName = this.extractCandidateName(userMessage, conversationHistory, knownName);

    // 0. Detección de desinterés ("No gracias", "No me interesa", etc.) -> Despedida única y silenciamiento automático
    if (this.detectDisinterest(userMessage, conversationHistory)) {
      console.log(`[AIAgent] Desinterés detectado ("${userMessage}"). Enviando despedida amable y desactivando Modo IA.`);
      const farewellName = candidateName && candidateName !== 'linda' ? candidateName : 'linda';
      return {
        text: `¡Entendido, ${farewellName}! ☺️ Agradecemos mucho tu tiempo y tu amabilidad. Si en algún momento cambias de opinión, en CamHouse estaremos con las puertas abiertas para ti. ¡Te deseamos muchos éxitos en todos tus proyectos! 👑✨`,
        isHandoff: false,
        isRejected: true,
        rejectionStatus: 'No Interesada',
        reason: 'Candidata indicó que no está interesada en la oferta'
      };
    }

    // 1. Detección directa de solicitud explícita de hablar con un humano
    if (this.detectExplicitHumanRequest(userMessage)) {
      const handoffReply = `¡Hola, ${candidateName}! 🌟 Claro que sí, con mucho gusto. Para coordinar cualquier detalle particular directamente con una persona, escríbele a nuestro coordinador a este WhatsApp: **3215863996** 📲. ¡Recuerda decirle que hablaste con **Alejandra Ramírez**!`;
      return {
        text: handoffReply,
        isHandoff: true,
        reason: 'Solicitud explícita de asesor humano'
      };
    }

    // 2. Detección de aspirante hombre (postulación exclusiva para mujeres)
    let detectedMaleName = this.detectMale(userMessage);

    // Si no está en el mensaje actual, revisar si en el historial el usuario se presentó como hombre
    if (!detectedMaleName && Array.isArray(conversationHistory)) {
      for (const m of conversationHistory) {
        if (!m.fromMe && m.text) {
          const maleInPast = this.detectMale(m.text);
          if (maleInPast) {
            detectedMaleName = maleInPast;
            break;
          }
        }
      }
    }

    if (detectedMaleName) {
      console.warn(`[AIAgent] Se detectó aspirante hombre (${detectedMaleName}). Deteniendo proceso con despedida formal respetuosa.`);
      return {
        text: `Hola, ${detectedMaleName}. Agradecemos sinceramente tu interés en CamHouse By C&A. Sin embargo, te informamos de manera muy respetuosa que esta postulación de modelaje webcam está dirigida exclusivamente a mujeres, por lo que en esta oportunidad no es posible continuar con tu proceso. Te deseamos muchos éxitos en tus proyectos.`,
        isHandoff: false,
        isRejected: true,
        rejectionStatus: 'No Apto - Hombre',
        reason: 'Postulación no apta - Candidato masculino'
      };
    }

    // 2.1 Filtro Universal e Infalible de Edad (Rango 22 a 40 años)
    const detectedAge = this.extractCandidateAge(userMessage, conversationHistory);
    if (detectedAge !== null && (detectedAge < 22 || detectedAge > 40)) {
      console.log(`[AIAgent] Candidata fuera de rango de edad detectada (${detectedAge} años). Despidiendo formalmente.`);
      const nameForAgeFarewell = candidateName && candidateName !== 'linda' ? candidateName : 'linda';
      return {
        text: `¡Mucho gusto, ${nameForAgeFarewell}! ☺️ Agradecemos de corazón tu interés en CamHouse By C&A. Te contamos con mucho respeto que actualmente los lineamientos de nuestra convocatoria requieren una edad entre los **22 y 40 años**, por lo que en esta oportunidad no es posible continuar con el proceso. ¡Te deseamos muchos éxitos en todos tus proyectos! 👑✨`,
        isHandoff: false,
        isRejected: true,
        rejectionStatus: 'Fuera de Rango de Edad',
        reason: `Edad fuera de rango permitido (${detectedAge} años)`
      };
    }

    // 2.5 Detección de pregunta por el nombre de la asesora ("¿y con quién hablé?", "¿cómo te llamas?", "¿de parte de quién?")
    const isAskingAgentName = (
      lowerUserMsg.includes('con quien hable') ||
      lowerUserMsg.includes('con quien hablo') ||
      lowerUserMsg.includes('con quien estoy hablando') ||
      lowerUserMsg.includes('con quien tengo el gusto') ||
      lowerUserMsg.includes('como te llamas') ||
      lowerUserMsg.includes('cual es tu nombre') ||
      lowerUserMsg.includes('como es tu nombre') ||
      lowerUserMsg.includes('me recuerdas tu nombre') ||
      lowerUserMsg.includes('tu nombre es') ||
      lowerUserMsg.includes('quien me atendio') ||
      lowerUserMsg.includes('quien me hablo') ||
      lowerUserMsg.includes('de parte de quien') ||
      lowerUserMsg.includes('digo que hable con quien')
    );
    if (isAskingAgentName) {
      return {
        text: `¡Hablaste con **Alejandra Ramírez**, ${candidateName}! ☺️ Cuando le escribas a nuestro coordinador al WhatsApp *3215863996*, recuérdale que hablaste con **Alejandra Ramírez** para que te ayude con los detalles finales y programe de una vez la entrega de tus equipos en casa 👑📲`,
        isHandoff: false
      };
    }

    // 2.6 Cobertura Oficial (Medellín + Todo el Área Metropolitana del Valle de Aburrá)
    const allowedCoverageAreas = /\b(?:medellin|bello|itagui|itagüi|caldas|san antonio de prado|la estrella|estrella|sabaneta|envigado|copacabana|girardota|barbosa|castilla|belen|poblado|provenza|laureles|robledo|manrique|aranjuez|buenos aires|san javier|guayabal|santa cruz|popular|doce de octubre|villa hermosa|candelaria|san cristobal|altavista|santa elena|san felix|san diego|san lucas|san joaquin|estadio|la floresta|floresta|la america|america|patio bonito|conquistadores)\b/i;
    const outOfCoverageCities = /\b(?:rionegro|la ceja|marinilla|guarne|bogota|cali|barranquilla|cartagena|bucaramanga|cucuta|pereira|manizales|armenia|santa marta|ibague|pasto|monteria|villavicencio|neiva|valledupar|popayan|sincelejo|tunja|riohacha|quibdo|yopal|florencia|palmira|buenaventura|soacha|tulua|buga|cartago|sogamoso|duitama|barrancabermeja|girardot|dosquebradas)\b/i;

    if (outOfCoverageCities.test(lowerUserMsg) && !allowedCoverageAreas.test(lowerUserMsg)) {
      console.log(`[AIAgent] Ubicación fuera de cobertura detectada ("${userMessage}"). Enviando despedida amable y desactivando IA.`);
      return {
        text: `¡Muchas gracias por tu interés en CamHouse, ${candidateName}! ☺️ Te contamos con mucho cariño que por el momento nuestra convocatoria aplica exclusivamente para **Medellín y el Área Metropolitana** (Bello, Itagüí, Envigado, Sabaneta, Caldas, La Estrella, San Antonio de Prado, Copacabana, Girardota y Barbosa).\n\nSi más adelante te trasladas a alguna de estas zonas o abrimos cobertura en tu municipio, estaremos felices de recibirte. ¡Te deseamos muchos éxitos en todos tus proyectos! 👑✨`,
        isHandoff: false,
        isRejected: true,
        rejectionStatus: 'Fuera de Cobertura',
        reason: 'Candidata fuera de cobertura oficial de Medellín y Área Metropolitana'
      };
    }

    // 2.7 Filtro Estricto de Convivencia y Privacidad (Paso 4)
    // Si la candidata vive acompañada y dice que NO saben, que se los oculta, que es un secreto o que NO la apoyan
    const noLivingSupportPattern = /\b(?:no saben|no sabe|no les he dicho|no le he dicho|a escondidas|en secreto|oculto|a espaldas|no estan de acuerdo|no esta de acuerdo|no me apoya|no me apoyan|no les gusta|no le gusta|no lo aceptan|no lo aceptaria|se enojarian|se enojaria|no tienen idea|sin que se den cuenta)\b/i;

    const lastBotMsg = Array.isArray(conversationHistory)
      ? [...conversationHistory].reverse().find(m => m && m.fromMe && m.text)
      : null;
    const lastBotText = lastBotMsg ? lastBotMsg.text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : '';

    const isEvaluatingCohabitation = (
      lastBotText.includes('con quien vives') ||
      lastBotText.includes('saben y te apoyan') ||
      lastBotText.includes('saben y apoyan') ||
      lastBotText.includes('estan de acuerdo') ||
      lastBotText.includes('apoyan con que') ||
      lastBotText.includes('tu pareja sabe') ||
      lastBotText.includes('tus padres o familiares') ||
      lowerUserMsg.includes('vivo con')
    );

    if (isEvaluatingCohabitation && noLivingSupportPattern.test(lowerUserMsg)) {
      console.log(`[AIAgent] Filtro de convivencia no superado ("${userMessage}"). Aplicando protocolo de despedida inmediata.`);
      return {
        text: `Entiendo perfectamente, ${candidateName}. En CamHouse valoramos ante todo tu tranquilidad y la armonía en tu hogar. Dado que para la modalidad desde casa es un requisito indispensable contar con el pleno conocimiento y apoyo de quienes conviven contigo, en esta oportunidad no podemos continuar con tu proceso. Te deseamos muchos éxitos y bendiciones en tus proyectos 💖✨`,
        isHandoff: false,
        isRejected: true,
        rejectionStatus: 'No Apta - Convivencia sin apoyo',
        reason: 'Candidata vive acompañada sin conocimiento ni apoyo de sus convivientes'
      };
    }

    const isGenericColombiaLocation =
      /\b(?:desde|de|en|vivo en|soy de)\s+colombia\b/i.test(lowerUserMsg) &&
      !allowedCoverageAreas.test(lowerUserMsg) &&
      !outOfCoverageCities.test(lowerUserMsg);

    if (isGenericColombiaLocation) {
      if (detectedAge !== null && detectedAge >= 22 && detectedAge <= 40) {
        return {
          text: `¡Mucho gusto, ${candidateName}! ☺️ Con tus ${detectedAge} años cumples súper bien con la edad ideal, y algo muy importante: *aquí no tienes que invertir ni un solo peso* porque te prestamos todos los equipos desde el primer día 👑\n\nCuéntame, ¿en qué municipio y barrio vives actualmente? Recuerda que nuestra convocatoria cubre **Medellín y los municipios del Área Metropolitana** (Bello, Itagüí, Envigado, Sabaneta, Caldas, La Estrella, San Antonio de Prado, Copacabana, Girardota y Barbosa) ✨`,
          isHandoff: false
        };
      }

      return {
        text: `¡Mucho gusto, ${candidateName}! ☺️ Recuerda que aquí *no tienes que invertir ni un solo peso* porque nosotras te prestamos todos los equipos desde el primer día 👑\n\nCuéntame, ¿en qué municipio y barrio vives actualmente, y cuántos años tienes? Recuerda que nuestra convocatoria cubre **Medellín y los municipios del Área Metropolitana** (Bello, Itagüí, Envigado, Sabaneta, Caldas, La Estrella, San Antonio de Prado, Copacabana, Girardota y Barbosa) ✨`,
        isHandoff: false
      };
    }

    const hasBotSpoken = Array.isArray(conversationHistory) && conversationHistory.some(m => m.fromMe);
    const isPostHandoff = hasBotSpoken && conversationHistory.some(m => m.fromMe && (m.text.includes('3215863996') || m.text.includes('321 586 3996')));

    const checkAutoRejectFromReply = (replyText) => {
      if (!replyText) return { isRejected: false, rejectionStatus: null };
      if (replyText.includes('esta postulación de modelaje webcam está dirigida exclusivamente a mujeres') || replyText.includes('exclusivamente a mujeres')) {
        return { isRejected: true, rejectionStatus: 'No Apto - Hombre' };
      }
      if (replyText.includes('pleno conocimiento y apoyo de quienes conviven contigo') || replyText.includes('tranquilidad y la armonía en tu hogar') || replyText.includes('armonía en tu hogar')) {
        return { isRejected: true, rejectionStatus: 'No Apta - Convivencia sin apoyo' };
      }
      if (replyText.includes('requieren una edad entre los **22 y 40 años**') || replyText.includes('requieren una edad entre')) {
        return { isRejected: true, rejectionStatus: 'Fuera de Rango de Edad' };
      }
      if (
        replyText.includes('no es posible continuar con tu proceso') ||
        replyText.includes('los lineamientos de la postulación no permiten continuar') ||
        replyText.includes('cambias de opinión') ||
        (replyText.includes('aplica exclusivamente para') && replyText.includes('abrimos cobertura'))
      ) {
        return { isRejected: true, rejectionStatus: 'Proceso Cerrado' };
      }
      return { isRejected: false, rejectionStatus: null };
    };

    // 5. Intentar OpenAI (gpt-4o-mini) como motor PRINCIPAL #1 (5,000 req/min y 2,000,000 TPM sin saturación)
    if (this.openaiKey) {
      try {
        const oaMessages = [
          { role: 'system', content: this.buildSystemPrompt(line, isPostHandoff, hasBotSpoken, candidateName) }
        ];

        const rawHistory = conversationHistory.slice(-14);
        for (let i = 0; i < rawHistory.length; i++) {
          const m = rawHistory[i];
          if (i === rawHistory.length - 1 && !m.fromMe && m.text && userMessage && m.text.trim() === userMessage.trim()) {
            continue;
          }
          if (!m.text || !m.text.trim()) continue;
          oaMessages.push({
            role: m.fromMe ? 'assistant' : 'user',
            content: m.text.trim()
          });
        }
        oaMessages.push({ role: 'user', content: userMessage });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const oaRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.openaiKey}`
          },
          body: JSON.stringify({
            model: this.openaiModel,
            messages: oaMessages,
            temperature: 0.35,
            max_tokens: 250
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (oaRes.ok) {
          const oaData = await oaRes.json();
          let reply = oaData.choices?.[0]?.message?.content?.trim();
          if (reply) {
            reply = this.applySafeguards(reply, userMessage, conversationHistory, hasBotSpoken, isPostHandoff, knownName);
            const isClosing = Boolean(reply && (reply.includes('3215863996') || reply.includes('321 586 3996')) && !isPostHandoff);
            const rejectCheck = checkAutoRejectFromReply(reply);
            return {
              text: reply,
              isHandoff: false,
              isSuccessfulClose: isClosing,
              isRejected: rejectCheck.isRejected,
              rejectionStatus: rejectCheck.rejectionStatus,
              reason: isClosing ? 'Cierre Exitoso (Coordinador Entregado)' : (rejectCheck.isRejected ? rejectCheck.rejectionStatus : null)
            };
          }
        } else {
          const errText = await oaRes.text();
          console.warn(`[AIAgent] OpenAI devolvió status ${oaRes.status}:`, errText.substring(0, 150));
        }
      } catch (oaErr) {
        console.warn('[AIAgent] Falló llamada a OpenAI, pasando a motor de respaldo:', oaErr.message);
      }
    }

    // 6. Respaldo Groq (Línea asignada) si OpenAI no está o falló
    const groqClient = this.getGroqClient(line);
    if (groqClient) {
      try {
        const messages = [
          { role: 'system', content: this.buildSystemPrompt(line, isPostHandoff, hasBotSpoken, candidateName) }
        ];

        const rawHistory = conversationHistory.slice(-14);
        for (let i = 0; i < rawHistory.length; i++) {
          const m = rawHistory[i];
          if (i === rawHistory.length - 1 && !m.fromMe && m.text && userMessage && m.text.trim() === userMessage.trim()) {
            continue;
          }
          messages.push({
            role: m.fromMe ? 'assistant' : 'user',
            content: m.text
          });
        }

        messages.push({ role: 'user', content: userMessage });

        const completion = await groqClient.chat.completions.create({
          model: this.groqModel,
          messages: messages,
          temperature: 0.35,
          max_tokens: 250
        });

        let reply = completion.choices[0]?.message?.content?.trim();
        if (reply) {
          reply = this.applySafeguards(reply, userMessage, conversationHistory, hasBotSpoken, isPostHandoff, knownName);
          const isClosing = Boolean(reply && (reply.includes('3215863996') || reply.includes('321 586 3996')) && !isPostHandoff);
          const rejectCheck = checkAutoRejectFromReply(reply);
          return {
            text: reply,
            isHandoff: false,
            isSuccessfulClose: isClosing,
            isRejected: rejectCheck.isRejected,
            rejectionStatus: rejectCheck.rejectionStatus,
            reason: isClosing ? 'Cierre Exitoso (Coordinador Entregado)' : (rejectCheck.isRejected ? rejectCheck.rejectionStatus : null)
          };
        }
      } catch (groqErr) {
        console.warn(`[AIAgent] Falló Groq principal (${line}), probando respaldo Groq alternativo:`, groqErr.message);
        try {
          const fallbackMessages = [
            { role: 'system', content: this.buildSystemPrompt(line, isPostHandoff, hasBotSpoken, candidateName) }
          ];
          const rawHistory = conversationHistory.slice(-14);
          for (let i = 0; i < rawHistory.length; i++) {
            const m = rawHistory[i];
            if (i === rawHistory.length - 1 && !m.fromMe && m.text && userMessage && m.text.trim() === userMessage.trim()) {
              continue;
            }
            fallbackMessages.push({
              role: m.fromMe ? 'assistant' : 'user',
              content: m.text
            });
          }
          fallbackMessages.push({ role: 'user', content: userMessage });

          const otherClient = (groqClient === this.groqClient1) ? this.groqClient2 : this.groqClient1;
          const targetClient = otherClient || groqClient;

          const completion = await targetClient.chat.completions.create({
            model: 'openai/gpt-oss-120b',
            messages: fallbackMessages,
            temperature: 0.35,
            max_tokens: 250
          });
          let reply = completion.choices[0]?.message?.content?.trim();
          if (reply) {
            reply = this.applySafeguards(reply, userMessage, conversationHistory, hasBotSpoken, isPostHandoff, knownName);
            const isClosing = Boolean(reply && (reply.includes('3215863996') || reply.includes('321 586 3996')) && !isPostHandoff);
            const rejectCheck = checkAutoRejectFromReply(reply);
            return {
              text: reply,
              isHandoff: false,
              isSuccessfulClose: isClosing,
              isRejected: rejectCheck.isRejected,
              rejectionStatus: rejectCheck.rejectionStatus,
              reason: isClosing ? 'Cierre Exitoso (Coordinador Entregado)' : (rejectCheck.isRejected ? rejectCheck.rejectionStatus : null)
            };
          }
        } catch (e2) {
          console.warn('[AIAgent] Falló también el respaldo secundario de Groq:', e2.message);
        }
      }
    }

    // 7. Fallback Heurístico Local (100% de fiabilidad)
    return this.generateSmartFallback(line, userMessage, hasBotSpoken, candidateName);
  }

  generateSmartFallback(line, text, hasBotSpoken = false, candidateName = 'linda') {
    const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const nameToUse = candidateName && candidateName !== 'linda' ? candidateName : 'linda';

    // Menú de 4 opciones del Paso 6 (por número o palabra clave)
    if (/^(?:1|opcion 1|opción 1|uno|ganancias|pagos|cuanto pagan|tokens)\b/i.test(lower)) {
      return {
        text: `¡Claro que sí, ${nameToUse}! ☺️ Aquí tienes la información detallada sobre **Ganancias y Pagos**:

1. *Porcentaje:* Inicias ganando el **60% de comisión libre** y subes al **70% libre** al superar los $1.000 USD 💸
2. *Ingresos estimados:* Con 6 horas al día de lunes a sábado, tus ingresos serán de **$800.000 a $1'000.000 COP semanales** en tu primer mes, y van subiendo mes a mes 👑
3. *Forma de pago:* Pagos puntuales semanales o quincenales directo a tu cuenta (Bancolombia, Nequi, Davivienda) o en USD/cripto ✨

¿Te quedó claro o hay algún otro tema que quieras conocer? 🫶🏽`,
        isHandoff: false
      };
    }

    if (/^(?:2|opcion 2|opción 2|dos|horarios|turnos|horas)\b/i.test(lower)) {
      return {
        text: `¡Con gusto, ${nameToUse}! ☺️ Sobre los **Horarios de Transmisión**:

1. *Jornada:* Son turnos de **6 horas diarias flexibles**, de lunes a sábado ⏰
2. *Recomendación Estrella:* Te recomendamos súper especialmente iniciar en el **turno de la noche** (por ejemplo de 8:00 p.m. a 2:00 a.m. o de 9:00 p.m. a 3:00 a.m.), ya que es el horario con mayor tráfico internacional de usuarios para despegar con toda y generar ingresos mucho más rápido 👑💸
3. *Flexibilidad:* Puedes coordinar tu horario para acomodarlo a tus rutinas y descansar los domingos ✨

¿Te queda bien este esquema de horarios o deseas saber algo más? 🫶🏽`,
        isHandoff: false
      };
    }

    if (/^(?:3|opcion 3|opción 3|tres|equipos|kit|computador|camara)\b/i.test(lower)) {
      return {
        text: `¡Claro, ${nameToUse}! ☺️ Sobre el **Kit de Equipos Profesionales**:

1. *Equipamiento completo:* Te brindamos computador gamer de alta potencia para 3 plataformas a la vez, cámara 4K Sony profesional, iluminación LED/RGB, monitor, trípode y accesorios 💻✨
2. *Cero inversión:* El préstamo de los equipos es **100% gratuito**, ¡no tienes que poner ni un solo peso de tu bolsillo! 👑
3. *Cobertura:* Disponible para Medellín y los municipios del Área Metropolitana (Bello, Itagüí, Envigado, Sabaneta, Caldas, La Estrella, San Antonio de Prado, Copacabana, Girardota y Barbosa) ✨

¿Te parece genial? Cuéntame si tienes alguna otra duda o si continuamos 🫶🏽`,
        isHandoff: false
      };
    }

    if (/^(?:4|opcion 4|opción 4|cuatro|proceso|claridad|como inicio|como empezar)\b/i.test(lower)) {
      return {
        text: `¡Súper, ${nameToUse}! ☺️ Te explico la **Claridad del Proceso de Inicio**:

1. *Capacitación:* Recibes formación desde cero, así que no necesitas ninguna experiencia previa 👩🏻‍💻
2. *Acompañamiento:* Tendrás una monitora mujer que te apoyará durante tus turnos para que nunca estés sola 🫶
3. *Contacto directo con el coordinador:* Tras validar tus foticos y sector dentro del Área Metropolitana, te pasamos el contacto de nuestro coordinador para concretar todos los pasos finales 👑✨

¿Estás lista para continuar con los beneficios y tus fotos de perfil? 💖`,
        isHandoff: false
      };
    }

    // Si la candidata expresa miedo de dejar su trabajo actual o duda de si esto sí deja dinero
    const isAffirmativeOrNext = /^(?:si|sí|listo|dale|de una|super|súper|ok|perfecto|vamos)\b/i.test(lower) || /como es|como seria|que sigue|como hacemos|que hay que hacer|voy a renunciar|voy a dejarlo/i.test(lower);
    const isJobFear = !isAffirmativeOrNext && (
      (lower.includes('dejar') && (lower.includes('trabajo') || lower.includes('empleo') || lower.includes('camello')) && (lower.includes('miedo') || lower.includes('puedo') || lower.includes('dime') || lower.includes('?'))) ||
      ((lower.includes('miedo') || lower.includes('duda') || lower.includes('temor') || lower.includes('insegur')) && (lower.includes('trabajo') || lower.includes('empleo') || lower.includes('renunciar'))) ||
      lower.includes('si deja dinero') ||
      lower.includes('si da plata') ||
      lower.includes('si deja plata') ||
      lower.includes('si se gana bien') ||
      lower.includes('si es rentable') ||
      lower.includes('si vale la pena')
    );
    if (isJobFear) {
      return {
        text: `¡Es súper normal sentir eso, ${nameToUse}! ☺️ Dar el paso siempre genera dudas, pero puedes estar completamente tranquila y segura de dejar tu trabajo.\n\nAbsolutamente todas nuestras modelos empezaron exactamente igual que tú: con miedos, con inseguridades y con dudas... y hoy en día muchas de ellas ganan el triple o más de lo que ganaban en un empleo tradicional 💸👑\n\nAquí con dedicación y constancia en tu primer mes podrías generar entre **$800.000 y $1'000.000 COP semanales** directos a tu cuenta, y cuentas con el acompañamiento de monitoras que te guían paso a paso para que nunca estés sola 👩🏻‍💻 Lo más importante es confiar en ti y darla toda, ¡te aseguro que lo vas a lograr! 🫶🏽✨\n\n¿Te gustaría darte la oportunidad de intentarlo?`,
        isHandoff: false
      };
    }

    // Si la candidata expresa dudas, miedo de estafa, legalidad o Cámara de Comercio
    if (lower.includes('estafa') || lower.includes('camara de comercio') || lower.includes('legal') || lower.includes('desconfi') || lower.includes('robar') || lower.includes('confiar')) {
      return {
        text: `¡Te entiendo perfectamente, ${nameToUse}! ☺️ Es totalmente normal que hoy en día una desconfíe con tantas cosas que se ven en internet.\n\nMira, te cuento con total transparencia: estamos **100% legalmente constituidos con Cámara de Comercio** aquí en Medellín y todo se maneja bajo contrato formal 📑✨\n\nAdemás, **el primer gran voto de confianza lo damos nosotras al prestarte los equipos profesionales**, confiando plenamente en ti para llevarlos a tu casa sin conocerte y **sin pedirte ni un solo peso de inversión** 👑💸 Aquí tú no tienes nada que perder y sí mucho por ganar.\n\n¿Te da más tranquilidad? Cuéntame y con todo el gusto te sigo explicando 🫶🏽`,
        isHandoff: false
      };
    }

    // Si la candidata pregunta por inversión o costo
    if (lower.includes('invertir') || lower.includes('inversion') || lower.includes('cobran') || lower.includes('costo') || lower.includes('pagar') || lower.includes('plata')) {
      return {
        text: '¡Para nada! Algo súper importante: **aquí no tienes que invertir ni un solo peso**. Nosotras te prestamos todos los equipos desde el primer día y no necesitas experiencia previa 👑✨',
        isHandoff: false
      };
    }

    // Habitación por arreglar / falta puerta
    if (
      ((lower.includes('habitacion') || lower.includes('cuarto') || lower.includes('pieza') || lower.includes('espacio')) &&
       (lower.includes('falta') || lower.includes('arreglar') || lower.includes('organizar') || lower.includes('adecuar') || lower.includes('acomodar'))) ||
      lower.includes('puerta')
    ) {
      return {
        text: `¡No te preocupes por eso, ${nameToUse}! ☺️ Podemos seguir adelante con el proceso sin problema y más adelante evaluamos tu habitación y miramos juntas qué solución darle 👑✨\n\nSúper importante: nuestros turnos son de 6 horas diarias flexibles. ¿Cuentas con la disponibilidad de tiempo y podrías iniciar de inmediato (o en los próximos 3 días)? ☺️`,
        isHandoff: false
      };
    }

    // Internet en casa
    if (lower.includes('internet') || lower.includes('wifi') || lower.includes('megas') || lower.includes('conectividad')) {
      return {
        text: `¡Ah, te cuento, ${nameToUse}! ☺️ Para trabajar con nosotras solo necesitas el espacio privado, disponibilidad de tiempo y muchas ganas de salir adelante 👑\n\nNosotras te prestamos absolutamente todos los equipos profesionales directos en tu casa (computador, cámaras, luces y todo lo necesario), *pero el servicio de internet en casa sí corre por tu cuenta* para poder realizar las transmisiones sin interrupciones 💻✨ **Y si no cuentas con internet en tu hogar, ¡tranqui! Nosotras tenemos los contactos directos para la instalación rápida.** 📶\n\n¿Cuentas con la posibilidad de instalarlo o habilitarlo en tu casa para poder arrancar? 🫶🏽`,
        isHandoff: false
      };
    }

    // Privacidad y geobloqueo
    if (lower.includes('privacidad') || lower.includes('seguridad') || lower.includes('geobloqueo') || lower.includes('bloqueo') || lower.includes('familia') || lower.includes('amigos') || lower.includes('vean')) {
      return {
        text: 'Tu privacidad está 100% protegida y cuidada con nosotras. Contamos con geobloqueo total para Colombia y países cercanos para que nadie conocido te vea, y transmites bajo un nombre artístico protegido. 🛡️',
        isHandoff: false
      };
    }

    // Ganancias y porcentajes
    if (lower.includes('porcentaje') || lower.includes('cuanto gano') || lower.includes('ganancia') || lower.includes('pago') || lower.includes('dinero') || lower.includes('sueldo') || lower.includes('semanal')) {
      return {
        text: `¡Te cuento, ${nameToUse}! ☺️ En CamHouse inicias ganando el **60% de comisión libre** y subes al **70% libre cuando superas los $1.000 USD**. Te aseguramos que con 6 horas al día de lunes a sábado tus semanas serán mínimas de $800.000 a $1'000.000 COP en tu primer mes, y cada mes tus ganancias aumentan 💸👑`,
        isHandoff: false
      };
    }

    // Requisitos y edad
    if (lower.includes('requisito') || lower.includes('edad') || lower.includes('cedula') || lower.includes('experiencia')) {
      return {
        text: 'Los requisitos son tener entre 22 y 40 años, documento de identidad vigente y un espacio privado en tu casa para trabajar. ¡No necesitas experiencia porque acá te enseñamos todo! 💜',
        isHandoff: false
      };
    }

    // Páginas y plataformas
    if (lower.includes('pagina') || lower.includes('plataforma') || lower.includes('streamate') || lower.includes('chaturbate') || lower.includes('stripchat') || lower.includes('flirt')) {
      return {
        text: 'Trabajamos con las mejores plataformas internacionales: privadas como Streamate y Flirt4Free, y públicas como Stripchat y Chaturbate. ✨',
        isHandoff: false
      };
    }

    // Salud y seguridad social
    if (lower.includes('salud') || lower.includes('eps') || lower.includes('seguridad social') || lower.includes('medico')) {
      return {
        text: '¡Sí, totalmente! En CamHouse te afiliamos a salud directamente desde la agencia para que cuentes con total cobertura y tranquilidad mientras trabajas. 🏥✨',
        isHandoff: false
      };
    }

    // Lencería y juguetes
    if (lower.includes('lenceria') || lower.includes('juguete') || lower.includes('ropa') || lower.includes('vestuario')) {
      return {
        text: 'No tienes que sacar dinero de tu bolsillo: te brindamos crédito especial para tus juguetes y lencería desde el primer día. 🎁✨',
        isHandoff: false
      };
    }

    // Monitoras y acompañamiento
    if (lower.includes('monitora') || lower.includes('apoyo') || lower.includes('sola') || lower.includes('ayuda')) {
      return {
        text: 'Nunca estarás sola. Cuentas con el acompañamiento permanente de monitoras especializadas mujeres que te guían paso a paso y te ayudan a potenciar tus ingresos. 👩‍💻💜',
        isHandoff: false
      };
    }

    // Gimnasio
    if (lower.includes('gimnasio') || lower.includes('gym')) {
      return {
        text: '¡Sí! En CamHouse te incluimos membresía a gimnasio para tu bienestar y salud física. 🏋️‍♀️✨',
        isHandoff: false
      };
    }

    // Préstamos de dinero
    if (lower.includes('prestamo') || lower.includes('adelanto')) {
      return {
        text: `Así es, ${nameToUse}. Contamos con préstamos de dinero directos con la agencia para apoyarte en lo que necesites mientras generas tus ingresos. 💸💜`,
        isHandoff: false
      };
    }

    // Saludo inicial por defecto (SOLO si el bot NUNCA ha hablado con ella)
    if (hasBotSpoken) {
      return {
        text: `¡Entendido, ${nameToUse}! Cuéntame para continuar con tu proceso, o si tienes alguna dudita con gusto te ayudo. 🫶🏽`,
        isHandoff: false
      };
    }

    return {
      text: '¡Hola! Soy Alejandra de CamHouse 🙋🏻‍♀️ Con nosotras puedes alcanzar esa independencia financiera que tanto quieres 💸 Esta postulación es para modelo webcam desde casa, ¿Te interesa la oferta? ¿Y cómo es tu nombre? ☺️',
      isHandoff: false
    };
  }
}

module.exports = new AIAgent();
