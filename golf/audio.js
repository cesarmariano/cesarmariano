/* Grabación de audio con transcripción simultánea (reconocimiento de voz del navegador, en español).
   El audio se guarda siempre; si el navegador no ofrece transcripción, el texto se puede escribir o dictar con el teclado. */
'use strict';

const Grabador = (() => {
  let rec = null, flujo = null, partes = [], reco = null, activo = false, inicio = 0;
  let texto = '', interino = '';

  const hayGrabacion = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  const hayTranscripcion = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  async function iniciar(alCambiar) {
    if (!hayGrabacion()) throw new Error('Este navegador no permite grabar audio.');
    flujo = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {
      throw new Error('No se pudo usar el micrófono. Revise el permiso del micrófono para este sitio.');
    });
    const tipos = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
    const mime = tipos.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
    rec = new MediaRecorder(flujo, mime ? { mimeType: mime } : {});
    partes = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) partes.push(e.data); };
    rec.start(1000);
    inicio = Date.now(); activo = true; texto = ''; interino = '';

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alCambiar('', '', 'La transcripción automática no está disponible en este navegador. Al terminar puede escribir o dictar el texto con el micrófono del teclado.'); return; }
    reco = new SR();
    reco.lang = 'es-AR';
    reco.continuous = true;
    reco.interimResults = true;
    reco.onresult = e => {
      interino = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.trim();
        if (e.results[i].isFinal) texto += (texto ? ' ' : '') + t;
        else interino += (interino ? ' ' : '') + t;
      }
      alCambiar(texto, interino, '');
    };
    reco.onerror = e => {
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(e.error)) {
        reco = null;
        alCambiar(texto, '', 'La transcripción automática se detuvo; el audio se sigue grabando. Al terminar puede completar el texto a mano.');
      }
    };
    // El reconocimiento se corta solo tras unos segundos de silencio: se reanuda mientras se graba.
    reco.onend = () => { if (activo && reco) { try { reco.start(); } catch (_) { /* ya iniciado */ } } };
    try { reco.start(); } catch (_) { /* sin transcripción */ }
  }

  function detener() {
    return new Promise(ok => {
      activo = false;
      const terminarGrabacion = () => {
        const fin = () => {
          if (flujo) flujo.getTracks().forEach(t => t.stop());
          const blob = new Blob(partes, { type: (rec && rec.mimeType) || 'audio/webm' });
          const r = { blob, duracion: Math.round((Date.now() - inicio) / 1000), texto: [texto, interino].filter(Boolean).join(' ').trim() };
          rec = null; flujo = null; reco = null;
          ok(r);
        };
        if (rec && rec.state !== 'inactive') { rec.onstop = fin; rec.stop(); } else fin();
      };
      if (reco) {
        // Se espera el último resultado del reconocimiento antes de cerrar.
        const r = reco; let listo = false;
        const seguir = () => { if (!listo) { listo = true; terminarGrabacion(); } };
        r.onend = seguir;
        try { r.stop(); } catch (_) { seguir(); }
        setTimeout(seguir, 1500);
      } else terminarGrabacion();
    });
  }

  function cancelar() {
    activo = false;
    try { if (reco) reco.abort(); } catch (_) { /* nada */ }
    try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (_) { /* nada */ }
    if (flujo) flujo.getTracks().forEach(t => t.stop());
    rec = null; flujo = null; reco = null;
  }

  return { iniciar, detener, cancelar, hayGrabacion, hayTranscripcion, segundos: () => Math.round((Date.now() - inicio) / 1000) };
})();
