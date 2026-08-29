# Fitosanidad PWA · 0.2.0

PWA móvil *offline-first* para registrar y supervisar evaluaciones fitosanitarias de campo con sincronización central en Google Sheets.

## Evaluaciones

- Bicho del cesto.
- Mosca de la fruta.
- Trampas oficiales de SENASA.
- Catálogo oficial de 253 lotes procedente de `PWA GUIA - FITOSANIDAD.xlsx`.
- Selección Campo → Fundo → Módulo → Lote y turno derivado del código del lote.
- Año, mes y semana automáticos desde la fecha.
- Días de revisión siempre en 7.
- `C/T/D = Capturas / (Trampas revisadas × 7)`.
- `MTD = Moscas capturadas / (Trampas revisadas × 7)`.

## Roles y operación

- **Administrador**: único rol que crea, activa/desactiva y renueva accesos de Evaluadores/Supervisores.
- **Supervisor**: consulta registros y resumen central confirmados.
- **Evaluador**: registra evaluaciones y consulta sus datos locales/sincronizados.
- Cada dispositivo importa un perfil central y protege el acceso con un PIN local.
- IndexedDB conserva las evaluaciones sin señal y la cola se sincroniza al recuperar internet.
- Google Apps Script vuelve a validar campos, recalcula MTD/C-T-D y evita duplicados por ID.
- Los registros confirmados se pueden consultar online desde Supervisor/Administrador.
- Captura GPS opcional sin bloquear el guardado.
- Exportación CSV.

## Backend

`apps-script/Code.gs` mantiene `BD_FITOSANIDAD` con las tres hojas oficiales, `USUARIOS_SYNC` y `AUDITORIA`. Los tokens de dispositivo se almacenan únicamente como hash SHA-256.

Consulta `apps-script/README.md` para instalación y actualización.

## Validación

```bash
npm test
```

No se guardan IDs de Drive, URL de implementación ni tokens reales dentro del repositorio.
