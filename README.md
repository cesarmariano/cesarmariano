# Alveon B2B – Desarrollo de negocios

Aplicación web instalable (celular, Mac y Linux) para el seguimiento comercial de **obras sociales, prepagas, hospitales, sanatorios, clínicas, internación domiciliaria y otros prestadores**, a quienes se ofrece el paquete de productos y servicios de Alveon.

Es un proyecto independiente de la aplicación de visitas médicas y seguimiento de pacientes: código, datos del dispositivo y carpeta de Google Drive separados.

## Funciones

### Cuentas (instituciones)
- Nombre, tipo, etapa comercial, provincia, ciudad, dirección, teléfono, WhatsApp, correo general, sitio web, CUIT, productos de interés y notas.
- Etapas: Prospecto → Contacto inicial → Reuniones → Cotización → Licitación → Negociación → Cliente (o Perdida / sin interés). La etapa avanza sola al registrar actividades y puede cambiarse a mano.
- Lista con búsqueda (institución, contacto, cargo, ciudad), filtros por etapa, tipo y provincia, y orden por seguimiento, última actividad o nombre.

### Contactos (uno o varios por cuenta)
- Nombre, posición o cargo, área, rol en la decisión (**Decisor**, **Influye en la decisión**, **No decide**), correo, celular para WhatsApp, teléfono fijo o interno y notas.
- Botones **Correo**, **WhatsApp** y **Llamar**: sólo aparecen los que tienen el dato cargado (no todos los contactos dan su celular).
- El correo se abre como mensaje nuevo desde la cuenta **cotizaciones.alveon@gmail.com**. Después de abrirlo se ofrece registrarlo como actividad.

### Actividades
Contacto inicial · Reunión · Cotización (productos, monto, moneda, validez, estado) · Licitación (expediente, tipo, apertura, monto, estado) · Venta · Alquiler (cuota mensual, inicio y fin del contrato) · Garantía (equipo, serie, vencimiento) · Soporte técnico · Consulta · Llamada · Correo · WhatsApp · Otra.
Cada actividad registra fecha, contactos que participaron, detalle y un **seguimiento** (fecha y próximo paso).

### Agenda
Seguimientos pendientes, licitaciones en curso con fecha de apertura, cotizaciones por vencer o sin respuesta, contratos de alquiler y garantías por vencer, y casos de soporte o consultas abiertos.

### Difusión masiva
- **Correo**: se elige la lista de destinatarios tildando contactos (filtros por tipo, etapa, provincia, decisores y producto de interés). Se abre un correo dirigido a cotizaciones.alveon@gmail.com con todos los elegidos en **copia oculta (CCO)**. Si son muchos, se divide en varios correos (50 por correo, configurable). También se pueden copiar las direcciones.
- **WhatsApp**: WhatsApp no permite enviar a varios a la vez desde otra aplicación; se abre un chat por destinatario con el texto listo (personalizable con `{nombre}`, `{institucion}` y `{cargo}`) y un botón para pasar al siguiente.
- La difusión puede registrarse como actividad en cada cuenta alcanzada.

### Informes
- PDF: listado de cuentas; actividades del período; cotizaciones, licitaciones, ventas y alquileres con totales por moneda; ficha completa de cada cuenta.
- CSV de contactos para Excel o Google Contactos.

### Ajustes
Representante, cuenta remitente, forma de abrir el correo en cada dispositivo (Gmail en el navegador o aplicación de correo), firma, catálogo de productos y servicios, Google Drive, instalación y copia de seguridad manual.

## Correo desde cotizaciones.alveon@gmail.com
La aplicación abre la ventana de redacción de Gmail para esa cuenta, por lo que en cada dispositivo debe estar abierta la cuenta cotizaciones.alveon@gmail.com:
- **Mac y Linux**: en el navegador (Gmail en el navegador). Si hay varias cuentas abiertas, Gmail usa la indicada en Ajustes.
- **Celular**: en la aplicación Gmail (opción "Aplicación de correo"); verificar el remitente antes de enviar.

Gmail admite hasta 500 destinatarios por día en cuentas personales.

## Puesta en marcha

### 1. Publicación (una sola vez)
Repositorio `cesarmariano/AlveonB2B` → **Settings** → **Pages** → *Build and deployment* → Source: **Deploy from a branch** → Branch: `main`, carpeta `/ (root)` → **Save**.

- Aplicación: https://cesarmariano.github.io/AlveonB2B/
- Instalación en otros dispositivos (enlace, QR e instrucciones): https://cesarmariano.github.io/AlveonB2B/instalar.html

### 2. Google Drive
Usa el mismo ID de cliente de Google que la aplicación de visitas médicas (sirve para cualquier página en `https://cesarmariano.github.io`). Los datos se guardan en la carpeta **Alveon B2B**, con un respaldo diario. En cada dispositivo: **Ajustes → Conectar Google Drive** con la misma cuenta de Google.

### 3. Íconos
`python3 tools/generar_iconos.py [logo] [simbolo]` genera los íconos con la franja "B2B" que los distingue de la aplicación de visitas médicas.

## Privacidad
La página `privacidad.html` explica qué datos guarda la aplicación, dónde y para qué usa el acceso a Google.

## Datos
Cada dispositivo guarda una copia local. Al sincronizar se combinan las copias: por cuenta, contacto y actividad prevalece la modificación más reciente.
