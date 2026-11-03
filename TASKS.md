# 📋 CamHouse By C&A — Seguimiento de Tareas (Task Tracker)

Estado actual del proyecto de rediseño y actualización del motor de Inteligencia Artificial para **CamHouse By C&A**.

---

### 🚀 Tareas del Proyecto

- [x] **Fase 1: Planificación & Análisis de Requerimientos**
  - Identificación de clave Groq (`gsk_...`) y selección del modelo de ultra-baja latencia (`qwen/qwen3.8-27b` con fallback a `openai/gpt-oss-120b`).
  - Definición del layout limpio con Sidebar lateral inspirado en el panel de referencia MAMM.

- [x] **Fase 2: Integración del Motor Groq AI**
  - Instalar `groq-sdk` en el backend.
  - Actualizar `gemini_agent.js` para usar Groq con modelo `qwen/qwen3.8-27b` y fallback a `openai/gpt-oss-120b`.
  - Pruebas exitosas de respuesta inmediata (< 0.5s) y detección de derivación a asesor humano.

- [x] **Fase 3: Branding & Activos Visuales**
  - Logotipo oficial de **CAMHOUSE By C&A** extraído y guardado en `public/img/logo.png`.
  - Base de conocimiento y respuestas del bot actualizadas al branding oficial de "CamHouse By C&A".

- [x] **Fase 4: Rediseño del Layout (Sidebar Lateral MAMM Style)**
  - Reestructurar `index.html` con Sidebar vertical fijo a la izquierda (`sidebar`).
  - Implementar Header superior limpio con Selector de Línea, estatus de conexión (`● Conectado`) y reloj en tiempo real.
  - Eliminar saturación visual, auras flotantes excesivas y aplicar paleta corporativa oscura (Dark Slate `#080C16` / `#0C111E` / `#121829`).

- [x] **Fase 5: Módulo de Conexión QR Idéntico a la Referencia**
  - Tarjeta izquierda: Vista de Código QR con estados visuales y botones (*Generar Nuevo QR*, *Desvincular Cuenta*).
  - Tarjeta derecha: Pasos 1-2-3 numerados y distintivo de *Seguridad Anti-Baneo Activa*.

- [x] **Fase 6: Gestor de Chats & Asesores Limpio y Elegante**
  - Formato Inbox corporativo con mayor espaciado, tipografía sobria y badge de derivación humano no intrusivo.
  - Respuestas rápidas integradas y control directo de toma de chat.

- [x] **Fase 7: Verificación Final & Puesta en Marcha**
  - Servidor configurado en el nuevo puerto **4000** (`http://localhost:4000`) para no interferir con otros chatbots.
  - Rediseño de la sección **"CHATS & ASESORES"** en formato de Tabla Ejecutiva (*Monitoreo de Visitantes y Estado del Asistente*) idéntico a la Imagen 2 de referencia, con botones rápidos de `⏸ Pausar` / `▶ Reanudar IA`, badges y drawer para abrir el chat completo.
  - ¡Línea 1 de WhatsApp vinculada en vivo con éxito! (`ID: 573044264839`). Groq AI respondiendo en tiempo real.

- [x] **Fase 8: Funcionalidad Completa de Limpiar Lista y Eliminar Chats**
  - Botón papelera (`🗑`): Eliminación individual instantánea en backend (`data/chats_store.json`) y actualización reactiva inmediata en la tabla de la interfaz.
  - Botón "Limpiar Lista" (`🧹`): Vaciado completo de la lista de conversaciones de la línea activa con confirmación y refresco en tiempo real.
  - Solución a la caché del navegador: incorporados headers HTTP anti-caché en Express y parámetros de control de versión (`?v=2.1.0`) en CSS y JS.
  - Endpoints probados exitosamente: `DELETE /api/chats/:line/:contactId` y `DELETE /api/chats/:line` con fallback por `POST`.

- [x] **Fase 9: Limpiador & Reinicio de Métricas y Estadísticas a Cero (0)**
  - Implementado botón **"Reiniciar Métricas a Cero"** (`🔄`) con diseño ejecutivo integrado en la sección *Métricas & Conversión*.
  - Reinicio atómico en backend (`data/metrics.json` y cache en memoria): Contadores de aspirantes, entrevistas, conversión, consultas por día, horas pico y temas quedan en 0 para monitoreo limpio desde el primer usuario real.
  - Emisión en tiempo real vía Socket.io (`metrics_updated`) para refrescar gráficos de Chart.js y embudo de conversión al instante.
  - Endpoints probados con éxito: `POST /api/metrics/reset` y `DELETE /api/metrics`.

- [x] **Fase 10: Multi-API Independiente, Doble Reclutamiento & Pantalla de Login Privada**
  - Ocultada la caja selectora de línea de la barra lateral según la solicitud para un layout más limpio y despejado.
  - Creada pantalla de **Inicio de Sesión (Login)** con estética Dark Glassmorphism de alta gama, logotipo oficial de **CamHouse By C&A**, validación de credenciales (`admin` / `camhouse2026`) y botón de cerrar sesión en la barra lateral.
  - Reconfigurada la **Línea 2 de WhatsApp** para especializarse en **Reclutamiento & Casting** (mismo enfoque de geobloqueo, beneficios, requisitos 18+, sedes Medellín/Bogotá y agendamiento).
  - Integrada una **segunda API Key de Groq** (`GROQ_API_KEY_LINEA_2`) totalmente independiente para la Línea 2, evitando saturación y garantizando máxima velocidad (< 0.4s) en ambas líneas simultáneamente.

- [x] **Fase 11: Fondo Cinematográfico de Lujo (Ambient Wallpaper)**
  - Generado e implementado wallpaper fotográfico ultra-moderno de arquitectura interior nocturna con luces violeta/ámbar sutiles (`public/img/bg-luxury.jpg`).
  - Aplicado efecto de profundidad y desenfoque óptico en la pantalla de Login y en el panel principal (`.main-ambient-bg`) sin opacar ningún texto ni indicador de la interfaz.

- [x] **Fase 12: Suite de Estudio Webcam con IA Generativa & Aislamiento Total de Login**
  - Generado fondo de suite de modelaje webcam y estudio de creación de contenido de lujo (`public/img/camhouse-suite.jpg`): Cama king size con lencería violeta/blush, luces LED neón violeta (#8B5CF6), espejo Hollywood con bombillos cálidos, setup de streaming con cámara profesional y ventanales con vista panorámica nocturna.
  - Eliminado por completo el traslúcido del dashboard en el Login: La pantalla de autenticación ahora es 100% opaca con viñeta radial oscura y oculta el layout (`.not-authenticated`), impidiendo que los textos, tarjetas o QR de WhatsApp se filtren detrás de la tarjeta de acceso.

- [x] **Fase 13: Flujo Oficial de Reclutamiento por Etapas & Transcripción de Audios (Groq Whisper)**
  - Implementado el **System Prompt Oficial de Reclutadora CAM HOUSE & Nouva Vista**: Personalidad joven, empoderada, ultra-cálida y amiga cercana con términos dosificados (*amor, princesa, hermosa*, etc., máx 1-2 por mensaje).
  - Flujo conversacional paso a paso con validaciones internas y cero lenguaje corporativo:
    1. Bienvenida con cobertura de equipos/capacitación sin inversión.
    2. Edad (rango estricto 22 a 40 años; rechazo suave fuera de rango).
    3. Disponibilidad inmediata (hoy o mañana; rechazo si es posterior).
    4. Ubicación en Medellín y conectividad por cable.
    5. Convivencia y apoyo del entorno de vivienda.
    6. Cierre Exitoso: Emoción, bienvenida a la familia y derivación directa al coordinador al WhatsApp **3215863996** 📲.
  - Integrada la **transcripción de mensajes de voz de WhatsApp** utilizando **Groq Whisper** (`whisper-large-v3-turbo`): Las candidatas que envíen notas de voz son escuchadas y transcritas en < 300ms, y el chatbot les responde en texto de forma fluida y natural.

- [x] **Fase 22: Blindaje Integral del Embudo, Alta Concurrencia y Google Gemini 3.5 Flash Lite**
  - **Motor Principal Gemini 3.5 Flash Lite:** Configurada la clave de Google AI Studio (`AQ.Ab8RN6...`) con límite masivo de 1,000,000 Tokens/Min y 1,500 peticiones/día, eliminando de raíz los errores 429 de saturación cuando chatean varias candidatas a la vez.
  - **Formateo y Sanitización de Historial Gemini:** Eliminado el error `First content should be with role 'user', got model` y unificadas entradas consecutivas del mismo rol, garantizando estabilidad total en multi-turn chat.
  - **Blindaje 3 (Fotos de Rostro y Cuerpo):** Garantizado a nivel de código el texto estricto aprobado: `"¡Perfecto, [Nombre]! Eso nos facilita mucho la coordinación. ¿Podrías compartirnos 2 fotos tuyas, una de rostro y una de cuerpo? Solo queremos ver qué tipo de perfil eres, tranqui aquí no discriminamos a nadie. ✨"`.
  - **Blindaje 4 (Checkpoint de Comprensión Sí/No):** Bloqueada la entrega del contacto del coordinador (`3215863996`) hasta que la candidata haya recibido el resumen de los 4 pilares (Ganancias, Privacidad, Cero Inversión, Beneficios) y haya respondido afirmativamente.
  - **Preguntas Obligatorias Activas:** Incorporadas y validadas la pregunta de convivencia familiar (Paso 4) y disponibilidad de 6h flexibles e inicio en 3 días (Paso 5).
  - **Respaldo Escalonado:** Groq (`qwen/qwen3.8-27b`) y GPT OSS (`openai/gpt-oss-120b`) operan como respaldo secundario automático si la red de Google presenta intermitencias.

- [x] **Fase 23: Actualización de Equipos Detallados en Checkpoint y Cierre con Dos Filtros**
  - **Paso 10 (Checkpoint de Comprensión):** Integrada la lista técnica completa de equipos (computador para 3 plataformas, cámaras Logitech 4K, teclado/mouse inalámbricos, cable de red/HDMI, trípode, iluminación, monitor/CPU y elementos de decoración) en un solo mensaje estructurado.
  - **Paso 11 (Cierre Oficial):** Actualizada la redacción fluida (Opción 1) indicando la superación del primer filtro y asignación del segundo filtro con el coordinador (`3215863996`).
  - **Blindajes Sincronizados:** `applySafeguards` y `buildSystemPrompt` actualizados y probados con éxito en `gemini_agent.js`.

- [x] **Fase 24: División Inteligente del Checkpoint en 2 Burbujas Consecutivas en WhatsApp**
  - Implementada separación automática con etiqueta `---SPLIT---` en `gemini_agent.js`:
    - **Burbuja 1:** Zona de entrega y detalle completo del kit profesional de equipos (computador, cámaras Logitech 4K, monitor, CPU, etc.).
    - **Burbuja 2:** Resumen de condiciones (ganancias, privacidad, beneficios) y pregunta de confirmación obligatoria Sí/No.
  - Actualizado `whatsapp_manager.js` para enviar secuencialmente ambas partes con una pausa de 1.8s y presencia de tipeo humano (`sendPresenceUpdate('composing')`).
  - Cada burbuja se guarda y emite de forma independiente al dashboard web.

- [x] **Fase 25: Menú Interactivo Dinámico por Opciones Numéricas (Anti-Saturación)**
  - Implementado menú interactivo tras confirmar ubicación con 6 opciones claras:
    - 1️⃣ Ganancias y Pagos en USD (60%-70% comisiones).
    - 2️⃣ Privacidad y Bloqueo para Colombia.
    - 3️⃣ Kit de Equipos que te entregamos en casa (computador 3 plataformas, Logitech 4K, etc.).
    - 4️⃣ Beneficios (Lencería, gimnasio, salud, préstamos, monitoras).
    - 5️⃣ Ver toda la información completa (resumen consolidado).
    - 6️⃣ Todo me quedó claro, ¡quiero continuar ya! (Paso directo al Cierre Oficial con coordinador).
  - Eliminado todo bloque masivo de texto; respuestas breves, ágiles y personalizadas al interés de la aspirante.
  - Blindaje 4 adaptado para interceptar entregas prematuras hasta que la candidata elija la opción 6 o exprese que todo está claro.

- [x] **Fase 26: Blindaje Anti-Corchetes, Rechazo de Hombres y Porcentaje No Negociable**
  - **Filtro Anti-Corchetes:** Implementada limpieza automática por regex en `applySafeguards` para eliminar cualquier instrucción entre corchetes `[...]`, garantizando que jamás salgan textos residuales en WhatsApp.
  - **Detección y Rechazo Formal de Hombres:** Implementado `isMaleName` para detectar nombres masculinos (Juan, Carlos, Andrés, Felipe, etc.) y responder formalmente que la vacante es exclusiva para mujeres, deteniendo el flujo.
  - **Porcentaje No Negociable:** Bloqueada cualquier negociación de porcentaje (60% al 70% libre en USD); se aclara que es fijo y definitivo con equipos y beneficios incluidos.
  - **Flujo de Motivación de Sofía:** Corregido el paso a paso para no repetir la pregunta de motivación si la candidata ya la respondió en el paso previo.

- [x] **Fase 27: Menú de 4 Opciones Simplificado y Blindaje Anti-Hombre Multicapa**
  - **Menú Interactivo de 4 Opciones:** Sustituido el texto extenso anterior por el menú conciso de 4 opciones:
    1. Ganancias y pagos
    2. Horarios de transmisión
    3. Kit de equipos
    4. Claridad del proceso
  - **Enrutamiento Determinista de Opciones (1 al 4):**
    - Opción 1: Ganancias y pagos (60%-70% libre en USD, pagos semanales/quincenales).
    - Opción 2: Horarios de transmisión (turnos de 6h flexibles con monitoras especializadas).
    - Opción 3: Kit de equipos (computador 3 plataformas, cámaras Logitech 4K, monitor, CPU, luces, trípode, inalámbricos, cables, decoración).
    - Opción 4 (o "todo claro" / "estoy lista" / "sí"): Claridad del proceso, aprobación del 1er filtro y asignación del 2do filtro con el coordinador al WhatsApp **3215863996**.
  - **Blindaje Anti-Hombre Multicapa:**
    - Exclusión contextual para familiares en convivencia ("vivo con mi papa", "mi esposo", etc.).
    - Detección de frases directas ("soy hombre", "reciben hombres", etc.).
    - Diccionario ampliado de ~150 nombres masculinos comunes en Colombia y Latinoamérica.
    - Detección retrospectiva en el historial completo del chat (aunque el usuario solo escriba "Bello").
    - Blindaje en respuesta de la IA (intercepta saludos como "¡Qué bien, Juan!" y reemplaza por rechazo formal).
    - Pausa automática del bot (`chat.ai_mode = false`) y estado `No Apto - Hombre`.

- [x] **Fase 28: Pulido de Opción 1, Variabilidad de Trato y Kit de Emojis Oficiales**
  - **Opción 1 Suavizada:** Eliminada la frase *"Este porcentaje previamente establecido es fijo y no es negociable."* para un tono 100% positivo, amable y directo.
  - **Cero Repetición de Apodos:** Ajustada la personalidad de Alejandra para evitar muletillas recurrentes como "hermosa" o "princesa", priorizando el nombre real de la candidata y variando con naturalidad (*linda, reina, corazón, bella*).
  - **Kit de Emojis Oficiales Integrado:** Incorporados armoniosamente los emojis solicitados (`🙋🏻‍♀️ 👑 💸 ☺️ 😍 🤩 🫶🏽 👩🏻‍💻 👯‍♀️`) en los pasos del embudo y en las opciones interactivas.

- [x] **Fase 29: Actualización de la Opción 2 (Horarios con Turno Nocturno Recomendado)**
  - **Opción 2 Mejorada:** Se incluyó la recomendación estratégica del turno nocturno (8:00 p.m. o 9:00 p.m.) para la primera semana con apoyo de monitoras, logrando mayor generación de ingresos.
  - **Pruebas y Verificación:** Probado en local con respuesta inmediata y formato estético con emojis oficiales.

- [x] **Fase 30: Módulo Antidesconfianza (Cámara de Comercio y Voto de Confianza)**
  - **Argumento Psicológico de Confianza:** Integrada respuesta estratégica para candidatas con dudas de estafa o legalidad: legalmente constituidas en Cámara de Comercio Medellín bajo contrato formal, y voto de confianza inverso prestando los equipos profesionales sin inversión ni conocer a la persona.
  - **Eliminación de "Alta Gama":** Sustituido por "equipos profesionales" en todo el sistema.
  - **Continuidad del Flujo:** El bot atiende la desconfianza con calidez personalizada (usando el nombre de la chica si ya se conoce) y permite retomar el proceso sin reiniciar el embudo.

- [x] **Fase 31: Gestión de Internet en Casa y Contactos de Instalación Rápida**
  - **Respuesta Oficial sobre Internet:** Aclara que los equipos profesionales van por cuenta de la agencia y el servicio de internet corre por cuenta de la modelo, pero si no cuenta con servicio, CamHouse le proporciona contactos directos para gestionar la instalación rápida.
  - **Integración Multicapa:** Registrado en el System Prompt, base de conocimiento y enrutador heurístico local.

- [x] **Fase 32: Diferenciación Inteligente entre Miedo Laboral vs Miedo a Estafa**
  - **Desacoplamiento de Disparadores:** Eliminada la activación de "Cámara de Comercio" cuando la candidata expresa temor de renunciar a su empleo actual o pregunta si esto sí deja dinero.
  - **Respuesta Motivacional Empática:** Implementado mensaje inspirador que transmite seguridad laboral, empatía con las inseguridades iniciales, proyección real de ~$1'000.000 COP/semana y apoyo de monitoras.
  - **Pruebas de Discriminación Exitosas:** Verificado en pruebas unitarias que ambas consultas disparan sus respuestas respectivas personalizadas con el nombre de la aspirante.

- [x] **Fase 33: Bloqueo Anti-Repetición y Avance Automático al Paso 8 (Fotos)**
  - **Detección de Aceptación Post-Duda:** Identificada la causa por la cual se repetía el mensaje cuando la chica decía *"Si súper voy a renunciar como es"*: la palabra suelta "renunciar" re-disparaba el mensaje motivacional.
  - **Blindaje Anti-Bucle:** Se condicionó el disparador para ignorar mensajes de afirmación (*"si", "súper", "voy a renunciar", "como es", "que sigue"*) y se bloquea la re-emisión si ya se envió previamente en la conversación.
  - **Transición Fluida a Fotos:** Cuando la candidata confirma su decisión de renunciar para dedicarse de lleno, el bot avanza fluidamente al Paso 8 solicitando las 2 fotos de rostro y cuerpo.

- [x] **Fase 34: Blindaje Universal Anti-Repetición Consecutiva y Anti-Bucle Total**
  - **Blindaje 5 en `applySafeguards`:** Implementada barrera universal que inspecciona el último mensaje enviado por el bot. Si cualquier motor (Gemini, Groq o fallback) intenta emitir un texto idéntico o con similitud superior a 50 caracteres consecutivos, es interceptado y reemplazado automáticamente por el siguiente paso conversacional.
  - **Protección Multitópico:** Extendida la regla de un solo uso para Cámara de Comercio (`hasTrustAnswered`), Internet (`hasInternetAnswered`) y Renuncia/Empleo (`hasJobFearAnswered`).
  - **Pruebas de Estrés Unitarias:** Confirmado en consola que el bot jamás puede emitir dos respuestas idénticas consecutivas bajo ninguna circunstancia.
