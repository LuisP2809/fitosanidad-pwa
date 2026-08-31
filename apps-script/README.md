# Servicio central Fitosanidad 0.3.0

El backend conserva las tres plantillas de evaluación, la autorización central por dispositivo y añade activación simplificada mediante **QR/enlace + código temporal de un solo uso**.

Los tokens de dispositivo nunca se guardan en texto plano en Google Sheets: solo se almacena su SHA-256. Los códigos temporales se guardan en Script Properties, vencen en 24 horas y se eliminan cuando se usan o expiran.

## Actualización desde 0.2.0

1. Reemplaza todo el contenido de `Code.gs` por la versión actual del repositorio.
2. Ejecuta `setupFitosanidad()` una vez. Reutiliza `BD_FITOSANIDAD`; no borra registros ni usuarios existentes.
3. No vuelvas a ejecutar `provisionInitialAdmin()` si `ADM-001` ya existe.
4. Ve a **Implementar → Administrar implementaciones**.
5. Edita la implementación web existente, selecciona **Nueva versión** y vuelve a implementar como propietario, con el mismo nivel de acceso.
6. Mantén la misma URL `/exec`; los dispositivos ya instalados continúan funcionando.

## Activación de Evaluadores y Supervisores

Desde la PWA, el Administrador crea un usuario o pulsa **Nuevo acceso**. El servidor devuelve un código temporal y la PWA genera localmente:

- QR de activación.
- Enlace de activación.
- Código visible de 8 caracteres.

El usuario escanea el QR o abre el enlace, crea su PIN local y queda vinculado. Al consumir un nuevo código, el token anterior de ese usuario queda invalidado. Después de la activación, el ingreso cotidiano es solo **Usuario + PIN**.

## Estructura central

- `BICHO DEL CESTO`
- `MOSCA DE LA FRUTA`
- `TRAMPAS OFICIALES DE SENASA`
- `USUARIOS_SYNC`
- `AUDITORIA`

Las primeras 12 columnas de cada evaluación conservan la plantilla original. Las columnas técnicas quedan ocultas y guardan ID idempotente, usuario, hora y GPS.

## Administrador inicial

`provisionInitialAdmin()` se usa únicamente en una instalación nueva. Si solo necesitas renovar el token del Administrador principal, usa `rotateInitialAdminToken()`.

### Reinicio total de accesos

El archivo `ResetAccess.gs` contiene la función manual `resetAllAccessAndProvisionAdmin()` para una recuperación completa de permisos. Esta función:

- Revoca todos los usuarios y tokens centrales de `USUARIOS_SYNC`.
- Invalida todos los códigos temporales/QR pendientes.
- Conserva intactas las evaluaciones de Bicho, Mosca y SENASA.
- Conserva `AUDITORIA` y registra el reinicio de seguridad.
- Crea nuevamente `ADM-001` / usuario `admin`.
- Genera un código temporal de un solo uso para volver a activar al Administrador principal.

Para usarla, crea en el mismo proyecto de Apps Script un archivo de script llamado `ResetAccess.gs`, copia allí el contenido del archivo homónimo del repositorio y ejecuta `resetAllAccessAndProvisionAdmin()` una sola vez. Revisa el registro de ejecución para obtener `activationCode`; no compartas ese código ni el perfil generado en chats o repositorios.

Después abre Fitosanidad, pulsa **Activar otro dispositivo**, usa el código generado y la misma URL `/exec`, y crea un PIN nuevo para el Administrador. Los Evaluadores y Supervisores anteriores quedarán revocados y deberán crearse nuevamente desde Admin.

## Seguridad

- No compartas la hoja `USUARIOS_SYNC` con Evaluadores.
- No pegues perfiles/tokens en GitHub ni en mensajes.
- Los QR/códigos de activación deben entregarse solo al usuario correspondiente.
- Los códigos vencen automáticamente y son de un solo uso.
- La app puede seguir capturando offline; una revocación se aplica cuando el dispositivo vuelve a contactar al servidor.
