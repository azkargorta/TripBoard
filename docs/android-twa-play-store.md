# Android (Google Play) con TWA — coste mínimo

Estrategia: **Trusted Web Activity (TWA)**. La “app” de Play abre tu sitio en **Chrome a pantalla completa**; sigues desplegando solo Kaviro (Next.js). No hay cuotas recurrentes a terceros: solo la **cuota única de registro** de Google Play (consulta el precio actual en [Google Play Console](https://play.google.com/console)).

## Requisitos previos

1. Dominio en **HTTPS** con la app en producción (p. ej. Vercel).
2. Manifiesto PWA en `https://TU_DOMINIO/manifest.webmanifest` (Next ya lo sirve).
3. Iconos **192** y **512** en `public/icons/` (generar con `npm run icons:generate` tras cambiar `icon.svg`).

## 1. Herramientas en tu PC

- **Node.js** (ya lo usas).
- **JDK 17** y **Android SDK** (Android Studio instala el SDK; para solo firmar, suele bastar con lo que Bubblewrap te pida instalar).
- Cuenta de **Google Play Console** (pago único de desarrollador).

Instalar Bubblewrap (CLI oficial de Google):

```bash
npm install -g @bubblewrap/cli
```

## 2. Crear el proyecto Android (TWA)

En una carpeta **fuera** del repo (p. ej. `~/apps/kaviro-android`):

```bash
mkdir -p ~/apps/kaviro-android && cd ~/apps/kaviro-android
bubblewrap init --manifest=https://TU_DOMINIO/manifest.webmanifest
```

Responde al asistente (nombre de app, package name tipo `com.tudominio.tripboard`, etc.). Generará keystore la primera vez: **guarda la contraseña y el archivo** en lugar seguro.

## 3. Digital Asset Links (obligatorio para TWA)

Android debe comprobar que tu dominio autoriza esa app.

1. Obtén el **SHA-256** del certificado con el que firmas el **release** (Bubblewrap / Play App Signing te darán huellas; para depuración local usa la huella del keystore de debug que indique la documentación de Bubblewrap).
2. Copia en el repo web:

   ```text
   public/.well-known/assetlinks.json.example  →  public/.well-known/assetlinks.json
   ```

3. Sustituye `TU.PACKAGE.NAME_AQUI` y `AA:BB:...` por el **package name** y la huella **SHA-256** (sin espacios o con dos puntos, según pida la herramienta de verificación de Google).

4. Despliega y comprueba en el navegador:

   `https://TU_DOMINIO/.well-known/assetlinks.json`

   Debe servirse como JSON (Next ya envía `Content-Type` adecuado en `next.config.mjs`).

Verificación: [Statement List Generator and Tester](https://developers.google.com/digital-asset-links/tools/generator) (Google).

## 4. Build y subida a Play

Dentro de la carpeta generada por Bubblewrap:

```bash
bubblewrap build
bubblewrap install   # opcional: probar en dispositivo USB
```

Sube el **.aab** (Android App Bundle) a Play Console (prueba interna primero). Completa ficha, **política de privacidad**, Data safety y clasificación de contenido.

## 5. Mantenimiento

- Cambios en la web: **no hace falta** resubir la app salvo que cambies `start_url`/scope críticos o el package; igual conviene subir una nueva versión si subes `targetSdk` por requisito de Play.
- Si cambias el icono vectorial, ejecuta `npm run icons:generate` y despliega la web.

## Alternativa sin CLI (misma idea)

[PWA Builder](https://www.pwabuilder.com/) puede generar un paquete TWA a partir de la URL; el flujo de **asset links** y Play Console es el mismo.
