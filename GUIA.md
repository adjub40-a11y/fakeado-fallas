# ¡Fakeado! Fallas · Guía para publicarlo en Google Play y App Store

> Esta app es independiente de ¡Fakeado!: tiene su propio identificador (`es.fakeado.fallas`), su propia ficha y su propia compra (`fallas_todo`). Puede usar **el mismo proyecto de Firebase, la misma cuenta de Codemagic y la misma llave de Android** que ¡Fakeado!: si ya hiciste esas fases, salta directamente a crear la app en cada tienda.

Esta guía está pensada para hacerlo **sin Mac y sin programar**. Todo se compila en la nube con Codemagic. Sigue las fases en orden: cada una deja preparado lo que necesita la siguiente.

| Fase | Qué haces | Tiempo | Coste |
| --- | --- | --- | --- |
| 1 | Firebase (servidor de las partidas) | 20 min | Gratis |
| 2 | GitHub (guardar el código) | 15 min | Gratis |
| 3 | Codemagic (compilar) y versión web | 30 min | Gratis (500 min/mes) |
| 4 | Google Play | 1 h + 14 días de prueba | 25 $ una vez |
| 5 | App Store | 1–2 h + revisión de 1–3 días | 99 € al año |

---

## Qué hay en la carpeta

- `src/` — el juego (React + TypeScript). `src/data/raw/*.txt` son las preguntas, una por línea.
- `android/` e `ios/` — los proyectos nativos (Capacitor). No hace falta tocarlos.
- `codemagic.yaml` — las recetas de compilación en la nube.
- `database.rules.json` — reglas de seguridad de Firebase.
- `store/` — textos de las fichas y capturas de pantalla ya hechas a los tamaños que piden las tiendas.
- `public/privacidad.html` — política de privacidad (se publica con la web).
- **No está en la carpeta:** la llave de Android (`fakeado-upload.keystore`) va aparte. Guárdala en un sitio seguro.

Datos fijos de la app: identificador **`es.fakeado.fallas`** · producto de compra **`fallas_todo`** (0,99 €).

> Antes de nada, revisa en `public/privacidad.html` el correo de contacto (he puesto el tuyo de Gmail). Cámbialo si prefieres otro.

---

## Fase 1 · Firebase

1. Entra en [console.firebase.google.com](https://console.firebase.google.com) con tu cuenta de Google y pulsa **Crear un proyecto**. Nombre: `fakeado`. **Desactiva Google Analytics** (no lo necesitamos y así cumplimos mejor con las normas de apps para niños).
2. Menú **Compilación › Authentication › Comenzar › Método de acceso › Anónimo › Habilitar**.
3. Menú **Compilación › Realtime Database › Crear base de datos**. Ubicación: **Bélgica (europe-west1)**. Empieza en **modo bloqueado**.
4. En la pestaña **Reglas** de Realtime Database, borra lo que hay, pega el contenido de `database.rules.json` y pulsa **Publicar**.
5. Rueda dentada › **Configuración del proyecto › Tus apps › icono `</>` (Web)**. Nombre: `fakeado-web`. Marca **también Firebase Hosting**. Te enseñará un bloque `firebaseConfig`. Apunta estos valores:
   - `apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId`
6. En la misma configuración, pestaña **Cuentas de servicio › Generar nueva clave privada**. Se descarga un archivo `.json`. Guárdalo: lo usarás en la fase 3 para publicar la web.

Tu web quedará en `https://<projectId>.web.app` (por ejemplo `https://fakeado-1234.web.app`).

---

## Fase 2 · GitHub

1. Crea una cuenta en [github.com](https://github.com) si no tienes.
2. Instala [GitHub Desktop](https://desktop.github.com) (Windows o Mac).
3. Descomprime `fakeado-proyecto.zip` en tu ordenador.
4. En GitHub Desktop: **File › Add local repository** › elige la carpeta › te dirá que no es un repositorio: pulsa **create a repository**. Luego **Publish repository** y deja marcado **Keep this code private**.

---

## Fase 3 · Codemagic y versión web

1. Entra en [codemagic.io](https://codemagic.io) con **Sign up with GitHub** y da acceso al repositorio `fakeado`.
2. **Add application › GitHub › fakeado** y como tipo elige **Other** (usa `codemagic.yaml`).
3. En la app, **Environment variables**. Crea estas variables (cada una con su *group*):

| Variable | Valor | Grupo | Secreta |
| --- | --- | --- | --- |
| `VITE_FB_API_KEY` | apiKey | firebase | no |
| `VITE_FB_AUTH_DOMAIN` | authDomain | firebase | no |
| `VITE_FB_DATABASE_URL` | databaseURL | firebase | no |
| `VITE_FB_PROJECT_ID` | projectId | firebase | no |
| `VITE_FB_APP_ID` | appId | firebase | no |
| `VITE_WEB_URL` | `https://<projectId>.web.app` | firebase | no |
| `FIREBASE_SERVICE_ACCOUNT` | pega **todo** el contenido del `.json` de la fase 1 | firebase_deploy | **sí** |

4. **Start new build › web-deploy**. Tarda unos 5 minutos. Al terminar abre `https://<projectId>.web.app`: ya puedes jugar desde el ordenador, y `https://<projectId>.web.app/privacidad.html` es la URL de privacidad para las tiendas.

**Prueba rápida:** abre la web en el ordenador, **Crear partida › Como pantalla grande**, y únete desde dos móviles con el navegador escaneando el QR. Si funciona, el servidor está listo.

---

## Fase 4 · Google Play

### 4.1 Cuenta (una vez)
1. [play.google.com/console](https://play.google.com/console) › cuenta **Personal** › paga 25 $ › verifica tu identidad con el DNI y tu móvil Android (te lo pedirá con la app Play Console).
2. **Configuración › Perfil de pagos**: rellénalo para poder cobrar la compra de 0,99 €. Activa el **programa de pequeñas empresas (15 %)** en Configuración › Comisión de servicio.

### 4.2 Llave de firma en Codemagic
1. Codemagic › **Team settings › Code signing identities › Android keystores › Upload**.
2. Sube `fakeado-upload.keystore`, *Reference name* **`fakeado_upload`** y las contraseñas y alias del archivo `LLAVE-ANDROID-LEEME.txt`.

### 4.3 Primera versión
1. Codemagic › **Start new build › android-aab-only**. Al acabar, descarga el `.aab` de *Artifacts*.
2. Play Console › **Crear aplicación**: nombre `¡Fakeado! Fallas`, idioma Español (España), **Juego**, **Gratuita**.
3. **Probar y publicar › Pruebas › Prueba interna › Crear versión** › sube el `.aab` › acepta **Firma de aplicaciones de Play** › guarda y publica para ti mismo (añádete como testador).
4. Ahora ya puedes crear el producto: **Monetizar › Productos › Productos integrados en la aplicación › Crear**: ID `fallas_todo`, 0,99 €. Actívalo.
5. Rellena **Panel › Configurar tu aplicación** usando `store/textos-fichas.md`: política de privacidad, anuncios (no), acceso a la app (todo accesible), clasificación de contenido, público objetivo, seguridad de los datos, categoría y ficha. Capturas: carpeta `store/capturas/telefono-android` (teléfono) y `tablet-android-10` (tablets de 7" y 10"). Icono 512×512: `public/icon-512.png`. Imagen destacada 1024×500: `store/imagen-destacada.png`.

### 4.4 Prueba cerrada obligatoria (cuentas personales)
Google exige **al menos 12 testers apuntados durante 14 días seguidos** antes de publicar.
1. **Pruebas › Prueba cerrada › Crear canal** › sube la misma versión.
2. **Testers**: crea una lista con los correos de Gmail de **15–20 personas** (familia, compañeros de Digital Value, amigos con hijos). Si alguien se da de baja y bajáis de 12, el contador vuelve a empezar.
3. Envíales el enlace de "unirse a la prueba" y pídeles que instalen la app y jueguen alguna partida.
4. Pasados 14 días aparece **Solicitar acceso a producción**. Responde con detalle qué probasteis y qué cambiaste.

### 4.5 Publicar y actualizar
- Tras la aprobación: **Producción › Crear versión**, país España (o todos), y lanzamiento escalonado al 20 % si quieres.
- Para que Codemagic suba solo las siguientes versiones: Play Console › **Usuarios y permisos** › invita la cuenta de servicio de Google Cloud con permiso de *Publicar en canales de prueba*; guarda su `.json` como variable `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS` (grupo `google_play`, secreta) y usa el flujo **android-release**.

---

## Fase 5 · App Store

### 5.1 Cuenta (una vez)
1. [developer.apple.com/programs](https://developer.apple.com/programs/) › **Enroll** como **Individual** con tu Apple ID. 99 € al año. Apple puede tardar 1–2 días en aprobarlo.
2. [App Store Connect](https://appstoreconnect.apple.com) › **Acuerdos, impuestos y banca**: firma el acuerdo de **apps de pago** (necesario para la compra de 0,99 €), rellena datos fiscales y cuenta bancaria. Solicita el **programa para pequeñas empresas** (15 %).
3. **Estado de comerciante (UE)**: como cobras por la app, declárate **comerciante**. Apple mostrará en la ficha tu dirección, teléfono y correo: valora usar datos profesionales.

### 5.2 Identificador y llave para Codemagic
1. developer.apple.com › **Certificates, IDs & Profiles › Identifiers › +** › App IDs › App: descripción `Fakeado`, Bundle ID explícito **`es.fakeado.fallas`**. Deja marcado **In-App Purchase**.
2. App Store Connect › **Usuarios y acceso › Integraciones › Claves de API del equipo › +**: nombre `Codemagic`, acceso **App Manager**. Descarga el archivo `.p8` (solo se puede una vez) y apunta *Issuer ID* y *Key ID*.
3. Codemagic › **Team settings › Integrations › Developer Portal › Connect**: nombre **`Fakeado ASC`**, pega Issuer ID, Key ID y sube el `.p8`.
4. Codemagic › **Code signing identities › iOS certificates › Generate certificate** (tipo *Apple Distribution*) usando esa integración. Después **iOS provisioning profiles › Fetch profiles** y elige el de `es.fakeado.fallas` (tipo App Store). Si no existe, créalo en developer.apple.com › Profiles › + › App Store Connect, con ese Bundle ID y el certificado nuevo.

### 5.3 Crear la app y compilar
1. App Store Connect › **Apps › + › Nueva app**: plataforma iOS, nombre `¡Fakeado! Fallas`, idioma Español (España), Bundle ID `es.fakeado.fallas`, SKU `fakeado`, acceso completo.
2. En **Información de la app** copia el **Apple ID** numérico y ponlo en `codemagic.yaml` (línea `APP_STORE_APPLE_ID`). Guarda el cambio y súbelo con GitHub Desktop (**Commit** y **Push**).
3. Codemagic › **Start new build › ios-release**. Al terminar, la versión aparece en **TestFlight** en unos 15 minutos. Instala TestFlight en tu iPhone y prueba.
4. **Monetización › Compras dentro de la app › +**: No consumible, ID `fallas_todo`, 0,99 €, con nombre, descripción y una captura (datos en `store/textos-fichas.md`).
5. Ficha de la versión 1.0: textos de `store/textos-fichas.md`, capturas de `store/capturas/iphone-6.9` y `store/capturas/ipad-13`, clasificación por edad, privacidad de la app, notas para el revisor. Elige la compilación de TestFlight y **añade la compra `fallas_todo` a la versión** (la primera compra se revisa junto con la app).
6. **Enviar para revisión.**

---

## Datos falleros (cómo mantenerlos al día)

- **`src/data/historia.json`**: Falleras Mayores (1931-2026), Infantiles (1940-2026) y primeros premios de Sección Especial (1942-2026). Cada año, añade la nueva Fallera Mayor (se elige a mediados de octubre; la de 2027 el 13 de octubre de 2026) y el nuevo primer premio: las preguntas se generan solas al compilar.
- **«La meua falla»**: el bloque `meuaFalla` de `historia.json` es lo que viene rellenado de serie (ahora, Maestro Aguilar-Los Centelles-Matías Perelló, ejercicio 2027). Cada comisión puede cambiarlo desde la app sin tocar el código.
- Las Falleras Mayores Infantiles de los últimos años no salen con nombre (preguntas ni hemeroteca) porque aún son menores; el límite está en 2018.
- **Ninots indultats y fallas municipales**: también en `historia.json`, sacados de los históricos de fallas.com.
- **Premio xupito**: al terminar, si gana un adulto sale «¡Xupito de cassalla!» y si gana un menor «¡Xupito de xocolata!». Se apaga en el inicio («Premio xupito: no»). Si en las tiendas la mención al alcohol sube la edad recomendada (PEGI 12 / Apple 12+) y no lo quieres, cambia `bromes: true` por `bromes: false` en `src/ui/local.ts` para que venga apagado.
- **Música**: `public/music/himne.mp3` (Himne de l'Exposició). Ver `public/music/LICENCIA.txt`.

## Cómo actualizar el juego

- **Añadir preguntas:** edita los archivos de `src/data/raw/` (el formato está en la primera línea de cada archivo). Cada línea es: `nivel | pregunta con ___ | respuesta | otras formas de escribirla | mentiras de la casa | mentiras para peques | dato curioso`. Codemagic comprueba que no haya errores antes de compilar.
- **Publicar la actualización:** sube el cambio con GitHub Desktop y lanza **android-release**, **ios-release** y **web-deploy**. Antes, sube el número de versión en `android/app/build.gradle` (`versionName`) y en App Store Connect crea la versión nueva.

## Probar en tu ordenador (opcional)

Con [Node.js 22](https://nodejs.org) instalado, en la carpeta del proyecto:
```
npm install
copy .env.example .env      (rellena los valores de Firebase)
npm run dev
```
Se abre en `http://localhost:5173`. `npm test` pasa las pruebas automáticas.

## Si algo falla

- **"No se pudo crear la sala"**: revisa que Authentication › Anónimo está habilitado y que las reglas están publicadas.
- **La compra no aparece en Android**: el producto solo funciona con la app instalada desde Google Play (prueba interna o cerrada), no instalando el `.aab` a mano.
- **La compra no aparece en iOS**: falta firmar el acuerdo de apps de pago o el producto no está "Listo para enviar".
- **Apple rechaza por "contenido generado por usuarios"**: responde que las salas son privadas, hay filtro de palabras y el anfitrión puede expulsar jugadores (ya está en las notas para el revisor).
