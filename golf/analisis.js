/* Sección Análisis: evolución por área, indicadores, condiciones, decisiones de palo,
   recomendaciones automáticas y análisis con Claude. */
'use strict';

const promedio = xs => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const red1 = v => (v === null ? null : Math.round(v * 10) / 10);

/* Compara las últimas 5 rondas con las 5 anteriores. */
function tendencia(valores) {
  const v = valores.filter(x => x !== null);
  const reciente = v.slice(-5), anterior = v.slice(-10, -5);
  const r = promedio(reciente), a = promedio(anterior);
  return { reciente: red1(r), anterior: red1(a), dif: r !== null && a !== null ? red1(r - a) : null, n: v.length };
}
function flecha(dif, mayorEsMejor = true) {
  if (dif === null) return '<span class="tend neutra">sin comparación</span>';
  const mejor = mayorEsMejor ? dif > 0 : dif < 0;
  if (Math.abs(dif) < 0.3) return '<span class="tend neutra">→ estable</span>';
  return `<span class="tend ${mejor ? 'sube' : 'baja'}">${dif > 0 ? '▲' : '▼'} ${decimal(Math.abs(dif))} ${mejor ? 'mejora' : 'retroceso'}</span>`;
}

const CAT_AREA = { tee: 'tee', fairway: 'fairway', bunker: 'bunker', approach: 'approach', putting: 'putting' };

function estadisticasDecisiones(rondas) {
  const porPalo = {};
  rondas.forEach(r => r.decisiones.forEach(d => {
    const palo = (d.palo || '').trim();
    if (!palo) return;
    const x = porPalo[palo] = porPalo[palo] || { palo, n: 0, acertada: 0, conDecision: 0, bueno: 0, conResultado: 0 };
    x.n++;
    if (d.decision) { x.conDecision++; if (d.decision === 'acertada') x.acertada++; }
    if (d.resultado) { x.conResultado++; if (d.resultado === 'bueno') x.bueno++; }
  }));
  return Object.values(porPalo).sort((a, b) => b.n - a.n);
}
const pct = (a, b) => (b ? Math.round(a / b * 100) : null);

function juegoPorCondicion(rondas, lista, clave) {
  return lista.map(o => {
    const proms = rondas.filter(r => r[clave][clave === 'clima' ? 'tipos' : 'estados'].includes(o.k)).map(promedioJuego).filter(x => x !== null);
    return { etiqueta: o.nombre, valor: promedio(proms) || 0, n: proms.length };
  }).filter(f => f.n).map(f => ({ ...f, texto: `${decimal(red1(f.valor))} (${f.n})` }));
}

function recomendaciones(rondas, tendencias, decisiones) {
  const recs = [];
  const consejosDe = cat => vivos('consejos').filter(c => (c.categorias || []).includes(cat)).slice(0, 3);
  const enlaces = cat => consejosDe(cat).map(c => `<br><button class="link" data-consejo="${c.id}">${esc(c.titulo)}</button>`).join('');
  const conDatos = AREAS.filter(a => tendencias[a.k].reciente !== null);
  if (conDatos.length) {
    const debil = conDatos.reduce((m, a) => (tendencias[a.k].reciente < tendencias[m.k].reciente ? a : m));
    recs.push(`<b>Prioridad: ${esc(debil.nombre)}</b> es el área con la nota más baja en las últimas rondas (${decimal(tendencias[debil.k].reciente)}).` +
      (consejosDe(CAT_AREA[debil.k]).length ? `<br><span class="hint">Para repasar:</span>${enlaces(CAT_AREA[debil.k])}` : ''));
    conDatos.filter(a => tendencias[a.k].dif !== null && tendencias[a.k].dif <= -1).forEach(a =>
      recs.push(`<b>${esc(a.nombre)}</b> bajó de ${decimal(tendencias[a.k].anterior)} a ${decimal(tendencias[a.k].reciente)}. Revise lo que anotó para mejorar en esa área.`));
    conDatos.filter(a => tendencias[a.k].dif !== null && tendencias[a.k].dif >= 1).forEach(a =>
      recs.push(`<b>${esc(a.nombre)}</b> mejoró de ${decimal(tendencias[a.k].anterior)} a ${decimal(tendencias[a.k].reciente)}. Mantenga la rutina que le dio resultado.`));
  }
  decisiones.filter(d => d.conResultado >= 3 && pct(d.bueno, d.conResultado) < 40).forEach(d =>
    recs.push(`Con <b>${esc(d.palo)}</b> sólo el ${pct(d.bueno, d.conResultado)} % de los golpes registrados tuvo buen resultado. Evalúe otra opción de palo o practíquelo antes de usarlo en situaciones comprometidas.` +
      (consejosDe('estrategia').length ? `<br><span class="hint">Para repasar:</span>${enlaces('estrategia')}` : '')));
  decisiones.filter(d => d.conDecision >= 3 && pct(d.acertada, d.conDecision) < 50).forEach(d =>
    recs.push(`Las decisiones con <b>${esc(d.palo)}</b> fueron acertadas sólo el ${pct(d.acertada, d.conDecision)} % de las veces.`));
  const izq = rondas.reduce((s, r) => s + (numero(r.areas.tee.stats.izq) || 0), 0);
  const der = rondas.reduce((s, r) => s + (numero(r.areas.tee.stats.der) || 0), 0);
  if (izq + der >= 6 && (izq >= der * 2 || der >= izq * 2)) {
    recs.push(`La mayoría de los fallos de salida van a la <b>${izq > der ? 'izquierda' : 'derecha'}</b> (${Math.max(izq, der)} de ${izq + der}). Revise el grip, la alineación y la posición de la bola.`);
  }
  const conViento = rondas.filter(r => r.clima.tipos.includes('ventoso')).map(promedioJuego).filter(x => x !== null);
  const sinViento = rondas.filter(r => !r.clima.tipos.includes('ventoso')).map(promedioJuego).filter(x => x !== null);
  if (conViento.length >= 2 && sinViento.length >= 2 && promedio(sinViento) - promedio(conViento) >= 1) {
    recs.push(`Con viento su nota de juego baja ${decimal(red1(promedio(sinViento) - promedio(conViento)))} puntos. Practique golpes más bajos y elija un palo más con viento en contra.`);
  }
  const tres = rondas.map(r => numero(r.areas.putting.stats.tres)).filter(x => x !== null).slice(-5);
  if (tres.length >= 2 && promedio(tres) >= 2) recs.push(`Promedio de ${decimal(red1(promedio(tres)))} tres putts por ronda en las últimas rondas: practique el control de distancia en putts largos.`);
  return recs;
}

/* Conversión simple de Markdown a HTML (títulos, listas, negrita y párrafos). */
function markdown(md) {
  const lineas = esc(md).split('\n');
  let html = '', lista = '';
  const cerrar = () => { if (lista) { html += `</${lista}>`; lista = ''; } };
  const enLinea = t => t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');
  lineas.forEach(l => {
    let m;
    if ((m = l.match(/^#{1,6}\s+(.*)/))) { cerrar(); html += `<h3>${enLinea(m[1])}</h3>`; }
    else if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (lista !== 'ul') { cerrar(); html += '<ul>'; lista = 'ul'; } html += `<li>${enLinea(m[1])}</li>`; }
    else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (lista !== 'ol') { cerrar(); html += '<ol>'; lista = 'ol'; } html += `<li>${enLinea(m[1])}</li>`; }
    else if (l.trim()) { cerrar(); html += `<p>${enLinea(l)}</p>`; }
    else cerrar();
  });
  cerrar();
  return html;
}

function renderAnalisis() {
  setHeader('Análisis');
  const rondas = vivos('rondas').sort((a, b) => -ordenarRondas(a, b));
  if (!rondas.length) {
    view.innerHTML = `<div class="card vacio-card"><h2>Todavía no hay rondas</h2><p>Cuando registre rondas, aquí verá su evolución por área, sus estadísticas y lo que debe mejorar.</p></div>`;
    return;
  }
  const tend = {};
  AREAS.forEach(a => { tend[a.k] = tendencia(rondas.map(r => numero(r.areas[a.k].nota))); });
  const ind = rondas.map(indicadores);
  const filasInd = [
    ['Fairways acertados', 'fairways', ' %', true], ['Greens en regulación', 'gir', ' %', true], ['Salidas de bunker al green', 'bunker', ' %', true],
    ['Up and down', 'upDown', ' %', true], ['Putts por hoyo', 'puttsHoyo', '', false], ['Tres putts por ronda', 'tresPutts', '', false]
  ].map(([l, k, u, mayor]) => ({ l, u, mayor, t: tendencia(ind.map(x => x[k])) })).filter(f => f.t.n);
  const decs = estadisticasDecisiones(rondas);
  const puntajes = tendencia(rondas.map(r => (puntaje(r) || {}).puntaje ?? null));
  const recs = recomendaciones(rondas, tend, decs);
  const ultimas = rondas.slice(-3).reverse();
  const analisisIA = vivos('analisis').sort((a, b) => (b.creado || '').localeCompare(a.creado || ''));

  view.innerHTML = `
    <section class="card">
      <h2>Resumen</h2>
      <div class="kpis">
        <div class="kpi"><span>Rondas</span><b>${rondas.length}</b></div>
        <div class="kpi"><span>Puntaje (últimas 5)</span><b>${puntajes.reciente !== null ? decimal(puntajes.reciente) : '—'}</b>${flecha(puntajes.dif)}</div>
      </div>
    </section>

    <section class="card">
      <h2>Evolución por área</h2>
      <p class="hint">Nota de 1 a 10 en cada ronda. Promedio de las últimas 5 rondas comparado con las 5 anteriores.</p>
      <div class="areas-grid">${AREAS.map(a => `
        <div class="area-mini">
          <div class="am-cab"><span>${esc(a.corto)}</span><b>${tend[a.k].reciente !== null ? decimal(tend[a.k].reciente) : '—'}</b></div>
          ${minilinea(rondas.slice(-15).map(r => numero(r.areas[a.k].nota)))}
          ${flecha(tend[a.k].dif)}
        </div>`).join('')}</div>
    </section>

    <section class="card">
      <h2>Recomendaciones</h2>
      ${recs.length ? `<ul class="lista recs">${recs.map(x => `<li>${x}</li>`).join('')}</ul>` : '<p class="hint">Registre más rondas, con notas y datos de cada área, para obtener recomendaciones.</p>'}
    </section>

    ${filasInd.length ? `<section class="card">
      <h2>Estadísticas</h2>
      <div class="tabla-cont"><table class="tabla"><thead><tr><th>Indicador</th><th>Últimas 5</th><th>5 anteriores</th><th>Tendencia</th></tr></thead><tbody>
        ${filasInd.map(f => `<tr><td>${f.l}</td><td>${f.t.reciente !== null ? decimal(f.t.reciente) + f.u : '—'}</td>
          <td>${f.t.anterior !== null ? decimal(f.t.anterior) + f.u : '—'}</td><td>${flecha(f.t.dif, f.mayor)}</td></tr>`).join('')}
      </tbody></table></div>
    </section>` : ''}

    <section class="card">
      <h2>Juego según las condiciones</h2>
      <p class="hint">Nota media del juego (1 a 10) y cantidad de rondas entre paréntesis.</p>
      <h3>Clima</h3>${barrasH(juegoPorCondicion(rondas, CLIMAS, 'clima'))}
      <h3>Cancha</h3>${barrasH(juegoPorCondicion(rondas, ESTADOS_CANCHA, 'cancha'))}
    </section>

    <section class="card">
      <h2>Decisiones de palo</h2>
      ${decs.length ? `<div class="tabla-cont"><table class="tabla"><thead><tr><th>Palo</th><th>Golpes</th><th>Decisión acertada</th><th>Buen resultado</th></tr></thead><tbody>
        ${decs.map(d => `<tr><td>${esc(d.palo)}</td><td>${d.n}</td><td>${d.conDecision ? pct(d.acertada, d.conDecision) + ' %' : '—'}</td>
          <td>${d.conResultado ? pct(d.bueno, d.conResultado) + ' %' : '—'}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="hint">Registre decisiones de palo en sus rondas para ver este análisis.</p>'}
    </section>

    <section class="card">
      <h2>Lo que anotó para mejorar</h2>
      <p class="hint">Últimas ${ultimas.length} rondas. Si un punto se repite, es una prioridad.</p>
      ${AREAS.map(a => {
        const xs = ultimas.filter(r => r.areas[a.k].mejorar).map(r => `<li><span class="fecha">${esc(fechaCorta(r.fecha))}</span> ${esc(r.areas[a.k].mejorar)}</li>`);
        return xs.length ? `<h3>${esc(a.nombre)}</h3><ul class="lista">${xs.join('')}</ul>` : '';
      }).join('') || '<p class="hint">Sin anotaciones.</p>'}
    </section>

    <section class="card">
      <h2>Análisis con Claude</h2>
      <p class="hint">Claude revisa todo su historial (notas, estadísticas, condiciones, decisiones y transcripciones) y redacta un informe con prioridades y ejercicios.${IA.configurada() ? '' : ' Requiere cargar la clave de API de Anthropic en Ajustes.'}</p>
      <button class="btn primary ia" id="b-ia">✦ Analizar mi historial</button>
      <div id="ia-res"></div>
      ${analisisIA.map(x => `<details class="analisis"><summary>${esc(new Date(x.creado).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))} · ${x.rondas} rondas</summary>
        <div class="md">${markdown(x.texto)}</div><button class="link peligro" data-borrar-an="${x.id}">Borrar este análisis</button></details>`).join('')}
    </section>`;

  view.querySelectorAll('[data-consejo]').forEach(b => (b.onclick = () => renderConsejo(b.dataset.consejo, renderAnalisis)));
  view.querySelectorAll('[data-borrar-an]').forEach(b => (b.onclick = () => {
    if (!confirm('¿Borrar este análisis?')) return;
    borrarRegistro('analisis', b.dataset.borrarAn); renderAnalisis();
  }));
  $('#b-ia').onclick = async () => {
    if (!IA.configurada()) { toast('Cargue la clave de API de Anthropic en Ajustes.', 4000); renderAjustes(); return; }
    const b = $('#b-ia');
    b.disabled = true; b.textContent = 'Analizando… (puede tardar un minuto)';
    try {
      const textoIA = await IA.analizarHistorial(rondas, vivos('consejos'));
      const x = guardarRegistro('analisis', { id: uid(), texto: textoIA, rondas: rondas.length, modelo: local.modeloIA });
      renderAnalisis();
      const d = view.querySelector('details.analisis');
      if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth' }); }
      return x;
    } catch (e) {
      toast(e.message, 8000);
      b.disabled = false; b.textContent = '✦ Analizar mi historial';
    }
  };
}
