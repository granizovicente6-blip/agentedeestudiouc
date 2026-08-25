/* =============================================================================
   Banco de pruebas de evaluación algebraica
   =============================================================================
   Cada caso es una corrección real: a la izquierda lo que trae la pauta del
   profesor, a la derecha lo que escribió el alumno. `equivalentes: true` significa
   que el tutor TIENE que darla por correcta, aunque no se parezca a su pauta;
   `false`, que hay un error de verdad y que el tutor debe poder mostrar el punto
   donde se rompe.

   El banco cumple dos funciones:
   - es la lista de formas que la regla de TOLERANCIA DE FORMATOS Y NOTACIÓN del
     Worker promete aceptar, comprobada una por una con el motor numérico en vez
     de quedar como una promesa escrita en el prompt;
   - es el guion de la prueba en vivo (`live.mjs`), que le manda al tutor los
     casos marcados `enVivo` y comprueba que no marque como incorrecta una
     respuesta equivalente, ni siquiera cuando el alumno insiste.
   ============================================================================= */

export const BANCO = [
  /* --- Simplificación algebraica: el caso que originó todo esto ------------- */
  {
    id: 'fraccion-algebraica-simplificada',
    tema: 'Cálculo',
    profesor: '(x^2 - 1)/(x - 1)',
    alumno: 'x + 1',
    equivalentes: true,
    nota: 'El alumno factorizó y simplificó. Difieren solo en x = 1, donde la del profesor no está definida.',
    enVivo: true
  },
  {
    id: 'trinomio-cuadrado-simplificado',
    tema: 'Álgebra',
    profesor: '(x^2 + 2x + 1)/(x + 1)',
    alumno: 'x + 1',
    equivalentes: true,
    nota: 'Misma simplificación con el cuadrado de binomio.'
  },
  {
    id: 'factor-comun-en-el-numerador',
    tema: 'Álgebra',
    profesor: '(2x + 4)/2',
    alumno: 'x + 2',
    equivalentes: true,
    nota: 'Dividir término a término es válido aunque la pauta deje la fracción armada.'
  },
  {
    id: 'producto-notable-desarrollado',
    tema: 'Álgebra',
    profesor: '(x + 1)(x - 1)',
    alumno: 'x^2 - 1',
    equivalentes: true,
    nota: 'Factorizada o desarrollada es la misma expresión.'
  },

  /* --- Notación de un mismo número ----------------------------------------- */
  { id: 'fraccion-sin-reducir', tema: 'Aritmética', profesor: '1/2', alumno: '2/4', equivalentes: true,
    nota: 'No reducir la fracción no es un error.', enVivo: true },
  { id: 'fraccion-como-decimal', tema: 'Aritmética', profesor: '1/2', alumno: '0.5', equivalentes: true,
    nota: 'Decimal en vez de fracción.' },
  { id: 'fraccion-como-potencia', tema: 'Aritmética', profesor: '1/2', alumno: '2^-1', equivalentes: true,
    nota: 'Potencia de exponente negativo.' },
  { id: 'fraccion-como-porcentaje', tema: 'Aritmética', profesor: '1/2', alumno: '50%', equivalentes: true,
    nota: 'Porcentaje en vez de decimal.' },
  { id: 'tres-octavos-decimal', tema: 'Aritmética', profesor: '6/8', alumno: '0.75', equivalentes: true },
  { id: 'coma-decimal-chilena', tema: 'Notación', profesor: '3.5', alumno: '3,5', equivalentes: true,
    nota: 'Coma decimal: es como se escribe en Chile.' },
  { id: 'miles-con-separador', tema: 'Notación', profesor: '8000000', alumno: '8.000.000', equivalentes: true,
    nota: 'Separador de miles a la chilena.' },
  { id: 'resultado-con-signo-peso', tema: 'Notación', profesor: '7200000', alumno: '$7.200.000', equivalentes: true,
    nota: 'La unidad monetaria no cambia la cifra.' },
  { id: 'respuesta-con-etiqueta', tema: 'Notación', profesor: '3', alumno: 'x = 3', equivalentes: true,
    nota: 'Escribir la variable delante del resultado no lo cambia.' },

  /* --- Orden y signos -------------------------------------------------------- */
  { id: 'terminos-en-otro-orden', tema: 'Álgebra', profesor: '3 + 2x', alumno: '2x + 3', equivalentes: true },
  { id: 'signo-distribuido', tema: 'Álgebra', profesor: '-(a - b)', alumno: 'b - a', equivalentes: true },

  /* --- Potencias, raíces, logaritmos y trigonometría ------------------------ */
  { id: 'raiz-como-potencia', tema: 'Álgebra', profesor: 'raiz(x)', alumno: 'x^(1/2)', equivalentes: true },
  { id: 'inversa-como-exponente', tema: 'Álgebra', profesor: '1/x^2', alumno: 'x^-2', equivalentes: true },
  { id: 'descuento-financiero', tema: 'Finanzas', profesor: '1/(1 + r)^2', alumno: '(1 + r)^-2', equivalentes: true,
    nota: 'El factor de descuento escrito como potencia negativa.' },
  { id: 'logaritmo-de-un-producto', tema: 'Cálculo', profesor: 'ln(a*b)', alumno: 'ln a + ln b', equivalentes: true,
    enVivo: true },
  { id: 'logaritmo-de-una-potencia', tema: 'Cálculo', profesor: 'ln(x^3)', alumno: '3*ln(x)', equivalentes: true },
  { id: 'exponencial-del-logaritmo', tema: 'Cálculo', profesor: 'e^(ln x)', alumno: 'x', equivalentes: true },
  { id: 'identidad-pitagorica', tema: 'Trigonometría', profesor: 'sen^2 x + cos^2 x', alumno: '1', equivalentes: true },
  { id: 'seno-del-angulo-doble', tema: 'Trigonometría', profesor: 'sen(2x)', alumno: '2 sen x cos x', equivalentes: true },
  { id: 'derivada-por-regla-del-producto', tema: 'Cálculo', profesor: '2*x*(x + 1) + x^2', alumno: '3*x^2 + 2*x',
    equivalentes: true, nota: 'Derivada dejada factorizada o ya reducida: la misma.' },

  /* --- Errores de verdad: aquí el tutor SÍ corrige, con el contraejemplo ----- */
  { id: 'cuadrado-de-binomio-mal', tema: 'Álgebra', profesor: '(x + 1)^2', alumno: 'x^2 + 1', equivalentes: false,
    nota: 'Falta el doble producto: se ve con cualquier x distinto de 0.' },
  { id: 'logaritmo-de-una-suma', tema: 'Cálculo', profesor: 'ln(a + b)', alumno: 'ln a + ln b', equivalentes: false,
    nota: 'La propiedad es del producto, no de la suma. Error clásico de prueba.' },
  { id: 'simplificacion-con-signo-cambiado', tema: 'Cálculo', profesor: '(x^2 - 1)/(x - 1)', alumno: 'x - 1',
    equivalentes: false, nota: 'Factorizó bien y simplificó el factor equivocado.' },
  { id: 'raiz-de-una-suma', tema: 'Álgebra', profesor: 'raiz(x^2 + y^2)', alumno: 'x + y', equivalentes: false },
  { id: 'seno-del-doble-mal', tema: 'Trigonometría', profesor: 'sen(2x)', alumno: '2 sen x', equivalentes: false },
  { id: 'exponente-negativo-mal-leido', tema: 'Álgebra', profesor: 'x^-2', alumno: '-x^2', equivalentes: false },
  { id: 'magnitud-equivocada', tema: 'Macroeconomía', profesor: '400000*20', alumno: '400000*20 - 800000',
    equivalentes: false,
    nota: 'Valor de producción contra valor agregado: bien calculado, pero es otra magnitud.' },
  { id: 'decimal-corrido', tema: 'Aritmética', profesor: '0.5', alumno: '0.05', equivalentes: false },
  { id: 'redondeo-que-cambia-el-numero', tema: 'Aritmética', profesor: '1/3', alumno: '0.333', equivalentes: false,
    nota: 'No es equivalencia sino redondeo: lo juzga la regla de redondeos, no esta.' }
];

// Los casos que se le mandan al tutor de verdad en la prueba en vivo.
export const CASOS_EN_VIVO = BANCO.filter(c => c.enVivo);
