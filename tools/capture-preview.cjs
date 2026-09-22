const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1440, height: 900, show: false, backgroundColor: '#02080f' });
  await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await new Promise(resolve => setTimeout(resolve, 1000));
  const image = await window.webContents.capturePage();
  const output = path.join(__dirname, '..', 'docs', 'codex-connect-preview.png');
  fs.writeFileSync(output, image.toPNG());
  console.log(output);
  app.quit();
});
