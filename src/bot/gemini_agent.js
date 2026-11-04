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

    const blacklist = new Set([
      'hermosa', 'princesa', 'linda', 'reina', 'corazon', 'bella', 'amiga', 'querida', 'amor',
      'claro', 'si', 'sí', 'sii', 'siii', 'sip', 'sipi', 'sep', 'nop', 'nopi', 'nooo', 'noooo',
      'hola', 'buenas', 'buenos', 'dias', 'tardes', 'noches', 'saludos',
      'gracias', 'muchas', 'mil', 'colombia', 'medellin', 'bello', 'envigado', 'itagui',
      'sabaneta', 'castilla', 'belen', 'poblado', 'laureles', 'robledo', 'manrique', 'aranjuez',
      'copacabana', 'girardota', 'caldas', 'estrella', 'bogota', 'cali', 'barranquilla',
      'cartagena', 'bucaramanga', 'cucuta', 'pereira', 'manizales', 'armenia', 'ibague',
      'camhouse', 'modelo', 'webcam', 'casa', 'tengo', 'anos', 'año',
      'vivo', 'desde', 'para', 'con', 'por', 'que', 'como', 'donde', 'cuanto', 'quien', 'cual',
      'todo', 'bien', 'super', 'excelente', 'perfecto', 'genial', 'entendido', 'listo', 'dale',
      'ok', 'okay', 'oki', 'okey', 'vale', 'mujer', 'chica', 'aspirante', 'usuario', 'cliente',
      'nombre', 'edad', 'sector', 'ciudad', 'barrio', 'parte', 'informacion', 'info',
      'interesa', 'interesada', 'quiero', 'postulacion', 'oferta', 'trabajo', 'empleo',
      'tiempo', 'disponibilidad', 'sola', 'pareja', 'system', 'notify', 'bot', 'admin',
      'soporte', 'servicio', 'store', 'tienda', 'bunker', 'android', 'iphone', 'contacto',
      'whatsapp', 'interes', 'postularme', 'jaja', 'jeje', 'jiji', 'jojo', 'jajaja', 'jejeje',
      'jajajaja', 'jejejeje', 'jajajajaja', 'haha', 'hahaha', 'xd', 'lol', 'tambien', 'tambn',
      'tbn', 'obvio', 'seguro', 'verdad', 'exacto', 'correcto', 'entonces', 'pues', 'bueno',
      'mira', 'oye', 'bebe', 'bb', 'porfa', 'porfavor', 'favor', 'uno', 'una', 'unas', 'unos',
      'mas', 'menos', 'muy', 'mucho', 'mucha', 'muchos', 'muchas', 'nada', 'poco', 'poca'
    ]);

    if (blacklist.has(lower)) return null;
    if (this.detectMale(firstWord)) return null;
    return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
  }

  // Extractor centralizado e inquebrantable del nombre de la candidata
  extractCandidateName(userMessage = '', conversationHistory = [], knownName = '') {
    const parseUserTextForName = (txt) => {
      if (!txt || typeof txt !== 'string') return null;
      const patterns = [
        /(?:me llamo|mi nombre es|soy|hablas con)\s+([a-záéíóúñA-ZÁÉÍÓÚÑ]{3,18})/i,
        /(?:^|\n)\s*([a-záéíóúñA-ZÁÉÍÓÚÑ]{3,18})\s+(?:tengo\s+)?\d{2}\s*(?:años|anos)?/i,
        /(?:^|\n)\s*hola[,.\s]+(?:mucho gusto[,.\s]+)?([a-záéíóúñA-ZÁÉÍÓÚÑ]{3,18})\s+\d{2}/i,
        /(?:^|\n)\s*hola[,.\s]+(?:soy\s+)?([a-záéíóúñA-ZÁÉÍÓÚÑ]{3,18})\b/i,
        /^(?:hola[,.\s]+)?([a-záéíóúñA-ZÁÉÍÓÚÑ]{3,18})[!.]*$/i
      ];
      for (const regex of patterns) {
        const m = txt.trim().match(regex);
        if (m && m[1]) {
          const v = this.cleanAndValidateCandidateName(m[1]);
          if (v) return v;
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
        lastBotLower.includes('con quien vives');

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
  Salúdala por su nombre, recálcale que no debe invertir un solo peso y pregúntale su edad.
* **Paso 3: Motivación:**
  Si cumple con la edad (22-40), felicítala y pregúntale qué la motivó a querer trabajar desde casa como modelo.
* **Paso 4: Espacio Privado y Convivencia:**
  Conecta con su meta y pregúntale si cuenta con un espacio privado en casa para transmitir y con quién vive (sola, pareja o familiares).
* **Paso 5: Disponibilidad de Horarios:**
  Valida si cuenta con 6 horas diarias flexibles y si podría iniciar pronto (en los próximos 3 días).
* **Paso 6: Plataformas, Bloqueo y Ganancias:**
  Cuéntale sobre las plataformas, el bloqueo total para Colombia, y las ganancias semanales del 60%-70% en USD. Pregúntale si tiene dudas o si desea continuar.
* **Paso 7: Beneficios y 2 Fotos de Perfil:**
  Menciónale los beneficios (crédito para lencería, fotos, gimnasio, monitoras) y pídele con mucha amabilidad 2 fotos (una de rostro y una de cuerpo) para conocer su perfil, recordándole que no se discrimina a nadie.
* **Paso 8: Confirmación de Sector (Medellín y Área Metro):**
  Agradece sus fotos y confirma en qué sector o barrio de Medellín o Área Metropolitana vive para coordinar la entrega.
* **Paso 9: Cierre Exitoso y Contacto del Coordinador:**
  Felicítala por completar el proceso y entrégale el contacto de nuestro coordinador al WhatsApp **3215863996**, recordándole siempre decirle que habló con **Alejandra Ramírez** para agendar la entrega de sus equipos profesionales.

---

### REGLAS DE SEGURIDAD INDISPENSABLES:
1. **Exclusivo para Mujeres:** Si detectas que quien escribe es un hombre, despídete de manera cordial y formal indicando que la vacante está dirigida exclusivamente a mujeres.
2. **Cero Frase "no es negociable":** NUNCA uses esa frase.
3. **Fidelidad al Nombre:** Recuerda que la aspirante se llama **${hasRealName ? candidateName : 'linda'}** y tú eres **Alejandra Ramírez**.`;
  }

  detectMale(text) {
    if (!text || typeof text !== 'string') return null;

    const cleanLower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!cleanLower) return null;

    // 1. Descartar si el mensaje habla de convivencia con familiares ("vivo con mi papa", "mi esposo", etc.)
    const relativePattern = /\b(?:vivo con|con mi|esposo|novio|pareja|padre|papa|papá|hermano|hijo|primo|tio|tío|amigo)\b/i;
    if (relativePattern.test(text) && (cleanLower.includes('vivo con') || cleanLower.includes('con mi'))) {
      return null;
    }

    // 2. Frases directas que indican aspirante hombre
    const malePhrases = [
      /\b(?:soy|yo soy|me llamo|mi nombre es)\s+(?:un\s+)?(?:hombre|varon|chico|chico trans|hombre trans|masculino)\b/i,
      /\b(?:soy|yo soy)\s+(?:hombre|varon|chico|masculino)\b/i,
      /\b(?:para|pueden|reciben|aceptan|admiten|trabajo para)\s+hombres\b/i,
      /\b(?:modelo|postulacion|vacante)\s+(?:masculino|masculina|para hombres)\b/i,
      /^(?:hombre|masculino|varon)$/i
    ];
    for (const regex of malePhrases) {
      if (regex.test(cleanLower)) {
        return 'amigo';
      }
    }

    // 3. Diccionario exhaustivo de nombres masculinos en Colombia y Latinoamérica
    const maleNames = new Set([
      'juan', 'carlos', 'andres', 'david', 'alejandro', 'daniel', 'santiago', 'mateo', 'sebastian',
      'felipe', 'camilo', 'diego', 'jose', 'luis', 'jorge', 'pedro', 'manuel', 'mario', 'alberto',
      'miguel', 'fernando', 'ricardo', 'esteban', 'samuel', 'kevin', 'brian', 'bryan', 'alexander',
      'cristian', 'christian', 'gabriel', 'pablo', 'sergio', 'javier', 'victor', 'hugo', 'eduardo',
      'rafael', 'oscar', 'rodrigo', 'cesar', 'mauricio', 'lucas', 'nicolas', 'tomas', 'simon',
      'martin', 'adrian', 'joaquin', 'julian', 'gonzalo', 'hector', 'guillermo', 'gustavo', 'roberto',
      'leonardo', 'raul', 'federico', 'emilio', 'ignacio', 'jhon', 'john', 'edward', 'fabian', 'alonso',
      'ruben', 'dario', 'hernan', 'alex', 'alvaro', 'jaime', 'walter', 'wilson', 'johan', 'yohan',
      'edwin', 'fredy', 'freddy', 'frank', 'oswaldo', 'arnaldo', 'orlando', 'alfredo', 'antonio',
      'ramon', 'vicente', 'bernardo', 'ivan', 'boris', 'enrique', 'ernesto', 'brayan', 'brayam',
      'maicol', 'michael', 'stiven', 'steven', 'yeison', 'yeferson', 'jefferson',
      'marlon', 'duvan', 'yeider', 'deimer', 'yeimer', 'leandro', 'wilmer', 'wilmar', 'giovanni',
      'geovanny', 'jhonatan', 'jonathan', 'jhony', 'johnny', 'jhonny', 'elkin', 'albeiro', 'dairo',
      'harold', 'harol', 'nelson', 'edgar', 'edgard', 'rodolfo', 'gilberto', 'german', 'jaider',
      'jhair', 'jordan', 'brandon', 'alexis', 'angel', 'angelo', 'antony', 'anthony', 'ronald',
      'ronal', 'richard', 'darwin', 'derian', 'dilan', 'dylan', 'ian', 'thiago', 'tiago', 'matias',
      'maximiliano', 'emiliano', 'isaac', 'isaias', 'elias', 'abraham', 'moises', 'israel', 'salomon',
      'alfonso', 'gerardo', 'arturo', 'armando', 'norberto', 'humberto', 'ever', 'eder', 'elmer',
      'marcos', 'marco', 'luciano', 'dante', 'damian', 'damiano', 'valentin', 'fausto', 'felix',
      'fabio', 'fabricio', 'renato', 'santino', 'facundo', 'alonzo'
    ]);

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

    // Blindaje Anti-Hombre en respuesta generada: Si la IA saludó a un hombre (ej: "¡Qué bien, Juan!", "Mucho gusto, Carlos")
    const maleGreetingMatch = reply.match(/(?:¡?[Qq]ué bien|¡?[Mm]ucho gusto|¡?[Pp]erfecto|¡?[Hh]ola),?\s+([A-Za-zÁ-ÿ]+)[!.,]?/i);
    if (maleGreetingMatch && maleGreetingMatch[1]) {
      const greeted = maleGreetingMatch[1].trim();
      const isMaleGreeted = this.detectMale(greeted);
      if (isMaleGreeted) {
        console.warn(`[AIAgent] Se interceptó saludo a hombre en respuesta (${greeted}). Reemplazando por rechazo formal.`);
        return `Hola, ${isMaleGreeted}. Agradecemos sinceramente tu interés en CamHouse By C&A. Sin embargo, te informamos de manera muy respetuosa que esta postulación de modelaje webcam está dirigida exclusivamente a mujeres, por lo que en esta oportunidad no es posible continuar con tu proceso. Te deseamos muchos éxitos en tus proyectos.`;
      }
    }

    // Blindaje 1: Si es el primer mensaje y no hay nombre extraído aún, forzar saludo oficial Paso 1
    if (!hasBotSpoken && candidateName === 'linda') {
      reply = '¡Hola! Soy Alejandra de CamHouse 🙋🏻‍♀️ Con nosotras puedes alcanzar esa independencia financiera que tanto quieres 💸 Esta postulación es para modelo webcam desde casa, ¿Te interesa la oferta? ¿Y cómo es tu nombre? ☺️';
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

    // 2.6 Detección de ubicación genérica ("Desde Colombia") o ciudades fuera de cobertura de Medellín y Área Metropolitana
    const medellinAreas = /\b(?:medellin|bello|envigado|itagui|sabaneta|estrella|la estrella|copacabana|girardota|caldas|antioquia|castilla|belen|poblado|laureles|robledo|manrique|aranjuez|buenos aires|san javier|guayabal|santa cruz|popular|doce de octubre|villa hermosa|candelaria|san antonio de prado|altavista|san cristobal)\b/i;
    const outOfCoverageCities = /\b(?:bogota|cali|barranquilla|cartagena|bucaramanga|cucuta|pereira|manizales|armenia|santa marta|ibague|pasto|monteria|villavicencio|neiva|valledupar|popayan|sincelejo|tunja|riohacha|quibdo|yopal|florencia|palmira|buenaventura|soacha|tulua|buga|cartago|sogamoso|duitama|barrancabermeja|girardot|dosquebradas|envigado_no)\b/i;

    if (outOfCoverageCities.test(lowerUserMsg) && !medellinAreas.test(lowerUserMsg)) {
      console.log(`[AIAgent] Ciudad fuera de cobertura detectada ("${userMessage}"). Enviando despedida amable y apagando IA.`);
      return {
        text: `¡Muchas gracias por tu interés en CamHouse, ${candidateName}! ☺️ Te contamos con mucho cariño que por el momento nuestra cobertura para entrega e instalación de equipos profesionales en casa está disponible únicamente en **Medellín y el Área Metropolitana** (Bello, Envigado, Itagüí, Sabaneta, La Estrella, Copacabana, Girardota y Caldas).\n\nSi más adelante te trasladas a Medellín o abrimos cobertura en tu ciudad, estaremos felices de recibirte. ¡Te deseamos muchos éxitos en todos tus proyectos! 👑✨`,
        isHandoff: false,
        isRejected: true,
        rejectionStatus: 'Fuera de Cobertura',
        reason: 'Candidata fuera de cobertura (Medellín / Área Metropolitana)'
      };
    }

    const isGenericColombiaLocation =
      /\b(?:desde|de|en|vivo en|soy de)\s+colombia\b/i.test(lowerUserMsg) &&
      !medellinAreas.test(lowerUserMsg) &&
      !outOfCoverageCities.test(lowerUserMsg);

    if (isGenericColombiaLocation) {
      const ageMatch = lowerUserMsg.match(/\b(\d{2})\s*(?:anos|años)?\b/);
      const age = ageMatch ? parseInt(ageMatch[1], 10) : null;

      if (age !== null && (age < 22 || age > 40)) {
        return {
          text: `¡Mucho gusto, ${candidateName}! ☺️ Agradecemos de corazón tu interés en CamHouse By C&A. Te contamos con mucho respeto que actualmente los lineamientos de nuestra convocatoria requieren una edad entre los **22 y 40 años**, por lo que en esta oportunidad no es posible continuar con el proceso. ¡Te deseamos muchos éxitos en todos tus proyectos! 👑✨`,
          isHandoff: false,
          isRejected: true,
          rejectionStatus: 'Fuera de Rango de Edad',
          reason: `Edad fuera de rango (${age} años)`
        };
      }

      if (age !== null && age >= 22 && age <= 40) {
        return {
          text: `¡Mucho gusto, ${candidateName}! ☺️ Con tus ${age} años cumples súper bien con la edad ideal, y algo muy importante: *aquí no tienes que invertir ni un solo peso* porque te prestamos todos los equipos desde el primer día 👑\n\nCuéntame, ¿en qué ciudad y barrio de Colombia vives actualmente? Recuerda que entregamos todos los equipos profesionales directamente en tu casa en **Medellín y el Área Metropolitana** 💻✨`,
          isHandoff: false
        };
      }

      return {
        text: `¡Mucho gusto, ${candidateName}! ☺️ Recuerda que aquí *no tienes que invertir ni un solo peso* porque nosotras te prestamos todos los equipos desde el primer día 👑\n\nCuéntame, ¿en qué ciudad y barrio de Colombia vives actualmente, y cuántos años tienes? Recuerda que nuestra entrega de equipos en casa es en **Medellín y el Área Metropolitana** 💻✨`,
        isHandoff: false
      };
    }

    const hasBotSpoken = Array.isArray(conversationHistory) && conversationHistory.some(m => m.fromMe);
    const isPostHandoff = hasBotSpoken && conversationHistory.some(m => m.fromMe && (m.text.includes('3215863996') || m.text.includes('321 586 3996')));

    const checkAutoRejectFromReply = (replyText) => {
      if (!replyText) return { isRejected: false, rejectionStatus: null };
      if (replyText.includes('esta postulación de modelaje webcam está dirigida exclusivamente a mujeres')) {
        return { isRejected: true, rejectionStatus: 'No Apto - Hombre' };
      }
      if (
        replyText.includes('no es posible continuar con tu proceso') ||
        replyText.includes('los lineamientos de la postulación no permiten continuar') ||
        replyText.includes('cambias de opinión') ||
        replyText.includes('cobertura para entrega e instalación de equipos')
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
