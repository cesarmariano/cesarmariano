/* Versión de la aplicación: único lugar donde se define.
   Formato MAYOR.MENOR.CORRECCIÓN. Al publicar cambios: aumentar el número y agregar la entrada al principio de NOVEDADES.
   También lo usa sw.js para que cada dispositivo descargue la versión nueva. */
self.GOLF_VERSION = '1.0.0';
self.GOLF_NOVEDADES = [
  { v: '1.0.0', fecha: '2026-11-22', cambios: [
    'Registro de rondas: fecha, lugar, clima con temperatura, estado de la cancha y evaluación de salida del tee, juego medio, bunker, approach y putting.',
    'Decisiones de palo por golpe y su resultado.',
    'Grabación de audios con transcripción a texto y ordenamiento automático con Claude.',
    'Puntaje de 1 a 10 por ronda (campo 3, clima 3, juego 4) con gráfico de barras por variable.',
    'Análisis del historial: tendencias, estadísticas, condiciones y decisiones; análisis con Claude.',
    'Biblioteca de consejos con diagramas, enlaces de Instagram, X y YouTube, y resúmenes con Claude.',
    'Sincronización y respaldo diario en Google Drive.'
  ] }
];
