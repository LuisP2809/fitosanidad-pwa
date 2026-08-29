# Fitosanidad PWA · 0.1.0

PWA móvil *offline-first* para registrar evaluaciones fitosanitarias en campo y sincronizarlas posteriormente con Google Sheets.

## Alcance inicial

- Roles: Administrador, Supervisor y Evaluador.
- El primer dispositivo crea al Administrador principal.
- El Administrador crea usuarios Evaluador/Supervisor; un usuario común no puede asignar el rol Administrador.
- Tres evaluaciones:
  - Bicho del cesto.
  - Mosca de la fruta.
  - Trampas oficiales de SENASA.
- Catálogo oficial de 253 lotes tomado de `PWA GUIA - FITOSANIDAD.xlsx`.
- Selección encadenada: Campo → Fundo → Módulo → Lote.
- Turno derivado automáticamente del código de lote, cuando aplica.
- Año, mes y semana derivados de la fecha.
- Días de revisión bloqueados en 7.
- Cálculo automático:
  - `C/T/D = Capturas / (Trampas revisadas × 7)`.
  - `MTD = Moscas capturadas / (Trampas revisadas × 7)`.
- Guardado local con IndexedDB.
- Cola de sincronización y estado Pendiente/Confirmado.
- Captura opcional de coordenadas GPS sin bloquear el guardado.
- Exportación CSV con las 12 columnas de las plantillas originales.
- Backend base para Google Apps Script con hojas visibles equivalentes a las plantillas.

## Próximas etapas

1. Desplegar y conectar Google Apps Script.
2. Autenticación central y revocación de usuarios desde el Administrador.
3. Dashboard online del Supervisor/Administrador.
4. Mapa por lote y/o puntos GPS.
5. Control opcional de tiempos, paradas y productividad de evaluación.
6. Empaquetado APK Android, reutilizando la estrategia probada en Fenología.

## Validación local

```bash
npm test
```

No se guardan contraseñas, tokens, IDs de Google Drive ni URLs privadas dentro del repositorio.
