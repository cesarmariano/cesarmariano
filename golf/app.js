/* Mi Golf – interfaz: utilidades comunes y sección Rondas (lista, detalle y formulario). */
'use strict';

const $ = s => document.querySelector(s);
const view = $('#view');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clonar = o => JSON.parse(JSON.stringify(o));

function fmtFecha(f) {
  if (!f || !/^\d{4}-\d{2}-\d{2}/.test(f)) return f || '';
  const [a, m, d] = f.slice(0, 10).split('-');
  return `${Number(d)} de ${MESES[Number(m) - 1]} de ${a}`;
}
const fmtDuracion = s => `${Math.floor(s / 60)}:${dos(s % 60)}`;

let reloToast = null;
function toast(msg, ms = 2500) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('visible');
  clearTimeout(reloToast);
  reloToast = setTimeout(() => t.classList.remove('visible'), ms);
}

function setHeader(titulo, volver) {
  $('#title').textContent = titulo;
  const b = $('#btn-back');
  b.hidden = !volver;
  b.onclick = volver || null;
  $('#bottom-nav').hidden = !!volver;
  document.body.classList.toggle('sin-nav', !!volver);
  window.scrollTo(0, 0);
}

let seccion = 'rondas';
function irInicio() {
  document.querySelectorAll('#bottom-nav [data-sec]').forEach(b => b.classList.toggle('activo', b.dataset.sec === seccion));
  if (seccion === 'analisis') renderAnalisis();
  else if (seccion === 'consejos') renderConsejos();
  else renderRondas();
}

/* Ventana superpuesta genérica. Devuelve el elemento para conectar los botones. */
function ventana(html) {
  const capa = document.createElement('div');
  capa.className = 'capa';
  capa.innerHTML = `<div class="ventana" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(capa);
  capa.cerrar = () => capa.remove();
  capa.addEventListener('click', e => { if (e.target === capa && !capa.dataset.fija) capa.cerrar(); });
  return capa;
}

function mostrarFormula() {
  const c = ventana(`
    <h2>Cómo se calcula el puntaje</h2>
    <p>Cada ronda recibe un puntaje de 1 (peor) a 10 (mejor) que combina tres variables:</p>
    <ul class="lista">
      <li><b style="color:var(--s-campo-t)">Campo: 0 a 3 puntos</b> según la dificultad del estado de la cancha.
        Excelente 0 · Buena 0,5 · Seca 0,5 · Dura 1 · Mojada 1,5 · Bunkers desastrosos 1,5 (se suman, máximo 3).</li>
      <li><b style="color:var(--s-clima-t)">Clima: 0 a 3 puntos</b> según la dificultad del clima.
        Templado 0 · Caluroso 1 · Frío 1 · Ventoso 1,5; temperatura menor de 10 °C o mayor de 30 °C +0,5; menor de 5 °C o mayor de 35 °C +1 (máximo 3).</li>
      <li><b style="color:var(--s-juego-t)">Juego: −4 a +4 puntos</b> según el promedio de las notas de las cinco áreas.
        Nota media 10 = +4 · 5,5 = 0 · 1 = −4. Un mal juego resta.</li>
    </ul>
    <p><b>Puntaje = campo + clima + juego</b>, limitado entre 1 y 10. Las condiciones difíciles suman mérito:
      jugar bien con viento y la cancha en mal estado da un puntaje alto; jugar mal en condiciones ideales da un puntaje bajo.</p>
    <p class="hint">La dificultad del campo y del clima se calcula sola, pero puede ajustarse a mano en cada ronda.</p>
    <button class="btn primary" id="f-ok">Entendido</button>`);
  c.querySelector('#f-ok').onclick = c.cerrar;
}

/* ---------- Lista de rondas ---------- */
const ordenarRondas = (a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.creado || '').localeCompare(a.creado || '');

function textoCondiciones(r) {
  const clima = r.clima.tipos.map(k => (CLIMAS.find(c => c.k === k) || {}).nombre).filter(Boolean).join(', ');
  const temp = numero(r.clima.temp) !== null ? `${r.clima.temp} °C` : '';
  const cancha = r.cancha.estados.map(k => (ESTADOS_CANCHA.find(c => c.k === k) || {}).nombre.toLowerCase()).join(', ');
  return [[clima, temp].filter(Boolean).join(' '), cancha ? 'cancha ' + cancha : ''].filter(Boolean).join(' · ');
}
function textoGolpes(r) {
  const g = numero(r.golpes), p = numero(r.par);
  if (g === null) return '';
  return `${g} golpes` + (p !== null ? ` (${g - p > 0 ? '+' : ''}${g - p})` : '');
}
const clasePuntaje = v => (v >= 7 ? 'alto' : v >= 4 ? 'medio' : 'bajo');

function renderRondas() {
  setHeader('Mis rondas');
  const rondas = vivos('rondas').sort(ordenarRondas);
  const paraGrafico = rondas.slice(0, 24).reverse();
  view.innerHTML = `
    ${bannerInstalar()}
    <button class="btn primary grande" id="btn-nueva">+ Nueva ronda</button>
    ${rondas.length ? `
    <section class="card">
      <div class="card-tit"><h2>Puntaje por ronda</h2><button class="link" id="ver-formula">¿Cómo se calcula?</button></div>
      ${leyendaPuntajes()}
      <div class="grafico-cont" id="gp"><div class="tooltip" hidden></div><div class="grafico-scroll" id="gp-svg"></div></div>
    </section>
    <h2 class="sec">Historial (${rondas.length})</h2>
    ${rondas.map(r => {
      const p = puntaje(r);
      return `<button class="item" data-id="${r.id}">
        <span class="badge ${p ? clasePuntaje(p.puntaje) : 'nulo'}">${p ? decimal(p.puntaje) : '—'}</span>
        <span class="info"><span class="name">${esc(fmtFecha(r.fecha))}${r.lugar ? ' · ' + esc(r.lugar) : ''}</span>
          <span class="sub">${esc([textoCondiciones(r), textoGolpes(r)].filter(Boolean).join(' · ') || 'Sin datos de condiciones')}</span></span>
      </button>`;
    }).join('')}` : `
    <div class="card vacio-card">
      <h2>Bienvenido</h2>
      <p>Registre cada ronda: condiciones, evaluación de cada área del juego, decisiones de palo y notas de voz.
        Con el historial, la aplicación muestra su evolución y lo que debe mejorar.</p>
      <p class="hint">También puede revisar la biblioteca de consejos en la sección Consejos.</p>
    </div>`}`;
  $('#btn-nueva').onclick = () => renderFormRonda(null);
  view.querySelectorAll('.item[data-id]').forEach(b => (b.onclick = () => renderRonda(b.dataset.id)));
  conectarInstalar();
  if (rondas.length) {
    $('#ver-formula').onclick = mostrarFormula;
    const cont = $('#gp-svg');
    cont.innerHTML = graficoPuntajes(paraGrafico, cont.clientWidth || 320);
    cont.scrollLeft = cont.scrollWidth;
    conectarGraficoPuntajes($('#gp'), paraGrafico, renderRonda);
  }
}

/* ---------- Detalle de una ronda ---------- */
function filaPuntaje(etiqueta, valor, color) {
  return `<div class="fp"><i style="background:var(${color})"></i><span>${etiqueta}</span><b>${firmar(valor)}</b></div>`;
}

function htmlIndicadoresArea(r, a) {
  const ind = indicadores(r), st = r.areas[a.k].stats;
  const partes = [];
  if (a.k === 'tee') {
    if (ind.fairways !== null) partes.push(`Fairways ${st.fw}/${st.fwTot} (${ind.fairways} %)`);
    if (numero(st.izq) !== null || numero(st.der) !== null) partes.push(`Fallos: ${st.izq || 0} a la izquierda, ${st.der || 0} a la derecha`);
  }
  if (a.k === 'fairway' && ind.gir !== null) partes.push(`Greens en regulación ${st.gir}/${st.girTot || r.hoyos} (${ind.gir} %)`);
  if (a.k === 'bunker' && ind.bunker !== null) partes.push(`Salidas al green ${st.ok}/${st.tot} (${ind.bunker} %)`);
  if (a.k === 'approach' && ind.upDown !== null) partes.push(`Up and down ${st.ok}/${st.tot} (${ind.upDown} %)`);
  if (a.k === 'putting') {
    if (numero(st.putts) !== null) partes.push(`${st.putts} putts (${decimal(ind.puttsHoyo)} por hoyo)`);
    if (numero(st.tres) !== null) partes.push(`${st.tres} tres putts`);
  }
  return partes.length ? `<p class="hint">${esc(partes.join(' · '))}</p>` : '';
}

const nombreDe = (lista, k) => (lista.find(x => x.k === k) || {}).nombre || '';

function htmlDecisiones(decs) {
  if (!decs.length) return '<p class="hint">Sin decisiones registradas.</p>';
  return `<div class="tabla-cont"><table class="tabla"><thead><tr><th>Hoyo</th><th>Situación</th><th>Dist.</th><th>Palo</th><th>Resultado</th><th>Decisión</th></tr></thead><tbody>
    ${decs.map(d => `<tr><td>${esc(d.hoyo)}</td><td>${esc(nombreDe(SITUACIONES, d.situacion))}</td><td>${esc(d.distancia)}${d.distancia ? ' m' : ''}</td>
      <td>${esc(d.palo)}</td><td><span class="res ${esc(d.resultado)}">${esc(nombreDe(RESULTADOS, d.resultado))}</span></td>
      <td>${esc(nombreDe(DECISIONES, d.decision))}</td></tr>${d.nota ? `<tr class="nota-fila"><td colspan="6">${esc(d.nota)}</td></tr>` : ''}`).join('')}
  </tbody></table></div>`;
}

const parrafo = t => (t ? `<p class="texto">${esc(t)}</p>` : '');

function renderRonda(id) {
  const r = buscarId('rondas', id);
  if (!r) { irInicio(); return; }
  setHeader('Ronda', () => irInicio());
  const p = puntaje(r);
  view.innerHTML = `
    <section class="card">
      <h2>${esc(fmtFecha(r.fecha))}</h2>
      <p class="sub-tit">${esc([r.lugar, r.hoyos ? r.hoyos + ' hoyos' : '', textoGolpes(r)].filter(Boolean).join(' · '))}</p>
      ${p ? `<div class="resumen-p">
        <div class="big ${clasePuntaje(p.puntaje)}">${decimal(p.puntaje)}<small>/10</small></div>
        <div class="desglose">
          ${filaPuntaje('Campo', p.campo, '--s-campo')}${filaPuntaje('Clima', p.clima, '--s-clima')}${filaPuntaje('Juego', p.juego, '--s-juego')}
          <div class="fp total"><span>Suma</span><b>${decimal(p.suma)}</b></div>
        </div></div>
        <p class="hint">Nota media del juego: ${decimal(Math.round(p.promedio * 10) / 10)}. <button class="link" id="ver-formula">¿Cómo se calcula?</button></p>`
        : '<p class="hint">Sin notas de juego: no se calcula el puntaje.</p>'}
    </section>
    <section class="card">
      <h2>Condiciones</h2>
      <p><b>Clima:</b> ${esc(textoCondiciones({ ...r, cancha: { estados: [] } }) || 'sin datos')} — ${esc(textoDificultad(difClima(r)))} (${decimal(difClima(r))})</p>
      <p><b>Cancha:</b> ${esc(r.cancha.estados.map(k => nombreDe(ESTADOS_CANCHA, k)).join(', ') || 'sin datos')} — ${esc(textoDificultad(difCancha(r)))} (${decimal(difCancha(r))})</p>
    </section>
    ${AREAS.map(a => {
      const x = r.areas[a.k];
      if (x.nota === null && !x.bien && !x.mejorar && !Object.values(x.stats).some(v => v !== '')) return '';
      return `<section class="card">
        <div class="card-tit"><h2>${esc(a.nombre)}</h2>${x.nota !== null ? `<span class="badge ${clasePuntaje(x.nota)}">${x.nota}</span>` : ''}</div>
        ${htmlIndicadoresArea(r, a)}
        ${x.bien ? `<h3 class="bien">Qué hice bien</h3>${parrafo(x.bien)}` : ''}
        ${x.mejorar ? `<h3 class="mejorar">Qué debo mejorar</h3>${parrafo(x.mejorar)}` : ''}
      </section>`;
    }).join('')}
    <section class="card"><h2>Decisiones de palo</h2>${htmlDecisiones(r.decisiones)}</section>
    ${r.bien || r.mejorar ? `<section class="card"><h2>Ronda en general</h2>
      ${r.bien ? `<h3 class="bien">Qué hice bien</h3>${parrafo(r.bien)}` : ''}
      ${r.mejorar ? `<h3 class="mejorar">Qué debo mejorar</h3>${parrafo(r.mejorar)}` : ''}</section>` : ''}
    ${r.audios.length ? `<section class="card"><h2>Notas de voz</h2>${r.audios.map((a, i) => `
      <div class="audio-item"><div class="audio-cab"><span>${esc(new Date(a.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))} · ${fmtDuracion(a.duracion || 0)}</span>
        <button class="btn chico" data-escuchar="${i}">Escuchar</button></div>
        <div class="reproductor" id="rep-${i}"></div>${parrafo(a.texto)}</div>`).join('')}</section>` : ''}
    <div class="actions">
      <button class="btn primary" id="b-editar">Editar</button>
      <button class="btn danger" id="b-borrar">Borrar</button>
    </div>`;
  if ($('#ver-formula')) $('#ver-formula').onclick = mostrarFormula;
  view.querySelectorAll('[data-escuchar]').forEach(b => (b.onclick = () => reproducir(r.audios[b.dataset.escuchar].id, $('#rep-' + b.dataset.escuchar), b)));
  $('#b-editar').onclick = () => renderFormRonda(id);
  $('#b-borrar').onclick = async () => {
    if (!confirm('¿Borrar esta ronda? También se borran sus notas de voz.')) return;
    for (const a of r.audios) await borrarMedio(a.id);
    borrarRegistro('rondas', id);
    toast('Ronda borrada.');
    irInicio();
  };
}

async function reproducir(medioId, cont, boton) {
  if (boton) { boton.disabled = true; boton.textContent = 'Cargando…'; }
  try {
    const blob = await obtenerMedio(medioId);
    if (!blob) throw new Error('El audio no está en este dispositivo ni en Google Drive.');
    cont.innerHTML = `<audio controls src="${URL.createObjectURL(blob)}"></audio>`;
    cont.querySelector('audio').play().catch(() => {});
    if (boton) boton.remove();
  } catch (e) {
    toast(e.message, 5000);
    if (boton) { boton.disabled = false; boton.textContent = 'Escuchar'; }
  }
}

/* ---------- Formulario de ronda ---------- */
function rondaNueva() {
  const anterior = vivos('rondas').sort(ordenarRondas)[0];
  const r = {
    id: uid(), fecha: hoy(), lugar: anterior ? anterior.lugar : '', hoyos: anterior ? anterior.hoyos : 18,
    golpes: '', par: anterior ? anterior.par : '',
    clima: { tipos: [], temp: '', manual: '' }, cancha: { estados: [], manual: '' }, areas: {},
    decisiones: [], bien: '', mejorar: '', audios: []
  };
  AREAS.forEach(a => { r.areas[a.k] = { nota: null, bien: '', mejorar: '', stats: {} }; });
  return r;
}

const leerRuta = (o, ruta) => ruta.split('.').reduce((x, k) => (x ? x[k] : undefined), o);
function ponerRuta(o, ruta, v) {
  const ks = ruta.split('.'), u = ks.pop();
  const dest = ks.reduce((x, k) => (x[k] = x[k] || {}), o);
  dest[u] = v;
}

let borrador = null, mediosNuevos = [], borradorCambiado = false;

function chips(ruta, opciones, seleccion) {
  return `<div class="chips">${opciones.map(o => `<button type="button" class="chip${seleccion.includes(o.k) ? ' sel' : ''}" data-chip="${ruta}" data-valor="${o.k}" aria-pressed="${seleccion.includes(o.k)}">${esc(o.nombre)}</button>`).join('')}</div>`;
}
function selectorNota(ruta, valor) {
  let s = `<div class="notas" role="group" aria-label="Nota de 1 a 10">`;
  s += `<button type="button" class="nota${valor === null ? ' sel' : ''}" data-nota="${ruta}" data-valor="">—</button>`;
  for (let i = 1; i <= 10; i++) s += `<button type="button" class="nota${valor === i ? ' sel' : ''}" data-nota="${ruta}" data-valor="${i}">${i}</button>`;
  return s + '</div>';
}
const campo = (ruta, etiqueta, valor, extra = '') =>
  `<div class="form-row"><label for="f-${ruta}">${etiqueta}</label><input class="field" id="f-${ruta}" data-campo="${ruta}" value="${esc(valor)}" ${extra}></div>`;
const texto = (ruta, etiqueta, valor, filas = 2) =>
  `<div class="form-row"><label for="f-${ruta}">${etiqueta}</label><textarea class="field" id="f-${ruta}" data-campo="${ruta}" rows="${filas}">${esc(valor)}</textarea></div>`;

function selectorDificultad(ruta, auto, manual) {
  const opciones = [0, 0.5, 1, 1.5, 2, 2.5, 3];
  return `<div class="form-row"><label for="f-${ruta}">Dificultad (calculada: ${decimal(auto)})</label>
    <select class="field" id="f-${ruta}" data-campo="${ruta}">
      <option value="">Usar la calculada (${decimal(auto)})</option>
      ${opciones.map(v => `<option value="${v}"${String(manual) === String(v) ? ' selected' : ''}>${decimal(v)} – ${textoDificultad(v).toLowerCase()}</option>`).join('')}
    </select></div>`;
}

function renderFormRonda(id, conservar) {
  if (!conservar) {
    const r = id ? buscarId('rondas', id) : null;
    borrador = r ? clonar(r) : rondaNueva();
    mediosNuevos = []; borradorCambiado = false;
  }
  const r = borrador;
  const salir = () => (id ? renderRonda(id) : irInicio());
  setHeader(id ? 'Editar ronda' : 'Nueva ronda', () => cancelarForm(salir));
  const lugares = [...new Set(vivos('rondas').map(x => x.lugar).filter(Boolean))];
  view.innerHTML = `
    <form id="fronda" autocomplete="off">
      <section class="card">
        <h2>Datos de la ronda</h2>
        <div class="dos-col">${campo('fecha', 'Fecha', r.fecha, 'type="date" required')}
          <div class="form-row"><label for="f-hoyos">Hoyos</label><select class="field" id="f-hoyos" data-campo="hoyos" data-num>
            <option value="18"${Number(r.hoyos) === 18 ? ' selected' : ''}>18</option><option value="9"${Number(r.hoyos) === 9 ? ' selected' : ''}>9</option></select></div></div>
        ${campo('lugar', 'Lugar (cancha o club)', r.lugar, 'list="lugares" placeholder="Nombre de la cancha"')}
        <datalist id="lugares">${lugares.map(l => `<option value="${esc(l)}">`).join('')}</datalist>
        <div class="dos-col">${campo('golpes', 'Golpes', r.golpes, 'type="number" inputmode="numeric" min="0"')}
          ${campo('par', 'Par de la cancha', r.par, 'type="number" inputmode="numeric" min="0"')}</div>
      </section>

      <section class="card">
        <h2>Clima</h2>
        ${chips('clima.tipos', CLIMAS, r.clima.tipos)}
        ${campo('clima.temp', 'Temperatura (°C)', r.clima.temp, 'type="number" inputmode="decimal" step="0.5"')}
        <div id="dif-clima">${selectorDificultad('clima.manual', difClimaAuto(r.clima), r.clima.manual)}</div>
      </section>

      <section class="card">
        <h2>Estado de la cancha</h2>
        ${chips('cancha.estados', ESTADOS_CANCHA, r.cancha.estados)}
        <div id="dif-cancha">${selectorDificultad('cancha.manual', difCanchaAuto(r.cancha), r.cancha.manual)}</div>
      </section>

      <section class="card">
        <div class="card-tit"><h2>Notas de voz</h2></div>
        <p class="hint">Grabe lo que recuerde de la ronda: el audio se transcribe a texto y Claude puede ordenarlo en cada área.</p>
        <button type="button" class="btn" id="b-grabar">🎙 Grabar nota de voz</button>
        <div id="audios"></div>
      </section>

      ${AREAS.map(a => `
      <details class="card area" ${r.areas[a.k].nota !== null || r.areas[a.k].bien || r.areas[a.k].mejorar ? 'open' : ''}>
        <summary><h2>${esc(a.nombre)}</h2><span class="badge ${r.areas[a.k].nota !== null ? clasePuntaje(r.areas[a.k].nota) : 'nulo'}" id="bn-${a.k}">${r.areas[a.k].nota !== null ? r.areas[a.k].nota : '—'}</span></summary>
        <label>Nota (1 = muy mal · 10 = excelente)</label>
        ${selectorNota('areas.' + a.k + '.nota', r.areas[a.k].nota)}
        <div class="dos-col">${a.stats.map(s => campo(`areas.${a.k}.stats.${s.k}`, s.l, r.areas[a.k].stats[s.k] || '', 'type="number" inputmode="numeric" min="0"')).join('')}</div>
        ${texto(`areas.${a.k}.bien`, 'Qué hice bien', r.areas[a.k].bien)}
        ${texto(`areas.${a.k}.mejorar`, 'Qué debo mejorar', r.areas[a.k].mejorar)}
      </details>`).join('')}

      <section class="card">
        <h2>Decisiones de palo</h2>
        <p class="hint">Registre los golpes importantes: situación, distancia, palo elegido, resultado y si la decisión fue acertada.</p>
        <div id="decisiones"></div>
        <button type="button" class="btn" id="b-dec">+ Agregar decisión</button>
      </section>

      <section class="card">
        <h2>Ronda en general</h2>
        ${texto('bien', 'Qué hice bien', r.bien, 3)}
        ${texto('mejorar', 'Qué debo mejorar', r.mejorar, 3)}
      </section>

      <div class="barra-guardar">
        <div id="vista-p" class="vista-p"></div>
        <button type="submit" class="btn primary">Guardar ronda</button>
      </div>
    </form>
    <datalist id="palos">${PALOS.map(p => `<option value="${p}">`).join('')}</datalist>`;

  const f = $('#fronda');
  f.addEventListener('input', e => {
    const el = e.target.closest('[data-campo]');
    if (el) {
      ponerRuta(r, el.dataset.campo, el.hasAttribute('data-num') ? Number(el.value) : el.value);
      borradorCambiado = true;
      if (el.dataset.campo === 'clima.temp') refrescarDificultad();
      actualizarVista();
    }
    const d = e.target.closest('[data-dec]');
    if (d) { r.decisiones[d.dataset.dec][d.dataset.k] = d.value; borradorCambiado = true; }
    const t = e.target.closest('[data-audio]');
    if (t) { r.audios[t.dataset.audio].texto = t.value; borradorCambiado = true; }
  });
  f.addEventListener('change', e => {
    const d = e.target.closest('select[data-dec]');
    if (d) { r.decisiones[d.dataset.dec][d.dataset.k] = d.value; borradorCambiado = true; }
  });
  f.addEventListener('click', e => {
    const c = e.target.closest('[data-chip]');
    if (c) {
      const lista = leerRuta(r, c.dataset.chip);
      const i = lista.indexOf(c.dataset.valor);
      if (i >= 0) lista.splice(i, 1); else lista.push(c.dataset.valor);
      // "Excelente" y "Buena" no se combinan entre sí.
      if (c.dataset.chip === 'cancha.estados' && i < 0 && ['excelente', 'buena'].includes(c.dataset.valor)) {
        const otra = c.dataset.valor === 'excelente' ? 'buena' : 'excelente';
        const j = lista.indexOf(otra); if (j >= 0) lista.splice(j, 1);
      }
      if (c.dataset.chip === 'clima.tipos' && i < 0 && c.dataset.valor === 'templado') {
        ['caluroso', 'frio'].forEach(k => { const j = lista.indexOf(k); if (j >= 0) lista.splice(j, 1); });
      }
      if (c.dataset.chip === 'clima.tipos' && i < 0 && ['caluroso', 'frio'].includes(c.dataset.valor)) {
        ['templado', c.dataset.valor === 'caluroso' ? 'frio' : 'caluroso'].forEach(k => { const j = lista.indexOf(k); if (j >= 0) lista.splice(j, 1); });
      }
      c.parentElement.querySelectorAll('[data-chip]').forEach(b => {
        const sel = lista.includes(b.dataset.valor);
        b.classList.toggle('sel', sel); b.setAttribute('aria-pressed', sel);
      });
      borradorCambiado = true;
      refrescarDificultad(); actualizarVista();
    }
    const n = e.target.closest('[data-nota]');
    if (n) {
      const v = n.dataset.valor === '' ? null : Number(n.dataset.valor);
      ponerRuta(r, n.dataset.nota, v);
      n.parentElement.querySelectorAll('[data-nota]').forEach(b => b.classList.toggle('sel', b === n));
      const k = n.dataset.nota.split('.')[1];
      const badge = $('#bn-' + k);
      badge.textContent = v === null ? '—' : v;
      badge.className = 'badge ' + (v === null ? 'nulo' : clasePuntaje(v));
      borradorCambiado = true;
      actualizarVista();
    }
    const q = e.target.closest('[data-quitar-dec]');
    if (q) { r.decisiones.splice(Number(q.dataset.quitarDec), 1); pintarDecisiones(); borradorCambiado = true; }
  });

  function refrescarDificultad() {
    $('#dif-clima').innerHTML = selectorDificultad('clima.manual', difClimaAuto(r.clima), r.clima.manual);
    $('#dif-cancha').innerHTML = selectorDificultad('cancha.manual', difCanchaAuto(r.cancha), r.cancha.manual);
  }
  function actualizarVista() {
    const p = puntaje(r);
    $('#vista-p').innerHTML = p
      ? `<b>Puntaje ${decimal(p.puntaje)}</b><span>Campo ${firmar(p.campo)} · Clima ${firmar(p.clima)} · Juego ${firmar(p.juego)}</span>`
      : '<span>Asigne notas a las áreas para calcular el puntaje.</span>';
  }
  function pintarDecisiones() {
    $('#decisiones').innerHTML = r.decisiones.map((d, i) => `
      <div class="decision">
        <div class="dec-cab"><b>Decisión ${i + 1}</b><button type="button" class="link peligro" data-quitar-dec="${i}">Quitar</button></div>
        <div class="tres-col">
          <div class="form-row"><label>Hoyo</label><input class="field" data-dec="${i}" data-k="hoyo" value="${esc(d.hoyo)}" type="number" inputmode="numeric" min="1" max="18"></div>
          <div class="form-row"><label>Distancia (m)</label><input class="field" data-dec="${i}" data-k="distancia" value="${esc(d.distancia)}" type="number" inputmode="numeric" min="0"></div>
          <div class="form-row"><label>Palo</label><input class="field" data-dec="${i}" data-k="palo" value="${esc(d.palo)}" list="palos"></div>
        </div>
        <div class="tres-col">
          ${[['situacion', 'Situación', SITUACIONES], ['resultado', 'Resultado', RESULTADOS], ['decision', 'Decisión', DECISIONES]].map(([k, l, ops]) => `
          <div class="form-row"><label>${l}</label><select class="field" data-dec="${i}" data-k="${k}"><option value="">—</option>
            ${ops.map(o => `<option value="${o.k}"${d[k] === o.k ? ' selected' : ''}>${o.nombre}</option>`).join('')}</select></div>`).join('')}
        </div>
        <div class="form-row"><label>Comentario</label><input class="field" data-dec="${i}" data-k="nota" value="${esc(d.nota)}" placeholder="Por qué elegí ese palo, qué pasó"></div>
      </div>`).join('');
  }
  function pintarAudios() {
    $('#audios').innerHTML = r.audios.map((a, i) => `
      <div class="audio-item">
        <div class="audio-cab"><span>Nota ${i + 1} · ${fmtDuracion(a.duracion || 0)}</span>
          <span class="acciones-chicas"><button type="button" class="btn chico" data-escuchar="${i}">Escuchar</button>
          <button type="button" class="link peligro" data-quitar-audio="${i}">Quitar</button></span></div>
        <div class="reproductor" id="rep-${i}"></div>
        <textarea class="field" rows="4" data-audio="${i}" placeholder="Transcripción (puede corregirla o dictarla con el teclado)">${esc(a.texto)}</textarea>
        <button type="button" class="btn chico ia" data-ordenar="${i}">✦ Ordenar con Claude en las áreas</button>
      </div>`).join('');
    $('#audios').querySelectorAll('[data-escuchar]').forEach(b => (b.onclick = () => reproducir(r.audios[b.dataset.escuchar].id, $('#rep-' + b.dataset.escuchar), b)));
    $('#audios').querySelectorAll('[data-quitar-audio]').forEach(b => (b.onclick = async () => {
      if (!confirm('¿Quitar esta nota de voz?')) return;
      const [a] = r.audios.splice(Number(b.dataset.quitarAudio), 1);
      if (mediosNuevos.includes(a.id)) await borrarMedio(a.id); else (r._quitar = r._quitar || []).push(a.id);
      borradorCambiado = true; pintarAudios();
    }));
    $('#audios').querySelectorAll('[data-ordenar]').forEach(b => (b.onclick = () => ordenarAudio(Number(b.dataset.ordenar), b)));
  }

  async function ordenarAudio(i, boton) {
    const t = (r.audios[i].texto || '').trim();
    if (!t) { toast('La nota no tiene texto para ordenar.'); return; }
    boton.disabled = true; boton.textContent = 'Ordenando con Claude…';
    try {
      const o = await IA.ordenarTranscripcion(t);
      const sumar = (a, b) => [a, b].map(x => (x || '').trim()).filter(Boolean).join('\n');
      AREAS.forEach(a => {
        const x = o.areas[a.k]; if (!x) return;
        r.areas[a.k].bien = sumar(r.areas[a.k].bien, x.bien);
        r.areas[a.k].mejorar = sumar(r.areas[a.k].mejorar, x.mejorar);
        if (r.areas[a.k].nota === null && x.nota >= 1 && x.nota <= 10) r.areas[a.k].nota = x.nota;
      });
      r.bien = sumar(r.bien, o.bien); r.mejorar = sumar(r.mejorar, o.mejorar);
      (o.decisiones || []).forEach(d => r.decisiones.push({ id: uid(), ...d }));
      borradorCambiado = true;
      const y = window.scrollY;
      renderFormRonda(id, true);
      window.scrollTo(0, y);
      toast('Contenido distribuido en las áreas. Revíselo antes de guardar.', 4000);
    } catch (e) {
      toast(e.message, 7000);
      boton.disabled = false; boton.textContent = '✦ Ordenar con Claude en las áreas';
    }
  }

  $('#b-dec').onclick = () => {
    r.decisiones.push({ id: uid(), hoyo: '', situacion: '', distancia: '', palo: '', resultado: '', decision: '', nota: '' });
    pintarDecisiones(); borradorCambiado = true;
  };
  $('#b-grabar').onclick = () => abrirGrabador(async res => {
    const idMedio = await nuevoMedio(res.blob, 'audio');
    mediosNuevos.push(idMedio);
    r.audios.push({ id: idMedio, fecha: ahora(), duracion: res.duracion, texto: res.texto });
    borradorCambiado = true; pintarAudios();
  });
  f.onsubmit = async e => {
    e.preventDefault();
    if (!r.fecha) { toast('Indique la fecha de la ronda.'); return; }
    for (const m of (r._quitar || [])) await borrarMedio(m);
    delete r._quitar;
    guardarRegistro('rondas', r);
    borrador = null; mediosNuevos = [];
    toast('Ronda guardada.');
    renderRonda(r.id);
  };
  pintarDecisiones(); pintarAudios(); actualizarVista();
}

async function cancelarForm(salir) {
  if (borradorCambiado && !confirm('¿Salir sin guardar los cambios?')) return;
  for (const m of mediosNuevos) await borrarMedio(m);
  borrador = null; mediosNuevos = [];
  salir();
}

/* ---------- Grabador ---------- */
function abrirGrabador(alTerminar) {
  const c = ventana(`
    <h2>Nota de voz</h2>
    <div class="grabando"><span class="punto"></span><span id="g-tiempo">0:00</span></div>
    <div class="transcripcion" id="g-texto"><span class="hint">Hable con normalidad. El texto aparecerá aquí.</span></div>
    <p class="hint" id="g-aviso"></p>
    <div class="actions"><button class="btn" id="g-cancelar">Cancelar</button><button class="btn primary" id="g-detener">Detener y guardar</button></div>`);
  c.dataset.fija = '1';
  let reloj = null;
  const cerrar = () => { clearInterval(reloj); c.cerrar(); };
  Grabador.iniciar((t, interino, aviso) => {
    $('#g-texto').innerHTML = esc(t) + (interino ? ` <span class="interino">${esc(interino)}</span>` : '') || '<span class="hint">Escuchando…</span>';
    if (aviso) $('#g-aviso').textContent = aviso;
  }).then(() => {
    reloj = setInterval(() => { const el = $('#g-tiempo'); if (el) el.textContent = fmtDuracion(Grabador.segundos()); }, 500);
  }).catch(e => { cerrar(); toast(e.message, 6000); });
  c.querySelector('#g-cancelar').onclick = () => { Grabador.cancelar(); cerrar(); };
  c.querySelector('#g-detener').onclick = async () => {
    c.querySelector('#g-detener').disabled = true;
    c.querySelector('#g-detener').textContent = 'Guardando…';
    try {
      const res = await Grabador.detener();
      cerrar();
      if (!res.blob.size) { toast('No se grabó audio.'); return; }
      await alTerminar(res);
    } catch (e) { cerrar(); toast(e.message || 'No se pudo guardar el audio.', 6000); }
  };
}
