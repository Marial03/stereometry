// Скрипт сборки автономного однофайлового приложения Сечения_3D_Для_Учеников.html
const fs = require('fs');
const path = require('path');

const dir = __dirname;
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(dir, 'css/styles.css'), 'utf8');

html = html.replace(
  '<link rel="stylesheet" href="css/styles.css" />',
  () => `<style>\n${css}\n</style>`
);

const scripts = [
  'js/math3d.js',
  'js/solids.js',
  'js/constructionEngine.js',
  'js/presets.js',
  'js/renderer3d.js',
  'js/app.js'
];

for (const s of scripts) {
  const code = fs.readFileSync(path.join(dir, s), 'utf8');
  html = html.replace(
    `<script src="${s}"></script>`,
    () => `<script>\n${code}\n</script>`
  );
}

const outPath = path.join(dir, 'Сечения_3D_Для_Учеников.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log('Successfully built:', outPath, 'Size (bytes):', Buffer.byteLength(html, 'utf8'));
