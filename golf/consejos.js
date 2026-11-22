/* Sección Consejos: biblioteca personal con diagramas, enlaces (Instagram, X, YouTube, sitios) e imágenes. */
'use strict';

let filtroCat = '', busqueda = '';
const nombreCat = k => (CATEGORIAS.find(c => c.k === k) || {}).nombre || k;

function tipoFuente(url) {
  if (!url) return '';
  if (/instagram\.com/i.test(url)) return 'Instagram';
  if (/(twitter|x)\.com/i.test(url)) return 'X';
  if (/youtu\.?be/i.test(url)) return 'YouTube';
  if (/tiktok\.com/i.test(url)) return 'TikTok';
  return 'Sitio web';
}

/* Vista integrada de la publicación (se carga sólo con conexión). */
function incrustar(url) {
  let m;
  if ((m = url.match(/instagram\.com\/(?:[\w.]+\/)?(p|reel|tv)\/([\w-]+)/i))) {
    return `<iframe class="embed ig" src="https://www.instagram.com/${m[1]}/${m[2]}/embed" loading="lazy" allowfullscreen title="Publicación de Instagram"></iframe>`;
  }
  if ((m = url.match(/(?:twitter|x)\.com\/[^/]+\/status\/(\d+)/i))) {
    return `<iframe class="embed x" src="https://platform.twitter.com/embed/Tweet.html?id=${m[1]}&lang=es" loading="lazy" title="Publicación de X"></iframe>`;
  }
  if ((m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/i))) {
    return `<iframe class="embed yt" src="https://www.youtube-nocookie.com/embed/${m[1]}" loading="lazy" allowfullscreen title="Video de YouTube"
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"></iframe>`;
  }
  return '';
}
const urlSegura = u => (/^https?:\/\//i.test(u || '') ? u : '');

function renderConsejos() {
  setHeader('Consejos');
  const q = busqueda.trim().toLowerCase();
  const todos = vivos('consejos');
  const lista = todos.filter(c =>
    (!filtroCat || (filtroCat === 'favoritos' ? c.favorito : (c.categorias || []).includes(filtroCat))) &&
    (!q || [c.titulo, c.texto, c.resumen].join(' ').toLowerCase().includes(q))
  ).sort((a, b) => (b.favorito - a.favorito) || (b.actualizado || '').localeCompare(a.actualizado || ''));
  const foco = todos.filter(c => c.enFoco);
  view.innerHTML = `
    <div class="actions">
      <button class="btn primary" id="b-nuevo-c">+ Nuevo consejo</button>
      <button class="btn" id="b-enlace">Desde un enlace</button>
    </div>
    ${foco.length ? `<section class="card foco">
      <h2>En foco para la próxima ronda</h2>
      <ul class="lista">${foco.map(c => `<li><button class="link" data-id="${c.id}">${esc(c.titulo)}</button></li>`).join('')}</ul>
    </section>` : ''}
    <input class="search" id="buscar" type="search" placeholder="Buscar consejos" value="${esc(busqueda)}">
    <div class="chips filtros">
      <button class="chip${!filtroCat ? ' sel' : ''}" data-cat="">Todos</button>
      <button class="chip${filtroCat === 'favoritos' ? ' sel' : ''}" data-cat="favoritos">★ Favoritos</button>
      ${CATEGORIAS.map(c => `<button class="chip${filtroCat === c.k ? ' sel' : ''}" data-cat="${c.k}">${esc(c.nombre)}</button>`).join('')}
    </div>
    <div id="lista-c">${lista.map(c => `
      <button class="item consejo" data-id="${c.id}">
        <span class="info"><span class="name">${c.favorito ? '★ ' : ''}${esc(c.titulo)}</span>
          <span class="sub">${esc((c.categorias || []).map(nombreCat).join(' · '))}${c.fuente ? ' · ' + tipoFuente(c.fuente) : ''}${c.diagrama ? ' · diagrama' : ''}</span></span>
        ${c.enFoco ? '<span class="pill">En foco</span>' : ''}
      </button>`).join('') || '<p class="hint">No hay consejos con ese filtro.</p>'}</div>`;
  $('#b-nuevo-c').onclick = () => renderFormConsejo(null);
  $('#b-enlace').onclick = () => renderFormConsejo(null, { enlace: true });
  $('#buscar').oninput = e => {
    busqueda = e.target.value;
    const pos = e.target.selectionStart;
    renderConsejos();
    const b = $('#buscar'); b.focus(); b.setSelectionRange(pos, pos);
  };
  view.querySelectorAll('[data-cat]').forEach(b => (b.onclick = () => { filtroCat = b.dataset.cat; renderConsejos(); }));
  view.querySelectorAll('[data-id]').forEach(b => (b.onclick = () => renderConsejo(b.dataset.id)));
}

async function pintarImagenes(cont, ids, quitar) {
  cont.innerHTML = ids.map((id, i) => `<figure class="img-c" id="img-${i}"><span class="hint">Cargando imagen…</span>
    ${quitar ? `<button type="button" class="link peligro" data-quitar-img="${i}">Quitar</button>` : ''}</figure>`).join('');
  for (let i = 0; i < ids.length; i++) {
    const fig = cont.querySelector('#img-' + i);
    try {
      const blob = await obtenerMedio(ids[i]);
      if (blob) fig.querySelector('span').outerHTML = `<img src="${URL.createObjectURL(blob)}" alt="Imagen del consejo">`;
      else fig.querySelector('span').textContent = 'La imagen no está disponible en este dispositivo.';
    } catch (e) { fig.querySelector('span').textContent = e.message; }
  }
}

function renderConsejo(id, volver) {
  const c = buscarId('consejos', id);
  if (!c) { irInicio(); return; }
  const atras = volver || (() => irInicio());
  setHeader('Consejo', atras);
  const dg = c.diagrama && DIAGRAMAS[c.diagrama];
  const url = urlSegura(c.fuente);
  view.innerHTML = `
    <section class="card">
      <h2>${esc(c.titulo)}</h2>
      <div class="chips solo">${(c.categorias || []).map(k => `<span class="chip sel">${esc(nombreCat(k))}</span>`).join('')}</div>
      ${parrafo(c.texto)}
      ${c.resumen ? `<h3>Resumen</h3>${parrafo(c.resumen)}` : ''}
    </section>
    ${dg ? `<section class="card"><h3>${esc(dg.titulo)}</h3><div class="diagrama">${dg.svg}</div></section>` : ''}
    ${url ? `<section class="card"><h3>Fuente: ${tipoFuente(url)}</h3>
      <a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Abrir la publicación</a>
      ${navigator.onLine ? incrustar(url) : '<p class="hint">Sin conexión: la publicación se verá al conectarse.</p>'}</section>` : ''}
    ${(c.imagenes || []).length ? `<section class="card"><h3>Imágenes</h3><div id="imgs"></div></section>` : ''}
    <div class="actions">
      <button class="btn" id="b-fav">${c.favorito ? '★ Quitar de favoritos' : '☆ Favorito'}</button>
      <button class="btn" id="b-foco">${c.enFoco ? 'Quitar del foco' : 'Poner en foco'}</button>
      <button class="btn primary" id="b-editar">Editar</button>
      <button class="btn danger" id="b-borrar">Borrar</button>
    </div>
    <p class="hint">"En foco" muestra el consejo al principio de la biblioteca, para repasarlo antes de la próxima ronda.</p>`;
  if ($('#imgs')) pintarImagenes($('#imgs'), c.imagenes, false);
  $('#b-fav').onclick = () => { c.favorito = !c.favorito; guardarRegistro('consejos', c); renderConsejo(id, volver); };
  $('#b-foco').onclick = () => { c.enFoco = !c.enFoco; guardarRegistro('consejos', c); renderConsejo(id, volver); };
  $('#b-editar').onclick = () => renderFormConsejo(id);
  $('#b-borrar').onclick = async () => {
    if (!confirm('¿Borrar este consejo?')) return;
    for (const m of (c.imagenes || [])) await borrarMedio(m);
    borrarRegistro('consejos', id);
    toast('Consejo borrado.');
    seccion = 'consejos'; irInicio();
  };
}

function renderFormConsejo(id, opciones = {}) {
  const original = id ? buscarId('consejos', id) : null;
  const c = original ? clonar(original) : {
    id: uid(), titulo: '', texto: '', categorias: [], fuente: opciones.url || '', resumen: '', imagenes: [],
    diagrama: '', favorito: false, enFoco: false, publicacion: opciones.texto || ''
  };
  const nuevasImg = [];
  let cambiado = false;
  const salir = async () => {
    if (cambiado && !confirm('¿Salir sin guardar los cambios?')) return;
    for (const m of nuevasImg) await borrarMedio(m);
    if (id) renderConsejo(id); else { seccion = 'consejos'; irInicio(); }
  };
  setHeader(id ? 'Editar consejo' : 'Nuevo consejo', salir);
  view.innerHTML = `
    <form id="fcons" autocomplete="off">
      <section class="card">
        ${opciones.enlace || c.fuente ? '' : '<p class="hint">Escriba el consejo con sus palabras. Para guardar una publicación de Instagram, X o YouTube, use el campo Enlace.</p>'}
        <div class="form-row"><label for="c-fuente">Enlace (Instagram, X, YouTube o sitio web)</label>
          <input class="field" id="c-fuente" type="url" inputmode="url" placeholder="https://…" value="${esc(c.fuente)}"></div>
        <div class="form-row"><label for="c-pub">Texto de la publicación (opcional)</label>
          <textarea class="field" id="c-pub" rows="3" placeholder="Pegue aquí la descripción de la publicación: Instagram y X no siempre permiten leerla en forma automática.">${esc(c.publicacion || '')}</textarea></div>
        <button type="button" class="btn ia" id="c-resumir">✦ Resumir con Claude</button>
        <p class="hint" id="c-estado"></p>
      </section>
      <section class="card">
        <div class="form-row"><label for="c-titulo">Título</label><input class="field" id="c-titulo" value="${esc(c.titulo)}" required></div>
        <div class="form-row"><label for="c-texto">Consejo</label><textarea class="field" id="c-texto" rows="6">${esc(c.texto)}</textarea></div>
        <div class="form-row"><label for="c-resumen">Resumen</label><textarea class="field" id="c-resumen" rows="3">${esc(c.resumen)}</textarea></div>
        <label>Categorías</label>
        <div class="chips" id="c-cats">${CATEGORIAS.map(k => `<button type="button" class="chip${c.categorias.includes(k.k) ? ' sel' : ''}" data-k="${k.k}">${esc(k.nombre)}</button>`).join('')}</div>
        <div class="form-row"><label for="c-diag">Diagrama</label><select class="field" id="c-diag">
          <option value="">Sin diagrama</option>
          ${Object.entries(DIAGRAMAS).map(([k, d]) => `<option value="${k}"${c.diagrama === k ? ' selected' : ''}>${esc(d.titulo)}</option>`).join('')}</select></div>
      </section>
      <section class="card">
        <h3>Imágenes</h3>
        <p class="hint">Puede agregar capturas de pantalla de la publicación o fotos.</p>
        <div id="c-imgs"></div>
        <label class="btn" for="c-file">+ Agregar imagen</label>
        <input id="c-file" type="file" accept="image/*" multiple hidden>
      </section>
      <button type="submit" class="btn primary grande">Guardar consejo</button>
    </form>`;
  const f = $('#fcons');
  f.addEventListener('input', () => { cambiado = true; });
  const pintar = () => {
    pintarImagenes($('#c-imgs'), c.imagenes, true).then(() => {
      $('#c-imgs').querySelectorAll('[data-quitar-img]').forEach(b => (b.onclick = async () => {
        const [m] = c.imagenes.splice(Number(b.dataset.quitarImg), 1);
        if (nuevasImg.includes(m)) await borrarMedio(m); else (c._quitar = c._quitar || []).push(m);
        cambiado = true; pintar();
      }));
    });
  };
  pintar();
  $('#c-cats').onclick = e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    const i = c.categorias.indexOf(b.dataset.k);
    if (i >= 0) c.categorias.splice(i, 1); else c.categorias.push(b.dataset.k);
    b.classList.toggle('sel', i < 0); cambiado = true;
  };
  $('#c-file').onchange = async e => {
    for (const file of e.target.files) {
      const blob = await reducirImagen(file);
      const m = await nuevoMedio(blob, 'imagen');
      nuevasImg.push(m); c.imagenes.push(m);
    }
    e.target.value = ''; cambiado = true; pintar();
  };
  $('#c-resumir').onclick = async () => {
    const url = $('#c-fuente').value.trim(), pub = $('#c-pub').value.trim();
    if (!url && !pub) { toast('Ingrese un enlace o pegue el texto de la publicación.'); return; }
    if (!IA.configurada()) { toast('Cargue la clave de API de Anthropic en Ajustes.', 4000); return; }
    const b = $('#c-resumir'), est = $('#c-estado');
    b.disabled = true; b.textContent = 'Resumiendo…'; est.textContent = '';
    try {
      const j = await IA.resumirConsejo(url, pub);
      if (!j.pudo_leer_enlace && !pub) {
        est.textContent = 'Claude no pudo leer el enlace (Instagram y X suelen bloquearlo). Pegue la descripción de la publicación en "Texto de la publicación" y vuelva a intentar.';
      } else {
        if (j.titulo) $('#c-titulo').value = j.titulo;
        if (j.puntos && j.puntos.length) $('#c-texto').value = j.puntos.map(p => '• ' + p).join('\n');
        if (j.resumen) $('#c-resumen').value = j.resumen;
        if (j.categorias.length) {
          c.categorias = j.categorias;
          $('#c-cats').querySelectorAll('[data-k]').forEach(x => x.classList.toggle('sel', c.categorias.includes(x.dataset.k)));
        }
        est.textContent = 'Revise el resultado y guarde el consejo.';
        cambiado = true;
      }
    } catch (e) { est.textContent = e.message; }
    b.disabled = false; b.textContent = '✦ Resumir con Claude';
  };
  f.onsubmit = async e => {
    e.preventDefault();
    c.titulo = $('#c-titulo').value.trim();
    c.texto = $('#c-texto').value.trim();
    c.resumen = $('#c-resumen').value.trim();
    c.fuente = $('#c-fuente').value.trim();
    c.publicacion = $('#c-pub').value.trim();
    c.diagrama = $('#c-diag').value;
    if (!c.titulo) { toast('Escriba un título.'); return; }
    for (const m of (c._quitar || [])) await borrarMedio(m);
    delete c._quitar;
    guardarRegistro('consejos', c);
    toast('Consejo guardado.');
    renderConsejo(c.id);
  };
}

/* Reduce las fotos grandes para que ocupen menos espacio en el dispositivo y en Drive. */
async function reducirImagen(file, max = 1600) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 900000) return file;
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    return await new Promise(ok => cv.toBlob(b => ok(b || file), 'image/jpeg', 0.85));
  } catch (_) { return file; }
}
