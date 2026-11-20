/* Finanzas familiares – interfaz: pantalla del mes, movimientos, saldo del banco, resumen anual y PDF. */
'use strict';

/* ---------- Utilidades de la interfaz ---------- */
const $ = sel => document.querySelector(sel);
const view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, ms = 2000) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

function save() {
  if (!escribir(STORAGE_KEY, db)) toast('No se pudo guardar en este dispositivo.');
  if (local.driveConectado) { local.pendiente = true; guardarLocal(); programarSync(); }
  pintarNube();
}

let seccion = 'mes';
let mesVista = mesActual();
const PANTALLAS = { mes: () => renderMes(), tarjetas: () => renderTarjetas(), ahorro: () => renderAhorro(), anio: () => renderAnio() };
function irInicio() { return (PANTALLAS[seccion] || PANTALLAS.mes)(); }

function setHeader(title, back) {
  $('#title').textContent = title;
  $('#btn-back').hidden = !back;
  $('#btn-back').onclick = back || null;
  const nav = $('#bottom-nav');
  nav.hidden = !!back;
  document.body.classList.toggle('con-nav', !back);
  nav.querySelectorAll('[data-sec]').forEach(b => b.classList.toggle('on', b.dataset.sec === seccion));
  window.scrollTo(0, 0);
}

// Campo de importe: texto con teclado numérico (acepta coma decimal y puntos de miles).
const campoMonto = (id, valor, extra = '') =>
  `<input class="field monto" id="${id}" type="text" inputmode="decimal" autocomplete="off" value="${esc(textoMontoEditable(valor))}" ${/placeholder=/.test(extra) ? extra : 'placeholder="0" ' + extra}>`;
function leerMonto(id, obligatorio = false) {
  const el = $('#' + id);
  const t = el.value.trim();
  if (!t) return obligatorio ? NaN : '';
  return redondear(parseMonto(t));
}
const opciones = (lista, actual, vacio) => (vacio ? `<option value="">${esc(vacio)}</option>` : '') +
  lista.map(o => (Array.isArray(o) ? o : [o, o])).map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(actual) ? 'selected' : ''}>${esc(l)}</option>`).join('');
function segmentado(id, lista, actual) {
  return `<div class="choice" data-choice="${id}">${lista.map(([v, l]) =>
    `<button type="button" class="${v === actual ? 'on' : ''}" data-val="${esc(v)}">${esc(l)}</button>`).join('')}</div>
    <input type="hidden" id="${id}" value="${esc(actual)}">`;
}
function activarSegmentados(onChange) {
  view.querySelectorAll('[data-choice]').forEach(caja => caja.querySelectorAll('button').forEach(b => (b.onclick = () => {
    caja.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    $('#' + caja.dataset.choice).value = b.dataset.val;
    if (onChange) onChange(caja.dataset.choice, b.dataset.val);
  })));
}
const pill = (txt, cls = '') => `<span class="pill ${cls}">${esc(txt)}</span>`;
const estadoPill = (f) => f.estado === 'realizado'
  ? pill(f.tipo === 'ingreso' || f.tipo === 'rescate' ? 'Cobrado' : 'Pagado')
  : pill('Previsto', f.fecha < hoy() ? 'warn' : 'neutral');

/* ---------- Pantalla del mes ---------- */
function renderMes() {
  seccion = 'mes';
  setHeader('Finanzas del mes');
  const mes = mesVista;
  const t = totalesMes(mes);
  const flujo = flujoMes(mes);
  const fila = f => `
    <button class="doc-item" data-ref="${f.ref}" data-id="${esc(f.id)}">
      <div class="info"><div class="name">${esc(f.nombre)}</div>
        <div class="sub">${fmtFecha(f.fecha)}${f.moneda === 'USD' ? ' · ' + usd(f.original) : ''}${f.ref === 'mov' && f.tipo === 'egreso' ? ' · ' + esc(f.categoria) : ''}</div></div>
      <div class="importe"><b class="${esEntrada(f) ? 'pos' : ''}">${f.ref === 'mov' && !f.original ? 'Sin monto' : $$(f.importe)}</b>${estadoPill(f)}</div>
    </button>`;
  const seccionLista = (titulo, items, boton) => `
    <div class="seccion-titulo"><h2>${titulo}</h2>${boton || ''}</div>
    ${items.length ? items.map(fila).join('') : '<p class="hint vacio-lista">Sin movimientos.</p>'}`;
  const ingresos = flujo.filter(f => f.tipo === 'ingreso');
  const egresos = flujo.filter(f => f.tipo === 'egreso');
  const tarjetas = flujo.filter(f => f.tipo === 'tarjeta');
  const inversiones = flujo.filter(f => f.tipo === 'inversion' || f.tipo === 'rescate');
  const cats = Object.entries(gastosPorCategoria(mes)).sort((a, b) => b[1] - a[1]);

  view.innerHTML = `
    <div class="mes-nav">
      <button class="icon-btn" id="mes-ant" aria-label="Mes anterior">&lsaquo;</button>
      <h2>${esc(capitalizar(nombreMes(mes)))}</h2>
      <button class="icon-btn" id="mes-sig" aria-label="Mes siguiente">&rsaquo;</button>
    </div>
    ${mes !== mesActual() ? '<button class="btn chico" id="mes-hoy">Ir al mes actual</button>' : ''}
    ${bannerInstalar()}
    ${t.vacio ? `<div class="card">
        <p style="margin-top:0">Este mes todavía no tiene movimientos.</p>
        <p class="hint">"Preparar el mes" agrega como <b>previstos</b> todos los ingresos y gastos habituales, con el monto habitual o el del mes anterior. Después se confirma cada uno al cobrarlo o pagarlo.</p>
        <button class="btn primary" id="preparar">Preparar el mes</button></div>` : ''}

    <div class="kpis">
      <div class="kpi"><small>Ingresos</small><b>${$$(t.ingresos)}</b><span>${t.cobrado < t.ingresos ? 'Cobrado ' + $$(t.cobrado) : 'Todo cobrado'}</span></div>
      <div class="kpi"><small>Egresos</small><b>${$$(t.egresos)}</b><span>Fijos ${$$(t.fijos)} · Tarjetas ${$$(t.tarjetas)}</span></div>
      <div class="kpi destacado ${t.resultado < 0 ? 'neg' : ''}"><small>Ahorro del mes</small><b>${$$(t.resultado)}</b><span>${Number.isFinite(t.tasa) ? pct(t.tasa) + ' de los ingresos' : '—'}</span></div>
    </div>

    ${tarjetaBanco(mes)}

    ${seccionLista('Ingresos', ingresos, '<button class="btn chico" id="add-ing">+ Ingreso</button>')}
    ${seccionLista('Gastos fijos y otros', egresos, '<button class="btn chico" id="add-egr">+ Gasto</button>')}
    ${seccionLista('Tarjetas de crédito', tarjetas, '<button class="btn chico" id="add-tar">+ Resumen</button>')}
    ${inversiones.length ? seccionLista('Inversiones', inversiones) : ''}

    ${cats.length ? `<div class="card"><h2>Gastos por cuenta</h2>${barrasCategorias(cats)}
      <p class="hint" style="margin:8px 0 0">Las tarjetas se reparten según la cuenta asignada a cada consumo del resumen.</p></div>` : ''}

    ${flujo.length ? `<details class="card cronograma"><summary>Cronograma del saldo del banco</summary>${tablaCronograma(mes)}</details>` : ''}

    <div class="actions">
      <button class="btn" id="pdf-mes">PDF del mes</button>
      <button class="btn" id="copiar-mes">Agregar habituales</button>
    </div>`;

  $('#mes-ant').onclick = () => { mesVista = sumarMeses(mesVista, -1); renderMes(); };
  $('#mes-sig').onclick = () => { mesVista = sumarMeses(mesVista, 1); renderMes(); };
  if ($('#mes-hoy')) $('#mes-hoy').onclick = () => { mesVista = mesActual(); renderMes(); };
  if ($('#preparar')) $('#preparar').onclick = () => prepararMes(mes);
  $('#copiar-mes').onclick = () => prepararMes(mes);
  $('#add-ing').onclick = () => renderMovimiento(null, 'ingreso', mes);
  $('#add-egr').onclick = () => renderMovimiento(null, 'egreso', mes);
  $('#add-tar').onclick = () => nuevoResumen(mes, renderMes);
  $('#pdf-mes').onclick = () => pdfMes(mes).catch(e => toast(e.message || 'No se pudo generar el PDF.', 6000));
  view.querySelectorAll('[data-ref]').forEach(b => (b.onclick = () => {
    if (b.dataset.ref === 'mov') renderMovimiento(b.dataset.id);
    else if (b.dataset.ref === 'res') renderResumen(b.dataset.id, renderMes);
    else renderInversion(b.dataset.id, renderMes);
  }));
  conectarBanco(mes);
  conectarInstalar();
}

function tarjetaBanco(mes) {
  const p = proyeccion(mes);
  const actual = mes === mesActual();
  if (!p.base) {
    return `<div class="card banco">
      <h2>Saldo del banco</h2>
      <p class="hint">Cargue el saldo actual de la cuenta bancaria. Con ese dato y las fechas de cada cobro y pago, la aplicación calcula el saldo de cada día y cuánto puede ahorrarse o invertirse sin quedarse corto.</p>
      <button class="btn primary" id="saldo-editar">Cargar saldo del banco</button></div>`;
  }
  const r = actual ? remanente(mes) : null;
  const origen = p.base.origen === 'cargado'
    ? `Saldo cargado el ${fmtFecha(p.base.fecha)}`
    : 'Estimado con el saldo final del mes anterior';
  let destacado = '';
  if (r) {
    destacado = r.disponible > 0
      ? `<div class="remanente"><small>Puede ahorrar o invertir hoy</small><b>${$$(r.disponible)}</b>
          <span>Sin que el saldo baje de la reserva de ${$$(r.reserva)}. Menor saldo previsto: ${$$(r.minimo)} el ${fmtFecha(r.fechaMinimo)}.</span></div>`
      : `<div class="remanente neg"><small>No conviene retirar dinero</small><b>${$$(r.deficit)}</b>
          <span>El ${fmtFecha(r.fechaMinimo)} el saldo quedaría en ${$$(r.minimo)}${r.reserva ? `, por debajo de la reserva de ${$$(r.reserva)}` : ''}.</span></div>`;
  }
  return `<div class="card banco">
    <div class="row-between"><h2 style="margin:0">Saldo del banco</h2><button class="btn chico" id="saldo-editar">Actualizar</button></div>
    <p class="hint" style="margin:4px 0 12px">${esc(origen)}${tipoCambio(mes) ? ` · Dólar: ${$$(tipoCambio(mes), true)}` : ''}</p>
    <div class="grid2">
      <div><div class="label">${p.base.origen === 'cargado' ? 'Saldo cargado' : 'Saldo inicial'}</div><div class="value">${$$(p.base.saldo)}</div></div>
      <div><div class="label">Saldo al fin del mes</div><div class="value ${p.saldoFinal < 0 ? 'neg' : ''}">${$$(p.saldoFinal)}</div></div>
    </div>
    ${destacado}
    ${r && r.pagosSiguiente.length ? `<p class="hint" style="margin:10px 0 0">Incluye ${r.pagosSiguiente.length} pago(s) del mes siguiente que vencen ${r.hastaSiguiente ? 'antes del primer ingreso (' + fmtFecha(r.hastaSiguiente) + ')' : 'en ese mes'}.</p>` : ''}
    ${actual ? '<button class="btn" id="ver-sug" style="margin-top:12px">Ver sugerencias para el ahorro</button>' : ''}
  </div>`;
}
function conectarBanco(mes) {
  if ($('#saldo-editar')) $('#saldo-editar').onclick = () => renderSaldo(mes);
  if ($('#ver-sug')) $('#ver-sug').onclick = () => { seccion = 'ahorro'; renderAhorro(); };
}

function barrasCategorias(cats) {
  const max = Math.max(...cats.map(c => Math.abs(c[1])), 1);
  const total = cats.reduce((s, c) => s + c[1], 0);
  return `<div class="barras">${cats.map(([n, v]) => `
    <div class="barra-fila" title="${esc(n)}: ${esc($$(v))}">
      <div class="barra-etq"><span>${esc(n)}</span><b>${$$(v)}</b></div>
      <div class="barra-pista"><span style="width:${Math.max(1, Math.abs(v) / max * 100)}%"></span></div>
      <small>${total ? pct(v / total * 100) : ''}</small>
    </div>`).join('')}</div>`;
}

function tablaCronograma(mes) {
  const p = proyeccion(mes);
  if (!p.base) return '<p class="hint">Cargue el saldo del banco para ver el cronograma.</p>';
  const filas = p.pasos.map(s => `<tr class="${s.saldo < num(db.config.reserva) ? 'alerta' : ''}">
    <td>${fmtFechaCorta(s.fecha)}</td><td>${esc(s.nombre)}${s.atrasado ? ` <span class="hint">(previsto el ${fmtFechaCorta(s.fechaOriginal)}, pendiente)</span>` : ''}</td>
    <td class="num ${esEntrada(s) ? 'pos' : ''}">${esEntrada(s) ? '+' : '−'}${$$(s.importe).replace('-', '')}</td><td class="num">${$$(s.saldo)}</td></tr>`).join('');
  return `<div class="tabla-scroll"><table class="tabla">
    <thead><tr><th>Fecha</th><th>Concepto</th><th class="num">Importe</th><th class="num">Saldo</th></tr></thead>
    <tbody><tr><td>${fmtFechaCorta(p.base.fecha)}</td><td>Saldo de partida</td><td></td><td class="num">${$$(p.base.saldo)}</td></tr>${filas}</tbody>
  </table></div>`;
}

/* Agrega como previstos los ingresos y gastos habituales que todavía no estén en el mes. */
function prepararMes(mes) {
  const existentes = new Set(movimientosMes(mes).map(m => m.conceptoId));
  const anterior = sumarMeses(mes, -1);
  let n = 0;
  for (const c of vigentes('conceptos')) {
    if (!c.activo || c.eventual || existentes.has(c.id)) continue;
    const previo = movimientosMes(anterior).find(m => m.conceptoId === c.id);
    let importe = c.montoHabitual !== '' && c.montoHabitual != null ? c.montoHabitual : previo ? previo.monto : '';
    if (c.alveonCpap) { const a = cuotasAlveon(mes); if (a && a.total) importe = a.total; }
    guardarRegistro('movimientos', {
      id: uid(), mes, conceptoId: c.id, tipo: c.tipo, descripcion: '', monto: importe, moneda: c.moneda || 'ARS',
      fecha: fechaEnMes(mes, c.dia), estado: 'previsto', categoria: c.tipo === 'egreso' ? c.categoria : '', notas: ''
    });
    n++;
  }
  save();
  toast(n ? `Se agregaron ${n} movimiento(s) previstos.` : 'Todos los movimientos habituales ya están en el mes.');
  renderMes();
}

/* Cuotas de CPAP en alquiler registradas en la aplicación Alveon de este mismo dispositivo (si existe). */
function cuotasAlveon(mes) {
  const datos = leer('alveon-visitas-v1');
  if (!datos || !Array.isArray(datos.pacientes)) return null;
  const ini = `${mes}-01`, fin = finDeMes(mes);
  const lista = datos.pacientes.filter(p => !p.borrado && p.tipo === 'cpap' && p.modalidad === 'alquiler' && p.estado !== 'finalizado' &&
    num(p.cuota) > 0 && (!p.alqInicio || p.alqInicio <= fin) && (!p.alqFin || p.alqFin >= ini));
  return { cantidad: lista.length, total: lista.reduce((s, p) => s + num(p.cuota), 0) };
}

/* ---------- Ingreso o gasto ---------- */
function renderMovimiento(id, tipoNuevo, mesNuevo) {
  const m = id ? buscar('movimientos', id) : null;
  if (id && !m) return renderMes();
  const tipo = m ? m.tipo : tipoNuevo;
  const mes = m ? m.mes : mesNuevo;
  const lista = conceptosDe(tipo).filter(c => c.activo || (m && c.id === m.conceptoId));
  const v = m ? { ...m } : { conceptoId: lista[0] ? lista[0].id : '', monto: '', moneda: 'ARS', fecha: '', estado: 'previsto', descripcion: '', categoria: '', notas: '' };
  const concepto = () => buscar('conceptos', $('#m-concepto') ? $('#m-concepto').value : v.conceptoId) || {};
  const palabraHecho = tipo === 'ingreso' ? 'Cobrado' : 'Pagado';
  setHeader(m ? (tipo === 'ingreso' ? 'Ingreso' : 'Gasto') : (tipo === 'ingreso' ? 'Nuevo ingreso' : 'Nuevo gasto'), renderMes);
  view.innerHTML = `
    <form class="card" id="fedit" novalidate>
      <p class="hint" style="margin-top:0">${esc(capitalizar(nombreMes(mes)))}</p>
      <div class="form-row"><label for="m-concepto">Concepto</label>
        <select class="field" id="m-concepto">${opciones(lista.map(c => [c.id, c.nombre]), v.conceptoId)}</select></div>
      <div class="form-row"><label for="m-desc">Detalle <span class="hint">(opcional)</span></label>
        <input class="field" id="m-desc" value="${esc(v.descripcion)}" autocomplete="off" placeholder="Por ejemplo: venta de un concentrador"></div>
      <div class="form-row"><label for="m-monto">Monto</label>${campoMonto('m-monto', v.monto)}
        <div id="alveon"></div><div class="error" id="err-monto"></div></div>
      <div class="form-row"><label>Moneda</label>${segmentado('m-moneda', [['ARS', 'Pesos'], ['USD', 'Dólares']], v.moneda || 'ARS')}</div>
      <div class="form-row"><label for="m-fecha">Fecha ${tipo === 'ingreso' ? 'de cobro' : 'de pago o vencimiento'}</label>
        <input class="field" id="m-fecha" type="date" value="${esc(v.fecha || fechaEnMes(mes, concepto().dia || (mes === mesActual() ? hoy().slice(8) : 1)))}"></div>
      <div class="form-row"><label>Estado</label>${segmentado('m-estado', [['previsto', 'Previsto'], ['realizado', palabraHecho]], v.estado || 'previsto')}</div>
      ${tipo === 'egreso' ? `<div class="form-row"><label for="m-cat">Cuenta</label>
        <select class="field" id="m-cat">${opciones(db.config.categorias, v.categoria || concepto().categoria || 'Consumo')}</select></div>` : ''}
      <div class="form-row"><label for="m-notas">Notas <span class="hint">(opcional)</span></label>
        <textarea class="field" id="m-notas">${esc(v.notas)}</textarea></div>
      <button class="btn primary" type="submit">Guardar</button>
      ${m ? '<button class="btn danger" type="button" id="m-borrar" style="margin-top:10px">Eliminar</button>' : ''}
    </form>`;
  activarSegmentados();
  const mostrarAlveon = () => {
    const caja = $('#alveon');
    const a = concepto().alveonCpap ? cuotasAlveon(mes) : null;
    caja.innerHTML = a && a.cantidad ? `<button type="button" class="chip" id="usar-alveon">Usar ${esc($$(a.total))}: cuotas de ${a.cantidad} CPAP en alquiler (aplicación Alveon)</button>` : '';
    if ($('#usar-alveon')) $('#usar-alveon').onclick = () => { $('#m-monto').value = textoMontoEditable(a.total); };
  };
  mostrarAlveon();
  $('#m-concepto').onchange = () => {
    const c = concepto();
    if (!m) {
      $('#m-fecha').value = fechaEnMes(mes, c.dia);
      if (c.montoHabitual !== '' && c.montoHabitual != null && !$('#m-monto').value) $('#m-monto').value = textoMontoEditable(c.montoHabitual);
      if ($('#m-cat') && c.categoria) $('#m-cat').value = c.categoria;
    }
    mostrarAlveon();
  };
  $('#fedit').onsubmit = e => {
    e.preventDefault();
    const importe = leerMonto('m-monto');
    if (Number.isNaN(importe)) { $('#err-monto').textContent = 'Revise el monto (por ejemplo: 150000 o 150.000,50).'; return; }
    const fecha = $('#m-fecha').value || fechaEnMes(mes, 1);
    const obj = {
      ...(m || { id: uid() }), tipo, mes: fecha.slice(0, 7), conceptoId: $('#m-concepto').value, descripcion: $('#m-desc').value.trim(),
      monto: importe, moneda: $('#m-moneda').value, fecha, estado: $('#m-estado').value,
      categoria: $('#m-cat') ? $('#m-cat').value : '', notas: $('#m-notas').value.trim()
    };
    guardarRegistro('movimientos', obj);
    mesVista = obj.mes;
    save(); toast('Guardado.'); renderMes();
  };
  if ($('#m-borrar')) $('#m-borrar').onclick = () => {
    if (!confirm('¿Eliminar este movimiento?')) return;
    borrarRegistro('movimientos', m.id); save(); toast('Eliminado.'); renderMes();
  };
}

/* ---------- Saldo del banco y dólar del mes ---------- */
function renderSaldo(mes) {
  const d = datosMes(mes);
  setHeader('Saldo del banco', renderMes);
  const tcAnterior = !num(d.tipoCambio) && tipoCambio(mes);
  view.innerHTML = `
    <form class="card" id="fedit" novalidate>
      <p class="hint" style="margin-top:0">${esc(capitalizar(nombreMes(mes)))}. Cargue el saldo disponible en la cuenta bancaria tal como figura en el banco.
        Se considera que ya incluye los cobros y pagos <b>marcados como cobrados o pagados</b> hasta esa fecha; los que siguen como previstos se toman como pendientes.</p>
      <div class="form-row"><label for="s-saldo">Saldo en el banco (pesos)</label>${campoMonto('s-saldo', d.saldo)}<div class="error" id="err-saldo"></div></div>
      <div class="form-row"><label for="s-fecha">Fecha del saldo</label>
        <input class="field" id="s-fecha" type="date" value="${esc(d.fechaSaldo || (mes === mesActual() ? hoy() : `${mes}-01`))}"></div>
      <div class="form-row"><label for="s-tc">Dólar del mes (pesos por dólar) <span class="hint">(para convertir importes en dólares)</span></label>
        ${campoMonto('s-tc', d.tipoCambio, tcAnterior ? `placeholder="${esc(textoMontoEditable(tcAnterior))} (mes anterior)"` : '')}</div>
      <div class="form-row"><label for="s-reserva">Reserva mínima en el banco <span class="hint">(dinero que siempre debe quedar; vale para todos los meses)</span></label>
        ${campoMonto('s-reserva', db.config.reserva)}</div>
      <button class="btn primary" type="submit">Guardar</button>
      ${d.saldo !== '' && d.saldo != null ? '<button class="btn danger" type="button" id="s-quitar" style="margin-top:10px">Quitar el saldo cargado</button>' : ''}
    </form>`;
  $('#fedit').onsubmit = e => {
    e.preventDefault();
    const saldo = leerMonto('s-saldo'), tc = leerMonto('s-tc'), reserva = leerMonto('s-reserva');
    if (Number.isNaN(saldo) || Number.isNaN(tc) || Number.isNaN(reserva)) { $('#err-saldo').textContent = 'Revise los importes.'; return; }
    guardarRegistro('meses', { ...d, id: mes, saldo, fechaSaldo: saldo === '' ? '' : $('#s-fecha').value, tipoCambio: tc });
    if (num(reserva) !== num(db.config.reserva)) { db.config.reserva = num(reserva); db.config.actualizado = ahora(); }
    save(); toast('Guardado.'); renderMes();
  };
  if ($('#s-quitar')) $('#s-quitar').onclick = () => {
    guardarRegistro('meses', { ...d, id: mes, saldo: '', fechaSaldo: '' }); save(); renderMes();
  };
}

/* ---------- Resumen anual ---------- */
let anioVista = Number(mesActual().slice(0, 4));
function renderAnio() {
  seccion = 'anio';
  setHeader('Resumen anual');
  const meses = Array.from({ length: 12 }, (_, i) => `${anioVista}-${String(i + 1).padStart(2, '0')}`);
  const datos = meses.map(m => ({ mes: m, ...totalesMes(m) }));
  const conDatos = datos.filter(d => !d.vacio);
  let acum = 0;
  const tot = conDatos.reduce((s, d) => ({ ing: s.ing + d.ingresos, egr: s.egr + d.egresos, res: s.res + d.resultado }), { ing: 0, egr: 0, res: 0 });
  const cats = {}, fuentes = {};
  for (const m of meses) {
    Object.entries(gastosPorCategoria(m)).forEach(([k, v]) => (cats[k] = (cats[k] || 0) + v));
    flujoMes(m).filter(f => f.tipo === 'ingreso').forEach(f => { const n = nombreConcepto(f.conceptoId); fuentes[n] = (fuentes[n] || 0) + f.importe; });
  }
  view.innerHTML = `
    <div class="mes-nav">
      <button class="icon-btn" id="a-ant" aria-label="Año anterior">&lsaquo;</button><h2>${anioVista}</h2>
      <button class="icon-btn" id="a-sig" aria-label="Año siguiente">&rsaquo;</button>
    </div>
    <div class="kpis">
      <div class="kpi"><small>Ingresos</small><b>${$$(tot.ing)}</b><span>${conDatos.length} mes(es) con datos</span></div>
      <div class="kpi"><small>Egresos</small><b>${$$(tot.egr)}</b><span>Promedio ${$$(conDatos.length ? tot.egr / conDatos.length : 0)}</span></div>
      <div class="kpi destacado ${tot.res < 0 ? 'neg' : ''}"><small>Ahorro del año</small><b>${$$(tot.res)}</b><span>${tot.ing ? pct(tot.res / tot.ing * 100) + ' de los ingresos' : '—'}</span></div>
    </div>
    <div class="card"><h2>Ahorro por mes</h2>${graficoAhorro(datos)}</div>
    <div class="card"><h2>Detalle por mes</h2>
      <div class="tabla-scroll"><table class="tabla">
        <thead><tr><th>Mes</th><th class="num">Ingresos</th><th class="num">Egresos</th><th class="num">Ahorro</th><th class="num">%</th><th class="num">Acumulado</th></tr></thead>
        <tbody>${datos.map(d => { if (!d.vacio) acum += d.resultado; return `<tr data-mes="${d.mes}" class="clic">
          <td>${capitalizar(MESES[Number(d.mes.slice(5)) - 1]).slice(0, 3)}</td>
          <td class="num">${d.vacio ? '—' : $$(d.ingresos)}</td><td class="num">${d.vacio ? '—' : $$(d.egresos)}</td>
          <td class="num ${d.resultado < 0 ? 'neg' : ''}">${d.vacio ? '—' : $$(d.resultado)}</td>
          <td class="num">${d.vacio ? '' : pct(d.tasa)}</td><td class="num">${d.vacio ? '' : $$(acum)}</td></tr>`; }).join('')}</tbody>
      </table></div>
      <p class="hint" style="margin:8px 0 0">Toque un mes para abrirlo.</p></div>
    ${Object.keys(fuentes).length ? `<div class="card"><h2>Ingresos por fuente</h2>${barrasCategorias(Object.entries(fuentes).sort((a, b) => b[1] - a[1]))}</div>` : ''}
    ${Object.keys(cats).length ? `<div class="card"><h2>Gastos por cuenta</h2>${barrasCategorias(Object.entries(cats).sort((a, b) => b[1] - a[1]))}</div>` : ''}`;
  $('#a-ant').onclick = () => { anioVista--; renderAnio(); };
  $('#a-sig').onclick = () => { anioVista++; renderAnio(); };
  view.querySelectorAll('tr[data-mes]').forEach(tr => (tr.onclick = () => { mesVista = tr.dataset.mes; seccion = 'mes'; renderMes(); }));
  activarTooltips();
}

/* Gráfico de barras del ahorro mensual: azul si se ahorró, rojo si se gastó más de lo que ingresó. */
function graficoAhorro(datos) {
  const W = 360, H = 190, m = { t: 10, r: 4, b: 22, l: 4 };
  const vals = datos.map(d => (d.vacio ? 0 : d.resultado));
  const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
  if (max === 0 && min === 0) return '<p class="hint">Sin datos en este año.</p>';
  const alto = H - m.t - m.b, y = v => m.t + (max - v) / (max - min) * alto, cero = y(0);
  const ancho = (W - m.l - m.r) / 12, bw = Math.min(20, ancho - 6);
  const barras = datos.map((d, i) => {
    const v = vals[i], x = m.l + i * ancho + (ancho - bw) / 2;
    const y1 = Math.min(y(v), cero), h = Math.max(Math.abs(y(v) - cero), d.vacio ? 0 : 1.5);
    const r = Math.min(4, h / 2);
    // Extremo redondeado sólo del lado del dato; la base queda recta sobre la línea del cero.
    const path = v >= 0
      ? `M${x},${y1 + h} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${y1 + h} Z`
      : `M${x},${y1} V${y1 + h - r} Q${x},${y1 + h} ${x + r},${y1 + h} H${x + bw - r} Q${x + bw},${y1 + h} ${x + bw},${y1 + h - r} V${y1} Z`;
    const etq = capitalizar(MESES[i]).slice(0, 3);
    const tip = d.vacio ? `${capitalizar(MESES[i])}: sin datos` : `${capitalizar(MESES[i])} · Ahorro ${$$(v)} · Ingresos ${$$(d.ingresos)} · Egresos ${$$(d.egresos)}`;
    return `<g class="tip-obj" data-tip="${esc(tip)}">
      <rect x="${m.l + i * ancho}" y="${m.t}" width="${ancho}" height="${alto}" fill="transparent"/>
      ${d.vacio ? '' : `<path d="${path}" class="${v >= 0 ? 'bar-pos' : 'bar-neg'}"/>`}
      <text x="${m.l + i * ancho + ancho / 2}" y="${H - 8}" text-anchor="middle" class="eje">${etq}</text></g>`;
  }).join('');
  return `<div class="grafico"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ahorro por mes del año">
      <line x1="${m.l}" x2="${W - m.r}" y1="${cero}" y2="${cero}" class="cero"/>${barras}</svg>
    <div class="tooltip" hidden></div></div>
    <div class="leyenda"><span><i class="sw bar-pos"></i>Ahorro</span><span><i class="sw bar-neg"></i>Gastó más de lo que ingresó</span></div>`;
}
function activarTooltips() {
  view.querySelectorAll('.grafico').forEach(g => {
    const tip = g.querySelector('.tooltip');
    const mostrar = (el, ev) => {
      tip.textContent = el.dataset.tip; tip.hidden = false;
      const caja = g.getBoundingClientRect();
      const x = Math.min(Math.max(ev.clientX - caja.left, 80), caja.width - 80);
      tip.style.left = x + 'px';
    };
    g.querySelectorAll('.tip-obj').forEach(el => {
      el.addEventListener('pointerenter', ev => mostrar(el, ev));
      el.addEventListener('pointerdown', ev => mostrar(el, ev));
    });
    g.addEventListener('pointerleave', () => (tip.hidden = true));
  });
}

/* ---------- PDF del mes ---------- */
async function pdfMes(mes) {
  if (!window.jspdf) throw new Error('No se pudo cargar el generador de PDF.');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const t = totalesMes(mes), f = flujoMes(mes), p = proyeccion(mes);
  const pesos = v => $$(v).replace(/ /g, ' ');
  doc.setFontSize(16); doc.text('Finanzas familiares', 14, 16);
  doc.setFontSize(11); doc.text(capitalizar(nombreMes(mes)), 14, 23);
  doc.setFontSize(9); doc.setTextColor(110); doc.text(`Generado el ${fmtFecha(hoy())}`, 196, 16, { align: 'right' }); doc.setTextColor(0);
  doc.autoTable({
    startY: 28, theme: 'grid', styles: { fontSize: 10 }, headStyles: { fillColor: [15, 110, 90] },
    head: [['Resumen', 'Importe']],
    body: [
      ['Ingresos', pesos(t.ingresos)], ['Gastos fijos y otros', pesos(t.fijos)], ['Tarjetas de crédito', pesos(t.tarjetas)],
      ['Total de egresos', pesos(t.egresos)], ['Ahorro del mes', pesos(t.resultado)],
      ['Porcentaje ahorrado', Number.isFinite(t.tasa) ? pct(t.tasa) : '—'],
      ...(p.base ? [['Saldo del banco al fin del mes (proyectado)', pesos(p.saldoFinal)]] : [])
    ],
    columnStyles: { 1: { halign: 'right' } }
  });
  const tabla = (titulo, filas) => {
    if (!filas.length) return;
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 8, theme: 'striped', styles: { fontSize: 9 }, headStyles: { fillColor: [15, 110, 90] },
      head: [[titulo, 'Fecha', 'Estado', 'Importe']],
      body: filas.map(x => [x.nombre + (x.moneda === 'USD' ? ` (${usd(x.original)})` : ''), fmtFecha(x.fecha), x.estado === 'realizado' ? 'Realizado' : 'Previsto', pesos(x.importe)]),
      columnStyles: { 3: { halign: 'right' } }
    });
  };
  tabla('Ingresos', f.filter(x => x.tipo === 'ingreso'));
  tabla('Gastos fijos y otros', f.filter(x => x.tipo === 'egreso'));
  tabla('Tarjetas de crédito', f.filter(x => x.tipo === 'tarjeta'));
  const cats = Object.entries(gastosPorCategoria(mes)).sort((a, b) => b[1] - a[1]);
  if (cats.length) {
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 8, theme: 'striped', styles: { fontSize: 9 }, headStyles: { fillColor: [15, 110, 90] },
      head: [['Gastos por cuenta', 'Importe', '%']],
      body: cats.map(([n, v]) => [n, pesos(v), t.egresos ? pct(v / t.egresos * 100) : '']),
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } }
    });
  }
  for (const r of resumenesMes(mes)) {
    if (!r.items.length) continue;
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 8, theme: 'striped', styles: { fontSize: 8 }, headStyles: { fillColor: [15, 110, 90] },
      head: [[`Tarjeta ${nombreTarjeta(r.tarjetaId)}`, 'Fecha', 'Cuenta', 'Importe']],
      body: r.items.filter(i => !i.excluido).map(i => [i.descripcion + (i.cuota ? ` (cuota ${i.cuota})` : ''), fmtFecha(i.fecha), i.categoria || 'Sin asignar', monto(i.monto, i.moneda).replace(/ /g, ' ')]),
      columnStyles: { 3: { halign: 'right' } }
    });
  }
  const paginas = doc.internal.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(`Página ${i} de ${paginas}`, 196, 290, { align: 'right' }); }
  entregarPDF(doc, `finanzas-${mes}.pdf`);
}

async function entregarPDF(doc, nombre) {
  const blob = doc.output('blob');
  const archivo = new File([blob], nombre, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [archivo] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [archivo], title: nombre }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  descargar(blob, nombre);
}
function descargar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
