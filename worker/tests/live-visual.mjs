/* =============================================================================
   Prueba en vivo: ¿la fase 1 llega siempre con figura, y se dibuja?
   =============================================================================
   `apoyo-visual.test.mjs` comprueba que la exigencia viaje en el system prompt y
   que el parser del navegador dibuje lo que corresponde. Esto comprueba lo que
   ninguna de las dos puede: qué escribe de verdad el modelo cuando se le abre la
   fase 1. Necesita un Worker corriendo y con ANTHROPIC_API_KEY configurada, así
   que no entra en `node --test`: se corre a mano.

     node worker/tests/live-visual.mjs                       # contra wrangler dev
     node worker/tests/live-visual.mjs --url https://agentedestudio.<cuenta>.workers.dev

   Se abre la fase 1 de varios temas a propósito distintos —cuantitativos,
   contables y uno puramente conceptual, que es donde el modelo se tentaba con
   entregar tres párrafos de texto— y de cada respuesta se comprueban dos cosas:

   1. Que traiga al menos un bloque visual: ```grafico, ```mermaid o una tabla.
   2. Que ese bloque lo dibuje el parser de app.js. Un bloque con la sintaxis mal
      escrita se ve como texto suelto en la pantalla del alumno, así que para
      efectos de la regla es lo mismo que no haberlo puesto.

   El parser se carga del propio app.js, recortando el tramo de las figuras: es
   exactamente el mismo código que corre en el navegador.
   ============================================================================= */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf(nombre);
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
};

const URL_WORKER = opcion('--url', 'http://localhost:8787').replace(/\/+$/, '');
const ORIGEN     = opcion('--origin', URL_WORKER.includes('localhost')
  ? 'http://localhost:8000'
  : 'https://granizovicente6-blip.github.io');

const CERCA = '`'.repeat(3);

/* --- El parser de figuras, sacado de app.js -------------------------------- */

function cargarParserDeFiguras(){
  const ruta = fileURLToPath(new URL('../../app.js', import.meta.url));
  const src = readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');

  const markdown = src.indexOf('/* --- Markdown del chat, con figuras');
  const fin      = src.indexOf('/* --- Llamada al Worker', markdown);
  if(markdown < 0 || fin < markdown){
    throw new Error('app.js movió las secciones de figuras: hay que rehacer el recorte');
  }

  const escapeHtml = [
    'function escapeHtml(s){',
    '  return String(s).replace(/[&<>"\']/g, c =>',
    '    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", \'"\':"&quot;", "\'":"&#39;" }[c]));',
    '}'
  ].join('\n');

  return new Function(
    `${escapeHtml}\n${src.slice(markdown, fin)}\n` +
    'return { chatMarkdownToHtml };'
  )();
}

const FIG = cargarParserDeFiguras();

/* --- Qué se le pide al Worker ---------------------------------------------- */

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

// Temas elegidos por lo que ponen a prueba, no por variedad: el primero pide
// gráfico casi solo, el segundo una tabla, y el tercero es el caso difícil —no
// hay nada que dibujar en ejes, así que o sale un diagrama o sale texto puro—.
const ESCENARIOS = [
  {
    id: 'micro-cuantitativo',
    descripcion: 'Un tema que se ve en el plano: debería salir un gráfico',
    topicTitle: 'Equilibrio de mercado: oferta, demanda y excedentes',
    course: 'Microeconomía',
    topicData: { relevance: 'Alta', type: 'Cuantitativo', level: 'Medio' }
  },
  {
    id: 'contable-comparativo',
    descripcion: 'Un tema de clasificación: debería salir una tabla o un esquema',
    topicTitle: 'Clasificación de cuentas: activos, pasivos y patrimonio',
    course: 'Contabilidad I',
    topicData: { relevance: 'Alta', type: 'Teórico', level: 'Alto' }
  },
  {
    id: 'conceptual-sin-ejes',
    descripcion: 'El caso difícil: nada que graficar, así que toca diagrama o tabla',
    topicTitle: 'Fallas de mercado y externalidades: por qué el Estado interviene',
    course: 'Economía',
    topicData: { relevance: 'Media', type: 'Teórico', level: 'Medio' }
  },
  {
    id: 'financiero-proceso',
    descripcion: 'Un procedimiento con pasos: debería salir un diagrama de flujo',
    topicTitle: 'Evaluación de proyectos: VAN, TIR y criterio de decisión',
    course: 'Finanzas',
    topicData: { relevance: 'Alta', type: 'Aplicación', level: 'Medio' }
  }
];

/* --- Qué se mira en la respuesta ------------------------------------------- */

// Los bloques tal como los escribe el modelo, antes de dibujarlos.
function bloquesDeclarados(texto){
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n');
  const out = { grafico: 0, mermaid: 0, tabla: 0, otros: 0 };
  let filasSeguidas = 0;

  for(let i = 0; i < lineas.length; i++){
    const cerca = lineas[i].match(/^\s*```+\s*([A-Za-zÀ-ÿ0-9_-]*)/);
    if(cerca){
      const lang = cerca[1].toLowerCase();
      if(/^(grafico|gráfico|chart|plot|grafica|gráfica)$/.test(lang)) out.grafico++;
      else if(/^(mermaid|diagrama|diagram|flowchart|graph)$/.test(lang)) out.mermaid++;
      else out.otros++;
      i++;
      while(i < lineas.length && !/^\s*```/.test(lineas[i])) i++;
      filasSeguidas = 0;
      continue;
    }
    if(/^\s*\|.*\|/.test(lineas[i])){
      filasSeguidas++;
      if(filasSeguidas === 2) out.tabla++;      // encabezado + separador: es tabla
    }else{
      filasSeguidas = 0;
    }
  }
  return out;
}

// Y lo que de verdad se dibuja en la pantalla del alumno.
function loQueSeDibuja(texto){
  const html = FIG.chatMarkdownToHtml(texto);
  return {
    svg:   (html.match(/<svg/g) || []).length,
    tabla: (html.match(/<table/g) || []).length,
    pre:   (html.match(/<pre/g) || []).length,
    cercaALaVista: html.includes(CERCA)
  };
}

/* --- Corrida --------------------------------------------------------------- */

console.log(`Worker: ${URL_WORKER}`);
console.log(`Origen: ${ORIGEN}\n`);

let fallos = 0;

for(const escenario of ESCENARIOS){
  console.log(`=== ${escenario.id} — ${escenario.descripcion}`);
  console.log(`    Tema: ${escenario.topicTitle} (${escenario.course})`);

  const { status, datos } = await pedir({
    topicTitle: escenario.topicTitle,
    course: escenario.course,
    topicData: escenario.topicData,
    currentPhase: 'teoria',
    sessionIndex: 1,
    totalSessions: 2,
    sessionMinutes: 40
  });

  if(status !== 200){
    console.log(`    ✖ El Worker respondió ${status}: ${datos.error || ''}`);
    if(status === 500) console.log('      (¿Falta ANTHROPIC_API_KEY en el Worker?)');
    fallos++;
    console.log('');
    continue;
  }

  const respuesta = String(datos.reply || '');
  const decl = bloquesDeclarados(respuesta);
  const pint = loQueSeDibuja(respuesta);

  console.log('    ---------------- respuesta del tutor ----------------');
  console.log(respuesta.split('\n').map(l => '    ' + l).join('\n'));
  console.log('    -----------------------------------------------------');
  console.log(`    escritos:  grafico=${decl.grafico} mermaid=${decl.mermaid} ` +
              `tabla=${decl.tabla} otras cercas=${decl.otros}`);
  console.log(`    dibujados: svg=${pint.svg} tabla=${pint.tabla} ` +
              `bloque de texto=${pint.pre}`);

  const declarados = decl.grafico + decl.mermaid + decl.tabla;
  const dibujados  = pint.svg + pint.tabla;

  if(declarados === 0){
    console.log('    ✖ la fase 1 llegó como texto puro: la regla obligatoria no se cumplió');
    fallos++;
  }else if(dibujados === 0){
    console.log('    ✖ trae bloque visual pero el parser no lo dibuja: revisar la sintaxis');
    fallos++;
  }else if(pint.cercaALaVista){
    console.log('    ✖ quedaron cercas de tres tildes a la vista del alumno');
    fallos++;
  }else{
    console.log(`    ✔ la fase 1 trae ${declarados} recurso(s) visual(es) y se dibujan`);
    if(declarados > 2) console.log('      (aviso: más de dos figuras en un mensaje)');
  }
  console.log('');
}

console.log(fallos === 0
  ? `Los ${ESCENARIOS.length} escenarios pasaron: la fase 1 sale siempre con apoyo visual.`
  : `${fallos} escenario(s) para revisar a mano.`);
process.exit(fallos === 0 ? 0 : 1);
