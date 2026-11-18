/* Informes en PDF y exportación de contactos (CSV). */
'use strict';

let filtrosInf = { informe: 'cuentas', desde: '', hasta: '', tipo: '', etapa: '', provincia: '', tipoAct: '' };

function renderInformes() {
  seccion = 'informes';
  setHeader('Informes', null);
  const todas = cuentas();
  if (!todas.length) { view.innerHTML = '<div class="empty">Todavía no hay cuentas cargadas.</div>'; return; }
  const f = filtrosInf;
  const conPeriodo = f.informe !== 'cuentas' && f.informe !== 'contactos';
  const sel = (id, etiqueta, todasTxt, ops, v) => `<div class="form-row"><label for="${id}">${etiqueta}</label>
    <select class="field" id="${id}"><option value="">${todasTxt}</option>
    ${ops.map(o => (Array.isArray(o) ? o : [o, o])).map(([k, l]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;

  view.innerHTML = `
    <div class="card">
      <h2>Informe</h2>
      <div class="choice vertical" data-choice="i-informe">
        ${[['cuentas', 'Listado de cuentas', 'Etapa, contactos decisores, última actividad y próximo seguimiento.'],
           ['actividades', 'Actividades del período', 'Contactos, reuniones, cotizaciones, licitaciones, ventas, alquileres, garantías, soporte y consultas.'],
           ['negocios', 'Cotizaciones, licitaciones, ventas y alquileres', 'Montos y estados, con totales por moneda.'],
           ['contactos', 'Contactos (archivo CSV)', 'Para abrir en Excel o importar en Google Contactos.']]
          .map(([k, l, d]) => `<button type="button" class="${f.informe === k ? 'on' : ''}" data-val="${k}"><b>${l}</b><small>${d}</small></button>`).join('')}
      </div>
      <input type="hidden" id="i-informe" value="${f.informe}">
    </div>
    <form class="card" id="finf">
      <h2>Filtros</h2>
      ${conPeriodo ? `<div class="grid2">
        <div class="form-row"><label for="i-desde">Desde</label><input class="field" type="date" id="i-desde" value="${esc(f.desde)}"></div>
        <div class="form-row"><label for="i-hasta">Hasta</label><input class="field" type="date" id="i-hasta" value="${esc(f.hasta)}"></div>
      </div>
      <div class="chips mb">${[['mes', 'Este mes'], ['trim', 'Últimos 3 meses'], ['anio', 'Este año'], ['todo', 'Todo']].map(([k, l]) => `<button type="button" class="chip" data-per="${k}">${l}</button>`).join('')}</div>` : ''}
      ${sel('i-tipo', 'Tipo de institución', 'Todos', unicos(todas.map(c => c.tipo)), f.tipo)}
      ${sel('i-etapa', 'Etapa', 'Todas', ETAPAS.filter(e => todas.some(c => c.etapa === e[0])), f.etapa)}
      ${sel('i-prov', 'Provincia', 'Todas', unicos(todas.map(c => c.provincia)), f.provincia)}
      ${f.informe === 'actividades' ? sel('i-tact', 'Tipo de actividad', 'Todas', Object.entries(TIPOS_ACT).map(([k, v]) => [k, v.l]), f.tipoAct) : ''}
      <button class="btn primary" type="submit">${f.informe === 'contactos' ? 'Descargar CSV' : 'Generar PDF'}</button>
    </form>`;

  conectarCampos(view);
  $('#i-informe').onchange = e => { leerFiltros(); filtrosInf.informe = e.target.value || 'cuentas'; renderInformes(); };
  view.querySelectorAll('[data-per]').forEach(b => (b.onclick = () => {
    const h = hoy(), [y, m] = h.split('-');
    const r = { mes: [`${y}-${m}-01`, h], trim: [sumarDias(h, -91), h], anio: [`${y}-01-01`, h], todo: ['', ''] }[b.dataset.per];
    $('#i-desde').value = r[0]; $('#i-hasta').value = r[1];
  }));
  $('#finf').onsubmit = async e => {
    e.preventDefault();
    leerFiltros();
    if (f.desde && f.hasta && f.desde > f.hasta) { toast('La fecha "desde" es posterior a "hasta".'); return; }
    if (filtrosInf.informe === 'contactos') return exportarContactosCSV();
    if (!window.jspdf) { toast('No se pudo cargar el generador de PDF.'); return; }
    if (filtrosInf.informe === 'cuentas') await pdfCuentas();
    else if (filtrosInf.informe === 'actividades') await pdfActividades(false);
    else await pdfActividades(true);
  };
}

function leerFiltros() {
  const v = id => ($('#' + id) ? $('#' + id).value : '');
  Object.assign(filtrosInf, { desde: v('i-desde'), hasta: v('i-hasta'), tipo: v('i-tipo'), etapa: v('i-etapa'), provincia: v('i-prov'), tipoAct: v('i-tact') });
}

const cuentasFiltradas = () => cuentas()
  .filter(c => (!filtrosInf.tipo || c.tipo === filtrosInf.tipo) && (!filtrosInf.etapa || c.etapa === filtrosInf.etapa) && (!filtrosInf.provincia || c.provincia === filtrosInf.provincia))
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

function descripcionFiltros(conPeriodo) {
  const f = filtrosInf, p = [];
  if (conPeriodo) p.push(f.desde || f.hasta ? `Período: ${f.desde ? fmtFecha(f.desde) : 'inicio'} a ${f.hasta ? fmtFecha(f.hasta) : 'hoy'}` : 'Período: todo');
  if (f.tipo) p.push(`Tipo: ${f.tipo}`);
  if (f.etapa) p.push(`Etapa: ${etapaTxt(f.etapa)}`);
  if (f.provincia) p.push(`Provincia: ${f.provincia}`);
  if (conPeriodo && f.tipoAct && f.informe === 'actividades') p.push(`Actividad: ${tipoActTxt(f.tipoAct)}`);
  return p.join(' · ');
}

const ESTILO_TABLA = {
  theme: 'grid',
  styles: { fontSize: 8, cellPadding: 2, valign: 'middle' },
  headStyles: { fillColor: [10, 31, 99], textColor: 255, halign: 'center', fontSize: 8 },
  footStyles: { fillColor: [225, 236, 252], textColor: 20, fontStyle: 'bold' },
  alternateRowStyles: { fillColor: [245, 248, 250] }
};

async function pdfCuentas() {
  const lista = cuentasFiltradas();
  if (!lista.length) { toast('No hay cuentas con esos filtros.'); return; }
  const { doc, y } = await nuevoPDF('landscape', 'Listado de cuentas B2B', descripcionFiltros(false));
  const body = lista.map(c => {
    const dec = decisores(c).map(x => x.nombre + (x.cargo ? ` (${x.cargo})` : '')).join('\n');
    const seg = proximoSeguimiento(c);
    return [c.nombre, c.tipo || '', etapaTxt(c.etapa), [c.ciudad, c.provincia].filter(Boolean).join(', '),
      String(contactosDe(c).length), dec, c.interes.join(', '), fmtFecha(ultimaActividad(c)), seg ? fmtFecha(seg) : ''];
  });
  doc.autoTable({
    ...ESTILO_TABLA, startY: y + 1,
    head: [['Institución', 'Tipo', 'Etapa', 'Ubicación', 'Contactos', 'Decisores', 'Productos de interés', 'Última actividad', 'Próximo seguimiento']],
    body, foot: [[`Total: ${lista.length} cuenta(s)`, '', '', '', String(lista.reduce((s, c) => s + contactosDe(c).length, 0)), '', '', '', '']], showFoot: 'lastPage',
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 }, 4: { halign: 'center', cellWidth: 18 }, 7: { halign: 'center', cellWidth: 20 }, 8: { halign: 'center', cellWidth: 22 } },
    didDrawPage: () => piePagina(doc)
  });
  await entregarPDF(doc, `alveon-b2b-cuentas-${hoy()}.pdf`, 'Cuentas B2B – Alveon');
}

async function pdfActividades(soloNegocios) {
  const f = filtrosInf;
  const NEG = ['propuesta', 'licitacion', 'venta', 'alquiler'];
  const filas = [];
  cuentasFiltradas().forEach(c => actividadesDe(c).forEach(a => {
    if (f.desde && a.fecha < f.desde) return;
    if (f.hasta && a.fecha > f.hasta) return;
    if (soloNegocios ? !NEG.includes(a.tipo) : f.tipoAct && a.tipo !== f.tipoAct) return;
    filas.push({ c, a });
  }));
  if (!filas.length) { toast('No hay actividades con esos filtros.'); return; }
  filas.sort((x, y) => x.a.fecha.localeCompare(y.a.fecha) || x.c.nombre.localeCompare(y.c.nombre, 'es'));
  const titulo = soloNegocios ? 'Cotizaciones, licitaciones, ventas y alquileres' : 'Actividades comerciales';
  const { doc, y } = await nuevoPDF('landscape', titulo, descripcionFiltros(true));

  if (soloNegocios) {
    const body = filas.map(({ c, a }) => {
      const d = a.datos || {};
      return [fmtFecha(a.fecha), c.nombre, tipoActTxt(a.tipo), d.numero || d.comprobante || '', (d.productos || []).join(', '),
        d.cantidad ? String(d.cantidad) : '', fmtMonto(d.monto, d.moneda) + (a.tipo === 'alquiler' && d.monto !== '' && d.monto != null ? ' /mes' : ''),
        d.estado || (a.tipo === 'venta' ? 'Concretada' : a.tipo === 'alquiler' ? 'Vigente' : ''),
        d.apertura ? `Apertura ${fmtFecha(d.apertura)}` : d.validez ? `Validez ${fmtFecha(d.validez)}` : d.fin ? `Fin ${fmtFecha(d.fin)}` : ''];
    });
    doc.autoTable({
      ...ESTILO_TABLA, startY: y + 1,
      head: [['Fecha', 'Institución', 'Tipo', 'N.º / comprobante', 'Productos', 'Cant.', 'Monto', 'Estado', 'Fechas clave']],
      body, columnStyles: { 0: { halign: 'center', cellWidth: 20 }, 1: { fontStyle: 'bold', cellWidth: 42 }, 5: { halign: 'center', cellWidth: 12 }, 6: { halign: 'right', cellWidth: 30 } },
      didDrawPage: () => piePagina(doc)
    });
    // Totales por tipo, estado y moneda
    const tot = new Map();
    filas.forEach(({ a }) => {
      const d = a.datos || {};
      if (d.monto === '' || d.monto == null) return;
      const est = d.estado || (a.tipo === 'venta' ? 'Concretada' : 'Vigente');
      const k = `${tipoActTxt(a.tipo)}|${est}|${d.moneda || 'ARS'}`;
      const t = tot.get(k) || { n: 0, m: 0 }; t.n++; t.m += Number(d.monto) || 0; tot.set(k, t);
    });
    if (tot.size) {
      doc.autoTable({
        ...ESTILO_TABLA, startY: doc.lastAutoTable.finalY + 8,
        head: [['Tipo', 'Estado', 'Cantidad', 'Monto total']],
        body: [...tot.entries()].sort().map(([k, t]) => { const [tp, es, mo] = k.split('|'); return [tp, es, String(t.n), fmtMonto(t.m, mo) + (tp === 'Alquiler' ? ' /mes' : '')]; }),
        tableWidth: 150, columnStyles: { 2: { halign: 'center' }, 3: { halign: 'right' } },
        didDrawPage: () => piePagina(doc)
      });
    }
  } else {
    const body = filas.map(({ c, a }) => [fmtFecha(a.fecha), c.nombre, tipoActTxt(a.tipo),
      nombresContactos(c, a.contactos).join(', '), [resumenDatos(a), a.datos?.estado ? `Estado: ${a.datos.estado}` : ''].filter(Boolean).join(' · '),
      a.detalle || '', a.segFecha ? `${fmtFecha(a.segFecha)}${a.segHecho ? ' (hecho)' : ''}${a.segTexto ? ' – ' + a.segTexto : ''}` : '']);
    doc.autoTable({
      ...ESTILO_TABLA, startY: y + 1,
      head: [['Fecha', 'Institución', 'Actividad', 'Contactos', 'Datos', 'Detalle', 'Seguimiento']],
      body, columnStyles: { 0: { halign: 'center', cellWidth: 20 }, 1: { fontStyle: 'bold', cellWidth: 40 }, 2: { cellWidth: 32 }, 3: { cellWidth: 32 }, 6: { cellWidth: 32 } },
      didDrawPage: () => piePagina(doc)
    });
    const porTipo = new Map();
    filas.forEach(({ a }) => porTipo.set(tipoActTxt(a.tipo), (porTipo.get(tipoActTxt(a.tipo)) || 0) + 1));
    doc.autoTable({
      ...ESTILO_TABLA, startY: doc.lastAutoTable.finalY + 8,
      head: [['Actividad', 'Cantidad']], body: [...porTipo.entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => [k, String(n)]),
      foot: [['Total', String(filas.length)]], tableWidth: 90, columnStyles: { 1: { halign: 'center' } },
      didDrawPage: () => piePagina(doc)
    });
  }
  await entregarPDF(doc, `alveon-b2b-${soloNegocios ? 'negocios' : 'actividades'}-${hoy()}.pdf`, titulo + ' – Alveon');
}

/* Ficha completa de una cuenta. */
async function fichaCuentaPDF(c) {
  if (!window.jspdf) { toast('No se pudo cargar el generador de PDF.'); return; }
  const { doc, y, pageW } = await nuevoPDF('portrait', 'Ficha de cuenta B2B', '');
  let yy = y + 4;
  doc.setFontSize(14); doc.setTextColor(10, 31, 99);
  doc.text(c.nombre, 14, yy); yy += 6;
  doc.setFontSize(9); doc.setTextColor(60);
  const datos = [
    ['Tipo', c.tipo], ['Etapa', etapaTxt(c.etapa)], ['Ubicación', ubicacionTexto(c)], ['CUIT', c.cuit],
    ['Teléfono', c.telefono], ['WhatsApp', c.celular], ['Correo', c.email], ['Sitio web', c.web],
    ['Productos de interés', c.interes.join(', ')], ['Notas', c.notas]
  ].filter(([, v]) => v);
  doc.autoTable({
    startY: yy, body: datos, theme: 'plain', styles: { fontSize: 9, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38, textColor: [90, 90, 90] } }, didDrawPage: () => piePagina(doc)
  });
  const conts = contactosDe(c).sort(ordenContactos);
  if (conts.length) {
    doc.autoTable({
      ...ESTILO_TABLA, startY: doc.lastAutoTable.finalY + 6,
      head: [['Contacto', 'Cargo / área', 'Rol', 'Correo', 'Celular', 'Teléfono']],
      body: conts.map(x => [x.nombre, [x.cargo, x.area].filter(Boolean).join(' · '), rolTxt(x.rol), x.email || '', x.celular || '', x.telefono || '']),
      columnStyles: { 0: { fontStyle: 'bold' } }, didDrawPage: () => piePagina(doc)
    });
  }
  const acts = actividadesDe(c);
  if (acts.length) {
    doc.autoTable({
      ...ESTILO_TABLA, startY: doc.lastAutoTable.finalY + 6,
      head: [['Fecha', 'Actividad', 'Datos', 'Detalle', 'Seguimiento']],
      body: acts.map(a => [fmtFecha(a.fecha), tipoActTxt(a.tipo),
        [resumenDatos(a), a.datos?.estado ? `Estado: ${a.datos.estado}` : '', nombresContactos(c, a.contactos).length ? 'Con: ' + nombresContactos(c, a.contactos).join(', ') : ''].filter(Boolean).join('\n'),
        a.detalle || '', a.segFecha ? `${fmtFecha(a.segFecha)}${a.segHecho ? ' (hecho)' : ''}${a.segTexto ? '\n' + a.segTexto : ''}` : '']),
      columnStyles: { 0: { halign: 'center', cellWidth: 20 }, 1: { cellWidth: 32 }, 4: { cellWidth: 28 } },
      didDrawPage: () => piePagina(doc)
    });
  }
  void pageW;
  await entregarPDF(doc, `alveon-b2b-${c.nombre.toLowerCase().replace(/[^a-z0-9áéíóúñü]+/gi, '-').slice(0, 40)}-${hoy()}.pdf`, `Ficha de ${c.nombre}`);
}

/* ---------- PDF: encabezado, logo y entrega ---------- */
let logoCache;
async function cargarLogo() {
  if (logoCache !== undefined) return logoCache;
  try {
    const r = await fetch('logo.jpg');
    if (!r.ok) throw new Error();
    const blob = await r.blob();
    const url = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(blob); });
    const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url; });
    logoCache = { url, w: img.naturalWidth, h: img.naturalHeight };
  } catch (_) { logoCache = null; }
  return logoCache;
}

async function nuevoPDF(orientacion, subtitulo, descripcion) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: orientacion, unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let x = 14, abajoLogo = 0;
  const logo = await cargarLogo();
  if (logo) {
    let h = 16, w = (logo.w / logo.h) * h;
    if (w > 32) { w = 32; h = (logo.h / logo.w) * w; }
    doc.addImage(logo.url, 'JPEG', 14, 7, w, h);
    x = 14 + w + 5; abajoLogo = 7 + h;
  }
  doc.setFontSize(16); doc.setTextColor(10, 31, 99);
  doc.text('Alveon – Desarrollo de negocios B2B', x, 15);
  doc.setFontSize(11); doc.setTextColor(60);
  doc.text(subtitulo, x, 21.5);
  doc.setFontSize(9);
  doc.text(`Fecha de emisión: ${fmtFecha(hoy())}`, pageW - 14, 15, { align: 'right' });
  if (db.config.representante) doc.text(`Representante: ${db.config.representante}`, pageW - 14, 21.5, { align: 'right' });
  let y = Math.max(27, abajoLogo + 7);
  if (descripcion) {
    doc.setTextColor(90);
    const lineas = doc.splitTextToSize(descripcion, pageW - 28);
    doc.text(lineas, 14, y); y += 3 + (lineas.length - 1) * 4;
  }
  return { doc, y, pageW };
}

/* En el celular ofrece compartir (WhatsApp, correo, Drive); si no está disponible, descarga el archivo. */
async function entregarPDF(doc, nombre, titulo) {
  const blob = doc.output('blob');
  const file = new File([blob], nombre, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: titulo }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  descargar(blob, nombre);
  toast('PDF generado.');
}

function piePagina(doc) {
  const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text(`Página ${doc.internal.getNumberOfPages()}`, w - 14, h - 8, { align: 'right' });
}

/* ---------- Contactos en CSV ---------- */
function exportarContactosCSV() {
  const filas = [['Institución', 'Tipo', 'Etapa', 'Provincia', 'Ciudad', 'Nombre', 'Cargo', 'Área', 'Rol', 'Correo', 'Celular', 'Teléfono']];
  cuentasFiltradas().forEach(c => {
    if (c.email || c.telefono || c.celular) filas.push([c.nombre, c.tipo, etapaTxt(c.etapa), c.provincia, c.ciudad, '(general)', '', '', '', c.email, c.celular, c.telefono]);
    contactosDe(c).sort(ordenContactos).forEach(x =>
      filas.push([c.nombre, c.tipo, etapaTxt(c.etapa), c.provincia, c.ciudad, x.nombre, x.cargo, x.area, rolTxt(x.rol), x.email, x.celular, x.telefono]));
  });
  if (filas.length === 1) { toast('No hay contactos con esos filtros.'); return; }
  const csv = filas.map(f => f.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  descargar(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `alveon-b2b-contactos-${hoy()}.csv`);
  toast(`${filas.length - 1} contacto(s) exportado(s).`);
}
