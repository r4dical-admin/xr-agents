const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const frames = path.join(root, '.tmp', 'polished-demo-frames');
const fullUiScreenshot = path.join(root, 'media', 'screenshots', 'full-ui.png');
const fps = 15;
const seconds = 23;
const totalFrames = fps * seconds;
const wait = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));

const task = {
  id: 'demo-main', title: 'Build spatial agent workspace', preview: 'Refine the panoramic developer environment',
  cwd: '/workspace/xr-agents', branch: 'feature/spatial-shell', status: 'idle', source: 'appServer', model: 'gpt-6-astra'
};
const tasks = [
  task,
  { id: 'demo-review', title: 'Review interaction architecture', preview: 'Check input and anchoring boundaries', cwd: '/workspace/xr-agents', branch: 'review/interaction', status: 'idle', source: 'appServer', model: 'gpt-6-astra' },
  { id: 'demo-bridge', title: 'Normalize provider events', preview: 'Map agent activity into the spatial protocol', cwd: '/workspace/agent-bridge', branch: 'feature/protocol', status: 'active', source: 'appServer', model: 'gpt-6-astra' }
];
const initialContent = {
  task,
  items: [
    { id: 'welcome-user', kind: 'user', text: 'Make agent activity easier to understand in spatial view.' },
    { id: 'welcome-agent', kind: 'assistant', text: 'I’ll refine the workspace, inspect the interaction layer, and verify the result in the Mac simulator.', status: 'completed' }
  ]
};
const projectTree = [
  { name: 'src', path: 'src', type: 'directory', children: [
    { name: 'liveWorkspace.ts', path: 'src/liveWorkspace.ts', type: 'file' },
    { name: 'headView.ts', path: 'src/headView.ts', type: 'file' },
    { name: 'styles.css', path: 'src/styles.css', type: 'file' }
  ] },
  { name: 'electron', path: 'electron', type: 'directory', children: [
    { name: 'codex.ts', path: 'electron/codex.ts', type: 'file' },
    { name: 'tracking.ts', path: 'electron/tracking.ts', type: 'file' }
  ] },
  { name: 'README.md', path: 'README.md', type: 'file' }
];
const sources = {
  'src/liveWorkspace.ts': `export class LiveWorkspace {\n  private sessions = new Map<string, AgentSession>();\n  private inspector: InspectorKind = 'files';\n\n  handle(event: SpatialAgentEvent) {\n    this.sessions.get(event.sessionId)?.apply(event);\n    this.renderSpatialActivity(event);\n  }\n}`,
  'src/headView.ts': `export class HeadView {\n  update(yaw: number, pitch: number, dt: number) {\n    const alpha = 1 - Math.exp(-dt / 0.025);\n    this.yaw += (yaw - this.yaw) * alpha;\n    this.pitch += (pitch - this.pitch) * alpha;\n  }\n}`,
  'src/styles.css': `.workspace-view {\n  width: 190vw;\n  transform-origin: 50% 50%;\n}\n\n.context-rail, .sessions-rail {\n  backdrop-filter: blur(18px);\n}`,
  'README.md': '# Spatial Agent IDE\n\nA spatial shell for AI-assisted software development.'
};

async function runJs(window, source) {
  return window.webContents.executeJavaScript(source, true);
}

async function emit(window, event) {
  await runJs(window, `window.__demoEmit(${JSON.stringify(event)})`);
}

async function pan(window, movementX, movementY = 0) {
  await runJs(window, `window.__demoPan(${movementX}, ${movementY})`);
}

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

app.whenReady().then(async () => {
  fs.rmSync(frames, { recursive: true, force: true });
  fs.mkdirSync(frames, { recursive: true });

  const window = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    backgroundColor: '#02080f',
    webPreferences: { backgroundThrottling: false }
  });
  window.webContents.setZoomFactor(1);
  await window.loadFile(path.join(root, 'dist', 'index.html'));
  await wait(900);

  await runJs(window, `(() => {
    window.__demoContent = ${JSON.stringify(initialContent)};
    window.__demoCodexListener = null;
    window.__demoTerminalData = null;
    window.__demoTerminalExit = null;
    window.__demoEmit = event => window.__demoCodexListener?.(event);
    window.__demoTerminal = data => window.__demoTerminalData?.({ id: 'demo-terminal', taskId: 'demo-main', data });
    window.__demoPan = (movementX, movementY) => {
      const event = new PointerEvent('pointermove', { bubbles: true, buttons: 2 });
      Object.defineProperties(event, { movementX: { value: movementX }, movementY: { value: movementY } });
      window.dispatchEvent(event);
    };
    window.spatialDesktop = {
      platform: 'darwin',
      toggleFullscreen: async () => false,
      trackingControl: async () => {},
      onPose: () => () => {},
      connectCodex: async () => ({ connected: true, mode: 'desktop-service', threads: ${JSON.stringify(tasks)}, nextCursor: null }),
      listCodexTasks: async () => ({ tasks: ${JSON.stringify(tasks)}, nextCursor: null }),
      readCodexTask: async () => window.__demoContent,
      resumeCodexTask: async id => id === 'demo-main' ? window.__demoContent : ({ task: ${JSON.stringify(tasks[1])}, items: [] }),
      createCodexTask: async () => window.__demoContent,
      promptCodex: async () => ({ turnId: 'demo-turn', mode: 'start' }),
      interruptCodex: async () => {},
      resolveCodexApproval: async () => {},
      listProjectFiles: async () => ${JSON.stringify(projectTree)},
      readProjectFile: async (_id, file) => ({ path: file, content: (${JSON.stringify(sources)})[file] || '// Preview unavailable', size: 428, truncated: false }),
      startTerminal: async () => ({ id: 'demo-terminal', shell: '/bin/zsh' }),
      writeTerminal: async () => {},
      resizeTerminal: async () => {},
      stopTerminal: async () => {},
      onTerminalData: callback => { window.__demoTerminalData = callback; return () => {}; },
      onTerminalExit: callback => { window.__demoTerminalExit = callback; return () => {}; },
      disconnectCodex: async () => {},
      onCodexStatus: () => () => {},
      onCodexEvent: callback => { window.__demoCodexListener = callback; return () => {}; }
    };
    localStorage.setItem('spatial-font-scale', '1.1');
    localStorage.setItem('spatial-viewport-scale', '0.9');
    return true;
  })()`);

  const actions = new Map();
  const at = (time, action) => actions.set(Math.round(time * fps), action);
  at(1.7, async () => { await runJs(window, `document.getElementById('connect-codex').click()`); await wait(450); });
  at(3.7, async () => pan(window, -115));
  at(5.4, async () => pan(window, 115));
  at(6.0, async () => {
    await runJs(window, `(() => { const input = document.getElementById('live-prompt'); input.value = 'Implement the spatial activity timeline and verify the interaction flow.'; document.getElementById('live-send').click(); })()`);
    await emit(window, { type: 'TURN_STARTED', threadId: 'demo-main', turnId: 'demo-turn', status: 'inProgress' });
    await emit(window, { type: 'TOKEN_USAGE', threadId: 'demo-main', turnId: 'demo-turn', usage: { used: 18420, last: 1120, context: 128000, remaining: 109580 } });
  });
  at(7.2, async () => emit(window, { type: 'PLAN_UPDATED', threadId: 'demo-main', turnId: 'demo-turn', itemId: 'demo-plan', delta: '● Inspect the workspace projection\n○ Update activity visualization\n○ Run interaction tests' }));
  at(8.3, async () => {
    await emit(window, { type: 'ITEM_STARTED', threadId: 'demo-main', turnId: 'demo-turn', item: { id: 'file-change', kind: 'file', text: 'src/liveWorkspace.ts', detail: '+ spatial activity timeline\n+ reusable inspector nodes', status: 'inProgress' } });
    await emit(window, { type: 'DIFF_UPDATED', threadId: 'demo-main', turnId: 'demo-turn', diff: 'diff --git a/src/liveWorkspace.ts b/src/liveWorkspace.ts\n+ renderSpatialActivity(event);' });
    await pan(window, -155);
  });
  at(9.6, async () => runJs(window, `document.querySelector('.tree-file')?.click()`));
  at(10.8, async () => {
    await runJs(window, `document.getElementById('tool-add')?.click(); document.querySelector('[data-tool="activity"]')?.click()`);
    await emit(window, { type: 'ITEM_STARTED', threadId: 'demo-main', turnId: 'demo-turn', item: { id: 'test-command', kind: 'command', text: 'npm run check', detail: '', status: 'inProgress' } });
    await emit(window, { type: 'COMMAND_OUTPUT', threadId: 'demo-main', turnId: 'demo-turn', itemId: 'test-command', delta: 'Test Files  4 passed\nTests      15 passed\n' });
  });
  at(12.1, async () => emit(window, { type: 'APPROVAL_REQUESTED', threadId: 'demo-main', turnId: 'demo-turn', itemId: 'install-ws', approval: { requestId: 'demo-approval', kind: 'command', title: 'Allow command?', command: 'npm install ws', reason: 'Install the WebSocket transport used by the local bridge.', allowSession: true } }));
  at(14.0, async () => {
    await runJs(window, `document.getElementById('allow')?.click()`);
    await emit(window, { type: 'APPROVAL_RESOLVED', threadId: 'demo-main', turnId: 'demo-turn', itemId: 'demo-approval' });
  });
  at(14.8, async () => {
    await runJs(window, `document.getElementById('tool-add')?.click(); document.querySelector('[data-tool="terminal"]')?.click()`);
    await wait(200);
    await runJs(window, `window.__demoTerminal('xr-agents % npm run check\\r\\n\\r\\n RUN  v4.1.11\\r\\n ✓ 15 tests passed\\r\\n ✓ production build complete\\r\\n\\r\\nxr-agents % ')`);
  });
  at(16.8, async () => {
    await emit(window, { type: 'ITEM_COMPLETED', threadId: 'demo-main', turnId: 'demo-turn', item: { id: 'test-command', kind: 'command', text: 'npm run check', detail: 'Test Files  4 passed\nTests      15 passed\n✓ production build complete', status: 'completed · exit 0' } });
    await emit(window, { type: 'TOKEN_USAGE', threadId: 'demo-main', turnId: 'demo-turn', usage: { used: 22480, last: 4060, context: 128000, remaining: 105520 } });
  });
  at(17.8, async () => pan(window, 155));
  at(18.5, async () => {
    await emit(window, { type: 'PLAN_UPDATED', threadId: 'demo-main', turnId: 'demo-turn', itemId: 'demo-plan', delta: '✓ Inspect the workspace projection\n✓ Update activity visualization\n✓ Run interaction tests' });
    await emit(window, { type: 'ITEM_STARTED', threadId: 'demo-main', turnId: 'demo-turn', item: { id: 'final-message', kind: 'assistant', text: '', status: 'inProgress' } });
    await emit(window, { type: 'MESSAGE_DELTA', threadId: 'demo-main', turnId: 'demo-turn', itemId: 'final-message', delta: 'The spatial activity timeline is implemented. All 15 tests pass, and the production build is ready.' });
  });
  at(20.0, async () => {
    await emit(window, { type: 'TURN_COMPLETED', threadId: 'demo-main', turnId: 'demo-turn', status: 'completed' });
  });
  at(21.0, async () => pan(window, 0, -80));

  const started = Date.now();
  for (let frame = 0; frame < totalFrames; frame++) {
    const action = actions.get(frame);
    if (action) await action();
    const target = started + frame * (1000 / fps);
    await wait(target - Date.now());
    const image = await window.webContents.capturePage();
    fs.writeFileSync(path.join(frames, `frame-${String(frame).padStart(4, '0')}.jpg`), image.toJPEG(88));
  }

  await runJs(window, `(() => {
    const overview = document.createElement('style');
    overview.id = 'full-ui-overview';
    overview.textContent = '#workspace.live-workspace { transform: scale(.49) !important; }';
    document.head.append(overview);
    return true;
  })()`);
  await wait(500);
  const overview = await window.webContents.capturePage();
  fs.writeFileSync(fullUiScreenshot, overview.toPNG());

  console.log(`${frames}\n${totalFrames} frames at ${fps} fps\n${fullUiScreenshot}`);
  window.destroy();
  app.quit();
});
