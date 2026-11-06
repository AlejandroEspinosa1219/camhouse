const geminiAgent = require('./src/bot/gemini_agent');
const whatsappManager = require('./src/bot/whatsapp_manager');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 INICIANDO SUITE DE TESTS AUTOMATIZADOS v1.2.0');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  // TEST 1: NOMBRES PROPIOS & BLACKLIST
  console.log('--- TEST SUITE 1: Extracción de Nombres y Blacklist ---');
  {
    const nameSoltera = geminiAgent.extractCandidateName('Hola soy soltera');
    assert(nameSoltera === 'linda', '"soy soltera" NO debe extraerse como nombre (debe ser linda)');

    const nameCasada = geminiAgent.extractCandidateName('Hola buenas soy casada');
    assert(nameCasada === 'linda', '"soy casada" NO debe ser nombre');

    const nameMama = geminiAgent.extractCandidateName('Hola soy mama de dos hijos');
    assert(nameMama === 'linda', '"soy mama" NO debe ser nombre');

    const nameEstudiante = geminiAgent.extractCandidateName('Buenas tardes soy estudiante');
    assert(nameEstudiante === 'linda', '"soy estudiante" NO debe ser nombre');

    const nameReal = geminiAgent.extractCandidateName('Hola, me llamo Camila');
    assert(nameReal === 'Camila', '"me llamo Camila" debe extraerse como "Camila"');

    const nameComplex = geminiAgent.extractCandidateName('Hola soy soltera, me llamo Valentina');
    assert(nameComplex === 'Valentina', '"soy soltera, me llamo Valentina" extrae "Valentina"');
  }

  // TEST 2: FILTRO ESTRICTO DE HOMBRES
  console.log('\n--- TEST SUITE 2: Detección y Filtro de Hombres ---');
  {
    const maleSoltero = geminiAgent.detectMale('Hola soy soltero tengo 25 años');
    assert(maleSoltero !== null, '"soy soltero" debe ser detectado como hombre');

    const maleHombre = geminiAgent.detectMale('Un hombre puede trabajar?');
    assert(maleHombre !== null, '"Un hombre puede trabajar?" debe ser detectado como hombre');

    const maleVaron = geminiAgent.detectMale('Reciben varones?');
    assert(maleVaron !== null, '"Reciben varones?" debe ser detectado como hombre');

    const maleJesus = geminiAgent.detectMale('si me interesa, mi nombre es jesus');
    assert(maleJesus === 'Jesus', '"si me interesa, mi nombre es jesus" debe ser detectado como Jesus');

    const maleName = geminiAgent.detectMale('Me llamo Carlos Andrés');
    assert(maleName === 'Carlos', '"Me llamo Carlos Andrés" debe ser detectado como Carlos');

    const resJesus = await geminiAgent.generateResponse('linea_reclutamiento', 'si me interesa, mi nombre es jesus');
    assert(resJesus.isRejected === true && resJesus.rejectionStatus === 'No Apto - Hombre', 'Respuesta para "jesus" es rechazo formal');
    assert(resJesus.text.includes('Hola, Jesus.'), 'Respuesta para "jesus" saluda como Jesus en el rechazo');

    // Convivencia de mujer con hombre NO debe ser detectada como hombre
    const femaleWithHusband = geminiAgent.detectMale('vivo con mi novio Carlos');
    assert(femaleWithHusband === null, '"vivo con mi novio Carlos" NO debe ser detectada como hombre');

    // Respuesta completa de generateResponse para hombre
    const resMale = await geminiAgent.generateResponse('linea_reclutamiento', 'Hola soy soltero y busco trabajo');
    assert(resMale.isRejected === true && resMale.rejectionStatus === 'No Apto - Hombre', 'Respuesta para "soy soltero" es rechazo formal');
    assert(resMale.text.includes('exclusivamente a mujeres'), 'Texto de rechazo para hombre menciona exclusividad para mujeres');
  }

  // TEST 3: BIENVENIDA Y CADENCIA
  console.log('\n--- TEST SUITE 3: Bienvenida Institucional ---');
  {
    const resFirstContact = await geminiAgent.generateResponse('linea_reclutamiento', 'Hola');
    assert(resFirstContact.text.includes('Soy Alejandra de CamHouse'), 'Primer contacto recibe saludo oficial de bienvenida');
    assert(resFirstContact.text.includes('¿Y cómo es tu nombre?'), 'Primer contacto solicita nombre');

    const resWithNameAndAge = await geminiAgent.generateResponse('linea_reclutamiento', 'Hola soy Tatiana tengo 24 años');
    assert(resWithNameAndAge.text.includes('Tatiana'), 'Entrada con nombre lo reconoce de inmediato');
    assert(!resWithNameAndAge.text.includes('¿Y cómo es tu nombre?'), 'No vuelve a preguntar el nombre si ya lo dio');
  }

  // TEST 4: FILTRO DE CONVIVENCIA Y PRIVACIDAD (PASO 4)
  console.log('\n--- TEST SUITE 4: Filtro de Convivencia y Privacidad (Paso 4) ---');
  {
    const histLiving = [
      { fromMe: false, text: 'Hola soy Mariana tengo 25 años' },
      { fromMe: true, text: '¡Mucho gusto, Mariana! Cuéntame con quién vives y si tienes tu espacio privado.' }
    ];

    // Caso A: Vive acompañada y NO saben / secreto
    const resNoSaben = await geminiAgent.generateResponse('linea_reclutamiento', 'vivo con mi novio pero él no sabe nada, es en secreto', histLiving, 'Mariana');
    assert(resNoSaben.isRejected === true && resNoSaben.rejectionStatus === 'No Apta - Convivencia sin apoyo', 'Convivencia oculta es rechazada de inmediato');
    assert(resNoSaben.text.includes('pleno conocimiento y apoyo'), 'Despedida menciona requisito de pleno conocimiento y apoyo');

    // Caso B: Vive con padres y no están de acuerdo
    const resNoApoyan = await geminiAgent.generateResponse('linea_reclutamiento', 'vivo con mis papás pero no están de acuerdo', histLiving, 'Mariana');
    assert(resNoApoyan.isRejected === true && resNoApoyan.rejectionStatus === 'No Apta - Convivencia sin apoyo', 'Convivencia sin acuerdo es rechazada de inmediato');

    // Caso C: Vive sola
    const resSola = await geminiAgent.generateResponse('linea_reclutamiento', 'vivo sola en mi apartamento', histLiving, 'Mariana');
    assert(resSola.isRejected !== true, 'Vivir sola es aceptado');
  }

  // TEST 5: COBERTURA OFICIAL PARA PRÉSTAMO DE EQUIPOS (PASO 8)
  console.log('\n--- TEST SUITE 5: Cobertura Oficial (8 Zonas) ---');
  {
    const histLocation = [
      { fromMe: false, text: 'Hola soy Camila' },
      { fromMe: true, text: 'Camila, en qué sector vives para la entrega de equipos?' }
    ];

    // Zonas Aceptadas (Medellín, San Antonio de Prado, Sabaneta, Envigado, Copacabana, Girardota, Barbosa, La Estrella)
    const allowed = ['Medellín', 'San Antonio de Prado', 'Sabaneta', 'Envigado', 'Copacabana', 'Girardota', 'Barbosa', 'La Estrella'];
    for (const city of allowed) {
      const resCity = await geminiAgent.generateResponse('linea_reclutamiento', `Vivo en ${city}`, histLocation, 'Camila');
      assert(resCity.isRejected !== true, `Municipio oficial "${city}" está dentro de cobertura`);
    }

    // Zonas Excluidas (Bello, Itagüí, Caldas, Bogotá, Cali)
    const excluded = ['Bello', 'Itagüí', 'Caldas', 'Bogotá', 'Cali'];
    for (const city of excluded) {
      const resCity = await geminiAgent.generateResponse('linea_reclutamiento', `Vivo en ${city}`, histLocation, 'Camila');
      assert(resCity.isRejected === true && resCity.rejectionStatus === 'Fuera de Cobertura', `Municipio no autorizado "${city}" es rechazado por falta de cobertura`);
      assert(resCity.text.includes('San Antonio de Prado, Sabaneta, Envigado'), `Respuesta fuera de cobertura enumera los municipios autorizados`);
    }
  }

  // TEST 6: MENÚ DE 4 OPCIONES CONVERSACIONAL
  console.log('\n--- TEST SUITE 6: Menú de 4 Opciones Conversacional ---');
  {
    const histMenu = [
      { fromMe: false, text: 'Hola soy Sofía tengo 23 años' },
      { fromMe: true, text: '¡Mucho gusto, Sofía! Para que tengas total claridad, dime sobre cuál tema te gustaría más info: 1. Ganancias y pagos, 2. Horarios, 3. Kit de equipos, 4. Claridad del proceso.' }
    ];

    const resOpt1 = await geminiAgent.generateResponse('linea_reclutamiento', '1', histMenu, 'Sofía');
    assert(resOpt1.text.includes('60%') && (resOpt1.text.includes('70%') || resOpt1.text.includes('USD')), 'Opción 1 entrega detalle de Ganancias');

    const resOpt2 = await geminiAgent.generateResponse('linea_reclutamiento', '2', histMenu, 'Sofía');
    assert(resOpt2.text.includes('noche') || resOpt2.text.includes('flexibles') || resOpt2.text.includes('6 horas'), 'Opción 2 entrega Horarios y Recomendación Estrella');

    const resOpt3 = await geminiAgent.generateResponse('linea_reclutamiento', '3', histMenu, 'Sofía');
    assert(resOpt3.text.includes('equipos') && resOpt3.text.includes('casa'), 'Opción 3 entrega Kit de Equipos');

    const resOpt4 = await geminiAgent.generateResponse('linea_reclutamiento', '4', histMenu, 'Sofía');
    assert(resOpt4.text.includes('proceso') || resOpt4.text.includes('fotos'), 'Opción 4 entrega Claridad del Proceso');
  }

  // TEST 7: WATCHDOG 24/7 ANTI-CAÍDAS
  console.log('\n--- TEST SUITE 7: Vigilante 24/7 Anti-Caídas (Watchdog) ---');
  {
    assert(typeof whatsappManager.startWatchdog === 'function', 'Función startWatchdog existe en WhatsAppManager');
    assert(whatsappManager.watchdogInterval !== null, 'Intervalo de Watchdog 24/7 está activo y corriendo');
    
    // Ejecutar chequeo preventivo de salud
    let watchdogError = null;
    try {
      await whatsappManager.checkSocketsHealth();
    } catch (e) {
      watchdogError = e;
    }
    assert(watchdogError === null, 'checkSocketsHealth ejecuta sin errores');
  }

  console.log('\n====================================================');
  console.log(`📊 RESULTADOS DE LA SUITE DE PRUEBAS:`);
  console.log(`   Superadas: ${passed}`);
  console.log(`   Falladas:  ${failed}`);
  console.log('====================================================\n');

  if (failed === 0) {
    console.log('🎉 ¡TODOS LOS TESTS PASARON EXITOSAMENTE AL 100%! 🚀\n');
    process.exit(0);
  } else {
    console.error('⚠️ ALGUNOS TESTS FALLARON. REVISAR SALIDA ARRIBA.\n');
    process.exit(1);
  }
}

runTests();
