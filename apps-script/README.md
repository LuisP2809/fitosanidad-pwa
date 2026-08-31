# Servicio central Fitosanidad 0.6.0

La versión 0.6.0 añade credenciales independientes por dispositivo. Un mismo usuario puede permanecer vinculado en varios equipos sin que una nueva activación invalide automáticamente los anteriores. El caso principal es `ADM-001`, que puede usarse en PC y celular al mismo tiempo.

## Actualización desde 0.5.x

1. Reemplaza `Code.gs` por la versión 0.6.0 del repositorio.
2. Ejecuta `setupFitosanidad()` una vez. Reutiliza `BD_FITOSANIDAD`; no borra evaluaciones ni usuarios.
3. Edita la implementación web existente en **Implementar → Administrar implementaciones**, selecciona **Nueva versión** y vuelve a implementar.
4. Conserva la misma URL `/exec`.
5. No vuelvas a crear `ADM-001` si ya existe.

En la primera validación desde un dispositivo que ya funcionaba con 0.5.x, el backend acepta la credencial anterior y registra ese equipo en `DISPOSITIVOS_SYNC`. Después, cada activación nueva genera una credencial propia para el dispositivo que consume el código.

## Dispositivos del Administrador

Desde **Admin → Dispositivos del Administrador** se puede generar un QR/código para otro equipo. El nuevo dispositivo crea su PIN local y queda asociado al mismo `ADM-001`; la PC o celular anterior permanece activo. También se pueden revocar o reactivar dispositivos individualmente. Por seguridad, la PWA no permite revocar desde la interfaz el dispositivo que se está usando en ese momento.

## Hojas centrales

- `BICHO DEL CESTO`
- `MOSCA DE LA FRUTA`
- `TRAMPAS OFICIALES DE SENASA`
- `USUARIOS_SYNC`
- `DISPOSITIVOS_SYNC`
- `AUDITORIA`

Las primeras 12 columnas de cada evaluación conservan las plantillas oficiales. Los tokens nunca se guardan en texto plano; solo se almacena su hash SHA-256.

## Recuperación

`ResetAccess.gs` conserva las evaluaciones. El reinicio total de accesos limpia usuarios, dispositivos y códigos temporales y vuelve a crear `ADM-001`. Si el Administrador ya existe y solo necesita otro código, usa la función de recuperación correspondiente sin borrar nuevamente los usuarios.

## Seguridad

No compartas `USUARIOS_SYNC` ni `DISPOSITIVOS_SYNC` con Evaluadores. No publiques tokens, códigos temporales o URLs privadas de implementación. Las revocaciones se aplican cuando el dispositivo vuelve a contactar al servidor.