export {};
declare global {
  interface Window { spatialDesktop?: {
    platform: string;
    toggleFullscreen(): Promise<boolean>;
    trackingControl(command: string): Promise<void>;
    onPose(callback: (pose: { state: string; quaternion?: number[]; timestamp?: number }) => void): () => void;
    connectCodex(): Promise<import('../electron/codexModel').CodexConnection>;
    listCodexTasks(cursor?: string): Promise<import('../electron/codexModel').CodexPage>;
    readCodexTask(id: string): Promise<import('../electron/codexModel').CodexTaskContent>;
    resumeCodexTask(id: string): Promise<import('../electron/codexModel').CodexTaskContent>;
    createCodexTask(cwd: string): Promise<import('../electron/codexModel').CodexTaskContent>;
    promptCodex(id: string, text: string): Promise<{ turnId: string; mode: 'start' | 'steer' }>;
    interruptCodex(id: string): Promise<void>;
    resolveCodexApproval(requestId: string, decision: import('../electron/codexModel').CodexApprovalDecision): Promise<void>;
    listProjectFiles(taskId: string): Promise<Array<{ name: string; path: string; type: 'file' | 'directory'; children?: Array<any> }>>;
    readProjectFile(taskId: string, relativePath: string): Promise<{ path: string; content: string; size: number; truncated: boolean }>;
    startTerminal(taskId: string): Promise<{ id: string; shell: string }>;
    writeTerminal(id: string, data: string): Promise<void>;
    resizeTerminal(id: string, cols: number, rows: number): Promise<void>;
    stopTerminal(id: string): Promise<void>;
    onTerminalData(callback: (event: { id: string; taskId: string; data: string }) => void): () => void;
    onTerminalExit(callback: (event: { id: string; taskId: string; exitCode: number; signal?: number }) => void): () => void;
    disconnectCodex(): Promise<void>;
    onCodexStatus(callback: (status: string) => void): () => void;
    onCodexEvent(callback: (event: import('../electron/codexModel').CodexLiveEvent) => void): () => void;
  } }
}
