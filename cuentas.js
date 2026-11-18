/* Cuentas (instituciones), contactos y actividades. */
'use strict';

/* ---------- Cálculos ---------- */
const ultimaActividad = c => (actividadesDe(c)[0] || {}).fecha || '';
const seguimientosPendientes = c => actividadesDe(c).filter(a => a.segFecha && !a.segHecho);
function proximoSeguimiento(c) {
  return seguimientosPendientes(c).map(a => a.segFecha).sort()[0] || '';
}
const decisores = c => contactosDe(c).filter(x => x.rol === 'decisor');
const nombresContactos = (c, ids) => contactosDe(c).filter(x => (ids || []).includes(x.id)).map(x => x.nombre);

function estadoSeguimiento(fecha) {
  if (!fecha) return null;
  const d = diasEntre(hoy(), fecha);
  if (d < 0) return { cls: 'late', txt: `Seguimiento vencido (${fmtFecha(fecha)})` };
  if (d === 0) return { cls: 'warn', txt: 'Seguimiento hoy' };
  if (d <= 3) return { cls: 'warn', txt: `Seguimiento: ${fmtFecha(fecha)}` };
  return { cls: 'info', txt: `Seguimiento: ${fmtFecha(fecha)}` };
}
const clsEtapa = k => (k === 'cliente' ? '' : k === 'perdida' ? 'neutral' : 'info');

/* ---------- Lista de cuentas ---------- */
let estadoLista = { filtro: '', tipo: '', etapa: '', provincia: '', orden: 'seguimiento' };

function renderCuentas() {
  seccion = 'cuentas';
  setHeader('Cuentas B2B', null);
  const todas = cuentas();
  const q = estadoLista.filtro.trim().toLowerCase();
  const lista = todas
    .filter(c => (!estadoLista.tipo || c.tipo === estadoLista.tipo) && (!estadoLista.etapa || c.etapa === estadoLista.etapa) &&
      (!estadoLista.provincia || c.provincia === estadoLista.provincia))
    .filter(c => !q || [c.nombre, c.tipo, c.ciudad, c.provincia, c.cuit, ...contactosDe(c).map(x => `${x.nombre} ${x.cargo || ''} ${x.email || ''}`)]
      .join(' ').toLowerCase().includes(q))
    .sort((a, b) => {
      if (estadoLista.orden === 'nombre') return a.nombre.localeCompare(b.nombre, 'es');
      if (estadoLista.orden === 'reciente') return ultimaActividad(b).localeCompare(ultimaActividad(a)) || a.nombre.localeCompare(b.nombre, 'es');
      const sa = proximoSeguimiento(a) || '9999', sb = proximoSeguimiento(b) || '9999';
      return sa.localeCompare(sb) || a.nombre.localeCompare(b.nombre, 'es');
    });
  const vencidos = todas.filter(c => { const s = proximoSeguimiento(c); return s && s <= hoy(); }).length;
  const provs = unicos(todas.map(c => c.provincia));

  view.innerHTML = `
    ${bannerInstalar()}
    <div class="actions">
      <button class="btn primary" id="btn-nueva">+ Nueva cuenta</button>
      <button class="btn" id="btn-act-rapida" ${todas.length ? '' : 'disabled'}>+ Actividad</button>
    </div>
    ${todas.length ? `
      <input class="search" id="buscar" type="search" placeholder="Buscar institución, contacto, cargo o ciudad" value="${esc(estadoLista.filtro)}">
      <div class="chips scroll" role="group" aria-label="Filtrar por etapa">
        <button class="chip ${!estadoLista.etapa ? 'on' : ''}" data-etapa="">Todas (${todas.length})</button>
        ${ETAPAS.map(([k, l]) => { const n = todas.filter(c => c.etapa === k).length; return n ? `<button class="chip ${estadoLista.etapa === k ? 'on' : ''}" data-etapa="${k}">${esc(l)} (${n})</button>` : ''; }).join('')}
      </div>
      <div class="grid2 filtros">
        <select class="field compact" id="f-tipo" aria-label="Tipo de institución"><option value="">Todos los tipos</option>
          ${unicos([...TIPOS_CUENTA, ...todas.map(c => c.tipo)]).filter(t => todas.some(c => c.tipo === t)).map(t => `<option ${t === estadoLista.tipo ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <select class="field compact" id="f-prov" aria-label="Provincia"><option value="">Todas las provincias</option>
          ${provs.map(p => `<option ${p === estadoLista.provincia ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
      </div>
      <div class="segmented" role="group" aria-label="Ordenar">
        ${[['seguimiento', 'Seguimiento'], ['reciente', 'Última actividad'], ['nombre', 'Nombre']].map(([k, l]) =>
          `<button data-orden="${k}" class="${estadoLista.orden === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
      <div class="summary"><span>${lista.length} de ${todas.length} cuenta(s)</span><span>${vencidos} seguimiento(s) para hoy o vencidos</span></div>
      <div id="lista">${lista.map(itemCuenta).join('') || '<div class="empty">Sin resultados.</div>'}</div>
    ` : `<div class="empty">Todavía no hay cuentas cargadas.<br>Toque <b>+ Nueva cuenta</b> para cargar una obra social, hospital, sanatorio, clínica u otro prestador.</div>`}
    ${piePrivacidad()}
  `;
  $('#btn-nueva').onclick = () => renderFormCuenta(null);
  $('#btn-act-rapida').onclick = renderElegirCuentaActividad;
  conectarInstalar();
  const b = $('#buscar');
  if (b) b.oninput = () => {
    estadoLista.filtro = b.value;
    const pos = b.selectionStart; renderCuentas();
    const nb = $('#buscar'); nb.focus(); nb.setSelectionRange(pos, pos);
  };
  if ($('#f-tipo')) $('#f-tipo').onchange = e => { estadoLista.tipo = e.target.value; renderCuentas(); };
  if ($('#f-prov')) $('#f-prov').onchange = e => { estadoLista.provincia = e.target.value; renderCuentas(); };
  view.querySelectorAll('[data-etapa]').forEach(el => (el.onclick = () => { estadoLista.etapa = el.dataset.etapa; renderCuentas(); }));
  view.querySelectorAll('[data-orden]').forEach(el => (el.onclick = () => { estadoLista.orden = el.dataset.orden; renderCuentas(); }));
  view.querySelectorAll('.doc-item').forEach(el => (el.onclick = () => renderCuenta(el.dataset.id)));
}

function itemCuenta(c) {
  const seg = estadoSeguimiento(proximoSeguimiento(c));
  const dec = decisores(c).length;
  return `
    <button class="doc-item" data-id="${c.id}">
      <div class="info">
        <div class="name">${esc(c.nombre)}</div>
        <div class="sub">${esc([c.tipo, c.ciudad, c.provincia].filter(Boolean).join(' · '))}</div>
        <div class="pills">
          <span class="pill ${clsEtapa(c.etapa)}">${esc(etapaTxt(c.etapa))}</span>
          ${seg ? `<span class="pill ${seg.cls}">${esc(seg.txt)}</span>` : ''}
          <span class="pill neutral">${contactosDe(c).length} contacto(s)${dec ? ` · ${dec} decisor(es)` : ''}</span>
        </div>
      </div>
      <div class="count"><b>${actividadesDe(c).length}</b><small>actividades</small></div>
    </button>`;
}

/* Actividad rápida: elegir la cuenta. */
function renderElegirCuentaActividad() {
  setHeader('Nueva actividad', () => irInicio());
  view.innerHTML = `
    <p class="hint">Elija la cuenta en la que registrará la actividad.</p>
    <input class="search" id="buscar-c" type="search" placeholder="Buscar institución">
    <div id="lista-c"></div>`;
  const pintar = () => {
    const q = $('#buscar-c').value.trim().toLowerCase();
    const l = cuentas().filter(c => !q || c.nombre.toLowerCase().includes(q)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    $('#lista-c').innerHTML = l.map(c => `<button class="doc-item" data-id="${c.id}"><div class="info"><div class="name">${esc(c.nombre)}</div>
      <div class="sub">${esc([c.tipo, c.ciudad].filter(Boolean).join(' · '))}</div></div></button>`).join('') || '<div class="empty">Sin resultados.</div>';
    $('#lista-c').querySelectorAll('.doc-item').forEach(el => (el.onclick = () =>
      renderFormActividad(el.dataset.id, null, null, () => renderCuenta(el.dataset.id))));
  };
  $('#buscar-c').oninput = pintar; pintar();
  setTimeout(() => $('#buscar-c').focus(), 50);
}

/* ---------- Ficha de la cuenta ---------- */
function renderCuenta(id) {
  const c = findCuenta(id);
  if (!c) { irInicio(); return; }
  const volver = () => renderCuenta(id);
  setHeader(c.nombre, () => irInicio());
  const acts = actividadesDe(c);
  const tiposPresentes = [...new Set(acts.map(a => a.tipo))];
  const filtro = renderCuenta.filtro?.[id] || '';
  const actsVis = acts.filter(a => !filtro || a.tipo === filtro);

  view.innerHTML = `
    <div class="card">
      <div class="row-between"><div class="label">${esc(c.tipo || 'Institución')}</div>
        <select class="field compact auto" id="etapa" aria-label="Etapa comercial">
          ${ETAPAS.map(([k, l]) => `<option value="${k}" ${k === c.etapa ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <h2 class="titulo-cuenta">${esc(c.nombre)}</h2>
      ${ubicacionTexto(c) ? `<div class="value">${esc(ubicacionTexto(c))}</div>` : ''}
      ${c.cuit ? `<div class="value"><span class="label">CUIT</span> ${esc(c.cuit)}</div>` : ''}
      ${c.web ? `<div class="value"><a href="${esc(/^https?:/i.test(c.web) ? c.web : 'https://' + c.web)}" target="_blank" rel="noopener">${esc(c.web)}</a></div>` : ''}
      ${c.interes.length ? `<div class="label">Productos de interés</div><div class="pills mb">${c.interes.map(p => `<span class="pill info">${esc(p)}</span>`).join('')}</div>` : ''}
      ${c.notas ? `<div class="label">Notas</div><div class="value pre">${esc(c.notas)}</div>` : ''}
      ${botonesComunicacion({ email: c.email, celular: c.celular, telefono: c.telefono }, 'inst')}
      <div class="actions mt0">
        <button class="btn" id="editar">Editar datos</button>
        <button class="btn" id="ficha">Ficha PDF</button>
      </div>
    </div>

    <div class="card">
      <div class="row-between"><h2>Contactos (${contactosDe(c).length})</h2>
        <button class="btn small primary" id="nuevo-contacto">+ Contacto</button></div>
      ${contactosDe(c).sort(ordenContactos).map(x => `
        <div class="contacto">
          <div class="row-between">
            <div class="info">
              <div class="name">${esc(x.nombre)}</div>
              <div class="sub">${esc([x.cargo, x.area].filter(Boolean).join(' · ') || 'Sin cargo indicado')}</div>
            </div>
            ${x.rol ? `<span class="pill ${x.rol === 'decisor' ? 'decisor' : x.rol === 'influye' ? 'warn' : 'neutral'}">${esc(rolTxt(x.rol))}</span>` : ''}
          </div>
          ${[x.email, x.celular, x.telefono].filter(Boolean).length ? `<div class="sub small">${esc([x.email, x.celular && 'Cel. ' + x.celular, x.telefono && 'Tel. ' + x.telefono].filter(Boolean).join(' · '))}</div>` : ''}
          ${x.notas ? `<div class="sub small pre">${esc(x.notas)}</div>` : ''}
          ${botonesComunicacion(x, x.id, true)}
        </div>`).join('') || '<p class="hint">Sin contactos. Agregue uno con <b>+ Contacto</b>.</p>'}
    </div>

    <div class="card">
      <div class="row-between"><h2>Actividades (${acts.length})</h2>
        <button class="btn small primary" id="nueva-act">+ Actividad</button></div>
      ${tiposPresentes.length > 1 ? `<div class="chips scroll mb">
        <button class="chip ${!filtro ? 'on' : ''}" data-ft="">Todas</button>
        ${tiposPresentes.map(t => `<button class="chip ${filtro === t ? 'on' : ''}" data-ft="${t}">${esc(tipoActTxt(t))}</button>`).join('')}</div>` : ''}
      ${actsVis.map(a => itemActividad(c, a)).join('') || '<p class="hint">Sin actividades registradas.</p>'}
    </div>

    <button class="btn danger" id="borrar">Eliminar cuenta</button>`;

  $('#etapa').onchange = e => { c.etapa = e.target.value; tocar(c); save(); toast(`Etapa: ${etapaTxt(c.etapa)}.`); };
  $('#editar').onclick = () => renderFormCuenta(id);
  $('#ficha').onclick = () => fichaCuentaPDF(c);
  $('#nuevo-contacto').onclick = () => renderFormContacto(id, null);
  $('#nueva-act').onclick = () => renderFormActividad(id, null, null, volver);
  view.querySelectorAll('[data-ft]').forEach(b => (b.onclick = () => { renderCuenta.filtro = { ...(renderCuenta.filtro || {}), [id]: b.dataset.ft }; renderCuenta(id); }));
  view.querySelectorAll('[data-editar-contacto]').forEach(b => (b.onclick = () => renderFormContacto(id, b.dataset.editarContacto)));
  view.querySelectorAll('[data-act]').forEach(b => (b.onclick = e => {
    if (e.target.closest('[data-hecho]')) return;
    renderFormActividad(id, b.dataset.act, null, volver);
  }));
  view.querySelectorAll('[data-hecho]').forEach(b => (b.onclick = () => {
    const a = c.actividades.find(x => x.id === b.dataset.hecho);
    a.segHecho = true; tocar(a); tocar(c); save(); toast('Seguimiento marcado como hecho.'); volver();
  }));
  conectarComunicacion(c, volver);
  $('#borrar').onclick = () => {
    if (!confirm(`¿Eliminar la cuenta "${c.nombre}" con sus contactos y actividades? Esta acción no se puede deshacer.`)) return;
    c.borrado = true; c.contactos = []; c.actividades = []; tocar(c); save(); toast('Cuenta eliminada.'); irInicio();
  };
}

const ordenContactos = (a, b) => (['decisor', 'influye', 'no', ''].indexOf(a.rol || '') - ['decisor', 'influye', 'no', ''].indexOf(b.rol || '')) || a.nombre.localeCompare(b.nombre, 'es');

/* Botones de correo, WhatsApp y llamada. Sólo se muestran los que tienen dato cargado. */
function botonesComunicacion(x, ref, conEditar) {
  const b = [];
  if (x.email) b.push(`<button class="btn small mail" data-mail="${esc(ref)}">Correo</button>`);
  if (x.celular) b.push(`<button class="btn small wa" data-wa="${esc(ref)}">WhatsApp</button>`);
  const tel = x.telefono || x.celular;
  if (tel) b.push(`<a class="btn small" href="tel:${esc(String(tel).replace(/[^\d+]/g, ''))}">Llamar</a>`);
  if (conEditar) b.push(`<button class="btn small" data-editar-contacto="${esc(ref)}">Editar</button>`);
  return b.length ? `<div class="com-btns">${b.join('')}</div>` : '';
}

function conectarComunicacion(c, volver) {
  const datosDe = ref => (ref === 'inst' ? { nombre: '', email: c.email, celular: c.celular, ids: [] } : (() => {
    const x = contactosDe(c).find(k => k.id === ref); return { ...x, ids: [x.id] };
  })());
  view.querySelectorAll('[data-mail]').forEach(b => (b.onclick = () => {
    const x = datosDe(b.dataset.mail);
    const asunto = `Alveon – ${c.nombre}`;
    abrirCorreo({ to: [x.email], asunto, cuerpo: cuerpoBase(x.nombre) });
    toast('Correo abierto.', 'Registrar actividad', () => { registrarComunicacion(c, 'email', x.ids, { asunto }); volver(); });
  }));
  view.querySelectorAll('[data-wa]').forEach(b => (b.onclick = () => {
    const x = datosDe(b.dataset.wa);
    abrirWhatsApp(x.celular, `${x.nombre ? 'Hola ' + x.nombre.split(' ')[0] + ', ' : 'Hola, '}le escribo de Alveon. `);
    toast('WhatsApp abierto.', 'Registrar actividad', () => { registrarComunicacion(c, 'whatsapp', x.ids); volver(); });
  }));
}

/* Resumen de una actividad en la ficha de la cuenta. */
function resumenDatos(a) {
  const d = a.datos || {};
  const partes = [];
  if (d.numero) partes.push(`N.º ${d.numero}`);
  if (d.modalidad) partes.push(d.modalidad);
  if (d.canal) partes.push(d.canal);
  if (d.productos?.length) partes.push(d.productos.join(', '));
  if (d.cantidad) partes.push(`${d.cantidad} u.`);
  if (d.monto !== '' && d.monto != null) partes.push(fmtMonto(d.monto, d.moneda) + (a.tipo === 'alquiler' ? ' por mes' : ''));
  if (d.apertura) partes.push(`Apertura ${fmtFecha(d.apertura)}`);
  if (d.validez) partes.push(`Válida hasta ${fmtFecha(d.validez)}`);
  if (d.inicio || d.fin) partes.push(`Contrato ${fmtFecha(d.inicio)} a ${fmtFecha(d.fin)}`);
  if (d.equipo) partes.push(d.equipo + (d.serie ? ` (serie ${d.serie})` : ''));
  else if (d.serie) partes.push(`Serie ${d.serie}`);
  if (d.vence) partes.push(`Garantía hasta ${fmtFecha(d.vence)}`);
  if (d.comprobante) partes.push(d.comprobante);
  if (d.lugar) partes.push(d.lugar);
  if (d.tema) partes.push(d.tema);
  if (d.asunto) partes.push(`«${d.asunto}»`);
  if (d.resultado) partes.push(`Resultado: ${d.resultado.toLowerCase()}`);
  if (d.destinatarios) partes.push(`${d.destinatarios} destinatario(s)`);
  return partes.join(' · ');
}

function clsEstado(e) {
  if (['Aceptada', 'Adjudicada', 'Resuelto', 'Respondida', 'Vigente', 'Cerrada'].includes(e)) return '';
  if (['Rechazada', 'No adjudicada', 'Desierta'].includes(e)) return 'late';
  return 'warn';
}

function itemActividad(c, a) {
  const d = a.datos || {};
  const seg = a.segFecha && !a.segHecho ? estadoSeguimiento(a.segFecha) : null;
  const nombres = nombresContactos(c, a.contactos);
  return `
    <div class="visit act" data-act="${a.id}" role="button" tabindex="0">
      <div class="meta"><span>${fmtFecha(a.fecha)} · ${esc(tipoActTxt(a.tipo))}</span>
        ${d.estado ? `<span class="pill ${clsEstado(d.estado)}">${esc(d.estado)}</span>` : ''}</div>
      ${resumenDatos(a) ? `<p>${esc(resumenDatos(a))}</p>` : ''}
      ${nombres.length ? `<p>Con: ${esc(nombres.join(', '))}</p>` : ''}
      ${a.detalle ? `<p class="pre">${esc(a.detalle)}</p>` : ''}
      ${a.segFecha ? `<div class="pills">${seg ? `<span class="pill ${seg.cls}">${esc(seg.txt)}${a.segTexto ? ': ' + esc(a.segTexto) : ''}</span>
        <button class="btn small" data-hecho="${a.id}">Marcar hecho</button>` :
        `<span class="pill neutral">Seguimiento hecho${a.segTexto ? ': ' + esc(a.segTexto) : ''}</span>`}</div>` : ''}
    </div>`;
}

/* ---------- Formulario de cuenta ---------- */
function camposCuenta() {
  return [
    { k: 'nombre', l: 'Nombre de la institución', t: 'text', req: true, ph: 'Por ejemplo: Sanatorio del Sur' },
    { k: 'tipo', l: 'Tipo', t: 'select', req: true, ops: TIPOS_CUENTA },
    { k: 'etapa', l: 'Etapa comercial', t: 'select', req: true, ops: ETAPAS, def: 'prospecto' },
    { k: 'provincia', l: 'Provincia', t: 'select', ops: PROVINCIAS },
    { k: 'ciudad', l: 'Ciudad o localidad', t: 'text', sugFn: () => unicos(cuentas().map(c => c.ciudad)) },
    { k: 'direccion', l: 'Dirección', t: 'text' },
    { k: 'telefono', l: 'Teléfono de la institución', t: 'tel' },
    { k: 'celular', l: 'WhatsApp de la institución', t: 'tel', hint: 'Con código de país y de área, por ejemplo: +54 9 11 1234 5678.' },
    { k: 'email', l: 'Correo general', t: 'email' },
    { k: 'web', l: 'Sitio web', t: 'text' },
    { k: 'cuit', l: 'CUIT', t: 'text' },
    { k: 'interes', l: 'Productos de interés', t: 'multi', opsFn: () => productos() },
    { k: 'notas', l: 'Notas', t: 'textarea' }
  ];
}

function camposContacto(pref) {
  return [
    { k: 'nombre', l: 'Nombre y apellido', t: 'text', req: pref !== 'pc' },
    { k: 'cargo', l: 'Posición o cargo', t: 'text', sugFn: () => unicos([...CARGOS, ...cuentas().flatMap(c => contactosDe(c).map(x => x.cargo))]) },
    { k: 'area', l: 'Área o servicio', t: 'text', ph: 'Compras, Auditoría, Neumonología…' },
    { k: 'rol', l: '¿Es decisor?', t: 'choice', ops: ROLES },
    { k: 'email', l: 'Correo electrónico', t: 'email' },
    { k: 'celular', l: 'Celular (WhatsApp)', t: 'tel', hint: 'Con código de país y de área, por ejemplo: +54 9 11 1234 5678. Puede quedar vacío.' },
    { k: 'telefono', l: 'Teléfono fijo o interno', t: 'tel' },
    { k: 'notas', l: 'Notas', t: 'textarea' }
  ];
}

function renderFormCuenta(id) {
  const c = id ? findCuenta(id) : null;
  const volver = c ? () => renderCuenta(id) : () => irInicio();
  setHeader(c ? 'Editar cuenta' : 'Nueva cuenta', volver);
  const campos = camposCuenta();
  const val = c || { etapa: 'prospecto', interes: [] };
  const cc = camposContacto('pc');
  view.innerHTML = `
    <form class="card" id="fcuenta" novalidate>
      ${campos.map(x => campoHTML(x, val[x.k] ?? x.def, 'f')).join('')}
      ${c ? '' : `<h2 class="mt">Primer contacto <span class="hint">(opcional)</span></h2>
        <p class="hint">Puede agregar más contactos después desde la ficha de la cuenta.</p>
        ${cc.map(x => campoHTML(x, '', 'pc')).join('')}`}
      <div class="wizard-nav">
        <button type="button" class="btn" id="cancelar">Cancelar</button>
        <button type="submit" class="btn primary">Guardar</button>
      </div>
    </form>`;
  conectarCampos(view);
  $('#cancelar').onclick = volver;
  if (!c) $('#f-nombre').focus();
  $('#fcuenta').onsubmit = e => {
    e.preventDefault();
    const v = leerCampos(campos, 'f');
    if (!v) return;
    const dup = cuentas().find(x => x.id !== id && x.nombre.trim().toLowerCase() === v.nombre.toLowerCase());
    if (dup && !confirm(`Ya existe una cuenta llamada "${dup.nombre}". ¿Guardar de todos modos?`)) return;
    if (c) {
      Object.assign(c, v); tocar(c); save(); toast('Cuenta actualizada.'); renderCuenta(id);
      return;
    }
    let primero = null;
    const vc = leerCampos(cc, 'pc');
    if (!vc) return;
    if (Object.values(vc).some(x => x !== '')) {
      if (!vc.nombre) { $('#pc-nombre-err').textContent = 'Indique el nombre del contacto o deje vacíos sus datos.'; $('#pc-nombre').focus(); return; }
      primero = { id: uid(), ...vc, creado: ahora(), actualizado: ahora() };
    }
    const nueva = { id: uid(), ...v, contactos: primero ? [primero] : [], actividades: [], creado: ahora(), actualizado: ahora() };
    db.cuentas.push(nueva); save();
    toast('Cuenta creada.');
    renderCuenta(nueva.id);
  };
}

/* ---------- Formulario de contacto ---------- */
function renderFormContacto(cuentaId, contactoId) {
  const c = findCuenta(cuentaId);
  const x = contactoId ? contactosDe(c).find(k => k.id === contactoId) : null;
  const volver = () => renderCuenta(cuentaId);
  setHeader(x ? 'Editar contacto' : 'Nuevo contacto', volver);
  const campos = camposContacto('k');
  view.innerHTML = `
    <p class="hint">${esc(c.nombre)}</p>
    <form class="card" id="fcont" novalidate>
      ${campos.map(f => campoHTML(f, x ? x[f.k] : '', 'k')).join('')}
      <div class="wizard-nav">
        <button type="button" class="btn" id="cancelar">Cancelar</button>
        <button type="submit" class="btn primary">Guardar</button>
      </div>
      ${x ? '<button type="button" class="btn danger mt" id="borrar">Eliminar contacto</button>' : ''}
    </form>`;
  conectarCampos(view);
  $('#cancelar').onclick = volver;
  if (!x) $('#k-nombre').focus();
  $('#fcont').onsubmit = e => {
    e.preventDefault();
    const v = leerCampos(campos, 'k');
    if (!v) return;
    if (x) Object.assign(x, v, { actualizado: ahora() });
    else c.contactos.push({ id: uid(), ...v, creado: ahora(), actualizado: ahora() });
    tocar(c); save(); toast(x ? 'Contacto actualizado.' : 'Contacto agregado.'); volver();
  };
  if ($('#borrar')) $('#borrar').onclick = () => {
    if (!confirm(`¿Eliminar a ${x.nombre} de los contactos?`)) return;
    Object.assign(x, { borrado: true, actualizado: ahora() }); tocar(c); save(); toast('Contacto eliminado.'); volver();
  };
}

/* ---------- Formulario de actividad ---------- */
function renderFormActividad(cuentaId, actId, tipoInicial, volver) {
  const c = findCuenta(cuentaId);
  const a = actId ? c.actividades.find(x => x.id === actId) : null;
  volver = volver || (() => renderCuenta(cuentaId));
  const tipo = a ? a.tipo : tipoInicial;
  setHeader(a ? 'Editar actividad' : 'Nueva actividad', volver);

  if (!tipo) {
    const grupos = [
      ['Comercial', ['contacto', 'reunion', 'propuesta', 'licitacion']],
      ['Operaciones', ['venta', 'alquiler', 'garantia', 'soporte', 'consulta']],
      ['Comunicaciones', ['llamada', 'email', 'whatsapp', 'otra']]
    ];
    view.innerHTML = `<p class="hint">${esc(c.nombre)} · ¿Qué tipo de actividad desea registrar?</p>
      ${grupos.map(([g, ts]) => `<div class="card"><h2>${g}</h2><div class="tipo-grid">
        ${ts.map(t => `<button class="btn" data-tipo="${t}">${esc(tipoActTxt(t))}</button>`).join('')}</div></div>`).join('')}`;
    view.querySelectorAll('[data-tipo]').forEach(b => (b.onclick = () => renderFormActividad(cuentaId, null, b.dataset.tipo, volver)));
    return;
  }

  const def = TIPOS_ACT[tipo] || TIPOS_ACT.otra;
  const conts = contactosDe(c).sort(ordenContactos);
  const comunes = [
    { k: 'fecha', l: 'Fecha', t: 'date', req: true, def: hoy() },
    { k: 'contactos', l: 'Contactos que participaron', t: 'multi', ops: conts.map(x => [x.id, x.nombre + (x.rol === 'decisor' ? ' (decisor)' : '')]),
      vacio: 'La cuenta no tiene contactos cargados.' }
  ];
  const propios = def.campos;
  const finales = [
    { k: 'detalle', l: 'Detalle', t: 'textarea', ph: 'Temas tratados, acuerdos, requerimientos, observaciones.' },
    { k: 'segFecha', l: 'Fecha de seguimiento', t: 'date', hint: 'Aparece en la agenda como recordatorio.' },
    { k: 'segTexto', l: 'Próximo paso', t: 'text', ph: 'Por ejemplo: llamar para conocer el resultado de la evaluación' }
  ];
  const valores = a ? { ...a.datos, fecha: a.fecha, contactos: a.contactos, detalle: a.detalle, segFecha: a.segFecha, segTexto: a.segTexto } : {};
  const valor = f => (valores[f.k] !== undefined ? valores[f.k] : f.def);

  view.innerHTML = `
    <p class="hint">${esc(c.nombre)}</p>
    <form class="card" id="fact" novalidate>
      <h2>${esc(def.l)}</h2>
      ${comunes.map(f => campoHTML(f, valor(f), 'a')).join('')}
      ${propios.map(f => campoHTML(f, valor(f), 'a')).join('')}
      ${finales.map(f => campoHTML(f, valor(f), 'a')).join('')}
      ${a && a.segFecha ? `<label class="check"><input type="checkbox" id="a-hecho" ${a.segHecho ? 'checked' : ''}> Seguimiento hecho</label>` : ''}
      <div class="chips" id="seg-rapido">
        ${[[3, '3 días'], [7, '1 semana'], [15, '15 días'], [30, '1 mes']].map(([n, l]) => `<button type="button" class="chip" data-dias="${n}">Seguimiento en ${l}</button>`).join('')}
      </div>
      <div class="wizard-nav">
        <button type="button" class="btn" id="cancelar">Cancelar</button>
        <button type="submit" class="btn primary">Guardar</button>
      </div>
      ${a ? '<button type="button" class="btn danger mt" id="borrar">Eliminar actividad</button>' : ''}
    </form>`;
  conectarCampos(view);
  // Los botones rápidos de seguimiento se ubican junto a la fecha de seguimiento.
  $('[data-campo="a-segFecha"]').appendChild($('#seg-rapido'));
  view.querySelectorAll('[data-dias]').forEach(b => (b.onclick = () => {
    $('#a-segFecha').value = sumarDias($('#a-fecha').value || hoy(), Number(b.dataset.dias));
  }));
  $('#cancelar').onclick = volver;
  $('#fact').onsubmit = e => {
    e.preventDefault();
    const campos = [...comunes, ...propios, ...finales];
    const v = leerCampos(campos, 'a');
    if (!v) return;
    const datos = {};
    propios.forEach(f => { datos[f.k] = v[f.k]; });
    const reg = { tipo, fecha: v.fecha, contactos: v.contactos, detalle: v.detalle, datos, segFecha: v.segFecha, segTexto: v.segTexto,
      segHecho: v.segFecha ? ($('#a-hecho') ? $('#a-hecho').checked : false) : false, actualizado: ahora() };
    if (a) Object.assign(a, reg);
    else c.actividades.push({ id: uid(), ...reg });
    const msg = avanzarEtapa(c, reg);
    tocar(c); save();
    toast(msg || (a ? 'Actividad actualizada.' : 'Actividad registrada.'));
    volver();
  };
  if ($('#borrar')) $('#borrar').onclick = () => {
    if (!confirm('¿Eliminar esta actividad?')) return;
    Object.assign(a, { borrado: true, actualizado: ahora() }); tocar(c); save(); toast('Actividad eliminada.'); volver();
  };
}

/* La cuenta avanza de etapa según la actividad registrada (nunca retrocede). */
function avanzarEtapa(c, reg) {
  const orden = ETAPAS.map(e => e[0]);
  let nueva = (TIPOS_ACT[reg.tipo] || {}).etapa;
  if (['Aceptada', 'Adjudicada'].includes(reg.datos.estado)) nueva = 'cliente';
  if (!nueva || c.etapa === 'perdida' || orden.indexOf(nueva) <= orden.indexOf(c.etapa)) return '';
  c.etapa = nueva;
  return `Actividad registrada. La cuenta pasó a la etapa "${etapaTxt(nueva)}".`;
}
