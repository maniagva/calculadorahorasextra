/**
 * LaborCalc – Calculadora de Horas Extra Colombia
 * script.js
 *
 * Módulos:
 *  1. Configurar PDF.js worker
 *  2. Constantes legales colombianas
 *  3. Utilidades de formato
 *  4. Lógica de cálculo
 *  5. Parser de PDF
 *  6. Gestión de UI (inputs, upload, resultados)
 *  7. Bootstrapping
 */

'use strict';

/* ══════════════════════════════════════════════════════
   1. PDF.js WORKER
   ══════════════════════════════════════════════════════ */
if (typeof pdfjsLib !== 'undefined') {
  // Worker local – evita errores cross-origin al abrir desde file://
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
}

/* ══════════════════════════════════════════════════════
   2. CONSTANTES LEGALES (CST + Ley 2101/2021)
   ══════════════════════════════════════════════════════ */

/**
 * Factores de recargo sobre el valor de la hora ordinaria.
 * Factor = (1 + porcentaje de recargo).
 * Referencia: Arts. 168, 179-180 CST; Decreto 1258/1994.
 */
const RECARGOS = {
  // Hora extra diurna entre semana (6 AM – 7 PM)   → +25%
  EXTRA_DIURNA: 1.25,
  // Hora extra nocturna entre semana (7 PM – 6 AM)  → +75%
  EXTRA_NOCTURNA: 1.75,
  // Recargo nocturno ORDINARIO (sin hora extra)      → +35%
  RECARGO_NOCTURNO: 1.35,
  // Hora ordinaria dominical/festiva diurno          → +75%
  DOMINICAL_DIURNO: 1.75,
  // Hora ordinaria dominical/festiva nocturno        → +110%
  DOMINICAL_NOCTURNO: 2.10,
  // Hora EXTRA dominical/festiva diurna              → +100%
  EXTRA_DOMINICAL_DIURNO: 2.00,
  // Hora EXTRA dominical/festiva nocturna            → +150%
  EXTRA_DOMINICAL_NOCTURO: 2.50,
};

/** Meses en un año (para dividir salario mensual → valor hora). */
const MESES_AÑO = 12;

/* ══════════════════════════════════════════════════════
   3. UTILIDADES
   ══════════════════════════════════════════════════════ */

/**
 * Formatea un número como moneda COP sin decimales.
 * @param {number} value
 * @returns {string}
 */
function formatCOP(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

/**
 * Parsea un string de número con puntos/comas colombianos a float.
 * Ej: "2.500.000" → 2500000 | "2,500,000" → 2500000
 * @param {string} str
 * @returns {number}
 */
function parseSalary(str) {
  if (!str) return 0;
  // Eliminar todo excepto dígitos
  const clean = str.replace(/[^\d]/g, '');
  return parseFloat(clean) || 0;
}

/**
 * Formatea texto de input de salario agregando puntos de miles.
 * @param {string} raw valor sin formato
 * @returns {string}
 */
function formatSalaryInput(raw) {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  return new Intl.NumberFormat('es-CO').format(parseInt(digits, 10));
}

/**
 * Lee el valor de un input numérico de horas.
 * @param {string} id  ID del elemento
 * @returns {number}
 */
function getHoursValue(id) {
  const el = document.getElementById(id);
  const val = parseFloat(el?.value);
  return isNaN(val) || val < 0 ? 0 : val;
}

/**
 * Muestra un toast de notificación.
 * @param {string} msg
 * @param {'success'|'error'|'info'} type
 */
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  const msgEl = document.getElementById('toast-msg');

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  icon.textContent = icons[type] ?? '✅';
  msgEl.textContent = msg;

  toast.classList.remove('hidden');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.add('hidden'), 4000);
}

/* ══════════════════════════════════════════════════════
   4. LÓGICA DE CÁLCULO
   ══════════════════════════════════════════════════════ */

/**
 * Calcula el valor de la hora ordinaria.
 * Fórmula: Salario mensual / (jornada_semanal × 52 semanas / 12 meses)
 *
 * @param {number} salarioMensual  Salario mensual en COP
 * @param {number} jornadaSemanal  Horas de jornada legal semanal (42–47)
 * @returns {number} Valor de la hora ordinaria
 */
function calcHoraOrdinaria(salarioMensual, jornadaSemanal) {
  // Horas mensuales = (jornada_semanal * 52) / 12
  const horasMensuales = (jornadaSemanal * 52) / MESES_AÑO;
  return salarioMensual / horasMensuales;
}

/**
 * Objeto de horas para el cálculo.
 * @typedef {Object} HorasInput
 * @property {number} extraDiurna            Horas extra diurnas entre semana
 * @property {number} extraNocturna          Horas extra nocturnas entre semana
 * @property {number} recargo_nocturno       Horas nocturnas ordinarias
 * @property {number} dominicalDiurno        Horas dominicales/festivas diurnas ordinarias
 * @property {number} dominicalNocturno      Horas dominicales/festivas nocturnas ordinarias
 * @property {number} extraDominicalDiurno   Horas extra dominical diurnas
 * @property {number} extraDominicalNocturno Horas extra dominical nocturnas
 */

/**
 * Calcula el desglose completo de pagos por horas extra y recargos.
 *
 * @param {number}     salarioMensual
 * @param {number}     jornadaSemanal
 * @param {HorasInput} horas
 * @returns {{ lineas: Array, total: number, horaOrdinaria: number }}
 */
function calcularHorasExtra(salarioMensual, jornadaSemanal, horas) {
  const horaOrdinaria = calcHoraOrdinaria(salarioMensual, jornadaSemanal);

  const items = [
    {
      tipo: 'Hora extra diurna (entre semana 6 AM–7 PM)',
      tagClass: 'tag-extra',
      horas: horas.extraDiurna,
      factor: RECARGOS.EXTRA_DIURNA,
      recargo: '+25%',
    },
    {
      tipo: 'Hora extra nocturna (entre semana 7 PM–6 AM)',
      tagClass: 'tag-nocturno',
      horas: horas.extraNocturna,
      factor: RECARGOS.EXTRA_NOCTURNA,
      recargo: '+75%',
    },
    {
      tipo: 'Recargo nocturno ordinario (7 PM–6 AM)',
      tagClass: 'tag-recargo',
      horas: horas.recargoNocturno,
      factor: RECARGOS.RECARGO_NOCTURNO,
      recargo: '+35%',
    },
    {
      tipo: 'Dominical/Festivo diurno ordinario',
      tagClass: 'tag-dominical',
      horas: horas.dominicalDiurno,
      factor: RECARGOS.DOMINICAL_DIURNO,
      recargo: '+75%',
    },
    {
      tipo: 'Dominical/Festivo nocturno ordinario',
      tagClass: 'tag-dominical',
      horas: horas.dominicalNocturno,
      factor: RECARGOS.DOMINICAL_NOCTURNO,
      recargo: '+110%',
    },
    {
      tipo: 'Hora extra Dominical/Festivo diurna',
      tagClass: 'tag-extra',
      horas: horas.extraDominicalDiurno,
      factor: RECARGOS.EXTRA_DOMINICAL_DIURNO,
      recargo: '+100%',
    },
    {
      tipo: 'Hora extra Dominical/Festivo nocturna',
      tagClass: 'tag-nocturno',
      horas: horas.extraDominicalNocturno,
      factor: RECARGOS.EXTRA_DOMINICAL_NOCTURO,
      recargo: '+150%',
    },
  ];

  let totalHoras = 0;
  let total = 0;

  const lineas = items.map((item) => {
    const valorUnitario = horaOrdinaria * item.factor;
    const subtotal = valorUnitario * item.horas;
    totalHoras += item.horas;
    total += subtotal;
    return { ...item, valorUnitario, subtotal };
  });

  return { lineas, total, totalHoras, horaOrdinaria };
}

/* ══════════════════════════════════════════════════════
   5. API KEY
   ══════════════════════════════════════════════════════
   La API key vive en las variables de entorno de Vercel
   (GROQ_API_KEY) y nunca llega al navegador.
   El frontend llama a /api/groq (serverless proxy).
   ══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   6. PARSER DE PDF  (PDF.js  +  Groq AI)
   ══════════════════════════════════════════════════════ */

/**
 * Extrae texto digital del PDF y el objeto pdf (para reutilizarlo en renderizado).
 * @param {File} file
 * @param {function} onProgress
 * @returns {Promise<{text: string, pdf: object}>}
 */
async function extractTextFromPDF(file, onProgress) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  const total = pdf.numPages;
  for (let i = 1; i <= total; i++) {
    onProgress(Math.round((i / total) * 25), `Leyendo página ${i} de ${total}…`);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map((s) => s.str).join(' ') + '\n';
  }
  return { text: fullText, pdf };
}

/**
 * Renderiza las páginas del PDF como imágenes JPEG base64.
 * Permite que el modelo de visión lea texto manuscrito e impreso.
 * @param {object} pdf  objeto pdfjsLib ya cargado
 * @param {function} onProgress
 * @param {number} maxPages  máximo de páginas a renderizar (evitar tokens excesivos)
 * @returns {Promise<string[]>}  array de base64 JPEG
 */
async function renderPDFToImages(pdf, onProgress, maxPages = 4) {
  const total = Math.min(pdf.numPages, maxPages);
  const images = [];
  for (let i = 1; i <= total; i++) {
    onProgress(
      25 + Math.round((i / total) * 25),
      `Renderizando página ${i} de ${total} para OCR…`
    );
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.8 }); // resolución suficiente para manuscrito
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    // JPEG al 85% — buen balance calidad/tamaño (~150-400 KB por página)
    images.push(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
  }
  return images;
}

/* ══════════════════════════════════════════════════════
   FESTIVOS COLOMBIA – carga dinámica vía date.nager.at
   ══════════════════════════════════════════════════════ */

/**
 * Set de respaldo con los festivos 2026 (se usa si la API no responde).
 * Formato interno: 'DD/MM/YYYY'
 */
const FESTIVOS_FALLBACK_2026 = new Set([
  '01/01/2026', '12/01/2026', '23/03/2026', '02/04/2026', '03/04/2026',
  '01/05/2026', '18/05/2026', '08/06/2026', '15/06/2026', '29/06/2026',
  '20/07/2026', '07/08/2026', '17/08/2026', '12/10/2026', '02/11/2026',
  '16/11/2026', '08/12/2026', '25/12/2026',
]);

/** Caché en memoria: { 2026: Set{'DD/MM/YYYY', ...}, 2025: Set{...} } */
const _festivosCache = {};

/**
 * Convierte 'YYYY-MM-DD' (formato Nager) a 'DD/MM/YYYY' (formato interno).
 */
function isoToDDMMYYYY(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Obtiene el Set de festivos colombianos para un año dado.
 * Orden de prioridad:
 *  1. Cache en memoria (misma sesión)
 *  2. localStorage (TTL 30 días)
 *  3. API date.nager.at
 *  4. Fallback hardcoded (solo año 2026)
 *
 * @param {number} year
 * @returns {Promise<Set<string>>}  Set de 'DD/MM/YYYY'
 */
async function fetchFestivos(year) {
  // 1. Memoria
  if (_festivosCache[year]) return _festivosCache[year];

  // 2. localStorage
  const cacheKey = `festivos_co_${year}`;
  try {
    const stored = localStorage.getItem(cacheKey);
    if (stored) {
      const { ts, data } = JSON.parse(stored);
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
      if (Date.now() - ts < THIRTY_DAYS) {
        const s = new Set(data);
        _festivosCache[year] = s;
        console.log(`📅 Festivos ${year} desde cache local (${s.size} días).`);
        return s;
      }
    }
  } catch (_) { /* localStorage no disponible */ }

  // 3. API
  try {
    const res = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/CO`,
      { signal: AbortSignal.timeout(5000) }  // timeout 5 s
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const dates = json.map(h => isoToDDMMYYYY(h.date));
    const s = new Set(dates);
    _festivosCache[year] = s;

    // Guardar en localStorage
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: dates }));
    } catch (_) { }

    console.log(`📅 Festivos ${year} descargados de Nager.at (${s.size} días).`);
    return s;
  } catch (err) {
    console.warn(`⚠️ No se pudieron cargar festivos ${year} desde la API: ${err.message}. Usando respaldo.`);
  }

  // 4. Fallback
  const fallback = year === 2026 ? FESTIVOS_FALLBACK_2026 : new Set();
  _festivosCache[year] = fallback;
  return fallback;
}

/**
 * Sanea y corrige errores comunes de formato en las horas devueltas por el OCR.
 * Ejemplo: "07-00" -> "07:00", "07:00 AM" -> "07:00", "25:00" -> limpia/acota.
 * @param {string} t 
 * @returns {string} HH:MM
 */
function sanitizeTime(t) {
  if (!t) return '';
  t = t.toUpperCase().replace(/\s+/g, '');
  
  // Si usó guión o punto, cambiar a dos puntos
  t = t.replace(/[-.]/g, ':');
  
  // Extraer posibles AM/PM
  const isPM = t.includes('PM');
  const isAM = t.includes('AM');
  t = t.replace(/[A-Z]/g, ''); // Quitar letras (AM/PM)
  
  let [h, m] = t.split(':');
  if (!m && t.length === 4 && !t.includes(':')) {
     // Formato militar "0700" o "1700"
     h = t.slice(0, 2);
     m = t.slice(2, 4);
  } else if (!m) {
     m = '00';
  }
  
  let hNum = parseInt(h, 10);
  let mNum = parseInt(m, 10);
  
  if (isNaN(hNum) || isNaN(mNum)) return '';
  
  if (isPM && hNum < 12) hNum += 12;
  if (isAM && hNum === 12) hNum = 0;
  
  if (hNum > 23) hNum = 23; // sanity check simple
  if (mNum > 59) mNum = 59;
  
  return `${hNum.toString().padStart(2, '0')}:${mNum.toString().padStart(2, '0')}`;
}

/**
 * Pre-carga los festivos de todos los años presentes en los registros.
 * Retorna un Map { year → Set<'DD/MM/YYYY'> } para consulta O(1).
 *
 * @param {Array} registros  [{fecha:'DD/MM/YYYY', ...}]
 * @returns {Promise<Map<number,Set<string>>>}
 */
async function precargarFestivos(registros) {
  const years = [...new Set(registros.map(r => {
    const parts = r.fecha.split('/');
    return parseInt(parts[2], 10);
  }).filter(y => !isNaN(y)))];

  const entries = await Promise.all(
    years.map(async y => [y, await fetchFestivos(y)])
  );
  return new Map(entries);
}

/**
 * Convierte "HH:MM" a minutos desde medianoche.
 */
function toMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Minutos de intersección entre [a,b) y [c,d).
 */
function inter(a, b, c, d) {
  return Math.max(0, Math.min(b, d) - Math.max(a, c));
}

/**
 * Clasifica las horas de cada registro en 7 categorías usando álgebra de conjuntos.
 *
 * Para cada turno [ini, fin] se calculan 4 cuadrantes:
 *
 *          │ Dentro del horario │ Fuera del horario
 * ─────────┼────────────────────┼──────────────────
 * Diurno   │ Horas ordinarias   │ extraDiurna / extraDominicalDiurno
 * Nocturno │ recargoNocturno    │ extraNocturna / extraDominicalNocturno
 *
 * En días domingo/festivo, las horas ordinarias se cuentan como
 * dominicalDiurno / dominicalNocturno.
 *
 * @param {Array}  registros   [{fecha, ingreso, salida}]
 * @param {number} schedInicio minutos desde medianoche (ej. 480 = 08:00)
 * @param {number} schedFin    minutos desde medianoche (ej. 1020 = 17:00)
 * @param {number[]} workDays  días laborales (0=Dom…6=Sáb). El resto son días de descanso.
 */
async function calcularDesdeRegistros(registros, schedInicio = 420, schedFin = 1020, workDays = [1, 2, 3, 4, 5]) {
  // Pre-cargar festivos de cada año presente en los registros (API + cache)
  const festivosPorAnio = await precargarFestivos(registros);

  const D_I = 360;    // 06:00 AM
  const D_F = 1140;   // 07:00 PM
  const DIA = 1440;   // 24 × 60

  const acc = {
    extraDiurna: 0, extraNocturna: 0, recargoNocturno: 0,
    dominicalDiurno: 0, dominicalNocturno: 0,
    extraDominicalDiurno: 0, extraDominicalNocturno: 0,
  };

  registros.forEach(reg => {
    const [dd, mm, yyyy] = reg.fecha.split('/').map(Number);
    const fecha = new Date(yyyy, mm - 1, dd);
    const festivosAnio = festivosPorAnio.get(yyyy) || new Set();

    const esDominicalOFestivo = festivosAnio.has(reg.fecha) || fecha.getDay() === 0;
    // Si no está en los días laborales (Sábado/Domingo) o si es Festivo (ej. lunes festivo),
    // el día entero se considera descanso y TODO el tiempo trabajado será Hora Extra.
    const esDescanso = !workDays.includes(fecha.getDay()) || festivosAnio.has(reg.fecha);

    let ini = toMin(reg.ingreso);
    let fin = toMin(reg.salida);
    if (fin <= ini) fin += DIA; // cruce de medianoche

    const duracion = fin - ini;

    /*
     * Cálculo de intersecciones.
     * Si es el día de descanso del empleado, NO tiene horario laboral habitual ese día.
     * Por lo tanto, todas las horas son extra.
     */
    let inS = 0;
    let inSD = 0;

    if (!esDescanso) {
      inS = inter(ini, fin, schedInicio, schedFin) +
        inter(ini, fin, schedInicio + DIA, schedFin + DIA);

      const sdI = Math.max(schedInicio, D_I);
      const sdF = Math.min(schedFin, D_F);
      if (sdI < sdF) {
        inSD = inter(ini, fin, sdI, sdF) +
          inter(ini, fin, sdI + DIA, sdF + DIA);
      }
    }

    const inD = inter(ini, fin, D_I, D_F) +
      inter(ini, fin, D_I + DIA, D_F + DIA);

    /*
     * Los 4 cuadrantes (en minutos):
     *   regDay   = ordinario diurno  → no se liquida como extra
     *   regNight = ordinario nocturno → recargo nocturno (RN, +35%)
     *   extDay   = extra diurno      → HED (+25%) o HEDD (+100%)
     *   extNight = extra nocturno    → HEN (+75%) o HEDN (+150%)
     */
    const regDay = inSD;
    const regNight = inS - inSD;
    const extDay = inD - inSD;
    const extNight = duracion - inS - inD + inSD;

    if (esDominicalOFestivo) {
      // Domingo/festivo: las horas ordinarias también se pagan con recargo
      acc.dominicalDiurno += regDay / 60;
      acc.dominicalNocturno += regNight / 60;
      acc.extraDominicalDiurno += extDay / 60;
      acc.extraDominicalNocturno += extNight / 60;
    } else {
      // Semana (Lunes a Sábado no festivos)
      acc.recargoNocturno += regNight / 60;
      acc.extraDiurna += extDay / 60;
      acc.extraNocturna += extNight / 60;
    }
  });

  Object.keys(acc).forEach(k => { acc[k] = Math.round(acc[k] * 100) / 100; });
  return acc;
}

/**
 * Llama al proxy /api/groq con el modelo de visión llama-4-scout.
 * Envía las imágenes de las páginas + el texto digital (si existe).
 * El modelo lee tanto texto impreso como MANUSCRITO.
 * Devuelve {horas: HorasInput, nombre: string} — JS calcula las horas.
 */
async function extractHoursWithGroq(pdfText, images, onProgress, schedInicio = 480, schedFin = 1020, workDays = [1, 2, 3, 4, 5]) {
  onProgress(55, 'Analizando PDF con visión IA…');

  const systemPrompt =
    `Eres un experto en lectura de documentos de nómina colombiana.
Analizarás imágenes de un "REPORTE DE HORAS EXTRAS" que puede contener texto impreso Y texto escrito a mano.

Tu tarea: extraer el nombre del empleado Y todos los registros de tiempo visibles.

Devuelve ÚNICAMENTE un objeto JSON con el formato exacto:
{
  "nombre": "Nombre completo del empleado",
  "registros": [{"fecha":"DD/MM/YYYY","ingreso":"HH:MM","salida":"HH:MM"}]
}

Reglas:
- Busca el nombre en campos como "NOMBRES Y APELLIDOS", "EMPLEADO", "TRABAJADOR", o similar
- Convierte AM/PM a 24h: "04:09 AM"→"04:09", "05:00 PM"→"17:00", "10:21 PM"→"22:21"
- "12:00 PM" = "12:00", "12:00 AM" = "00:00", "23:59 PM" → "23:59"
- Incluye TODAS las filas con HORA INGRESO y HORA SALIDA (impresas y manuscritas)
- Ignora encabezados de tabla, totales, observaciones
- Si no encuentras el nombre, usa cadena vacía ""
- Sin markdown, sin explicaciones. Solo el JSON.

REGLAS DE FECHAS:
- Las fechas pueden venir en formato DD/MM/AA (dos dígitos para el año) o DD/MM/AAAA.
- Si el año tiene dos dígitos, conviértelo a cuatro dígitos añadiendo "20" al inicio (siglo XXI).
  Ejemplo: "23-03-26" → "23/03/2026", "15-12-99" → "15/12/2099".
- El separador puede ser "/" o "-"; normalízalo a "/".
- No uses el año 2025 ni ningún otro fijo; aplica siempre la regla del prefijo 20.`

    ;

  // Construir contenido multimodal: texto digital + imágenes
  const userContent = [];

  if (pdfText.trim()) {
    userContent.push({
      type: 'text',
      text: `Texto digital extraído del PDF (puede estar incompleto si hay texto manuscrito):\n\n${pdfText.slice(0, 4000)}`,
    });
  }

  images.slice(0, 4).forEach((b64, i) => {
    userContent.push({ type: 'text', text: `Página ${i + 1} del documento:` });
    userContent.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } });
  });

  userContent.push({
    type: 'text',
    text: 'Extrae el nombre del empleado y todos los registros de HORA INGRESO/HORA SALIDA. Devuelve el JSON.',
  });

  const response = await fetch('/api/groq', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${response.status}`);
  }

  onProgress(85, 'Calculando horas…');

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim() || '';

  console.group('🤖 Groq Visión – Datos extraídos');
  console.log('Raw:', content);
  console.log('Tokens:', data.usage);
  console.groupEnd();

  // Parsear el objeto JSON {nombre, registros}
  const objMatch = content.match(/\{[\s\S]*\}/);
  if (!objMatch) throw new Error(`Groq no devolvió JSON. Respuesta: ${content.slice(0, 200)}`);

  const parsed = JSON.parse(objMatch[0]);
  const nombre = (parsed.nombre || '').trim();
  const registros = parsed.registros;

  console.log('Nombre extraído:', nombre);
  console.log('Registros parseados:', registros);

  if (!Array.isArray(registros) || registros.length === 0) return { horas: null, nombre };

  // Normalización robusta para corregir posibles alucinaciones o formato literal de la IA
  registros.forEach(reg => {
    if (reg.fecha) {
      // 1. Normalizar guiones a barras
      reg.fecha = reg.fecha.replace(/-/g, '/');
      
      const parts = reg.fecha.split('/');
      if (parts.length === 3) {
        let y = parseInt(parts[2], 10);
        // 2. Corregir años de 2 dígitos (ej. "26" -> 2026)
        if (y < 100) {
          y += 2000;
          parts[2] = y.toString();
          reg.fecha = parts.join('/');
        }
      }
      // 3. Limpiar horas
      if (reg.ingreso) reg.ingreso = sanitizeTime(reg.ingreso);
      if (reg.salida) reg.salida = sanitizeTime(reg.salida);
    }
  });

  // Level 2: Interceptar el flujo aquí en lugar de calcular
  // return { horas: await calcularDesdeRegistros(registros, schedInicio, schedFin, workDays), nombre };
  return { registros, nombre };
}

/**
 * Parser regex de respaldo (sin IA).
 * @param {string} text
 * @returns {HorasInput|null}
 */
function parseHoursFromText(text) {
  let t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const acc = {
    extraDiurna: 0, extraNocturna: 0, recargoNocturno: 0,
    dominicalDiurno: 0, dominicalNocturno: 0,
    extraDominicalDiurno: 0, extraDominicalNocturno: 0,
  };
  let found = false;

  const N = '([0-9]+(?:[.,][0-9]+)?)'; // grupo numérico reutilizable

  const patterns = [
    // ── Nombres completos (etiqueta → número) ─────────────────────
    { re: new RegExp(`hora\\s+extra\\s+diurna[^0-9\\n]*${N}`, 'g'), key: 'extraDiurna' },
    { re: new RegExp(`hora\\s+extra\\s+nocturna[^0-9\\n]*${N}`, 'g'), key: 'extraNocturna' },
    { re: new RegExp(`recargo\\s+nocturno[^0-9\\n]*${N}`, 'g'), key: 'recargoNocturno' },
    { re: new RegExp(`nocturno\\s+ordinario[^0-9\\n]*${N}`, 'g'), key: 'recargoNocturno' },
    { re: new RegExp(`dominical\\s+diurno[^0-9\\n]*${N}`, 'g'), key: 'dominicalDiurno' },
    { re: new RegExp(`dominical\\s+nocturno[^0-9\\n]*${N}`, 'g'), key: 'dominicalNocturno' },
    { re: new RegExp(`festivo\\s+diurno[^0-9\\n]*${N}`, 'g'), key: 'dominicalDiurno' },
    { re: new RegExp(`festivo\\s+nocturno[^0-9\\n]*${N}`, 'g'), key: 'dominicalNocturno' },
    { re: new RegExp(`extra\\s+dominical\\s+diurna?[^0-9\\n]*${N}`, 'g'), key: 'extraDominicalDiurno' },
    { re: new RegExp(`extra\\s+dominical\\s+nocturna?[^0-9\\n]*${N}`, 'g'), key: 'extraDominicalNocturno' },
    // variantes: "hora dominical diurna/nocturna", "trabajo dominical/festivo"
    { re: new RegExp(`hora\\s+dominical\\s+diurna?[^0-9\\n]*${N}`, 'g'), key: 'dominicalDiurno' },
    { re: new RegExp(`hora\\s+dominical\\s+nocturna?[^0-9\\n]*${N}`, 'g'), key: 'dominicalNocturno' },
    { re: new RegExp(`trabajo\\s+(?:dominical|festivo)[^0-9\\n]*${N}`, 'g'), key: 'dominicalDiurno' },
    // variantes coloquiales: "horas extras diurnas", "extras diurnas"
    { re: new RegExp(`horas?\\s+extras?\\s+diurnas?[^0-9\\n]*${N}`, 'g'), key: 'extraDiurna' },
    { re: new RegExp(`horas?\\s+extras?\\s+nocturnas?[^0-9\\n]*${N}`, 'g'), key: 'extraNocturna' },
    { re: new RegExp(`extras?\\s+diurnas?[^0-9\\n]*${N}`, 'g'), key: 'extraDiurna' },
    { re: new RegExp(`extras?\\s+nocturnas?[^0-9\\n]*${N}`, 'g'), key: 'extraNocturna' },

    // ── Abreviaturas estándar (con espacio antes del número) ───────
    { re: /\bhed\b[^0-9\n]*([0-9]+(?:[.,][0-9]+)?)/gi, key: 'extraDiurna' },
    { re: /\bhen\b[^0-9\n]*([0-9]+(?:[.,][0-9]+)?)/gi, key: 'extraNocturna' },
    { re: /\brn\b[^0-9\n]*([0-9]+(?:[.,][0-9]+)?)/gi, key: 'recargoNocturno' },
    { re: /\bdd\b[^0-9\n]*([0-9]+(?:[.,][0-9]+)?)/gi, key: 'dominicalDiurno' },
    { re: /\bdn\b[^0-9\n]*([0-9]+(?:[.,][0-9]+)?)/gi, key: 'dominicalNocturno' },
    { re: /\bhedd\b[^0-9\n]*([0-9]+(?:[.,][0-9]+)?)/gi, key: 'extraDominicalDiurno' },
    { re: /\bhedn\b[^0-9\n]*([0-9]+(?:[.,][0-9]+)?)/gi, key: 'extraDominicalNocturno' },

    // ── Abreviaturas pegadas al número: HED2.5, HEN1,5 ───────────
    { re: /\bhed([0-9]+(?:[.,][0-9]+)?)/gi, key: 'extraDiurna' },
    { re: /\bhen([0-9]+(?:[.,][0-9]+)?)/gi, key: 'extraNocturna' },
    { re: /\brn([0-9]+(?:[.,][0-9]+)?)/gi, key: 'recargoNocturno' },
    { re: /\bhedd([0-9]+(?:[.,][0-9]+)?)/gi, key: 'extraDominicalDiurno' },
    { re: /\bhedn([0-9]+(?:[.,][0-9]+)?)/gi, key: 'extraDominicalNocturno' },

    // ── Formato tabla invertida: número → etiqueta ────────────────
    // ej. "2.5  hora extra diurna" o "1,0  HED"
    { re: new RegExp(`${N}[ \\t]+(?:hora[ \\t]+)?extra[ \\t]+diurna`, 'g'), key: 'extraDiurna' },
    { re: new RegExp(`${N}[ \\t]+(?:hora[ \\t]+)?extra[ \\t]+nocturna`, 'g'), key: 'extraNocturna' },
    { re: new RegExp(`${N}[ \\t]+recargo[ \\t]+nocturno`, 'g'), key: 'recargoNocturno' },
    { re: new RegExp(`${N}[ \\t]+(?:hora[ \\t]+)?dominical[ \\t]+diurna?`, 'g'), key: 'dominicalDiurno' },
    { re: new RegExp(`${N}[ \\t]+(?:hora[ \\t]+)?dominical[ \\t]+nocturna?`, 'g'), key: 'dominicalNocturno' },
    { re: new RegExp(`${N}[ \\t]+hed\\b`, 'gi'), key: 'extraDiurna' },
    { re: new RegExp(`${N}[ \\t]+hen\\b`, 'gi'), key: 'extraNocturna' },
    { re: new RegExp(`${N}[ \\t]+hedd\\b`, 'gi'), key: 'extraDominicalDiurno' },
    { re: new RegExp(`${N}[ \\t]+hedn\\b`, 'gi'), key: 'extraDominicalNocturno' },
    { re: new RegExp(`${N}[ \\t]+rn\\b`, 'gi'), key: 'recargoNocturno' },
    { re: new RegExp(`${N}[ \\t]+dd\\b`, 'gi'), key: 'dominicalDiurno' },
    { re: new RegExp(`${N}[ \\t]+dn\\b`, 'gi'), key: 'dominicalNocturno' },
  ];

  patterns.forEach(({ re, key }) => {
    re.lastIndex = 0; // resetear estado del regex global
    let match;
    while ((match = re.exec(t)) !== null) {
      // match[1] existe en la mayoría; para patrones invertidos puede ser match[1] directamente
      const raw = match[1] ?? match[0].match(/[0-9]+(?:[.,][0-9]+)?/)?.[0];
      const val = parseFloat((raw ?? '').replace(',', '.'));
      if (!isNaN(val) && val > 0 && val < 300) { // sanity cap: ignora valores absurdos
        acc[key] += val;
        found = true;
        // Reemplazar la coincidencia con espacios para evitar que otro patrón la vuelva a contar
        t = t.substring(0, match.index) + ' '.repeat(match[0].length) + t.substring(match.index + match[0].length);
      }
    }
  });

  // Redondear a 2 decimales para evitar basura de punto flotante
  Object.keys(acc).forEach(k => { acc[k] = Math.round(acc[k] * 100) / 100; });
  return found ? acc : null;
}


/* ══════════════════════════════════════════════════════
   PANEL DE FALLBACK – guía contextual al usuario
   ══════════════════════════════════════════════════════ */

/**
 * Muestra el panel de guía con mensaje específico según el tipo de fallo.
 * @param {'ai_error'|'ai_zero'|'ai_scanned'|'regex_only'|'total_fail'} reason
 * @param {string} [errorMsg]  detalle técnico opcional
 */
function showManualFallbackPanel(reason, errorMsg = '') {
  const panel = document.getElementById('fallback-panel');
  const titleEl = document.getElementById('fallback-title');
  const detailEl = document.getElementById('fallback-detail');
  const tipsEl = document.getElementById('fallback-tips');
  const ctaBtn = document.getElementById('fallback-cta-btn');
  if (!panel) return;

  const configs = {
    ai_zero: {
      t: 'La IA no encontró registros de horas',
      d: 'El modelo analizó el PDF pero no detectó filas con hora de ingreso y salida.',
      tips: [
        'Verifica que el PDF contenga una tabla con columnas «HORA INGRESO» y «HORA SALIDA».',
        'Si el texto está en una imagen, asegúrate de que esté nítida para el OCR.',
        'Puedes ingresar las horas manualmente en el formulario de abajo.',
      ],
    },
    ai_error: {
      t: 'Error al conectar con la IA',
      d: errorMsg ? `Groq respondió: "${errorMsg}"` : 'No se pudo contactar el servicio de IA.',
      tips: [
        'Comprueba tu conexión a internet.',
        'El servicio de Groq puede estar temporalmente no disponible.',
        'Ingresa las horas manualmente mientras se restablece el servicio.',
      ],
    },
    ai_scanned: {
      t: 'PDF escaneado o sin texto seleccionable',
      d: 'El PDF no tiene texto digital; la IA intentó leer la imagen con OCR.',
      tips: [
        'Si el OCR falló, la imagen puede estar borrosa o en baja resolución.',
        'Intenta subir un PDF generado digitalmente (no escaneado).',
        'Si no hay otra versión disponible, ingresa los datos manualmente.',
      ],
    },
    regex_only: {
      t: 'Datos parciales — revisa los valores',
      d: 'La IA no pudo procesar el archivo. Se usó detección por texto como respaldo.',
      tips: [
        'Revisa los campos autocompletados y corrige cualquier valor incorrecto.',
        'Los campos vacíos pueden indicar un formato de PDF no estándar.',
      ],
    },
    total_fail: {
      t: 'No se pudo extraer ningún dato',
      d: 'Ni la IA ni la detección clásica pudieron interpretar el archivo.',
      tips: [
        'El PDF puede estar protegido, dañado o en un formato no compatible.',
        'Verifica que el archivo sea un PDF válido con información de horas.',
        'Ingresa todas las horas manualmente usando el formulario de abajo.',
      ],
    },
  };

  const cfg = configs[reason] || configs.total_fail;
  titleEl.textContent = cfg.t;
  detailEl.textContent = cfg.d;
  tipsEl.innerHTML = cfg.tips.map(t => `<li>${t}</li>`).join('');
  panel.classList.remove('hidden');

  // CTA: scroll + highlight al card manual
  ctaBtn.onclick = () => {
    const card = document.getElementById('card-manual');
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.classList.add('card--highlight');
    setTimeout(() => card.classList.remove('card--highlight'), 2000);
  };
}

/** Oculta el panel de fallback (al subir un nuevo archivo). */
function hideFallbackPanel() {
  document.getElementById('fallback-panel')?.classList.add('hidden');
}

/**
 * Valida que los inputs de horario habitual sean coherentes.
 * Marca visualmente los inputs incorrectos con la clase input--error.
 *
 * Reglas:
 *  - Ambos campos deben tener valor
 *  - schedInicio < schedFin
 *  - Diferencia mínima de 1 hora
 *
 * @returns {{ ok: boolean, msg: string }}
 */
function validateSchedule() {
  const startEl = document.getElementById('schedule-start');
  const endEl = document.getElementById('schedule-end');

  // Limpiar errores previos
  startEl?.classList.remove('input--error');
  endEl?.classList.remove('input--error');

  const { schedInicio, schedFin } = getScheduleMinutes();

  if (!startEl?.value || !endEl?.value) {
    startEl?.classList.add('input--error');
    endEl?.classList.add('input--error');
    return { ok: false, msg: 'Completa los campos de inicio y fin de jornada habitual.' };
  }

  if (schedInicio >= schedFin) {
    startEl?.classList.add('input--error');
    endEl?.classList.add('input--error');
    return {
      ok: false,
      msg: `La hora de inicio (${startEl.value}) debe ser anterior al fin (${endEl.value}).`,
    };
  }

  if (schedFin - schedInicio < 60) {
    endEl?.classList.add('input--error');
    return { ok: false, msg: 'La jornada habitual debe durar al menos 1 hora.' };
  }

  return { ok: true, msg: '' };
}

/**
 * Lee los inputs de jornada y devuelve {schedInicio, schedFin, workDays}.
 * workDays está fijo como lunes a viernes [1,2,3,4,5].
 * Sábado (6), domingo (0) y festivos se tratan como días de descanso.
 */
function getScheduleMinutes() {
  const startVal = document.getElementById('schedule-start')?.value || '07:00';
  const endVal = document.getElementById('schedule-end')?.value || '17:00';

  const [sh, sm] = startVal.split(':').map(Number);
  const [eh, em] = endVal.split(':').map(Number);

  return {
    schedInicio: sh * 60 + sm,
    schedFin: eh * 60 + em,
    workDays: [1, 2, 3, 4, 5],  // Lunes a viernes (fijo)
  };
}

/**
 * Rellena los inputs del formulario con los valores parseados.
 * @param {HorasInput} horas
 */
function fillHoursInputs(horas) {
  const map = {
    'extra-diurna': horas.extraDiurna,
    'extra-nocturna': horas.extraNocturna,
    'extra-diurna-dom': horas.extraDominicalDiurno,
    'extra-nocturna-dom': horas.extraDominicalNocturno,
    'recargo-nocturno': horas.recargoNocturno,
    'recargo-dominical': horas.dominicalDiurno,
    'recargo-nocturno-dom': horas.dominicalNocturno,
  };
  Object.entries(map).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el && val > 0) el.value = val;
  });
}

/* ══════════════════════════════════════════════════════
   7. GESTIÓN DE UI
   ══════════════════════════════════════════════════════ */

// ── Salary input formatting ──────────────────────────

function initSalaryInput() {
  const input = document.getElementById('salary-input');
  const preview = document.getElementById('hourly-preview');
  const select = document.getElementById('weekly-hours-select');

  function updatePreview() {
    const salary = parseSalary(input.value);
    const jornada = parseInt(select.value, 10);
    if (salary > 0) {
      const horaOrdinaria = calcHoraOrdinaria(salary, jornada);
      preview.textContent = `Valor hora ordinaria ≈ ${formatCOP(horaOrdinaria)}`;
    } else {
      preview.textContent = '';
    }
  }

  input.addEventListener('input', () => {
    const pos = input.selectionStart;
    const raw = input.value;
    const formatted = formatSalaryInput(raw);
    input.value = formatted;
    // Reestablecer cursor
    const diff = formatted.length - raw.length;
    input.setSelectionRange(pos + diff, pos + diff);
    updatePreview();
  });

  select.addEventListener('change', updatePreview);
}

// ── Upload zone ──────────────────────────────────────

function initUploadZone() {
  const zone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('pdf-file-input');
  const triggerBtn = document.getElementById('upload-trigger');
  const fileInfo = document.getElementById('file-info');
  const fileName = document.getElementById('file-name-label');
  const fileSize = document.getElementById('file-size-label');
  const removeBtn = document.getElementById('remove-file-btn');
  const parseStatus = document.getElementById('parse-status');
  const progressFill = document.getElementById('progress-fill');
  const parseMsg = document.getElementById('parse-message');

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function setProgress(pct, msg) {
    progressFill.style.width = pct + '%';
    parseMsg.textContent = msg;
  }

  async function handleFile(file) {
    if (!file || file.type !== 'application/pdf') {
      showToast('Por favor sube un archivo PDF válido.', 'error');
      return;
    }

    // Validación de magic bytes: los primeros 5 bytes deben ser %PDF-
    // Esto atrapa archivos renombrados a .pdf que no son PDFs reales.
    const isRealPDF = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const header = new Uint8Array(e.target.result);
        // %PDF- = 0x25 0x50 0x44 0x46 0x2D
        resolve(
          header[0] === 0x25 && header[1] === 0x50 &&
          header[2] === 0x44 && header[3] === 0x46 && header[4] === 0x2D
        );
      };
      reader.onerror = () => resolve(false);
      reader.readAsArrayBuffer(file.slice(0, 5));
    });

    if (!isRealPDF) {
      showToast('El archivo no es un PDF válido (firma %PDF- no encontrada).', 'error');
      return;
    }

    // Validar horario antes de procesar el PDF
    const schedVal = validateSchedule();
    if (!schedVal.ok) {
      showToast('⏰ ' + schedVal.msg, 'error');
      document.getElementById('card-salary')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // Ocultar panel de error y tabla de revisión anterior al procesar nuevo archivo
    hideFallbackPanel();
    document.getElementById('review-container')?.classList.add('hidden');

    fileName.textContent = file.name;
    fileSize.textContent = formatBytes(file.size);
    fileInfo.classList.remove('hidden');
    zone.classList.add('hidden');
    parseStatus.classList.remove('hidden');
    setProgress(5, 'Iniciando lectura del PDF…');

    try {
      // 1. Extraer texto digital + obtener objeto PDF
      const { text, pdf } = await extractTextFromPDF(file, (pct, msg) => setProgress(pct, msg));

      console.group('📄 LaborCalc – Texto digital extraído');
      console.log(`Longitud: ${text.length} caracteres`);
      console.log('Primeros 1000 caracteres:\n', text.slice(0, 1000));
      console.groupEnd();

      // 2. Renderizar páginas a imágenes para OCR de manuscrito
      setProgress(26, 'Preparando imágenes para OCR…');
      const images = await renderPDFToImages(pdf, (pct, msg) => setProgress(pct, msg));
      console.log(`🖼️ ${images.length} página(s) renderizadas para visión IA`);

      // 3. Groq visión extrae nombre + registros → JS calcula
      let horas = null;
      let nombre = '';
      let usedAI = false;
      let groqErrorMsg = '';
      const isScanned = text.trim().length < 80; // poco texto → probable PDF escaneado

      // Leer jornada habitual del formulario
      const { schedInicio, schedFin, workDays } = getScheduleMinutes();
      const hStr = m => `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;
      const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      console.log(`🗓️ Días laborales: ${workDays.map(d => dayNames[d]).join(', ')} | 🕐 ${hStr(schedInicio)}–${hStr(schedFin)}`);

      setProgress(52, 'Analizando con visión IA (texto + manuscrito)…');
      try {
        const groqResult = await extractHoursWithGroq(text, images, (pct, msg) => setProgress(pct, msg), schedInicio, schedFin, workDays);
        const groqRegistros = groqResult?.registros;
        nombre = groqResult?.nombre || '';
        
        console.log('✅ Groq visión devolvió registros:', groqRegistros, '| Nombre:', nombre);
        
        if (groqRegistros && groqRegistros.length > 0) {
          setProgress(100, 'Esperando revisión del usuario...');
          renderReviewTable(groqRegistros, nombre);
          return; // Detiene la ejecución aquí. El flujo continuará cuando el usuario haga clic en Confirmar en la tabla.
        } else {
          console.warn('Groq visión respondió con 0 registros válidos.');
        }
      } catch (groqErr) {
        groqErrorMsg = groqErr.message;
        console.error('❌ Groq error:', groqErr.message);
      }

      // 4. Fallback: regex sobre el texto digital
      if (!horas) {
        setProgress(90, 'Analizando con detector clásico…');
        horas = parseHoursFromText(text);
        console.log('🔍 Resultado regex:', horas);
      }

      setProgress(100, '¡Listo!');

      if (horas) {
        fillHoursInputs(horas);
        document.getElementById('calculate-btn').dataset.nombre = nombre;

        if (usedAI) {
          const nombreMsg = nombre ? ` · ${nombre}` : '';
          showToast(`✨ IA Groq (visión + OCR)${nombreMsg}: horas autocompletadas.`, 'success');
        } else {
          // Regex funcionó, IA falló → panel informativo
          showToast('🔍 Datos parciales detectados. Revisa los valores.', 'info');
          showManualFallbackPanel(groqErrorMsg ? 'ai_error' : 'regex_only', groqErrorMsg);
        }
      } else {
        // Ningún método encontró horas
        const reason = groqErrorMsg ? 'ai_error' : isScanned ? 'ai_scanned' : 'total_fail';
        showManualFallbackPanel(reason, groqErrorMsg);
        showToast('No se detectaron horas. Consulta las sugerencias en el panel.', 'info');
      }

      setTimeout(() => parseStatus.classList.add('hidden'), 1500);
    } catch (err) {
      console.error('💥 Error procesando PDF:', err);
      setProgress(0, 'Error al leer el PDF.');
      showManualFallbackPanel('ai_error', err.message || 'Error inesperado al leer el archivo.');
      showToast('Error al leer el PDF. Revisa las sugerencias en el panel.', 'error');
      setTimeout(() => parseStatus.classList.add('hidden'), 3000);
    }
  }

  triggerBtn.addEventListener('click', () => fileInput.click());
  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  removeBtn.addEventListener('click', () => {
    fileInput.value = '';
    fileInfo.classList.add('hidden');
    zone.classList.remove('hidden');
    parseStatus.classList.add('hidden');
  });
}

// ── Results rendering ─────────────────────────────────

function renderResults({ lineas, total, totalHoras, horaOrdinaria }) {
  const emptyState = document.getElementById('empty-state');
  const resultsContent = document.getElementById('results-content');
  const tbody = document.getElementById('breakdown-tbody');
  const grandTotal = document.getElementById('grand-total-display');

  // Nombre del empleado (guardado por handleFile en data attribute)
  const nombre = document.getElementById('calculate-btn').dataset.nombre || '';
  const nombreEl = document.getElementById('result-employee-name');
  if (nombreEl) {
    nombreEl.textContent = nombre || '';
    nombreEl.closest('.result-employee-row').classList.toggle('hidden', !nombre);
  }

  // Metrics
  document.getElementById('metric-hora-ordinaria').textContent = formatCOP(horaOrdinaria);
  document.getElementById('metric-total-horas').textContent = totalHoras.toFixed(1) + ' h';
  document.getElementById('metric-total-pagar').textContent = formatCOP(total);

  // Breakdown rows
  tbody.innerHTML = '';
  lineas.forEach((linea) => {
    if (linea.horas === 0) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <span class="tag-badge ${linea.tagClass}">${linea.tipo}</span>
      </td>
      <td>${linea.horas.toFixed(1)} h</td>
      <td>${linea.recargo}</td>
      <td>${formatCOP(linea.valorUnitario)}</td>
      <td><strong>${formatCOP(linea.subtotal)}</strong></td>`;
    tbody.appendChild(tr);
  });

  if (tbody.children.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" style="text-align:center;color:var(--color-text-dim);padding:1.5rem">
      Ningún tipo de hora extra fue registrado con valor mayor a cero.</td>`;
    tbody.appendChild(tr);
  }

  // Grand total — buscar el elemento correcto
  const grandTotalEl = document.getElementById('table-grand-total');
  if (grandTotalEl) grandTotalEl.innerHTML = `<strong>${formatCOP(total)}</strong>`;

  emptyState.classList.add('hidden');
  resultsContent.classList.remove('hidden');
}

// ── Calculate button ─────────────────────────────────

function initCalculateButton() {
  const btn = document.getElementById('calculate-btn');

  btn.addEventListener('click', () => {
    // 1. Validar horario laboral
    const schedVal = validateSchedule();
    if (!schedVal.ok) {
      showToast('⏰ ' + schedVal.msg, 'error');
      document.getElementById('card-salary')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // 2. Validar salario
    const salary = parseSalary(document.getElementById('salary-input').value);
    const jornada = parseInt(document.getElementById('weekly-hours-select').value, 10);

    if (!salary || salary <= 0) {
      showToast('Ingresa un salario mensual válido.', 'error');
      document.getElementById('salary-input').focus();
      return;
    }

    const horas = {
      extraDiurna: getHoursValue('extra-diurna'),
      extraNocturna: getHoursValue('extra-nocturna'),
      recargoNocturno: getHoursValue('recargo-nocturno'),
      dominicalDiurno: getHoursValue('recargo-dominical'),
      dominicalNocturno: getHoursValue('recargo-nocturno-dom'),
      extraDominicalDiurno: getHoursValue('extra-diurna-dom'),
      extraDominicalNocturno: getHoursValue('extra-nocturna-dom'),
    };

    const totalHs = Object.values(horas).reduce((s, v) => s + v, 0);
    if (totalHs === 0) {
      showToast('Ingresa al menos un tipo de hora trabajada.', 'info');
      return;
    }

    const result = calcularHorasExtra(salary, jornada, horas);
    renderResults(result);

    // Scroll to results on mobile
    if (window.innerWidth < 900) {
      document.getElementById('results-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    showToast('Cálculo completado correctamente.', 'success');
  });
}

// ── Export button ─────────────────────────────────────

function initExportMenu() {
  const trigger = document.getElementById('export-dropdown-btn');
  const menu = document.getElementById('export-menu');
  const btnTxt = document.getElementById('export-txt');
  const btnCsv = document.getElementById('export-csv');
  const btnPdf = document.getElementById('export-pdf');

  if (!trigger) return;

  // Toggle menu
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('show');
  });

  // Close menu on click outside
  document.addEventListener('click', () => menu.classList.remove('show'));

  const getDataForExport = () => {
    const salary = parseSalary(document.getElementById('salary-input').value);
    const jornada = parseInt(document.getElementById('weekly-hours-select').value, 10);
    const horaOrd = calcHoraOrdinaria(salary, jornada);
    const tbody = document.getElementById('breakdown-tbody');
    const totalPagar = document.getElementById('metric-total-pagar').textContent;
    const totalHoras = document.getElementById('metric-total-horas').textContent;
    const fecha = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    const nombre = document.getElementById('calculate-btn').dataset.nombre || '';

    const rows = Array.from(tbody.querySelectorAll('tr')).map(tr => {
      const cells = tr.querySelectorAll('td');
      if (cells.length >= 5) {
        return {
          tipo: cells[0].textContent.trim(),
          horas: cells[1].textContent.trim(),
          recargo: cells[2].textContent.trim(),
          unitario: cells[3].textContent.trim(),
          subtotal: cells[4].textContent.trim()
        };
      }
      return null;
    }).filter(r => r);

    return { salary, jornada, horaOrd, totalPagar, totalHoras, fecha, nombre, rows };
  };

  btnTxt.addEventListener('click', () => {
    const d = getDataForExport();
    let txt = `═══════════════════════════════════════════\n`;
    txt += `  LIQUIDACIÓN DE HORAS EXTRA – LABORCALC\n`;
    txt += `  Fecha: ${d.fecha}\n`;
    txt += `═══════════════════════════════════════════\n\n`;
    if (d.nombre) txt += `Empleado            : ${d.nombre}\n`;
    txt += `Salario mensual     : ${formatCOP(d.salary)}\n`;
    txt += `Jornada semanal     : ${d.jornada} horas\n`;
    txt += `Valor hora ordinaria: ${formatCOP(d.horaOrd)}\n\n`;
    txt += `───────────────────────────────────────────\n`;
    txt += `DESGLOSE\n`;
    txt += `───────────────────────────────────────────\n`;

    d.rows.forEach(r => {
      txt += `${r.tipo.substring(0, 42).padEnd(42)} ${r.horas.padStart(6)}  ${r.recargo.padStart(5)}  ${r.unitario.padStart(14)}  ${r.subtotal.padStart(16)}\n`;
    });

    txt += `\n═══════════════════════════════════════════\n`;
    txt += `Total horas extra   : ${d.totalHoras}\n`;
    txt += `TOTAL A PAGAR       : ${d.totalPagar}\n`;
    txt += `═══════════════════════════════════════════\n`;
    txt += `\nGenerado por LaborCalc · Basado en CST + Ley 2101/2021\n`;

    downloadFile(txt, 'text/plain', 'txt');
  });

  btnCsv.addEventListener('click', () => {
    const d = getDataForExport();
    let csv = `sep=,\n`; // Help Excel recognize comma separator
    csv += `Liquidación de Horas Extra - LaborCalc\n`;
    csv += `Fecha,${d.fecha}\n`;
    if (d.nombre) csv += `Empleado,${d.nombre}\n`;
    csv += `Salario Mensual,${d.salary}\n`;
    csv += `Jornada Semanal,${d.jornada}\n`;
    csv += `Valor Hora Ordinaria,${d.horaOrd}\n\n`;
    csv += `Tipo de Hora,Cantidad,Recargo,Vlr Unitario,Subtotal\n`;

    d.rows.forEach(r => {
      const u = r.unitario.replace(/[^\d]/g, '');
      const s = r.subtotal.replace(/[^\d]/g, '');
      csv += `"${r.tipo}",${r.horas},"${r.recargo}",${u},${s}\n`;
    });

    csv += `\nTotal Horas,${d.totalHoras}\n`;
    csv += `TOTAL A PAGAR,${d.totalPagar.replace(/[^\d]/g, '')}\n`;

    downloadFile(csv, 'text/csv', 'csv');
  });

  btnPdf.addEventListener('click', () => {
    window.print();
  });

  function downloadFile(content, type, ext) {
    const blob = new Blob(["\ufeff", content], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `liquidacion_${new Date().toISOString().slice(0, 10)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Archivo exportado correctamente.', 'success');
  }
}

/* ══════════════════════════════════════════════════════
   8. BOOTSTRAP
   ══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   NIVEL 2: TABLA DE REVISIÓN VISUAL (Human-in-the-loop)
   ══════════════════════════════════════════════════════ */

let pendingRegistros = [];
let pendingNombre = '';

function renderReviewTable(registros, nombre) {
  pendingRegistros = registros;
  pendingNombre = nombre;

  const tbody = document.getElementById('review-tbody');
  tbody.innerHTML = '';

  registros.forEach((reg, index) => {
    tbody.insertAdjacentHTML('beforeend', createReviewRow(reg, index));
  });

  document.getElementById('parse-status').classList.add('hidden');
  document.getElementById('review-container').classList.remove('hidden');
  document.getElementById('review-container').scrollIntoView({ behavior: 'smooth' });
}

function createReviewRow(reg, index) {
  return `
    <tr data-index="${index}">
      <td><input type="text" class="review-input review-input--date" value="${reg.fecha || ''}" placeholder="DD/MM/AAAA"></td>
      <td><input type="text" class="review-input review-input--time" value="${reg.ingreso || ''}" placeholder="HH:MM"></td>
      <td><input type="text" class="review-input review-input--time" value="${reg.salida || ''}" placeholder="HH:MM"></td>
      <td>
        <button class="btn-remove-row" onclick="removeReviewRow(this)" aria-label="Eliminar fila" title="Eliminar fila">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </td>
    </tr>
  `;
}

function removeReviewRow(btn) {
  btn.closest('tr').remove();
}

async function processReviewedData() {
  const tbody = document.getElementById('review-tbody');
  const rows = tbody.querySelectorAll('tr');
  const registros = [];

  rows.forEach(row => {
    const inputs = row.querySelectorAll('input');
    const fecha = inputs[0].value.trim();
    const ingreso = inputs[1].value.trim();
    const salida = inputs[2].value.trim();

    if (fecha && ingreso && salida) {
      // Aplicar el saneamiento de Nivel 1 a los datos editados por el usuario
      registros.push({
        fecha: fecha, // idealmente haríamos un regex replace para guiones
        ingreso: sanitizeTime(ingreso),
        salida: sanitizeTime(salida)
      });
    }
  });

  if (registros.length === 0) {
    showToast('La tabla está vacía. Añade al menos un registro.', 'error');
    return;
  }

  // Ocultar tabla y mostrar cargando de nuevo
  document.getElementById('review-container').classList.add('hidden');
  document.getElementById('progress-fill').style.width = '90%';
  document.getElementById('parse-message').textContent = 'Calculando horas validadas...';
  document.getElementById('parse-status').classList.remove('hidden');

  const { schedInicio, schedFin, workDays } = getScheduleMinutes();
  
  try {
    const horas = await calcularDesdeRegistros(registros, schedInicio, schedFin, workDays);
    const total = Object.values(horas).reduce((s, v) => s + v, 0);

    document.getElementById('progress-fill').style.width = '100%';
    document.getElementById('parse-message').textContent = '¡Listo!';
    
    setTimeout(() => {
      document.getElementById('parse-status').classList.add('hidden');
      fillHoursInputs(horas);
      document.getElementById('calculate-btn').dataset.nombre = pendingNombre;

      const nombreMsg = pendingNombre ? ` · ${pendingNombre}` : '';
      showToast(`✨ IA Groq + Validación Humana${nombreMsg}: ${total} horas autocompletadas.`, 'success');
    }, 500);

  } catch (e) {
    console.error(e);
    showToast('Hubo un error calculando las horas revisadas.', 'error');
    document.getElementById('parse-status').classList.add('hidden');
    document.getElementById('review-container').classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initSalaryInput();
  initUploadZone();
  initCalculateButton();
  initExportMenu();

  // Eventos de Nivel 2: Tabla de revisión
  document.getElementById('review-confirm')?.addEventListener('click', processReviewedData);
  document.getElementById('review-add-row')?.addEventListener('click', () => {
    const tbody = document.getElementById('review-tbody');
    const index = tbody.children.length;
    tbody.insertAdjacentHTML('beforeend', createReviewRow({ fecha: '', ingreso: '', salida: '' }, index));
  });

  // Auto-compute preview on jornada change
  document.getElementById('weekly-hours-select').dispatchEvent(new Event('change'));

  // Limpiar error visual de horario cuando el usuario corrige los inputs
  ['schedule-start', 'schedule-end'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      document.getElementById('schedule-start')?.classList.remove('input--error');
      document.getElementById('schedule-end')?.classList.remove('input--error');
    });
  });
});

/* ══════════════════════════════════════════════════════
   EXPORTS PARA PRUEBAS (Node.js)
   ══════════════════════════════════════════════════════ */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseHoursFromText,
    calcularDesdeRegistros,
    precargarFestivos,
    fetchFestivos,
    sanitizeTime
  };
}
