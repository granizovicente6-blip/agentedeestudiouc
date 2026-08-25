/* =============================================================================
   Motor de equivalencia algebraica y numérica — soporte del banco de pruebas
   =============================================================================
   Esto es la referencia con la que se comprueba el banco de `banco.mjs`: la
   regla que el Worker le exige al tutor en el system prompt —"antes de decir que
   está mal, resta las dos expresiones o evalúalas en tres valores"— escrita como
   código, para que cada par del banco quede verificado y no dependa de que
   alguien lo mire a ojo.

   No se importa desde `worker.js`: el Worker no corrige respuestas por su cuenta
   (eso lo hace el modelo, en la clase guiada y en el chat). Vive aquí, junto a
   las pruebas, y no viaja al despliegue.

   Cómo decide: no simplifica símbolos. Evalúa las dos expresiones en una batería
   de valores fijos de sus variables y las compara. Si en algún punto difieren,
   ahí está el contraejemplo; si coinciden en todos los puntos válidos, son la
   misma expresión. Los puntos donde alguna no está definida —un denominador que
   se anula, el logaritmo de un negativo— se saltan: eso es justamente lo que
   hace que (x^2-1)/(x-1) y x+1 se den por iguales, que es lo que hizo el alumno.
   ============================================================================= */

const FUNCIONES = {
  raiz: Math.sqrt, sqrt: Math.sqrt, abs: Math.abs,
  ln: Math.log, log: (v) => Math.log10(v), log10: (v) => Math.log10(v),
  exp: Math.exp,
  sen: Math.sin, sin: Math.sin, cos: Math.cos, tan: Math.tan, tg: Math.tan,
  arcsen: Math.asin, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan
};

const CONSTANTES = { pi: Math.PI, e: Math.E };

/* --- Normalización de notación --------------------------------------------
   Lo que el alumno escribe y la pauta no: coma decimal, miles con punto, signo
   peso, porcentaje, raíz, potencias en superíndice, "x =" delante del número. */

export function normalizar(entrada){
  let s = String(entrada == null ? '' : entrada).trim().toLowerCase();

  // Símbolos que se escriben de más de una manera.
  s = s.replace(/[−–—]/g, '-')       // menos y guiones largos
       .replace(/[×·∙]/g, '*')       // × · ∙
       .replace(/÷/g, '/')                     // ÷
       .replace(/√/g, 'raiz ')                 // √x se lee raiz x, no una variable llamada raizx
       .replace(/π/g, 'pi')                    // π
       .replace(/²/g, '^2').replace(/³/g, '^3')
       .replace(/[$€£]/g, '')
       .replace(/⁄/g, '/');                    // ⁄

  // Etiqueta del resultado: "x = 3", "R = 12,5", "van = 100" valen como "3".
  s = s.replace(/^[a-záéíóúñ][a-z0-9áéíóúñ_]*\s*=\s*/, '');

  // Miles a la chilena: 8.000.000 -> 8000000. Solo grupos exactos de tres.
  s = s.replace(/\b\d{1,3}(?:\.\d{3})+\b(?!\d)/g, (m) => m.replace(/\./g, ''));

  // Coma decimal: 3,5 -> 3.5.
  s = s.replace(/(\d),(\d)/g, '$1.$2');

  // Porcentaje: 50% -> (50/100).
  s = s.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');

  // "sen^2 x" y "cos^2(x)" -> "(sen(x))^2".
  s = s.replace(/\b(sen|sin|cos|tan|tg|ln|log)\s*\^\s*(\d+)\s*\(?\s*([a-z0-9.]+)\s*\)?/g,
                (m, f, n, arg) => '(' + f + '(' + arg + '))^' + n);

  return s.replace(/\s+/g, ' ').trim();
}

/* --- Lector de expresiones --------------------------------------------------
   Descenso recursivo, con multiplicación implícita ("2x", "2 sen x cos x") y
   potencia asociativa por la derecha con exponente con signo ("2^-1"). */

function tokenizar(texto){
  const tokens = [];
  let i = 0;
  while(i < texto.length){
    const c = texto[i];
    if(c === ' '){ i++; continue; }
    if(/[0-9.]/.test(c)){
      let j = i;
      while(j < texto.length && /[0-9.]/.test(texto[j])) j++;
      const crudo = texto.slice(i, j);
      const valor = Number(crudo);
      if(!Number.isFinite(valor)) throw new Error('Número ilegible: "' + crudo + '"');
      tokens.push({ tipo: 'num', valor });
      i = j; continue;
    }
    if(/[a-záéíóúñ_]/.test(c)){
      let j = i;
      while(j < texto.length && /[a-z0-9áéíóúñ_]/.test(texto[j])) j++;
      tokens.push({ tipo: 'id', valor: texto.slice(i, j) });
      i = j; continue;
    }
    if('+-*/^()'.includes(c)){ tokens.push({ tipo: c }); i++; continue; }
    throw new Error('Carácter no soportado: "' + c + '"');
  }
  return tokens;
}

function analizar(tokens){
  let pos = 0;
  const mirar = () => tokens[pos];
  const comer = (tipo) => {
    if(!tokens[pos] || tokens[pos].tipo !== tipo) throw new Error('Falta "' + tipo + '"');
    return tokens[pos++];
  };

  function suma(){
    let nodo = producto();
    while(mirar() && (mirar().tipo === '+' || mirar().tipo === '-')){
      const op = tokens[pos++].tipo;
      nodo = { tipo: 'bin', op, a: nodo, b: producto() };
    }
    return nodo;
  }

  function producto(){
    let nodo = unario();
    for(;;){
      const t = mirar();
      if(!t) break;
      if(t.tipo === '*' || t.tipo === '/'){
        const op = tokens[pos++].tipo;
        nodo = { tipo: 'bin', op, a: nodo, b: unario() };
        continue;
      }
      // Multiplicación implícita: lo que sigue empieza otro factor.
      if(t.tipo === 'num' || t.tipo === 'id' || t.tipo === '('){
        nodo = { tipo: 'bin', op: '*', a: nodo, b: unario() };
        continue;
      }
      break;
    }
    return nodo;
  }

  function unario(){
    const t = mirar();
    if(t && t.tipo === '-'){ pos++; return { tipo: 'neg', a: unario() }; }
    if(t && t.tipo === '+'){ pos++; return unario(); }
    return potencia();
  }

  function potencia(){
    const base = atomo();
    if(mirar() && mirar().tipo === '^'){
      pos++;
      return { tipo: 'bin', op: '^', a: base, b: unario() };
    }
    return base;
  }

  function atomo(){
    const t = mirar();
    if(!t) throw new Error('Expresión incompleta');
    if(t.tipo === 'num'){ pos++; return { tipo: 'num', valor: t.valor }; }
    if(t.tipo === '('){ pos++; const dentro = suma(); comer(')'); return dentro; }
    if(t.tipo === 'id'){
      pos++;
      const nombre = t.valor;
      if(FUNCIONES[nombre]){
        // Con paréntesis o sin ellos: "ln(a*b)" y "ln a" son lo mismo.
        if(mirar() && mirar().tipo === '('){
          pos++; const arg = suma(); comer(')');
          return { tipo: 'fun', nombre, a: arg };
        }
        return { tipo: 'fun', nombre, a: potencia() };
      }
      if(CONSTANTES[nombre] !== undefined) return { tipo: 'num', valor: CONSTANTES[nombre] };
      return { tipo: 'var', nombre };
    }
    throw new Error('No se esperaba "' + t.tipo + '"');
  }

  const arbol = suma();
  if(pos !== tokens.length) throw new Error('Sobra texto al final de la expresión');
  return arbol;
}

// Una frase no es una expresión. Sin esto, "la cantidad de equilibrio" se lee
// como el producto de cuatro variables y termina declarada "no equivalente":
// justo el falso incorrecto que estas reglas vienen a evitar.
function pareceProsa(tokens){
  const operadores = tokens.filter(t => '+-*/^'.includes(t.tipo)).length;
  const palabras = tokens.filter(t => t.tipo === 'id' &&
                                      !FUNCIONES[t.valor] &&
                                      CONSTANTES[t.valor] === undefined).length;
  return operadores === 0 && palabras >= 3;
}

export function parsear(entrada){
  const tokens = tokenizar(normalizar(entrada));
  if(pareceProsa(tokens)) throw new Error('Parece una frase, no una expresión');
  return analizar(tokens);
}

export function variablesDe(arbol, acc = new Set()){
  if(arbol.tipo === 'var') acc.add(arbol.nombre);
  if(arbol.a) variablesDe(arbol.a, acc);
  if(arbol.b) variablesDe(arbol.b, acc);
  return acc;
}

export function evaluar(arbol, valores){
  switch(arbol.tipo){
    case 'num': return arbol.valor;
    case 'var': {
      const v = valores[arbol.nombre];
      return v === undefined ? NaN : v;
    }
    case 'neg': return -evaluar(arbol.a, valores);
    case 'fun': return FUNCIONES[arbol.nombre](evaluar(arbol.a, valores));
    case 'bin': {
      const a = evaluar(arbol.a, valores);
      const b = evaluar(arbol.b, valores);
      if(a === undefined || b === undefined) return NaN;
      if(arbol.op === '+') return a + b;
      if(arbol.op === '-') return a - b;
      if(arbol.op === '*') return a * b;
      if(arbol.op === '/') return b === 0 ? NaN : a / b;
      if(arbol.op === '^') return Math.pow(a, b);
      throw new Error('Operador desconocido: ' + arbol.op);
    }
    default: throw new Error('Nodo desconocido: ' + arbol.tipo);
  }
}

/* --- Comparación ------------------------------------------------------------
   Los puntos de prueba son fijos, no aleatorios: una prueba que a veces pasa no
   sirve de nada. Se mezclan positivos —los únicos donde ln y raíz existen— con
   negativos y fraccionarios, que es donde se caen las equivalencias falsas. */

const PUNTOS = [
  0.5, 2, 3, 0.25, 1.5, 4, 7, 0.75, 5, 1.25, 9, 2.5, 6, 0.1, 11, 3.5,
  -1, -2, -3, -0.5, -4, -1.5
];

const TOLERANCIA = 1e-9;
const MIN_PUNTOS = 5;

function casiIguales(a, b){
  if(!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= TOLERANCIA * Math.max(1, Math.abs(a), Math.abs(b));
}

// Reparte un punto distinto a cada variable, desfasado por su posición, para que
// x e y no valgan siempre lo mismo (si no, "x - y" pasaría por "0").
function puntoPara(variables, k){
  const valores = {};
  variables.forEach((nombre, i) => {
    valores[nombre] = PUNTOS[(k + i * 5) % PUNTOS.length];
  });
  return valores;
}

/**
 * ¿Son la misma expresión? Devuelve el veredicto con su motivo y, cuando no lo
 * son, el punto concreto donde se separan: el contraejemplo que el tutor tiene
 * que mostrarle al alumno en vez de repetirle que está mal.
 *
 * `equivalente` es `null` cuando no se pudo decidir (una expresión ilegible o
 * demasiados puntos fuera del dominio). Eso no es "incorrecto": es exactamente
 * el caso en que la regla del prompt manda preguntarle al alumno qué hizo.
 */
export function equivalentes(expresionProfesor, expresionAlumno){
  let a, b;
  try{ a = parsear(expresionProfesor); }
  catch(err){ return { equivalente: null, motivo: 'No se pudo leer la expresión del profesor: ' + err.message }; }
  try{ b = parsear(expresionAlumno); }
  catch(err){ return { equivalente: null, motivo: 'No se pudo leer la expresión del alumno: ' + err.message }; }

  const variables = [...new Set([...variablesDe(a), ...variablesDe(b)])].sort();

  // Sin variables es una cuenta: basta evaluarla una vez. Es el caso de 2/4 y 0.5.
  if(variables.length === 0){
    const va = evaluar(a, {});
    const vb = evaluar(b, {});
    return casiIguales(va, vb)
      ? { equivalente: true, motivo: 'Misma cifra: ' + va, puntos: 1 }
      : { equivalente: false, motivo: 'Cifras distintas: ' + va + ' contra ' + vb, puntos: 1 };
  }

  let comparados = 0;
  for(let k = 0; k < PUNTOS.length; k++){
    const valores = puntoPara(variables, k);
    let va, vb;
    try{ va = evaluar(a, valores); vb = evaluar(b, valores); }
    catch(err){ continue; }
    // Punto fuera del dominio de alguna de las dos: no dice nada, se salta.
    if(!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    comparados++;
    if(!casiIguales(va, vb)){
      const donde = variables.map(v => v + ' = ' + valores[v]).join(', ');
      return {
        equivalente: false,
        motivo: 'Difieren en ' + donde + ': ' + va + ' contra ' + vb,
        contraejemplo: { valores, profesor: va, alumno: vb },
        puntos: comparados
      };
    }
  }

  if(comparados < MIN_PUNTOS){
    return { equivalente: null, motivo: 'Solo ' + comparados + ' puntos válidos: no alcanza para decidir', puntos: comparados };
  }
  return { equivalente: true, motivo: 'Coinciden en los ' + comparados + ' puntos evaluados', puntos: comparados };
}
