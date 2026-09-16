# CLAUDE.md — Turia Cup

Guía para trabajar en este repo. El dueño del código **no es técnico**: explica los cambios en
lenguaje llano y no des por hecho que puede tocar consolas, DNS o SQL por su cuenta.

El `README.md` ya documenta el alta de la D1, el alta del proyecto en Cloudflare, el dominio,
Resend y el uso del panel de admin. **No dupliques nada de eso aquí**: remite al README.

## Qué es

Web pública del torneo de fútbol base **Turia Cup**: landing + formulario de inscripción +
módulo de torneo (clasificaciones, equipos, jugadores) + panel de administración.

Es un **Cloudflare Worker con assets estáticos** (modelo unificado: un solo Worker sirve
`public/` y la API). Repo `TuriaCup/turiacup`, Worker `turiacup`, dominio `turiacup.com`.
Base de datos: **Cloudflare D1** (`turiacup-db`, binding `DB`). Email: Resend.

## Estructura

- `worker/index.js` — router manual (`matchPath`) y `export default { fetch }`. Todo lo que
  no case devuelve 404. Hay un `try/catch` global que convierte cualquier excepción en un
  500 genérico **sin log**: si algo falla en silencio, reprodúcelo con `wrangler dev`.
- `worker/routes/inscripcion.js` — `POST /api/inscripcion` (valida, guarda en D1, avisa por email).
- `worker/routes/plantilla.js` — `/api/plantilla/:slug` (GET/PUT): la plantilla que rellena cada club
  desde su enlace privado. Sin auth: el secreto es el código del slug. El PUT respeta el ajuste
  `subidas_abiertas` y sustituye jugadores + `staff` del equipo de una tacada.
- `worker/routes/public.js` — `/api/equipos`, `/api/equipos/:id`, `/api/jugadores/:id`,
  `/api/clasificacion`, `/api/partidos`. Sin auth, pero todas pasan por `estadoPublicacion`
  (`worker/lib/ajustes.js`) y devuelven `{ publicado, visible }`: si el torneo no está publicado y
  quien pide no es el admin, responden 200 con `visible: false` y los datos vacíos.
- `worker/routes/admin.js` — CRUD de equipos, jugadores/plantillas y partidos/resultados, más
  `POST /api/admin/equipos/importar` (alta masiva de equipos desde texto pegado; con
  `previsualizar: true` no escribe nada) y `GET/PUT /api/admin/ajustes` (interruptor de publicación).
- `worker/lib/` — `http.js` (respuestas JSON, `clean`, `escapeHtml`, `parseId`),
  `auth.js` (cookie de sesión firmada con HMAC-SHA256), `xlsx.js` (parseo del Excel de plantillas),
  `ajustes.js` (interruptores `torneo_publico` y `subidas_abiertas`, y `estadoPublicacion`),
  `entregas.js` (slug + código aleatorio de los enlaces por club, y lectura de la plantilla).
- `public/` — sitio estático servido tal cual: `index.html` (landing), `torneo.html`,
  `equipo.html`, `jugador.html`, `admin.html`, más `css/`, `js/`, `img/` y
  `plantillas/plantilla-modelo.xlsx`.

## Ejecutar y desplegar

```bash
npm install
npm run dev      # wrangler dev  → http://localhost:8787
npm run deploy   # wrangler deploy
```

El proyecto de Cloudflare está conectado a Git, así que un `git push` también puede desplegar.
Los secretos (`ADMIN_PASSWORD`, `SESSION_SECRET`, `RESEND_API_KEY`) van como secretos del
Worker, nunca en `wrangler.toml`; en local van en `.dev.vars` (ignorado por git). En
`wrangler.toml` solo hay variables no sensibles (`NOTIFY_EMAIL`, `FROM_EMAIL`).

## Base de datos

- `schema.sql` — tabla **`inscripciones`**: una fila por formulario enviado (`club`,
  `categorias` como texto separado por comas, `ciudad`, contacto, `comentarios`).
  No la lee ninguna pantalla: se consulta por CLI (ver README).
- `schema_torneo.sql` — módulo de torneo:
  - **`teams`**: equipo (nombre, `category` U9-U12, `group_name`, ciudad, logo).
  - **`players`**: plantilla de un equipo (`dorsal`, `nombre`, `apellidos`,
    `fecha_nacimiento`, `dni`). Borrado en cascada al borrar el equipo.
  - **`matches`**: partido (`category`, `phase` = `grupos`/`oro`/`plata`/`bronce`,
    `group_name` o `round_name`, equipos, marcador, `played`, `scheduled_at`, `venue`).
  - **`goals`**: goles de un jugador en un partido (`count` = cuántos).
- `schema_ajustes.sql` — tabla **`settings`** (`key`/`value`): `torneo_publico` (`'0'` = modo interno,
  `'1'` = publicado) y `subidas_abiertas` (`'0'` = plazo cerrado para los clubes).
- `schema_entregas.sql` — **`upload_links`** (una fila por equipo: `slug` único con el código aleatorio,
  `last_upload_at`, `last_upload_count`) y **`staff`** (cuerpo técnico del equipo: `nombre`, `apellidos`,
  `cargo`, `dni`). Las crea también `ensureEntregasTables` al generar los enlaces.

Los dos ficheros son idempotentes (`CREATE TABLE IF NOT EXISTS`) y se aplican a mano con
`wrangler d1 execute`. No hay sistema de migraciones: un cambio de esquema es SQL manual.

## Convenciones

- **Todo de cara al usuario en español**: textos, mensajes de error de la API, endpoints
  (`/api/equipos`, `/api/jugadores`, `/api/clasificacion`).
- **Nombres mezclados a propósito**: las tablas del torneo y sus claves están en inglés
  (`teams`, `players`, `matches`, `goals`, `home_team_id`), pero las columnas de datos
  personales y la tabla `inscripciones` están en español (`nombre`, `apellidos`,
  `fecha_nacimiento`, `dni`). Respeta lo que ya hay en cada tabla.
- **Commits en español, una línea, empezando por infinitivo** ("Añadir…", "Ajustar…",
  "Permitir…"). Sin prefijos tipo `feat:`.
- Sin framework ni build: JS a mano, HTML por plantillas de string, CSS con variables.

## Trampas no obvias

- **Los ficheros de `public/` nunca llegan al Worker**: Cloudflare sirve el asset antes de
  ejecutar el código. El `fetch` del Worker solo ve rutas que no existen como fichero.
  Por eso el binding `ASSETS` está declarado pero no se usa en el código.
- **`admin.html` es un fichero público**: cualquiera puede abrirlo. La protección real está
  en `requireAdmin` sobre `/api/admin/*`, no en la página. No metas datos sensibles en el HTML.
- **Las variables CSS mienten**: `--blue-900/700/500` contienen naranjas (`#ff7900`). Es
  herencia de la paleta anterior; cambiar el nombre obliga a tocar los tres CSS.
- **`public/js/*.js` son scripts clásicos, no módulos**: las funciones de `utils.js`
  (`escapeHtml`, `fetchJson`, `formatFecha…`) son globales y `utils.js` debe ir **antes** del
  script de la página en el HTML. En `worker/` sí se usan `import`/`export` de ESM.
- **Subir una plantilla Excel reemplaza la plantilla entera**: `handleUploadPlantilla` borra los
  `goals` de los jugadores del equipo, luego `DELETE FROM players WHERE team_id = ?` y reinserta,
  así que los `players.id` cambian. Resubir el Excel de un equipo con partidos ya jugados le borra
  los goleadores: hay que volver a guardar esos resultados.
- **Guardar un resultado reescribe los goleadores**: `handleResultadoPartido` borra todos los
  `goals` del partido y vuelve a insertar los que lleguen. Mandar el marcador sin la lista
  `goals` deja el partido sin goleadores.
- **La clasificación no se almacena**: se calcula al vuelo con los partidos de `phase='grupos'`
  y `played=1`. Desempate: puntos → diferencia de goles → goles a favor → nombre.
- **La ruta `/api/admin/equipos/importar` va antes que `/api/admin/equipos/:id`** en `routeAdmin`.
  Si se invierte el orden, `importar` cae en el comodín `:id` y responde «Id inválido».
- **La subida de plantillas en lote es solo frontend**: `public/js/admin.js` adivina el equipo por el
  nombre del fichero (`proponerEquipo`) y va llamando al endpoint de siempre, uno a uno. No hay
  endpoint de lote en el Worker.
- **`CATEGORIAS_VALIDAS` (`U9`-`U12`) está duplicada en cuatro sitios**: los tres ficheros de
  `worker/routes/` y `public/js/admin.js`. Añadir o quitar una categoría exige tocarlos todos.
- **Ni el DNI ni la fecha de nacimiento salen por la API pública**: `public.js` no selecciona `dni`, y de
  la fecha solo devuelve `substr(fecha_nacimiento, 1, 4) AS anio_nacimiento`. El dato completo solo está en
  `/api/admin/equipos/:id/jugadores` y en `/api/plantilla/:slug` (el enlace del propio club). Mantenlo así:
  son datos de menores.
- **`wrangler d1 execute` sin `--remote` va a la base local** de `.wrangler/`, no a producción.
- **`subidas_abiertas` falla en ABIERTO**, al revés que `torneo_publico`: si falta la clave o peta la
  consulta, los clubes pueden seguir entregando. El enlace ya es el secreto; el plazo es comodidad, no
  seguridad. `torneo_publico`, en cambio, falla en cerrado.
- **`/plantilla/:slug` no es un fichero**: lo sirve el Worker con `env.ASSETS.fetch` (el binding que antes
  estaba declarado sin usar) devolviendo `subir-plantilla.html`, y si eso fallara, redirige a
  `/subir-plantilla.html?c=<slug>`. El JS de la página lee el slug de las dos formas. Ojo con la ruta
  estática `/plantillas/` (en plural): es la carpeta del Excel modelo, no tiene nada que ver.
- **El modo interno falla en cerrado**: si la tabla `settings` no existe o la consulta peta,
  `isTorneoPublico` devuelve `false`, es decir, el torneo queda oculto (nunca se filtra por error).
  `setTorneoPublico` hace `CREATE TABLE IF NOT EXISTS` antes de escribir, así que el panel funciona
  aunque nadie haya aplicado `schema_ajustes.sql`.
- **El admin ve el torneo aunque no esté publicado**: `estadoPublicacion` deja pasar las peticiones con
  cookie de sesión válida. Si tocas las rutas públicas, mantén ese comportamiento o el panel (que usa
  `/api/equipos` y `/api/partidos`) se queda sin datos.
