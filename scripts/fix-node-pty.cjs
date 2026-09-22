const fs = require('node:fs');
const path = require('node:path');

for (const architecture of ['darwin-arm64', 'darwin-x64']) {
  const helper = path.join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds', architecture, 'spawn-helper');
  if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
}
