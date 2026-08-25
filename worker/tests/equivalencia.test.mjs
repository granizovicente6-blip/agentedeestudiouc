/* =============================================================================
   Pruebas del banco de evaluación algebraica y del contrato de los prompts
   =============================================================================
   Se corren sin API key y sin red:

     node --test worker/tests/

   Dos cosas se comprueban aquí. Primero, que el banco de `banco.mjs` sea cierto:
   cada par se evalúa con el motor numérico, así que la lista de formas que el
   Worker promete aceptar queda verificada y no es una promesa escrita a mano.
   Segundo, que esas reglas viajen de verdad en el system prompt de los modos que
   corrigen al alumno —clase guiada, chat por tema y pauta de la guía—, armando
   los prompts con los mismos builders que usa el Worker en producción.

   Lo que NO se comprueba aquí es cómo se comporta el modelo: eso es `live.mjs`,
   que necesita una API key y un Worker corriendo.
   ============================================================================= */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { equivalentes, normalizar, parsear, evaluar } from './equivalencia.mjs';
import { BANCO } from './banco.mjs';
import {
  reglasParaPruebas,
  buildStudySessionPrompt,
  buildTopicChatPrompt,
  buildStudyGuidePautaPrompt
} from '../worker.js';

const REGLAS = reglasParaPruebas();

/* --- 1. El banco ----------------------------------------------------------- */

test('el banco no tiene ids repetidos', () => {
  const ids = BANCO.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'hay ids duplicados en el banco');
});

for(const caso of BANCO){
  test(`[${caso.equivalentes ? 'equivale' : 'NO equivale'}] ${caso.id}: ${caso.profesor} / ${caso.alumno}`, () => {
    const veredicto = equivalentes(caso.profesor, caso.alumno);
    assert.notEqual(veredicto.equivalente, null,
      `el motor no pudo decidir el caso (${veredicto.motivo})`);
    assert.equal(veredicto.equivalente, caso.equivalentes,
      `${caso.nota || ''} — motivo del motor: ${veredicto.motivo}`);

    // Un "está mal" sin el punto donde se rompe es exactamente lo que la regla
    // del prompt prohíbe: si el caso es incorrecto, tiene que haber contraejemplo.
    if(!caso.equivalentes){
      assert.ok(veredicto.motivo && veredicto.motivo.length > 0, 'falta el motivo del rechazo');
    }
  });
}

/* --- 2. El motor ----------------------------------------------------------- */

test('la equivalencia es simétrica: da lo mismo quién escribió qué', () => {
  for(const caso of BANCO){
    const ida   = equivalentes(caso.profesor, caso.alumno).equivalente;
    const vuelta = equivalentes(caso.alumno, caso.profesor).equivalente;
    assert.equal(ida, vuelta, `asimetría en ${caso.id}`);
  }
});

test('toda expresión es equivalente a sí misma', () => {
  for(const caso of BANCO){
    assert.equal(equivalentes(caso.profesor, caso.profesor).equivalente, true, caso.id);
    assert.equal(equivalentes(caso.alumno, caso.alumno).equivalente, true, caso.id);
  }
});

test('normaliza la notación que escribe el alumno', () => {
  assert.equal(normalizar('$8.000.000'), '8000000');
  assert.equal(normalizar('3,5'), '3.5');
  assert.equal(normalizar('50%'), '(50/100)');
  assert.equal(normalizar('X = 3'), '3');
  assert.equal(normalizar('√x'), 'raiz x');
  assert.equal(normalizar('x²'), 'x^2');
});

test('evalúa con multiplicación implícita y exponente con signo', () => {
  assert.equal(evaluar(parsear('2x'), { x: 4 }), 8);
  assert.equal(evaluar(parsear('2^-1'), {}), 0.5);
  assert.equal(evaluar(parsear('2^-1^2'), {}), 0.5);   // ^ asocia por la derecha
});

test('un denominador nulo no decide nada: se salta el punto', () => {
  // (x^2-1)/(x-1) no existe en x = 1 y x + 1 sí. Son equivalentes igual.
  assert.equal(evaluar(parsear('(x^2 - 1)/(x - 1)'), { x: 1 }), NaN);
  assert.equal(equivalentes('(x^2 - 1)/(x - 1)', 'x + 1').equivalente, true);
});

test('lo que no se puede leer no se declara incorrecto', () => {
  const veredicto = equivalentes('x + 1', 'la cantidad de equilibrio');
  assert.equal(veredicto.equivalente, null);
});

/* --- 3. Las reglas viajan en los prompts que corrigen al alumno ------------- */

// Las frases que el prompt tiene que traer sí o sí. Si alguien reescribe el
// bloque y se lleva una por delante, la prueba avisa antes del despliegue.
const EXIGENCIAS_EQUIVALENCIA = [
  'EQUIVALENCIA ALGEBRAICA Y NUMÉRICA',
  'MATEMÁTICAMENTE EQUIVALENTE',
  '(Expresión_Profesor) - (Expresión_Alumno)',
  'TOLERANCIA DE FORMATOS Y NOTACIÓN',
  '1/2 = 0.5 = 50% = 2^-1'
];

const EXIGENCIAS_IMPUGNACION = [
  'CUANDO EL ALUMNO CUESTIONA TU CORRECCIÓN',
  'sin sesgo de confirmación',
  'paso a paso',
  'Tienes toda la razón'
];

function exige(system, frases, donde){
  for(const frase of frases){
    assert.ok(system.includes(frase), `falta "${frase}" en el system de ${donde}`);
  }
}

const PAYLOAD_SESION = {
  topicTitle: 'Derivadas y regla de la cadena',
  course: 'Cálculo I',
  currentPhase: 'practica',
  sessionIndex: 2,
  totalSessions: 3,
  userResponse: 'Simplifiqué (x^2 - 1)/(x - 1) y me quedó x + 1.',
  history: [
    { role: 'assistant', content: 'Calcula el límite de (x^2 - 1)/(x - 1) cuando x tiende a 1.', phase: 'practica' }
  ]
};

test('clase guiada: lleva la comprobación de equivalencia y el manejo de impugnaciones', () => {
  const built = buildStudySessionPrompt(PAYLOAD_SESION);
  assert.ok(!built.error, built.error);
  exige(built.system, EXIGENCIAS_EQUIVALENCIA, 'la clase guiada');
  exige(built.system, EXIGENCIAS_IMPUGNACION, 'la clase guiada');
});

test('clase guiada: las tres fases llevan las mismas reglas', () => {
  for(const currentPhase of ['teoria', 'practica', 'cierre']){
    const built = buildStudySessionPrompt({ ...PAYLOAD_SESION, currentPhase });
    exige(built.system, EXIGENCIAS_EQUIVALENCIA, `la fase ${currentPhase}`);
    exige(built.system, EXIGENCIAS_IMPUGNACION, `la fase ${currentPhase}`);
  }
});

test('clase guiada: el veredicto no se decide por el parecido con la pauta', () => {
  const built = buildStudySessionPrompt({ ...PAYLOAD_SESION, currentPhase: 'cierre' });
  assert.ok(built.system.includes('El veredicto se decide por el contenido, no por el parecido con tu pauta'),
    'la fase de cierre no advierte contra el REPASAR injusto');
});

test('chat por tema: lleva las dos reglas', () => {
  const built = buildTopicChatPrompt({
    topicTitle: 'Elasticidad precio de la demanda',
    course: 'Microeconomía',
    userMessage: '¿Está bien si dejo el resultado como 2/4 en vez de 1/2?'
  });
  assert.ok(!built.error, built.error);
  exige(built.system, EXIGENCIAS_EQUIVALENCIA, 'el chat por tema');
  exige(built.system, EXIGENCIAS_IMPUGNACION, 'el chat por tema');
});

test('pauta de la guía: lleva la equivalencia y declara las formas aceptadas', () => {
  const built = buildStudyGuidePautaPrompt({
    topicTitle: 'Optimización de funciones de una variable',
    course: 'Cálculo I',
    ejercicios: [{
      titulo: 'Costo medio mínimo',
      contexto: 'Una empresa tiene costo total C(q) = q^2 + 4q + 100 con q en unidades.',
      partes: [{ letra: 'a', enunciado: 'Determine el nivel de producción que minimiza el costo medio.', puntaje: 20 }]
    }]
  });
  assert.ok(!built.error, built.error);
  exige(built.system, EXIGENCIAS_EQUIVALENCIA, 'la pauta de la guía');
  assert.ok(built.system.includes('se acepta 1/2, 0.5 o 2^-1'),
    'la pauta no pide declarar las formas equivalentes en los criterios');
  // La pauta sale en JSON: el razonamiento no puede filtrarse a la respuesta.
  assert.ok(built.system.includes('la salida sigue siendo únicamente el JSON pedido'),
    'la variante JSON no recuerda que la salida es solo el JSON');
});

test('los bloques de reglas no se pisan entre sí', () => {
  assert.ok(REGLAS.equivalenciaJson.startsWith(REGLAS.equivalencia),
    'la variante JSON dejó de contener la regla base');
  assert.ok(!REGLAS.equivalencia.includes('CUANDO EL ALUMNO CUESTIONA'),
    'los dos bloques quedaron pegados en uno');
  assert.ok(REGLAS.impugnacion.includes('EQUIVALENCIA ALGEBRAICA Y NUMÉRICA'),
    'el bloque de impugnaciones no remite a la comprobación de equivalencia');
  // La regla vieja de métodos alternativos sigue en pie: la nueva la complementa.
  assert.ok(REGLAS.metodos.includes('MÉTODOS ALTERNATIVOS'),
    'se perdió el bloque de métodos alternativos');
});

// El Worker se cae al arrancar si el módulo de entrada exporta con nombre algo
// que no sea una función. Se comprueba aquí para no descubrirlo en el despliegue.
test('las exportaciones con nombre del Worker son todas funciones', async () => {
  const modulo = await import('../worker.js');
  for(const [nombre, valor] of Object.entries(modulo)){
    if(nombre === 'default') continue;
    assert.equal(typeof valor, 'function', `la exportación "${nombre}" no es una función`);
  }
});
