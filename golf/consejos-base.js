/* Biblioteca inicial de consejos y diagramas.
   Los consejos base tienen un id fijo para que no se dupliquen al sincronizar entre dispositivos. */
'use strict';

const CATEGORIAS = [
  { k: 'preparacion', nombre: 'Preparación' },
  { k: 'swing', nombre: 'Swing' },
  { k: 'tee', nombre: 'Salida del tee' },
  { k: 'fairway', nombre: 'Juego medio' },
  { k: 'bunker', nombre: 'Bunker' },
  { k: 'approach', nombre: 'Approach' },
  { k: 'putting', nombre: 'Putting' },
  { k: 'estrategia', nombre: 'Estrategia y decisiones' }
];

/* Diagramas en SVG. Usan las variables de color de la hoja de estilos (modo claro y oscuro). */
const DIAGRAMAS = {
  posicionBola: {
    titulo: 'Posición de la bola según el palo (golfista diestro, vista desde arriba)',
    svg: `<svg viewBox="0 0 320 210" role="img" aria-label="Posición de la bola respecto de los pies según el palo">
      <line x1="20" y1="60" x2="300" y2="60" stroke="var(--grid)" stroke-dasharray="4 4"/>
      <text x="300" y="52" text-anchor="end" font-size="11" fill="var(--muted)">Línea de objetivo →</text>
      <rect x="40" y="118" width="34" height="68" rx="14" fill="var(--surface-2)" stroke="var(--ink-2)"/>
      <rect x="246" y="118" width="34" height="68" rx="14" fill="var(--surface-2)" stroke="var(--ink-2)"/>
      <text x="57" y="204" text-anchor="middle" font-size="11" fill="var(--muted)">Pie derecho</text>
      <text x="263" y="204" text-anchor="middle" font-size="11" fill="var(--muted)">Pie izquierdo</text>
      <g font-size="11" fill="var(--ink)">
        <circle cx="160" cy="92" r="7" fill="#fff" stroke="var(--ink)"/><text x="160" y="80" text-anchor="middle">Wedges</text>
        <circle cx="190" cy="104" r="7" fill="#fff" stroke="var(--ink)"/><text x="190" y="126" text-anchor="middle">Hierros medios</text>
        <circle cx="218" cy="92" r="7" fill="#fff" stroke="var(--ink)"/><text x="218" y="80" text-anchor="middle">Híbridos/maderas</text>
        <circle cx="244" cy="104" r="7" fill="#fff" stroke="var(--ink)"/><text x="244" y="148" text-anchor="end" transform="translate(-6 0)">Driver</text>
      </g>
      <text x="160" y="24" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)">Cuanto más largo el palo, más hacia el pie izquierdo</text>
    </svg>`
  },
  pesoIzquierda: {
    titulo: 'Distribución del peso en bunker y approach con wedges',
    svg: `<svg viewBox="0 0 320 170" role="img" aria-label="75 por ciento del peso en la pierna izquierda">
      <text x="160" y="22" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)">Peso adelantado: 75 % en la pierna izquierda</text>
      <rect x="70" y="128" width="60" height="12" rx="4" fill="var(--surface-2)"/>
      <rect x="70" y="${128 - 25}" width="60" height="25" rx="4" fill="var(--s-campo)"/>
      <rect x="190" y="128" width="60" height="12" rx="4" fill="var(--surface-2)"/>
      <rect x="190" y="${128 - 75}" width="60" height="75" rx="4" fill="var(--s-juego)"/>
      <text x="100" y="96" text-anchor="middle" font-size="16" font-weight="700" fill="var(--ink)">25 %</text>
      <text x="220" y="46" text-anchor="middle" font-size="16" font-weight="700" fill="var(--ink)">75 %</text>
      <text x="100" y="160" text-anchor="middle" font-size="11" fill="var(--muted)">Pierna derecha</text>
      <text x="220" y="160" text-anchor="middle" font-size="11" fill="var(--muted)">Pierna izquierda</text>
    </svg>`
  },
  swingAbajoArriba: {
    titulo: 'Swing de abajo hacia arriba y final sobre el hombro izquierdo',
    svg: `<svg viewBox="0 0 320 190" role="img" aria-label="Recorrido del palo de abajo hacia arriba con final alto">
      <line x1="20" y1="160" x2="300" y2="160" stroke="var(--grid)"/>
      <path d="M50 60 Q 120 175 160 158 T 270 40" fill="none" stroke="var(--s-juego)" stroke-width="3" stroke-linecap="round"/>
      <polygon points="270,40 258,46 266,54" fill="var(--s-juego)"/>
      <circle cx="160" cy="152" r="6" fill="#fff" stroke="var(--ink)"/>
      <text x="50" y="48" text-anchor="middle" font-size="11" fill="var(--muted)">Subida</text>
      <text x="160" y="182" text-anchor="middle" font-size="11" fill="var(--muted)">Impacto: el palo sigue subiendo</text>
      <text x="272" y="28" text-anchor="middle" font-size="11" fill="var(--ink)">Final sobre el hombro izquierdo</text>
    </svg>`
  },
  secuencia: {
    titulo: 'Secuencia de la bajada: las caderas llevan el torso',
    svg: `<svg viewBox="0 0 320 120" role="img" aria-label="Secuencia caderas, torso, brazos, palo">
      ${['Caderas', 'Torso', 'Brazos', 'Palo'].map((t, i) => `
        <rect x="${10 + i * 78}" y="40" width="66" height="40" rx="8" fill="var(--surface-2)" stroke="var(--ink-2)"/>
        <text x="${43 + i * 78}" y="65" text-anchor="middle" font-size="12" fill="var(--ink)">${i + 1}. ${t}</text>
        ${i < 3 ? `<polygon points="${78 + i * 78},56 ${86 + i * 78},60 ${78 + i * 78},64" fill="var(--ink-2)"/>` : ''}`).join('')}
      <text x="160" y="24" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)">Desenroscar desde abajo hacia arriba</text>
      <text x="160" y="104" text-anchor="middle" font-size="11" fill="var(--muted)">Las caderas inician; los brazos y el palo llegan últimos</text>
    </svg>`
  }
};

const FECHA_BASE = '2026-11-22T00:00:00.000Z';
const CONSEJOS_BASE = [
  { id: 'base-01', titulo: 'Codos pegados a las caderas antes del swing', categorias: ['preparacion', 'swing'],
    texto: 'En la preparación, acercar los codos al cuerpo, a la altura de las caderas. Mantiene los brazos conectados al torso y hace más repetible el swing.' },
  { id: 'base-02', titulo: 'Bajar los hombros en cada golpe', categorias: ['preparacion', 'swing'],
    texto: 'Relajar y bajar los hombros antes de iniciar el swing. Los hombros tensos y altos acortan el giro y generan golpes bajos o con efecto.' },
  { id: 'base-03', titulo: 'En la arena, mirar el punto de impacto y no la bola', categorias: ['bunker'],
    texto: 'En el bunker, fijar la vista en la arena unos centímetros detrás de la bola (el punto donde debe entrar el palo), no en la bola. El palo golpea la arena y la arena saca la bola.' },
  { id: 'base-04', titulo: 'Pasar los brazos en cada golpe', categorias: ['swing'],
    texto: 'Después del impacto, dejar que los brazos pasen y se extiendan hacia el objetivo. No frenar los brazos al llegar a la bola.' },
  { id: 'base-05', titulo: 'Golpear de abajo hacia arriba y terminar sobre el hombro izquierdo', categorias: ['swing', 'tee', 'fairway'],
    texto: 'El recorrido del palo continúa hacia arriba después del impacto. Terminar siempre el swing con las manos por encima del hombro izquierdo, en equilibrio.', diagrama: 'swingAbajoArriba' },
  { id: 'base-06', titulo: 'No arriesgar sin conocer las opciones', categorias: ['estrategia'],
    texto: 'Antes de cada golpe comprometido: enumerar las opciones (atacar, jugar seguro, salir de costado), estimar el resultado posible de cada una y elegir la de menor riesgo para el puntaje del hoyo.' },
  { id: 'base-07', titulo: 'Ubicación de la bola respecto de los pies según el palo', categorias: ['preparacion'],
    texto: 'Wedges: bola en el centro. Hierros medios: levemente adelantada del centro. Híbridos y maderas: más hacia el pie izquierdo. Driver: a la altura del talón izquierdo. Cuanto más largo el palo, más lejos del cuerpo.', diagrama: 'posicionBola' },
  { id: 'base-08', titulo: '75 % del peso en la pierna izquierda en bunker y approach con wedges', categorias: ['bunker', 'approach'],
    texto: 'En la arena y en los approach con wedges, cargar el 75 % del peso en la pierna izquierda desde la preparación y mantenerlo durante todo el golpe.', diagrama: 'pesoIzquierda' },
  { id: 'base-09', titulo: 'Las caderas llevan el torso y desenroscan', categorias: ['swing'],
    texto: 'En la bajada, iniciar con la rotación de las caderas: las caderas llevan al torso, el torso a los brazos y los brazos al palo. Desenroscar en ese orden.', diagrama: 'secuencia' },
  { id: 'base-10', titulo: 'Grip medio a fuerte según el palo', categorias: ['preparacion'],
    texto: 'Usar un grip medio a fuerte (manos levemente giradas hacia la derecha) adecuado a cada palo. Revisar el grip en la preparación de cada golpe.' }
].map(c => ({ ...c, fuente: '', resumen: '', imagenes: [], favorito: false, enFoco: false, base: true, creado: FECHA_BASE, actualizado: FECHA_BASE }));
