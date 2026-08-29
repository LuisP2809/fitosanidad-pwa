# Fitosanidad PWA · 0.3.0

PWA móvil *offline-first* para registrar y supervisar evaluaciones fitosanitarias de campo con sincronización central en Google Sheets.

## Evaluaciones

- Bicho del cesto.
- Mosca de la fruta.
- Trampas oficiales de SENASA.
- Catálogo oficial de 253 lotes procedente de `PWA GUIA - FITOSANIDAD.xlsx`.
- Selección Campo → Fundo → Módulo → Lote.
- Año, mes y semana automáticos desde la fecha.
- Días de revisión siempre en 7.
- `C/T/D = Capturas / (Trampas revisadas × 7)`.
- `MTD = Moscas capturadas / (Trampas revisadas × 7)`.
- El turno no se muestra ni se solicita en los formularios.

## Acceso simplificado

- El Administrador crea Evaluadores/Supervisores y recibe un **QR + enlace + código temporal**.
- El usuario escanea el QR o abre el enlace, crea un PIN local y queda activado.
- Los códigos vencen en 24 horas y son de un solo uso.
- Al consumir un nuevo acceso, el token anterior de ese usuario queda invalidado.
- Después de activar el dispositivo, el ingreso normal es solo **Usuario + PIN**.
- Se conserva el perfil técnico anterior únicamente como mecanismo de compatibilidad/recuperación del Administrador.

## Roles y operación

- **Administrador**: crea, activa/desactiva y genera nuevos accesos para Evaluadores/Supervisores.
- **Supervisor**: consulta registros y resumen central confirmados.
- **Evaluador**: registra evaluaciones y consulta sus datos locales/sincronizados.
- IndexedDB conserva las evaluaciones sin señal y la cola se sincroniza al recuperar internet.
- Google Apps Script vuelve a validar campos, recalcula MTD/C-T-D y evita duplicados por ID.
- Captura GPS opcional sin bloquear el guardado.
- Exportación CSV.

## Backend

`apps-script/Code.gs` mantiene `BD_FITOSANIDAD` con las tres hojas oficiales, `USUARIOS_SYNC` y `AUDITORIA`. Los tokens de dispositivo se guardan solo como hash SHA-256. Los códigos temporales viven en Script Properties y se eliminan al usarse o vencer.

Después de actualizar `Code.gs`, crea una **nueva versión de la implementación web** de Apps Script para publicar el backend 0.3.0.

## Validación

```bash
npm install
npm test
npm run build:web
```

No se guardan IDs de Drive, URLs reales de implementación ni tokens reales dentro del repositorio.
