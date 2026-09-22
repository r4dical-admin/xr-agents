const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const task = {
  id: 'preview-task', title: 'Refine spatial workspace', preview: 'Update the panoramic interface',
  cwd: '/workspace/xr-agents', branch: 'main', status: 'active', source: 'app', model: 'gpt-6-astra'
};
const review = {
  id: 'review-task', title: 'Review head tracking', preview: 'Check view projection',
  cwd: '/workspace/xr-agents', branch: 'main', status: 'idle', source: 'app', model: 'gpt-6-astra'
};
const content = {
  task,
  items: [
    { id: 'u1', kind: 'user', text: 'Put projects and chats on the left and the workspace inspector on the right.' },
    { id: 'a1', kind: 'assistant', text: 'I updated the spatial layout and corrected the horizontal head-tracking projection.' },
    { id: 'f1', kind: 'file', text: 'src/headView.ts', status: 'completed', detail: '@@ viewFromAngles @@\n- x: Math.tan(this.yaw) * focal\n+ x: -Math.tan(this.yaw) * focal' },
    { id: 'f2', kind: 'file', text: 'src/liveWorkspace.ts', status: 'completed', detail: '+ Project and chat library\n+ Files, activity and terminal inspector' },
    { id: 'c1', kind: 'command', text: 'npm run check', status: 'completed · exit 0', detail: 'Test Files  4 passed\nTests  11 passed\n✓ built in 774ms' }
  ]
};

app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1680, height: 1000, show: false, backgroundColor: '#02080f' });
  window.webContents.on('console-message', details => console.log('renderer:', details.level, details.message));
  await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await new Promise(resolve => setTimeout(resolve, 800));
  const injected = await window.webContents.executeJavaScript(`(() => { try { window.spatialDesktop = {
    connectCodex: async () => ({ connected: true, mode: 'desktop-service', threads: ${JSON.stringify([task, review])}, nextCursor: null }),
    listCodexTasks: async () => ({ tasks: ${JSON.stringify([task, review])}, nextCursor: null }),
    readCodexTask: async () => (${JSON.stringify(content)}),
    resumeCodexTask: async () => (${JSON.stringify(content)}),
    createCodexTask: async () => (${JSON.stringify(content)}),
    promptCodex: async () => ({ turnId: 'preview-turn', mode: 'start' }), interruptCodex: async () => {}, resolveCodexApproval: async () => {},
    onCodexEvent: () => () => {}, onCodexStatus: () => () => {}, onPose: () => () => {}, toggleFullscreen: async () => {}, trackingControl: async () => ({})
  }; return 'ok'; } catch (error) { return String(error && error.stack || error); } })()`);
  if (injected !== 'ok') console.error('bridge injection failed', injected);
  try { await window.webContents.executeJavaScript(`document.getElementById('connect-codex').click(); true;`); } catch (error) { console.error('connect click failed', error); }
  await new Promise(resolve => setTimeout(resolve, 1200));
  const image = await window.webContents.capturePage();
  const output = path.join(__dirname, '..', 'docs', 'live-workspace-preview.png');
  fs.writeFileSync(output, image.toPNG());
  console.log(output);
  app.quit();
});
