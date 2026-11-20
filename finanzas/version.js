/* Versión de la aplicación: único lugar donde se define.
   Formato MAYOR.MENOR.CORRECCIÓN
   - MAYOR: cambio grande (por ejemplo, una sección nueva).
   - MENOR: función nueva.
   - CORRECCIÓN: corrección de errores.
   Al publicar cambios: aumentar el número y agregar la entrada al principio de NOVEDADES.
   También lo usa sw.js para que cada dispositivo descargue la versión nueva. */
self.FIN_VERSION = '1.0.0';
self.FIN_NOVEDADES = [
  { v: '1.0.0', fecha: '2026-11-20', cambios: [
    'Primera versión: ingresos y egresos mensuales, saldo del banco y remanente para ahorrar.',
    'Resúmenes de tarjetas de crédito: importación desde PDF y asignación de cada consumo a una cuenta.',
    'Inversiones, fondo de emergencia y sugerencias para el dinero ahorrado.',
    'Resumen anual, PDF del mes y sincronización con Google Drive.'
  ] }
];
