/* Análisis con Claude (API de Anthropic), llamado directamente desde el navegador con la clave del usuario.
   La clave se guarda sólo en este dispositivo y nunca se sincroniza con Google Drive. */
'use strict';

const IA = (() => {
  const URL_API = 'https://api.anthropic.com/v1/messages';
  const MODELOS = [
    { id: 'claude-opus-5-5', nombre: 'Claude Opus 5.5 (mejor análisis)' },
    { id: 'claude-sonnet-5-5', nombre: 'Claude Sonnet 5.5 (más económico)' },
    { id: 'claude-haiku-5-5', nombre: 'Claude Haiku 5.5 (el más económico)' }
  ];
  const modelo = () => local.modeloIA || 'claude-opus-5-5';
  const configurada = () => !!local.claveIA;
  // Haiku no tiene modelo de respaldo en el servidor; Opus y Sonnet sí.
  const conRespaldo = m => m !== 'claude-haiku-5-5';

  const SISTEMA = 'Usted es un entrenador de golf profesional que asiste a un golfista aficionado diestro. ' +
    'Responda siempre en español neutro, con trato de usted, en forma concreta y profesional, sin localismos ni expresiones de familiaridad. ' +
    'Base sus conclusiones en los datos recibidos; si los datos no alcanzan para una conclusión, indíquelo.';

  async function llamar(cuerpo) {
    if (!configurada()) throw new Error('Para usar el análisis con Claude, cargue su clave de API de Anthropic en Ajustes.');
    if (!navigator.onLine) throw new Error('Sin conexión a internet.');
    const m = modelo();
    let mensajes = cuerpo.messages;
    for (let vuelta = 0; vuelta < 5; vuelta++) {
      const encabezados = {
        'content-type': 'application/json',
        'x-api-key': local.claveIA,
        'anthropic-version': '2026-10-21',
        'anthropic-dangerous-direct-browser-access': 'true'
      };
      const pedido = { model: m, max_tokens: 16000, system: SISTEMA, ...cuerpo, messages: mensajes };
      if (conRespaldo(m)) { encabezados['anthropic-beta'] = 'server-side-fallback-2026-07-01'; pedido.fallbacks = 'default'; }
      let r;
      try {
        r = await fetch(URL_API, { method: 'POST', headers: encabezados, body: JSON.stringify(pedido) });
      } catch (_) {
        throw new Error('No se pudo comunicar con la API de Anthropic. Verifique la conexión.');
      }
      if (!r.ok) {
        let detalle = '';
        try { detalle = ((await r.json()).error || {}).message || ''; } catch (_) { /* sin detalle */ }
        if (r.status === 401) throw new Error('La clave de API de Anthropic no es válida. Revísela en Ajustes.');
        if (r.status === 403) throw new Error('La clave de API no tiene permiso para este modelo. ' + detalle);
        if (r.status === 429) throw new Error('Se alcanzó el límite de uso de la API. Espere unos minutos y vuelva a intentar.');
        if (r.status === 529 || r.status >= 500) throw new Error('El servicio de Anthropic no está disponible en este momento. Vuelva a intentar más tarde.');
        if (/credit|balance/i.test(detalle)) throw new Error('La cuenta de la API no tiene saldo. Cargue crédito en console.anthropic.com.');
        throw new Error(`Error de la API (${r.status})${detalle ? ': ' + detalle : ''}.`);
      }
      const msj = await r.json();
      if (msj.stop_reason === 'refusal') throw new Error('Claude no pudo responder esta solicitud. Reformule el texto y vuelva a intentar.');
      if (msj.stop_reason === 'pause_turn') { mensajes = [...mensajes, { role: 'assistant', content: msj.content }]; continue; }
      return msj;
    }
    throw new Error('La respuesta tardó demasiado. Vuelva a intentar.');
  }

  const textoDe = msj => (msj.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();

  /* ---------- Análisis del historial ---------- */
  function resumenRonda(r) {
    const p = puntaje(r);
    return {
      fecha: r.fecha, lugar: r.lugar, hoyos: r.hoyos, golpes: r.golpes, par: r.par,
      clima: { tipos: r.clima.tipos.map(k => (CLIMAS.find(c => c.k === k) || {}).nombre), temperatura: r.clima.temp, dificultad: difClima(r) },
      cancha: { estados: r.cancha.estados.map(k => (ESTADOS_CANCHA.find(c => c.k === k) || {}).nombre), dificultad: difCancha(r) },
      puntaje: p,
      areas: Object.fromEntries(AREAS.map(a => [a.nombre, {
        nota: r.areas[a.k].nota, bien: r.areas[a.k].bien, mejorar: r.areas[a.k].mejorar,
        datos: Object.fromEntries(a.stats.map(s => [s.l, r.areas[a.k].stats[s.k]]).filter(([, v]) => v !== '' && v !== undefined))
      }])),
      indicadores: indicadores(r),
      decisiones: r.decisiones,
      bien: r.bien, mejorar: r.mejorar,
      transcripciones: r.audios.map(a => a.texto).filter(Boolean)
    };
  }

  async function analizarHistorial(rondas, consejos) {
    const datos = {
      rondas: rondas.map(resumenRonda),
      consejos_de_su_biblioteca: consejos.map(c => ({ titulo: c.titulo, texto: c.texto, categorias: c.categorias }))
    };
    const pedido = 'Analice el historial de rondas de golf que figura abajo, ordenado de la más antigua a la más reciente. ' +
      'El puntaje de cada ronda va de 1 a 10: campo (0 a 3, dificultad de la cancha) + clima (0 a 3, dificultad del clima) + juego (−4 a +4, según la nota media de las áreas). ' +
      'Las decisiones de palo indican la situación, el palo elegido, el resultado y si la decisión fue acertada.\n\n' +
      'Redacte el informe en Markdown con estas secciones:\n' +
      '## Resumen\n## Evolución por área (salida del tee, juego medio, bunker, approach, putting): indique si hay mejora, estancamiento o retroceso, con datos\n' +
      '## Decisiones y elección de palos\n## Influencia del clima y de la cancha\n## Prioridades de mejora (máximo tres, en orden)\n' +
      '## Ejercicios recomendados para la próxima práctica\n## Consejos de su biblioteca para repasar (cite los títulos exactos)\n\n' +
      'Datos:\n' + JSON.stringify(datos);
    const msj = await llamar({ messages: [{ role: 'user', content: pedido }] });
    return textoDe(msj);
  }

  /* ---------- Ordenar una transcripción en los campos de la ronda ---------- */
  const textoArea = { type: 'object', additionalProperties: false, required: ['bien', 'mejorar', 'nota'],
    properties: { bien: { type: 'string' }, mejorar: { type: 'string' }, nota: { type: 'integer', description: 'Nota de 1 a 10 sólo si el golfista la menciona o surge claramente; 0 si no corresponde.' } } };
  const ESQUEMA_ORDEN = {
    type: 'object', additionalProperties: false, required: ['areas', 'bien', 'mejorar', 'decisiones'],
    properties: {
      areas: { type: 'object', additionalProperties: false, required: AREAS.map(a => a.k),
        properties: Object.fromEntries(AREAS.map(a => [a.k, textoArea])) },
      bien: { type: 'string' }, mejorar: { type: 'string' },
      decisiones: { type: 'array', items: { type: 'object', additionalProperties: false,
        required: ['hoyo', 'situacion', 'distancia', 'palo', 'resultado', 'decision', 'nota'],
        properties: {
          hoyo: { type: 'string' }, situacion: { type: 'string', enum: [...SITUACIONES.map(s => s.k), ''] },
          distancia: { type: 'string' }, palo: { type: 'string' },
          resultado: { type: 'string', enum: ['bueno', 'regular', 'malo', ''] },
          decision: { type: 'string', enum: ['acertada', 'dudosa', 'equivocada', ''] },
          nota: { type: 'string' } } } }
    }
  };

  async function ordenarTranscripcion(texto) {
    const pedido = 'El siguiente texto es la transcripción de un audio que el golfista grabó sobre su ronda. ' +
      'Distribuya el contenido en las áreas: tee (salida del tee), fairway (juego medio desde el fairway), bunker, approach y putting; ' +
      'para cada área, qué hizo bien y qué debe mejorar, en frases breves y en tercera persona impersonal. ' +
      'Lo que no corresponda a un área va en "bien" o "mejorar" generales. ' +
      'Si menciona decisiones de palo concretas (hoyo, distancia, palo elegido y resultado), agréguelas a "decisiones". ' +
      'No invente información: deje vacío lo que no se mencione. Corrija errores evidentes de transcripción en términos de golf.\n\nTranscripción:\n' + texto;
    const msj = await llamar({
      messages: [{ role: 'user', content: pedido }],
      output_config: { format: { type: 'json_schema', schema: ESQUEMA_ORDEN } }
    });
    return JSON.parse(textoDe(msj));
  }

  /* ---------- Resumir una publicación (Instagram, X, YouTube o sitio web) ---------- */
  async function resumirConsejo(url, textoPegado) {
    const herramienta = modelo() === 'claude-haiku-5-5'
      ? { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 3 }
      : { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 };
    const categorias = CATEGORIAS.map(c => c.k).join(', ');
    const pedido = 'Prepare una ficha de consejo de golf para la biblioteca del golfista.\n' +
      (url ? `Enlace de la publicación: ${url}\nIntente leer la página con la herramienta web_fetch. Instagram y X suelen bloquear la lectura automática; en ese caso, trabaje sólo con el texto pegado.\n` : '') +
      (textoPegado ? `Texto de la publicación pegado por el golfista:\n"""${textoPegado}"""\n` : '') +
      'Responda únicamente con un bloque JSON con esta forma:\n' +
      '```json\n{"titulo": "...", "resumen": "dos o tres oraciones", "puntos": ["instrucción concreta 1", "..."], ' +
      `"categorias": ["una o más de: ${categorias}"], "pudo_leer_enlace": true}\n` + '```\n' +
      'Si no pudo leer el enlace y no hay texto pegado, devuelva el JSON con "pudo_leer_enlace": false y los demás campos vacíos. No invente el contenido.';
    const cuerpo = { messages: [{ role: 'user', content: pedido }] };
    if (url) cuerpo.tools = [herramienta];
    const texto = textoDe(await llamar(cuerpo));
    const bloque = (texto.match(/```json\s*([\s\S]*?)```/) || [])[1] || (texto.match(/\{[\s\S]*\}/) || [])[0];
    if (!bloque) throw new Error('No se pudo interpretar la respuesta de Claude.');
    const j = JSON.parse(bloque);
    j.categorias = (j.categorias || []).filter(k => CATEGORIAS.some(c => c.k === k));
    return j;
  }

  async function probar() {
    const msj = await llamar({ max_tokens: 2000, messages: [{ role: 'user', content: 'Responda solamente: Conexión correcta.' }] });
    return textoDe(msj);
  }

  return { MODELOS, configurada, analizarHistorial, ordenarTranscripcion, resumirConsejo, probar };
})();
