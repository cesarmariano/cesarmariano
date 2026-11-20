/* Finanzas familiares – ahorro: inversiones, fondo de emergencia y sugerencias para el dinero disponible. */
'use strict';

const PERFILES = {
  conservador: { nombre: 'Conservador', reparto: [['pf', 70], ['money', 20], ['dolares', 10]] },
  moderado: { nombre: 'Moderado', reparto: [['pf', 45], ['cedears', 30], ['bonos', 15], ['acciones', 10]] },
  agresivo: { nombre: 'Agresivo', reparto: [['pf', 20], ['cedears', 45], ['acciones', 25], ['bonos', 10]] }
};

/* Sugerencias a partir del remanente disponible, el fondo de emergencia y los parámetros cargados en Ajustes.
   Devuelve una lista de { titulo, texto, monto, tipo, nivel }. Son orientativas: no reemplazan a un asesor financiero. */
function sugerencias() {
  const c = db.config, out = [];
  const r = remanente(mesActual());
  const gasto = gastoPromedio(3);
  const activas = vigentes('inversiones').filter(inversionActiva);
  const liquidas = activas.filter(v => ['inmediata', 'corta'].includes(tipoInversion(v.tipo).liquidez)).reduce((s, v) => s + valorActualPesos(v), 0);
  const objetivoEmergencia = gasto * num(c.mesesEmergencia);
  const faltaEmergencia = Math.max(0, objetivoEmergencia - liquidas);
  const tem = num(c.tnaPlazoFijo) * 30 / 365;            // tasa efectiva aproximada de 30 días
  const inflacion = num(c.inflacionMensual);
  const tasaMM = num(c.tnaMoneyMarket) * 30 / 365;

  if (!r) {
    out.push({ nivel: 'info', titulo: 'Cargue el saldo del banco', texto: 'En la pantalla del mes, cargue el saldo actual de la cuenta. Con ese dato se calcula cuánto puede ahorrarse sin quedarse corto para los pagos del mes.' });
    return { r, out, gasto, liquidas, objetivoEmergencia, faltaEmergencia };
  }
  let disponible = r.disponible;
  if (disponible <= 0) {
    out.push({ nivel: 'late', titulo: 'Por ahora, no retirar dinero del banco',
      texto: `Con los pagos previstos, el saldo bajaría a ${$$(r.minimo)} el ${fmtFecha(r.fechaMinimo)}. Conviene esperar a los próximos cobros.` +
        (totalesMes(mesActual()).resultado < 0 ? ' Este mes los egresos superan a los ingresos: revise en "Gastos por cuenta" dónde se concentra el gasto.' : '') });
    return { r, out, gasto, liquidas, objetivoEmergencia, faltaEmergencia };
  }
  const minimo = num(c.montoMinimo);
  if (minimo && disponible < minimo) {
    out.push({ nivel: 'info', tipo: 'money', monto: disponible, titulo: 'Acumular antes de invertir',
      texto: `El disponible (${$$(disponible)}) es menor al monto mínimo que definió para invertir (${$$(minimo)}). Conviene dejarlo en una cuenta remunerada o un fondo money market, que rinden por día y se pueden retirar en cualquier momento, hasta juntar un monto mayor.` +
        (tasaMM ? ` Rendimiento estimado en 30 días: ${$$(disponible * tasaMM / 100)}.` : '') });
    return { r, out, gasto, liquidas, objetivoEmergencia, faltaEmergencia };
  }
  // 1. Fondo de emergencia.
  if (faltaEmergencia > 0 && gasto > 0) {
    const m = Math.min(disponible, faltaEmergencia);
    out.push({ nivel: 'warn', tipo: 'money', monto: m, titulo: 'Completar el fondo de emergencia',
      texto: `Objetivo: ${num(c.mesesEmergencia)} meses de gastos (${$$(objetivoEmergencia)}). Hoy tiene ${$$(liquidas)} en inversiones de rápida disponibilidad; faltan ${$$(faltaEmergencia)}. ` +
        'Este dinero debe poder usarse en cualquier momento: cuenta remunerada o fondo money market.' });
    disponible -= m;
  }
  if (disponible <= 0) return { r, out, gasto, liquidas, objetivoEmergencia, faltaEmergencia };

  // 2. Plazo fijo frente a la inflación esperada.
  if (tem && inflacion) {
    const dif = tem - inflacion;
    out.push(dif >= 0
      ? { nivel: 'ok', titulo: 'El plazo fijo le gana a la inflación esperada', texto: `Tasa de 30 días: ${pct(tem)} frente a una inflación mensual estimada de ${pct(inflacion)}. El plazo fijo tradicional es una opción razonable para el dinero que no se necesita en el mes.` }
      : { nivel: 'warn', titulo: 'El plazo fijo rinde menos que la inflación esperada', texto: `Tasa de 30 días: ${pct(tem)} frente a una inflación mensual estimada de ${pct(inflacion)}. Para plazos más largos conviene un plazo fijo UVA o bonos ajustados por CER, que siguen a la inflación.` });
  } else {
    out.push({ nivel: 'info', titulo: 'Cargue las tasas vigentes', texto: 'En Ajustes → Ahorro e inversiones, cargue la tasa del plazo fijo, la de la cuenta remunerada y la inflación mensual esperada para comparar las opciones.' });
  }

  // 3. Reparto según el perfil elegido.
  const perfil = PERFILES[c.perfil] || PERFILES.moderado;
  const minimoBolsa = num(c.montoMinimoBolsa);
  const pfMejor = tem && inflacion && tem < inflacion ? 'pfuva' : 'pf';
  const reparto = perfil.reparto.map(([tipo, p]) => ({ tipo: tipo === 'pf' ? pfMejor : tipo, monto: disponible * p / 100, p }));
  // Montos chicos para la bolsa: se suman a la parte de renta fija hasta que alcancen el mínimo.
  let acumular = 0;
  reparto.forEach(x => { if (['cedears', 'acciones', 'bonos'].includes(x.tipo) && minimoBolsa && x.monto < minimoBolsa) { acumular += x.monto; x.monto = 0; } });
  const base = reparto.find(x => x.tipo === pfMejor);
  if (base) base.monto += acumular;
  for (const x of reparto.filter(z => z.monto > 0)) {
    const t = tipoInversion(x.tipo);
    let texto = DESCRIPCION_TIPO[x.tipo] || '';
    if ((x.tipo === 'pf') && num(c.tnaPlazoFijo)) texto += ` Interés estimado a 30 días: ${$$(x.monto * num(c.tnaPlazoFijo) / 100 * 30 / 365)}.`;
    out.push({ nivel: 'ok', tipo: x.tipo, monto: x.monto, titulo: `${t.nombre}: ${$$(x.monto)}`, texto });
  }
  if (acumular > 0) out.push({ nivel: 'info', titulo: 'Montos chicos para la bolsa', texto: `Las partes para acciones, CEDEARs o bonos eran menores a ${$$(minimoBolsa)}: se sumaron a la renta fija. Cuando el ahorro acumulado sea mayor, conviene incorporarlas para que las comisiones no pesen.` });

  // 4. Concentración de la cartera.
  const total = activas.reduce((s, v) => s + valorActualPesos(v), 0);
  if (total > 0) {
    const porTipo = {};
    activas.forEach(v => (porTipo[v.tipo] = (porTipo[v.tipo] || 0) + valorActualPesos(v)));
    const [mayor, val] = Object.entries(porTipo).sort((a, b) => b[1] - a[1])[0];
    if (val / total > 0.6 && activas.length > 1) out.push({ nivel: 'info', titulo: 'Cartera concentrada', texto: `El ${pct(val / total * 100)} de lo invertido está en ${tipoInversion(mayor).nombre}. Repartir entre distintos instrumentos reduce el riesgo.` });
  }
  return { r, out, gasto, liquidas, objetivoEmergencia, faltaEmergencia, perfil };
}

const DESCRIPCION_TIPO = {
  money: 'Rinde por día y el dinero se puede retirar en cualquier momento. Ideal para el fondo de emergencia y para juntar un monto mayor.',
  pf: 'Tasa fija conocida de antemano; el dinero queda inmovilizado hasta el vencimiento (30 días o más). Bajo riesgo.',
  pfuva: 'El capital se ajusta por inflación (UVA) más una tasa. Requiere un plazo mínimo más largo que el tradicional; consulte el vigente en su banco.',
  dolares: 'Protege frente a una devaluación del peso. No genera rendimiento si quedan en la cuenta.',
  bonos: 'Bonos ajustados por CER u obligaciones negociables en dólares: renta fija con algo más de rendimiento y riesgo que el plazo fijo.',
  cedears: 'Certificados de acciones del exterior que se compran en pesos y siguen al dólar. Riesgo de mercado: conviene un horizonte de al menos 2 a 3 años.',
  acciones: 'Acciones de empresas argentinas: mayor potencial y mayor volatilidad. Sólo con dinero que no se necesite por varios años.'
};

/* ---------- Pantalla de ahorro ---------- */
function renderAhorro() {
  seccion = 'ahorro';
  setHeader('Ahorro e inversiones');
  const s = sugerencias();
  const activas = vigentes('inversiones').filter(inversionActiva).sort((a, b) => (a.vencimiento || '9999').localeCompare(b.vencimiento || '9999'));
  const cerradas = vigentes('inversiones').filter(v => !inversionActiva(v)).sort((a, b) => (b.rescate || b.vencimiento || '').localeCompare(a.rescate || a.vencimiento || '')).slice(0, 10);
  const total = activas.reduce((t, v) => t + valorActualPesos(v), 0);
  const porTipo = {};
  activas.forEach(v => { const n = tipoInversion(v.tipo).nombre; porTipo[n] = (porTipo[n] || 0) + valorActualPesos(v); });
  const avance = s.objetivoEmergencia ? Math.min(100, s.liquidas / s.objetivoEmergencia * 100) : 0;
  const filaInv = v => {
    const t = tipoInversion(v.tipo);
    const vence = t.vence && v.vencimiento ? (v.vencimiento < hoy() ? 'venció el ' : 'vence el ') + fmtFecha(v.vencimiento) : 'desde el ' + fmtFecha(v.fecha);
    return `<button class="doc-item" data-inv="${esc(v.id)}">
      <div class="info"><div class="name">${esc(v.descripcion || t.nombre)}</div><div class="sub">${esc(t.nombre)} · ${vence}</div></div>
      <div class="importe"><b>${esc(monto(valorActual(v), v.moneda, false))}</b>${v.tna ? pill('TNA ' + pct(num(v.tna)), 'neutral') : ''}</div></button>`;
  };
  view.innerHTML = `
    <div class="card banco">
      <h2>Disponible para ahorrar hoy</h2>
      ${s.r ? `<div class="remanente ${s.r.disponible > 0 ? '' : 'neg'}"><small>${s.r.disponible > 0 ? 'Puede retirar del banco' : 'Sin excedente'}</small>
        <b>${$$(s.r.disponible > 0 ? s.r.disponible : s.r.deficit)}</b>
        <span>Saldo de hoy ${$$(s.r.saldoHoy)} · menor saldo previsto ${$$(s.r.minimo)} el ${fmtFecha(s.r.fechaMinimo)} · reserva ${$$(s.r.reserva)}</span></div>`
        : '<p class="hint">Falta el saldo del banco del mes actual.</p>'}
    </div>

    <div class="card">
      <h2>Fondo de emergencia</h2>
      ${s.gasto ? `<div class="barra-pista grande"><span style="width:${Math.max(2, avance)}%"></span></div>
        <p class="hint" style="margin:8px 0 0">${$$(s.liquidas)} de ${$$(s.objetivoEmergencia)} (${num(db.config.mesesEmergencia)} meses de un gasto promedio de ${$$(s.gasto)}). ${s.faltaEmergencia > 0 ? 'Faltan ' + $$(s.faltaEmergencia) + '.' : 'Completo.'}</p>`
        : '<p class="hint">Se calcula cuando haya gastos cargados.</p>'}
    </div>

    <div class="seccion-titulo"><h2>Sugerencias</h2><span class="hint">Perfil ${esc((PERFILES[db.config.perfil] || PERFILES.moderado).nombre.toLowerCase())}</span></div>
    ${s.out.map(x => `<div class="card sugerencia ${x.nivel}">
        <div class="row-between"><b>${esc(x.titulo)}</b>${x.tipo && x.monto ? `<button class="btn chico" data-sug="${esc(x.tipo)}" data-monto="${Math.round(x.monto)}">Registrar</button>` : ''}</div>
        <p>${esc(x.texto)}</p></div>`).join('')}
    <p class="hint">Sugerencias orientativas calculadas con sus datos y con las tasas que cargó en Ajustes${db.config.fechaTasas ? ' (actualizadas el ' + fmtFecha(db.config.fechaTasas) + ')' : ''}. No constituyen asesoramiento financiero: antes de invertir, verifique condiciones, plazos y comisiones con su banco o agente de bolsa.</p>

    <div class="seccion-titulo"><h2>Inversiones vigentes</h2><button class="btn chico" id="inv-nueva">+ Inversión</button></div>
    ${activas.length ? `<p class="hint">Total estimado: <b>${$$(total)}</b></p>${activas.map(filaInv).join('')}` : '<p class="hint vacio-lista">Sin inversiones registradas.</p>'}
    ${Object.keys(porTipo).length > 1 ? `<div class="card"><h2>Distribución</h2>${barrasCategorias(Object.entries(porTipo).sort((a, b) => b[1] - a[1]))}</div>` : ''}
    ${cerradas.length ? `<div class="seccion-titulo"><h2>Vencidas o rescatadas</h2></div>${cerradas.map(filaInv).join('')}` : ''}`;
  $('#inv-nueva').onclick = () => renderInversion(null, renderAhorro);
  view.querySelectorAll('[data-inv]').forEach(b => (b.onclick = () => renderInversion(b.dataset.inv, renderAhorro)));
  view.querySelectorAll('[data-sug]').forEach(b => (b.onclick = () => renderInversion(null, renderAhorro, { tipo: b.dataset.sug, monto: Number(b.dataset.monto) })));
}

function renderInversion(id, volver, prefijado = {}) {
  const v0 = id ? buscar('inversiones', id) : null;
  if (id && !v0) return volver();
  const tnaDef = t => (t === 'pf' || t === 'caucion' ? db.config.tnaPlazoFijo : t === 'money' ? db.config.tnaMoneyMarket : '') || '';
  const v = v0 ? { ...v0 } : { id: uid(), tipo: prefijado.tipo || 'pf', descripcion: '', monto: prefijado.monto || '', moneda: 'ARS', fecha: hoy(),
    vencimiento: (prefijado.tipo || 'pf') === 'pf' ? sumarDias(hoy(), 30) : '', tna: tnaDef(prefijado.tipo || 'pf'), valorActual: '', valorFinal: '',
    desdeBanco: true, alBanco: true, rescate: '', valorRescate: '', notas: '' };
  setHeader(v0 ? 'Inversión' : 'Nueva inversión', volver);
  const pintar = () => {
    const t = tipoInversion($('#v-tipo') ? $('#v-tipo').value : v.tipo);
    view.querySelectorAll('[data-vence]').forEach(el => (el.hidden = !t.vence));
  };
  view.innerHTML = `
    <form class="card" id="fedit" novalidate>
      <div class="form-row"><label for="v-tipo">Tipo</label><select class="field" id="v-tipo">${opciones(TIPOS_INVERSION.map(t => [t.id, t.nombre]), v.tipo)}</select></div>
      <div class="form-row"><label for="v-desc">Descripción <span class="hint">(opcional)</span></label>
        <input class="field" id="v-desc" value="${esc(v.descripcion)}" placeholder="Por ejemplo: plazo fijo Banco Nación" autocomplete="off"></div>
      <div class="grid2">
        <div class="form-row"><label for="v-monto">Monto invertido</label>${campoMonto('v-monto', v.monto)}</div>
        <div class="form-row"><label for="v-mon">Moneda</label><select class="field" id="v-mon">${opciones([['ARS', 'Pesos'], ['USD', 'Dólares']], v.moneda)}</select></div>
        <div class="form-row"><label for="v-fecha">Fecha</label><input class="field" id="v-fecha" type="date" value="${esc(v.fecha)}"></div>
        <div class="form-row"><label for="v-tna">TNA (%)</label>${campoMonto('v-tna', v.tna)}</div>
        <div class="form-row" data-vence><label for="v-vto">Vencimiento</label><input class="field" id="v-vto" type="date" value="${esc(v.vencimiento)}"></div>
        <div class="form-row" data-vence><label for="v-final">Monto al vencimiento</label>${campoMonto('v-final', v.valorFinal, 'placeholder="Se calcula con la TNA"')}</div>
      </div>
      <div class="form-row"><label for="v-actual">Valor actual <span class="hint">(opcional; para acciones, CEDEARs, bonos o dólares)</span></label>${campoMonto('v-actual', v.valorActual)}</div>
      <label class="check"><input type="checkbox" id="v-banco" ${v.desdeBanco !== false ? 'checked' : ''}> El dinero sale de la cuenta del banco en esa fecha</label>
      <label class="check" data-vence><input type="checkbox" id="v-albanco" ${v.alBanco !== false ? 'checked' : ''}> Al vencer, el dinero vuelve a la cuenta del banco</label>
      <div class="form-row" style="margin-top:12px"><label for="v-resc">Fecha de rescate o venta <span class="hint">(si ya se retiró)</span></label>
        <input class="field" id="v-resc" type="date" value="${esc(v.rescate)}"></div>
      <div class="form-row"><label for="v-vresc">Monto recibido</label>${campoMonto('v-vresc', v.valorRescate)}</div>
      <div class="form-row"><label for="v-notas">Notas</label><textarea class="field" id="v-notas">${esc(v.notas)}</textarea></div>
      <p class="hint" id="v-calc"></p>
      <div class="error" id="v-err"></div>
      <button class="btn primary" type="submit">Guardar</button>
      ${v0 ? '<button class="btn danger" type="button" id="v-borrar" style="margin-top:10px">Eliminar</button>' : ''}
    </form>`;
  const calcular = () => {
    const prueba = { tipo: $('#v-tipo').value, monto: leerMonto('v-monto'), fecha: $('#v-fecha').value, vencimiento: $('#v-vto').value, tna: leerMonto('v-tna') };
    const i = interesEstimado(prueba);
    $('#v-calc').textContent = i ? `Interés estimado: ${$$(i, true)} en ${diasEntre(prueba.fecha, prueba.vencimiento)} días (total ${$$(num(prueba.monto) + i, true)}).` : '';
  };
  $('#v-tipo').onchange = () => {
    const t = $('#v-tipo').value;
    if (!v0 && !$('#v-tna').value) $('#v-tna').value = textoMontoEditable(tnaDef(t));
    if (tipoInversion(t).vence && !$('#v-vto').value) $('#v-vto').value = sumarDias($('#v-fecha').value || hoy(), 30);
    pintar(); calcular();
  };
  ['v-monto', 'v-fecha', 'v-vto', 'v-tna'].forEach(k => $('#' + k).addEventListener('input', calcular));
  pintar(); calcular();
  $('#fedit').onsubmit = e => {
    e.preventDefault();
    const campos = { monto: leerMonto('v-monto', true), tna: leerMonto('v-tna'), valorFinal: leerMonto('v-final'), valorActual: leerMonto('v-actual'), valorRescate: leerMonto('v-vresc') };
    if (Object.values(campos).some(x => Number.isNaN(x))) { $('#v-err').textContent = 'Revise los importes (el monto invertido es obligatorio).'; return; }
    const tipo = $('#v-tipo').value;
    guardarRegistro('inversiones', {
      ...v, ...campos, tipo, descripcion: $('#v-desc').value.trim(), moneda: $('#v-mon').value, fecha: $('#v-fecha').value || hoy(),
      vencimiento: tipoInversion(tipo).vence ? $('#v-vto').value : '', desdeBanco: $('#v-banco').checked, alBanco: $('#v-albanco').checked,
      rescate: $('#v-resc').value, notas: $('#v-notas').value.trim()
    });
    save(); toast('Guardado.'); volver();
  };
  if ($('#v-borrar')) $('#v-borrar').onclick = () => {
    if (!confirm('¿Eliminar esta inversión?')) return;
    borrarRegistro('inversiones', v.id); save(); volver();
  };
}
