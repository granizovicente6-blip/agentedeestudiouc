# Proxy de análisis con Claude — Cloudflare Workers

Este Worker guarda la API key de Anthropic del lado del servidor. El sitio en
GitHub Pages solo le envía el texto de las preguntas y recibe de vuelta el JSON
con los temas; la clave nunca llega al navegador de los alumnos.

Desde el panel de control también guarda la **telemetría anónima de uso** en una
base D1 (ver más abajo).

## Despliegue (una sola vez)

1. Instala Wrangler y entra a tu cuenta de Cloudflare:

   ```bash
   npm install -g wrangler
   ```

   ```bash
   wrangler login
   ```

2. Edita `worker.js` y reemplaza `https://TU-USUARIO.github.io` en
   `ALLOWED_ORIGINS` por el dominio real del sitio. **Si no lo haces, el
   navegador bloqueará todas las peticiones por CORS.**

3. Guarda la API key como secreto cifrado (pégala cuando la pida; no queda en
   ningún archivo del repositorio):

   ```bash
   wrangler secret put ANTHROPIC_API_KEY
   ```

4. Publica el Worker:

   ```bash
   wrangler deploy
   ```

5. Copia la URL que imprime Wrangler (algo como
   `https://agente-estudio-proxy.TU-CUENTA.workers.dev`) y pégala en la
   constante `WORKER_ENDPOINT` de `../app.js`.

## Comprobación rápida

```bash
curl -i -X POST https://TU-WORKER.workers.dev -H "Origin: https://TU-USUARIO.github.io" -H "content-type: application/json" -d "{\"curso\":\"Microeconomía\",\"tipoEvaluacion\":\"Prueba\",\"preguntas\":[\"Calcule el excedente del consumidor si la demanda es Qd = 100 - 2P.\",\"Determine la elasticidad precio de la demanda en el equilibrio.\",\"Explique cómo se desplaza la curva de oferta ante un alza de costos.\"]}"
```

Debe responder `200` con `temas_clave`, `resumen_evaluacion` y
`sugerencia_estudio`. Sin la cabecera `Origin` correcta responde `403`.

Para ver los errores en vivo mientras pruebas:

```bash
wrangler tail
```

---

# Telemetría de uso y panel de control

El panel de administración de la app (`?admin=true`, o el punto discreto del pie
de página) lee de aquí. Son dos rutas más en el mismo Worker:

| Ruta | Qué hace |
|---|---|
| `POST /api/telemetry` | Recibe lotes de eventos anónimos del navegador y los guarda. |
| `POST /api/admin/stats` | Devuelve las métricas agregadas del panel. Pide PIN. |

Las dos van **antes** de la comprobación de `ANTHROPIC_API_KEY` y usan su propio
tope de peticiones por IP: contar el uso no gasta API key y no tiene por qué
robarle cupo a un alumno que está analizando su temario.

## Qué se guarda (y qué no)

Por evento: un identificador anónimo que el navegador se inventa solo
(`crypto.randomUUID`, guardado en su `localStorage`), el tipo de evento, la
carrera, el ramo y la fecha. **No** se guarda nada del alumno: ni sus
evaluaciones, ni sus notas, ni su nombre, ni el texto que escribe, ni su IP. No
hay cuentas con qué cruzar el identificador.

Dos tablas, que el Worker crea solo en la primera petición:

- `events` — el registro crudo. Se poda a los **180 días**
  (`TELEMETRY_RETENTION_DAYS`), en una de cada cien escrituras.
- `users` — el censo de visitantes (primera visita, última visita, total de
  eventos). **No se poda nunca**: si se podara, el conteo de "visitantes únicos
  totales" bajaría cada vez que caduca el historial, que es justo lo que ese
  número no debe hacer.

## Configuración (una sola vez)

1. Crea la base D1:

   ```bash
   wrangler d1 create agentedestudio-uso
   ```

2. Pega el `database_id` que imprime ese comando en `wrangler.toml`, en el lugar
   del marcador `PEGA-AQUI-EL-ID-...`. No hay migración que correr: las tablas y
   sus índices los crea el Worker (ver `TELEMETRY_SCHEMA` en `worker.js`).

3. Elige el PIN del panel y guárdalo como secreto cifrado:

   ```bash
   wrangler secret put ADMIN_PIN
   ```

4. Vuelve a publicar:

   ```bash
   wrangler deploy
   ```

**Sin estos pasos la app funciona exactamente igual.** La telemetría responde
`503` y el navegador la ignora en silencio; el panel se abre y explica qué
falta.

## Comprobación rápida

```bash
curl -s -X POST https://TU-WORKER.workers.dev/api/telemetry -H "Origin: https://TU-USUARIO.github.io" -H "content-type: text/plain" -d "{\"userId\":\"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\",\"events\":[{\"type\":\"session_start\",\"career\":\"comercial\"}]}"
```

Debe responder `{"ok":true,"stored":1}`. Y las métricas:

```bash
curl -s -X POST https://TU-WORKER.workers.dev/api/admin/stats -H "Origin: https://TU-USUARIO.github.io" -H "content-type: application/json" -d "{\"pin\":\"TU-PIN\",\"days\":30}"
```

## Probar en local, sin tocar la cuenta de Cloudflare

`wrangler dev` levanta el Worker con una D1 local en disco (no toca la base de
producción). Los secretos locales van en un `worker/.dev.vars`, que está en el
`.gitignore`:

```bash
printf 'ADMIN_PIN=2468\n' > worker/.dev.vars
```

```bash
cd worker && npx wrangler dev --port 8787 --local
```

Con el Worker local corriendo, sirve el sitio en `localhost:8000` y apunta la
app al Worker de al lado desde la consola del navegador:

```js
localStorage.workerUrlOverride = 'http://127.0.0.1:8787'; location.reload();
```

Ese atajo **solo funciona cuando la página se sirve desde localhost**
(ver `resolveWorkerUrl` en `app.js`): en producción manda siempre
`WORKER_ENDPOINT`, porque por ahí viaja el PIN del panel.

Para mirar la base local a mano:

```bash
npx wrangler d1 execute agentedestudio-uso --local --command "SELECT event_type, COUNT(*) FROM events GROUP BY event_type"
```

---

## Qué controla el Worker

| Control | Valor por defecto | Dónde se cambia |
|---|---|---|
| Orígenes permitidos (CORS) | tu dominio de GitHub Pages + localhost | `ALLOWED_ORIGINS` |
| Modelo | `claude-haiku-4-5` | `ANTHROPIC_MODEL` |
| Preguntas por llamada | 120 | `MAX_QUESTIONS` |
| Caracteres por llamada | 18.000 | `MAX_CHARS` |
| Tamaño máximo del cuerpo | 60 KB | `MAX_BODY_BYTES` |
| Solicitudes de IA por IP | 12 por minuto | `RATE_LIMIT` |
| Eventos de telemetría por IP | 40 por minuto | `TELEMETRY_RATE_LIMIT` |
| Intentos de PIN por IP | 10 por minuto | `ADMIN_RATE_LIMIT` |
| Eventos por envío | 25 | `MAX_TELEMETRY_BATCH` |
| Retención del historial crudo | 180 días | `TELEMETRY_RETENTION_DAYS` |

## Límites que conviene tener presentes

- El límite por IP usa la Cache API, que es **por centro de datos de
  Cloudflare**: alguien que reparta las peticiones entre varias regiones puede
  superarlo. Sirve como tope de cortesía, no como defensa contra abuso decidido.
- La lista de orígenes la aplica **el navegador**, no la red: un `curl` con la
  cabecera `Origin` falsificada llega igual al Worker. Los topes de tamaño y de
  frecuencia son la protección real del gasto.
- El PIN del panel es un PIN, no un sistema de cuentas: protege una vista de
  números agregados y anónimos, y lo único que lo respalda contra la fuerza
  bruta es el tope de 10 intentos por minuto y por IP. Elige uno que no sea
  `1234` y no lo compartas por escrito. Si el panel llegara a mostrar algo
  sensible, lo correcto sería ponerlo detrás de Cloudflare Access, no alargar
  el PIN.
- Las cifras de visitantes cuentan **navegadores**, no personas: la misma
  persona en su teléfono y en su computador son dos, y quien navega en modo
  incógnito o borra sus datos vuelve a contar como nuevo. Es el precio de no
  poner cuentas ni huellas de navegador para reconocer a nadie.
- Las fechas del minigráfico diario se agrupan en **UTC**, que es como las
  agrupa SQLite. En Chile eso corre el corte unas horas respecto de la
  medianoche local.
- Revisa el gasto en la consola de Anthropic las primeras semanas; con
  `claude-haiku-4-5` y estos topes cada análisis cuesta una fracción de centavo,
  pero el endpoint es público.
