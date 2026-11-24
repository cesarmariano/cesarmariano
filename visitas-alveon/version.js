/* Versión de la aplicación: único lugar donde se define.
   Formato MAYOR.MENOR.CORRECCIÓN
   - MAYOR: cambio grande (por ejemplo, una sección nueva).
   - MENOR: función nueva.
   - CORRECCIÓN: corrección de errores.
   Al publicar cambios: aumentar el número y agregar la entrada al principio de NOVEDADES.
   También lo usa sw.js para que cada dispositivo descargue la versión nueva. */
self.ALVEON_VERSION = '2.5.3';
self.ALVEON_NOVEDADES = [
  { v: '2.5.3', fecha: '2026-11-24', cambios: ['Identificador propio de la aplicación: el navegador ya no la confunde con otras aplicaciones del mismo sitio (por ejemplo, Finanzas Personales).'] },
  { v: '2.5.2', fecha: '2026-11-20', cambios: ['El modo sin conexión ya no borra los archivos guardados de otras aplicaciones del mismo sitio (Finanzas familiares).'] },
  { v: '2.5.1', fecha: '2026-11-19', cambios: ['Los campos de fecha y hora quedan centrados y dentro de la pantalla en el iPhone.'] },
  { v: '2.5.0', fecha: '2026-11-19', cambios: ['Alta de médicos: casilla "Nuevo o por visitar" para médicos que todavía no se visitaron.'] },
  { v: '2.4.0', fecha: '2026-11-19', cambios: ['Google Drive: recuerda la cuenta y no pide elegirla en cada conexión.', 'El permiso de Google se reutiliza durante su hora de validez y la aplicación sincroniza sola al abrirse.', 'En Ajustes se muestra la cuenta conectada y el botón "Cambiar de cuenta de Google".'] },
  { v: '2.3.0', fecha: '2026-11-19', cambios: ['Si el mismo dato se modificó en dos dispositivos, la aplicación pregunta cuál conservar.', 'Versión visible en Ajustes e historial de versiones.'] },
  { v: '2.2.0', fecha: '2026-11-18', cambios: ['Sincronización campo por campo: se conserva el cambio más reciente de cada dato.'] },
  { v: '2.1.4', fecha: '2026-11-18', cambios: ['Google Drive: se acepta la autorización aunque Google informe que la ventana se cerró.', 'Nuevo botón "Conectar con otro método" (sin ventana emergente).'] },
  { v: '2.1.3', fecha: '2026-11-18', cambios: ['Google Drive: verificación del permiso, errores explicados y estado de la conexión en Ajustes.'] },
  { v: '2.1.2', fecha: '2026-11-18', cambios: ['Google Drive: corrección de la conexión en Chrome de escritorio.'] },
  { v: '2.1.1', fecha: '2026-11-18', cambios: ['Los avisos duran 2 segundos y ya no quedan sobre la barra inferior.'] },
  { v: '2.1.0', fecha: '2026-11-17', cambios: ['Días, horarios y lugares de atención en el perfil del médico.'] },
  { v: '2.0.0', fecha: '2026-11-17', cambios: ['Nueva sección Pacientes: concentradores y CPAP, alquiler y venta, adherencia, mantenimiento, actividades y PDF.'] },
  { v: '1.2.0', fecha: '2026-11-17', cambios: ['Logo y colores de Alveon.', 'ID de cliente de Google incorporado.'] },
  { v: '1.1.0', fecha: '2026-11-17', cambios: ['Próxima visita, ciudad y provincia, filtros del PDF, Google Drive e instalación.'] },
  { v: '1.0.0', fecha: '2026-11-17', cambios: ['Primera versión: registro de visitas a médicos y PDF.'] }
];
