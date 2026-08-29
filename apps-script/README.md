# Backend Google Apps Script

1. Crea un proyecto de Apps Script.
2. Copia `Code.gs`.
3. Ejecuta una vez `setupFitosanidad()` y autoriza permisos.
4. Verifica que se cree `BD_FITOSANIDAD` con:
   - BICHO DEL CESTO
   - MOSCA DE LA FRUTA
   - TRAMPAS OFICIALES DE SENASA
   - AUDITORIA
5. Implementa como **Aplicación web** ejecutada como propietario y con acceso según la política definida para el equipo.
6. Copia la URL `/exec` en Administración → Google Apps Script dentro de la PWA.

Las primeras 12 columnas conservan la estructura de las plantillas entregadas. Las columnas técnicas se agregan después y quedan ocultas para permitir idempotencia, auditoría y GPS.
