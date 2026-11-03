# 👑 Velvet Studios Enterprise — Dual WhatsApp & AI Control Hub

Plataforma empresarial de nivel de producción desarrollada para la gestión integral de un **Estudio de Transmisión Webcam / Agencia de Creadoras de Contenido**, con soporte multisesión independiente para **2 líneas de WhatsApp** y un **Panel de Control Web Interactivo (SPA)** de diseño moderno en Dark Glassmorphism.

---

## 🌟 Características Principales

### 📱 1. Arquitectura Multi-Sesión Baileys (`@whiskeysockets/baileys`)
- **Línea 1 — Reclutamiento & Nuevas Aspirantes**:
  - Carpeta de sesión: `./auth_sessions/linea_reclutamiento`
  - Orientación a aspirantes, resolución de dudas sobre requisitos, equipamiento 4K, porcentajes de ganancia (Presencial vs. Satélite), geobloqueo y agendamiento de casting.
- **Línea 2 — Administración & Modelos Activas**:
  - Carpeta de sesión: `./auth_sessions/linea_administracion`
  - Soporte interno para modelos vinculadas: cortes y liquidación de pagos, turnos, insumos de habitación (lencería, iluminación) y soporte técnico de salas.
- **Transmisión de Código QR en Vivo**: Renderizado directo en formato DataURL a través de WebSockets (Socket.IO) con estado de conexión en tiempo real (`Conectando`, `Esperando QR`, `Conectado`).

### 🤖 2. Cerebro de Inteligencia Artificial (Google Gemini 1.5 Flash)
- **Tono Profesional y Empático**: Comunicación cálida, respetuosa, libre de prejuicios y que transmite absoluta tranquilidad y seguridad.
- **Énfasis en Privacidad y Geobloqueo**: Explicación detallada del bloqueo regional de transmisiones para evitar visibilidad en Colombia / país de origen.
- **Detección Automática de Derivación (Human Handoff)**:
  - Cuando una aspirante expresa intención de agendar cita o hablar con alguien (*"quiero agendar entrevista"*, *"hablar con alguien"*, *"asesor humano"*):
    1. El bot pausa automáticamente las auto-respuestas para ese contacto (`ai_mode: false`).
    2. Se emite una alerta prioritaria en el Panel de Control Web con sonido de notificación.
    3. El chat se marca con la etiqueta `🚨 Asesor Requerido / Entrevista Solicitada`.
- **Motor Dual Gemini + Fallback Heurístico**: Opera fluidamente con la clave de Google Gemini o con su motor semántico de respaldo local en caso de desconexión o cuota.

### 💻 3. Panel de Control Web (SPA - Single Page Application)
- **Estilo Visual Dark Glassmorphism**:
  - Tonos: Violeta Neón (`#8B5CF6`), Fucsia sutil (`#D946EF`), esmeralda de actividad (`#10B981`) y fondo negro azabache (`#080612`).
  - Tarjetas con desenfoque de cristal (`backdrop-filter: blur(20px)`), auras de neón ambientales y microinteracciones de alta gama.
- **Selector Rápido de Líneas**: Alterna en un clic entre la Línea 1 y la Línea 2 con filtrado automático de chats, métricas y estado QR.
- **Gestor de Chats en Tiempo Real**:
  - Lista de conversaciones con filtrado por etiquetas (`Todos`, `Asesor Requerido`, `Modo IA`, `Manual`).
  - Interruptor directo `[🤖 Modo IA Auto-Respuesta] <--> [👤 Tomar Chat Manual]`.
  - Envío de mensajes manuales desde la web hacia WhatsApp.
  - Barra de accesos rápidos con plantillas frecuentes (*Agendar Entrevista*, *Geobloqueo*, *Porcentajes*, *Sedes*).
- **Editor de Base de Conocimiento en Vivo**:
  - Permite modificar porcentajes de pago, sedes, turnos, geobloqueo y FAQs desde el navegador.
  - Guarda los cambios inmediatamente en memoria para que el agente IA los use en la siguiente interacción sin reiniciar el servidor.
- **Módulo de Métricas & Analítica (Chart.js)**:
  - Consultas y entrevistas agendadas por día de la semana.
  - Gráfico de horas pico con mayor afluencia de aspirantes.
  - Distribución de temas de mayor consulta y embudo de conversión de talento.
- **Simulador Interactivo**:
  - Permite probar el cerebro de IA y las derivaciones directamente en pantalla sin requerir un teléfono físico conectado.

---

## 🗂️ Estructura del Proyecto

```
camhouse/
├── auth_sessions/
│   ├── linea_reclutamiento/     # Sesión MultiFileAuthState Línea 1
│   └── linea_administracion/    # Sesión MultiFileAuthState Línea 2
├── data/
│   ├── knowledge_base.json      # Base de conocimiento viva (editable desde UI)
│   ├── chats_store.json         # Almacén local de chats y mensajes
│   └── metrics.json             # Estadísticas históricas y de rendimiento
├── public/
│   ├── css/
│   │   └── style.css            # Estilos Dark Glassmorphism, Violeta Neón y Fucsia
│   ├── js/
│   │   ├── app.js               # Controlador SPA, Socket.io y lógica de chats
│   │   └── charts.js            # Visualización interactiva con Chart.js
│   └── index.html               # Interfaz principal de la plataforma
├── src/
│   ├── bot/
│   │   ├── gemini_agent.js      # Agente Gemini 1.5 Flash, prompts y detección de derivación
│   │   └── whatsapp_manager.js  # Gestor multi-sesión Baileys v7 y eventos
│   ├── services/
│   │   ├── storage.js           # Servicio de persistencia y base de datos local
│   │   └── metrics_service.js   # Registro de métricas e interacciones
│   ├── config.js                # Variables de entorno y rutas
│   └── server.js                # Servidor Express & WebSockets (Socket.IO)
├── .env.example
├── .env
├── package.json
└── README.md
```

---

## 🚀 Instalación y Puesta en Marcha

### 1. Requisitos Previos
- **Node.js**: v18.0.0 o superior (Verificado en Node v24).
- **NPM**: v9 o superior.

### 2. Instalación de Dependencias
```bash
npm install
```

### 3. Configuración de Variables de Entorno (`.env`)
El archivo `.env` ya se encuentra preconfigurado:
```env
PORT=3000
NODE_ENV=development
GEMINI_API_KEY=tu_api_key_aqui  # Opcional (o configurable desde el panel web)
GEMINI_MODEL=gemini-1.5-flash
```

### 4. Iniciar la Plataforma
```bash
npm start
```
O en modo de desarrollo con recarga automática:
```bash
npm run dev
```

El servidor iniciará en: **`http://localhost:3000`**

---

## 📱 Vinculación de WhatsApp (Paso a Paso)

1. Abre el navegador e ingresa a `http://localhost:3000`.
2. Dirígete a la pestaña **"Conexión QR"**.
3. Abre WhatsApp en el celular correspondiente a la **Línea 1 (Reclutamiento)** o **Línea 2 (Administración)**.
4. Ingresa a **Ajustes > Dispositivos Vinculados > Vincular un dispositivo**.
5. Escanea el código QR que se visualiza en la tarjeta correspondiente.
6. ¡Listo! La sesión quedará guardada de forma permanente en `./auth_sessions/`.

---

## 🧪 Pruebas Rápidas con el Simulador Integrado

Si deseas probar el comportamiento del bot y la derivación humana sin escanear un WhatsApp real:
1. En el panel superior, haz clic en la pestaña **"Simulador de Pruebas"**.
2. Utiliza los botones de prueba rápida como:
   - *¿Cómo funciona el tema de la privacidad y el geobloqueo?*
   - *¿Cuáles son los requisitos y documentos necesarios?*
   - *¿Cuánto puedo ganar y cómo son los porcentajes?*
   - *Quiero agendar una entrevista presencial* (Disparará la derivación, pausará el bot y emitirá la alerta).
3. Observa cómo el chat se sincroniza en vivo en el gestor de chats con su etiqueta de derivación.
