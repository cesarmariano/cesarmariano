# Visitas Alveon – Oxigenoterapia

Aplicación web instalable (celular, Mac y Linux) para registrar las visitas periódicas a médicos y los pacientes referidos al servicio de oxigenoterapia de Alveon.

- Aplicación: https://cesarmariano.github.io/cesarmariano/visitas-alveon/
- Instalación en otros dispositivos (enlace, QR e instrucciones): https://cesarmariano.github.io/cesarmariano/visitas-alveon/instalar.html

## Funciones
- **Nuevo médico** (asistente paso a paso): nombre, especialidad, institución, provincia, ciudad, dirección, celular de WhatsApp (una única vez), fecha de la última visita, pacientes referidos (total acumulado), próxima visita programada y notas.
- **Registrar visita**: fecha, total acumulado de pacientes referidos, próxima visita y notas. Historial por médico.
- **Lista** ordenable por próxima visita, por cantidad de pacientes referidos o por nombre; avisos de visitas vencidas.
- **PDF** con filtros: período (todo, desde/hasta, año o mes), institución, provincia y ciudad. Columnas: Nombre, Institución, Fecha última visita, Pacientes referidos, (Referidos en el período), Próxima visita, Ubicación, Provincia, Especialidad y Celular.
- **Google Drive**: sincronización entre dispositivos y respaldo diario en la carpeta *Alveon Visitas*.
- Funciona sin conexión.

## Puesta en marcha

### 1. Publicar en GitHub Pages (una sola vez)
Repositorio → **Settings** → **Pages** → *Build and deployment* → Source: **Deploy from a branch** → Branch: `claude/agente-visitas-medicas-n19ccr`, carpeta `/ (root)` → **Save**.

### 2. Conectar Google Drive (una sola vez)
1. Ingresar a https://console.cloud.google.com/ y crear un proyecto (por ejemplo, "Visitas Alveon").
2. **APIs y servicios → Biblioteca**: habilitar **Google Drive API**.
3. **Pantalla de consentimiento de OAuth** (Google Auth Platform): tipo *Externo*, nombre de la aplicación, correo de soporte. En **Público / Usuarios de prueba**, agregar la propia cuenta de Gmail.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth** → tipo *Aplicación web*. En **Orígenes autorizados de JavaScript** agregar `https://cesarmariano.github.io`.
5. Copiar el **ID de cliente** (termina en `.apps.googleusercontent.com`). No es una contraseña: puede cargarse en `config.js` o en **Ajustes** de la aplicación.
6. En cada dispositivo: **Ajustes → Conectar Google Drive** e ingresar con la misma cuenta.

### 3. Logo
Para reemplazar el logo provisorio: `python3 tools/generar_iconos.py ruta/al/LogoTransparenteAlveon.png` (genera `logo.png` y los íconos).

## Datos
Cada dispositivo guarda una copia local. Al sincronizar se combinan las copias: por cada médico prevalece la modificación más reciente y las visitas de ambos dispositivos se conservan.
