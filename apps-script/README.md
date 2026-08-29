# Servicio central Fitosanidad 0.2.0

El backend conserva las tres plantillas de evaluación y añade autorización central por dispositivo. Los tokens nunca se guardan en texto plano en Google Sheets: solo se almacena su SHA-256.

## Actualización desde 0.1.0

1. Reemplaza el contenido de `Code.gs` por la versión actual del repositorio.
2. Ejecuta `setupFitosanidad()` nuevamente. No borra `BD_FITOSANIDAD`; añade/migra las hojas técnicas necesarias.
3. Ejecuta una sola vez `provisionInitialAdmin()`.
4. Abre **Registro de ejecución** y guarda el JSON que aparece después de `PERFIL_ADMIN=`. Ese perfil contiene el token inicial y se mostrará solo en esa ejecución.
5. Después implementa el proyecto como **Aplicación web**, ejecutando como propietario y permitiendo acceso a cualquier usuario. La autorización real la hace el ID + token de cada perfil.
6. Copia la URL `/exec`. En el primer dispositivo abre la PWA, pega la URL y el `PERFIL_ADMIN`, y define un PIN local de al menos 6 dígitos.

## Estructura central

- `BICHO DEL CESTO`
- `MOSCA DE LA FRUTA`
- `TRAMPAS OFICIALES DE SENASA`
- `USUARIOS_SYNC`
- `AUDITORIA`

Las primeras 12 columnas de cada evaluación conservan la plantilla original. Las columnas técnicas quedan ocultas y guardan ID idempotente, usuario, hora y GPS.

## Usuarios

El Administrador central crea Evaluadores y Supervisores desde la PWA. Cada alta genera un **perfil de acceso** con token único. Ese perfil se importa una sola vez en el dispositivo correspondiente y allí se crea un PIN local. Desactivar un usuario invalida su token en el siguiente contacto con el servidor.

Si se pierde el perfil inicial del Administrador antes de instalarlo, ejecuta manualmente `rotateInitialAdminToken()` y usa el nuevo `PERFIL_ADMIN`.

## Seguridad

- No compartas la hoja `USUARIOS_SYNC` con Evaluadores.
- No pegues perfiles/tokens en GitHub.
- Tras instalar un perfil en su dispositivo, elimina copias innecesarias del token.
- La app puede seguir capturando offline; una revocación se aplica cuando el dispositivo vuelve a contactar al servidor.
