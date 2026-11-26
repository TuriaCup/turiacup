-- Venta de entradas con Stripe. Idempotente: se puede aplicar las veces que haga falta.
-- (El Worker también crea estas tablas solo, con ensureEntradasTables, la primera vez que se usan.)

-- Tipos de entrada que se ponen a la venta (los gestiona el admin).
CREATE TABLE IF NOT EXISTS entradas_tipos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio_cents INTEGER NOT NULL,          -- en céntimos: 500 = 5,00 €
  stock INTEGER,                          -- NULL = sin límite
  abono INTEGER NOT NULL DEFAULT 0,       -- 1 = vale para entrar una vez cada día; 0 = una sola entrada
  activo INTEGER NOT NULL DEFAULT 1,      -- 0 = no se ve en la página de compra
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Un pedido = una compra (una sesión de pago de Stripe). `codigo` es el secreto del enlace /entradas/<codigo>.
CREATE TABLE IF NOT EXISTS entradas_pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  telefono TEXT,
  total_cents INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | pagado | caducado | reembolsado
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT,
  email_enviado_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_entradas_pedidos_session ON entradas_pedidos(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_entradas_pedidos_pi ON entradas_pedidos(stripe_payment_intent);

-- Qué se compró en cada pedido (copia del nombre y precio del momento de la compra).
CREATE TABLE IF NOT EXISTS entradas_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES entradas_pedidos(id) ON DELETE CASCADE,
  tipo_id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  precio_cents INTEGER NOT NULL,
  cantidad INTEGER NOT NULL
);

-- Una fila por entrada (un QR). Se crean cuando Stripe confirma el pago.
CREATE TABLE IF NOT EXISTS entradas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES entradas_pedidos(id) ON DELETE CASCADE,
  tipo_id INTEGER NOT NULL,
  tipo_nombre TEXT NOT NULL,
  abono INTEGER NOT NULL DEFAULT 0,
  codigo TEXT NOT NULL UNIQUE,            -- lo que lleva el QR
  anulada INTEGER NOT NULL DEFAULT 0,     -- 1 = reembolsada: ya no deja entrar
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cada vez que se escanea una entrada válida en la puerta. `dia` es la fecha en hora de Madrid.
CREATE TABLE IF NOT EXISTS entradas_accesos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entrada_id INTEGER NOT NULL REFERENCES entradas(id) ON DELETE CASCADE,
  dia TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_entradas_accesos_entrada ON entradas_accesos(entrada_id);
