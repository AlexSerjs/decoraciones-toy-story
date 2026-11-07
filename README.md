# Decoraciones Toy Story

Herramientas para preparar etiquetas de botella, círculos, imágenes con tamaño exacto y letras Toy Story, listas para imprimir en A4.

## Instalar (para quien lo use)
1. Entra en la pestaña **Releases** de este repositorio y descarga el instalador de tu ordenador:
   - **Mac**: `Decoraciones-Toy-Story-…-mac-arm64.dmg` (Apple M1 o posterior) o `…-mac-x64.dmg` (Mac Intel).
   - **Windows**: `Decoraciones-Toy-Story-…-win-x64.exe`.
2. Ábrelo e instálalo.
   - **Mac**: arrastra la aplicación a *Aplicaciones*. Como no está firmada con una cuenta de Apple, macOS avisa la primera vez:
     - Intenta abrirla una vez. Luego ve a **Ajustes del Sistema → Privacidad y seguridad**, baja hasta el mensaje sobre «Decoraciones Toy Story» y pulsa **Abrir de todos modos**.
     - Si dice que la app **«está dañada y no se puede abrir»**, abre la app *Terminal* y ejecuta (una sola vez):
       ```bash
       xattr -cr "/Applications/Decoraciones Toy Story.app"
       ```
       Después ábrela normalmente.
   - **Windows**: si aparece «Windows protegió su PC», pulsa **Más información → Ejecutar de todas formas**.
3. Abre el programa y entra en **⚙ Ajustes** (arriba a la derecha) para elegir la carpeta donde se guardan tus imágenes y diseños.

## Actualizar
Dentro del programa: **⚙ Ajustes → Actualizar el programa → Buscar actualización**. Si hay una versión nueva, la descarga y abre el instalador.
No hace falta ninguna cuenta ni clave.

## Quitar fondos de imágenes
Se hace con remove.bg y necesita tu propia clave gratuita:
1. Crea una cuenta gratuita en <https://www.remove.bg/api>.
2. En «Mi panel» → «Clave de API» → **Nueva clave de API**.
3. Pega la clave en **⚙ Ajustes** del programa y pulsa **Guardar**.

La clave se guarda solo en tu ordenador (no en la carpeta de datos ni en este repositorio). Con la cuenta gratuita las imágenes salen en resolución reducida.
Si el fondo es de un solo color, se quita sin clave.

## Usar desde el código
Requiere [Node.js](https://nodejs.org).
```bash
npm install
npm start          # abre el programa
npm run prueba     # pruebas automáticas (carpeta temporal)
npm run empaquetar # genera el instalador de tu sistema en dist/
```
También hay `iniciar-app.command` (Mac): se actualiza con `git pull` y abre el programa.

## Publicar una versión nueva
```bash
# 1) cambia "version" en package.json  2) súbelo  3) crea la etiqueta:
git tag v1.0.1 && git push origin v1.0.1
```
GitHub construye los instaladores de Mac y Windows y los pone en **Releases**.

## Datos
Todo lo que haces se guarda en la carpeta elegida en Ajustes (por defecto `Documentos/Decoraciones Toy Story`):
`imagenes/originales`, `imagenes/sin-fondo`, `disenos` y `datos`. Actualizar el programa no la toca.
