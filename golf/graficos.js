/* Gráficos en SVG: puntaje por ronda (barras por variable) y evolución de notas por área. */
'use strict';

const fechaCorta = f => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : '');

/* Barras por ronda: campo y clima suman hacia arriba; el juego suma (arriba) o resta (debajo de cero).
   La marca negra indica la suma; el número arriba es el puntaje final (1 a 10). */
function graficoPuntajes(rondas, anchoDisponible) {
  const datos = rondas.map(r => ({ r, p: puntaje(r) })).filter(x => x.p);
  if (!datos.length) return '<p class="hint">Cargue notas de juego en una ronda para ver el gráfico.</p>';
  const izq = 30, der = 10, arriba = 22, abajo = 30, alto = 250;
  const paso = Math.max(34, Math.min(64, (anchoDisponible - izq - der) / datos.length));
  const barra = Math.min(28, paso * 0.6);
  const ancho = Math.max(anchoDisponible, izq + der + paso * datos.length);
  const yMin = -4, yMax = 10;
  const y = v => arriba + (yMax - v) / (yMax - yMin) * (alto - arriba - abajo);
  let s = `<svg class="grafico" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Puntaje por ronda">`;
  for (let v = yMin; v <= yMax; v += 2) {
    s += `<line x1="${izq}" x2="${ancho - der}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? 'var(--axis)' : 'var(--grid)'}" stroke-width="1"/>`;
    s += `<text x="${izq - 6}" y="${y(v) + 4}" text-anchor="end" class="eje">${v}</text>`;
  }
  const seg = (x, v0, v1, color) => {
    const a = y(Math.max(v0, v1)), b = y(Math.min(v0, v1));
    const h = Math.max(0, b - a - 2);
    return h > 0 ? `<rect x="${x}" y="${a + 1}" width="${barra}" height="${h}" rx="3" fill="var(${color})"/>` : '';
  };
  datos.forEach(({ r, p }, i) => {
    const x = izq + paso * i + (paso - barra) / 2;
    let base = 0;
    s += seg(x, base, base + p.campo, '--s-campo'); base += p.campo;
    s += seg(x, base, base + p.clima, '--s-clima'); base += p.clima;
    if (p.juego >= 0) { s += seg(x, base, base + p.juego, '--s-juego'); base += p.juego; }
    else s += seg(x, 0, p.juego, '--s-juego');
    const ys = y(Math.max(yMin, Math.min(yMax, p.suma)));
    s += `<line x1="${x - 3}" x2="${x + barra + 3}" y1="${ys}" y2="${ys}" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/>`;
    s += `<text x="${x + barra / 2}" y="${y(Math.max(base, p.suma, 0)) - 7}" text-anchor="middle" class="valor">${decimal(p.puntaje)}</text>`;
    s += `<text x="${x + barra / 2}" y="${alto - 10}" text-anchor="middle" class="eje">${fechaCorta(r.fecha)}</text>`;
    s += `<rect class="zona" data-id="${r.id}" x="${izq + paso * i}" y="${arriba - 18}" width="${paso}" height="${alto - arriba}" fill="transparent"/>`;
  });
  return s + '</svg>';
}

function leyendaPuntajes() {
  return `<div class="leyenda">
    <span><i style="background:var(--s-campo)"></i>Campo (0 a 3)</span>
    <span><i style="background:var(--s-clima)"></i>Clima (0 a 3)</span>
    <span><i style="background:var(--s-juego)"></i>Juego (−4 a +4)</span>
    <span><i class="marca"></i>Suma</span>
  </div>`;
}

function detallePuntaje(r) {
  const p = puntaje(r);
  if (!p) return 'Sin notas de juego';
  return `<b>${esc(fmtFecha(r.fecha))}</b> · ${esc(r.lugar || '')}<br>
    Campo ${firmar(p.campo)} · Clima ${firmar(p.clima)} · Juego ${firmar(p.juego)}<br>
    Puntaje: <b>${decimal(p.puntaje)}</b>`;
}

/* Conecta la ayuda emergente: al pasar el cursor o tocar una barra se ve el detalle y el enlace a la ronda. */
function conectarGraficoPuntajes(cont, rondas, abrir) {
  const tip = cont.querySelector('.tooltip');
  const mostrar = (zona, fijo) => {
    const r = rondas.find(x => x.id === zona.dataset.id);
    if (!r) return;
    tip.innerHTML = detallePuntaje(r) + (fijo ? `<br><button class="link" data-abrir="${r.id}">Abrir ronda</button>` : '');
    tip.hidden = false;
    const zr = zona.getBoundingClientRect(), cr = cont.getBoundingClientRect();
    const izq = Math.min(Math.max(4, zr.left - cr.left + zr.width / 2 - 100), cr.width - 204);
    tip.style.left = izq + 'px';
    tip.style.top = '8px';
    const b = tip.querySelector('[data-abrir]');
    if (b) b.onclick = () => abrir(b.dataset.abrir);
  };
  cont.querySelectorAll('.zona').forEach(z => {
    z.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') mostrar(z, false); });
    z.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') tip.hidden = true; });
    z.addEventListener('click', () => mostrar(z, true));
  });
}

/* Línea pequeña de notas (1 a 10) de un área a lo largo de las rondas. */
function minilinea(valores) {
  const pts = valores.map((v, i) => ({ v, i })).filter(p => p.v !== null);
  if (pts.length < 2) return '<div class="mini-vacio">Faltan rondas</div>';
  const W = 160, H = 44, m = 5;
  const x = i => m + (W - 2 * m) * (valores.length === 1 ? 0.5 : i / (valores.length - 1));
  const y = v => m + (10 - v) / 9 * (H - 2 * m);
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const u = pts[pts.length - 1];
  return `<svg class="mini" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <line x1="0" x2="${W}" y1="${y(5.5)}" y2="${y(5.5)}" stroke="var(--grid)" vector-effect="non-scaling-stroke"/>
    <path d="${d}" fill="none" stroke="var(--s-juego)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${x(u.i)}" cy="${y(u.v)}" r="3" fill="var(--s-juego)" stroke="var(--surface)" stroke-width="2"/>
  </svg>`;
}

/* Barras horizontales simples (una sola variable) para comparar promedios. */
function barrasH(filas, max = 10) {
  if (!filas.length) return '<p class="hint">Sin datos suficientes.</p>';
  return `<div class="barras-h">${filas.map(f => `
    <div class="bh-fila"><span class="bh-et">${esc(f.etiqueta)}</span>
      <span class="bh-pista"><span class="bh-barra" style="width:${Math.max(2, Math.min(100, f.valor / max * 100))}%"></span></span>
      <span class="bh-val">${esc(f.texto)}</span></div>`).join('')}</div>`;
}
