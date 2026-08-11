# Turia Cup — web del torneo

Cloudflare Worker con assets estáticos + D1 para el formulario de inscripción y el módulo de torneo.

## Estado actual (2026-08-11)

**En producción y funcionando en `turiacup.com`:**
- Landing con logo, colores de marca (#FF7900) y fotos reales del torneo (hero + galería)
- Categorías U9-U12 con sus fechas (26-28 dic / 20-21 mar)
- Formulario de inscripción (selección múltiple de categorías) → guarda en D1 → email de aviso a `info@turiacup.com` vía Resend, todo verificado en vivo
- Los pasos 1-7 de abajo ya están hechos (quedan como referencia/histórico, no como pendientes)

**Módulo de torneo (nuevo):**
- Página `torneo.html` con clasificaciones por grupo, resultados, próximos partidos y la fase final (secciones Oro/Plata/Bronce, cruces pendientes de definir)
- Ficha de equipo (`equipo.html`) con plantilla, próximos partidos y partidos jugados
- Ficha de jugador (`jugador.html`) con goles totales y desglose por partido
- Panel de administración (`admin.html`, sin enlace público — acceso por URL directa) para gestionar equipos, plantillas (subida por Excel) y partidos/resultados/goleadores
- Ver "Configurar el módulo de torneo" más abajo para desplegarlo

**Pendiente:**
- Vídeos del torneo (sección "Vídeos" con placeholders — sin material aún)
- Cruces concretos de la fase final (el modelo ya soporta Oro/Plata/Bronce, falta definir el bracket)

## Estructura

- `public/index.html`, `public/css/`, `public/js/`, `public/img/` — landing pública (info, categorías, galería, vídeos, inscripción). Todo lo que hay en `public/` se sirve tal cual.
- `public/torneo.html`, `public/equipo.html`, `public/jugador.html` — páginas públicas del módulo de torneo
- `public/admin.html` — panel de administración (login + gestión de equipos/plantillas/partidos)
- `public/plantillas/plantilla-modelo.xlsx` — plantilla Excel modelo para que los equipos rellenen su roster
- `worker/index.js` — router del Worker; despacha a `worker/routes/` y `worker/lib/`
- `worker/routes/inscripcion.js`, `worker/routes/public.js`, `worker/routes/admin.js` — endpoints de la API
- `worker/lib/http.js`, `worker/lib/auth.js`, `worker/lib/xlsx.js` — utilidades compartidas, sesión de admin y parseo de Excel
- `schema.sql` — esquema de la tabla `inscripciones`
- `schema_torneo.sql` — esquema del módulo de torneo (`teams`, `players`, `matches`, `goals`)
- `wrangler.toml` — configuración del Worker, el directorio de assets y el binding a D1

## Requisitos previos

- Cuenta de Cloudflare (la misma donde está `turiacup.com`)
- Node.js instalado
- `npm install` en la raíz del proyecto (instala Wrangler y la librería `xlsx` para leer las plantillas Excel)

## 1. Crear la base de datos D1

```bash
wrangler login
wrangler d1 create turiacup-db
```

Copia el `database_id` que devuelve el comando y pégalo en `wrangler.toml`.

Aplica el esquema:

```bash
wrangler d1 execute turiacup-db --remote --file=./schema.sql
wrangler d1 execute turiacup-db --remote --file=./schema_torneo.sql
```

(usa `--local` en vez de `--remote` para probar en tu máquina)

## 2. Probar en local

```bash
wrangler dev
```

Abre la URL que indique la terminal y prueba el formulario de inscripción.

## 3. Subir el código a GitHub

Ya está hecho: el repo vive en GitHub y cada `git push` puede disparar un nuevo deploy si el proyecto de Cloudflare está conectado a él.

## 4. Crear el proyecto en Cloudflare (Workers & Pages)

En el dashboard de Cloudflare:

1. **Workers & Pages → Create → Connect to Git**
2. Selecciona el repositorio del torneo
3. Cloudflare detecta `wrangler.toml` automáticamente (Worker + assets + binding D1 ya quedan definidos ahí, no hace falta configurarlos a mano en el dashboard)
4. Despliega

Si el binding a D1 no se aplica solo, revisa en **Settings → Bindings** que exista `DB → turiacup-db`.

## 5. Conectar el dominio turiacup.com

En el propio proyecto: **Settings → Domains & Routes → Add** → introduce `turiacup.com` (y opcionalmente `www.turiacup.com`). Como el dominio ya está en Cloudflare, el DNS se configura automáticamente.

## 6. Fotos y vídeos reales

- **Fotos**: ✅ hecho — `public/img/hero/hero-bg.jpg` y `public/img/gallery/gallery-1..8.jpg`, seleccionadas del archivo oficial del torneo (WAVESPRO MEDIA)
- **Vídeos**: pendiente. Cuando haya material, sustituye los `.video-placeholder` en `public/index.html` por un iframe embed de YouTube/Vimeo, ej.:
  ```html
  <div class="video-item">
    <iframe src="https://www.youtube.com/embed/VIDEO_ID" allowfullscreen></iframe>
  </div>
  ```

## Ver las inscripciones recibidas

```bash
wrangler d1 execute turiacup-db --remote --command="SELECT * FROM inscripciones ORDER BY created_at DESC"
```

## 7. Notificación por email de cada inscripción

✅ Ya configurado y verificado en producción. Cada inscripción envía un email a `info@turiacup.com` (configurable en `wrangler.toml`, variable `NOTIFY_EMAIL`) usando [Resend](https://resend.com). Pasos por si hay que repetirlos en otro proyecto o el dominio pierde la verificación:

1. Crea una cuenta gratuita en resend.com (hasta 3.000 emails/mes gratis)
2. **Domains → Add Domain** → introduce `turiacup.com`
3. Resend te da unos registros DNS (TXT/DKIM/MX) para verificar el dominio. Añádelos en el dashboard de Cloudflare, en **turiacup.com → DNS → Records** (como el dominio ya está en Cloudflare, es cuestión de copiar y pegar cada registro)
4. Espera a que el dominio aparezca como "Verified" en Resend (puede tardar unos minutos)
5. **API Keys → Create API Key** → cópiala
6. Añádela como secreto del Worker (no va en `wrangler.toml` para no exponerla en el repo):
   - Dashboard: proyecto `turiacup` → **Settings → Variables and Secrets → Add → Secret** → nombre `RESEND_API_KEY`, valor la clave de Resend
   - O por CLI: `wrangler secret put RESEND_API_KEY`

Si `RESEND_API_KEY` no está configurada, el formulario sigue funcionando con normalidad (solo guarda en D1) — el envío de email es silencioso y no bloquea la inscripción si falla.

## 8. Configurar el panel de administración del torneo

El panel (`/admin.html`) usa un único usuario admin con contraseña compartida. Hacen falta dos secretos del Worker (igual que `RESEND_API_KEY`, no van en `wrangler.toml`):

```bash
wrangler secret put ADMIN_PASSWORD
wrangler secret put SESSION_SECRET
```

- `ADMIN_PASSWORD`: la contraseña de acceso al panel.
- `SESSION_SECRET`: una cadena aleatoria larga (p. ej. `openssl rand -hex 32`) usada para firmar la cookie de sesión. Cámbiala y todas las sesiones activas se invalidan.

Para probar en local, crea un fichero `.dev.vars` en la raíz (ya está en `.gitignore`, no se sube al repo):

```
ADMIN_PASSWORD=tu-contraseña-local
SESSION_SECRET=cualquier-cadena-larga-de-prueba
```

Con eso, `wrangler dev` levanta el panel en `http://localhost:8787/admin.html`.

### Uso del panel

1. **Equipos**: alta/edición/baja, con categoría (U9-U12), grupo de fase de grupos y ciudad.
2. **Plantillas**: selecciona un equipo y sube su Excel (descarga el modelo desde el propio panel — columnas Dorsal, Nombre, Apellidos, Fecha de nacimiento, DNI). Cada subida sustituye la plantilla completa; los datos ya importados se pueden corregir fila a fila sin volver a subir el fichero. El DNI nunca se muestra en las páginas públicas.
3. **Partidos**: alta de partido (categoría, fase — grupos u Oro/Plata/Bronce —, grupo o ronda, equipos, fecha, sede) y registro de resultado con los goleadores de cada equipo; los goles quedan asociados al perfil público de cada jugador. La clasificación de cada grupo se calcula automáticamente a partir de los partidos jugados, no hace falta mantenerla a mano.

## Próximos pasos (fuera del alcance actual)

- Cruces concretos de la fase final (semifinales/final de Oro, Plata y Bronce) — el modelo de datos ya soporta las 3 secciones, falta definir el formato exacto
- Gestión de campos y horarios
- Panel de administración para ver/exportar inscripciones sin usar la CLI
