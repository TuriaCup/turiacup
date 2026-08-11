import * as XLSX from 'xlsx';

const HEADER_ALIASES = {
  dorsal: ['dorsal', 'nº', 'no', 'numero', 'número'],
  nombre: ['nombre'],
  apellidos: ['apellidos', 'apellido'],
  fecha_nacimiento: ['fecha de nacimiento', 'fecha nacimiento', 'nacimiento', 'fecha'],
  dni: ['dni', 'documento', 'pasaporte'],
};

function normalizeHeader(h) {
  return String(h ?? '').trim().toLowerCase();
}

function matchHeaderKey(header) {
  const norm = normalizeHeader(header);
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(norm)) return key;
  }
  return null;
}

function parseFecha(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const str = String(value ?? '').trim();
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const m = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

/**
 * @param {Uint8Array} buffer
 * @returns {{ rows: Array<{dorsal: number|null, nombre: string, apellidos: string, fecha_nacimiento: string|null, dni: string|null}>, errors: Array<{row: number, message: string}> }}
 */
export function parseRosterExcel(buffer) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  } catch {
    return { rows: [], errors: [{ row: 0, message: 'No se pudo leer el fichero. ¿Es un .xlsx válido?' }] };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { rows: [], errors: [{ row: 0, message: 'El fichero no tiene hojas.' }] };

  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (raw.length === 0) return { rows: [], errors: [{ row: 0, message: 'El fichero está vacío.' }] };

  const headerRow = raw[0];
  const colIndex = {};
  headerRow.forEach((h, i) => {
    const key = matchHeaderKey(h);
    if (key) colIndex[key] = i;
  });

  const missing = ['nombre', 'apellidos'].filter((k) => !(k in colIndex));
  if (missing.length) {
    return { rows: [], errors: [{ row: 0, message: `Faltan columnas obligatorias: ${missing.join(', ')}.` }] };
  }

  const rows = [];
  const errors = [];
  const get = (line, key) => (key in colIndex ? line[colIndex[key]] : '');

  for (let i = 1; i < raw.length; i++) {
    const line = raw[i];
    if (!line || line.every((c) => String(c ?? '').trim() === '')) continue;

    const rowNum = i + 1;
    const nombre = String(get(line, 'nombre') ?? '').trim();
    const apellidos = String(get(line, 'apellidos') ?? '').trim();
    if (!nombre || !apellidos) {
      errors.push({ row: rowNum, message: 'Nombre y apellidos son obligatorios.' });
      continue;
    }
    if (nombre.length > 120 || apellidos.length > 120) {
      errors.push({ row: rowNum, message: 'Nombre o apellidos demasiado largos.' });
      continue;
    }

    let dorsal = null;
    const dorsalRaw = get(line, 'dorsal');
    if (dorsalRaw !== '' && dorsalRaw !== undefined) {
      const n = Number(dorsalRaw);
      if (!Number.isInteger(n) || n < 0) {
        errors.push({ row: rowNum, message: `Dorsal inválido: "${dorsalRaw}".` });
        continue;
      }
      dorsal = n;
    }

    let fechaNacimiento = null;
    const fechaRaw = get(line, 'fecha_nacimiento');
    if (fechaRaw !== '' && fechaRaw !== undefined) {
      fechaNacimiento = parseFecha(fechaRaw);
      if (!fechaNacimiento) {
        errors.push({ row: rowNum, message: `Fecha de nacimiento inválida: "${fechaRaw}".` });
        continue;
      }
    }

    const dni = String(get(line, 'dni') ?? '').trim().slice(0, 20) || null;

    rows.push({ dorsal, nombre, apellidos, fecha_nacimiento: fechaNacimiento, dni });
  }

  return { rows, errors };
}
