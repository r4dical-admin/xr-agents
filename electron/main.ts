import { app, BrowserWindow, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as pty from 'node-pty';
import { HeadTracker } from './tracking';
import { CodexAppServer } from './codex';

let window: BrowserWindow | null = null;
const tracker = new HeadTracker(value => { if (window && !window.isDestroyed()) window.webContents.send('tracking:pose', value); });
const codex = new CodexAppServer(
  status => { if (window && !window.isDestroyed()) window.webContents.send('codex:status', status); },
  event => { if (window && !window.isDestroyed()) window.webContents.send('codex:event', event); }
);
const projectRootsByTask = new Map<string, string>();
const terminals = new Map<string, { taskId: string; process: pty.IPty }>();
function stopTerminals() { for (const terminal of terminals.values()) try { terminal.process.kill(); } catch {} terminals.clear(); }
function rememberTask(value: unknown) {
  if (!value || typeof value !== 'object') return;
  const task = value as Record<string, unknown>;
  if (typeof task.id === 'string' && typeof task.cwd === 'string' && path.isAbsolute(task.cwd)) projectRootsByTask.set(task.id, path.resolve(task.cwd));
}
function rememberTaskResult(value: unknown) {
  if (!value || typeof value !== 'object') return;
  const result = value as Record<string, unknown>;
  rememberTask(result.task);
  for (const key of ['tasks', 'threads']) if (Array.isArray(result[key])) for (const task of result[key]) rememberTask(task);
}
ipcMain.handle('tracking:control', (event, command: unknown) => {
  if (event.sender !== window?.webContents) return;
  if (command === 'connect') tracker.start();
  if (command === 'disconnect') tracker.stop();
  if (command === 'recenter') tracker.recenter();
});
ipcMain.handle('codex:connect', async event => {
  if (event.sender !== window?.webContents) throw new Error('Invalid Codex connection request.');
  const result = await codex.connect(); rememberTaskResult(result); return result;
});
ipcMain.handle('codex:disconnect', event => {
  if (event.sender !== window?.webContents) return;
  codex.stop();
});
ipcMain.handle('codex:list', async (event, cursor: unknown) => {
  if (event.sender !== window?.webContents) throw new Error('Invalid sender');
  const result = await codex.listTasks(cursor); rememberTaskResult(result); return result;
});
ipcMain.handle('codex:read', async (event, id: unknown) => {
  if (event.sender !== window?.webContents) throw new Error('Invalid sender');
  const result = await codex.readTask(id); rememberTaskResult(result); return result;
});
ipcMain.handle('codex:resume', async (event, id: unknown) => {
  if (event.sender !== window?.webContents) throw new Error('Invalid sender');
  const result = await codex.resumeTask(id); rememberTaskResult(result); return result;
});
ipcMain.handle('codex:create', async (event, cwd: unknown) => {
  if (event.sender !== window?.webContents) throw new Error('Invalid sender');
  if (typeof cwd !== 'string' || ![...projectRootsByTask.values()].includes(path.resolve(cwd))) throw new Error('Project is not registered by Codex.');
  const result = await codex.createTask(cwd); rememberTaskResult(result); return result;
});
ipcMain.handle('codex:prompt', (event, id: unknown, text: unknown) => {
  if (event.sender !== window?.webContents) throw new Error('Invalid sender');
  return codex.prompt(id, text);
});
ipcMain.handle('codex:interrupt', (event, id: unknown) => {
  if (event.sender !== window?.webContents) throw new Error('Invalid sender');
  return codex.interrupt(id);
});
ipcMain.handle('codex:approval', (event, requestId: unknown, decision: unknown) => {
  if (event.sender !== window?.webContents) throw new Error('Invalid sender');
  return codex.resolveApproval(requestId, decision);
});

type ProjectEntry = { name: string; path: string; type: 'file' | 'directory'; children?: ProjectEntry[] };
const hiddenProjectFolders = new Set(['.git', 'node_modules', 'dist', 'dist-electron', '.tmp']);

function projectPath(taskIdValue: unknown, relativeValue: unknown = ''): { root: string; target: string } {
  if (typeof taskIdValue !== 'string') throw new Error('A valid Codex task is required.');
  if (typeof relativeValue !== 'string') throw new Error('Invalid project path.');
  const root = projectRootsByTask.get(taskIdValue);
  if (!root) throw new Error('Project root is not registered for this task.');
  const target = path.resolve(root, relativeValue);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Path is outside the selected project.');
  return { root, target };
}

async function listProjectDirectory(root: string, directory: string, depth: number): Promise<ProjectEntry[]> {
  if (depth > 4) return [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const visible = entries.filter(entry => !hiddenProjectFolders.has(entry.name) && !entry.isSymbolicLink()).slice(0, 250);
  return Promise.all(visible.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name)).map(async entry => {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute);
    if (!entry.isDirectory()) return { name: entry.name, path: relative, type: 'file' as const };
    return { name: entry.name, path: relative, type: 'directory' as const, children: await listProjectDirectory(root, absolute, depth + 1) };
  }));
}

ipcMain.handle('project:list-files', async (event, taskId: unknown) => {
  if (event.sender !== window?.webContents) throw new Error('Invalid sender');
  const { root } = projectPath(taskId);
  return listProjectDirectory(root, root, 0);
});

ipcMain.handle('project:read-file', async (event, taskId: unknown, relativeValue: unknown) => {
  if (event.sender !== window?.webContents) throw new Error('Invalid sender');
  const { root, target } = projectPath(taskId, relativeValue);
  const [realRoot, realTarget] = await Promise.all([fs.realpath(root), fs.realpath(target)]);
  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + path.sep)) throw new Error('Resolved file is outside the selected project.');
  const info = await fs.stat(realTarget);
  if (!info.isFile()) throw new Error('The selected path is not a file.');
  const limit = 256 * 1024;
  const handle = await fs.open(realTarget, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(info.size, limit));
    await handle.read(buffer, 0, buffer.length, 0);
    return { path: String(relativeValue), content: buffer.toString('utf8'), size: info.size, truncated: info.size > limit };
  } finally { await handle.close(); }
});
ipcMain.handle('terminal:start', (event, taskId: unknown) => {
  if (event.sender !== window?.webContents) throw new Error('Invalid sender');
  const { root } = projectPath(taskId);
  const existing = [...terminals.entries()].find(([, terminal]) => terminal.taskId === taskId);
  if (existing) return { id: existing[0], shell: existing[1].process.process };
  const id = randomUUID();
  const shell = process.env.SHELL?.startsWith('/') ? process.env.SHELL : '/bin/zsh';
  const terminal = pty.spawn(shell, ['-l'], { name: 'xterm-256color', cols: 92, rows: 28, cwd: root, env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } });
  terminals.set(id, { taskId: String(taskId), process: terminal });
  terminal.onData(data => { if (window && !window.isDestroyed()) window.webContents.send('terminal:data', { id, taskId, data }); });
  terminal.onExit(({ exitCode, signal }) => { terminals.delete(id); if (window && !window.isDestroyed()) window.webContents.send('terminal:exit', { id, taskId, exitCode, signal }); });
  return { id, shell };
});
ipcMain.handle('terminal:write', (event, id: unknown, data: unknown) => {
  if (event.sender !== window?.webContents || typeof id !== 'string' || typeof data !== 'string' || data.length > 65536) throw new Error('Invalid terminal input.');
  const terminal = terminals.get(id); if (!terminal) throw new Error('Terminal is not running.'); terminal.process.write(data);
});
ipcMain.handle('terminal:resize', (event, id: unknown, cols: unknown, rows: unknown) => {
  if (event.sender !== window?.webContents || typeof id !== 'string' || typeof cols !== 'number' || typeof rows !== 'number') throw new Error('Invalid terminal resize.');
  terminals.get(id)?.process.resize(Math.max(20, Math.min(240, Math.floor(cols))), Math.max(5, Math.min(100, Math.floor(rows))));
});
ipcMain.handle('terminal:stop', (event, id: unknown) => {
  if (event.sender !== window?.webContents || typeof id !== 'string') throw new Error('Invalid terminal request.');
  const terminal = terminals.get(id); if (terminal) { terminal.process.kill(); terminals.delete(id); }
});
app.on('before-quit', () => { tracker.stop(); codex.stop(); stopTerminals(); });

function createWindow(): void {
  window = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#02080f',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.on('closed', () => { tracker.stop(); codex.stop(); stopTerminals(); window = null; });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void window.loadURL(devUrl);
  else void window.loadFile(path.join(__dirname, '../dist/index.html'));
}

ipcMain.handle('window:toggle-fullscreen', () => {
  if (!window) return false;
  window.setFullScreen(!window.isFullScreen());
  return window.isFullScreen();
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
