/* Difusión masiva por correo (todos los destinatarios en copia oculta) y por WhatsApp (uno por uno). */
'use strict';

const BORRADOR_KEY = 'alveon-b2b-borrador-v1';
const difu = {
  canal: 'email', sel: new Set(), enviados: new Set(), loteMax: 50,
  f: { q: '', tipo: '', etapa: '', provincia: '', rol: '', producto: '' },
  ...(() => { const b = leer(BORRADOR_KEY) || {}; return { asunto: b.asunto || '', cuerpo: b.cuerpo || '', textoWA: b.textoWA || '' }; })()
};
const guardarBorrador = () => escribir(BORRADOR_KEY, { asunto: difu.asunto, cuerpo: difu.cuerpo, textoWA: difu.textoWA });

/* Todos los destinatarios posibles (contactos y datos generales de cada institución). */
function destinatarios() {
  const f = difu.f, q = f.q.trim().toLowerCase();
  const res = [];
  cuentas()
    .filter(c => (!f.tipo || c.tipo === f.tipo) && (!f.etapa || c.etapa === f.etapa) && (!f.provincia || c.provincia === f.provincia) &&
      (!f.producto || c.interes.includes(f.producto)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .forEach(c => {
      const lista = [];
      if (!f.rol && (c.email || c.celular)) lista.push({ key: `${c.id}:_`, c, nombre: 'Contacto general de la institución', cargo: '', email: c.email, celular: c.celular, inst: true });
      contactosDe(c).sort(ordenContactos)
        .filter(x => !f.rol || (f.rol === 'decisor' ? x.rol === 'decisor' : ['decisor', 'influye'].includes(x.rol)))
        .forEach(x => lista.push({ key: `${c.id}:${x.id}`, c, x, nombre: x.nombre, cargo: [x.cargo, x.area].filter(Boolean).join(' · '), email: x.email, celular: x.celular, rol: x.rol }));
      const visibles = lista.filter(d => !q || `${c.nombre} ${d.nombre} ${d.cargo} ${d.email || ''}`.toLowerCase().includes(q));
      res.push(...visibles);
    });
  return res;
}
const tieneCanal = d => (difu.canal === 'email' ? !!d.email && emailValido(d.email) : !!d.celular && numeroWA(d.celular).length >= 10);

/* Destinatarios seleccionados, aunque no estén visibles con los filtros actuales. */
function seleccionados() {
  const guardados = { ...difu.f };
  difu.f = { q: '', tipo: '', etapa: '', provincia: '', rol: '', producto: '' };
  const todos = destinatarios();
  difu.f = guardados;
  return todos.filter(d => difu.sel.has(d.key) && tieneCanal(d));
}

function renderDifusion() {
  seccion = 'difusion';
  setHeader('Difusión masiva', null);
  if (!cuentas().length) { view.innerHTML = '<div class="empty">Todavía no hay cuentas cargadas.</div>'; return; }
  const todas = cuentas();
  const lista = destinatarios();
  const elegidos = seleccionados();
  const f = difu.f;
  const sel = (id, etiqueta, todasTxt, ops, v) => `<select class="field compact" id="${id}" aria-label="${etiqueta}"><option value="">${todasTxt}</option>
    ${ops.map(o => (Array.isArray(o) ? o : [o, o])).map(([k, l]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

  // Agrupar por cuenta
  const grupos = [];
  lista.forEach(d => { const g = grupos[grupos.length - 1]; if (g && g.c === d.c) g.items.push(d); else grupos.push({ c: d.c, items: [d] }); });

  view.innerHTML = `
    <div class="segmented" role="group" aria-label="Canal">
      <button data-canal="email" class="${difu.canal === 'email' ? 'on' : ''}">Correo (CCO)</button>
      <button data-canal="whatsapp" class="${difu.canal === 'whatsapp' ? 'on' : ''}">WhatsApp</button>
    </div>

    <div class="card">
      <h2>1. Destinatarios</h2>
      <input class="search" id="d-q" type="search" placeholder="Buscar institución o contacto" value="${esc(f.q)}">
      <div class="grid2 filtros">
        ${sel('d-tipo', 'Tipo', 'Todos los tipos', unicos(todas.map(c => c.tipo)), f.tipo)}
        ${sel('d-etapa', 'Etapa', 'Todas las etapas', ETAPAS.filter(e => todas.some(c => c.etapa === e[0])), f.etapa)}
        ${sel('d-prov', 'Provincia', 'Todas las provincias', unicos(todas.map(c => c.provincia)), f.provincia)}
        ${sel('d-rol', 'Rol', 'Todos los contactos', [['decisor', 'Sólo decisores'], ['influye', 'Decisores e influyentes']], f.rol)}
        ${sel('d-prod', 'Producto de interés', 'Cualquier producto de interés', productos(), f.producto)}
      </div>
      <div class="actions mt0">
        <button class="btn small" id="d-todos">Seleccionar visibles</button>
        <button class="btn small" id="d-ninguno">Quitar selección</button>
      </div>
      <div class="summary"><span><b>${elegidos.length}</b> seleccionado(s)</span><span>${lista.filter(tieneCanal).length} visible(s) con ${difu.canal === 'email' ? 'correo' : 'WhatsApp'}</span></div>
      <div class="dest-lista">
        ${grupos.map(g => {
          const habil = g.items.filter(tieneCanal);
          const todosOn = habil.length && habil.every(d => difu.sel.has(d.key));
          return `<div class="dest-grupo">
            <label class="dest-cab"><input type="checkbox" data-grupo="${g.c.id}" ${todosOn ? 'checked' : ''} ${habil.length ? '' : 'disabled'}>
              <span><b>${esc(g.c.nombre)}</b> <span class="hint">${esc([g.c.tipo, etapaTxt(g.c.etapa)].filter(Boolean).join(' · '))}</span></span></label>
            ${g.items.map(d => {
              const ok = tieneCanal(d);
              const dato = difu.canal === 'email' ? d.email : d.celular;
              return `<label class="dest ${ok ? '' : 'off'}"><input type="checkbox" data-key="${esc(d.key)}" ${difu.sel.has(d.key) && ok ? 'checked' : ''} ${ok ? '' : 'disabled'}>
                <span><span class="${d.inst ? 'hint' : ''}">${esc(d.nombre)}</span>${d.rol === 'decisor' ? ' <span class="pill decisor">Decisor</span>' : ''}
                <span class="sub small">${esc([d.cargo, dato || (difu.canal === 'email' ? 'Sin correo' : 'Sin celular')].filter(Boolean).join(' · '))}</span></span></label>`;
            }).join('')}
          </div>`;
        }).join('') || '<p class="hint">No hay destinatarios con estos filtros.</p>'}
      </div>
    </div>

    ${difu.canal === 'email' ? panelCorreo(elegidos) : panelWhatsApp(elegidos)}`;

  // Filtros
  view.querySelectorAll('[data-canal]').forEach(b => (b.onclick = () => { difu.canal = b.dataset.canal; renderDifusion(); }));
  const q = $('#d-q');
  q.oninput = () => { difu.f.q = q.value; const p = q.selectionStart; renderDifusion(); const n = $('#d-q'); n.focus(); n.setSelectionRange(p, p); };
  [['d-tipo', 'tipo'], ['d-etapa', 'etapa'], ['d-prov', 'provincia'], ['d-rol', 'rol'], ['d-prod', 'producto']].forEach(([id, k]) =>
    ($('#' + id).onchange = e => { difu.f[k] = e.target.value; renderDifusion(); }));
  $('#d-todos').onclick = () => { lista.filter(tieneCanal).forEach(d => difu.sel.add(d.key)); renderDifusion(); };
  $('#d-ninguno').onclick = () => { difu.sel.clear(); difu.enviados.clear(); renderDifusion(); };
  view.querySelectorAll('[data-key]').forEach(cb => (cb.onchange = () => {
    if (cb.checked) difu.sel.add(cb.dataset.key); else difu.sel.delete(cb.dataset.key);
    renderDifusionConservandoScroll();
  }));
  view.querySelectorAll('[data-grupo]').forEach(cb => (cb.onchange = () => {
    lista.filter(d => d.c.id === cb.dataset.grupo && tieneCanal(d)).forEach(d => (cb.checked ? difu.sel.add(d.key) : difu.sel.delete(d.key)));
    renderDifusionConservandoScroll();
  }));
  if (difu.canal === 'email') conectarCorreo(elegidos); else conectarWhatsApp(elegidos);
}

function renderDifusionConservandoScroll() {
  const y = window.scrollY;
  renderDifusion();
  window.scrollTo(0, y);
}

/* ---------- Correo con copia oculta ---------- */
function direccionesUnicas(elegidos) {
  const vistas = new Set();
  return elegidos.map(d => d.email.trim()).filter(e => { const k = e.toLowerCase(); if (vistas.has(k)) return false; vistas.add(k); return true; });
}

/* Divide las direcciones en lotes que respeten la cantidad máxima y el largo admitido del enlace. */
function lotesCorreo(direcciones) {
  const maxLargo = local.modoCorreo === 'app' ? 1900 : 7500;
  const lotes = [];
  let actual = [];
  const largo = l => urlCorreo({ to: [remitente()], bcc: l, asunto: difu.asunto, cuerpo: difu.cuerpo }).length;
  direcciones.forEach(e => {
    const prueba = [...actual, e];
    if (actual.length && (prueba.length > difu.loteMax || largo(prueba) > maxLargo)) { lotes.push(actual); actual = [e]; }
    else actual = prueba;
  });
  if (actual.length) lotes.push(actual);
  return lotes;
}

function panelCorreo(elegidos) {
  const dirs = direccionesUnicas(elegidos);
  const lotes = lotesCorreo(dirs);
  if (!difu.cuerpo) difu.cuerpo = `Estimados:\n\n\n\n${firma()}`;
  return `
    <div class="card">
      <h2>2. Mensaje</h2>
      <p class="hint">El correo se dirige a <b>${esc(remitente())}</b> y todos los destinatarios elegidos van en <b>copia oculta (CCO)</b>: nadie ve las direcciones de los demás. El texto es el mismo para todos.</p>
      <div class="form-row"><label for="m-asunto">Asunto</label><input class="field" id="m-asunto" value="${esc(difu.asunto)}"></div>
      <div class="form-row"><label for="m-cuerpo">Mensaje</label><textarea class="field tall" id="m-cuerpo">${esc(difu.cuerpo)}</textarea>
        <p class="hint small">Los archivos adjuntos (folletos, listas de precios) se agregan en la ventana de Gmail antes de enviar.</p></div>
      <div class="form-row"><label for="m-lote">Destinatarios por correo</label>
        <input class="field compact" id="m-lote" type="number" inputmode="numeric" min="1" max="500" value="${difu.loteMax}">
        <p class="hint small">Si hay más destinatarios, se arman varios correos. Gmail admite hasta 500 destinatarios por día en cuentas personales.</p></div>
    </div>
    <div class="card">
      <h2>3. Enviar</h2>
      <p class="hint">${dirs.length ? `${dirs.length} dirección(es) distinta(s) en ${lotes.length} correo(s).` : 'Seleccione al menos un destinatario con correo.'}
        ${local.modoCorreo === 'gmail' ? `Se abrirá Gmail con la cuenta ${esc(remitente())}; revise el mensaje y presione Enviar.` : 'Se abrirá la aplicación de correo del dispositivo; verifique que el remitente sea ' + esc(remitente()) + '.'}</p>
      ${lotes.map((l, i) => `<button class="btn primary mb" data-lote="${i}">${lotes.length > 1 ? `Abrir correo ${i + 1} de ${lotes.length} (${l.length})` : `Abrir correo (${l.length} en CCO)`}</button>`).join('')}
      <div class="actions mt0">
        <button class="btn" id="m-copiar" ${dirs.length ? '' : 'disabled'}>Copiar direcciones</button>
        <button class="btn" id="m-registrar" ${dirs.length ? '' : 'disabled'}>Registrar en las cuentas</button>
      </div>
    </div>`;
}

function conectarCorreo(elegidos) {
  const dirs = direccionesUnicas(elegidos);
  const actualizar = () => { difu.asunto = $('#m-asunto').value; difu.cuerpo = $('#m-cuerpo').value; guardarBorrador(); };
  $('#m-asunto').oninput = actualizar;
  $('#m-cuerpo').oninput = actualizar;
  $('#m-lote').onchange = e => { difu.loteMax = Math.min(500, Math.max(1, parseInt(e.target.value, 10) || 50)); renderDifusionConservandoScroll(); };
  view.querySelectorAll('[data-lote]').forEach(b => (b.onclick = () => {
    actualizar();
    if (!difu.asunto.trim() && !confirm('El correo no tiene asunto. ¿Abrirlo de todos modos?')) return;
    const lote = lotesCorreo(dirs)[Number(b.dataset.lote)];
    abrirCorreo({ to: [remitente()], bcc: lote, asunto: difu.asunto, cuerpo: difu.cuerpo });
    b.classList.remove('primary'); b.textContent += ' · abierto';
    toast('Correo abierto. Después de enviarlo, registre la difusión en las cuentas.', 'Registrar', () => registrarDifusion(elegidos, 'Correo'));
  }));
  $('#m-copiar').onclick = async () => {
    try { await navigator.clipboard.writeText(dirs.join(', ')); toast(`${dirs.length} dirección(es) copiada(s). Péguelas en el campo CCO.`); }
    catch (_) { prompt('Copie las direcciones:', dirs.join(', ')); }
  };
  $('#m-registrar').onclick = () => registrarDifusion(elegidos, 'Correo');
}

/* Agrega una actividad "Difusión masiva" en cada cuenta alcanzada. */
function registrarDifusion(elegidos, canal) {
  const porCuenta = new Map();
  elegidos.forEach(d => { if (!porCuenta.has(d.c.id)) porCuenta.set(d.c.id, []); porCuenta.get(d.c.id).push(d); });
  if (!porCuenta.size) return;
  if (!confirm(`Se registrará la difusión por ${canal.toLowerCase()} en ${porCuenta.size} cuenta(s). ¿Continuar?`)) return;
  const asunto = canal === 'Correo' ? difu.asunto : '';
  const texto = canal === 'Correo' ? difu.cuerpo : difu.textoWA;
  porCuenta.forEach((ds, id) => {
    const c = findCuenta(id);
    c.actividades.push({ id: uid(), tipo: 'difusion', fecha: hoy(), contactos: ds.filter(d => d.x).map(d => d.x.id),
      detalle: texto.slice(0, 500), datos: { canal, asunto, destinatarios: ds.length }, actualizado: ahora() });
    tocar(c);
  });
  save();
  toast(`Difusión registrada en ${porCuenta.size} cuenta(s).`);
}

/* ---------- WhatsApp uno por uno ---------- */
const personalizar = (t, d) => t
  .replace(/\{nombre\}/gi, d.inst ? '' : (d.nombre || '').split(' ')[0])
  .replace(/\{institucion\}|\{institución\}/gi, d.c.nombre)
  .replace(/\{cargo\}/gi, d.x?.cargo || '')
  .replace(/ +,/g, ',').replace(/ {2,}/g, ' ');

function panelWhatsApp(elegidos) {
  if (!difu.textoWA) difu.textoWA = 'Hola {nombre}, le escribo de Alveon. ';
  const pend = elegidos.filter(d => !difu.enviados.has(d.key));
  return `
    <div class="card">
      <h2>2. Mensaje</h2>
      <p class="hint">WhatsApp no permite enviar a varios contactos a la vez desde otra aplicación: se abre un chat por destinatario con el texto listo y usted presiona Enviar en cada uno.
        Puede personalizar con <b>{nombre}</b>, <b>{institucion}</b> y <b>{cargo}</b>.</p>
      <div class="form-row"><label for="w-texto">Mensaje</label><textarea class="field tall" id="w-texto">${esc(difu.textoWA)}</textarea></div>
    </div>
    <div class="card">
      <h2>3. Enviar <span class="hint">(${elegidos.length - pend.length} de ${elegidos.length} abiertos)</span></h2>
      ${pend.length ? `<button class="btn wa mb" id="w-sig">Abrir el siguiente: ${esc(pend[0].nombre)}${pend[0].inst ? ` (${esc(pend[0].c.nombre)})` : ''}</button>` :
        elegidos.length ? '<p class="hint">Se abrieron todos los chats.</p>' : '<p class="hint">Seleccione al menos un destinatario con celular.</p>'}
      ${elegidos.map(d => `<div class="wa-fila">
        <span><b>${esc(d.nombre)}</b> <span class="sub small">${esc(d.c.nombre)} · ${esc(d.celular)}</span></span>
        <button class="btn small ${difu.enviados.has(d.key) ? '' : 'wa'}" data-wa-key="${esc(d.key)}">${difu.enviados.has(d.key) ? 'Abierto' : 'Abrir'}</button>
      </div>`).join('')}
      <div class="actions mt">
        <button class="btn" id="w-reiniciar" ${difu.enviados.size ? '' : 'disabled'}>Reiniciar envíos</button>
        <button class="btn" id="w-registrar" ${elegidos.length ? '' : 'disabled'}>Registrar en las cuentas</button>
      </div>
    </div>`;
}

function conectarWhatsApp(elegidos) {
  $('#w-texto').oninput = e => { difu.textoWA = e.target.value; guardarBorrador(); };
  const abrir = d => {
    abrirWhatsApp(d.celular, personalizar(difu.textoWA, d));
    difu.enviados.add(d.key);
    renderDifusionConservandoScroll();
  };
  if ($('#w-sig')) $('#w-sig').onclick = () => abrir(elegidos.find(d => !difu.enviados.has(d.key)));
  view.querySelectorAll('[data-wa-key]').forEach(b => (b.onclick = () => abrir(elegidos.find(d => d.key === b.dataset.waKey))));
  $('#w-reiniciar').onclick = () => { difu.enviados.clear(); renderDifusionConservandoScroll(); };
  $('#w-registrar').onclick = () => registrarDifusion(elegidos.filter(d => difu.enviados.has(d.key)).length ? elegidos.filter(d => difu.enviados.has(d.key)) : elegidos, 'WhatsApp');
}
