/* Puntaje de cada ronda (1 a 10).
   - Campo: 0 a 3 según la dificultad del estado de la cancha (condiciones duras suman mérito).
   - Clima: 0 a 3 según la dificultad del clima y la temperatura.
   - Juego: −4 a +4 según el promedio de las notas de las áreas (nota 5,5 = 0; 10 = +4; 1 = −4).
   Puntaje = campo + clima + juego, limitado a 1–10. */
'use strict';

const AREAS = [
  { k: 'tee', nombre: 'Salida del tee', corto: 'Tee', stats: [
    { k: 'fw', l: 'Fairways acertados' }, { k: 'fwTot', l: 'Salidas en par 4 y 5' },
    { k: 'izq', l: 'Fallos a la izquierda' }, { k: 'der', l: 'Fallos a la derecha' }] },
  { k: 'fairway', nombre: 'Juego medio desde el fairway', corto: 'Juego medio', stats: [
    { k: 'gir', l: 'Greens en regulación' }, { k: 'girTot', l: 'Hoyos jugados' }] },
  { k: 'bunker', nombre: 'Salidas de bunker', corto: 'Bunker', stats: [
    { k: 'ok', l: 'Salidas al green' }, { k: 'tot', l: 'Bunkers jugados' }] },
  { k: 'approach', nombre: 'Approach', corto: 'Approach', stats: [
    { k: 'ok', l: 'Up and down logrados' }, { k: 'tot', l: 'Oportunidades' }] },
  { k: 'putting', nombre: 'Putting', corto: 'Putting', stats: [
    { k: 'putts', l: 'Putts totales' }, { k: 'tres', l: 'Tres putts' }] }
];

const CLIMAS = [
  { k: 'templado', nombre: 'Templado', dif: 0 },
  { k: 'caluroso', nombre: 'Caluroso', dif: 1 },
  { k: 'frio', nombre: 'Frío', dif: 1 },
  { k: 'ventoso', nombre: 'Ventoso', dif: 1.5 }
];
const ESTADOS_CANCHA = [
  { k: 'excelente', nombre: 'Excelente', dif: 0 },
  { k: 'buena', nombre: 'Buena', dif: 0.5 },
  { k: 'seca', nombre: 'Seca', dif: 0.5 },
  { k: 'dura', nombre: 'Dura', dif: 1 },
  { k: 'mojada', nombre: 'Mojada', dif: 1.5 },
  { k: 'bunkers', nombre: 'Bunkers desastrosos', dif: 1.5 }
];

const medio = v => Math.round(v * 2) / 2;
const acotar = (v, a, b) => Math.min(b, Math.max(a, v));
const numero = v => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));

function difClimaAuto(c) {
  let d = (c.tipos || []).reduce((s, k) => s + ((CLIMAS.find(x => x.k === k) || {}).dif || 0), 0);
  const t = numero(c.temp);
  if (t !== null) {
    if (t < 5 || t > 35) d += 1;
    else if (t < 10 || t > 30) d += 0.5;
  }
  return acotar(medio(d), 0, 3);
}
function difCanchaAuto(c) {
  const d = (c.estados || []).reduce((s, k) => s + ((ESTADOS_CANCHA.find(x => x.k === k) || {}).dif || 0), 0);
  return acotar(medio(d), 0, 3);
}
const difClima = r => (numero(r.clima.manual) !== null ? acotar(numero(r.clima.manual), 0, 3) : difClimaAuto(r.clima));
const difCancha = r => (numero(r.cancha.manual) !== null ? acotar(numero(r.cancha.manual), 0, 3) : difCanchaAuto(r.cancha));

function promedioJuego(r) {
  const notas = AREAS.map(a => numero(r.areas[a.k] && r.areas[a.k].nota)).filter(n => n !== null);
  return notas.length ? notas.reduce((s, n) => s + n, 0) / notas.length : null;
}

/* Devuelve { campo, clima, juego, suma, puntaje, promedio } o null si la ronda no tiene notas de juego. */
function puntaje(r) {
  const prom = promedioJuego(r);
  if (prom === null) return null;
  const campo = difCancha(r), clima = difClima(r);
  const juego = Math.round(((prom - 5.5) * 8 / 9) * 10) / 10;
  const suma = Math.round((campo + clima + juego) * 10) / 10;
  return { campo, clima, juego, suma, puntaje: Math.round(acotar(suma, 1, 10) * 10) / 10, promedio: prom };
}

const textoDificultad = d => (d === 0 ? 'Sin dificultad' : d <= 1 ? 'Dificultad baja' : d <= 2 ? 'Dificultad media' : 'Dificultad alta');
const firmar = v => (v > 0 ? '+' : v < 0 ? '−' : '') + String(Math.abs(v)).replace('.', ',');
const decimal = v => String(v).replace('.', ',');

/* Indicadores de cada área (porcentajes o promedios) a partir de los datos cargados. */
function indicadores(r) {
  const s = k => (r.areas[k] && r.areas[k].stats) || {};
  const pct = (a, b) => { const x = numero(a), y = numero(b); return x !== null && y ? Math.round(x / y * 100) : null; };
  const hoyos = numero(r.hoyos) || 18;
  const putts = numero(s('putting').putts);
  return {
    fairways: pct(s('tee').fw, s('tee').fwTot),
    gir: pct(s('fairway').gir, s('fairway').girTot || hoyos),
    bunker: pct(s('bunker').ok, s('bunker').tot),
    upDown: pct(s('approach').ok, s('approach').tot),
    puttsHoyo: putts !== null ? Math.round(putts / hoyos * 100) / 100 : null,
    tresPutts: numero(s('putting').tres)
  };
}

/* Decisiones de palo */
const SITUACIONES = [
  { k: 'salida', nombre: 'Salida' }, { k: 'fairway', nombre: 'Fairway' }, { k: 'rough', nombre: 'Rough' },
  { k: 'bunker', nombre: 'Bunker' }, { k: 'approach', nombre: 'Approach' }, { k: 'green', nombre: 'Green' }
];
const PALOS = ['Driver', 'Madera 3', 'Madera 5', 'Híbrido', 'Hierro 3', 'Hierro 4', 'Hierro 5', 'Hierro 6', 'Hierro 7',
  'Hierro 8', 'Hierro 9', 'PW', 'GW', 'SW', 'LW', 'Putter'];
const RESULTADOS = [{ k: 'bueno', nombre: 'Bueno' }, { k: 'regular', nombre: 'Regular' }, { k: 'malo', nombre: 'Malo' }];
const DECISIONES = [{ k: 'acertada', nombre: 'Acertada' }, { k: 'dudosa', nombre: 'Dudosa' }, { k: 'equivocada', nombre: 'Equivocada' }];
