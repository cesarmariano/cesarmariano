# Mi Golf – Rondas y mejoras

Aplicación web instalable (celular, Mac y Linux) para registrar rondas de golf, medir la evolución del juego
y reunir una biblioteca personal de consejos. Funciona sin conexión en la cancha y se sincroniza con Google Drive.

> Ubicación provisoria: carpeta `golf/` de la rama `claude/golf-analysis-app-3pftnf` del repositorio `cesarmariano/cesarmariano`.
> La carpeta es independiente: puede moverse tal cual a la raíz de un repositorio nuevo (por ejemplo `cesarmariano/golf`).

## Funciones

### Rondas
- **Datos**: fecha, lugar, hoyos, golpes y par.
- **Clima**: templado, caluroso, frío, ventoso (combinables) y temperatura.
- **Cancha**: excelente, buena, seca, dura, mojada, bunkers desastrosos.
- **Áreas del juego**, cada una con nota de 1 a 10, qué hice bien, qué debo mejorar y datos:
  - Salida del tee: fairways acertados, fallos a la izquierda y a la derecha.
  - Juego medio desde el fairway: greens en regulación.
  - Salidas de bunker: salidas al green sobre bunkers jugados.
  - Approach: up and down logrados sobre oportunidades.
  - Putting: putts totales y tres putts.
- **Decisiones de palo**: hoyo, situación, distancia, palo, resultado, si la decisión fue acertada y comentario.
- **Notas de voz**: grabación con transcripción a texto en el momento (reconocimiento de voz del navegador, en español).
  El botón **Ordenar con Claude** distribuye la transcripción en las áreas, en lo general y en las decisiones de palo.

### Puntaje de 1 a 10
`Puntaje = campo + clima + juego`, limitado entre 1 y 10.
- **Campo (0 a 3)**: dificultad del estado de la cancha. Excelente 0 · Buena 0,5 · Seca 0,5 · Dura 1 · Mojada 1,5 · Bunkers desastrosos 1,5 (máximo 3).
- **Clima (0 a 3)**: Templado 0 · Caluroso 1 · Frío 1 · Ventoso 1,5; temperatura < 10 °C o > 30 °C +0,5; < 5 °C o > 35 °C +1 (máximo 3).
- **Juego (−4 a +4)**: promedio de las notas de las áreas. 10 = +4 · 5,5 = 0 · 1 = −4.

Las condiciones difíciles suman mérito; un mal juego resta. La dificultad calculada puede ajustarse a mano en cada ronda.
El gráfico muestra una barra por ronda con tres colores (campo, clima y juego), el juego negativo por debajo de cero,
la marca de la suma y el puntaje final. Los valores se definen en `puntaje.js`.

### Análisis
- Evolución de la nota de cada área (últimas 5 rondas comparadas con las 5 anteriores).
- Estadísticas: fairways, greens en regulación, bunker, up and down, putts por hoyo y tres putts.
- Juego según el clima y el estado de la cancha.
- Decisiones por palo: porcentaje de decisiones acertadas y de buenos resultados.
- Recomendaciones automáticas (área prioritaria, retrocesos, palos con malos resultados, lado de los fallos, efecto del viento)
  con enlaces a los consejos relacionados.
- **Análisis con Claude**: informe con evolución, decisiones, condiciones, prioridades, ejercicios y consejos para repasar. Se guarda y se sincroniza.

### Consejos
- Biblioteca inicial con los consejos propios y diagramas (posición de la bola según el palo, 75 % del peso en la pierna izquierda,
  swing de abajo hacia arriba, secuencia caderas–torso–brazos–palo).
- Categorías, búsqueda, favoritos y **En foco** (consejos a repasar antes de la próxima ronda).
- Enlaces de **Instagram, X y YouTube** con vista integrada de la publicación, e imágenes (capturas o fotos).
- **Resumir con Claude**: a partir del enlace o del texto pegado de la publicación, completa título, puntos, resumen y categorías.
  Instagram y X suelen bloquear la lectura automática: en ese caso, pegar la descripción de la publicación.
- En Android, al compartir un enlace desde Instagram o X hacia **Mi Golf** (aplicación instalada) se abre el formulario con el enlace.

## Puesta en marcha

### 1. Publicación
GitHub Pages publica una sola rama por repositorio y hoy publica la aplicación de Alveon. Para publicar Mi Golf por separado:
1. Crear un repositorio vacío, por ejemplo `cesarmariano/golf`.
2. Copiar el contenido de esta carpeta `golf/` a la raíz del repositorio nuevo.
3. Repositorio → **Settings → Pages** → *Deploy from a branch* → rama `main`, carpeta `/ (root)`.
4. Dirección: `https://cesarmariano.github.io/golf/`.

### 2. Google Drive
`config.js` trae el mismo ID de cliente de Google que Alveon: funciona porque el origen autorizado es `https://cesarmariano.github.io`.
- Si se usa **Conectar con otro método**, agregar `https://cesarmariano.github.io/golf/index.html` en
  *URI de redireccionamiento autorizados* del ID de cliente (Google Cloud Console → Credenciales).
- Opcional: crear un proyecto propio de Google Cloud para Mi Golf (API de Google Drive habilitada, pantalla de consentimiento con la cuenta
  en *Usuarios de prueba*, ID de cliente de tipo *Aplicación web* con el origen `https://cesarmariano.github.io`) y cargar el ID en `config.js` o en Ajustes.
- En Drive se crea la carpeta **Mi Golf** con `golf-datos.json`, un respaldo diario y los audios e imágenes.

### 3. Claude
En **Ajustes → Claude**: cargar una clave de API de Anthropic (console.anthropic.com → API Keys) y elegir el modelo
(Claude Opus 5.5 por defecto; Sonnet 5.5 y Haiku 5.5 son más económicos). La clave queda sólo en el dispositivo y no se sincroniza.
El uso se cobra en la cuenta de Anthropic según el texto enviado.

## Datos
- Cada dispositivo guarda una copia local (localStorage) y los audios e imágenes en IndexedDB.
- Al sincronizar se combinan las copias: por cada ronda, consejo o análisis prevalece la modificación más reciente; los borrados también se sincronizan.
- Los audios e imágenes se suben a Drive y se descargan en otro dispositivo al abrirlos.
- **Ajustes → Copia de seguridad** exporta e importa un archivo JSON.

## Archivos
| Archivo | Contenido |
|---|---|
| `puntaje.js` | Áreas, climas, estados de cancha, cálculo del puntaje e indicadores |
| `datos.js` | Almacenamiento, combinación de copias, audios e imágenes |
| `drive.js` | Acceso a Google Drive |
| `audio.js` | Grabación y transcripción |
| `ia.js` | Llamadas a Claude |
| `graficos.js` | Gráficos en SVG |
| `app.js`, `analisis.js`, `consejos.js`, `ajustes.js`, `main.js` | Interfaz |
| `consejos-base.js` | Consejos iniciales y diagramas |
| `version.js` | Versión e historial de cambios |

## Versiones
Formato MAYOR.MENOR.CORRECCIÓN en `version.js`. Al publicar cambios: aumentar el número y agregar la entrada en `GOLF_NOVEDADES`
(también renueva la caché del modo sin conexión).
