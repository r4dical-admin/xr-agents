import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('spatialDesktop', {
  platform: process.platform,
  trackingControl: (command: string) => ipcRenderer.invoke('tracking:control', command),
  onPose: (callback: (pose: unknown) => void) => {
    const listener = (_event: unknown, pose: unknown) => callback(pose);
    ipcRenderer.on('tracking:pose', listener);
    return () => ipcRenderer.removeListener('tracking:pose', listener);
  },
  connectCodex: () => ipcRenderer.invoke('codex:connect'),
  listCodexTasks: (cursor?: string) => ipcRenderer.invoke('codex:list', cursor),
  readCodexTask: (id: string) => ipcRenderer.invoke('codex:read', id),
  resumeCodexTask: (id: string) => ipcRenderer.invoke('codex:resume', id),
  createCodexTask: (cwd: string) => ipcRenderer.invoke('codex:create', cwd),
  promptCodex: (id: string, text: string) => ipcRenderer.invoke('codex:prompt', id, text),
  interruptCodex: (id: string) => ipcRenderer.invoke('codex:interrupt', id),
  resolveCodexApproval: (requestId: string, decision: string) => ipcRenderer.invoke('codex:approval', requestId, decision),
  listProjectFiles: (taskId: string) => ipcRenderer.invoke('project:list-files', taskId),
  readProjectFile: (taskId: string, relativePath: string) => ipcRenderer.invoke('project:read-file', taskId, relativePath),
  startTerminal: (taskId: string) => ipcRenderer.invoke('terminal:start', taskId),
  writeTerminal: (id: string, data: string) => ipcRenderer.invoke('terminal:write', id, data),
  resizeTerminal: (id: string, cols: number, rows: number) => ipcRenderer.invoke('terminal:resize', id, cols, rows),
  stopTerminal: (id: string) => ipcRenderer.invoke('terminal:stop', id),
  onTerminalData: (callback: (event: unknown) => void) => {
    const listener = (_event: unknown, value: unknown) => callback(value);
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  onTerminalExit: (callback: (event: unknown) => void) => {
    const listener = (_event: unknown, value: unknown) => callback(value);
    ipcRenderer.on('terminal:exit', listener);
    return () => ipcRenderer.removeListener('terminal:exit', listener);
  },
  disconnectCodex: () => ipcRenderer.invoke('codex:disconnect'),
  onCodexStatus: (callback: (status: string) => void) => {
    const listener = (_event: unknown, status: string) => callback(status);
    ipcRenderer.on('codex:status', listener);
    return () => ipcRenderer.removeListener('codex:status', listener);
  },
  onCodexEvent: (callback: (event: unknown) => void) => {
    const listener = (_event: unknown, value: unknown) => callback(value);
    ipcRenderer.on('codex:event', listener);
    return () => ipcRenderer.removeListener('codex:event', listener);
  },
  toggleFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:toggle-fullscreen')
});

declare global {
  interface Window {
    spatialDesktop: {
      platform: string;
      toggleFullscreen(): Promise<boolean>;
      trackingControl(command: string): Promise<void>;
      onPose(callback: (pose: unknown) => void): () => void;
      connectCodex(): Promise<unknown>;
      resumeCodexTask(id: string): Promise<unknown>;
      createCodexTask(cwd: string): Promise<unknown>;
      promptCodex(id: string, text: string): Promise<unknown>;
      interruptCodex(id: string): Promise<void>;
      resolveCodexApproval(requestId: string, decision: string): Promise<void>;
      listProjectFiles(taskId: string): Promise<unknown>;
      readProjectFile(taskId: string, relativePath: string): Promise<unknown>;
      startTerminal(taskId: string): Promise<unknown>;
      writeTerminal(id: string, data: string): Promise<void>;
      resizeTerminal(id: string, cols: number, rows: number): Promise<void>;
      stopTerminal(id: string): Promise<void>;
      onTerminalData(callback: (event: unknown) => void): () => void;
      onTerminalExit(callback: (event: unknown) => void): () => void;
      disconnectCodex(): Promise<void>;
      onCodexStatus(callback: (status: string) => void): () => void;
      onCodexEvent(callback: (event: unknown) => void): () => void;
    };
  }
}
