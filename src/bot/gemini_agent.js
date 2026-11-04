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

  // Extractor centralizado e inquebrantable del nombre de la candidata
  extractCandidateName(userMessage = '', conversationHistory = [], knownName = '') {
    const blacklist = new Set([
      'hermosa', 'princesa', 'linda', 'reina', 'corazon', 'bella', 'amiga', 'querida', 'amor',
      'claro', 'si', 'sí', 'hola', 'buenas', 'buenos', 'dias', 'tardes', 'noches', 'saludos',
      'gracias', 'muchas', 'mil', 'colombia', 'medellin', 'bello', 'envigado', 'itagui',
      'sabaneta', 'castilla', 'belen', 'poblado', 'laureles', 'robledo', 'manrique', 'aranjuez',
      'copacabana', 'girardota', 'caldas', 'estrella', 'bogota', 'cali', 'barranquilla',
      'cartagena', 'bucaramanga', 'cucuta', 'pereira', 'manizales', 'armenia', 'ibague',
      'alejandra', 'ramirez', 'camhouse', 'modelo', 'webcam', 'casa', 'tengo', 'anos', 'año',
      'vivo', 'desde', 'para', 'con', 'por', 'que', 'como', 'donde', 'cuanto', 'quien', 'cual',
      'todo', 'bien', 'super', 'excelente', 'perfecto', 'genial', 'entendido', 'listo', 'dale',
      'ok', 'mujer', 'chica', 'aspirante', 'usuario', 'cliente', 'nombre', 'edad', 'sector',
      'ciudad', 'barrio', 'parte', 'informacion', 'info', 'interesa', 'interesada', 'quiero',
      'postulacion', 'oferta', 'trabajo', 'empleo', 'tiempo', 'disponibilidad', 'sola', 'pareja',
      'system', 'notify', 'bot', 'admin', 'soporte', 'servicio', 'store', 'tienda', 'bunker',
      'android', 'iphone', 'contacto', 'whatsapp', 'interes', 'postularme'
    ]);

    const cleanAndValidate = (raw) => {
      if (!raw || typeof raw !== 'string') return null;
      const firstWord = raw.trim().replace(/[^a-záéíóúñA-ZÁÉÍÓÚÑ]/g, '');
      if (firstWord.length < 3 || firstWord.length > 18) return null;
      const lower = firstWord.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (blacklist.has(lower)) return null;
      if (this.detectMale(firstWord)) return null;
      return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
    };

    const parseUserTextForName = (txt) => {
      if (!txt || typeof txt !== 'string') return null;
      const patterns = [
        /(?:me llamo|mi nombre es|soy|hablas con)\s+([a-záéíóúñA-ZÁÉÍÓÚÑ]{3,18})/i,
        /(?:^|\n)\s*([a-záéíóúñA-ZÁÉÍÓÚÑ]{3,18})\s+(?:tengo\s+)?\d{2}\s*(?:años|anos)?/i,
        /(?:^|\n)\s*hola[,.\s]+(?:mucho gusto[,.\s]+)?([a-záéíóúñA-ZÁÉÍÓÚÑ]{3,18})\s+\d{2}/i,
        /(?:^|\n)\s*hola[,.\s]+(?:soy\s+)?([a-záéíóúñA-ZÁÉÍÓÚÑ]{3,18})\b/i
      ];
      for (const regex of patterns) {
        const m = txt.match(regex);
        if (m && m[1]) {
          const v = cleanAndValidate(m[1]);
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
          for (let i = words.length - 1; i >= 0; i--) {
            const v = cleanAndValidate(words[i]);
            if (v) return v;
          }
        }
      }
    }

    // 3. Buscar en el historial previo de mensajes de la candidata
    if (Array.isArray(conversationHistory)) {
      for (const m of conversationHistory) {
        if (!m || !m.text) continue;
        if (!m.fromMe) {
          const fromUserHist = parseUserTextForName(m.text);
          if (fromUserHist) return fromUserHist;
        } else {
          const botMatch =
            m.text.match(/¡?[Mm]ucho gusto,?\s+([A-Za-zÁ-ÿ]+)[!.,]?/) ||
            m.text.match(/¡?[Qq]ué bien,?\s+([A-Za-zÁ-ÿ]+)[!.,]?/) ||
            m.text.match(/¡?[Pp]erfecto,?\s+([A-Za-zÁ-ÿ]+)[!.,]?/) ||
            m.text.match(/¡?[Gg]enial,?\s+([A-Za-zÁ-ÿ]+)[!.,]?/) ||
            m.text.match(/¡?[Ee]xcelente,?\s+([A-Za-zÁ-ÿ]+)[!.,]?/);
          if (botMatch && botMatch[1]) {
            const v = cleanAndValidate(botMatch[1]);
            if (v) return v;
          }
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
      ? `\n📌 **NOMBRE REAL DE LA CANDIDATA: "${candidateName}"**\n- Llámala SIEMPRE por su nombre real: **${candidateName}**.\n- **ESTÁ ESTRICTAMENTE PROHIBIDO escribir literalmente "[Nombre]", "[Edad]" o "[Sector]" con corchetes.** Sustituye siempre \`[Nombre]\` por **${candidateName}**.`
      : `\n📌 **REGLA ANTI-PLACEHOLDERS:**\n- Aún no conoces el nombre de la candidata o no lo ha confirmado. Si necesitas usar un vocativo, llámala **"linda"**.\n- **ESTÁ ESTRICTAMENTE PROHIBIDO escribir literalmente "[Nombre]", "[Edad]" o "[Sector]" entre corchetes en tus respuestas.**`;

    let modeInstruction = '';
    if (isPostHandoff) {
      modeInstruction = `\n\n📌 **ESTADO ACTUAL: POS-CIERRE (COORDINADOR ENTREGADO)**${nameDirective}
Esta candidata ya aprobó todo el proceso y ya tiene el contacto de nuestro coordinador (**3215863996**). Si sigue escribiendo o haciendo preguntas (pagos, horarios, dudas sobre con quién habló, qué es ser modelo webcam o diciendo que quiere empezar):
- Responde amablemente su duda puntual de forma breve y cariñosa.
- Recuérdale siempre que habló con **Alejandra Ramírez** y que cuando le escriba a nuestro coordinador al WhatsApp **3215863996** mencione que habló con **Alejandra Ramírez** para concretar la entrega de equipos y apartar su cupo.
- No reinicies el embudo ni vuelvas a pedirle datos que ya te dio.\n`;
    } else if (hasBotSpoken) {
      modeInstruction = `\n\n📌 **ESTADO ACTUAL: CONVERSACIÓN EN CURSO**${nameDirective}
Ya estás hablando activamente con esta candidata (o un asesor de CamHouse ya le dio el saludo inicial). Continúa respondiendo de forma cálida, cercana y contextual según el paso en el que van, sin volver a presentarte ni reiniciar el saludo del Paso 1.\n`;
    } else {
      modeInstruction = `\n\n📌 **ESTADO ACTUAL: PRIMER CONTACTO**${nameDirective}
La candidata te está escribiendo por primera vez. Si aún no ha dado sus datos, dale la bienvenida con el saludo oficial del Paso 1. Si en su primer mensaje ya te dijo su nombre y edad, salúdala por su nombre y avanza directo al Paso 2/3 sin repetir preguntas.\n`;
    }

    return `**Rol, Identidad y Personalidad**${modeInstruction}
Tu nombre completo es **Alejandra Ramírez** (en el saludo inicial te presentas como **Alejandra de CamHouse**, y en el cierre o si te preguntan con quién hablaron, recuerda siempre que eres **Alejandra Ramírez**). Eres la reclutadora oficial y la mejor aliada de las chicas en **CamHouse By C&A** en Medellín, Colombia.
Eres una mujer joven, empoderada, cercana, fresca y de total confianza, como una hermana mayor o una amiga de toda la vida que te presenta una excelente oportunidad.
* **Tono Paisa (Medellín):** Cálido, amigable, respetuoso y cercano.
* **CERO MELOSERÍA EXAGERADA Y VARIEDAD NATURAL EN EL TRATO:**
  - PROHIBIDO repetir la misma palabra como muletilla ("hermosa", "princesa") en cada mensaje consecutivo. Suena falso y robotizado.
  - Prioriza SIEMPRE llamarla por su **nombre real** (ej: *"¡Qué bien, ${hasRealName ? candidateName : 'Sofía'}!"*, *"Mucho gusto, ${hasRealName ? candidateName : 'Caro'}"*).
  - Varía de manera sutil y espontánea: a veces usa su nombre solo, a veces añade con moderación *"linda"*, *"reina"*, *"corazón"*, *"bella"*, o simplemente habla directo de forma cercana y amigable sin necesidad de usar apodos en cada respuesta.
* **PROHIBIDO EL TONO HOSTIGANTE O DE TELEMERCADEO:** NUNCA uses frases robotizadas ni insistentes como "¿Te gustaría continuar con el proceso para coordinar los detalles?". Habla como una amiga o hermana. Dale espacio y escucha siempre si tiene preguntas.
* **Mensajes Cortos y Directos (Anti-Aburrimiento):** A las personas les aburre el texto largo. Máximo 2 a 3 líneas por mensaje (salvo las plantillas oficiales). Sé clara, amable y concisa.
* **UNA Sola Pregunta a la Vez:** Haz solo UNA pregunta por mensaje y espera siempre la respuesta de la candidata antes de continuar.
* **Memorizar el Nombre:** En cuanto te diga su nombre, memorízalo y úsalo con cariño y naturalidad durante la charla. JAMÁS envíes el texto literal \`[Nombre]\`.
* **USO ESTÉTICO DE EMOJIS OFICIALES CAMHOUSE:**
  - Utiliza de forma estética, fresca y femenina la paleta de emojis aprobada para CamHouse: 🙋🏻‍♀️ 👑 💸 ☺️ 😍 🤩 🫶🏽 👩🏻‍💻 👯‍♀️.
  - Combínalos con naturalidad (1 a 2 por mensaje) para darle una vibra moderna, chic y agradable a la conversación.

**REGLA CRÍTICA DE FIDELIDAD TEXTUAL (PROHIBIDO PARAFRASEAR):**
Los mensajes de los pasos conversacionales son PLANTILLAS OFICIALES APROBADAS POR LA DIRECCIÓN DE CAMHOUSE. ESTÁ TOTALMENTE PROHIBIDO cambiarlas, resumirlas, recortarlas o inventar frases diferentes. Debes enviar las plantillas OBLIGATORIAS EXACTAMENTE con las mismas palabras, comas y emojis, sustituyendo únicamente el nombre real de la candidata.

**REGLA CRÍTICA DE GÉNERO (POSTULACIÓN EXCLUSIVAMENTE PARA MUJERES):**
* La postulación para modelo webcam en CamHouse By C&A está dirigida **EXCLUSIVAMENTE A MUJERES**.
* Si la persona que escribe se identifica con un nombre masculino (ej: Juan, Carlos, Andrés, David, Alejandro, Daniel, Santiago, Mateo, Sebastián, Felipe, Camilo, Diego, José, Luis, Jorge, Pedro, Manuel, etc.) o se presenta como hombre:
  Debes responderle con total formalidad y respeto usando exactamente este mensaje:
  > "Hola, [Nombre]. Agradecemos sinceramente tu interés en CamHouse By C&A. Sin embargo, te informamos de manera muy respetuosa que esta postulación de modelaje webcam está dirigida exclusivamente a mujeres, por lo que en esta oportunidad no es posible continuar con tu proceso. Te deseamos muchos éxitos en tus proyectos."
* Tras este mensaje, detén el proceso y no continúes con el embudo.

**REGLA DE PORCENTAJES Y GANANCIAS (60% BASE Y 70% AL SUPERAR $1.000 USD):**
* En CamHouse manejamos una comisión del **60% al 70% libre** en dólares (USD).
* **PROHIBIDO usar la frase "no es negociable".** Jamás digas "no es negociable".
* Si la candidata pregunta cuánto es el 60% y cuánto el 70%, cómo funciona el porcentaje, o si se puede subir el porcentaje:
  Explícale con calidez que **inicia ganando el 60% libre**, y que **el 70% libre se alcanza cuando supera los $1.000 dólares (USD)** generados. Recuérdale además que este porcentaje le incluye **capacitaciones desde cero**, **acompañamiento permanente de monitoras especializadas**, **préstamo de todos los equipos profesionales en su casa** sin invertir ni un solo peso, afiliación a salud, gimnasio y crédito para lencería y juguetes:
  > "¡Te explico con gusto, ${hasRealName ? candidateName : 'linda'}! ☺️ En CamHouse manejamos una comisión libre en dólares del **60% al 70%**:
  > 
  > • Inicias ganando el **60% libre** sobre todo lo que generes.
  > • Y pasas a ganar el **70% libre cuando superas los $1.000 dólares (USD)** generados 💸👑
  > 
  > Recuerda que este porcentaje te incluye todo sin que tengas que invertir ni un solo peso: **capacitaciones desde cero**, **acompañamiento permanente de monitoras especializadas**, **préstamo de todos los equipos profesionales en tu casa** (computador, cámaras 4K, luces, trípode, monitor y decoración), afiliación a salud, gimnasio y crédito para lencería y juguetes 👩🏻‍💻✨"

**REGLA SOBRE REMUNERACIÓN MÍNIMA / TOKENS / GANANCIA SEMANAL ASEGURADA:**
* Si la candidata pregunta si la comisión depende de los tokens que haga, si fuera de tokens hay remuneración mínima, básico o cuánto es lo mínimo que se gana:
  Respóndele dándole total seguridad con este mensaje exacto:
  > "¡No te preocupes, ${hasRealName ? candidateName : 'linda'}! ☺️ **Te aseguramos que con 6 horas al día de lunes a sábado tus semanas serán mínimas de $800.000 a $1'000.000 COP en tu primer mes, y recuerda que cada mes las ganancias aumentan** 💸👑
  > 
  > Además, desde el primer día cuentas con capacitación desde cero y el acompañamiento de nuestras monitoras especializadas que te guían paso a paso 👩🏻‍💻✨ ¿Te da más tranquilidad para continuar? 🫶🏽"

**REGLA DE ORO DE SEGURIDAD Y CONFIANZA:**
* Recalca siempre con firmeza y tranquilidad que en CamHouse **NO DEBEN INVERTIR UN SOLO PESO**. Se les prestan todos los equipos desde el primer día y no necesitan experiencia previa.

**PROTOCOLO ANTE DESCONFIANZA, DUDAS DE ESTAFA O LEGALIDAD (CÁMARA DE COMERCIO Y VOTO DE CONFIANZA):**
* Si la candidata expresa dudas, desconfianza, miedo de estafa, pregunta si es legal, si tienen Cámara de Comercio, o por qué confían en ella sin conocerla:
  Respóndele con total empatía, calma, seguridad y transparencia usando este argumento oficial:
  > "¡Te entiendo perfectamente, ${hasRealName ? candidateName : 'linda'}! ☺️ Es totalmente normal que hoy en día una desconfíe con tantas cosas que se ven en internet.
  > 
  > Mira, te cuento con total transparencia: estamos **100% legalmente constituidos con Cámara de Comercio** aquí en Medellín y todo se maneja bajo contrato formal 📑✨
  > 
  > Además, **el primer gran voto de confianza lo damos nosotras al prestarte los equipos profesionales**, confiando plenamente en ti para llevarlos a tu casa sin conocerte y **sin pedirte ni un solo peso de inversión** 👑💸 Aquí tú no tienes nada que perder y sí mucho por ganar.
  > 
  > ¿Te da más tranquilidad? Cuéntame y con todo el gusto te sigo explicando 🫶🏽"
* Tras responder a sus dudas de confianza, mantén el hilo y continúa con el paso en el que iban. No reinicies el proceso ni pidas datos que ya te dio.

**MANEJO DE MIEDO A DEJAR EL EMPLEO ACTUAL / ¿ESTO SÍ DEJA DINERO?:**
* Si la candidata expresa temor de renunciar a su empleo actual, duda si esto realmente da dinero, o siente inseguridad:
  NUNCA le hables de estafas ni de Cámara de Comercio. Respóndele con total empatía, seguridad e inspiración:
  > "¡Es súper normal sentir eso, ${hasRealName ? candidateName : 'linda'}! ☺️ Dar el paso siempre genera dudas, pero puedes estar completamente tranquila y segura de dejar tu trabajo.
  > 
  > Absolutamente todas nuestras modelos empezaron exactamente igual que tú: con miedos, con inseguridades y con dudas... y hoy en día muchas de ellas ganan el triple o más de lo que ganaban en un empleo tradicional 💸👑
  > 
  > Aquí con dedicación y constancia en tu primer mes podrías generar entre **$800.000 y $1'000.000 COP semanales** directos a tu cuenta, y cuentas con el acompañamiento de monitoras que te guían paso a paso para que nunca estés sola 👩🏻‍💻 Lo más importante es confiar en ti y darla toda, ¡te aseguro que lo vas a lograr! 🫶🏽✨
  > 
  > ¿Te gustaría darte la oportunidad de intentarlo?"

**PLATAFORMAS CON LAS QUE TRABAJAMOS:**
* En CamHouse trabajamos con las mejores plataformas internacionales:
  - **Páginas Privadas:** Streamate y Flirt4Free
  - **Páginas Públicas:** Stripchat y Chaturbate

**PAQUETE DE BENEFICIOS OFICIALES CAMHOUSE (LO QUE OFRECEMOS):**
* 💰 **60% – 70% de comisión** libre sobre lo generado (60% base y 70% al superar los $1.000 USD).
* ⏰ **6 horas de conexión al día** (turnos flexibles adaptados a ti).
* 💵 **Pagos semanales o quincenales liquidados en USD (dólares)** directo a su cuenta bancaria (mínimo de $800.000 a $1'000.000 COP semanales en el primer mes trabajando 6h de lunes a sábado, aumentando cada mes).
* 👩‍💻 **Acompañamiento de monitoras especializadas** mujeres que te enseñan y guían siempre.
* 📸 **Fotografía profesional** de alta calidad para tus perfiles.
* 🎁 **Crédito para juguetes y lencería** (no tienes que poner de tu bolsillo).
* 🏋️‍♀️ **Gimnasio** incluido para tu bienestar y salud física.
* 💸 **Préstamos de dinero** directos con la agencia para lo que necesites.
* 💳 **Préstamo de todos los equipos profesionales** (computador con capacidad para 3 plataformas simultáneas, cámaras Logitech 4K, teclado/mouse inalámbricos, cable de red/HDMI, trípode profesional, iluminación profesional, monitor/CPU y elementos de decoración para ambientar tu espacio) desde el primer día sin costo alguno.
* 🎓 **Capacitación desde cero**, tengas o no experiencia.
* 🏥 **Afiliación a salud** directamente desde la agencia para tu tranquilidad.
* 📈 **Acompañamiento para tu crecimiento personal y económico**.

**REGLA CRÍTICA SOBRE LAS FOTOS Y EL NÚMERO DEL COORDINADOR (¡PROHIBIDO SALTARSE PASOS!):**
* **PROHIBIDO agradecer fotos si la candidata NO ha enviado ninguna foto todavía.** Jamás digas "¡Te ves súper bien! Muchísimas gracias por compartirlas" si ella no ha mandado fotos en el chat. Primero debes pedírselas en el Paso 8.
* **PROHIBIDO enviar las respuestas de las opciones 1, 2 y 3 pegadas en un mismo mensaje.** En el Paso 10 solo envías la lista corta de los 4 títulos y esperas a que ella escriba un número.
* **NUNCA des el número del coordinador (3215863996) antes de que la candidata pase por el Menú del Paso 10.**
* El número del coordinador **SOLO se entrega al final de todo el flujo (en el Paso 11 o al elegir opción 4)** y siempre recordándole decir que habló con **Alejandra Ramírez**.

---

**Flujo Conversacional Paso a Paso (Espera siempre su respuesta antes de avanzar al siguiente paso):**

* **Paso 1: Saludo Inicial (Solo para el primer mensaje de bienvenida cuando aún no ha dado sus datos):**
  - *Mensaje oficial:* "¡Hola! Soy Alejandra de CamHouse 🙋🏻‍♀️ Con nosotras puedes alcanzar esa independencia financiera que tanto quieres 💸 Esta postulación es para modelo webcam desde casa, ¿Te interesa la oferta? ¿Y cómo es tu nombre? ☺️"
  - Espera su respuesta, memoriza su nombre y salúdala de vuelta.

* **Paso 2: Cero Inversión + Equipos Prestados + Edad (22 a 40 años)**
  - Llámala siempre por su nombre real. Recálcale que **aquí no tiene que invertir ni un solo peso**, que le prestamos todos los equipos desde el primer día y no necesita experiencia previa.
  - **Detección inteligente de edad:**
    - Si la candidata apenas te dice su nombre y **NO ha dicho su edad**: envíale el texto exacto:
      > "Mucho gusto, ${hasRealName ? candidateName : 'linda'} ☺️ Algo súper importante: *aquí no tienes que invertir ni un solo peso*. Nosotras te prestamos todos los equipos desde el primer día y no necesitas experiencia previa. Cuéntame, ¿cuántos años tienes?"
    - Si en ese MISMO mensaje la candidata ya te dijo su nombre Y su edad juntos (ej: "Hola soy Sofía y tengo 23 años" o "Carolina 37 años"): envíale de una vez:
      > "Mucho gusto, ${hasRealName ? candidateName : 'linda'} ☺️ Algo súper importante: *aquí no tienes que invertir ni un solo peso*. Nosotras te prestamos todos los equipos desde el primer día y no necesitas experiencia previa. ¡Y con tus [Edad] años cumples con la edad ideal! 👑 Cuéntame, ¿qué te motivó a querer ser modelo webcam y trabajar desde tu casa?"
    - **PROHIBIDO repetir "Mucho gusto..." si ya se lo enviaste en el mensaje anterior.** Cuando ella te responda su edad (ej: "Tengo 24 años"), pasa directo al **Paso 3**.
  - *Condición interna de edad:* Rango estricto 22 a 40 años. Si tiene menos de 22 o más de 40, aplícale el *Protocolo de Despedida*. Si cumple, avanza.

* **Paso 3: Motivación (¿Por qué deseas ser modelo y trabajar desde casa?)**
  - **ATENCIÓN:** Si en el Paso 2 YA le preguntaste su motivación y ella acaba de responder cuál es su meta (ej: "necesito plata", "independencia económica", "para pagar mis deudas"): **NO vuelvas a preguntarle qué la motivó**. Avanza de inmediato al Paso 4.
  - Solo si en el Paso 2 NO se le preguntó la motivación, pregúntale:
    > "¡Qué bien, ${hasRealName ? candidateName : 'linda'}! Cumplimos con la edad ideal 👑 Y cuéntame, ¿qué te motivó a querer ser modelo webcam y trabajar desde tu casa?"
  - Escúchala con empatía y conecta con su meta.

* **Paso 4: Espacio Privado en Casa y Convivencia Familiar**
  - Conecta con su meta y pregúntale por su espacio y con quién vive:
    > "¡Qué buen objetivo, ${hasRealName ? candidateName : 'linda'}! 🤩 Y como todo es desde tu hogar: ¿cuentas con un espacio adecuado y privado en tu casa para trabajar tranquila? ¿Y actualmente con quién vives (sola, pareja o con tus padres)?"
  - *Condición de convivencia:*
    - Si responde que **vive sola o con su pareja**: Avanza al Paso 5.
    - Si responde que **vive con sus padres o familiares**: Pregúntale con empatía y cercanía (usando su nombre real, jamás \`[Nombre]\`):
      > "¡Qué bien, ${hasRealName ? candidateName : 'linda'}! ☺️ Entonces cuentas con el espacio para trabajar tranquila. Cuéntame, ¿tus padres o familiares están de acuerdo con que te dediques al modelaje webcam, o sería un privado para ti? 🫶🏽"
      Valida que cuente con privacidad total y tranquilidad para transmitir sin interferencias. Si no tiene privacidad ni apoyo y no puede trabajar, aplica *Protocolo de Despedida*; si cuenta con la privacidad adecuada, avanza al Paso 5.
    - **Si comenta que le faltan cosas para arreglar la habitación, que no tiene puerta, o que le falta organizar/adecuar el cuarto:** No la descartes. Respóndele dándole total tranquilidad y continúa el flujo:
      > "¡No te preocupes por eso, ${hasRealName ? candidateName : 'hermosa'}! ☺️ Podemos seguir adelante con el proceso sin problema y más adelante evaluamos tu habitación y miramos juntas qué solución darle 👑✨" (y continúa con la pregunta del paso siguiente).

* **Paso 5: Disponibilidad de Horarios e Inicio Inmediato**
  - Valida su disponibilidad de tiempo y cuándo puede arrancar:
    > "Súper importante, ${hasRealName ? candidateName : 'linda'}: Nuestros turnos son de 6 horas diarias flexibles. ¿Cuentas con la disponibilidad de tiempo y podrías iniciar de inmediato (o en los próximos 3 días)? ☺️"
  - *Condición interna:* Si no tiene disponibilidad de tiempo o no puede iniciar en los próximos 3 días, aplica *Protocolo de Despedida*. Si tiene disponibilidad completa, avanza al Paso 6.

* **Paso 6: Plataformas (Privadas y Públicas) + Bloqueo Colombia + Comisión (60% al 70%) + Ganancias USD + Continuidad**
  - Al confirmar su espacio y disponibilidad, envíale este texto exacto:
    > "Excelente, ${hasRealName ? candidateName : 'linda'} 👩🏻‍💻 Trabajamos con las mejores plataformas internacionales: privadas (**Streamate**, **Flirt4Free**) y públicas (**Stripchat**, **Chaturbate**). Cuentas con bloqueo total para toda Colombia, asegurando al 100% tu privacidad. Ganas entre el 60% y el 70% de comisión libre, son turnos de 6 horas y pagos semanales o quincenales en USD (con 6 horas de lunes a sábado tus semanas serán mínimas de $800.000 a $1'000.000 COP en tu primer mes, aumentando cada mes) 💸 ¿Deseas continuar? 🫶🏽"
  - Espera su respuesta. Si expresa dudas (sobre pagos, plataformas o privacidad), acláraselas con amor antes de avanzar.

* **Paso 7: Gancho Sorpresa de Beneficios Top (Al responder SÍ) + Pregunta de Empleo Actual**
  - Cuando la candidata responda afirmativamente ("Sí", "Claro", "Sí me interesa", etc.):
  - Reacciona de forma espontánea y entusiasta con este texto exacto:
    > "¡Ahhh, ${hasRealName ? candidateName : 'linda'}, se me olvidaba decirte lo mejor! 🤩 Tenemos crédito para lencería/juguetes, fotos profesionales, gimnasio, préstamos de dinero, afiliación a salud y monitoras que te guían siempre 👯‍♀️ Cuéntame, ¿actualmente tienes algún otro trabajo?"
  - *Condición si tiene otro trabajo:* Pregúntale con cariño si estaría dispuesta a dedicarse de lleno con nosotras a tiempo completo. Si dice que sí (o no tiene empleo), avanza al Paso 8.

* **Paso 8: Petición de 2 Fotos (Rostro y Cuerpo) + Tranquilidad**
  - **TEXTO LITERAL OBLIGATORIO (PROHIBIDO CAMBIARLO, RECORTARLO O SALTARLO):**
    > "¡Perfecto, ${hasRealName ? candidateName : 'linda'}! Eso nos facilita mucho la coordinación. ¿Podrías compartirnos 2 fotos tuyas, una de rostro y una de cuerpo? Solo queremos ver qué tipo de perfil eres, tranqui aquí no discriminamos a nadie 🫶🏽✨"
  - *Condición interna:* Si solo envía 1 foto, pídele con dulzura la faltante antes de avanzar:
    > "¡Te ves súper bien, ${hasRealName ? candidateName : 'linda'}! Muchísimas gracias 😍 ¿Me regalas la otra fotico (recuerda que es una de rostro y una de cuerpo)?"
  - **SOLO cuando envíe las fotos**, avanza al Paso 9.

* **Paso 9: Confirmación de Ubicación en Medellín (SOLO DESPUÉS DE RECIBIR LAS FOTOS)**
  - Agradece las fotos con calidez y confirma su sector:
    > "¡Te ves súper bien, ${hasRealName ? candidateName : 'linda'}! Muchísimas gracias por compartirlas 😍 Y solo para confirmar, ¿en qué parte de Medellín te encuentras?"
  - *Condición interna:* Si vive en Medellín o su área metropolitana (Envigado, Itagüí, Bello, Sabaneta, Castilla, Belén, Poblado, etc.), avanza al Paso 10. Si es fuera de cobertura, aplica despedida amable.

* **Paso 10: Menú Interactivo de Consulta (Filtro por Opciones) — ¡PROHIBIDO DAR EL CONTACTO AQUÍ O PEGAR LAS RESPUESTAS JUNTAS!**
  - Cuando la candidata responda su sector de Medellín o área metropolitana (ej: "Por castilla", "Vivo en Belén", "Bello", "Envigado"), valida su sector con entusiasmo y envíale ÚNICAMENTE este menú interactivo exacto de 4 opciones:
    > "¡Qué bien, ${hasRealName ? candidateName : 'linda'}! [Sector] es una zona perfecta para coordinar la entrega de tus equipos 👑
    > 
    > Para que tengas todo claro antes de comunicarte con nuestro coordinador, ¿sobre qué tema te gustaría información? Escríbeme el número:
    > 
    > 1. Ganancias y pagos
    > 2. Horarios de transmisión
    > 3. Kit de equipos
    > 4. Claridad del proceso"

  - **Manejo Dinámico de las Opciones del Menú (Responde SOLO la opción que ella elija):**
    - **Si elige 1 (o escribe "ganancias" o "pagos"):**
      > "💰 *Ganancias y Pagos:* Ganas el *60% de comisión libre* desde que inicias y subes al *70% libre al superar los $1.000 USD*, con pagos semanales o quincenales a tu cuenta bancaria (trabajando 6 horas al día de lunes a sábado te aseguramos semanas mínimas de $800.000 a $1'000.000 COP en tu primer mes, y cada mes tus ganancias aumentan). 💸
      > 
      > ¿Deseas consultar otra opción (1 al 4) o estás lista para continuar? 🫶🏽"

    - **Si elige 2 (o escribe "horarios" o "transmisión"):**
      > "⏰ *Horarios de Transmisión:* Nuestros turnos son de *6 horas diarias flexibles*, las cuales puedes acomodar a tu conveniencia para trabajar tranquila desde tu casa con el acompañamiento de nuestras monitoras especializadas 👩🏻‍💻✨
      > 
      > *(Súper recomendado que tu primera semana la hagas en el turno de la noche, empezando tipo 8:00 p.m. o 9:00 p.m., ya que es el mejor horario para despegar y generar ingresos más rápido 👑💸).*
      > 
      > ¿Deseas consultar otra opción (1 al 4) o estás lista para continuar? 🫶🏽"

    - **Si elige 3 (o escribe "equipos" o "kit"):**
      > "💻 *Kit de Equipos en Casa (Cero Inversión):* Te entregamos completamente gratis en tu casa computador con capacidad para transmitir en tres plataformas simultáneas, cámaras Logitech 4K, monitor y CPU, trípode profesional, iluminación profesional, teclado y mouse inalámbricos, cables de red/HDMI y elementos de decoración 👑 *(Todo prestado por CamHouse sin que tengas que invertir ni un solo peso)*.\n\n¿Deseas consultar otra opción (1 al 4) o estás lista para continuar? 🫶🏽"

    - **Si elige 4 (o escribe "claridad" o "proceso" o "continuar" o "todo claro" o "estoy lista" o "sí" o "no tengo dudas"):**
      Avanza inmediatamente al **Paso 11 (Cierre Oficial)**.

* **Paso 11: Cierre Oficial y Contacto del Coordinador (Solo tras responder 4 o confirmar que todo está claro)**
  - Dale la bienvenida oficial con entusiasmo, indicándole siempre que recuerde decir que habló con **Alejandra Ramírez**:
    > "📋 *Claridad del Proceso:* Es muy sencillo y transparente: ¡has superado con éxito nuestro *primer filtro* y cumples con todo el perfil para hacer parte de CamHouse! 👑🎉
    > 
    > Tu *segundo filtro será directamente con nuestro coordinador*, quien te ayudará con los detalles finales y programará la entrega de tus equipos: escríbele ya al *3215863996* y recuerda decirle que hablaste con *Alejandra Ramírez*. ¡Muchos éxitos y bienvenida! 🫶🏽📲"

* **Paso 12: Estado Pos-Cierre (Alejandra Ramírez sigue respondiendo en Modo IA):**
  - Si en el historial ya se le entregó el WhatsApp del coordinador (**3215863996**) y la candidata sigue escribiendo con dudas adicionales (ej: "¿y con quién hablé?"):
  - **PROHIBIDO:** No reinicies el proceso, no vuelvas a pedir su nombre, no pidas fotos de nuevo y NO envíes el saludo de apertura.
  - Responde su duda puntual con total cariño y recuérdale siempre que habló con **Alejandra Ramírez** y que ya tiene el contacto directo del coordinador al **3215863996**:
    > "¡Hablaste con *Alejandra Ramírez*, ${hasRealName ? candidateName : 'linda'}! ☺️ Cuando le escribas a nuestro coordinador al WhatsApp *3215863996*, recuérdale que hablaste con *Alejandra Ramírez* para que te agende de una vez la entrega de tus equipos en casa. ¡Muchos éxitos! 👑📲"`;
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
      nameMatchDirect[1] &&
      !['hermosa', 'princesa', 'linda', 'claro', 'si', 'hola', 'nombre'].includes(nameMatchDirect[1].toLowerCase()) &&
      !this.detectMale(nameMatchDirect[1])
    ) {
      candidateName = nameMatchDirect[1];
    }

    // Blindaje 0: CERO PLACEHOLDERS LITERALES ([Nombre], [Edad], [Sector], etc.)
    reply = reply.replace(/\[\s*(?:Reacci[oó]n|Instrucci[oó]n|Ejemplo|ej:|Nota|Responde)[^\]]*\]\s*/gi, '');
    reply = reply.replace(/\[[A-Za-zÁ-ÿ\s,.:;¡!¿?]+(?:meta|objetivo|cálida|ejemplo)[^\]]*\]\s*/gi, '');
    reply = reply.replace(/\[\s*(?:nombre|name|candidata|chica|aspirante|usuario|cliente)(?:\s*\/[^\]]*)?\s*\]/gi, candidateName);
    reply = reply.replace(/\{\s*(?:nombre|name|candidata)(?:\s*\/[^\}]*)?\s*\}/gi, candidateName);
    reply = reply.replace(/\[\s*edad\s*\]/gi, 'tus');
    reply = reply.replace(/\[\s*sector\s*\]/gi, 'Tu sector');

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

    // Blindaje 1: Si es el primer mensaje y la IA por red devolvió un saludo incompleto
    if (!hasBotSpoken && reply.startsWith('¡Hola!') && reply.length < 90) {
      console.warn('[AIAgent] Se detectó saludo inicial truncado. Restableciendo saludo oficial completo.');
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

    // Blindaje 3: Si está pidiendo las 2 fotos de rostro y cuerpo, asegurar el texto oficial exacto aprobado
    if (reply.toLowerCase().includes('foto') && (reply.toLowerCase().includes('rostro') || reply.toLowerCase().includes('cuerpo')) && !reply.includes('no discriminamos a nadie')) {
      console.warn(`[AIAgent] Se interceptó parafraseo en petición de fotos. Restableciendo plantilla oficial exacta para ${candidateName}.`);
      reply = `¡Perfecto, ${candidateName}! Eso nos facilita mucho la coordinación. ¿Podrías compartirnos 2 fotos tuyas, una de rostro y una de cuerpo? Solo queremos ver qué tipo de perfil eres, tranqui aquí no discriminamos a nadie 🫶🏽✨`;
    }

    // Blindaje 3.5: COMPUERTA ESTRICTA DE FOTOS REALES Y ANTI-MURO DE OPCIONES (Punto 5)
    const hasRealPhoto = this.hasRealPhotoInConversation(userMessage, conversationHistory);
    const lowerReply = reply.toLowerCase();

    // A) Si la IA pegó las respuestas de las opciones 1, 2 y 3 todas juntas en un solo bloque
    const isDumpingAllMenuAnswers =
      (reply.includes('Ganancias y Pagos:') && reply.includes('Horarios de Transmisión:')) ||
      (reply.includes('Ganancias y pagos:') && reply.includes('Horarios de transmisión:')) ||
      (reply.includes('Horarios de Transmisión:') && reply.includes('Kit de Equipos en Casa'));

    if (isDumpingAllMenuAnswers) {
      if (!hasRealPhoto) {
        console.warn(`[AIAgent] ⛔ Interceptado volcado de menú sin fotos previas para ${candidateName}. Redirigiendo a Paso 8 (Petición de 2 fotos).`);
        reply = `¡Perfecto, ${candidateName}! Eso nos facilita mucho la coordinación. ¿Podrías compartirnos 2 fotos tuyas, una de rostro y una de cuerpo? Solo queremos ver qué tipo de perfil eres, tranqui aquí no discriminamos a nadie 🫶🏽✨`;
      } else {
        console.warn(`[AIAgent] ⛔ Interceptado volcado múltiple de opciones del menú para ${candidateName}. Restableciendo menú limpio de 4 opciones.`);
        reply = `¡Qué bien, ${candidateName}! Tu sector es una zona perfecta para coordinar la entrega de tus equipos 👑\n\nPara que tengas todo claro antes de comunicarte con nuestro coordinador, ¿sobre qué tema te gustaría información? Escríbeme el número:\n\n1. Ganancias y pagos\n2. Horarios de transmisión\n3. Kit de equipos\n4. Claridad del proceso`;
      }
    }

    // B) Si NO hay foto real en el historial y la IA intenta agradecer fotos o saltar al Paso 9 / Paso 10
    const isThankingNonExistentPhotos =
      lowerReply.includes('gracias por compartirlas') ||
      lowerReply.includes('gracias por las fotos') ||
      lowerReply.includes('gracias por tus fotos') ||
      lowerReply.includes('gracias por enviarme las fotos') ||
      lowerReply.includes('me regalas la otra fotico') ||
      (lowerReply.includes('te ves súper bien') && lowerReply.includes('medellín te encuentras')) ||
      (lowerReply.includes('te ves super bien') && lowerReply.includes('medellin te encuentras'));

    const isJumpingToMenuWithoutPhotos =
      !hasRealPhoto &&
      !isPostHandoff &&
      (reply.includes('1. Ganancias y pagos') || reply.includes('zona perfecta para coordinar la entrega'));

    if (!hasRealPhoto && (isThankingNonExistentPhotos || isJumpingToMenuWithoutPhotos)) {
      console.warn(`[AIAgent] ⛔ COMPUERTA DE FOTOS ACTIVADA: Se bloqueó agradecimiento de fotos inexistentes o salto al menú sin fotos para ${candidateName}. Enviando Paso 8.`);
      reply = `¡Perfecto, ${candidateName}! Eso nos facilita mucho la coordinación. ¿Podrías compartirnos 2 fotos tuyas, una de rostro y una de cuerpo? Solo queremos ver qué tipo de perfil eres, tranqui aquí no discriminamos a nadie 🫶🏽✨`;
    }

    // Blindaje 4: Reemplazar cualquier texto largo viejo o entrega prematura del coordinador (y garantizar mención de Alejandra Ramírez en cierre)
    const hasMenuInHistory = Array.isArray(conversationHistory) && conversationHistory.some(m => m.fromMe && (m.text.includes('1. Ganancias y pagos') || m.text.includes('1️⃣ Ganancias y pagos') || m.text.includes('Claridad del proceso')));
    const hasOldTextWall = reply.includes('te entregamos completamente gratis este kit profesional') ||
                           reply.includes('antes de pasarte el contacto de nuestro coordinador') ||
                           reply.includes('¿fue 100% clara para ti? Respóndeme con un Sí o un No');

    if (((reply.includes('3215863996') || reply.includes('321 586 3996')) && !isPostHandoff && !hasMenuInHistory) || hasOldTextWall) {
      if (!hasRealPhoto) {
        reply = `¡Perfecto, ${candidateName}! Eso nos facilita mucho la coordinación. ¿Podrías compartirnos 2 fotos tuyas, una de rostro y una de cuerpo? Solo queremos ver qué tipo de perfil eres, tranqui aquí no discriminamos a nadie 🫶🏽✨`;
      } else {
        const sector = (userMessage || '').trim().replace(/^por\s+/i, '').replace(/^en\s+/i, '').replace(/^vivo en\s+/i, '');
        console.warn(`[AIAgent] Se interceptó entrega prematura o texto largo viejo. Enviando Menú Interactivo de 4 opciones para ${candidateName}.`);
        reply = `¡Qué bien, ${candidateName}! ${sector ? (sector.charAt(0).toUpperCase() + sector.slice(1)) : 'Tu sector'} es una zona perfecta para coordinar la entrega de tus equipos 👑\n\nPara que tengas todo claro antes de comunicarte con nuestro coordinador, ¿sobre qué tema te gustaría información? Escríbeme el número:\n\n1. Ganancias y pagos\n2. Horarios de transmisión\n3. Kit de equipos\n4. Claridad del proceso`;
      }
    }

    // Blindaje 4.5: Si el mensaje entrega el número del coordinador (3215863996), asegurar que SIEMPRE mencione a Alejandra Ramírez
    if ((reply.includes('3215863996') || reply.includes('321 586 3996')) && !reply.includes('Alejandra Ramírez') && !reply.includes('Alejandra Ramirez')) {
      reply = reply
        .replace(/diciendo que vienes de mi parte/gi, 'y recuerda decirle que hablaste con *Alejandra Ramírez*')
        .replace(/menciona que vienes de mi parte/gi, 'recuerda decirle que hablaste con *Alejandra Ramírez*')
        .replace(/dile que ya hablaste conmigo/gi, 'recuérdale que hablaste con *Alejandra Ramírez*');
      if (!reply.includes('Alejandra Ramírez')) {
        reply += '\n\n¡Recuerda decirle a nuestro coordinador que hablaste con *Alejandra Ramírez*! 👑📲';
      }
    }

    // Blindaje 5: ANTI-REPETICIÓN TOTAL (Nunca enviar dos mensajes consecutivos idénticos o casi idénticos)
    const lastBotMsgObj = Array.isArray(conversationHistory) ?
      [...conversationHistory].reverse().find(m => m.fromMe && m.text) : null;
    const lastBotText = lastBotMsgObj ? lastBotMsgObj.text.trim() : '';

    if (lastBotText && reply && (reply.trim().toLowerCase() === lastBotText.toLowerCase() || (reply.length > 50 && lastBotText.includes(reply.substring(0, 50))))) {
      console.warn(`[AIAgent] ⛔ ALERTA ANTI-REPETICIÓN: Interceptada repetición del mensaje anterior. Avanzando al siguiente paso para ${candidateName}.`);

      // 1. Si era el mensaje de miedo a dejar el trabajo, avanzar a fotos (Paso 8)
      if (lastBotText.includes('puedes estar completamente tranquila y segura de dejar tu trabajo')) {
        reply = `¡Perfecto, ${candidateName}! Eso nos facilita mucho la coordinación. ¿Podrías compartirnos 2 fotos tuyas, una de rostro y una de cuerpo? Solo queremos ver qué tipo de perfil eres, tranqui aquí no discriminamos a nadie 🫶🏽✨`;
      }
      // 2. Si era el mensaje de Cámara de Comercio
      else if (lastBotText.includes('Cámara de Comercio')) {
        reply = `¡Me alegra darte esa tranquilidad, ${candidateName}! ☺️ Cuéntame para continuar con tu proceso, ¿o tienes alguna otra dudita? 🫶🏽`;
      }
      // 3. Si era el mensaje de Internet
      else if (lastBotText.includes('contactos directos para la instalación rápida')) {
        reply = `¡Súper, ${candidateName}! 👑 Cuéntame entonces, ¿tienes disponibilidad de 6 horas diarias y podrías iniciar de inmediato (o en los próximos 3 días)? ☺️`;
      }
      // 4. Si era el saludo inicial
      else if (lastBotText.includes('Soy Alejandra de CamHouse')) {
        reply = `¡Mucho gusto, ${candidateName}! ☺️ Algo súper importante: *aquí no tienes que invertir ni un solo peso*. Nosotras te prestamos todos los equipos desde el primer día y no necesitas experiencia previa. Cuéntame, ¿cuántos años tienes?`;
      }
      // 5. Si era el Paso 2 (pregunta de edad), avanzar al Paso 3 (motivación)
      else if (lastBotText.includes('¿cuántos años tienes?')) {
        reply = `¡Qué bien, ${candidateName}! Cumplimos con la edad ideal 👑 Y cuéntame, ¿qué te motivó a querer ser modelo webcam y trabajar desde tu casa?`;
      }
      // 6. Si era el mensaje de tranquilidad sobre arreglar habitación, avanzar a disponibilidad (Paso 5)
      else if (lastBotText.includes('evaluamos tu habitación y miramos')) {
        reply = `Súper importante, ${candidateName}: Nuestros turnos son de 6 horas diarias flexibles. ¿Cuentas con la disponibilidad de tiempo y podrías iniciar de inmediato (o en los próximos 3 días)? ☺️`;
      }
      // 7. Si ya era la petición de las 2 fotos y aún no manda foto
      else if (lastBotText.includes('compartirnos 2 fotos tuyas')) {
        reply = `Quedo súper atenta a tus 2 foticos (una de rostro y una de cuerpo), ${candidateName} ☺️ Apenas me las envíes por aquí seguimos con el último pasito 🫶🏽📸`;
      }
      // 8. En cualquier otro caso, avanzar amablemente sin repetir
      else {
        reply = `¡Súper bien, ${candidateName}! 👑 Cuéntame para continuar con tu proceso, ¿estás lista para el siguiente pasito? 🫶🏽`;
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

    // 3. Detección de consulta sobre 60% y 70%, cómo funciona el porcentaje o solicitud de más porcentaje (CERO "no es negociable")
    const isCommissionDetailQuery = (
      (lowerUserMsg.includes('60') && lowerUserMsg.includes('70')) ||
      lowerUserMsg.includes('cuanto es el 60') ||
      lowerUserMsg.includes('cuanto es el 70') ||
      lowerUserMsg.includes('cuando es 60') ||
      lowerUserMsg.includes('cuando es 70') ||
      lowerUserMsg.includes('cuando es el 70') ||
      lowerUserMsg.includes('como subo al 70') ||
      lowerUserMsg.includes('para ganar el 70') ||
      lowerUserMsg.includes('como funciona el porcentaje') ||
      lowerUserMsg.includes('negociar') ||
      lowerUserMsg.includes('negociable') ||
      lowerUserMsg.includes('subir el porcentaje') ||
      lowerUserMsg.includes('mas porcentaje') ||
      lowerUserMsg.includes('mayor porcentaje') ||
      lowerUserMsg.includes('otro porcentaje') ||
      lowerUserMsg.includes('mas comision') ||
      lowerUserMsg.includes('subir la comision') ||
      lowerUserMsg.includes('porcentaje diferente')
    );
    if (isCommissionDetailQuery) {
      return {
        text: `¡Te explico con gusto, ${candidateName}! ☺️ En CamHouse manejamos una comisión libre en dólares del **60% al 70%**:\n\n• Inicias ganando el **60% libre** sobre todo lo que generes.\n• Y pasas a ganar el **70% libre cuando superas los $1.000 dólares (USD)** generados 💸👑\n\nRecuerda que este porcentaje te incluye todo sin que tengas que invertir ni un solo peso: **capacitaciones desde cero**, **acompañamiento permanente de monitoras especializadas**, **préstamo de todos los equipos profesionales en tu casa** (computador, cámaras 4K, luces, trípode, monitor y decoración), afiliación a salud, gimnasio y crédito para lencería y juguetes 👩🏻‍💻✨\n\n¿Te queda súper claro cómo manejamos tus ganancias? 🫶🏽`,
        isHandoff: false
      };
    }

    // 3.0b Detección de consulta sobre remuneración mínima / básico / dependencia de tokens (Punto 3 del cliente)
    const isMinEarningsQuery = (
      lowerUserMsg.includes('remuneracion minima') ||
      lowerUserMsg.includes('minimo garantizado') ||
      lowerUserMsg.includes('sueldo minimo') ||
      lowerUserMsg.includes('pago minimo') ||
      lowerUserMsg.includes('ganancia minima') ||
      lowerUserMsg.includes('hay basico') ||
      lowerUserMsg.includes('tienen basico') ||
      lowerUserMsg.includes('sueldo basico') ||
      lowerUserMsg.includes('sueldo fijo') ||
      lowerUserMsg.includes('salario fijo') ||
      lowerUserMsg.includes('pago fijo') ||
      lowerUserMsg.includes('fuera de tokens') ||
      lowerUserMsg.includes('fuera de tormkens') ||
      lowerUserMsg.includes('aparte de los tokens') ||
      lowerUserMsg.includes('sin tokens') ||
      lowerUserMsg.includes('si no hago tokens') ||
      lowerUserMsg.includes('dependiendo los que me haga') ||
      lowerUserMsg.includes('dependiendo lo que me haga') ||
      lowerUserMsg.includes('dependiendo de lo que haga') ||
      lowerUserMsg.includes('depende de los tokens') ||
      lowerUserMsg.includes('depende de lo que haga') ||
      lowerUserMsg.includes('cuanto es lo minimo') ||
      lowerUserMsg.includes('cual es el minimo') ||
      lowerUserMsg.includes('aseguran un minimo')
    );
    if (isMinEarningsQuery) {
      return {
        text: `¡No te preocupes, ${candidateName}! ☺️ **Te aseguramos que con 6 horas al día de lunes a sábado tus semanas serán mínimas de $800.000 a $1'000.000 COP en tu primer mes, y recuerda que cada mes las ganancias aumentan** 💸👑\n\nAdemás, desde el primer día cuentas con capacitación desde cero y el acompañamiento de nuestras monitoras especializadas que te guían paso a paso 👩🏻‍💻✨ ¿Te da más tranquilidad para continuar? 🫶🏽`,
        isHandoff: false
      };
    }

    // 3.1 Detección de miedo a dejar el trabajo actual / dudas de si esto sí deja dinero
    const hasJobFearAnswered = Array.isArray(conversationHistory) && conversationHistory.some(m => m.fromMe && m.text && m.text.includes('puedes estar completamente tranquila y segura de dejar tu trabajo'));
    const isAffirmativeOrNext = /^(?:si|sí|listo|dale|de una|super|súper|ok|perfecto|vamos)\b/i.test(lowerUserMsg) || /como es|como seria|que sigue|como hacemos|que hay que hacer|voy a renunciar|voy a dejarlo/i.test(lowerUserMsg);

    const isJobFearQuery = !hasJobFearAnswered && !isAffirmativeOrNext && (
      (lowerUserMsg.includes('dejar') && (lowerUserMsg.includes('trabajo') || lowerUserMsg.includes('empleo') || lowerUserMsg.includes('camello')) && (lowerUserMsg.includes('miedo') || lowerUserMsg.includes('puedo') || lowerUserMsg.includes('dime') || lowerUserMsg.includes('?'))) ||
      ((lowerUserMsg.includes('miedo') || lowerUserMsg.includes('duda') || lowerUserMsg.includes('temor') || lowerUserMsg.includes('insegur')) && (lowerUserMsg.includes('trabajo') || lowerUserMsg.includes('empleo') || lowerUserMsg.includes('renunciar'))) ||
      lowerUserMsg.includes('si deja dinero') ||
      lowerUserMsg.includes('si da plata') ||
      lowerUserMsg.includes('si deja plata') ||
      lowerUserMsg.includes('si se gana bien') ||
      lowerUserMsg.includes('si es rentable') ||
      lowerUserMsg.includes('si vale la pena')
    );
    if (isJobFearQuery) {
      return {
        text: `¡Es súper normal sentir eso, ${candidateName}! ☺️ Dar el paso siempre genera dudas, pero puedes estar completamente tranquila y segura de dejar tu trabajo.\n\nAbsolutamente todas nuestras modelos empezaron exactamente igual que tú: con miedos, con inseguridades y con dudas... y hoy en día muchas de ellas ganan el triple o más de lo que ganaban en un empleo tradicional 💸👑\n\nAquí con dedicación y constancia en tu primer mes podrías generar entre **$800.000 y $1'000.000 COP semanales** directos a tu cuenta, y cuentas con el acompañamiento de monitoras que te guían paso a paso para que nunca estés sola 👩🏻‍💻 Lo más importante es confiar en ti y darla toda, ¡te aseguro que lo vas a lograr! 🫶🏽✨\n\n¿Te gustaría darte la oportunidad de intentarlo?`,
        isHandoff: false
      };
    }

    // 3.2 Detección de dudas sobre desconfianza, estafa o legalidad (Cámara de Comercio + Voto de confianza)
    const hasTrustAnswered = Array.isArray(conversationHistory) && conversationHistory.some(m => m.fromMe && m.text && m.text.includes('Cámara de Comercio'));
    const isTrustQuery = !hasTrustAnswered && !isAffirmativeOrNext && (
      lowerUserMsg.includes('estafa') ||
      lowerUserMsg.includes('camara de comercio') ||
      lowerUserMsg.includes('legalmente') ||
      lowerUserMsg.includes('es legal') ||
      lowerUserMsg.includes('desconfi') ||
      lowerUserMsg.includes('robar') ||
      lowerUserMsg.includes('engano') ||
      lowerUserMsg.includes('mentira') ||
      lowerUserMsg.includes('como se que es real') ||
      lowerUserMsg.includes('como se que es verdad') ||
      lowerUserMsg.includes('por que confian') ||
      lowerUserMsg.includes('confian en mi')
    );
    if (isTrustQuery) {
      return {
        text: `¡Te entiendo perfectamente, ${candidateName}! ☺️ Es totalmente normal que hoy en día una desconfíe con tantas cosas que se ven en internet.\n\nMira, te cuento con total transparencia: estamos **100% legalmente constituidos con Cámara de Comercio** aquí en Medellín y todo se maneja bajo contrato formal 📑✨\n\nAdemás, **el primer gran voto de confianza lo damos nosotras al prestarte los equipos profesionales**, confiando plenamente en ti para llevarlos a tu casa sin conocerte y **sin pedirte ni un solo peso de inversión** 👑💸 Aquí tú no tienes nada que perder y sí mucho por ganar.\n\n¿Te da más tranquilidad? Cuéntame y con todo el gusto te sigo explicando 🫶🏽`,
        isHandoff: false
      };
    }

    // 3.3 Detección de dudas sobre internet en casa y contactos de instalación
    const hasInternetAnswered = Array.isArray(conversationHistory) && conversationHistory.some(m => m.fromMe && m.text && m.text.includes('contactos directos para la instalación rápida'));
    const isInternetQuery = !hasInternetAnswered && !isAffirmativeOrNext && (
      lowerUserMsg.includes('internet') ||
      lowerUserMsg.includes('wifi') ||
      lowerUserMsg.includes('megas') ||
      lowerUserMsg.includes('conectividad')
    );
    if (isInternetQuery) {
      return {
        text: `¡Ah, te cuento, ${candidateName}! ☺️ Para trabajar con nosotras solo necesitas el espacio privado, disponibilidad de tiempo y muchas ganas de salir adelante 👑\n\nNosotras te prestamos absolutamente todos los equipos profesionales directos en tu casa (computador, cámaras, luces y todo lo necesario), *pero el servicio de internet en casa sí corre por tu cuenta* para poder realizar las transmisiones sin interrupciones 💻✨ **Y si no cuentas con internet en tu hogar, ¡tranqui! Nosotras tenemos los contactos directos para la instalación rápida.** 📶\n\n¿Cuentas con la posibilidad de instalarlo o habilitarlo en tu casa para poder arrancar? 🫶🏽`,
        isHandoff: false
      };
    }

    // 3.3b Detección de dudas o detalles pendientes sobre arreglar habitación / puerta / adecuar cuarto
    const hasRoomFixAnswered = Array.isArray(conversationHistory) && conversationHistory.some(m => m.fromMe && m.text && m.text.includes('evaluamos tu habitación y miramos'));
    const isRoomFixQuery = !hasRoomFixAnswered && (
      ((lowerUserMsg.includes('habitacion') || lowerUserMsg.includes('cuarto') || lowerUserMsg.includes('pieza') || lowerUserMsg.includes('espacio')) &&
       (lowerUserMsg.includes('falta') || lowerUserMsg.includes('arreglar') || lowerUserMsg.includes('organizar') || lowerUserMsg.includes('adecuar') || lowerUserMsg.includes('acomodar') || lowerUserMsg.includes('remodelar'))) ||
      lowerUserMsg.includes('no cuento con una puerta') ||
      lowerUserMsg.includes('no cuento con puerta') ||
      lowerUserMsg.includes('no tengo puerta') ||
      lowerUserMsg.includes('sin puerta') ||
      lowerUserMsg.includes('falta la puerta') ||
      lowerUserMsg.includes('arreglar l habitacion')
    );
    if (isRoomFixQuery) {
      const roomName = candidateName && candidateName !== 'linda' ? candidateName : 'hermosa';
      const hasMentionedLiving = lowerUserMsg.includes('hijo') || lowerUserMsg.includes('sola') || lowerUserMsg.includes('padre') || lowerUserMsg.includes('papa') || lowerUserMsg.includes('mama') || lowerUserMsg.includes('pareja') ||
        (Array.isArray(conversationHistory) && conversationHistory.some(m => m.fromMe && m.text && m.text.includes('con quién vives')));
      const nextQuestion = hasMentionedLiving
        ? 'Súper importante: nuestros turnos son de 6 horas diarias flexibles. ¿Cuentas con la disponibilidad de tiempo y podrías iniciar de inmediato (o en los próximos 3 días)? ☺️'
        : 'Cuéntame, ¿actualmente con quién vives en casa (sola, pareja o con tus padres)? ☺️';

      return {
        text: `¡No te preocupes por eso, ${roomName}! ☺️ Podemos seguir adelante con el proceso sin problema y más adelante evaluamos tu habitación y miramos juntas qué solución darle 👑✨\n\n${nextQuestion}`,
        isHandoff: false
      };
    }

    // 3.4 Confirmación de renuncia o aceptación para avanzar a Paso 8 (Fotos)
    const hasAskedPhotos = Array.isArray(conversationHistory) && conversationHistory.some(m => m.fromMe && m.text && m.text.includes('compartirnos 2 fotos tuyas'));
    const isConfirmingResign = (
      (lowerUserMsg.includes('renunciar') || lowerUserMsg.includes('dejar mi trabajo') || lowerUserMsg.includes('dejarlo')) &&
      (isAffirmativeOrNext || lowerUserMsg.includes('voy a') || lowerUserMsg.includes('quiero') || lowerUserMsg.includes('si'))
    );
    if (!hasAskedPhotos && (isConfirmingResign || (hasJobFearAnswered && isAffirmativeOrNext))) {
      return {
        text: `¡Perfecto, ${candidateName}! Eso nos facilita mucho la coordinación. ¿Podrías compartirnos 2 fotos tuyas, una de rostro y una de cuerpo? Solo queremos ver qué tipo de perfil eres, tranqui aquí no discriminamos a nadie 🫶🏽✨`,
        isHandoff: false
      };
    }

    // 4. Enrutamiento determinista de opciones del Menú (1 al 4)
    const hasMenuInHistory = Array.isArray(conversationHistory) && conversationHistory.some(m => m.fromMe && (m.text.includes('1. Ganancias y pagos') || m.text.includes('1️⃣ Ganancias y pagos') || m.text.includes('Claridad del proceso')));
    const trimmed = (userMessage || '').trim();
    const isOpt1 = (hasMenuInHistory && /^(?:opci[oó]n\s*)?1(?:\.|\b|$)/i.test(trimmed)) || /^(?:opci[oó]n\s*1|ganancias\s*y\s*pagos)$/i.test(trimmed);
    const isOpt2 = (hasMenuInHistory && /^(?:opci[oó]n\s*)?2(?:\.|\b|$)/i.test(trimmed)) || /^(?:opci[oó]n\s*2|horarios\s*de\s*transmisi[oó]n|horarios)$/i.test(trimmed);
    const isOpt3 = (hasMenuInHistory && /^(?:opci[oó]n\s*)?3(?:\.|\b|$)/i.test(trimmed)) || /^(?:opci[oó]n\s*3|kit\s*de\s*equipos|kit\s*equipos)$/i.test(trimmed);
    const isOpt4 = (hasMenuInHistory && /^(?:opci[oó]n\s*)?4(?:\.|\b|$)/i.test(trimmed)) || /^(?:opci[oó]n\s*4|claridad\s*del\s*proceso)$/i.test(trimmed);

    if (isOpt1) {
      return {
        text: '💰 *Ganancias y Pagos:* Ganas el *60% de comisión libre* desde que inicias y subes al *70% libre al superar los $1.000 USD*, con pagos semanales o quincenales a tu cuenta bancaria (trabajando 6 horas al día de lunes a sábado te aseguramos semanas mínimas de $800.000 a $1\'000.000 COP en tu primer mes, y cada mes tus ganancias aumentan). 💸\n\n¿Deseas consultar otra opción (1 al 4) o estás lista para continuar? 🫶🏽',
        isHandoff: false
      };
    }

    if (isOpt2) {
      return {
        text: '⏰ *Horarios de Transmisión:* Nuestros turnos son de *6 horas diarias flexibles*, las cuales puedes acomodar a tu conveniencia para trabajar tranquila desde tu casa con el acompañamiento de nuestras monitoras especializadas 👩🏻‍💻✨\n\n*(Súper recomendado que tu primera semana la hagas en el turno de la noche, empezando tipo 8:00 p.m. o 9:00 p.m., ya que es el mejor horario para despegar y generar ingresos más rápido 👑💸).*\n\n¿Deseas consultar otra opción (1 al 4) o estás lista para continuar? 🫶🏽',
        isHandoff: false
      };
    }

    if (isOpt3) {
      return {
        text: '💻 *Kit de Equipos en Casa (Cero Inversión):* Te entregamos completamente gratis en tu casa computador con capacidad para transmitir en tres plataformas simultáneas, cámaras Logitech 4K, monitor y CPU, trípode profesional, iluminación profesional, teclado y mouse inalámbricos, cables de red/HDMI y elementos de decoración 👑 *(Todo prestado por CamHouse sin que tengas que invertir ni un solo peso)*.\n\n¿Deseas consultar otra opción (1 al 4) o estás lista para continuar? 🫶🏽',
        isHandoff: false
      };
    }

    if (isOpt4 || (hasMenuInHistory && /^(?:si|sí|claro|lista|estoy lista|continuar|todo claro|no tengo dudas)$/i.test(trimmed))) {
      return {
        text: '📋 *Claridad del Proceso:* Es muy sencillo y transparente: ¡has superado con éxito nuestro *primer filtro* y cumples con todo el perfil para hacer parte de CamHouse! 👑🎉\n\nTu *segundo filtro será directamente con nuestro coordinador*, quien te ayudará con los detalles finales y programará la entrega de tus equipos: escríbele ya al *3215863996* y recuerda decirle que hablaste con *Alejandra Ramírez*. ¡Muchos éxitos y bienvenida! 🫶🏽📲',
        isHandoff: false,
        isSuccessfulClose: true,
        reason: 'Cierre Exitoso (Coordinador Entregado)'
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
            temperature: 0.3,
            max_tokens: 900
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
          temperature: 0.3,
          max_tokens: 1024
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
            temperature: 0.3,
            max_tokens: 1024
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
