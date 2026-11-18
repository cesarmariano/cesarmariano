/* Seguimiento de pacientes: alquiler y venta de concentradores de oxígeno y CPAP,
   adherencia al tratamiento, mantenimiento, contratos y actividades. */
'use strict';

const TIPOS_EQUIPO = [['concentrador', 'Concentrador de oxígeno'], ['cpap', 'CPAP']];
const MODALIDADES = [['alquiler', 'Alquiler'], ['venta', 'Venta']];
const ESTADOS_PAGO = ['Al día', 'Pendiente', 'Atrasado'];
const MASCARAS = ['Nasal', 'Oronasal', 'Almohadillas nasales', 'Facial total'];
const MEDIOS = ['Visita a domicilio', 'Llamada', 'WhatsApp', 'Consultorio'];
const INSUMOS = ['Filtro', 'Máscara', 'Tubuladura', 'Cánula nasal', 'Humidificador', 'Batería', 'Otro'];
const TIPOS_ACT = [
  ['control', 'Control de uso'], ['servicio', 'Servicio técnico / mantenimiento'], ['recambio', 'Recambio de insumos'],
  ['cobro', 'Cobro'], ['reparacion', 'Reparación'], ['retiro', 'Retiro del equipo'], ['otro', 'Otra actividad']
];
const NOMBRE_ACT = Object.fromEntries([...TIPOS_ACT, ['instalacion', 'Instalación / entrega'], ['reactivacion', 'Reactivación']]);
const FUENTES = {
  concentrador: [['horometro', 'Lectura del horómetro'], ['paciente', 'Informado por el paciente']],
  cpap: [['equipo', 'Reporte del equipo'], ['paciente', 'Informado por el paciente']]
};
const nombreTipo = t => (TIPOS_EQUIPO.find(x => x[0] === t) || [, '—'])[1];
const nombreModalidad = t => (MODALIDADES.find(x => x[0] === t) || [, '—'])[1];
const tipoCorto = t => (t === 'cpap' ? 'CPAP' : 'Concentrador');

/* ---------- Datos ---------- */
const pacientesActivos = () => db.pacientes.filter(p => !p.borrado);
const findPaciente = id => db.pacientes.find(p => p.id === id && !p.borrado);
const num = v => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
// Orden cronológico estable: por fecha y, en el mismo día, por orden de carga.
const registrosAsc = p => p.registros.map((r, k) => ({ r, k }))
  .sort((a, b) => a.r.fecha.localeCompare(b.r.fecha) || a.k - b.k).map(x => x.r);
const registrosDesc = p => registrosAsc(p).reverse();
const frecControl = () => Number(db.config.frecControlPac) || 30;

/* ---------- Adherencia ---------- */
/* Devuelve { estado: ok|warn|late|sd, texto, valor, fecha, fuente } a partir del último control con medición.
   rango opcional [desde, hasta]: considera sólo controles dentro del período. */
function adherencia(p, rango) {
  const asc = registrosAsc(p);
  const controles = asc.filter(r => r.tipo === 'control' && (!rango || (r.fecha >= rango[0] && r.fecha <= rango[1])));
  for (let k = controles.length - 1; k >= 0; k--) {
    const a = medirControl(p, controles[k], asc);
    if (a) return a;
  }
  return { estado: 'sd', texto: 'Sin controles de uso', valor: null, fecha: '' };
}

function medirControl(p, r, asc) {
  if (p.tipo === 'concentrador') {
    let horasDia = null, detalle = '';
    if (r.fuente === 'horometro' && num(r.horometro) != null) {
      const idx = asc.indexOf(r);
      const prev = asc.slice(0, idx).reverse().find(x => num(x.horometro) != null && x.fecha < r.fecha);
      if (!prev) return { estado: 'sd', texto: 'Falta una lectura anterior del horómetro', valor: null, fecha: r.fecha, fuente: r.fuente };
      const dias = diasEntre(prev.fecha, r.fecha);
      horasDia = Math.max(0, (num(r.horometro) - num(prev.horometro)) / dias);
      detalle = `horómetro, ${dias} días`;
    } else if (num(r.horasDia) != null) {
      horasDia = num(r.horasDia); detalle = 'informado';
    } else return null;
    const ind = num(p.horasIndicadas);
    const pct = ind ? Math.round((horasDia / ind) * 100) : null;
    const estado = pct == null ? 'sd' : pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'late';
    return {
      estado, valor: pct, fecha: r.fecha, fuente: r.fuente, horas: horasDia,
      texto: `${horasDia.toFixed(1)} h/día${ind ? ` de ${ind} indicadas (${pct} %)` : ''} · ${detalle}`
    };
  }
  // CPAP: criterio habitual de adherencia, 4 h o más en al menos el 70 % de las noches.
  const pct4 = num(r.pct4h), hn = num(r.horasNoche);
  if (pct4 != null) {
    return {
      estado: pct4 >= 70 ? 'ok' : pct4 >= 50 ? 'warn' : 'late', valor: Math.round(pct4), fecha: r.fecha, fuente: r.fuente, horas: hn,
      texto: `${Math.round(pct4)} % de noches con 4 h o más${hn != null ? ` · ${hn} h/noche promedio` : ''}${num(r.iah) != null ? ` · IAH ${r.iah}` : ''}`
    };
  }
  if (hn != null) {
    return {
      estado: hn >= 4 ? 'ok' : hn >= 3 ? 'warn' : 'late', valor: null, fecha: r.fecha, fuente: r.fuente, horas: hn,
      texto: `${hn} h/noche (${r.fuente === 'equipo' ? 'reporte del equipo' : 'informado'})`
    };
  }
  return null;
}
const ETIQUETA_ADH = { ok: 'Adherente', warn: 'Adherencia parcial', late: 'No adherente', sd: 'Sin datos' };

/* ---------- Mantenimiento ---------- */
/* Próximo mantenimiento: el programado, o el estimado por días desde el último servicio,
   o (concentradores) el estimado por horas de uso según el horómetro; se toma el más próximo. */
function proximoMantenimiento(p) {
  const asc = registrosAsc(p);
  const base = [...asc].reverse().find(r => r.tipo === 'servicio' || r.tipo === 'instalacion');
  const opciones = [];
  if (p.proximoServicio) opciones.push({ fecha: p.proximoServicio, motivo: 'programado' });
  else if (base) {
    const dias = p.tipo === 'cpap' ? db.config.mantDiasCpap : db.config.mantDiasConc;
    opciones.push({ fecha: sumarDias(base.fecha, Number(dias) || 180), motivo: `cada ${dias} días` });
  }
  const intervaloH = Number(db.config.mantHorasConc) || 0;
  if (p.tipo === 'concentrador' && intervaloH > 0) {
    const lecturas = asc.filter(r => num(r.horometro) != null);
    const desdeServicio = base ? lecturas.filter(r => r.fecha >= base.fecha) : lecturas;
    const ref = desdeServicio[0], ult = lecturas[lecturas.length - 1], ant = lecturas[lecturas.length - 2];
    if (ref && ult && ant && ult.fecha > ant.fecha) {
      const promedio = (num(ult.horometro) - num(ant.horometro)) / diasEntre(ant.fecha, ult.fecha);
      if (promedio > 0) {
        const restantes = num(ref.horometro) + intervaloH - num(ult.horometro);
        opciones.push({ fecha: sumarDias(ult.fecha, Math.max(0, Math.ceil(restantes / promedio))), motivo: `estimado por uso (${intervaloH} h)` });
      }
    }
  }
  opciones.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return opciones[0] || null;
}

/* ---------- Alertas ---------- */
function alertasPaciente(p) {
  if (p.estado !== 'activo') return [];
  const h = hoy(), out = [];
  const a = adherencia(p);
  if (a.estado === 'late' || a.estado === 'warn') out.push({ cls: a.estado, txt: ETIQUETA_ADH[a.estado] });
  if (p.proximoControl && p.proximoControl < h) out.push({ cls: 'late', txt: `Control vencido (${fmtFecha(p.proximoControl)})` });
  const m = proximoMantenimiento(p);
  if (m) {
    const d = diasEntre(h, m.fecha);
    if (d < 0) out.push({ cls: 'late', txt: 'Mantenimiento vencido' });
    else if (d <= 15) out.push({ cls: 'warn', txt: `Mantenimiento ${fmtFecha(m.fecha)}` });
  }
  if (p.modalidad === 'alquiler') {
    if (p.estadoPago === 'Atrasado') out.push({ cls: 'late', txt: 'Pago atrasado' });
    else if (p.estadoPago === 'Pendiente') out.push({ cls: 'warn', txt: 'Pago pendiente' });
    if (p.alqFin) {
      const d = diasEntre(h, p.alqFin);
      if (d < 0) out.push({ cls: 'late', txt: 'Contrato vencido' });
      else if (d <= 15) out.push({ cls: 'warn', txt: `Contrato vence ${fmtFecha(p.alqFin)}` });
    }
  }
  if (p.modalidad === 'venta' && p.garantiaHasta) {
    const d = diasEntre(h, p.garantiaHasta);
    if (d >= 0 && d <= 30) out.push({ cls: 'warn', txt: `Garantía vence ${fmtFecha(p.garantiaHasta)}` });
  }
  return out;
}
const gravedad = p => alertasPaciente(p).reduce((s, a) => s + (a.cls === 'late' ? 10 : 1), 0);

/* ---------- Lista de pacientes ---------- */
let estadoPac = { filtro: '', modalidad: '', tipo: '', soloAlertas: false, verFinalizados: false };

function renderPacientes() {
  seccion = 'pacientes';
  setHeader('Pacientes', null);
  const q = estadoPac.filtro.trim().toLowerCase();
  const base = pacientesActivos().filter(p => estadoPac.verFinalizados ? p.estado !== 'activo' : p.estado === 'activo');
  const lista = base
    .filter(p => !estadoPac.modalidad || p.modalidad === estadoPac.modalidad)
    .filter(p => !estadoPac.tipo || p.tipo === estadoPac.tipo)
    .filter(p => !q || [p.nombre, p.dni, p.obraSocial, p.ciudad, p.serie, p.modelo, nombreMedico(p.medicoId)].join(' ').toLowerCase().includes(q))
    .filter(p => !estadoPac.soloAlertas || alertasPaciente(p).length)
    .sort((a, b) => gravedad(b) - gravedad(a) || a.nombre.localeCompare(b.nombre, 'es'));
  const activosPac = pacientesActivos().filter(p => p.estado === 'activo');
  const noAdh = activosPac.filter(p => adherencia(p).estado === 'late').length;
  const seg = (campo, opciones) => `<div class="segmented">${opciones.map(([k, l]) =>
    `<button data-f="${campo}" data-v="${k}" class="${estadoPac[campo] === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;

  view.innerHTML = `
    ${bannerInstalar()}
    <div class="actions">
      <button class="btn primary" id="btn-nuevo">+ Nuevo paciente</button>
      <button class="btn" id="btn-pdf" ${activosPac.length || base.length ? '' : 'disabled'}>Generar PDF</button>
    </div>
    ${pacientesActivos().length ? `
      <input class="search" id="buscar" type="search" placeholder="Buscar por nombre, DNI, obra social o serie" value="${esc(estadoPac.filtro)}">
      ${seg('modalidad', [['', 'Todos'], ['alquiler', 'Alquiler'], ['venta', 'Venta']])}
      ${seg('tipo', [['', 'Todos los equipos'], ['concentrador', 'Concentrador'], ['cpap', 'CPAP']])}
      <div class="chips" style="margin:0 0 12px">
        <button class="chip ${estadoPac.soloAlertas ? 'on' : ''}" id="f-alertas">Sólo con avisos</button>
        <button class="chip ${estadoPac.verFinalizados ? 'on' : ''}" id="f-fin">Ver finalizados</button>
      </div>
      <div class="summary">
        <span>${activosPac.length} activo(s) · ${activosPac.filter(p => p.modalidad === 'alquiler').length} alquiler · ${activosPac.filter(p => p.modalidad === 'venta').length} venta</span>
        <span>${noAdh} no adherente(s)</span>
      </div>
      <div id="lista">${lista.map(itemPaciente).join('') || '<div class="empty">Sin resultados.</div>'}</div>
    ` : `<div class="empty">Todavía no hay pacientes cargados.<br>Toque <b>+ Nuevo paciente</b> para comenzar.</div>`}`;

  $('#btn-nuevo').onclick = () => startWizard(pasosPaciente(true), {}, guardarNuevoPaciente, 'Nuevo paciente');
  $('#btn-pdf').onclick = renderFiltrosPDFPac;
  conectarInstalar();
  const b = $('#buscar');
  if (b) b.oninput = () => {
    estadoPac.filtro = b.value;
    const pos = b.selectionStart; renderPacientes();
    const nb = $('#buscar'); nb.focus(); nb.setSelectionRange(pos, pos);
  };
  view.querySelectorAll('[data-f]').forEach(el => (el.onclick = () => { estadoPac[el.dataset.f] = el.dataset.v; renderPacientes(); }));
  if ($('#f-alertas')) $('#f-alertas').onclick = () => { estadoPac.soloAlertas = !estadoPac.soloAlertas; renderPacientes(); };
  if ($('#f-fin')) $('#f-fin').onclick = () => { estadoPac.verFinalizados = !estadoPac.verFinalizados; renderPacientes(); };
  view.querySelectorAll('.doc-item').forEach(el => (el.onclick = () => renderDetallePaciente(el.dataset.id)));
}

function itemPaciente(p) {
  const a = adherencia(p);
  const alertas = alertasPaciente(p).filter(x => !x.txt.startsWith('Adherencia') && !x.txt.startsWith('No adherente'));
  const sub = [tipoCorto(p.tipo), nombreModalidad(p.modalidad), p.obraSocial].filter(Boolean).join(' · ');
  const valor = a.valor != null ? `${a.valor}<small style="font-size:.7em">%</small>` : (a.horas != null ? `${a.horas.toFixed ? a.horas.toFixed(1) : a.horas}<small style="font-size:.6em">h</small>` : '—');
  return `
    <button class="doc-item" data-id="${p.id}">
      <div class="info">
        <div class="name">${esc(p.nombre)}${p.estado !== 'activo' ? ' <span class="hint">(finalizado)</span>' : ''}</div>
        <div class="sub">${esc(sub)}</div>
        <div class="pills">
          <span class="pill ${a.estado === 'sd' ? 'neutral' : a.estado}">${ETIQUETA_ADH[a.estado]}</span>
          ${alertas.slice(0, 2).map(x => `<span class="pill ${x.cls}">${esc(x.txt)}</span>`).join('')}
          ${alertas.length > 2 ? `<span class="pill neutral">+${alertas.length - 2}</span>` : ''}
        </div>
      </div>
      <div class="count"><b class="adh-${a.estado}">${valor}</b><small>adherencia</small></div>
    </button>`;
}

/* ---------- Alta y edición ---------- */
const nombreMedico = id => (findMedico(id) || {}).nombre || '';

function pasosPaciente(esAlta) {
  const esConc = v => v.tipo === 'concentrador', esCpap = v => v.tipo === 'cpap';
  const esAlq = v => v.modalidad === 'alquiler', esVta = v => v.modalidad === 'venta';
  const medicos = activos().slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const ultimaProv = (pacientesActivos().slice(-1)[0] || activos().slice(-1)[0] || {}).provincia || '';
  return [
    { q: 'Datos del paciente', campos: [
      { key: 'nombre', label: 'Nombre y apellido', type: 'text', required: true },
      { key: 'dni', label: 'DNI', type: 'text' },
      { key: 'fechaNac', label: 'Fecha de nacimiento', type: 'date', max: hoy() }
    ] },
    { q: 'Contacto', hint: 'Se solicita una única vez. Incluya código de país y de área, por ejemplo: +54 9 11 1234 5678.', campos: [
      { key: 'telefono', label: 'Celular del paciente (WhatsApp)', type: 'tel', validate: v => soloDigitos(v).length >= 8 || 'El número parece incompleto.' },
      { key: 'contactoNombre', label: 'Familiar o cuidador', type: 'text' },
      { key: 'contactoTel', label: 'Celular del familiar o cuidador', type: 'tel', validate: v => soloDigitos(v).length >= 8 || 'El número parece incompleto.' }
    ] },
    { q: 'Domicilio', campos: [
      { key: 'provincia', label: 'Provincia', type: 'select', required: true, opciones: PROVINCIAS, def: ultimaProv },
      { key: 'ciudad', label: 'Ciudad o localidad', type: 'text', required: true,
        sugerenciasFn: v => unicos([...pacientesActivos(), ...activos()].filter(x => !v.provincia || x.provincia === v.provincia).map(x => x.ciudad)) },
      { key: 'direccion', label: 'Dirección', type: 'text' }
    ] },
    { q: 'Cobertura y diagnóstico', campos: [
      { key: 'obraSocial', label: 'Obra social o prepaga', type: 'text', sugerencias: unicos(pacientesActivos().map(p => p.obraSocial)) },
      { key: 'afiliado', label: 'Número de afiliado', type: 'text' },
      { key: 'diagnostico', label: 'Diagnóstico', type: 'text', chips: ['EPOC', 'Apnea obstructiva del sueño', 'Fibrosis pulmonar', 'Insuficiencia cardíaca', 'COVID / post-COVID'] }
    ] },
    { key: 'medicoId', q: '¿Qué médico lo refirió?', type: 'select',
      hint: medicos.length ? 'Elija de la lista de médicos cargados en la sección Médicos.' : 'Todavía no hay médicos cargados en la sección Médicos.',
      opciones: medicos.map(m => [m.id, `${m.nombre} – ${m.institucion}`]) },
    { q: 'Equipo y modalidad', campos: [
      { key: 'tipo', label: 'Tipo de equipo', type: 'choice', required: true, opciones: TIPOS_EQUIPO },
      { key: 'modalidad', label: 'Modalidad', type: 'choice', required: true, opciones: MODALIDADES }
    ] },
    { q: 'Datos del equipo', campos: [
      { key: 'marca', label: 'Marca', type: 'text', sugerencias: unicos(pacientesActivos().map(p => p.marca)) },
      { key: 'modelo', label: 'Modelo', type: 'text', sugerencias: unicos(pacientesActivos().map(p => p.modelo)) },
      { key: 'serie', label: 'Número de serie', type: 'text' }
    ] },
    { q: 'Indicación médica', si: esConc, campos: [
      { key: 'flujo', label: 'Flujo indicado (litros por minuto)', type: 'number' },
      { key: 'horasIndicadas', label: 'Horas de uso por día indicadas', type: 'number', required: true,
        hint: 'Se usa para calcular la adherencia.', validate: v => v <= 24 || 'No puede superar 24 horas.' }
    ] },
    { q: 'Indicación médica', si: esCpap, campos: [
      { key: 'presion', label: 'Presión indicada (cmH2O)', type: 'text', hint: 'Por ejemplo: 9, o 6-12 si es autoajustable.' },
      { key: 'mascara', label: 'Tipo de máscara', type: 'select', opciones: MASCARAS }
    ] },
    { q: 'Contrato de alquiler', si: esAlq, campos: [
      { key: 'alqInicio', label: 'Fecha de inicio', type: 'date', required: true, def: hoy() },
      { key: 'alqFin', label: 'Fecha de finalización', type: 'date', validate: (x, v) => !v.alqInicio || x >= v.alqInicio || 'Debe ser posterior al inicio.' },
      { key: 'cuota', label: 'Cuota mensual ($)', type: 'number' },
      { key: 'estadoPago', label: 'Estado del pago', type: 'choice', opciones: ESTADOS_PAGO, def: 'Al día' }
    ] },
    { q: 'Venta', si: esVta, campos: [
      { key: 'ventaFecha', label: 'Fecha de venta', type: 'date', required: true, def: hoy(), max: hoy() },
      { key: 'precio', label: 'Precio ($)', type: 'number' },
      { key: 'garantiaHasta', label: 'Vencimiento de la garantía', type: 'date', defFn: v => sumarDias(v.ventaFecha || hoy(), 365),
        hint: 'Se propone un año desde la venta.' }
    ] },
    { q: 'Instalación', si: () => esAlta, campos: [
      { key: 'fechaInst', label: 'Fecha de instalación o entrega', type: 'date', required: true, max: hoy(),
        defFn: v => (v.modalidad === 'venta' ? v.ventaFecha : v.alqInicio) || hoy(), validate: validarPasado },
      { key: 'horometroInicial', label: 'Lectura del horómetro al instalar (horas)', type: 'number', si: esConc,
        hint: 'Permite calcular las horas de uso en los controles siguientes.' }
    ] },
    { q: 'Próximas fechas', campos: [
      { key: 'proximoControl', label: 'Próximo control de uso', type: 'date', quick: true,
        defFn: v => sumarDias(v.fechaInst || hoy(), frecControl()) },
      { key: 'proximoServicio', label: 'Próximo mantenimiento programado', type: 'date',
        hint: 'Opcional. Si se deja vacío, la aplicación lo estima según los intervalos de Ajustes y las horas de uso.' }
    ] },
    { key: 'notas', q: 'Observaciones', type: 'textarea' }
  ];
}

function guardarNuevoPaciente(v) {
  const p = datosPaciente({ id: uid(), creado: ahora(), estado: 'activo', registros: [] }, v);
  sellar(p);
  p.registros.push({
    id: uid(), fecha: v.fechaInst || hoy(), tipo: 'instalacion',
    horometro: num(v.horometroInicial), notas: v.notas || ''
  });
  db.pacientes.push(p); save();
  toast('Paciente guardado.');
  renderDetallePaciente(p.id);
}

const CAMPOS_PACIENTE = ['nombre', 'dni', 'fechaNac', 'telefono', 'contactoNombre', 'contactoTel', 'provincia', 'ciudad', 'direccion',
  'obraSocial', 'afiliado', 'diagnostico', 'medicoId', 'tipo', 'modalidad', 'marca', 'modelo', 'serie', 'flujo', 'horasIndicadas',
  'presion', 'mascara', 'alqInicio', 'alqFin', 'cuota', 'estadoPago', 'ventaFecha', 'precio', 'garantiaHasta', 'proximoControl', 'proximoServicio'];

function datosPaciente(p, v) {
  return cambiar(p, Object.fromEntries(CAMPOS_PACIENTE.map(k => [k, v[k] ?? ''])));
}

/* ---------- Ficha del paciente ---------- */
function renderDetallePaciente(id, volver) {
  seccion = 'pacientes';
  const p = findPaciente(id);
  if (!p) return renderPacientes();
  const atras = volver || renderPacientes;
  setHeader(p.nombre, atras);
  const a = adherencia(p);
  const mant = proximoMantenimiento(p);
  const alertas = alertasPaciente(p).filter(x => !['Adherencia parcial', 'No adherente'].includes(x.txt));
  const wa = (tel, txt) => (soloDigitos(tel) ? `<a class="btn wa" href="https://wa.me/${soloDigitos(tel)}" target="_blank" rel="noopener">${txt}</a>` : '');
  const fila = (l, v) => `<div class="label">${l}</div><div class="value">${v || '—'}</div>`;
  const med = findMedico(p.medicoId);
  const regs = registrosDesc(p);

  view.innerHTML = `
    <div class="actions">
      ${p.estado === 'activo' ? '<button class="btn primary" id="btn-act">Registrar actividad</button>' : '<button class="btn primary" id="btn-reactivar">Reactivar</button>'}
      ${wa(p.telefono, 'WhatsApp') || '<button class="btn" id="btn-edit2">Agregar celular</button>'}
    </div>
    ${alertas.length ? `<div class="card avisos">${alertas.map(x => `<span class="pill ${x.cls}">${esc(x.txt)}</span>`).join('')}</div>` : ''}

    <div class="card">
      <h2>Adherencia al tratamiento</h2>
      <div class="adh-box adh-bg-${a.estado}">
        <b>${ETIQUETA_ADH[a.estado]}</b>
        <span>${esc(a.texto)}</span>
        ${a.fecha ? `<small>Último control: ${fmtFecha(a.fecha)}</small>` : ''}
      </div>
      <div class="grid2" style="margin-top:12px">
        <div>${fila('Indicación', esc(p.tipo === 'cpap'
          ? [p.presion && `${p.presion} cmH2O`, p.mascara && `máscara ${p.mascara.toLowerCase()}`].filter(Boolean).join(', ')
          : [p.horasIndicadas && `${p.horasIndicadas} h/día`, p.flujo && `${p.flujo} L/min`].filter(Boolean).join(', ')))}</div>
        <div><div class="label">Próximo control</div>
          <div class="value row-between"><span>${fmtFecha(p.proximoControl)}</span>${p.estado === 'activo' ? '<button class="chip" id="btn-pctrl">Cambiar</button>' : ''}</div></div>
      </div>
      <p class="hint" style="margin:0">${p.tipo === 'cpap'
        ? 'Criterio: adherente con 4 h o más en al menos el 70 % de las noches (o 4 h/noche promedio si sólo se informan horas).'
        : 'Criterio: adherente con 80 % o más de las horas indicadas; parcial entre 50 % y 79 %.'}</p>
    </div>

    <div class="card">
      <h2>Equipo</h2>
      <div class="grid2">
        <div>${fila('Tipo', esc(nombreTipo(p.tipo)))}</div>
        <div>${fila('Modalidad', esc(nombreModalidad(p.modalidad)))}</div>
        <div>${fila('Marca y modelo', esc([p.marca, p.modelo].filter(Boolean).join(' ')))}</div>
        <div>${fila('Número de serie', esc(p.serie))}</div>
      </div>
      ${fila('Próximo mantenimiento', mant ? `${fmtFecha(mant.fecha)} <span class="hint">(${esc(mant.motivo)})</span>` : '')}
      ${p.modalidad === 'alquiler' ? `
        <div class="grid2">
          <div>${fila('Inicio del alquiler', fmtFecha(p.alqInicio))}</div>
          <div>${fila('Fin del contrato', fmtFecha(p.alqFin))}</div>
          <div>${fila('Cuota mensual', p.cuota !== '' && p.cuota != null ? '$ ' + Number(p.cuota).toLocaleString('es-AR') : '')}</div>
          <div><div class="label">Estado del pago</div><div class="value"><span class="pill ${p.estadoPago === 'Atrasado' ? 'late' : p.estadoPago === 'Pendiente' ? 'warn' : ''}">${esc(p.estadoPago || '—')}</span></div></div>
        </div>` : `
        <div class="grid2">
          <div>${fila('Fecha de venta', fmtFecha(p.ventaFecha))}</div>
          <div>${fila('Garantía hasta', fmtFecha(p.garantiaHasta))}</div>
          <div>${fila('Precio', p.precio !== '' && p.precio != null ? '$ ' + Number(p.precio).toLocaleString('es-AR') : '')}</div>
        </div>`}
    </div>

    <div class="card">
      <h2>Paciente</h2>
      <div class="grid2">
        <div>${fila('DNI', esc(p.dni))}</div>
        <div>${fila('Fecha de nacimiento', p.fechaNac ? fmtFecha(p.fechaNac) : '')}</div>
        <div>${fila('Obra social', esc([p.obraSocial, p.afiliado && `N.º ${p.afiliado}`].filter(Boolean).join(' – ')))}</div>
        <div>${fila('Diagnóstico', esc(p.diagnostico))}</div>
      </div>
      ${fila('Médico que lo refirió', med ? `<button class="chip" id="btn-med">${esc(med.nombre)} – ${esc(med.institucion)}</button>` : '')}
      ${fila('Domicilio', esc(ubicacionTexto(p)))}
      ${fila('Celular', esc(p.telefono))}
      ${fila('Familiar o cuidador', esc([p.contactoNombre, p.contactoTel].filter(Boolean).join(' – ')))}
      ${soloDigitos(p.contactoTel) ? `<div style="margin-bottom:8px">${wa(p.contactoTel, 'WhatsApp del familiar')}</div>` : ''}
    </div>

    <div class="card">
      <h2>Actividades (${regs.length})</h2>
      ${regs.map(r => `
        <div class="visit">
          <div class="meta"><span>${fmtFecha(r.fecha)} · ${esc(NOMBRE_ACT[r.tipo] || r.tipo)}</span></div>
          ${detalleRegistro(p, r) ? `<p>${esc(detalleRegistro(p, r))}</p>` : ''}
          ${r.notas ? `<p>${esc(r.notas)}</p>` : ''}
        </div>`).join('')}
    </div>

    <div class="actions">
      <button class="btn" id="btn-edit">Editar datos</button>
      <button class="btn" id="btn-ficha">PDF del paciente</button>
    </div>
    <button class="btn danger" id="btn-borrar" style="margin-bottom:16px">Eliminar paciente</button>`;

  const editar = () => startWizard(pasosPaciente(false), { ...p }, v => {
    datosPaciente(p, v); save(); toast('Datos actualizados.'); renderDetallePaciente(p.id, volver);
  }, 'Editar paciente', () => renderDetallePaciente(p.id, volver), { resumen: true });
  if ($('#btn-act')) $('#btn-act').onclick = () => registrarActividad(p, volver);
  if ($('#btn-reactivar')) $('#btn-reactivar').onclick = () => {
    p.registros.push({ id: uid(), fecha: hoy(), tipo: 'reactivacion', notas: '' });
    cambiar(p, { estado: 'activo' }); save(); toast('Paciente reactivado.'); renderDetallePaciente(p.id, volver);
  };
  if ($('#btn-edit2')) $('#btn-edit2').onclick = editar;
  $('#btn-edit').onclick = editar;
  if ($('#btn-med')) $('#btn-med').onclick = () => { seccion = 'medicos'; renderDetalle(med.id); };
  if ($('#btn-pctrl')) $('#btn-pctrl').onclick = () => startWizard([{
    key: 'proximoControl', q: '¿Cuándo es el próximo control?', type: 'date', quick: true,
    defFn: () => p.proximoControl || sumarDias(hoy(), frecControl())
  }], { fecha: hoy() }, v => {
    cambiar(p, { proximoControl: v.proximoControl || '' }); save(); renderDetallePaciente(p.id, volver);
  }, 'Próximo control', () => renderDetallePaciente(p.id, volver));
  $('#btn-ficha').onclick = () => fichaPDF(p);
  $('#btn-borrar').onclick = () => {
    if (!confirm(`¿Eliminar a ${p.nombre} y todo su historial? Esta acción no se puede deshacer.\nSi el paciente dejó el servicio, use "Registrar actividad → Retiro del equipo" para conservar el historial.`)) return;
    marcarBorrado(p, 'registros');
    save(); toast('Paciente eliminado.'); renderPacientes();
  };
}

function detalleRegistro(p, r) {
  const partes = [];
  if (r.medio) partes.push(r.medio);
  if (r.tipo === 'control') {
    const m = medirControl(p, r, registrosAsc(p));
    if (num(r.horometro) != null) partes.push(`Horómetro: ${r.horometro} h`);
    if (m) partes.push(m.texto);
  } else if (num(r.horometro) != null) partes.push(`Horómetro: ${r.horometro} h`);
  if (r.insumo) partes.push(`Insumo: ${r.insumo}`);
  if (num(r.monto) != null) partes.push(`Monto: $ ${Number(r.monto).toLocaleString('es-AR')}`);
  if (r.periodo) partes.push(`Período: ${r.periodo}`);
  if (r.descripcion) partes.push(r.descripcion);
  return partes.join(' · ');
}

/* ---------- Registrar actividad ---------- */
function registrarActividad(p, volver) {
  const conc = p.tipo === 'concentrador';
  const es = t => v => v.tipo === t;
  const fuentes = FUENTES[p.tipo] || FUENTES.concentrador;
  const ultimaLectura = [...registrosAsc(p)].reverse().find(r => num(r.horometro) != null);
  const pasos = [
    { key: 'tipo', q: '¿Qué actividad desea registrar?', type: 'choice', required: true, opciones: TIPOS_ACT, def: 'control' },
    { q: 'Control de uso', si: es('control'), campos: [
      { key: 'fecha', label: 'Fecha', type: 'date', required: true, def: hoy(), max: hoy(), validate: validarPasado },
      { key: 'medio', label: 'Medio', type: 'choice', opciones: MEDIOS, def: 'Visita a domicilio' },
      { key: 'fuente', label: 'Origen del dato de uso', type: 'choice', required: true, opciones: fuentes, def: fuentes[0][0] },
      { key: 'horometro', label: 'Lectura del horómetro (horas)', type: 'number', required: true,
        si: v => conc && v.fuente === 'horometro',
        hint: ultimaLectura ? `Lectura anterior: ${ultimaLectura.horometro} h (${fmtFecha(ultimaLectura.fecha)}).` : 'No hay lecturas anteriores: esta lectura servirá de base para el próximo control.',
        validate: x => !ultimaLectura || x >= num(ultimaLectura.horometro) || 'No puede ser menor que la lectura anterior.' },
      { key: 'horasDia', label: 'Horas de uso por día informadas', type: 'number', required: true,
        si: v => conc && v.fuente === 'paciente', validate: x => x <= 24 || 'No puede superar 24 horas.' },
      { key: 'pct4h', label: 'Noches con 4 horas o más (%)', type: 'number', si: v => !conc && v.fuente === 'equipo',
        hint: 'Figura en el reporte del equipo como "uso ≥ 4 h" o "cumplimiento".', validate: x => x <= 100 || 'No puede superar 100 %.' },
      { key: 'horasNoche', label: 'Horas de uso promedio por noche', type: 'number', required: true, si: v => !conc,
        validate: x => x <= 24 || 'No puede superar 24 horas.' },
      { key: 'iah', label: 'IAH residual (eventos por hora)', type: 'number', si: v => !conc && v.fuente === 'equipo' }
    ] },
    { q: 'Servicio técnico / mantenimiento', si: es('servicio'), campos: [
      { key: 'fecha', label: 'Fecha', type: 'date', required: true, def: hoy(), max: hoy(), validate: validarPasado },
      { key: 'horometro', label: 'Lectura del horómetro (horas)', type: 'number', si: () => conc },
      { key: 'descripcion', label: 'Trabajo realizado', type: 'text', chips: conc ? ['Limpieza de filtros', 'Cambio de filtro de entrada', 'Control de concentración de O2', 'Servicio completo'] : ['Limpieza', 'Control de presión', 'Descarga de datos', 'Servicio completo'] },
      { key: 'proximoServicio', label: 'Próximo mantenimiento programado', type: 'date', hint: 'Opcional. Si se deja vacío, se estima automáticamente.' }
    ] },
    { q: 'Recambio de insumos', si: es('recambio'), campos: [
      { key: 'fecha', label: 'Fecha', type: 'date', required: true, def: hoy(), max: hoy(), validate: validarPasado },
      { key: 'insumo', label: 'Insumo', type: 'select', required: true, opciones: INSUMOS },
      { key: 'descripcion', label: 'Detalle', type: 'text' }
    ] },
    { q: 'Cobro', si: es('cobro'), campos: [
      { key: 'fecha', label: 'Fecha', type: 'date', required: true, def: hoy(), max: hoy(), validate: validarPasado },
      { key: 'monto', label: 'Monto ($)', type: 'number', required: true, def: p.modalidad === 'alquiler' && p.cuota !== '' ? p.cuota : '' },
      { key: 'periodo', label: 'Período que cubre', type: 'text', hint: 'Por ejemplo: noviembre 2026.' },
      { key: 'estadoPago', label: 'Estado del pago después de este cobro', type: 'choice', opciones: ESTADOS_PAGO, def: 'Al día', si: () => p.modalidad === 'alquiler' }
    ] },
    { q: 'Reparación', si: es('reparacion'), campos: [
      { key: 'fecha', label: 'Fecha', type: 'date', required: true, def: hoy(), max: hoy(), validate: validarPasado },
      { key: 'descripcion', label: 'Falla y reparación', type: 'text', required: true }
    ] },
    { q: 'Retiro del equipo', si: es('retiro'), hint: 'El paciente pasará a "finalizados" y se conservará su historial.', campos: [
      { key: 'fecha', label: 'Fecha', type: 'date', required: true, def: hoy(), max: hoy(), validate: validarPasado },
      { key: 'horometro', label: 'Lectura del horómetro (horas)', type: 'number', si: () => conc },
      { key: 'descripcion', label: 'Motivo', type: 'text', chips: ['Fin del tratamiento', 'Fin del contrato', 'Cambio de equipo', 'Internación', 'Fallecimiento'] }
    ] },
    { q: 'Otra actividad', si: es('otro'), campos: [
      { key: 'fecha', label: 'Fecha', type: 'date', required: true, def: hoy(), max: hoy(), validate: validarPasado },
      { key: 'descripcion', label: 'Descripción', type: 'text', required: true }
    ] },
    { q: 'Seguimiento', si: v => v.tipo !== 'retiro', campos: [
      { key: 'proximoControl', label: 'Próximo control de uso', type: 'date', quick: true,
        defFn: v => (v.tipo === 'control' ? sumarDias(v.fecha || hoy(), frecControl()) : p.proximoControl || '') },
      { key: 'notas', label: 'Notas', type: 'textarea' }
    ] },
    { key: 'notas', q: 'Notas', type: 'textarea', si: v => v.tipo === 'retiro' }
  ];
  startWizard(pasos, {}, v => {
    const r = { id: uid(), fecha: v.fecha, tipo: v.tipo };
    ['medio', 'fuente', 'horometro', 'horasDia', 'pct4h', 'horasNoche', 'iah', 'insumo', 'monto', 'periodo', 'descripcion', 'notas']
      .forEach(k => { if (v[k] !== '' && v[k] != null) r[k] = v[k]; });
    p.registros.push(r);
    const cambios = {};
    if (v.tipo === 'servicio') cambios.proximoServicio = v.proximoServicio || '';
    if (v.tipo === 'cobro' && v.estadoPago) cambios.estadoPago = v.estadoPago;
    if (v.tipo === 'retiro') Object.assign(cambios, { estado: 'finalizado', proximoControl: '' });
    else cambios.proximoControl = v.proximoControl || '';
    cambiar(p, cambios); save();
    toast('Actividad registrada.');
    renderDetallePaciente(p.id, volver);
  }, 'Registrar actividad', () => renderDetallePaciente(p.id, volver));
}

/* ---------- Integración con la sección Médicos ---------- */
function bloquePacientesMedico(m) {
  const lista = pacientesActivos().filter(p => p.medicoId === m.id).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  if (!lista.length) return '';
  const act = lista.filter(p => p.estado === 'activo').length;
  return `<div class="card">
    <h2>Pacientes en seguimiento referidos por este médico (${lista.length})</h2>
    <p class="hint">${act} activo(s) · ${lista.length - act} finalizado(s). Toque un paciente para ver su ficha.</p>
    <div class="chips">${lista.map(p => `<button class="chip" data-pac="${p.id}">${esc(p.nombre)}${p.estado !== 'activo' ? ' (finalizado)' : ''}</button>`).join('')}</div>
  </div>`;
}

/* ---------- PDF de pacientes ---------- */
const FILTROS_PAC_BASE = { periodo: 'todo', desde: '', hasta: '', anio: '', mes: '', modalidad: '', tipo: '', adh: '', medico: '',
  obraSocial: '', provincia: '', ciudad: '', estado: 'activo', contacto: false, orden: 'nombre' };
let filtrosPac = { ...FILTROS_PAC_BASE };

function filasPacientes(f) {
  const rango = rangoPeriodo(f);
  const filas = [];
  for (const p of pacientesActivos()) {
    if (f.estado && p.estado !== f.estado) continue;
    if (f.modalidad && p.modalidad !== f.modalidad) continue;
    if (f.tipo && p.tipo !== f.tipo) continue;
    if (f.medico && p.medicoId !== f.medico) continue;
    if (f.obraSocial && p.obraSocial !== f.obraSocial) continue;
    if (f.provincia && p.provincia !== f.provincia) continue;
    if (f.ciudad && p.ciudad !== f.ciudad) continue;
    if (rango && !p.registros.some(r => r.fecha >= rango[0] && r.fecha <= rango[1])) continue;
    const a = adherencia(p, rango);
    if (f.adh === 'adherentes' && a.estado !== 'ok') continue;
    if (f.adh === 'no' && !['warn', 'late'].includes(a.estado)) continue;
    if (f.adh === 'sd' && a.estado !== 'sd') continue;
    filas.push({ p, a, mant: proximoMantenimiento(p) });
  }
  const ordenAdh = { late: 0, warn: 1, sd: 2, ok: 3 };
  filas.sort((x, y) => {
    if (f.orden === 'adherencia') return ordenAdh[x.a.estado] - ordenAdh[y.a.estado] || (x.a.valor ?? 999) - (y.a.valor ?? 999);
    if (f.orden === 'medico') return nombreMedico(x.p.medicoId).localeCompare(nombreMedico(y.p.medicoId), 'es') || x.p.nombre.localeCompare(y.p.nombre, 'es');
    if (f.orden === 'mantenimiento') return (x.mant?.fecha || '9999').localeCompare(y.mant?.fecha || '9999');
    return x.p.nombre.localeCompare(y.p.nombre, 'es');
  });
  return { filas, rango };
}

function descripcionFiltrosPac(f) {
  const partes = [descripcionFiltros(f)];
  if (f.modalidad) partes.push(nombreModalidad(f.modalidad));
  if (f.tipo) partes.push(nombreTipo(f.tipo));
  if (f.adh) partes.push({ adherentes: 'Adherentes', no: 'No adherentes o parciales', sd: 'Sin datos de adherencia' }[f.adh]);
  if (f.medico) partes.push(`Médico: ${nombreMedico(f.medico)}`);
  if (f.obraSocial) partes.push(`Obra social: ${f.obraSocial}`);
  partes.push(f.estado === 'activo' ? 'Pacientes activos' : f.estado === 'finalizado' ? 'Pacientes finalizados' : 'Activos y finalizados');
  return partes.filter(Boolean).join('  ·  ');
}

function renderFiltrosPDFPac() {
  setHeader('PDF de pacientes', renderPacientes);
  const f = filtrosPac;
  const todos = pacientesActivos();
  const anios = unicos(todos.flatMap(p => p.registros.map(r => r.fecha.slice(0, 4)))).reverse();
  const sel = (id, lista, actual, vacio) => `<select class="field" id="${id}"><option value="">${vacio}</option>${lista.map(x => {
    const [v, l] = Array.isArray(x) ? x : [x, x];
    return `<option value="${esc(v)}" ${v === actual ? 'selected' : ''}>${esc(l)}</option>`;
  }).join('')}</select>`;
  const medicos = unicos(todos.map(p => p.medicoId)).filter(findMedico).map(id => [id, nombreMedico(id)]);

  view.innerHTML = `
    <div class="card">
      <h2>Período</h2>
      <div class="segmented">
        ${[['todo', 'Todo'], ['rango', 'Desde/Hasta'], ['anio', 'Año'], ['mes', 'Mes']].map(([k, l]) =>
          `<button data-per="${k}" class="${f.periodo === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
      ${f.periodo === 'rango' ? `<div class="grid2">
          <div class="form-row"><label for="f-desde">Desde</label><input class="field" type="date" id="f-desde" value="${f.desde}"></div>
          <div class="form-row"><label for="f-hasta">Hasta</label><input class="field" type="date" id="f-hasta" value="${f.hasta}"></div></div>` : ''}
      ${f.periodo === 'anio' ? `<div class="form-row"><label for="f-anio">Año</label>${sel('f-anio', anios, f.anio, 'Seleccione…')}</div>` : ''}
      ${f.periodo === 'mes' ? `<div class="form-row"><label for="f-mes">Mes</label><input class="field" type="month" id="f-mes" value="${f.mes}"></div>` : ''}
      ${f.periodo !== 'todo' ? '<p class="hint">Se incluyen los pacientes con actividades en el período; la adherencia corresponde al último control del período.</p>' : ''}
    </div>
    <div class="card">
      <h2>Filtros</h2>
      <div class="grid2">
        <div class="form-row"><label for="f-mod">Modalidad</label>${sel('f-mod', MODALIDADES, f.modalidad, 'Todas')}</div>
        <div class="form-row"><label for="f-tipo">Equipo</label>${sel('f-tipo', TIPOS_EQUIPO, f.tipo, 'Todos')}</div>
        <div class="form-row"><label for="f-adh">Adherencia</label>${sel('f-adh', [['adherentes', 'Adherentes'], ['no', 'No adherentes o parciales'], ['sd', 'Sin datos']], f.adh, 'Todas')}</div>
        <div class="form-row"><label for="f-est">Estado</label>
          <select class="field" id="f-est">${[['activo', 'Activos'], ['finalizado', 'Finalizados'], ['', 'Todos']].map(([v, l]) => `<option value="${v}" ${f.estado === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="form-row"><label for="f-med">Médico que refirió</label>${sel('f-med', medicos, f.medico, 'Todos')}</div>
      <div class="form-row"><label for="f-os">Obra social</label>${sel('f-os', unicos(todos.map(p => p.obraSocial)), f.obraSocial, 'Todas')}</div>
      <div class="grid2">
        <div class="form-row"><label for="f-prov">Provincia</label>${sel('f-prov', unicos(todos.map(p => p.provincia)), f.provincia, 'Todas')}</div>
        <div class="form-row"><label for="f-ciu">Ciudad</label>${sel('f-ciu', unicos(todos.filter(p => !f.provincia || p.provincia === f.provincia).map(p => p.ciudad)), f.ciudad, 'Todas')}</div>
      </div>
      <div class="form-row"><label for="f-orden">Ordenar por</label>
        ${sel('f-orden', [['nombre', 'Nombre'], ['adherencia', 'Adherencia (menor primero)'], ['medico', 'Médico'], ['mantenimiento', 'Próximo mantenimiento']], f.orden, 'Nombre')}</div>
      <label class="check"><input type="checkbox" id="f-cont" ${f.contacto ? 'checked' : ''}> Incluir DNI y teléfonos</label>
      <p class="hint">Los datos de salud son sensibles: comparta el PDF sólo con quien corresponda.</p>
    </div>
    <p class="summary" id="f-cuenta"></p>
    <div class="wizard-nav">
      <button class="btn" id="f-limpiar">Limpiar</button>
      <button class="btn primary" id="f-generar">Generar PDF</button>
    </div>`;

  const leer = () => {
    const v = id => ($(id) ? $(id).value : undefined);
    Object.assign(f, {
      desde: v('#f-desde') ?? f.desde, hasta: v('#f-hasta') ?? f.hasta, anio: v('#f-anio') ?? f.anio, mes: v('#f-mes') ?? f.mes,
      modalidad: v('#f-mod'), tipo: v('#f-tipo'), adh: v('#f-adh'), estado: v('#f-est'), medico: v('#f-med'),
      obraSocial: v('#f-os'), provincia: v('#f-prov'), ciudad: v('#f-ciu'), orden: v('#f-orden') || 'nombre', contacto: $('#f-cont').checked
    });
  };
  const contar = () => {
    leer();
    const n = filasPacientes(f).filas.length;
    $('#f-cuenta').textContent = `Se incluirán ${n} paciente(s).`;
    $('#f-generar').disabled = n === 0;
  };
  view.querySelectorAll('[data-per]').forEach(b => (b.onclick = () => { leer(); f.periodo = b.dataset.per; renderFiltrosPDFPac(); }));
  view.querySelectorAll('input, select').forEach(el => (el.onchange = contar));
  $('#f-prov').onchange = () => { leer(); f.ciudad = ''; renderFiltrosPDFPac(); };
  $('#f-limpiar').onclick = () => { filtrosPac = { ...FILTROS_PAC_BASE }; renderFiltrosPDFPac(); };
  $('#f-generar').onclick = () => { leer(); generarPDFPacientes(f); };
  contar();
}

async function generarPDFPacientes(f) {
  if (!window.jspdf) { toast('No se pudo cargar el generador de PDF.'); return; }
  const { filas } = filasPacientes(f);
  const { doc, y } = await nuevoPDF('landscape', 'Seguimiento de pacientes y adherencia', descripcionFiltrosPac(f));
  const head = ['Paciente', 'Modalidad', 'Equipo', 'Médico que refirió', 'Obra social', 'Indicación', 'Último control', 'Adherencia',
    'Próx. servicio', 'Contrato / garantía'].concat(f.contacto ? ['DNI / Teléfono'] : []);
  const color = { ok: [30, 125, 79], warn: [161, 92, 0], late: [179, 38, 30], sd: [100, 100, 100] };
  const body = filas.map(({ p, a, mant }) => [
    p.nombre,
    nombreModalidad(p.modalidad),
    [tipoCorto(p.tipo), [p.marca, p.modelo].filter(Boolean).join(' '), p.serie && `S/N ${p.serie}`].filter(Boolean).join('\n'),
    nombreMedico(p.medicoId),
    [p.obraSocial, p.afiliado].filter(Boolean).join('\n'),
    p.tipo === 'cpap' ? [p.presion && `${p.presion} cmH2O`, p.mascara].filter(Boolean).join('\n') : [p.horasIndicadas && `${p.horasIndicadas} h/día`, p.flujo && `${p.flujo} L/min`].filter(Boolean).join('\n'),
    a.fecha ? fmtFecha(a.fecha) : '',
    `${ETIQUETA_ADH[a.estado]}${a.valor != null ? ` (${a.valor} %)` : a.horas != null && a.estado !== 'sd' ? ` (${Number(a.horas).toFixed(1)} h)` : ''}`,
    mant ? fmtFecha(mant.fecha) : '',
    p.modalidad === 'alquiler'
      ? [p.alqFin ? `Hasta ${fmtFecha(p.alqFin)}` : 'Sin fecha de fin', p.estadoPago && `Pago: ${p.estadoPago}`].filter(Boolean).join('\n')
      : (p.garantiaHasta ? `Garantía: ${fmtFecha(p.garantiaHasta)}` : '')
  ].concat(f.contacto ? [[p.dni, p.telefono].filter(Boolean).join('\n')] : []));
  const cuenta = e => filas.filter(x => x.a.estado === e).length;
  doc.autoTable({
    startY: y + 1, head: [head], body,
    foot: [[`Total: ${filas.length} paciente(s)`, '', '', '', '', '', '',
      `Adherentes: ${cuenta('ok')} · Parcial: ${cuenta('warn')} · No: ${cuenta('late')} · Sin datos: ${cuenta('sd')}`, '', ''].concat(f.contacto ? [''] : [])],
    showFoot: 'lastPage', theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.8, valign: 'middle' },
    headStyles: { fillColor: [10, 31, 99], textColor: 255, halign: 'center', fontSize: 7.5 },
    footStyles: { fillColor: [225, 236, 252], textColor: 20, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 248, 250] },
    columnStyles: { 6: { halign: 'center', cellWidth: 19 }, 8: { halign: 'center', cellWidth: 21 } },
    didParseCell: d => {
      if (d.section === 'body' && d.column.index === 7) { d.cell.styles.textColor = color[filas[d.row.index].a.estado]; d.cell.styles.fontStyle = 'bold'; }
      if (d.section === 'foot' && d.column.index === 7) d.cell.colSpan = 3;
    },
    didDrawPage: () => piePagina(doc, 'Adherencia: concentrador, 80 % o más de las horas indicadas; CPAP, 4 h o más en al menos el 70 % de las noches.')
  });
  await entregarPDF(doc, `alveon-pacientes-${hoy()}.pdf`, 'Seguimiento de pacientes – Alveon');
}

/* Ficha individual del paciente con su historial de actividades. */
async function fichaPDF(p) {
  if (!window.jspdf) { toast('No se pudo cargar el generador de PDF.'); return; }
  const { doc, y } = await nuevoPDF('portrait', `Ficha del paciente: ${p.nombre}`, '');
  const a = adherencia(p), mant = proximoMantenimiento(p);
  const datos = [
    ['Paciente', p.nombre, 'DNI', p.dni],
    ['Fecha de nacimiento', p.fechaNac ? fmtFecha(p.fechaNac) : '', 'Celular', p.telefono],
    ['Domicilio', ubicacionTexto(p), 'Familiar o cuidador', [p.contactoNombre, p.contactoTel].filter(Boolean).join(' – ')],
    ['Obra social', [p.obraSocial, p.afiliado && `N.º ${p.afiliado}`].filter(Boolean).join(' – '), 'Diagnóstico', p.diagnostico],
    ['Médico que lo refirió', nombreMedico(p.medicoId), 'Estado', p.estado === 'activo' ? 'Activo' : 'Finalizado'],
    ['Equipo', [nombreTipo(p.tipo), p.marca, p.modelo].filter(Boolean).join(' – '), 'Número de serie', p.serie],
    ['Indicación', p.tipo === 'cpap' ? [p.presion && `${p.presion} cmH2O`, p.mascara].filter(Boolean).join(', ') : [p.horasIndicadas && `${p.horasIndicadas} h/día`, p.flujo && `${p.flujo} L/min`].filter(Boolean).join(', '),
      'Modalidad', nombreModalidad(p.modalidad)],
    p.modalidad === 'alquiler'
      ? ['Contrato', `${fmtFecha(p.alqInicio)} al ${p.alqFin ? fmtFecha(p.alqFin) : 'sin fecha de fin'}`, 'Cuota / pago', [p.cuota !== '' && p.cuota != null && `$ ${Number(p.cuota).toLocaleString('es-AR')}`, p.estadoPago].filter(Boolean).join(' – ')]
      : ['Venta', fmtFecha(p.ventaFecha) + (p.precio ? ` – $ ${Number(p.precio).toLocaleString('es-AR')}` : ''), 'Garantía hasta', fmtFecha(p.garantiaHasta)],
    ['Adherencia', `${ETIQUETA_ADH[a.estado]}: ${a.texto}`, 'Próximo mantenimiento', mant ? `${fmtFecha(mant.fecha)} (${mant.motivo})` : ''],
    ['Próximo control', fmtFecha(p.proximoControl), '', '']
  ];
  doc.autoTable({
    startY: y + 1, body: datos, theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 1.6 },
    columnStyles: { 0: { fontStyle: 'bold', textColor: [10, 31, 99], cellWidth: 34 }, 2: { fontStyle: 'bold', textColor: [10, 31, 99], cellWidth: 34 } }
  });
  doc.setFontSize(11); doc.setTextColor(10, 31, 99);
  doc.text('Historial de actividades', 14, doc.lastAutoTable.finalY + 8);
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 11,
    head: [['Fecha', 'Actividad', 'Detalle', 'Notas']],
    body: registrosDesc(p).map(r => [fmtFecha(r.fecha), NOMBRE_ACT[r.tipo] || r.tipo, detalleRegistro(p, r), r.notas || '']),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: [10, 31, 99], textColor: 255 },
    columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 34 } },
    didDrawPage: () => piePagina(doc, 'Documento con datos de salud: uso confidencial.')
  });
  await entregarPDF(doc, `alveon-paciente-${p.nombre.replace(/[^\wáéíóúñÁÉÍÓÚÑ]+/g, '-').toLowerCase()}-${hoy()}.pdf`, `Ficha de ${p.nombre}`);
}
