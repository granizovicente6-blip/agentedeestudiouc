/* =============================================================================
   Pruebas del apoyo visual obligatorio de la fase 1 de la clase guiada
   =============================================================================
   Se corren sin API key y sin red:

     node --test worker/tests/*.test.mjs

   Dos mitades, que son los dos lados del mismo trato.

   La primera comprueba el lado del Worker: que la exigencia de figura viaje de
   verdad dentro del system prompt que se manda cuando la fase en curso es la 1,
   armándolo con el mismo builder que usa producción. Si alguien reescribe el
   bloque y se lleva la regla por delante, esto avisa antes del despliegue.

   La segunda comprueba el lado del navegador: que lo que el modelo escriba por
   esa exigencia se dibuje. El parser de figuras vive en app.js, que es un script
   de página y no un módulo, así que no se puede importar: se recorta el tramo
   que va de las utilidades de las figuras hasta la llamada al Worker y se evalúa
   aparte. El recorte va por los comentarios de sección, no por número de línea,
   para que sobreviva a los cambios de más arriba del archivo.
   ============================================================================= */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { reglasParaPruebas, buildStudySessionPrompt } from '../worker.js';

const REGLAS = reglasParaPruebas();

// Las cercas de tres tildes se arman aparte por lo mismo que en el Worker:
// escritas al vuelo dentro de un template literal no se leen.
const CERCA = '`'.repeat(3);

/* --- 1. La exigencia viaja en el prompt de la fase 1 ----------------------- */

// Lo que el bloque tiene que decir sí o sí. Las tres primeras son literales: son
// la directiva que se pidió, palabra por palabra.
const EXIGENCIAS_FASE1 = [
  'REGLA OBLIGATORIA DE FASE 1',
  'DEBES incluir obligatoriamente al menos un bloque visual',
  'Queda estrictamente prohibido entregar la explicación de la Fase 1 como texto puro',
  `${CERCA}grafico`,
  `${CERCA}mermaid`,
  'tabla/esquema de estructura visual'
];

const PAYLOAD = {
  topicTitle: 'Elasticidad precio de la demanda',
  course: 'Microeconomía',
  currentPhase: 'teoria',
  sessionIndex: 1,
  totalSessions: 3
};

test('la fase 1 sale con la regla obligatoria de apoyo visual', () => {
  const built = buildStudySessionPrompt(PAYLOAD);
  assert.ok(!built.error, built.error);
  for(const frase of EXIGENCIAS_FASE1){
    assert.ok(built.system.includes(frase), `falta "${frase}" en el system de la fase 1`);
  }
});

test('la regla llega igual si la fase viene como número', () => {
  const built = buildStudySessionPrompt({ ...PAYLOAD, currentPhase: 1 });
  assert.equal(built.phase, 'teoria');
  assert.ok(built.system.includes(REGLAS.visualFase1),
    'la fase 1 pedida por número no trae el bloque de apoyo visual obligatorio');
});

test('las tres opciones de recurso están nombradas y explicadas', () => {
  const bloque = REGLAS.visualFase1;
  assert.ok(bloque.includes(`a) ${CERCA}grafico`), 'falta la opción del gráfico');
  assert.ok(bloque.includes(`b) ${CERCA}mermaid`), 'falta la opción del diagrama');
  assert.ok(bloque.includes('c) Tabla o esquema de estructura'), 'falta la opción de la tabla');
});

test('la exigencia también está en las instrucciones de la FASE 1 del rol', () => {
  // No basta con el bloque pegado al final: la lista de pasos de la fase 1 tiene
  // que nombrarla, que es donde el modelo lee qué hacer en su primer mensaje.
  const built = buildStudySessionPrompt(PAYLOAD);
  const fase1 = built.system.slice(built.system.indexOf('FASE 1 — EXPLICACIÓN (teoría)'),
                                   built.system.indexOf('FASE 2 — EJERCICIO GUIADO'));
  assert.ok(fase1.includes('DEBE traer al menos un bloque visual'),
    'la lista de pasos de la fase 1 no exige la figura');
  assert.ok(fase1.includes('texto puro no se acepta'),
    'la lista de pasos de la fase 1 no prohíbe el texto puro');
});

test('el recordatorio de fase en curso repite la exigencia', () => {
  const built = buildStudySessionPrompt(PAYLOAD);
  assert.ok(built.system.includes('El mensaje con el que explicas la teoría DEBE traer al menos un bloque visual'),
    'FASE EN CURSO no repite la exigencia de figura');
});

test('la apertura de la fase 1 le pide la figura al profesor', () => {
  const built = buildStudySessionPrompt(PAYLOAD);
  const apertura = built.messages[built.messages.length - 1].content;
  assert.ok(apertura.includes('apoyo visual'),
    'el turno que abre la fase 1 no menciona el apoyo visual');
});

test('la exigencia es de la fase 1 y no ensucia las otras dos', () => {
  for(const currentPhase of ['practica', 'cierre']){
    const built = buildStudySessionPrompt({
      ...PAYLOAD,
      currentPhase,
      userResponse: 'Me da 0.5.',
      history: [{
        role: 'assistant',
        content: 'Calcula la elasticidad en el punto P = 20, Q = 40.',
        phase: currentPhase
      }]
    });
    // La lista de pasos de la FASE 1 sigue ahí —el rol completo viaja siempre—,
    // pero el bloque con la exigencia no: es lo que se pega solo en la fase 1.
    assert.ok(!built.system.includes(REGLAS.visualFase1),
      `la fase ${currentPhase} arrastra el bloque de la fase 1`);
    assert.ok(!built.system.includes('Queda estrictamente prohibido entregar la explicación'),
      `la fase ${currentPhase} arrastra la prohibición de texto puro de la fase 1`);
    // El apoyo visual normal sigue estando: lo que cambia es que deja de ser
    // obligatorio, no que desaparezca.
    assert.ok(built.system.includes('APOYO VISUAL (gráficos y diagramas)'),
      `la fase ${currentPhase} se quedó sin el bloque de apoyo visual`);
  }
});

test('la regla general ya no contradice a la obligatoria', () => {
  // Antes cerraba con "el texto solo también es una respuesta correcta" a secas,
  // que es justo lo contrario de lo que exige la fase 1.
  assert.ok(REGLAS.visual.includes('salvo donde una regla de fase te obligue a incluirla'),
    'APOYO VISUAL sigue autorizando el texto puro sin excepción');
  assert.ok(REGLAS.visual.includes('la fase 1 de la clase guiada lo hace'),
    'APOYO VISUAL no reconoce que hay fases con figura obligatoria');
});

/* --- 2. El navegador dibuja lo que el prompt manda escribir ---------------- */

// app.js es un script de página: se recorta el tramo de las figuras y se evalúa
// suelto, con el único ayudante que usa de más arriba del archivo.
function cargarParserDeFiguras(){
  const ruta = fileURLToPath(new URL('../../app.js', import.meta.url));
  const src = readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');

  const markdown   = src.indexOf('/* --- Markdown del chat, con figuras');
  const utilidades = src.indexOf('/* --- Utilidades numéricas de las figuras', markdown);
  const fin        = src.indexOf('/* --- Llamada al Worker', markdown);
  assert.ok(markdown > 0 && utilidades > markdown && fin > utilidades,
    'app.js movió las secciones de figuras: hay que rehacer el recorte');

  const escapeHtml = [
    'function escapeHtml(s){',
    '  return String(s).replace(/[&<>"\']/g, c =>',
    '    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", \'"\':"&quot;", "\'":"&#39;" }[c]));',
    '}'
  ].join('\n');

  return new Function(
    `${escapeHtml}\n${src.slice(markdown, fin)}\n` +
    'return { chatMarkdownToHtml, renderFence, parseChartSpec, parseFlowSpec };'
  )();
}

const FIG = cargarParserDeFiguras();

const dibuja  = html => html.includes('<svg') || html.includes('<table');
const enCrudo = html => html.includes(CERCA);

// Los tres recursos que la regla ofrece, escritos como los pide el prompt.
const RECURSOS = {
  'gráfico de oferta y demanda': [
    `${CERCA}grafico`,
    'titulo: Equilibrio de mercado',
    'x: Cantidad (Q)',
    'y: Precio ($)',
    'recta: Demanda | 0,100 | 50,0',
    'recta: Oferta | 0,20 | 50,70',
    'punto: Equilibrio | 33,34',
    'vertical: Q* | 33',
    'nota: Ahí se cruzan las dos.',
    CERCA
  ],
  'curva de costo medio': [
    `${CERCA}grafico`,
    'titulo: Costo medio',
    'x: Cantidad',
    'y: CMe',
    'curva: CMe | y = 20 + 0.05*x^2 | 5..50',
    CERCA
  ],
  'barras': [
    `${CERCA}grafico`,
    'tipo: barras',
    'titulo: Aporte al PIB',
    'barra: Agro | 12',
    'barra: Industria | 34',
    'barra: Servicios | 54',
    CERCA
  ],
  'nube de puntos': [
    `${CERCA}grafico`,
    'tipo: dispersion',
    'x: Ingreso',
    'y: Consumo',
    'punto: 10,8',
    'punto: 20,15',
    'punto: 30,26',
    CERCA
  ],
  'árbol de decisión': [
    `${CERCA}mermaid`,
    'flowchart TD',
    'A[Sube el costo del insumo] --> B{¿La demanda es elástica?}',
    'B -->|Sí| C[El precio sube poco y cae la cantidad]',
    'B -->|No| D[El precio sube casi todo el costo]',
    CERCA
  ],
  'proceso de izquierda a derecha': [
    `${CERCA}mermaid`,
    'flowchart LR',
    'A(Flujos) --> B[Descontar] --> C{VAN > 0}',
    'C -->|Sí| D(Invertir)',
    'C -->|No| E(Rechazar)',
    CERCA
  ],
  'tabla comparativa': [
    '| Caso | Precio | Cantidad |',
    '| --- | --- | --- |',
    '| Antes | 100 | 40 |',
    '| Después | 120 | 32 |'
  ]
};

for(const [nombre, lineas] of Object.entries(RECURSOS)){
  test(`fase 1: se dibuja el recurso "${nombre}"`, () => {
    const html = FIG.chatMarkdownToHtml(lineas.join('\n'));
    assert.ok(dibuja(html), `el recurso "${nombre}" no se dibujó: ${html.slice(0, 160)}`);
    assert.ok(!enCrudo(html), `quedaron cercas a la vista en "${nombre}"`);
  });
}

test('el primer turno completo de una clase se dibuja entero', () => {
  // Un mensaje de fase 1 tal como lo pide el prompt: presentación, figura,
  // desarrollo con números y pregunta de comprensión.
  const turno = [
    'Hoy vemos **elasticidad precio de la demanda**: es lo que más se pregunta en el control.',
    '',
    'La idea es cuánto cae la cantidad cuando sube el precio, en porcentaje.',
    '',
    `${CERCA}grafico`,
    'titulo: Dos demandas sobre el mismo punto',
    'x: Cantidad (Q)',
    'y: Precio ($)',
    'recta: Elástica | 0,60 | 60,0',
    'recta: Inelástica | 0,60 | 20,0',
    'nota: Mira cuánto se mueve Q ante la misma baja de precio.',
    CERCA,
    '',
    'Con P = 20 y Q = 40, si P sube a 22 y Q cae a 36:',
    '',
    '1. Variación de Q: (36 - 40) / 40 = -0.10',
    '2. Variación de P: (22 - 20) / 20 = 0.10',
    '3. Elasticidad: -0.10 / 0.10 = -1',
    '',
    'El error típico es dejarla positiva.',
    '',
    '¿Qué pasa con el ingreso total si la elasticidad es exactamente -1?'
  ].join('\n');

  const html = FIG.chatMarkdownToHtml(turno);
  assert.ok(html.includes('<svg'), 'la figura del primer turno no se dibujó');
  assert.ok(!enCrudo(html), 'quedaron cercas a la vista en el primer turno');
  assert.ok(html.includes('<b>elasticidad precio de la demanda</b>'), 'se perdieron las negritas');
  assert.ok(html.includes('<ol class="chat-list">'), 'se perdió la lista numerada del desarrollo');
  assert.ok(html.includes('¿Qué pasa con el ingreso total'), 'se perdió la pregunta de comprensión');
});

test('la cerca con texto de más detrás sigue siendo una figura', () => {
  // El modelo escribe a veces el título pegado a la cerca de apertura. Antes eso
  // dejaba de leerse como cerca y el bloque entero salía como párrafos, tildes
  // incluidas, que es la peor forma de fallar de la fase 1.
  const html = FIG.chatMarkdownToHtml([
    `${CERCA}grafico Equilibrio de mercado`,
    'titulo: Equilibrio',
    'x: Q',
    'y: P',
    'recta: Demanda | 0,100 | 50,0',
    CERCA
  ].join('\n'));
  assert.ok(html.includes('<svg'), 'la cerca con título extra no se dibujó');
  assert.ok(!enCrudo(html), 'la cerca con título extra dejó las tildes a la vista');
});

test('un diagrama sin flechas no se dibuja: cae a bloque de texto', () => {
  // Un "mindmap" y las listas de conceptos se dejaban leer como nodos sueltos y
  // salían como cajas flotando sin nada que las una.
  const html = FIG.chatMarkdownToHtml([
    `${CERCA}mermaid`,
    'mindmap',
    '  root((Microeconomía))',
    '    Demanda',
    '    Oferta',
    CERCA
  ].join('\n'));
  assert.ok(!html.includes('<svg'), 'se dibujó un diagrama sin una sola flecha');
  assert.ok(html.includes('<pre class="chat-pre">'), 'no cayó a bloque de texto');
});

test('una figura rota no se lleva por delante el resto del mensaje', () => {
  const html = FIG.chatMarkdownToHtml([
    'Antes de la figura.',
    '',
    `${CERCA}grafico`,
    'titulo: Sin un solo dato',
    CERCA,
    '',
    '¿Y esta pregunta se ve?'
  ].join('\n'));
  assert.ok(html.includes('¿Y esta pregunta se ve?'), 'el bloque roto se comió el texto de después');
});

test('una cerca cortada por el tope de largo no se come el mensaje', () => {
  // El Worker cierra la cerca que quedó abierta al truncar; aun sin ese cierre,
  // el parser tiene que llegar al final y dibujar lo que alcanzó a leer.
  const html = FIG.chatMarkdownToHtml([
    'Texto previo.',
    '',
    `${CERCA}grafico`,
    'titulo: Cortado',
    'x: Q',
    'y: P',
    'recta: D | 0,100 | 50,0'
  ].join('\n'));
  assert.ok(html.includes('<svg'), 'la figura truncada no se dibujó');
});

test('el <br> y las entidades de Mermaid no salen a la vista en las cajas', () => {
  // Es lo que escribe el modelo cuando quiere partir una etiqueta larga o cuando
  // escapa un signo de comparación. Salía literal dentro de la caja.
  const html = FIG.chatMarkdownToHtml([
    `${CERCA}mermaid`,
    'flowchart TD',
    'A["Mercado sin regulación"] --> B["La contaminación tiene un costo <br/> que nadie paga"]',
    'B --> C{Resultado}',
    'C -->|El costo social &gt; costo privado| D["El Estado interviene"]',
    CERCA
  ].join('\n'));
  assert.ok(html.includes('<svg'), 'el diagrama no se dibujó');
  assert.ok(!html.includes('&lt;br'), 'la etiqueta muestra el <br> como texto');
  assert.ok(!html.includes('&amp;gt;'), 'la etiqueta muestra la entidad &gt; como texto');
  // La etiqueta de la flecha se corta si no cabe en el chip: lo que importa es
  // que el signo haya vuelto a ser un signo.
  assert.ok(html.includes('El costo social &gt;'), 'el signo > no quedó como signo');
});

test('el prompt le pide al modelo etiquetas de Mermaid en texto plano', () => {
  assert.ok(REGLAS.visual.includes('Las etiquetas van en texto plano'),
    'APOYO VISUAL no prohíbe el HTML dentro de las etiquetas del diagrama');
});

test('el SVG que sale es solo el que arma la app: nada del modelo se copia', () => {
  const html = FIG.chatMarkdownToHtml([
    `${CERCA}mermaid`,
    'flowchart TD',
    'A[<img src=x onerror=alert(1)>] --> B[Fin]',
    CERCA
  ].join('\n'));
  assert.ok(!html.includes('<img'), 'se copió marcado del modelo dentro de la figura');
  assert.ok(html.includes('&lt;img'), 'la etiqueta del modelo no quedó escapada');
});
