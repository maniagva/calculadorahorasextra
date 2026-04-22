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
  EXTRA_DIURNA:           1.25,
  // Hora extra nocturna entre semana (7 PM – 6 AM)  → +75%
  EXTRA_NOCTURNA:         1.75,
  // Recargo nocturno ORDINARIO (sin hora extra)      → +35%
  RECARGO_NOCTURNO:       1.35,
  // Hora ordinaria dominical/festiva diurno          → +75%
  DOMINICAL_DIURNO:       1.75,
  // Hora ordinaria dominical/festiva nocturno        → +110%
  DOMINICAL_NOCTURNO:     2.10,
  // Hora EXTRA dominical/festiva diurna              → +100%
  EXTRA_DOMINICAL_DIURNO: 2.00,
  // Hora EXTRA dominical/festiva nocturna            → +150%
  EXTRA_DOMINICAL_NOCTURO:2.50,
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
  const icon  = document.getElementById('toast-icon');
  const msgEl = document.getElementById('toast-msg');

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  icon.textContent  = icons[type] ?? '✅';
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
      tipo:     'Hora extra diurna (entre semana 6 AM–7 PM)',
      tagClass: 'tag-extra',
      horas:    horas.extraDiurna,
      factor:   RECARGOS.EXTRA_DIURNA,
      recargo:  '+25%',
    },
    {
      tipo:     'Hora extra nocturna (entre semana 7 PM–6 AM)',
      tagClass: 'tag-nocturno',
      horas:    horas.extraNocturna,
      factor:   RECARGOS.EXTRA_NOCTURNA,
      recargo:  '+75%',
    },
    {
      tipo:     'Recargo nocturno ordinario (7 PM–6 AM)',
      tagClass: 'tag-recargo',
      horas:    horas.recargoNocturno,
      factor:   RECARGOS.RECARGO_NOCTURNO,
      recargo:  '+35%',
    },
    {
      tipo:     'Dominical/Festivo diurno ordinario',
      tagClass: 'tag-dominical',
      horas:    horas.dominicalDiurno,
      factor:   RECARGOS.DOMINICAL_DIURNO,
      recargo:  '+75%',
    },
    {
      tipo:     'Dominical/Festivo nocturno ordinario',
      tagClass: 'tag-dominical',
      horas:    horas.dominicalNocturno,
      factor:   RECARGOS.DOMINICAL_NOCTURNO,
      recargo:  '+110%',
    },
    {
      tipo:     'Hora extra Dominical/Festivo diurna',
      tagClass: 'tag-extra',
      horas:    horas.extraDominicalDiurno,
      factor:   RECARGOS.EXTRA_DOMINICAL_DIURNO,
      recargo:  '+100%',
    },
    {
      tipo:     'Hora extra Dominical/Festivo nocturna',
      tagClass: 'tag-nocturno',
      horas:    horas.extraDominicalNocturno,
      factor:   RECARGOS.EXTRA_DOMINICAL_NOCTURO,
      recargo:  '+150%',
    },
  ];

  let totalHoras = 0;
  let total      = 0;

  const lineas = items.map((item) => {
    const valorUnitario = horaOrdinaria * item.factor;
    const subtotal      = valorUnitario * item.horas;
    totalHoras += item.horas;
    total      += subtotal;
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
 * Extrae texto completo del PDF página por página.
 * @param {File} file
 * @param {function} onProgress
 * @returns {Promise<string>}
 */
async function extractTextFromPDF(file, onProgress) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  const total  = pdf.numPages;
  for (let i = 1; i <= total; i++) {
    onProgress(Math.round((i / total) * 50), `Leyendo página ${i} de ${total}…`);
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map((s) => s.str).join(' ') + '\n';
  }
  return fullText;
}

/* ── Festivos Colombia 2026 ──────────────────────────── */
const FESTIVOS_CO = new Set([
  '01/01/2026','12/01/2026','23/03/2026','02/04/2026','03/04/2026',
  '01/05/2026','18/05/2026','08/06/2026','15/06/2026','29/06/2026',
  '20/07/2026','07/08/2026','17/08/2026','12/10/2026','02/11/2026',
  '16/11/2026','08/12/2026','25/12/2026',
]);

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
 * Calcula las horas por categoría a partir de registros {fecha, ingreso, salida}.
 * Toda la aritmética se hace en JavaScript (no en el LLM).
 *
 * Reglas CST Colombia:
 *  - Diurno: 06:00–19:00
 *  - Nocturno: 19:00–06:00
 *  - Todos los registros del reporte son horas EXTRA (desplazamientos fuera de la jornada)
 *  - Si la fecha es domingo o festivo → recargo dominical
 */
function calcularDesdeRegistros(registros) {
  const D_I = 360;   // 06:00 en minutos
  const D_F = 1140;  // 19:00 en minutos
  const DIA = 1440;  // 24 * 60

  const acc = {
    extraDiurna: 0, extraNocturna: 0, recargoNocturno: 0,
    dominicalDiurno: 0, dominicalNocturno: 0,
    extraDominicalDiurno: 0, extraDominicalNocturno: 0,
  };

  registros.forEach(reg => {
    // Determinar si es domingo o festivo
    const [dd, mm, yyyy] = reg.fecha.split('/').map(Number);
    const fecha   = new Date(yyyy, mm - 1, dd);
    const esDesc  = fecha.getDay() === 0 || FESTIVOS_CO.has(reg.fecha);

    let ini = toMin(reg.ingreso);
    let fin = toMin(reg.salida);
    if (fin <= ini) fin += DIA; // cruce de medianoche

    // Segmentos diurnos en el turno (puede abarcar hasta 2 días)
    const diurnoMin =
      inter(ini, fin, D_I, D_F) +
      inter(ini, fin, DIA + D_I, DIA + D_F);

    // Segmentos nocturnos
    const nocturnoMin =
      inter(ini, fin, 0, D_I) +
      inter(ini, fin, D_F, DIA) +
      inter(ini, fin, DIA, DIA + D_I) +
      inter(ini, fin, DIA + D_F, 2 * DIA);

    if (esDesc) {
      acc.extraDominicalDiurno  += diurnoMin  / 60;
      acc.extraDominicalNocturno += nocturnoMin / 60;
    } else {
      acc.extraDiurna   += diurnoMin  / 60;
      acc.extraNocturna += nocturnoMin / 60;
    }
  });

  // Redondear a 2 decimales
  Object.keys(acc).forEach(k => { acc[k] = Math.round(acc[k] * 100) / 100; });
  return acc;
}

/**
 * Llama al proxy /api/groq (serverless) para extraer los registros del PDF.
 * Groq devuelve un array JSON crudo; calcularDesdeRegistros() hace los cálculos.
 */
async function extractHoursWithGroq(pdfText, onProgress) {
  onProgress(55, 'Extrayendo registros con IA…');

  const textChunk = pdfText.length > 8000
    ? pdfText.slice(0, 8000) + '\n[...truncado...]'
    : pdfText;

  // Groq SOLO extrae datos crudos — NO calcula nada
  const systemPrompt =
`Extrae TODOS los registros de tiempo del texto del PDF.
Devuelve ÚNICAMENTE un JSON array con el formato exacto:
[{"fecha":"DD/MM/YYYY","ingreso":"HH:MM","salida":"HH:MM"}]

Reglas de conversión:
- Convierte AM/PM a 24h: "04:09 AM"→"04:09", "05:00 PM"→"17:00", "10:21 PM"→"22:21"
- "12:00 PM" = "12:00", "12:00 AM" = "00:00"
- "23:59 PM" → "23:59", "00:00 AM" → "00:00"
- Mantén fechas como aparecen en formato DD/MM/YYYY
- Incluye TODAS las filas con HORA INGRESO y HORA SALIDA
- No incluyas filas sin horas (encabezados, totales, etc.)
- Sin markdown, sin explicaciones. Solo el array JSON.`;

  // Llama al proxy serverless — la API key la agrega el servidor
  const response = await fetch('/api/groq', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: `Texto del PDF:\n\n${textChunk}` },
      ],
      temperature: 0,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${response.status}`);
  }

  onProgress(80, 'Calculando horas…');

  const data    = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim() || '';

  console.group('🤖 Groq – Registros extraídos');
  console.log('Raw:', content);
  console.groupEnd();

  // Extraer JSON array
  const arrMatch = content.match(/\[[\s\S]*\]/);
  if (!arrMatch) throw new Error(`Groq no devolvió un array. Respuesta: ${content.slice(0, 200)}`);

  const registros = JSON.parse(arrMatch[0]);
  console.log('Registros parseados:', registros);

  if (!Array.isArray(registros) || registros.length === 0) return null;

  // JS hace todos los cálculos con precisión exacta
  return calcularDesdeRegistros(registros);
}

/**
 * Parser regex de respaldo (sin IA).
 * @param {string} text
 * @returns {HorasInput|null}
 */
function parseHoursFromText(text) {
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const acc = { extraDiurna:0, extraNocturna:0, recargoNocturno:0,
                dominicalDiurno:0, dominicalNocturno:0,
                extraDominicalDiurno:0, extraDominicalNocturno:0 };
  let found = false;

  const patterns = [
    { re: /hora\s+extra\s+diurna[^0-9\n]*([0-9]+(?:[.,][0-9]+)?)/g,         key: 'extraDiurna' },
    { re: /hora\s+extra\s+nocturna[^0-9\n]*([0-9]+(?:[.,][0-9]+)?)/g,       key: 'extraNocturna' },
    { re: /recargo\s+nocturno[^0-9\n]*([0-9]+(?:[.,][0-9]+)?)/g,            key: 'recargoNocturno' },
    { re: /dominical\s+diurno[^0-9\n]*([0-9]+(?:[.,][0-9]+)?)/g,            key: 'dominicalDiurno' },
    { re: /dominical\s+nocturno[^0-9\n]*([0-9]+(?:[.,][0-9]+)?)/g,          key: 'dominicalNocturno' },
    { re: /festivo\s+diurno[^0-9\n]*([0-9]+(?:[.,][0-9]+)?)/g,              key: 'dominicalDiurno' },
    { re: /festivo\s+nocturno[^0-9\n]*([0-9]+(?:[.,][0-9]+)?)/g,            key: 'dominicalNocturno' },
    { re: /extra\s+dominical\s+diurna?[^0-9\n]*([0-9]+(?:[.,][0-9]+)?)/g,   key: 'extraDominicalDiurno' },
    { re: /extra\s+dominical\s+nocturna?[^0-9\n]*([0-9]+(?:[.,][0-9]+)?)/g, key: 'extraDominicalNocturno' },
    { re: /\bhed\b[^0-9]*([0-9]+(?:[.,][0-9]+)?)/gi,  key: 'extraDiurna' },
    { re: /\bhen\b[^0-9]*([0-9]+(?:[.,][0-9]+)?)/gi,  key: 'extraNocturna' },
    { re: /\brn\b[^0-9]*([0-9]+(?:[.,][0-9]+)?)/gi,   key: 'recargoNocturno' },
    { re: /\bdd\b[^0-9]*([0-9]+(?:[.,][0-9]+)?)/gi,   key: 'dominicalDiurno' },
    { re: /\bdn\b[^0-9]*([0-9]+(?:[.,][0-9]+)?)/gi,   key: 'dominicalNocturno' },
    { re: /\bhedd\b[^0-9]*([0-9]+(?:[.,][0-9]+)?)/gi, key: 'extraDominicalDiurno' },
    { re: /\bhedn\b[^0-9]*([0-9]+(?:[.,][0-9]+)?)/gi, key: 'extraDominicalNocturno' },
  ];

  patterns.forEach(({ re, key }) => {
    let match;
    while ((match = re.exec(t)) !== null) {
      const val = parseFloat(match[1].replace(',', '.'));
      if (!isNaN(val)) { acc[key] += val; found = true; }
    }
  });

  return found ? acc : null;
}

/**
 * Rellena los inputs del formulario con los valores parseados.
 * @param {HorasInput} horas
 */
function fillHoursInputs(horas) {
  const map = {
    'extra-diurna':         horas.extraDiurna,
    'extra-nocturna':       horas.extraNocturna,
    'extra-diurna-dom':     horas.extraDominicalDiurno,
    'extra-nocturna-dom':   horas.extraDominicalNocturno,
    'recargo-nocturno':     horas.recargoNocturno,
    'recargo-dominical':    horas.dominicalDiurno,
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
  const input   = document.getElementById('salary-input');
  const preview = document.getElementById('hourly-preview');
  const select  = document.getElementById('weekly-hours-select');

  function updatePreview() {
    const salary   = parseSalary(input.value);
    const jornada  = parseInt(select.value, 10);
    if (salary > 0) {
      const horaOrdinaria = calcHoraOrdinaria(salary, jornada);
      preview.textContent = `Valor hora ordinaria ≈ ${formatCOP(horaOrdinaria)}`;
    } else {
      preview.textContent = '';
    }
  }

  input.addEventListener('input', () => {
    const pos   = input.selectionStart;
    const raw   = input.value;
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
  const zone         = document.getElementById('upload-zone');
  const fileInput    = document.getElementById('pdf-file-input');
  const triggerBtn   = document.getElementById('upload-trigger');
  const fileInfo     = document.getElementById('file-info');
  const fileName     = document.getElementById('file-name-label');
  const fileSize     = document.getElementById('file-size-label');
  const removeBtn    = document.getElementById('remove-file-btn');
  const parseStatus  = document.getElementById('parse-status');
  const progressFill = document.getElementById('progress-fill');
  const parseMsg     = document.getElementById('parse-message');

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function setProgress(pct, msg) {
    progressFill.style.width = pct + '%';
    parseMsg.textContent     = msg;
  }

  async function handleFile(file) {
    if (!file || file.type !== 'application/pdf') {
      showToast('Por favor sube un archivo PDF válido.', 'error');
      return;
    }

    fileName.textContent = file.name;
    fileSize.textContent = formatBytes(file.size);
    fileInfo.classList.remove('hidden');
    zone.classList.add('hidden');
    parseStatus.classList.remove('hidden');
    setProgress(5, 'Iniciando lectura del PDF…');

    try {
      // 1. Extraer texto con PDF.js
      const text = await extractTextFromPDF(file, (pct, msg) => setProgress(pct, msg));

      console.group('📄 LaborCalc – Texto extraído del PDF');
      console.log(`Longitud: ${text.length} caracteres`);
      console.log('Primeros 2000 caracteres:\n', text.slice(0, 2000));
      console.groupEnd();

      if (!text.trim()) {
        showToast('El PDF no contiene texto seleccionable (puede ser una imagen escaneada).', 'error');
        setProgress(0, 'PDF sin texto extraíble.');
        setTimeout(() => parseStatus.classList.add('hidden'), 3000);
        return;
      }

      // 2. Groq extrae registros → JS calcula horas
      let horas  = null;
      let usedAI = false;

      setProgress(52, 'Conectando con Groq IA…');
      try {
        const groqResult = await extractHoursWithGroq(text, (pct, msg) => setProgress(pct, msg));
        const groqTotal  = groqResult ? Object.values(groqResult).reduce((s, v) => s + v, 0) : 0;
        console.log('✅ Groq devolvió:', groqResult, '| Total horas:', groqTotal);
        if (groqResult && groqTotal > 0) {
          horas  = groqResult;
          usedAI = true;
        } else {
          console.warn('Groq respondió con 0 horas. Usando regex como fallback.');
        }
      } catch (groqErr) {
        console.error('❌ Groq error:', groqErr.message);
        showToast(`⚠️ Groq: ${groqErr.message}. Usando detección clásica…`, 'info');
      }

      // 3. Fallback: regex
      if (!horas) {
        setProgress(80, 'Analizando con detector clásico…');
        horas = parseHoursFromText(text);
        console.log('🔍 Resultado regex:', horas);
      }

      setProgress(100, '¡Listo!');

      if (horas) {
        fillHoursInputs(horas);
        const method = usedAI ? '✨ IA Groq' : '🔍 Detección automática';
        showToast(`${method}: horas autocompletadas correctamente.`, 'success');
      } else {
        showToast('No se detectaron horas. Completa el formulario manual.', 'info');
      }

      setTimeout(() => parseStatus.classList.add('hidden'), 1500);
    } catch (err) {
      console.error('💥 Error procesando PDF:', err);
      setProgress(0, 'Error al leer el PDF.');
      showToast(`Error: ${err.message || 'No se pudo leer el PDF.'}`, 'error');
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
  const emptyState    = document.getElementById('empty-state');
  const resultsContent= document.getElementById('results-content');
  const tbody         = document.getElementById('breakdown-tbody');
  const grandTotal    = document.getElementById('table-grand-total');

  // Metrics
  document.getElementById('metric-hora-ordinaria').textContent = formatCOP(horaOrdinaria);
  document.getElementById('metric-total-horas').textContent    = totalHoras.toFixed(1) + ' h';
  document.getElementById('metric-total-pagar').textContent    = formatCOP(total);

  // Breakdown rows
  tbody.innerHTML = '';
  lineas.forEach((linea) => {
    if (linea.horas === 0) return;  // omitir filas en cero
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

  // Si todas las filas son cero, mostrar mensaje
  if (tbody.children.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" style="text-align:center;color:var(--color-text-dim);padding:1.5rem">
      Ningún tipo de hora extra fue registrado con valor mayor a cero.</td>`;
    tbody.appendChild(tr);
  }

  grandTotal.innerHTML = `<strong>${formatCOP(total)}</strong>`;

  // Show results, hide empty
  emptyState.classList.add('hidden');
  resultsContent.classList.remove('hidden');
}

// ── Calculate button ─────────────────────────────────

function initCalculateButton() {
  const btn = document.getElementById('calculate-btn');

  btn.addEventListener('click', () => {
    const salary  = parseSalary(document.getElementById('salary-input').value);
    const jornada = parseInt(document.getElementById('weekly-hours-select').value, 10);

    if (!salary || salary <= 0) {
      showToast('Ingresa un salario mensual válido.', 'error');
      document.getElementById('salary-input').focus();
      return;
    }

    const horas = {
      extraDiurna:            getHoursValue('extra-diurna'),
      extraNocturna:          getHoursValue('extra-nocturna'),
      recargoNocturno:        getHoursValue('recargo-nocturno'),
      dominicalDiurno:        getHoursValue('recargo-dominical'),
      dominicalNocturno:      getHoursValue('recargo-nocturno-dom'),
      extraDominicalDiurno:   getHoursValue('extra-diurna-dom'),
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

function initExportButton() {
  const btn = document.getElementById('export-btn');

  btn.addEventListener('click', () => {
    const salary     = parseSalary(document.getElementById('salary-input').value);
    const jornada    = parseInt(document.getElementById('weekly-hours-select').value, 10);
    const horaOrd    = calcHoraOrdinaria(salary, jornada);

    const tbody      = document.getElementById('breakdown-tbody');
    const totalPagar = document.getElementById('metric-total-pagar').textContent;
    const totalHoras = document.getElementById('metric-total-horas').textContent;
    const fecha      = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });

    let txt = `═══════════════════════════════════════════\n`;
    txt     += `  LIQUIDACIÓN DE HORAS EXTRA – LABORCALC\n`;
    txt     += `  Fecha: ${fecha}\n`;
    txt     += `═══════════════════════════════════════════\n\n`;
    txt     += `Salario mensual     : ${formatCOP(salary)}\n`;
    txt     += `Jornada semanal     : ${jornada} horas\n`;
    txt     += `Valor hora ordinaria: ${formatCOP(horaOrd)}\n\n`;
    txt     += `───────────────────────────────────────────\n`;
    txt     += `DESGLOSE\n`;
    txt     += `───────────────────────────────────────────\n`;

    Array.from(tbody.querySelectorAll('tr')).forEach((tr) => {
      const cells = tr.querySelectorAll('td');
      if (cells.length >= 5) {
        const tipo     = cells[0].textContent.trim();
        const horas    = cells[1].textContent.trim();
        const recargo  = cells[2].textContent.trim();
        const unitario = cells[3].textContent.trim();
        const subtotal = cells[4].textContent.trim();
        txt += `${tipo.substring(0, 42).padEnd(42)} ${horas.padStart(6)}  ${recargo.padStart(5)}  ${unitario.padStart(14)}  ${subtotal.padStart(16)}\n`;
      }
    });

    txt += `\n═══════════════════════════════════════════\n`;
    txt += `Total horas extra   : ${totalHoras}\n`;
    txt += `TOTAL A PAGAR       : ${totalPagar}\n`;
    txt += `═══════════════════════════════════════════\n`;
    txt += `\nGenerado por LaborCalc · Basado en CST + Ley 2101/2021\n`;

    // Create download
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `liquidacion_horas_extra_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Archivo exportado correctamente.', 'success');
  });
}

/* ══════════════════════════════════════════════════════
   8. BOOTSTRAP
   ══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  initSalaryInput();
  initUploadZone();
  initCalculateButton();
  initExportButton();

  // Auto-compute preview on jornada change
  document.getElementById('weekly-hours-select').dispatchEvent(new Event('change'));
});
