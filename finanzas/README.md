# Finanzas familiares

Aplicación web instalable (iPhone, Mac y Linux) para administrar las finanzas mensuales: ingresos, gastos, tarjetas de crédito,
saldo del banco, remanente para ahorrar y sugerencias de inversión. Sincroniza con Google Drive y funciona sin conexión.

- Aplicación: https://cesarmariano.github.io/cesarmariano/finanzas/
- Instalación (enlace, QR e instrucciones): https://cesarmariano.github.io/cesarmariano/finanzas/instalar.html

## Secciones
- **Mes**: ingresos y gastos del mes, previstos o cobrados/pagados, con su fecha. "Preparar el mes" agrega los habituales.
  - Ingresos iniciales: sueldo de Mercedes, alquiler 1 y 2, Alveon – alquiler de CPAP, Alveon – otras ventas, alquileres y servicios, otros ingresos.
  - Gastos iniciales: gas, electricidad, hipoteca, impuesto automotor de cada auto, otros gastos.
  - Si la aplicación Alveon está en el mismo dispositivo, el ingreso de CPAP ofrece la suma de cuotas de los CPAP en alquiler.
  - **Saldo del banco**: con el saldo cargado y las fechas de cada movimiento se proyecta el saldo día por día.
  - **Remanente**: lo que puede retirarse hoy sin que el saldo baje de la reserva mínima en ningún día hasta el fin del mes,
    incluidos los pagos del mes siguiente que vencen antes de su primer ingreso (por ejemplo, la tarjeta que vence antes del sueldo).
  - Gastos por cuenta (Consumo, Impuestos, Servicios, Vivienda, Cargos bancarios; editables), cronograma del saldo y PDF del mes.
- **Tarjetas**: resúmenes mensuales. Se importan desde el PDF del banco (también protegidos con clave) o se cargan a mano.
  Cada consumo se asigna a una cuenta; la aplicación sugiere la cuenta y recuerda lo elegido para cada comercio.
  El resumen se asigna al mes del vencimiento y el pago sale del banco en esa fecha. Admite consumos en dólares.
- **Ahorro**: disponible para ahorrar, fondo de emergencia, sugerencias según el perfil (conservador, moderado, agresivo)
  y las tasas cargadas, e inversiones (plazo fijo, UVA, caución, money market, dólares, bonos, CEDEARs, acciones).
  Los plazos fijos con fecha de vencimiento vuelven al banco en la proyección del saldo.
- **Año**: ahorro por mes, tabla con acumulado, ingresos por fuente y gastos por cuenta.

Las sugerencias son orientativas y no constituyen asesoramiento financiero.

## Reglas de cálculo
- Los importes en dólares se convierten con el **dólar del mes** (se carga junto con el saldo; si falta, se usa el del último mes cargado).
- El saldo cargado incluye los movimientos **marcados como cobrados o pagados** hasta su fecha. Los que siguen como previstos
  con fecha anterior se toman como pendientes: los pagos se aplican en la fecha del saldo y los cobros, por prudencia, al fin del mes.
- Si un mes no tiene saldo cargado, parte del saldo final proyectado del mes anterior.
- Ahorro del mes = ingresos − (gastos fijos y otros + pagos de tarjetas). Las inversiones no son gastos: sólo mueven dinero.

## Puesta en marcha
1. **Publicación**: GitHub Pages publica la rama configurada en *Settings → Pages*. Esta aplicación está en la carpeta `finanzas/`.
2. **Google Drive**: usa el mismo ID de cliente que Alveon (mismo sitio `https://cesarmariano.github.io`), por lo que no requiere
   configuración adicional. Para el método "Conectar con otro método" hay que agregar
   `https://cesarmariano.github.io/cesarmariano/finanzas/index.html` en *URI de redireccionamiento autorizados* del ID de cliente.
   Los datos quedan en la carpeta **Finanzas familiares** de Drive (`finanzas.json` y un respaldo diario).
3. En cada dispositivo: **Ajustes → Conectar Google Drive** con la misma cuenta.

## Datos
Cada dispositivo guarda una copia local. Al sincronizar, por cada registro (movimiento, resumen, inversión, etc.) prevalece su versión más reciente.

## Versiones
Se definen en `version.js` (MAYOR.MENOR.CORRECCIÓN). Al publicar cambios, aumentar el número y agregar la entrada en `FIN_NOVEDADES`.

## Íconos
`python3 tools/generar_iconos.py` vuelve a generar los íconos de la carpeta `icons/`.
