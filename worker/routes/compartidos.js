/**
 * GET /c/:codigo — páginas que solo se ven con el enlace (propuestas de calendario para el comité, etc.).
 * El HTML está en la tabla `compartidos` de la D1, nunca en public/: el repo de GitHub es público.
 * Sin auth: el secreto es el código. Si no existe (o la tabla no existe), 404 sin más detalle.
 */
export async function handleCompartido(request, env, codigo) {
  const noEncontrado = () => new Response('Not found', { status: 404 });
  if (!/^[a-z0-9]{16,64}$/i.test(codigo || '')) return noEncontrado();

  let fila;
  try {
    fila = await env.DB.prepare('SELECT html FROM compartidos WHERE codigo = ?').bind(codigo).first();
  } catch {
    return noEncontrado();
  }
  if (!fila) return noEncontrado();

  return new Response(fila.html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
