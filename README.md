# Turia Cup — web del torneo

Sitio estático (HTML/CSS/JS) + Cloudflare Pages Functions + D1 para el formulario de inscripción.

## Estructura

- `index.html`, `css/`, `js/` — landing pública (info, categorías, galería, vídeos, inscripción)
- `functions/api/inscripcion.js` — endpoint que recibe el formulario y lo guarda en D1
- `schema.sql` — esquema de la tabla `inscripciones`
- `wrangler.toml` — configuración del proyecto y del binding a D1

## Requisitos previos

- Cuenta de Cloudflare (la misma donde está `turiacup.com`)
- Node.js instalado
- Wrangler CLI: `npm install -g wrangler`

## 1. Crear la base de datos D1

```bash
wrangler login
wrangler d1 create turiacup-db
```

Copia el `database_id` que devuelve el comando y pégalo en `wrangler.toml` en lugar de `REPLACE_WITH_D1_DATABASE_ID`.

Aplica el esquema:

```bash
wrangler d1 execute turiacup-db --remote --file=./schema.sql
```

(usa `--local` en vez de `--remote` para probar en tu máquina con `wrangler pages dev`)

## 2. Probar en local

```bash
wrangler pages dev . --d1=DB=turiacup-db
```

Abre `http://localhost:8788` y prueba el formulario de inscripción.

## 3. Subir el código a GitHub

Crea un repositorio nuevo en GitHub y sube este proyecto (`git init`, `git add`, `git commit`, `git remote add origin ...`, `git push`).

## 4. Crear el proyecto en Cloudflare Pages

En el dashboard de Cloudflare:

1. **Workers & Pages → Create → Pages → Connect to Git**
2. Selecciona el repositorio `turiacup-web`
3. Framework preset: **None**. Build command: (vacío). Build output directory: `/`
4. En **Settings → Functions → D1 database bindings**, añade el binding `DB` apuntando a `turiacup-db`
5. Despliega

## 5. Conectar el dominio turiacup.com

En el propio proyecto de Pages: **Custom domains → Set up a custom domain** → introduce `turiacup.com` (y opcionalmente `www.turiacup.com`). Como el dominio ya está en Cloudflare, el DNS se configura automáticamente.

## 6. Añadir fotos y vídeos reales

- **Fotos**: sustituye los `.gallery-item.placeholder` en `index.html` por `<img src="img/nombre.jpg" alt="...">`, con los archivos en `/img`
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

## Próximos pasos (fuera del alcance actual)

- Módulo de clasificaciones, resultados y cruces
- Gestión de campos y horarios
- Panel de administración para ver/exportar inscripciones sin usar la CLI
