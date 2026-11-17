# Visitas Alveon – Oxigenoterapia

Aplicación web para registrar las visitas periódicas a médicos y el seguimiento de pacientes referidos al servicio de oxigenoterapia de Alveon. Está diseñada para completarse desde el celular.

## Funciones
- **Nuevo médico** (asistente paso a paso): nombre, especialidad, institución, ubicación, celular de WhatsApp (se solicita una única vez), fecha de la última visita, pacientes referidos (total acumulado) y notas.
- **Registrar visita**: fecha, total actualizado de pacientes referidos y notas. Queda un historial por médico.
- **Botón de WhatsApp** directo al número cargado.
- **Indicador de visitas pendientes** según la frecuencia configurada (30 días por defecto).
- **Generar PDF**: tabla con Nombre, Institución, Fecha última visita, Pacientes referidos, Ubicación, Especialidad y Celular, con total al pie. En el celular se ofrece compartirlo (WhatsApp, correo, Drive).
- **Copia de seguridad**: exportar e importar los datos en un archivo JSON (Ajustes).
- Funciona sin conexión y puede agregarse a la pantalla de inicio.

## Uso
Publicar la carpeta en cualquier hosting estático (por ejemplo GitHub Pages) y abrir `index.html` desde el celular.

Los datos se guardan sólo en el navegador del dispositivo; se recomienda exportar una copia de seguridad con regularidad.
