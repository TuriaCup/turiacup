# Turia Cup — web del torneo

Cloudflare Worker con assets estáticos + D1 para el formulario de inscripción.

## Estructura

- `public/index.html`, `public/css/`, `public/js/`, `public/img/` — landing pública (info, categorías, galería, vídeos, inscripción). Todo lo que hay en `public/` se sirve tal cual.
- `worker/index.js` — Worker que atiende `POST /api/inscripcion` y guarda en D1 (todo lo demás lo sirven los assets estáticos automáticamente)
- `schema.sql` — esquema de la tabla `inscripciones`
- `wrangler.toml` — configuración del Worker, el directorio de assets y el binding a D1

## Requisitos previos

- Cuenta de Cloudflare (la misma donde está `turiacup.com`)
- Node.js instalado
- Wrangler CLI: `npm install -g wrangler`

## 1. Crear la base de datos D1

```bash
wrangler login
wrangler d1 create turiacup-db
```

Copia el `database_id` que devuelve el comando y pégalo en `wrangler.toml`.

Aplica el esquema:

```bash
wrangler d1 execute turiacup-db --remote --file=./schema.sql
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

## 6. Añadir fotos y vídeos reales

- **Fotos**: sustituye los `.gallery-item.placeholder` en `public/index.html` por `<img src="img/nombre.jpg" alt="...">`, con los archivos en `public/img`
- **Vídeos**: sustituye los `.video-placeholder` por un iframe embed de YouTube/Vimeo, ej.:
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

Cada inscripción envía un email a `info@turiacup.com` (configurable en `wrangler.toml`, variable `NOTIFY_EMAIL`) usando [Resend](https://resend.com).

1. Crea una cuenta gratuita en resend.com (hasta 3.000 emails/mes gratis)
2. **Domains → Add Domain** → introduce `turiacup.com`
3. Resend te da unos registros DNS (TXT/DKIM/MX) para verificar el dominio. Añádelos en el dashboard de Cloudflare, en **turiacup.com → DNS → Records** (como el dominio ya está en Cloudflare, es cuestión de copiar y pegar cada registro)
4. Espera a que el dominio aparezca como "Verified" en Resend (puede tardar unos minutos)
5. **API Keys → Create API Key** → cópiala
6. Añádela como secreto del Worker (no va en `wrangler.toml` para no exponerla en el repo):
   - Dashboard: proyecto `turiacup` → **Settings → Variables and Secrets → Add → Secret** → nombre `RESEND_API_KEY`, valor la clave de Resend
   - O por CLI: `wrangler secret put RESEND_API_KEY`

Si `RESEND_API_KEY` no está configurada, el formulario sigue funcionando con normalidad (solo guarda en D1) — el envío de email es silencioso y no bloquea la inscripción si falla.

## Próximos pasos (fuera del alcance actual)

- Módulo de clasificaciones, resultados y cruces
- Gestión de campos y horarios
- Panel de administración para ver/exportar inscripciones sin usar la CLI
