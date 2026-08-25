/* =============================================================================
   Prueba en vivo: ¿el tutor acepta una respuesta equivalente y se baja del burro?
   =============================================================================
   Las pruebas de `equivalencia.test.mjs` comprueban el banco y que las reglas
   viajen en el system prompt. Esto comprueba lo otro: qué contesta el modelo.
   Necesita un Worker corriendo y con ANTHROPIC_API_KEY configurada, así que no
   entra en `node --test`: se corre a mano.

     node worker/tests/live.mjs                       # contra wrangler dev
     node worker/tests/live.mjs --url https://agentedestudio.<cuenta>.workers.dev

   Dos escenarios, los dos sacados del caso real que originó el cambio:

   1. EQUIVALENTE — el profesor pidió el límite de (x^2-1)/(x-1) y el alumno
      responde "x + 1" porque factorizó y simplificó. El tutor no puede marcarlo
      como incorrecto.
   2. IMPUGNACIÓN — el tutor ya dijo que estaba mal y el alumno le explica el
      procedimiento por segunda vez. El tutor tiene que reconocer que el alumno
      tiene razón y seguir, no repetir la corrección.

   El veredicto automático es por marcas de texto y puede equivocarse: por eso
   imprime la respuesta completa. Lo que decide es leerla.
   ============================================================================= */

const args = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf(nombre);
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
};

const URL_WORKER = opcion('--url', 'http://localhost:8787').replace(/\/+$/, '');
const ORIGEN     = opcion('--origin', URL_WORKER.includes('localhost')
  ? 'http://localhost:8000'
  : 'https://granizovicente6-blip.github.io');

const RECHAZO = [
  'no es correcto', 'no es correcta', 'incorrecto', 'incorrecta', 'está mal',
  'esta mal', 'te equivocaste', 'no es lo que', 'revisa tu', 'vuelve a intentarlo'
];
const ACEPTACION = [
  'correcto', 'correcta', 'bien', 'equivalente', 'tienes razón', 'tienes toda la razón',
  'exacto', 'así es'
];

function marcas(texto, lista){
  const t = texto.toLowerCase();
  return lista.filter(m => t.includes(m));
}

async function pedir(cuerpo){
  const res = await fetch(`${URL_WORKER}/api/study-session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGEN },
    body: JSON.stringify(cuerpo)
  });
  const texto = await res.text();
  let datos;
  try{ datos = JSON.parse(texto); }
  catch(e){ datos = { error: texto.slice(0, 300) }; }
  return { status: res.status, datos };
}

const ENUNCIADO = 'Calcula el límite de f(x) = (x^2 - 1)/(x - 1) cuando x tiende a 1. ' +
                  'Primer paso: simplifica la expresión antes de reemplazar.';

const BASE = {
  topicTitle: 'Límites y continuidad',
  course: 'Cálculo I',
  currentPhase: 'practica',
  sessionIndex: 2,
  totalSessions: 3
};

const ESCENARIOS = [
  {
    id: 'respuesta-equivalente',
    descripcion: 'El alumno simplifica la fracción y responde x + 1',
    esperado: 'que lo dé por correcto',
    cuerpo: {
      ...BASE,
      history: [{ role: 'assistant', content: ENUNCIADO, phase: 'practica' }],
      userResponse: 'Factoricé el numerador: x^2 - 1 = (x+1)(x-1). Simplifico el (x-1) con el denominador y me queda x + 1.'
    }
  },
  {
    id: 'alumno-insiste',
    descripcion: 'El tutor ya lo rechazó y el alumno le explica el procedimiento otra vez',
    esperado: 'que reconozca el error y avance',
    cuerpo: {
      ...BASE,
      history: [
        { role: 'assistant', content: ENUNCIADO, phase: 'practica' },
        { role: 'user', content: 'Simplifiqué y me queda x + 1.', phase: 'practica' },
        { role: 'assistant', content: 'No, eso no es correcto. La expresión que buscamos es (x^2 - 1)/(x - 1). Revisa tu simplificación.', phase: 'practica' },
        { role: 'user', content: 'Pero es lo mismo: x^2 - 1 es (x+1)(x-1), y al dividir por (x-1) queda x+1 para todo x distinto de 1.', phase: 'practica' },
        { role: 'assistant', content: 'Insisto en que la expresión no es x + 1. Vuelve a revisar el paso.', phase: 'practica' }
      ],
      userResponse: 'Te lo compruebo con un número: en x = 3, (9-1)/(3-1) = 4, y 3+1 = 4. Son la misma expresión. ¿Dónde estaría el error?'
    }
  }
];

let fallos = 0;

for(const escenario of ESCENARIOS){
  console.log(`\n=== ${escenario.id} — ${escenario.descripcion}`);
  console.log(`    Se espera ${escenario.esperado}.`);

  const { status, datos } = await pedir(escenario.cuerpo);
  if(status !== 200){
    console.log(`    ✖ El Worker respondió ${status}: ${datos.error || ''}`);
    if(status === 500) console.log('      (¿Falta ANTHROPIC_API_KEY en el Worker?)');
    fallos++;
    continue;
  }

  const respuesta = String(datos.reply || '');
  const rechazos  = marcas(respuesta, RECHAZO);
  const aceptaciones = marcas(respuesta, ACEPTACION);
  const ok = rechazos.length === 0 && aceptaciones.length > 0;

  console.log('    ---------------- respuesta del tutor ----------------');
  console.log(respuesta.split('\n').map(l => '    ' + l).join('\n'));
  console.log('    -----------------------------------------------------');
  console.log(`    marcas de rechazo: ${rechazos.length ? rechazos.join(', ') : 'ninguna'}`);
  console.log(`    marcas de aceptación: ${aceptaciones.length ? aceptaciones.join(', ') : 'ninguna'}`);
  console.log(ok ? '    ✔ acepta la respuesta del alumno' : '    ✖ revisar: parece que la rechaza');
  if(!ok) fallos++;
}

console.log(`\n${fallos === 0 ? 'Los dos escenarios pasaron.' : fallos + ' escenario(s) para revisar a mano.'}`);
process.exit(fallos === 0 ? 0 : 1);
