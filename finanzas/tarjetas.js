/* Finanzas familiares – tarjetas de crédito: resúmenes mensuales, lectura de PDF y asignación de cada consumo a una cuenta. */
'use strict';

/* ======================= Lectura del resumen (sin interfaz) ======================= */
const MESES_CORTOS = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 };
const RE_IMPORTE = /-?\(?\$?\s?\d{1,3}(?:\.\d{3})*,\d{2}\)?-?|-?\$?\s?\d+,\d{2}-?/g;
const RE_FECHA_NUM = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/;
const RE_FECHA_TXT = /^(\d{1,2})[-/. ]+([A-Za-zÁÉÍÓÚáéíóú]{3,10})\.?[-/. ]+(\d{2,4})\b/;
const RE_FECHA_CORTA = /^(\d{1,2})[-/](\d{1,2})\b(?![-/.]\d)/;
const RE_NO_ITEM = /saldo anterior|saldo actual|su pago|pago en pesos|pago en d[oó]lares|pago m[ií]nimo|total (de )?consumos|total a pagar|subtotal|l[ií]mite de compra|l[ií]mite de cr[eé]dito|tasa nominal|t\.?n\.?a|t\.?e\.?a|c\.?f\.?t|pr[oó]ximo (cierre|vencimiento)|cierre anterior|vencimiento anterior/i;
const RE_IMPUESTO = /impuesto|i\.?v\.?a\b|percep|sellos|iibb|ingresos brutos|\bdb\.? ?rg|\brg ?\d{3,4}|ley ?\d{5}|pais\b|ganancias|retenci[oó]n/i;
const RE_CARGO = /comisi[oó]n|inter[eé]s|cargo por|mantenimiento de cuenta|renovaci[oó]n anual|seguro de vida|punitorio|financiaci[oó]n/i;
const RE_SERVICIO = /netflix|spotify|disney|hbo|\bmax\b|amazon prime|prime video|paramount|star\+|youtube|google|apple\.com|icloud|microsoft|adobe|chatgpt|openai|personal|movistar|claro|telecom|fibertel|telecentro|edenor|edesur|edelap|metrogas|naturgy|camuzzi|aysa|\babl\b|seguro|osde|swiss medical|galeno|medif[eé]|omint|cablevisi|directv|flow\b|gimnasio|megatlon|sport ?club|colegio|universidad|cuota social|expensas/i;

function fechaDe(d, m, y, anioRef) {
  let mes = Number(m);
  if (Number.isNaN(mes)) mes = MESES_CORTOS[String(m).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3)] || 0;
  let anio = y ? Number(y) : anioRef;
  if (anio < 100) anio += 2000;
  const dia = Number(d);
  if (!mes || mes > 12 || !dia || dia > 31 || !anio) return '';
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
function leerFechaInicial(texto, anioRef) {
  let r = texto.match(RE_FECHA_NUM);
  if (r) return { fecha: fechaDe(r[1], r[2], r[3], anioRef), largo: r[0].length };
  r = texto.match(RE_FECHA_TXT);
  if (r) { const f = fechaDe(r[1], r[2], r[3], anioRef); if (f) return { fecha: f, largo: r[0].length }; }
  r = texto.match(RE_FECHA_CORTA);
  if (r) return { fecha: fechaDe(r[1], r[2], '', anioRef), largo: r[0].length };
  return null;
}
// Busca una fecha en cualquier formato dentro de un texto (para cierre y vencimiento).
function fechaEnTexto(t, anioRef) {
  const m = t.match(/(\d{1,2})[-/. ]+(\d{1,2}|[A-Za-zÁÉÍÓÚáéíóú]{3,10})\.?[-/. ]+(\d{2,4})/);
  return m ? fechaDe(m[1], m[2], m[3], anioRef) : '';
}

// Clave para recordar la cuenta asignada a un comercio (sin números, cuotas ni signos).
function claveComercio(desc) {
  return String(desc || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/C\.?\s?\d{1,2}\/\d{1,2}/g, ' ').replace(/[^A-Z ]+/g, ' ')
    .split(/\s+/).filter(w => w.length > 1).slice(0, 4).join(' ').slice(0, 40);
}
function categoriaSugerida(desc, reglas) {
  const k = claveComercio(desc);
  if (reglas && reglas[k]) return reglas[k];
  if (RE_IMPUESTO.test(desc)) return 'Impuestos';
  if (RE_CARGO.test(desc)) return 'Cargos bancarios';
  if (RE_SERVICIO.test(desc)) return 'Servicios';
  return 'Consumo';
}

/* Interpreta las líneas de texto de un resumen.
   lineas: [{ texto, partes: [{ s, x, x2 }] }] en orden de lectura.
   Devuelve { items, cierre, vencimiento, totalARS, totalUSD, anio }. */
function interpretarResumen(lineas, opciones = {}) {
  const reglas = opciones.reglas || {};
  const todo = lineas.map(l => l.texto).join('\n');
  // Año de referencia: el del vencimiento o cierre si se encuentra; si no, el actual.
  let anio = Number(String(opciones.anio || new Date().getFullYear()));
  const vto = todo.match(/vencimiento(?:\s+actual)?\s*:?\s*([^\n]{0,30})/i);
  const cie = todo.match(/cierre(?:\s+actual)?\s*:?\s*([^\n]{0,30})/i);
  const vencimiento = vto ? fechaEnTexto(vto[1], anio) : '';
  const cierre = cie ? fechaEnTexto(cie[1], anio) : '';
  if (vencimiento) anio = Number(vencimiento.slice(0, 4));
  else if (cierre) anio = Number(cierre.slice(0, 4));
  let totalARS = '', totalUSD = '';
  const sal = todo.match(/saldo actual[^\n]*/i) || todo.match(/total a pagar[^\n]*/i);
  if (sal) {
    const imps = sal[0].match(RE_IMPORTE) || [];
    if (imps[0]) totalARS = Math.abs(parseMonto(imps[0]));
    if (imps[1]) totalUSD = Math.abs(parseMonto(imps[1]));
  }

  // Columnas de pesos y dólares, si el resumen tiene encabezado con ambas.
  let colPesos = null, colDolares = null;
  for (const l of lineas) {
    const p = (l.partes || []).find(x => /^\s*pesos\s*$/i.test(x.s) || /\bpesos\b/i.test(x.s));
    const d = (l.partes || []).find(x => /d[oó]lares|u\$s|\busd\b/i.test(x.s));
    if (p && d && p !== d) { colPesos = (p.x + p.x2) / 2; colDolares = (d.x + d.x2) / 2; }
  }

  const items = [];
  const cierreMes = (cierre || vencimiento || `${anio}-12-31`);
  for (const l of lineas) {
    const texto = l.texto.replace(/\s+/g, ' ').trim();
    if (!texto || RE_NO_ITEM.test(texto)) continue;
    const f = leerFechaInicial(texto, anio);
    const sinFecha = !f && (RE_IMPUESTO.test(texto) || RE_CARGO.test(texto));
    if (!f && !sinFecha) continue;
    // Importes al final de la línea (los números sin coma decimal, como cupones, no se toman).
    const resto = f ? texto.slice(f.largo) : texto;
    // Se descartan porcentajes (por ejemplo, la alícuota de una percepción).
    const encontrados = [...resto.matchAll(RE_IMPORTE)].filter(m => !/^\s*%/.test(resto.slice(m.index + m[0].length)));
    if (!encontrados.length) continue;
    // La descripción termina donde empiezan los importes finales.
    let corte = encontrados[0].index;
    const finales = [];
    for (let i = encontrados.length - 1; i >= 0; i--) {
      const m = encontrados[i];
      const despues = resto.slice(m.index + m[0].length, i === encontrados.length - 1 ? undefined : encontrados[i + 1].index).trim();
      if (despues && i < encontrados.length - 1) break;
      if (i === encontrados.length - 1 && resto.slice(m.index + m[0].length).trim().length > 3) break;
      finales.unshift(m); corte = m.index;
      // En renglones de impuestos sin fecha, el importe anterior suele ser la base del cálculo: sólo vale el último.
      if (finales.length === 2 || sinFecha) break;
    }
    if (!finales.length) continue;
    // En líneas de impuestos sin fecha, porcentajes y bases imponibles quedan en la descripción.
    let desc = resto.slice(0, corte).replace(/\s{2,}/g, ' ').trim();
    let cuota = '';
    const mc = desc.match(/(?:C\.?\s?|cuota\s*)(\d{1,2})\s?\/\s?(\d{1,2})/i) || desc.match(/\b(\d{2})\/(\d{2})\b/);
    if (mc && Number(mc[1]) <= Number(mc[2])) { cuota = `${Number(mc[1])}/${Number(mc[2])}`; desc = desc.replace(mc[0], ' '); }
    desc = desc.replace(/\(\s*-?[\d.,]+\s*\)/g, ' ').replace(/\b\d{5,}\b\*?/g, ' ').replace(/^[*\-\s]+/, '').replace(/\s{2,}/g, ' ').trim();
    if (!desc) desc = 'Consumo';
    const esUSD = /\busd\b|u\$s|d[oó]lar/i.test(texto);
    finales.forEach((m, k) => {
      const valor = parseMonto(m[0]);
      if (!valor) return;
      let moneda = 'ARS';
      if (colPesos != null && colDolares != null && l.partes) {
        const parte = l.partes.find(p => p.s.includes(m[0].replace(/^-?\(?\$?\s?/, '').replace(/\)?-?$/, '')));
        if (parte) { const c = (parte.x + parte.x2) / 2; moneda = Math.abs(c - colDolares) < Math.abs(c - colPesos) ? 'USD' : 'ARS'; }
        else if (finales.length === 2) moneda = k === 1 ? 'USD' : 'ARS';
      } else if (finales.length === 2) moneda = k === 1 ? 'USD' : 'ARS';
      else if (esUSD) moneda = 'USD';
      items.push({
        id: uid(), fecha: f ? f.fecha : '', descripcion: desc, cuota, monto: redondear(valor), moneda,
        categoria: categoriaSugerida(desc, reglas), excluido: false
      });
    });
  }
  // Fechas de consumos posteriores al cierre corresponden al año anterior (resúmenes de enero con consumos de diciembre).
  items.forEach(i => { if (i.fecha && i.fecha > sumarDias(cierreMes, 40)) i.fecha = `${Number(i.fecha.slice(0, 4)) - 1}${i.fecha.slice(4)}`; });
  return { items, cierre, vencimiento, totalARS, totalUSD, anio };
}

/* Extrae las líneas de texto de un PDF con pdf.js, agrupando los fragmentos por renglón. */
async function lineasDePDF(archivo, pedirClave) {
  if (!window.pdfjsLib) throw new Error('No se pudo cargar el lector de PDF.');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
  const tarea = pdfjsLib.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) });
  // Algunos bancos protegen el resumen con clave (por ejemplo, el DNI del titular).
  tarea.onPassword = (actualizar, motivo) => {
    const clave = pedirClave(motivo === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD);
    if (clave == null) { tarea.destroy(); return; }
    actualizar(clave);
  };
  const pdf = await tarea.promise;
  const lineas = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const { items } = await pagina.getTextContent();
    const renglones = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4], y = it.transform[5], alto = Math.abs(it.transform[3]) || 8;
      let r = renglones.find(g => Math.abs(g.y - y) <= Math.max(2, alto * 0.35));
      if (!r) { r = { y, partes: [] }; renglones.push(r); }
      r.partes.push({ s: it.str, x, x2: x + (it.width || it.str.length * alto * 0.5), alto });
    }
    renglones.sort((a, b) => b.y - a.y);
    for (const r of renglones) {
      r.partes.sort((a, b) => a.x - b.x);
      let texto = '', fin = null;
      for (const p of r.partes) {
        if (fin != null) texto += p.x - fin > p.alto * 0.25 ? (p.x - fin > p.alto * 1.5 ? '   ' : ' ') : '';
        texto += p.s; fin = p.x2;
      }
      lineas.push({ texto, partes: r.partes });
    }
  }
  return lineas;
}

/* ======================= Interfaz ======================= */
const reglasMapa = () => Object.fromEntries(vigentes('reglas').map(r => [r.id, r.categoria]));
// Recuerda la cuenta elegida para cada comercio, para sugerirla en los próximos resúmenes.
function aprenderReglas(items) {
  const actuales = reglasMapa();
  for (const i of items) {
    const k = claveComercio(i.descripcion);
    if (!k || !i.categoria || i.excluido) continue;
    if (actuales[k] === i.categoria) continue;
    const sugerida = categoriaSugerida(i.descripcion, {});
    if (!actuales[k] && sugerida === i.categoria) continue; // no hace falta recordar lo que ya se deduce
    guardarRegistro('reglas', { id: k, categoria: i.categoria });
    actuales[k] = i.categoria;
  }
}

let mesTarjetas = mesActual();
function renderTarjetas() {
  seccion = 'tarjetas';
  setHeader('Tarjetas de crédito');
  const tarjetas = vigentes('tarjetas');
  const res = resumenesMes(mesTarjetas);
  const cats = {};
  res.forEach(r => {
    const tc = num(r.tipoCambio) || tipoCambio(r.mes);
    r.items.filter(i => !i.excluido).forEach(i => { const c = i.categoria || 'Sin asignar'; cats[c] = (cats[c] || 0) + (i.moneda === 'USD' ? num(i.monto) * tc : num(i.monto)); });
  });
  const ultimos = vigentes('resumenes').filter(r => r.mes !== mesTarjetas).sort((a, b) => b.mes.localeCompare(a.mes)).slice(0, 8);
  const filaRes = r => {
    const sinCat = r.items.filter(i => !i.excluido && !i.categoria).length;
    return `<button class="doc-item" data-res="${esc(r.id)}">
      <div class="info"><div class="name">${esc(nombreTarjeta(r.tarjetaId))}</div>
        <div class="sub">${capitalizar(nombreMes(r.mes))} · vence ${fmtFecha(r.vencimiento)} · ${r.items.filter(i => !i.excluido).length} consumo(s)</div></div>
      <div class="importe"><b>${$$(pagoResumen(r))}</b>${r.pagado ? pill('Pagado') : sinCat ? pill(sinCat + ' sin cuenta', 'warn') : pill('A pagar', 'neutral')}</div>
    </button>`;
  };
  view.innerHTML = `
    <div class="mes-nav">
      <button class="icon-btn" id="t-ant" aria-label="Mes anterior">&lsaquo;</button>
      <h2>${esc(capitalizar(nombreMes(mesTarjetas)))}</h2>
      <button class="icon-btn" id="t-sig" aria-label="Mes siguiente">&rsaquo;</button>
    </div>
    <p class="hint" style="text-align:center">Cada resumen se asigna al mes en que se paga (mes del vencimiento).</p>
    ${tarjetas.length ? '' : `<div class="card"><p style="margin-top:0">Primero agregue sus tarjetas (por ejemplo: "Visa Galicia" o "Mastercard Santander").</p></div>`}
    <div class="actions">
      <button class="btn primary" id="t-importar">Importar resumen PDF</button>
      <button class="btn" id="t-manual">Cargar a mano</button>
    </div>
    <input type="file" id="t-archivo" accept="application/pdf,.pdf" hidden>
    ${res.length ? res.map(filaRes).join('') : '<p class="hint vacio-lista">No hay resúmenes cargados para este mes.</p>'}
    ${Object.keys(cats).length ? `<div class="card"><h2>Consumos del mes por cuenta</h2>${barrasCategorias(Object.entries(cats).sort((a, b) => b[1] - a[1]))}</div>` : ''}
    <div class="card">
      <div class="row-between"><h2 style="margin:0">Mis tarjetas</h2><button class="btn chico" id="t-nueva">+ Tarjeta</button></div>
      ${tarjetas.map(t => `<button class="fila-simple" data-tar="${esc(t.id)}"><span>${esc(t.nombre)}</span><small>${t.diaVenc ? 'vence el día ' + esc(t.diaVenc) : ''}</small></button>`).join('') || '<p class="hint" style="margin:10px 0 0">Sin tarjetas.</p>'}
    </div>
    ${ultimos.length ? `<div class="seccion-titulo"><h2>Resúmenes de otros meses</h2></div>${ultimos.map(filaRes).join('')}` : ''}`;
  $('#t-ant').onclick = () => { mesTarjetas = sumarMeses(mesTarjetas, -1); renderTarjetas(); };
  $('#t-sig').onclick = () => { mesTarjetas = sumarMeses(mesTarjetas, 1); renderTarjetas(); };
  $('#t-nueva').onclick = () => renderTarjeta(null, renderTarjetas);
  $('#t-manual').onclick = () => nuevoResumen(mesTarjetas, renderTarjetas);
  $('#t-importar').onclick = () => { if (!vigentes('tarjetas').length) { renderTarjeta(null, renderTarjetas); toast('Primero agregue la tarjeta.', 3000); return; } $('#t-archivo').click(); };
  $('#t-archivo').onchange = e => { const f = e.target.files[0]; if (f) importarPDF(f, renderTarjetas); };
  view.querySelectorAll('[data-res]').forEach(b => (b.onclick = () => renderResumen(b.dataset.res, renderTarjetas)));
  view.querySelectorAll('[data-tar]').forEach(b => (b.onclick = () => renderTarjeta(b.dataset.tar, renderTarjetas)));
}

function renderTarjeta(id, volver) {
  const t = id ? buscar('tarjetas', id) : { id: uid(), nombre: '', diaVenc: '' };
  setHeader(id ? 'Tarjeta' : 'Nueva tarjeta', volver);
  view.innerHTML = `
    <form class="card" id="fedit" novalidate>
      <div class="form-row"><label for="tj-nombre">Nombre</label>
        <input class="field" id="tj-nombre" value="${esc(t.nombre)}" placeholder="Por ejemplo: Visa Galicia" autocomplete="off"><div class="error" id="err-nombre"></div></div>
      <div class="form-row"><label for="tj-dia">Día habitual de vencimiento <span class="hint">(opcional)</span></label>
        <input class="field" id="tj-dia" type="number" inputmode="numeric" min="1" max="31" value="${esc(t.diaVenc)}"></div>
      <button class="btn primary" type="submit">Guardar</button>
      ${id ? '<button class="btn danger" type="button" id="tj-borrar" style="margin-top:10px">Eliminar tarjeta</button>' : ''}
    </form>`;
  $('#fedit').onsubmit = e => {
    e.preventDefault();
    const nombre = $('#tj-nombre').value.trim();
    if (!nombre) { $('#err-nombre').textContent = 'Ingrese el nombre.'; return; }
    guardarRegistro('tarjetas', { ...t, nombre, diaVenc: $('#tj-dia').value });
    save(); toast('Guardado.'); volver();
  };
  if ($('#tj-borrar')) $('#tj-borrar').onclick = () => {
    const n = vigentes('resumenes').filter(r => r.tarjetaId === id).length;
    if (!confirm(n ? `La tarjeta tiene ${n} resumen(es). Se conservan, pero la tarjeta deja de figurar en la lista. ¿Eliminarla?` : '¿Eliminar la tarjeta?')) return;
    borrarRegistro('tarjetas', id); save(); volver();
  };
}

function resumenVacio(mes, tarjetaId) {
  const t = buscar('tarjetas', tarjetaId) || {};
  return { id: uid(), tarjetaId, mes, cierre: '', vencimiento: t.diaVenc ? fechaEnMes(mes, t.diaVenc) : '', totalARS: '', totalUSD: '',
    tipoCambio: '', montoPago: '', pagado: false, items: [], archivo: '' };
}
function nuevoResumen(mes, volver) {
  const tarjetas = vigentes('tarjetas');
  if (!tarjetas.length) { toast('Primero agregue la tarjeta.', 3000); renderTarjeta(null, volver); return; }
  renderResumen(null, volver, resumenVacio(mes, tarjetas[0].id));
}

/* Importa un resumen en PDF: lee el texto, propone los consumos y abre la pantalla para revisarlos y asignar cuentas. */
async function importarPDF(archivo, volver) {
  toast('Leyendo el PDF…', 4000);
  try {
    const lineas = await lineasDePDF(archivo, incorrecta => prompt(incorrecta ? 'Clave incorrecta. Ingrese nuevamente la clave del PDF:' : 'El PDF está protegido. Ingrese la clave (en muchos bancos es el DNI del titular):'));
    const r = interpretarResumen(lineas, { reglas: reglasMapa() });
    const mes = (r.vencimiento || '').slice(0, 7) || mesTarjetas;
    // Tarjeta sugerida: la que aparece nombrada en el texto, o la primera.
    const texto = lineas.map(l => l.texto).join(' ').toLowerCase();
    const tarjetas = vigentes('tarjetas');
    const tarjeta = tarjetas.find(t => t.nombre.toLowerCase().split(/\s+/).filter(w => w.length > 3).some(w => texto.includes(w))) || tarjetas[0];
    const res = { ...resumenVacio(mes, tarjeta.id), cierre: r.cierre, vencimiento: r.vencimiento || resumenVacio(mes, tarjeta.id).vencimiento,
      totalARS: r.totalARS, totalUSD: r.totalUSD, items: r.items, archivo: archivo.name };
    if (!r.items.length) toast('No se reconocieron consumos en el PDF. Puede cargarlos a mano o enviar el resumen para adaptar la lectura a ese formato.', 8000);
    else toast(`Se encontraron ${r.items.length} consumo(s). Revise y asigne las cuentas.`, 4000);
    renderResumen(null, volver, res, lineas);
  } catch (e) {
    toast(e && e.name === 'PasswordException' ? 'No se pudo abrir el PDF sin la clave.' : 'No se pudo leer el PDF: ' + (e.message || e), 8000);
  }
}

let filtroItems = 'todos';
/* Pantalla del resumen: datos generales y lista de consumos con su cuenta. Si "borrador" viene dado, todavía no está guardado. */
function renderResumen(id, volver, borrador, lineasPDF) {
  const guardado = id ? buscar('resumenes', id) : null;
  if (id && !guardado) return volver();
  const r = borrador || JSON.parse(JSON.stringify(guardado));
  const esNuevo = !guardado;
  const cats = db.config.categorias;
  const tc = () => num(r.tipoCambio) || tipoCambio(r.mes);

  function pintar() {
    const activos = r.items.filter(i => !i.excluido);
    const sumaARS = activos.filter(i => i.moneda !== 'USD').reduce((s, i) => s + num(i.monto), 0);
    const sumaUSD = activos.filter(i => i.moneda === 'USD').reduce((s, i) => s + num(i.monto), 0);
    const porCat = {};
    activos.forEach(i => { const c = i.categoria || 'Sin asignar'; porCat[c] = (porCat[c] || 0) + (i.moneda === 'USD' ? num(i.monto) * tc() : num(i.monto)); });
    const sinCat = activos.filter(i => !i.categoria).length;
    const visibles = r.items.map((i, k) => ({ i, k })).filter(({ i }) =>
      filtroItems === 'todos' ? true : filtroItems === 'sin' ? !i.categoria && !i.excluido : i.categoria === filtroItems && !i.excluido);
    setHeader(esNuevo ? 'Nuevo resumen' : 'Resumen de tarjeta', () => {
      if (esNuevo && r.items.length && !confirm('El resumen no está guardado. ¿Salir sin guardar?')) return;
      volver();
    });
    view.innerHTML = `
      <form class="card" id="fres" novalidate>
        ${r.archivo ? `<p class="hint" style="margin-top:0">Leído de: <b>${esc(r.archivo)}</b>. Verifique los datos con el resumen.</p>` : ''}
        <div class="grid2">
          <div class="form-row"><label for="r-tarjeta">Tarjeta</label>
            <select class="field" id="r-tarjeta">${opciones(vigentes('tarjetas').map(t => [t.id, t.nombre]).concat(buscar('tarjetas', r.tarjetaId) ? [] : [[r.tarjetaId, nombreTarjeta(r.tarjetaId)]]), r.tarjetaId)}</select></div>
          <div class="form-row"><label for="r-mes">Mes en que se paga</label>
            <input class="field" id="r-mes" type="month" value="${esc(r.mes)}"></div>
          <div class="form-row"><label for="r-cierre">Cierre</label><input class="field" id="r-cierre" type="date" value="${esc(r.cierre)}"></div>
          <div class="form-row"><label for="r-vto">Vencimiento</label><input class="field" id="r-vto" type="date" value="${esc(r.vencimiento)}"></div>
          <div class="form-row"><label for="r-tars">Total en pesos</label>${campoMonto('r-tars', r.totalARS)}</div>
          <div class="form-row"><label for="r-tusd">Total en dólares</label>${campoMonto('r-tusd', r.totalUSD)}</div>
          <div class="form-row"><label for="r-tc">Dólar para pagar</label>${campoMonto('r-tc', r.tipoCambio, tipoCambio(r.mes) ? `placeholder="${esc(textoMontoEditable(tipoCambio(r.mes)))} (del mes)"` : '')}</div>
          <div class="form-row"><label for="r-pago">Monto a pagar</label>${campoMonto('r-pago', r.montoPago, `placeholder="${esc(textoMontoEditable(Math.round(pagoResumen({ ...r, montoPago: '' }))))} (total)"`)}</div>
        </div>
        <label class="check"><input type="checkbox" id="r-pagado" ${r.pagado ? 'checked' : ''}> Ya está pagado</label>
        <p class="hint" style="margin:6px 0 0">Si el monto a pagar queda vacío, se usa el total en pesos más el total en dólares convertido. En la pantalla del mes, el pago sale del banco en la fecha de vencimiento.</p>
      </form>

      <div class="card">
        <h2>Consumos por cuenta</h2>
        ${Object.keys(porCat).length ? barrasCategorias(Object.entries(porCat).sort((a, b) => b[1] - a[1])) : '<p class="hint">Sin consumos.</p>'}
        <p class="hint" style="margin:10px 0 0">Suma de consumos: ${$$(sumaARS, true)}${sumaUSD ? ' + ' + usd(sumaUSD) : ''}.
          ${num(r.totalARS) && Math.abs(sumaARS - num(r.totalARS)) >= 1 ? `Diferencia con el total en pesos: ${$$(num(r.totalARS) - sumaARS, true)} (puede ser saldo anterior, pagos o renglones no reconocidos).` : ''}</p>
      </div>

      <div class="seccion-titulo"><h2>Consumos (${activos.length})</h2><button class="btn chico" id="r-add">+ Consumo</button></div>
      <div class="chips filtro">
        ${[['todos', 'Todos'], ['sin', `Sin cuenta${sinCat ? ' (' + sinCat + ')' : ''}`], ...cats.map(c => [c, c])].map(([v, l]) =>
          `<button type="button" class="chip ${filtroItems === v ? 'on' : ''}" data-filtro="${esc(v)}">${esc(l)}</button>`).join('')}
      </div>
      ${sinCat ? `<div class="masivo"><span>Asignar los ${sinCat} sin cuenta a:</span>${cats.map(c => `<button type="button" class="chip" data-masivo="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
      <div id="items">${visibles.map(({ i, k }) => `
        <div class="item ${i.excluido ? 'excluido' : ''}" data-k="${k}">
          <div class="item-cab">
            <div class="info"><div class="name">${esc(i.descripcion)}${i.cuota ? ` <span class="hint">cuota ${esc(i.cuota)}</span>` : ''}</div>
              <div class="sub">${fmtFecha(i.fecha)}${i.excluido ? ' · no se cuenta' : ''}</div></div>
            <b class="${num(i.monto) < 0 ? 'pos' : ''}">${esc(monto(i.monto, i.moneda))}</b>
            <button type="button" class="icon-btn mini" data-editar="${k}" aria-label="Editar consumo">&#9998;</button>
          </div>
          ${i.excluido ? '' : `<div class="cats">${cats.map(c => `<button type="button" class="${i.categoria === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>`}
        </div>`).join('') || '<p class="hint vacio-lista">No hay consumos en esta vista.</p>'}</div>

      <div class="barra-guardar">
        <button class="btn primary" id="r-guardar">${esNuevo ? 'Guardar resumen' : 'Guardar cambios'}</button>
        ${esNuevo ? '' : '<button class="btn danger" id="r-borrar">Eliminar</button>'}
      </div>
      ${lineasPDF ? `<details class="card"><summary>Texto leído del PDF (para revisar)</summary><pre class="texto-pdf">${esc(lineasPDF.map(l => l.texto).join('\n'))}</pre></details>` : ''}`;

    const leerCabecera = () => {
      r.tarjetaId = $('#r-tarjeta').value; r.mes = $('#r-mes').value || r.mes; r.cierre = $('#r-cierre').value; r.vencimiento = $('#r-vto').value;
      const v = k => { const n = leerMonto(k); return Number.isNaN(n) ? '' : n; };
      r.totalARS = v('r-tars'); r.totalUSD = v('r-tusd'); r.tipoCambio = v('r-tc'); r.montoPago = v('r-pago'); r.pagado = $('#r-pagado').checked;
    };
    $('#r-vto').onchange = () => { if ($('#r-vto').value) $('#r-mes').value = $('#r-vto').value.slice(0, 7); };
    view.querySelectorAll('[data-filtro]').forEach(b => (b.onclick = () => { leerCabecera(); filtroItems = b.dataset.filtro; pintar(); }));
    view.querySelectorAll('[data-masivo]').forEach(b => (b.onclick = () => {
      leerCabecera(); r.items.forEach(i => { if (!i.excluido && !i.categoria) i.categoria = b.dataset.masivo; }); pintar();
    }));
    view.querySelectorAll('.item [data-cat]').forEach(b => (b.onclick = () => {
      const it = r.items[b.closest('.item').dataset.k];
      it.categoria = b.dataset.cat;
      b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    }));
    view.querySelectorAll('[data-editar]').forEach(b => (b.onclick = () => { leerCabecera(); editarItem(Number(b.dataset.editar)); }));
    $('#r-add').onclick = () => { leerCabecera(); r.items.unshift({ id: uid(), fecha: r.cierre || hoy(), descripcion: '', cuota: '', monto: '', moneda: 'ARS', categoria: 'Consumo', excluido: false }); editarItem(0, true); };
    $('#r-guardar').onclick = () => {
      leerCabecera();
      if (!r.tarjetaId || !buscar('tarjetas', r.tarjetaId) && esNuevo) { toast('Elija la tarjeta.'); return; }
      const duplicado = esNuevo && vigentes('resumenes').find(x => x.tarjetaId === r.tarjetaId && x.mes === r.mes);
      if (duplicado && !confirm(`Ya hay un resumen de ${nombreTarjeta(r.tarjetaId)} para ${nombreMes(r.mes)}. ¿Guardar este también?`)) return;
      aprenderReglas(r.items);
      guardarRegistro('resumenes', r);
      save(); toast('Resumen guardado.');
      mesTarjetas = r.mes; filtroItems = 'todos';
      volver();
    };
    if ($('#r-borrar')) $('#r-borrar').onclick = () => {
      if (!confirm('¿Eliminar este resumen con todos sus consumos?')) return;
      borrarRegistro('resumenes', r.id); save(); toast('Eliminado.'); volver();
    };
  }

  // Edición de un consumo en una ventana superpuesta.
  function editarItem(k, nuevo) {
    const i = r.items[k];
    const capa = document.createElement('div');
    capa.className = 'modal-capa';
    capa.innerHTML = `<form class="modal" novalidate>
      <h2>${nuevo ? 'Nuevo consumo' : 'Consumo'}</h2>
      <div class="form-row"><label for="i-desc">Descripción</label><input class="field" id="i-desc" value="${esc(i.descripcion)}" autocomplete="off"></div>
      <div class="grid2">
        <div class="form-row"><label for="i-fecha">Fecha</label><input class="field" id="i-fecha" type="date" value="${esc(i.fecha)}"></div>
        <div class="form-row"><label for="i-cuota">Cuota</label><input class="field" id="i-cuota" value="${esc(i.cuota)}" placeholder="3/6" autocomplete="off"></div>
        <div class="form-row"><label for="i-monto">Importe</label>${campoMonto('i-monto', i.monto)}</div>
        <div class="form-row"><label for="i-mon">Moneda</label><select class="field" id="i-mon">${opciones([['ARS', 'Pesos'], ['USD', 'Dólares']], i.moneda)}</select></div>
      </div>
      <div class="form-row"><label for="i-cat">Cuenta</label><select class="field" id="i-cat">${opciones(cats, i.categoria, 'Sin asignar')}</select></div>
      <label class="check"><input type="checkbox" id="i-excl" ${i.excluido ? 'checked' : ''}> No contar este renglón (por ejemplo, un pago o un saldo anterior)</label>
      <div class="error" id="i-err"></div>
      <div class="actions" style="margin:12px 0 0">
        <button type="button" class="btn danger" id="i-borrar">Quitar</button>
        <button type="submit" class="btn primary">Aceptar</button>
      </div></form>`;
    document.body.appendChild(capa);
    const cerrar = () => { capa.remove(); pintar(); };
    capa.querySelector('#i-borrar').onclick = () => { r.items.splice(k, 1); cerrar(); };
    capa.onclick = e => { if (e.target === capa) { if (nuevo && !i.descripcion && !i.monto) r.items.splice(k, 1); cerrar(); } };
    capa.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const imp = leerMonto('i-monto', true);
      if (Number.isNaN(imp)) { capa.querySelector('#i-err').textContent = 'Revise el importe.'; return; }
      Object.assign(i, { descripcion: capa.querySelector('#i-desc').value.trim() || 'Consumo', fecha: capa.querySelector('#i-fecha').value,
        cuota: capa.querySelector('#i-cuota').value.trim(), monto: imp, moneda: capa.querySelector('#i-mon').value,
        categoria: capa.querySelector('#i-cat').value, excluido: capa.querySelector('#i-excl').checked });
      cerrar();
    };
  }
  pintar();
}
