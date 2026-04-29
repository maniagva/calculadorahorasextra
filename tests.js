// Mock document and window for Node.js environment
global.document = {
  addEventListener: () => {},
  getElementById: () => ({ addEventListener: () => {}, dispatchEvent: () => {}, classList: { remove: () => {} } })
};
global.window = {};

const { parseHoursFromText, calcularDesdeRegistros } = require('./script.js');

// Mock localStorage if missing (for fetchFestivos)
if (typeof global.localStorage === 'undefined') {
  global.localStorage = {
    getItem: () => null,
    setItem: () => {}
  };
}

let testsPassed = 0;
let testsFailed = 0;

function assertEqual(testName, actual, expected) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    console.log(`✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.log(`❌ FAIL: ${testName}`);
    console.log(`   Esperado: ${expectedStr}`);
    console.log(`   Obtenido: ${actualStr}`);
    testsFailed++;
  }
}

// ── 1. Pruebas de parseHoursFromText (Regex) ─────────────────────
console.log('\n--- Testeando Regex de Fallback ---');

const regexTests = [
  {
    name: 'Formato estándar: 2.5 HED',
    input: '2.5 HED\n1,5 HEN',
    expected: { extraDiurna: 2.5, extraNocturna: 1.5, recargoNocturno: 0, dominicalDiurno: 0, dominicalNocturno: 0, extraDominicalDiurno: 0, extraDominicalNocturno: 0 }
  },
  {
    name: 'Formato nombre completo',
    input: 'Hora extra diurna 3.0\nrecargo nocturno 4',
    expected: { extraDiurna: 3, extraNocturna: 0, recargoNocturno: 4, dominicalDiurno: 0, dominicalNocturno: 0, extraDominicalDiurno: 0, extraDominicalNocturno: 0 }
  },
  {
    name: 'Formato pegado: HED2.5',
    input: 'HED2.5\nHEN1,5',
    expected: { extraDiurna: 2.5, extraNocturna: 1.5, recargoNocturno: 0, dominicalDiurno: 0, dominicalNocturno: 0, extraDominicalDiurno: 0, extraDominicalNocturno: 0 }
  },
  {
    name: 'Variantes coloquiales',
    input: 'horas extras diurnas 5\nnocturno ordinario 2',
    expected: { extraDiurna: 5, extraNocturna: 0, recargoNocturno: 2, dominicalDiurno: 0, dominicalNocturno: 0, extraDominicalDiurno: 0, extraDominicalNocturno: 0 }
  },
  {
    name: 'Sin horas válidas',
    input: 'Salario: $2.500.000\nCédula 1234567890',
    expected: null // Ignora números grandes > 300
  }
];

regexTests.forEach(t => assertEqual(t.name, parseHoursFromText(t.input), t.expected));

// ── 2. Pruebas de calcularDesdeRegistros (Matemática) ────────────
console.log('\n--- Testeando Cálculo de Cuadrantes ---');

async function runMathTests() {
  const mathTests = [
    {
      name: 'Turno Ordinario Diurno (Lunes 08:00 - 17:00)',
      registros: [{ fecha: '01/06/2026', ingreso: '08:00', salida: '17:00' }], // 1 de junio 2026 es lunes, no festivo
      expected: { extraDiurna: 0, extraNocturna: 0, recargoNocturno: 0, dominicalDiurno: 0, dominicalNocturno: 0, extraDominicalDiurno: 0, extraDominicalNocturno: 0 }
    },
    {
      name: 'Turno con 2 horas extra diurnas (Lunes 08:00 - 19:00)',
      registros: [{ fecha: '01/06/2026', ingreso: '08:00', salida: '19:00' }], // 9 horas habituales + 2 extra diurnas
      expected: { extraDiurna: 2, extraNocturna: 0, recargoNocturno: 0, dominicalDiurno: 0, dominicalNocturno: 0, extraDominicalDiurno: 0, extraDominicalNocturno: 0 }
    },
    {
      name: 'Turno Dominical sin extra (Domingo 08:00 - 17:00)',
      registros: [{ fecha: '07/06/2026', ingreso: '08:00', salida: '17:00' }], // 7 de junio 2026 es domingo
      expected: { extraDiurna: 0, extraNocturna: 0, recargoNocturno: 0, dominicalDiurno: 9, dominicalNocturno: 0, extraDominicalDiurno: 0, extraDominicalNocturno: 0 }
    },
    {
      name: 'Festivo nocturno (01/05/2026 Día del Trabajo, Viernes, 19:00 - 04:00)',
      registros: [{ fecha: '01/05/2026', ingreso: '19:00', salida: '04:00' }], // Festivo (esDesc = true)
      expected: { extraDiurna: 0, extraNocturna: 0, recargoNocturno: 0, dominicalDiurno: 0, dominicalNocturno: 0, extraDominicalDiurno: 0, extraDominicalNocturno: 9 }
    }
  ];

  for (const t of mathTests) {
    const res = await calcularDesdeRegistros(t.registros, 480, 1020, [1, 2, 3, 4, 5]); // 08:00 a 17:00
    assertEqual(t.name, res, t.expected);
  }

  console.log(`\n=== RESULTADOS: ${testsPassed} Pasaron, ${testsFailed} Fallaron ===\n`);
}

runMathTests();
