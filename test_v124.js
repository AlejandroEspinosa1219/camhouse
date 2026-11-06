const agent = require('./src/bot/gemini_agent');

async function runTests() {
  console.log('--- INICIANDO SUITE DE PRUEBAS DE ORO v1.2.4 ---');
  let passed = 0;
  let total = 0;

  function assert(condition, testName, details = '') {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} -> ${details}`);
    }
  }

  // 1. Prueba de Edad > 40 ("Soy mayor trngo 44")
  console.log('\n--- 1. Prueba Filtro Universal de Edad > 40 ---');
  const resAge44 = await agent.generateResponse('linea_reclutamiento', 'Soy mayor trngo 44', [], 'Isabel');
  assert(resAge44.isRejected === true, 'Edad 44 rechazada');
  assert(resAge44.rejectionStatus === 'Fuera de Rango de Edad', 'Status Fuera de Rango de Edad');
  assert(resAge44.text.includes('22 y 40 años'), 'Texto menciona rango 22 y 40 años');
  assert(!resAge44.text.toLowerCase().includes('edad ideal'), 'NO dice edad ideal a 44 años');

  // 2. Prueba de Edad < 22 ("tengo 19 años")
  console.log('\n--- 2. Prueba Filtro Universal de Edad < 22 ---');
  const resAge19 = await agent.generateResponse('linea_reclutamiento', 'Hola me llamo Ana y tengo 19 años', [], '');
  assert(resAge19.isRejected === true, 'Edad 19 rechazada');
  assert(resAge19.rejectionStatus === 'Fuera de Rango de Edad', 'Status Fuera de Rango de Edad para 19');

  // 3. Prueba Cobertura Bello ("Estoy en bello")
  console.log('\n--- 3. Prueba Cobertura Bello ---');
  const resBello = await agent.generateResponse('linea_reclutamiento', 'Estoy en bello', [
    { fromMe: false, text: 'Hola me llamo Camila' },
    { fromMe: true, text: '¡Mucho gusto Camila! ¿Dónde vives?' }
  ], 'Camila');
  assert(resBello.isRejected !== true, 'Bello NO es rechazado');
  assert(resBello.rejectionStatus !== 'Fuera de Cobertura', 'Bello no tiene status Fuera de Cobertura');

  // 4. Prueba Cobertura Itagüí
  console.log('\n--- 4. Prueba Cobertura Itagüí ---');
  const resItagui = await agent.generateResponse('linea_reclutamiento', 'Vivo en Itagüí', [], 'Camila');
  assert(resItagui.isRejected !== true, 'Itagüí NO es rechazado');

  // 5. Prueba Cobertura Caldas
  console.log('\n--- 5. Prueba Cobertura Caldas ---');
  const resCaldas = await agent.generateResponse('linea_reclutamiento', 'Vivo en Caldas', [], 'Camila');
  assert(resCaldas.isRejected !== true, 'Caldas NO es rechazado');

  // 6. Prueba Rechazo Ciudad Lejana (Bogotá)
  console.log('\n--- 6. Prueba Ciudad Lejana Bogotá ---');
  const resBogota = await agent.generateResponse('linea_reclutamiento', 'Vivo en Bogotá', [], 'Camila');
  assert(resBogota.isRejected === true, 'Bogotá es rechazado');
  assert(resBogota.rejectionStatus === 'Fuera de Cobertura', 'Status Bogotá Fuera de Cobertura');

  // 7. Prueba Convivencia Acompañada sin confirmar apoyo ("si cuento con el espacio y vivo con mi novio")
  console.log('\n--- 7. Prueba Convivencia Acompañada sin confirmar apoyo ---');
  const resNovio = await agent.generateResponse('linea_reclutamiento', 'si cuento con el espacio y vivo con mi novio', [
    { fromMe: false, text: 'necesito libertad financiera' },
    { fromMe: true, text: 'Ahora, ¿cuenta con un espacio privado en tu habitación para transmitir? Y, si no es indiscreción, ¿con quién vives? (sola, pareja, familiares, amigos, etc.)' }
  ], 'Marcela');
  assert(!resNovio.text.toLowerCase().includes('maravilla contar con ese apoyo'), 'NO asume que cuenta con apoyo');
  assert(!resNovio.text.toLowerCase().includes('disponibilidad para trabajar 6 horas'), 'NO salta a horarios antes de preguntar apoyo');
  assert(resNovio.text.toLowerCase().includes('apoya') || resNovio.text.toLowerCase().includes('apoyan'), 'Pregunta si la pareja o convivientes la apoyan');

  // 8. Prueba Convivencia Acompañada con rechazo explícito ("vivo con mi pareja pero a escondidas porque no me apoya")
  console.log('\n--- 8. Prueba Convivencia Acompañada con rechazo ---');
  const resNoApoyo = await agent.generateResponse('linea_reclutamiento', 'vivo con mi novio pero no me apoya, sería a escondidas', [
    { fromMe: true, text: '¿tu pareja sabe y te apoya con que trabajes como modelo webcam?' }
  ], 'Marcela');
  assert(resNoApoyo.isRejected === true, 'Convivencia sin apoyo rechazada');
  assert(resNoApoyo.rejectionStatus === 'No Apta - Convivencia sin apoyo', 'Status No Apta - Convivencia sin apoyo');

  console.log(`\n========================================`);
  console.log(`RESULTADO FINAL: ${passed}/${total} pruebas pasadas (${Math.round((passed/total)*100)}%)`);
  console.log(`========================================`);
  process.exit(passed === total ? 0 : 1);
}

runTests().catch(err => {
  console.error('Error fatal ejecutando pruebas:', err);
  process.exit(1);
});
