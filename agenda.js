/* Agenda: seguimientos, licitaciones, propuestas, contratos, garantías y casos de soporte pendientes. */
'use strict';

let agendaTodo = false;

function itemsAgenda() {
  const h = hoy();
  const lim = n => sumarDias(h, n);
  const g = { seg: [], lic: [], prop: [], alq: [], gar: [], sop: [] };
  cuentas().forEach(c => actividadesDe(c).forEach(a => {
    const d = a.datos || {};
    const base = { c, a };
    if (a.segFecha && !a.segHecho && (agendaTodo || a.segFecha <= lim(14))) g.seg.push({ ...base, fecha: a.segFecha });
    if (a.tipo === 'licitacion' && ABIERTOS.includes(d.estado)) g.lic.push({ ...base, fecha: d.apertura || '' });
    if (a.tipo === 'propuesta' && ABIERTOS.includes(d.estado) && (agendaTodo || !d.validez || d.validez <= lim(15))) g.prop.push({ ...base, fecha: d.validez || '' });
    if (a.tipo === 'alquiler' && d.fin && d.fin >= sumarDias(h, -30) && (agendaTodo || d.fin <= lim(60))) g.alq.push({ ...base, fecha: d.fin });
    if (a.tipo === 'garantia' && d.vence && d.estado !== 'Cerrada' && d.vence >= sumarDias(h, -30) && (agendaTodo || d.vence <= lim(60))) g.gar.push({ ...base, fecha: d.vence });
    if ((a.tipo === 'soporte' || a.tipo === 'consulta') && ABIERTOS.includes(d.estado)) g.sop.push({ ...base, fecha: a.fecha });
  }));
  Object.values(g).forEach(l => l.sort((x, y) => (x.fecha || '9999').localeCompare(y.fecha || '9999')));
  return g;
}

function pillFecha(fecha, etiqueta) {
  if (!fecha) return `<span class="pill neutral">${esc(etiqueta)}: sin fecha</span>`;
  const d = diasEntre(hoy(), fecha);
  const cls = d < 0 ? 'late' : d <= 3 ? 'warn' : 'info';
  const cuando = d < 0 ? `vencido hace ${-d} d` : d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} d`;
  return `<span class="pill ${cls}">${esc(etiqueta)}: ${fmtFecha(fecha)} (${cuando})</span>`;
}

function renderAgenda() {
  seccion = 'agenda';
  setHeader('Agenda', null);
  const g = itemsAgenda();
  const bloque = (titulo, lista, fn, vacio) => `
    <div class="card">
      <h2>${titulo} <span class="hint">(${lista.length})</span></h2>
      ${lista.map(fn).join('') || `<p class="hint">${vacio}</p>`}
    </div>`;
  const cab = it => `<div class="name">${esc(it.c.nombre)}</div>`;
  const total = Object.values(g).reduce((s, l) => s + l.length, 0);

  view.innerHTML = `
    <div class="segmented" role="group" aria-label="Alcance">
      <button data-todo="0" class="${agendaTodo ? '' : 'on'}">Próximos días</button>
      <button data-todo="1" class="${agendaTodo ? 'on' : ''}">Todo lo pendiente</button>
    </div>
    ${!cuentas().length ? '<div class="empty">Todavía no hay cuentas cargadas.</div>' : !total ? '<div class="empty">No hay pendientes. </div>' : ''}
    ${bloque('Seguimientos', g.seg, it => `
      <div class="agenda-item" data-cuenta="${it.c.id}">
        ${cab(it)}
        <div class="sub">${esc(tipoActTxt(it.a.tipo))} del ${fmtFecha(it.a.fecha)}${it.a.segTexto ? ' · ' + esc(it.a.segTexto) : ''}</div>
        <div class="pills">${pillFecha(it.fecha, 'Seguimiento')}
          <button class="btn small" data-hecho="${it.c.id}|${it.a.id}">Hecho</button>
          <button class="btn small" data-registrar="${it.c.id}">Registrar actividad</button></div>
      </div>`, agendaTodo ? 'Sin seguimientos pendientes.' : 'Sin seguimientos en los próximos 14 días.')}
    ${bloque('Licitaciones en curso', g.lic, it => `
      <div class="agenda-item" data-cuenta="${it.c.id}">${cab(it)}
        <div class="sub">${esc(resumenDatos(it.a))}</div>
        <div class="pills">${pillFecha(it.fecha, 'Apertura')}<span class="pill warn">${esc(it.a.datos.estado)}</span></div></div>`,
      'Sin licitaciones en curso.')}
    ${bloque('Propuestas por vencer o sin respuesta', g.prop, it => `
      <div class="agenda-item" data-cuenta="${it.c.id}">${cab(it)}
        <div class="sub">${esc(resumenDatos(it.a))}</div>
        <div class="pills">${pillFecha(it.fecha, 'Validez')}<span class="pill warn">${esc(it.a.datos.estado)}</span></div></div>`,
      agendaTodo ? 'Sin propuestas abiertas.' : 'Sin propuestas por vencer en los próximos 15 días.')}
    ${bloque('Contratos de alquiler por vencer', g.alq, it => `
      <div class="agenda-item" data-cuenta="${it.c.id}">${cab(it)}
        <div class="sub">${esc(resumenDatos(it.a))}</div>
        <div class="pills">${pillFecha(it.fecha, 'Fin del contrato')}</div></div>`,
      agendaTodo ? 'Sin contratos con fecha de fin.' : 'Sin contratos que venzan en los próximos 60 días.')}
    ${bloque('Garantías por vencer', g.gar, it => `
      <div class="agenda-item" data-cuenta="${it.c.id}">${cab(it)}
        <div class="sub">${esc(resumenDatos(it.a))}</div>
        <div class="pills">${pillFecha(it.fecha, 'Vencimiento')}</div></div>`,
      agendaTodo ? 'Sin garantías registradas.' : 'Sin garantías que venzan en los próximos 60 días.')}
    ${bloque('Soporte y consultas abiertas', g.sop, it => `
      <div class="agenda-item" data-cuenta="${it.c.id}">${cab(it)}
        <div class="sub">${esc(tipoActTxt(it.a.tipo))} del ${fmtFecha(it.a.fecha)}${resumenDatos(it.a) ? ' · ' + esc(resumenDatos(it.a)) : ''}</div>
        ${it.a.detalle ? `<div class="sub small pre">${esc(it.a.detalle)}</div>` : ''}
        <div class="pills"><span class="pill warn">${esc(it.a.datos.estado)}</span>
          <button class="btn small" data-editar="${it.c.id}|${it.a.id}">Actualizar estado</button></div></div>`,
      'Sin casos abiertos.')}`;

  view.querySelectorAll('[data-todo]').forEach(b => (b.onclick = () => { agendaTodo = b.dataset.todo === '1'; renderAgenda(); }));
  view.querySelectorAll('[data-cuenta]').forEach(el => (el.onclick = e => {
    if (e.target.closest('button')) return;
    renderCuenta(el.dataset.cuenta);
  }));
  view.querySelectorAll('[data-hecho]').forEach(b => (b.onclick = () => {
    const [cid, aid] = b.dataset.hecho.split('|');
    const c = findCuenta(cid); const a = c.actividades.find(x => x.id === aid);
    a.segHecho = true; tocar(a); tocar(c); save(); toast('Seguimiento marcado como hecho.'); renderAgenda();
  }));
  view.querySelectorAll('[data-registrar]').forEach(b => (b.onclick = () => renderFormActividad(b.dataset.registrar, null, null, renderAgenda)));
  view.querySelectorAll('[data-editar]').forEach(b => (b.onclick = () => {
    const [cid, aid] = b.dataset.editar.split('|');
    renderFormActividad(cid, aid, null, renderAgenda);
  }));
}
