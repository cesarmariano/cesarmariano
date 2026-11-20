/* Finanzas familiares – modelo de datos, almacenamiento, combinación entre dispositivos y cálculos.
   Todos los importes se calculan en pesos; los movimientos en dólares se convierten con el tipo de cambio del mes. */
'use strict';

const STORAGE_KEY = 'finanzas-datos-v1';
const LOCAL_KEY = 'finanzas-local-v1'; // ajustes propios de cada dispositivo (no se sincronizan)
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
const COLECCIONES = ['conceptos', 'tarjetas', 'meses', 'movimientos', 'resumenes', 'inversiones', 'reglas'];

/* ---------- Utilidades generales ---------- */
const ahora = () => new Date().toISOString();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoy = () => iso(new Date());
const mesActual = () => hoy().slice(0, 7);
const fmtFecha = f => (f ? f.split('-').reverse().join('/') : '—');
const fmtFechaCorta = f => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : '—');
function parseFecha(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); }
function diasEntre(desde, hasta) { return Math.round((parseFecha(hasta) - parseFecha(desde)) / 86400000); }
function sumarDias(f, n) { const d = parseFecha(f); d.setDate(d.getDate() + n); return iso(d); }
function sumarMeses(mes, n) { const [y, m] = mes.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return iso(d).slice(0, 7); }
const finDeMes = mes => sumarDias(sumarMeses(mes, 1) + '-01', -1);
const diasDelMes = mes => Number(finDeMes(mes).slice(8, 10));
const nombreMes = mes => { const [y, m] = mes.split('-'); return `${MESES[Number(m) - 1]} ${y}`; };
const capitalizar = t => (t ? t[0].toUpperCase() + t.slice(1) : '');
// Fecha del mes para un día fijo (si el mes es más corto, el último día).
const fechaEnMes = (mes, dia) => `${mes}-${String(Math.min(Math.max(1, Number(dia) || 1), diasDelMes(mes))).padStart(2, '0')}`;

const num = v => (v === '' || v == null || Number.isNaN(Number(v)) ? 0 : Number(v));
const redondear = n => Math.round(n * 100) / 100;

/* Convierte un importe escrito en formato argentino ("1.234,56", "$ 1234,5", "1234.56") a número. */
function parseMonto(s) {
  if (typeof s === 'number') return s;
  let t = String(s || '').replace(/[^\d,.\-]/g, '');
  if (!t) return NaN;
  const negativo = t.startsWith('-') || t.endsWith('-');
  t = t.replace(/-/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
  else if (/^\d{1,3}\.\d{3}$/.test(t)) t = t.replace('.', ''); // "1.500" = mil quinientos
  const n = Number(t);
  return Number.isNaN(n) ? NaN : (negativo ? -n : n);
}

const fmtPesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0, minimumFractionDigits: 0 });
const fmtPesos2 = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2, minimumFractionDigits: 2 });
const fmtNumero2 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const fmtDolares = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const $$ = (n, dec = false) => (dec ? fmtPesos2 : fmtPesos).format(Math.round(num(n) * (dec ? 100 : 1)) / (dec ? 100 : 1));
const usd = n => 'US$ ' + fmtDolares.format(num(n));
const monto = (n, moneda, dec = true) => (moneda === 'USD' ? usd(n) : $$(n, dec));
const textoMontoEditable = n => (n === '' || n == null ? '' : fmtNumero2.format(num(n)).replace(/,00$/, ''));
const pct = n => (Number.isFinite(n) ? `${Math.round(n * 10) / 10} %`.replace('.', ',') : '—');

/* ---------- Valores iniciales ---------- */
const CATEGORIAS_BASE = ['Consumo', 'Impuestos', 'Servicios', 'Vivienda', 'Cargos bancarios'];
// Identificadores fijos: si dos dispositivos empiezan sin datos, al sincronizar no se duplican.
const CONCEPTOS_BASE = [
  { id: 'ing-sueldo-mercedes', tipo: 'ingreso', nombre: 'Sueldo de Mercedes', grupo: 'Sueldos', dia: 1 },
  { id: 'ing-alquiler-1', tipo: 'ingreso', nombre: 'Alquiler 1', grupo: 'Alquileres', dia: 10 },
  { id: 'ing-alquiler-2', tipo: 'ingreso', nombre: 'Alquiler 2', grupo: 'Alquileres', dia: 10 },
  { id: 'ing-alveon-cpap', tipo: 'ingreso', nombre: 'Alveon – alquiler de CPAP', grupo: 'Alveon', dia: 10, alveonCpap: true },
  { id: 'ing-alveon-otros', tipo: 'ingreso', nombre: 'Alveon – otras ventas, alquileres y servicios', grupo: 'Alveon', dia: 15 },
  { id: 'egr-gas', tipo: 'egreso', nombre: 'Gas', categoria: 'Servicios', dia: 15 },
  { id: 'egr-electricidad', tipo: 'egreso', nombre: 'Electricidad', categoria: 'Servicios', dia: 15 },
  { id: 'egr-hipoteca', tipo: 'egreso', nombre: 'Hipoteca', categoria: 'Vivienda', dia: 10 },
  { id: 'egr-auto-1', tipo: 'egreso', nombre: 'Impuesto automotor – auto 1', categoria: 'Impuestos', dia: 20 },
  { id: 'egr-auto-2', tipo: 'egreso', nombre: 'Impuesto automotor – auto 2', categoria: 'Impuestos', dia: 20 },
  { id: 'ing-otros', tipo: 'ingreso', nombre: 'Otros ingresos', grupo: 'Otros', dia: 1, eventual: true },
  { id: 'egr-otros', tipo: 'egreso', nombre: 'Otros gastos', categoria: 'Consumo', dia: 1, eventual: true }
].map((c, i) => ({ montoHabitual: '', moneda: 'ARS', activo: true, orden: i, actualizado: '', grupo: '', categoria: '', ...c }));

const CONFIG_BASE = {
  actualizado: '',
  categorias: CATEGORIAS_BASE,
  reserva: 0,                 // dinero que siempre debe quedar en el banco
  mesesEmergencia: 4,         // fondo de emergencia: meses de gastos
  perfil: 'moderado',         // conservador | moderado | agresivo
  tnaPlazoFijo: 0,            // % anual del plazo fijo tradicional (cargar el vigente)
  tnaMoneyMarket: 0,          // % anual de la cuenta remunerada o fondo money market
  inflacionMensual: 0,        // % mensual esperado
  montoMinimo: 0,             // por debajo de este monto, conviene acumular antes de invertir
  montoMinimoBolsa: 0,        // monto mínimo razonable para comprar acciones o CEDEARs (comisiones)
  fechaTasas: ''              // fecha en que se cargaron las tasas
};

const TIPOS_INVERSION = [
  { id: 'money', nombre: 'Cuenta remunerada / FCI money market', liquidez: 'inmediata', riesgo: 'bajo', vence: false },
  { id: 'caucion', nombre: 'Caución bursátil', liquidez: 'corta', riesgo: 'bajo', vence: true },
  { id: 'pf', nombre: 'Plazo fijo tradicional', liquidez: 'corta', riesgo: 'bajo', vence: true },
  { id: 'pfuva', nombre: 'Plazo fijo UVA', liquidez: 'media', riesgo: 'bajo', vence: true },
  { id: 'dolares', nombre: 'Dólares', liquidez: 'inmediata', riesgo: 'medio', vence: false },
  { id: 'bonos', nombre: 'Bonos / obligaciones negociables', liquidez: 'media', riesgo: 'medio', vence: false },
  { id: 'cedears', nombre: 'CEDEARs', liquidez: 'media', riesgo: 'alto', vence: false },
  { id: 'acciones', nombre: 'Acciones argentinas', liquidez: 'media', riesgo: 'alto', vence: false },
  { id: 'fci', nombre: 'Otro fondo común de inversión', liquidez: 'corta', riesgo: 'medio', vence: false },
  { id: 'otro', nombre: 'Otra inversión', liquidez: 'media', riesgo: 'medio', vence: false }
];
const tipoInversion = id => TIPOS_INVERSION.find(t => t.id === id) || TIPOS_INVERSION[TIPOS_INVERSION.length - 1];

/* ---------- Almacenamiento ---------- */
function leer(clave) { try { return JSON.parse(localStorage.getItem(clave)); } catch (_) { return null; } }
function escribir(clave, valor) { try { localStorage.setItem(clave, JSON.stringify(valor)); return true; } catch (_) { return false; } }

function normalizar(d) {
  d = d && typeof d === 'object' ? d : {};
  const r = { version: 1, config: { ...CONFIG_BASE, ...(d.config || {}) } };
  if (!Array.isArray(r.config.categorias) || !r.config.categorias.length) r.config.categorias = [...CATEGORIAS_BASE];
  COLECCIONES.forEach(c => { r[c] = Array.isArray(d[c]) ? d[c].filter(x => x && x.id) : []; });
  // Conceptos iniciales: se agregan los que falten (nunca se duplican porque tienen identificador fijo).
  for (const c of CONCEPTOS_BASE) if (!r.conceptos.some(x => x.id === c.id)) r.conceptos.push({ ...c });
  r.resumenes.forEach(s => { s.items = Array.isArray(s.items) ? s.items : []; });
  return r;
}

let db = normalizar(leer(STORAGE_KEY));
let local = { clientId: '', driveConectado: false, ultimaSync: '', ultimoRespaldo: '', pendiente: false, cuenta: '', ...(leer(LOCAL_KEY) || {}) };
const guardarLocal = () => escribir(LOCAL_KEY, local);

/* ---------- Registros ---------- */
const vigentes = col => db[col].filter(x => !x.borrado);
const buscar = (col, id) => db[col].find(x => x.id === id && !x.borrado);

// Agrega o modifica un registro y marca la fecha de cambio (la usa la sincronización).
function guardarRegistro(col, obj) {
  obj.actualizado = ahora();
  const i = db[col].findIndex(x => x.id === obj.id);
  if (i >= 0) db[col][i] = obj; else db[col].push(obj);
  return obj;
}
// El borrado deja una marca para que llegue a los demás dispositivos.
function borrarRegistro(col, id) {
  const i = db[col].findIndex(x => x.id === id);
  if (i >= 0) db[col][i] = { id, borrado: true, actualizado: ahora() };
}

/* Combina dos copias de los datos (de distintos dispositivos): por cada registro se conserva su versión más reciente. */
function combinar(a, b) {
  a = normalizar(JSON.parse(JSON.stringify(a)));
  b = normalizar(JSON.parse(JSON.stringify(b)));
  const r = { version: 1, config: (a.config.actualizado || '') >= (b.config.actualizado || '') ? a.config : b.config };
  for (const c of COLECCIONES) {
    const mapa = new Map(a[c].map(x => [x.id, x]));
    for (const x of b[c]) {
      const prev = mapa.get(x.id);
      if (!prev || (x.actualizado || '') > (prev.actualizado || '')) mapa.set(x.id, x);
    }
    r[c] = [...mapa.values()];
  }
  return normalizar(r);
}

/* ---------- Meses: saldo del banco y tipo de cambio ---------- */
const datosMes = mes => buscar('meses', mes) || { id: mes, saldo: '', fechaSaldo: '', tipoCambio: '' };

// Tipo de cambio del mes; si no se cargó, el último cargado en meses anteriores.
function tipoCambio(mes) {
  const propio = num(datosMes(mes).tipoCambio);
  if (propio) return propio;
  const previos = vigentes('meses').filter(m => m.id < mes && num(m.tipoCambio)).sort((x, y) => y.id.localeCompare(x.id));
  return previos.length ? num(previos[0].tipoCambio) : 0;
}
const enPesos = (importe, moneda, mes) => (moneda === 'USD' ? num(importe) * tipoCambio(mes) : num(importe));

/* ---------- Conceptos ---------- */
const conceptosDe = tipo => vigentes('conceptos').filter(c => c.tipo === tipo).sort((x, y) => (x.orden ?? 99) - (y.orden ?? 99) || x.nombre.localeCompare(y.nombre, 'es'));
const nombreConcepto = id => (buscar('conceptos', id) || {}).nombre || 'Concepto eliminado';

/* ---------- Movimientos del mes ---------- */
const movimientosMes = mes => vigentes('movimientos').filter(m => m.mes === mes);
const resumenesMes = mes => vigentes('resumenes').filter(r => r.mes === mes);

// Total que se paga de un resumen de tarjeta (en pesos).
function pagoResumen(r) {
  if (r.montoPago !== '' && r.montoPago != null && !Number.isNaN(Number(r.montoPago))) return num(r.montoPago);
  const tc = num(r.tipoCambio) || tipoCambio(r.mes);
  if (num(r.totalARS) || num(r.totalUSD)) return num(r.totalARS) + num(r.totalUSD) * tc;
  return totalItems(r);
}
function totalItems(r, filtro = () => true) {
  const tc = num(r.tipoCambio) || tipoCambio(r.mes);
  return (r.items || []).filter(i => !i.excluido && filtro(i)).reduce((s, i) => s + (i.moneda === 'USD' ? num(i.monto) * tc : num(i.monto)), 0);
}
const nombreTarjeta = id => (buscar('tarjetas', id) || {}).nombre || 'Tarjeta';

/* Lista unificada de entradas y salidas de dinero del banco en un mes (para totales y proyección del saldo).
   tipo: ingreso | egreso | tarjeta | inversion | rescate. "ahorro" indica si cuenta para el resultado del mes. */
function flujoMes(mes) {
  const out = [];
  for (const m of movimientosMes(mes)) {
    const c = buscar('conceptos', m.conceptoId) || {};
    out.push({
      ref: 'mov', id: m.id, tipo: m.tipo, fecha: m.fecha || fechaEnMes(mes, c.dia), nombre: m.descripcion || c.nombre || 'Movimiento',
      importe: enPesos(m.monto, m.moneda, mes), original: num(m.monto), moneda: m.moneda || 'ARS', estado: m.estado,
      categoria: m.tipo === 'egreso' ? (m.categoria || c.categoria || 'Consumo') : (c.grupo || 'Otros'), conceptoId: m.conceptoId
    });
  }
  for (const r of resumenesMes(mes)) {
    out.push({ ref: 'res', id: r.id, tipo: 'tarjeta', fecha: r.vencimiento || fechaEnMes(mes, (buscar('tarjetas', r.tarjetaId) || {}).diaVenc || 10),
      nombre: 'Tarjeta ' + nombreTarjeta(r.tarjetaId), importe: pagoResumen(r), moneda: 'ARS', estado: r.pagado ? 'realizado' : 'previsto' });
  }
  for (const v of vigentes('inversiones')) {
    if (v.fecha && v.fecha.slice(0, 7) === mes && v.desdeBanco !== false) {
      out.push({ ref: 'inv', id: v.id, tipo: 'inversion', fecha: v.fecha, nombre: 'Inversión: ' + (v.descripcion || tipoInversion(v.tipo).nombre),
        importe: enPesos(v.monto, v.moneda, mes), moneda: 'ARS', estado: v.fecha <= hoy() ? 'realizado' : 'previsto' });
    }
    const fin = v.rescate || (tipoInversion(v.tipo).vence ? v.vencimiento : '');
    if (fin && fin.slice(0, 7) === mes && v.alBanco !== false) {
      out.push({ ref: 'inv', id: v.id, tipo: 'rescate', fecha: fin, nombre: (v.rescate ? 'Rescate: ' : 'Vencimiento: ') + (v.descripcion || tipoInversion(v.tipo).nombre),
        importe: enPesos(valorAlVencimiento(v), v.moneda, mes), moneda: 'ARS', estado: fin <= hoy() ? 'realizado' : 'previsto' });
    }
  }
  return out.sort((x, y) => x.fecha.localeCompare(y.fecha) || orden(x) - orden(y));
}
// El mismo día, primero entran los ingresos y después salen los pagos.
const orden = f => ({ ingreso: 0, rescate: 1, egreso: 2, tarjeta: 3, inversion: 4 }[f.tipo] ?? 5);
const esEntrada = f => f.tipo === 'ingreso' || f.tipo === 'rescate';

function totalesMes(mes) {
  const f = flujoMes(mes);
  const suma = fn => f.filter(fn).reduce((s, x) => s + x.importe, 0);
  const ingresos = suma(x => x.tipo === 'ingreso');
  const fijos = suma(x => x.tipo === 'egreso');
  const tarjetas = suma(x => x.tipo === 'tarjeta');
  const egresos = fijos + tarjetas;
  const resultado = ingresos - egresos;
  return {
    ingresos, fijos, tarjetas, egresos, resultado,
    tasa: ingresos > 0 ? (resultado / ingresos) * 100 : NaN,
    cobrado: suma(x => x.tipo === 'ingreso' && x.estado === 'realizado'),
    pagado: suma(x => (x.tipo === 'egreso' || x.tipo === 'tarjeta') && x.estado === 'realizado'),
    invertido: suma(x => x.tipo === 'inversion'),
    rescatado: suma(x => x.tipo === 'rescate'),
    vacio: !f.length
  };
}

/* Gasto por cuenta (Consumo, Impuestos, Servicios, Vivienda...): gastos fijos según su cuenta y tarjetas según sus consumos itemizados. */
function gastosPorCategoria(mes) {
  const r = {};
  const sumar = (cat, v) => { r[cat || 'Sin asignar'] = (r[cat || 'Sin asignar'] || 0) + v; };
  flujoMes(mes).filter(x => x.tipo === 'egreso').forEach(x => sumar(x.categoria, x.importe));
  for (const s of resumenesMes(mes)) {
    const tc = num(s.tipoCambio) || tipoCambio(mes);
    (s.items || []).filter(i => !i.excluido).forEach(i => sumar(i.categoria || 'Sin asignar', i.moneda === 'USD' ? num(i.monto) * tc : num(i.monto)));
    const dif = pagoResumen(s) - totalItems(s);
    if (Math.abs(dif) >= 1) sumar('Tarjeta sin itemizar', dif);
  }
  return r;
}

/* ---------- Saldo del banco y remanente ---------- */
/* Saldo de partida del mes: el cargado por el usuario (con su fecha) o, si no hay, el saldo final proyectado del mes anterior. */
function saldoBase(mes, profundidad = 0) {
  const d = datosMes(mes);
  if (d.saldo !== '' && d.saldo != null && !Number.isNaN(Number(d.saldo))) {
    return { saldo: num(d.saldo), fecha: d.fechaSaldo || `${mes}-01`, origen: 'cargado' };
  }
  if (profundidad < 24 && vigentes('meses').some(m => m.id < mes && m.saldo !== '' && m.saldo != null)) {
    const ant = sumarMeses(mes, -1);
    const p = proyeccion(ant, profundidad + 1);
    return { saldo: p.saldoFinal, fecha: sumarDias(`${mes}-01`, -1), origen: 'anterior' };
  }
  return null;
}

/* Proyección del saldo día por día desde la fecha del saldo cargado hasta el fin del mes.
   El saldo cargado ya incluye los movimientos cobrados o pagados con fecha igual o anterior a la del saldo.
   Los que siguen como "previstos" con fecha anterior se consideran pendientes: los pagos se aplican en la fecha del saldo
   y, por prudencia, los cobros atrasados recién al fin del mes (no se sabe cuándo llegarán). */
function proyeccion(mes, profundidad = 0) {
  const base = saldoBase(mes, profundidad);
  const flujo = flujoMes(mes);
  if (!base) return { base: null, flujo, pasos: [], saldoFinal: NaN, minimo: NaN, fechaMinimo: '' };
  let saldo = base.saldo, minimo = base.saldo, fechaMinimo = base.fecha;
  const pasos = [];
  const pendientes = flujo.filter(f => f.fecha <= base.fecha && f.estado !== 'realizado' && base.origen === 'cargado')
    .map(f => ({ ...f, fechaOriginal: f.fecha, fecha: esEntrada(f) ? (finDeMes(mes) > base.fecha ? finDeMes(mes) : base.fecha) : base.fecha, atrasado: true }));
  const lista = [...pendientes, ...flujo.filter(f => f.fecha > base.fecha)].sort((x, y) => x.fecha.localeCompare(y.fecha) || orden(x) - orden(y));
  for (const f of lista) {
    saldo += esEntrada(f) ? f.importe : -f.importe;
    pasos.push({ ...f, saldo });
    if (saldo < minimo) { minimo = saldo; fechaMinimo = f.fecha; }
  }
  return { base, flujo, pasos, saldoFinal: saldo, minimo, fechaMinimo };
}

/* Remanente que puede ahorrarse o invertirse HOY sin que el saldo baje de la reserva.
   Revisa los pagos de lo que queda del mes y los del mes siguiente que vencen antes de su primer ingreso
   (por ejemplo, una tarjeta que vence el día 5 cuando el sueldo entra el día 10). */
function remanente(mes = mesActual()) {
  const p = proyeccion(mes);
  if (!p.base) return null;
  const reserva = num(db.config.reserva);
  let minimo = p.minimo, fechaMinimo = p.fechaMinimo, saldo = p.saldoFinal;
  const desde = p.base.fecha > hoy() ? p.base.fecha : hoy();
  // El mínimo se calcula desde hoy (lo ya ocurrido no limita lo que se puede invertir ahora).
  let saldoHoy = p.base.saldo;
  for (const s of p.pasos) if (s.fecha <= desde) saldoHoy = s.saldo;
  minimo = saldoHoy; fechaMinimo = desde;
  for (const s of p.pasos) if (s.fecha > desde && s.saldo < minimo) { minimo = s.saldo; fechaMinimo = s.fecha; }
  const sig = sumarMeses(mes, 1);
  const flujoSig = flujoMes(sig);
  const primerIngreso = flujoSig.find(f => f.tipo === 'ingreso');
  const limite = primerIngreso ? primerIngreso.fecha : '';
  const pagosSig = flujoSig.filter(f => !esEntrada(f) && (!limite || f.fecha < limite));
  for (const f of pagosSig) {
    saldo -= f.importe;
    if (saldo < minimo) { minimo = saldo; fechaMinimo = f.fecha; }
  }
  return {
    saldoHoy, saldoFinal: p.saldoFinal, minimo, fechaMinimo, reserva,
    disponible: Math.max(0, minimo - reserva), deficit: Math.min(0, minimo - reserva),
    pagosSiguiente: pagosSig, hastaSiguiente: limite, base: p.base
  };
}

/* ---------- Inversiones ---------- */
// Interés simple estimado de un plazo fijo o caución: capital × TNA × días / 365.
function interesEstimado(v) {
  if (!tipoInversion(v.tipo).vence || !v.fecha || !v.vencimiento || !num(v.tna)) return 0;
  return num(v.monto) * num(v.tna) / 100 * diasEntre(v.fecha, v.vencimiento) / 365;
}
function valorAlVencimiento(v) {
  if (v.rescate) return num(v.valorRescate) || num(v.valorActual) || num(v.monto);
  if (num(v.valorFinal)) return num(v.valorFinal);
  return num(v.monto) + interesEstimado(v);
}
const inversionActiva = v => !v.rescate && !(tipoInversion(v.tipo).vence && v.vencimiento && v.vencimiento < hoy() && v.alBanco !== false);
function valorActual(v) {
  if (num(v.valorActual)) return num(v.valorActual);
  if (tipoInversion(v.tipo).vence && v.fecha && v.vencimiento && num(v.tna)) {
    const dias = Math.max(0, Math.min(diasEntre(v.fecha, hoy()), diasEntre(v.fecha, v.vencimiento)));
    return num(v.monto) * (1 + num(v.tna) / 100 * dias / 365);
  }
  return num(v.monto);
}
const valorActualPesos = v => enPesos(valorActual(v), v.moneda, mesActual());

// Gasto mensual promedio de los últimos meses con datos (para el fondo de emergencia).
function gastoPromedio(meses = 3) {
  const vals = [];
  for (let i = 0; i < 12 && vals.length < meses; i++) {
    const t = totalesMes(sumarMeses(mesActual(), -i));
    if (t.egresos > 0) vals.push(t.egresos);
  }
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
}
