import type { CodexApproval, CodexApprovalDecision, CodexConnection, CodexItem, CodexLiveEvent, CodexTask, CodexTaskContent } from '../electron/codexModel';

const el = (id: string) => document.getElementById(id)!;
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const state = (value: string) => value === 'notLoaded' ? 'Stored' : value;
const projectName = (task: CodexTask) => task.cwd.split('/').filter(Boolean).pop() || 'No local project';
type InspectorKind = 'files' | 'sidechat' | 'browser' | 'terminal' | 'activity';
type InspectorTab = { id: string; kind: InspectorKind; label: string };
type ProjectEntry = { name: string; path: string; type: 'file' | 'directory'; children?: ProjectEntry[] };

export class LiveWorkspace {
  active = false;
  private tasks: CodexTask[] = [];
  private selected = '';
  private cursor: string | null = null;
  private reading = false;
  private revision = 0;
  private lastContent = '';
  private content?: CodexTaskContent;
  private inspector: InspectorKind = 'files';
  private inspectorTabs: InspectorTab[] = [{ id: 'files', kind: 'files', label: 'Files' }];
  private activeInspectorTab = 'files';
  private tabSequence = 0;
  private selectedFile = '';
  private projectTree: ProjectEntry[] = [];
  private projectTreeRoot = '';
  private projectFile?: { path: string; content: string; size: number; truncated: boolean };
  private browserUrl = 'http://127.0.0.1:5173/';
  private filter = '';
  private running = false;
  private resumed = false;
  private approvals: CodexApproval[] = [];
  private stopEvents?: () => void;
  private stopTerminalData?: () => void;
  private stopTerminalExit?: () => void;
  private lockedByWriter = false;
  private terminalId = '';
  private terminalOutput = '';
  private terminalShell = '';
  private terminalState: 'stopped' | 'starting' | 'running' | 'exited' = 'stopped';
  private usage = { used: 0, last: 0, context: null as number | null, remaining: null as number | null };

  constructor() {
    setInterval(() => {
      if (this.active && !this.running && !document.hidden && this.selected && !el('workspace').classList.contains('hidden')) void this.read(false);
    }, 5000);
  }

  open(connection: CodexConnection) {
    this.active = true;
    this.tasks = connection.threads;
    this.cursor = connection.nextCursor;
    el('workspace').classList.add('live-workspace');
    el('chat-source').textContent = 'CODEX · LIVE APP SERVER';
    document.querySelector('.hud-center span:nth-child(2)')!.textContent = connection.mode === 'desktop-service' ? 'CODEX SERVICE' : 'LOCAL CODEX HISTORY';

    const sessions = el('sessions');
    const exit = el('exit-workspace');
    const left = document.querySelector<HTMLElement>('.context-rail')!;
    left.innerHTML = `<div class="rail-title live-library-title"><span class="eyebrow">CODEX LIBRARY</span><strong>Projects & chats</strong><div class="library-tools"><input id="task-filter" placeholder="Search chats…" aria-label="Search chats"><button id="refresh-tasks" aria-label="Refresh tasks">↻</button></div><small id="live-count"></small></div>`;
    left.append(sessions, exit);

    const right = document.querySelector<HTMLElement>('.sessions-rail')!;
    right.innerHTML = `<div class="rail-title inspector-title"><span class="eyebrow">WORKSPACE TOOLS</span><strong id="live-project">Select a chat</strong><small id="live-path"></small></div><div class="tool-tabbar"><div id="tool-tabs" class="tool-tabs"></div><button id="tool-add" class="tool-add" aria-label="Open tool">+</button><div id="tool-menu" class="tool-menu hidden"><button data-tool="files"><b>▱</b><span>Files<small>Project tree and source preview</small></span></button><button data-tool="sidechat"><b>◉</b><span>Side chat<small>Prompt the active Codex task</small></span></button><button data-tool="browser"><b>◎</b><span>Browser<small>Preview a local or web page</small></span></button><button data-tool="terminal"><b>›_</b><span>Terminal<small>Agent command output</small></span></button><button data-tool="activity"><b>⌁</b><span>Activity<small>Tools, changes and commands</small></span></button></div></div><div id="live-inspector" class="live-inspector"></div>`;
    document.querySelector('.live-status-strip')?.remove();
    document.querySelector('.chat-panel')!.insertAdjacentHTML('beforebegin', `<div class="live-status-strip"><span><small>MODEL</small><b id="stat-model">—</b></span><span><small>CONTEXT</small><b id="stat-context">—</b></span><span><small>TOKENS USED</small><b id="stat-used">—</b></span><span><small>TOKENS LEFT</small><b id="stat-left">—</b></span><span><small>LAST TURN</small><b id="stat-last">—</b></span><span><small>SESSION</small><b id="stat-session">STORED</b></span></div>`);
    document.querySelector('.composer')!.innerHTML = `<div class="live-composer-row"><textarea id="live-prompt" rows="3" wrap="soft" placeholder="Ask Codex…" aria-label="Prompt Codex"></textarea><button id="live-send">SEND ↗<small>ENTER</small></button><button id="live-stop" class="hidden">STOP</button></div><p id="live-turn-status" class="live-notice">Select a chat to begin a live session. Shift+Enter adds a line.</p>`;

    (el('task-filter') as HTMLInputElement).oninput = event => {
      this.filter = (event.currentTarget as HTMLInputElement).value.trim().toLocaleLowerCase();
      this.renderTasks();
    };
    el('refresh-tasks').onclick = () => void this.refreshTasks();
    el('live-send').onclick = () => void this.sendPrompt();
    (el('live-prompt') as HTMLTextAreaElement).onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void this.sendPrompt(); } };
    el('live-stop').onclick = () => void this.interrupt();
    el('allow').onclick = () => void this.resolveApproval('accept');
    el('allow-session').onclick = () => void this.resolveApproval('acceptForSession');
    el('deny').onclick = () => void this.resolveApproval('decline');
    this.stopEvents?.();
    this.stopEvents = window.spatialDesktop!.onCodexEvent(event => this.handleEvent(event));
    this.stopTerminalData?.();
    this.stopTerminalExit?.();
    this.stopTerminalData = window.spatialDesktop!.onTerminalData(event => this.handleTerminalData(event));
    this.stopTerminalExit = window.spatialDesktop!.onTerminalExit(event => this.handleTerminalExit(event));
    el('tool-add').onclick = event => { event.stopPropagation(); el('tool-menu').classList.toggle('hidden'); };
    document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(button => button.onclick = () => this.addInspectorTab(button.dataset.tool as InspectorKind));
    this.renderInspectorTabs();

    this.renderTasks();
    if (this.tasks.length) this.select(this.tasks[0].id);
    else el('chat-messages').textContent = 'No local Codex tasks found. Cloud-only ChatGPT conversations are not exposed by this local App Server.';
  }

  private renderTasks() {
    const visible = this.tasks.filter(task => !this.filter || `${task.title} ${task.cwd} ${task.preview}`.toLocaleLowerCase().includes(this.filter));
    el('live-count').textContent = `${visible.length} OF ${this.tasks.length} CHATS`;
    const list = el('sessions');
    list.replaceChildren();
    const groups = new Map<string, CodexTask[]>();
    for (const task of visible) {
      const key = task.cwd || 'No local project';
      groups.set(key, [...(groups.get(key) || []), task]);
    }
    for (const [path, tasks] of groups) {
      const group = document.createElement('details');
      group.className = 'project-group';
      group.open = true;
      group.innerHTML = `<summary><span class="project-mark">⌘</span><span><strong>${escape(projectName(tasks[0]))}</strong><small>${tasks.length} chat${tasks.length === 1 ? '' : 's'} · ${escape(path)}</small></span></summary><div class="project-chats"></div>`;
      const chats = group.querySelector<HTMLElement>('.project-chats')!;
      for (const task of tasks) {
        const button = document.createElement('button');
        button.className = `session-object ${this.selected === task.id ? 'selected' : ''}`;
        button.innerHTML = `<span class="session-state ${escape(task.status)}"></span><span><strong>${escape(task.title)}</strong><small>${escape(state(task.status))}${task.branch ? ` · ${escape(task.branch)}` : ''}</small></span>`;
        button.onclick = () => this.select(task.id);
        chats.append(button);
      }
      if (path !== 'No local project') {
        const create = document.createElement('button');
        create.className = 'new-chat-button';
        create.textContent = '+ NEW CODEX CHAT';
        create.onclick = event => { event.preventDefault(); event.stopPropagation(); void this.createTask(path, create); };
        chats.append(create);
      }
      list.append(group);
    }
    if (!visible.length) list.innerHTML = '<p class="rail-empty">No matching chats.</p>';
    if (this.cursor && !this.filter) {
      const more = document.createElement('button');
      more.className = 'load-more';
      more.textContent = 'LOAD MORE CHATS';
      more.onclick = async () => {
        more.disabled = true;
        try {
          const page = await window.spatialDesktop!.listCodexTasks(this.cursor!);
          this.tasks.push(...page.tasks.filter(task => !this.tasks.some(old => old.id === task.id)));
          this.cursor = page.nextCursor;
          this.renderTasks();
        } catch (error) {
          more.textContent = `RETRY · ${String(error)}`;
          more.disabled = false;
        }
      };
      list.append(more);
    }
  }

  private async refreshTasks() {
    const button = el('refresh-tasks') as HTMLButtonElement;
    button.disabled = true;
    try {
      const page = await window.spatialDesktop!.listCodexTasks();
      this.tasks = page.tasks;
      this.cursor = page.nextCursor;
      this.renderTasks();
      button.textContent = '↻';
    } catch {
      button.textContent = '!';
    } finally {
      button.disabled = false;
    }
  }

  private async createTask(cwd: string, button: HTMLButtonElement) {
    button.disabled = true;
    button.textContent = 'CREATING…';
    try {
      const content = await window.spatialDesktop!.createCodexTask(cwd);
      this.tasks.unshift(content.task);
      this.selected = content.task.id;
      this.revision++;
      this.content = content;
      this.lastContent = JSON.stringify(content);
      this.resumed = true;
      this.lockedByWriter = false;
      this.running = false;
      this.selectedFile = '';
      this.projectTree = [];
      this.projectTreeRoot = '';
      this.projectFile = undefined;
      this.resetTerminal();
      this.usage = { used: 0, last: 0, context: null, remaining: null };
      this.renderTasks();
      this.renderContent(content);
      this.updateRunningUi();
      this.updateTurnUi('New live Codex chat ready.');
      (el('live-prompt') as HTMLTextAreaElement).focus();
    } catch (error) {
      button.disabled = false;
      button.textContent = `RETRY · ${this.message(error)}`;
    }
  }

  private select(id: string) {
    this.selected = id;
    this.revision++;
    this.lastContent = '';
    this.content = undefined;
    this.selectedFile = '';
    this.projectTree = [];
    this.projectTreeRoot = '';
    this.projectFile = undefined;
    this.resetTerminal();
    this.running = false;
    this.resumed = false;
    this.lockedByWriter = false;
    this.usage = { used: 0, last: 0, context: null, remaining: null };
    this.renderTasks();
    el('chat-messages').textContent = 'Loading conversation…';
    el('live-inspector').innerHTML = '<p class="rail-empty">Loading workspace…</p>';
    this.updateTurnUi('Resuming live Codex session…');
    void this.resume();
  }

  private async resume() {
    const revision = this.revision;
    this.reading = true;
    try {
      const content = await window.spatialDesktop!.resumeCodexTask(this.selected);
      if (revision !== this.revision) return;
      this.resumed = true;
      this.lockedByWriter = false;
      this.content = content;
      this.lastContent = JSON.stringify(content);
      this.renderContent(content);
      this.updateTurnUi('Live session ready. Messages and agent activity will stream here. Shift+Enter adds a line.');
      el('chat-source').textContent = 'CODEX · LIVE · READY';
    } catch (error) {
      if (revision !== this.revision) return;
      this.resumed = false;
      this.lockedByWriter = this.message(error).toLowerCase().includes('active writer');
      this.updateTurnUi(this.lockedByWriter ? 'This chat is open in Codex. Sending here will start a new live chat in the same project.' : `Saved history only · ${this.message(error)}`);
      await this.read(true);
    } finally {
      if (revision === this.revision) this.reading = false;
    }
  }

  private async read(force: boolean) {
    if (this.reading && !force) return;
    const revision = this.revision;
    this.reading = true;
    try {
      const content = await window.spatialDesktop!.readCodexTask(this.selected);
      if (revision !== this.revision) return;
      const signature = JSON.stringify(content);
      if (signature !== this.lastContent) {
        this.content = content;
        this.renderContent(content);
        this.lastContent = signature;
      }
      el('chat-source').textContent = 'CODEX · UPDATED ' + new Date().toLocaleTimeString();
    } catch (error) {
      if (revision !== this.revision) return;
      el('chat-source').textContent = 'READ FAILED · RETRYING';
      if (!this.lastContent) el('chat-messages').textContent = String(error);
    } finally {
      if (revision === this.revision) this.reading = false;
    }
  }

  private async sendPrompt() {
    const input = el('live-prompt') as HTMLTextAreaElement;
    const text = input.value.trim();
    if (!this.selected || !text) return;
    const button = el('live-send') as HTMLButtonElement;
    button.disabled = true;
    this.updateTurnUi(this.running ? 'Steering the active turn…' : 'Starting Codex…');
    try {
      if (this.lockedByWriter) await this.createWritableTask();
      let result;
      try { result = await window.spatialDesktop!.promptCodex(this.selected, text); }
      catch (error) {
        if (!this.message(error).toLowerCase().includes('active writer')) throw error;
        this.lockedByWriter = true;
        await this.createWritableTask();
        result = await window.spatialDesktop!.promptCodex(this.selected, text);
      }
      input.value = '';
      this.resumed = true;
      this.running = true;
      this.updateRunningUi();
      this.updateTurnUi(result.mode === 'steer' ? 'Instruction added to the active turn.' : 'Codex is working…');
    } catch (error) {
      this.updateTurnUi(`Could not send · ${this.message(error)}`);
    } finally {
      button.disabled = false;
      input.focus();
    }
  }

  private async interrupt() {
    if (!this.selected || !this.running) return;
    const button = el('live-stop') as HTMLButtonElement;
    button.disabled = true;
    this.updateTurnUi('Stopping Codex…');
    try { await window.spatialDesktop!.interruptCodex(this.selected); }
    catch (error) { this.updateTurnUi(`Could not stop · ${this.message(error)}`); button.disabled = false; }
  }

  private handleEvent(event: CodexLiveEvent) {
    const task = this.tasks.find(item => item.id === event.threadId);
    if (task && event.type === 'TURN_STARTED') task.status = 'active';
    if (task && event.type === 'TURN_COMPLETED') task.status = event.status === 'failed' ? 'systemError' : 'idle';
    if (task && (event.type === 'TURN_STARTED' || event.type === 'TURN_COMPLETED')) this.renderTasks();
    if (event.threadId !== this.selected) return;
    const items = this.content?.items;
    if (event.type === 'TURN_STARTED') {
      this.running = true;
      this.updateRunningUi();
      this.updateTurnUi('Codex is working…');
      el('chat-source').textContent = 'CODEX · LIVE · STREAMING';
    }
    if (items && (event.type === 'ITEM_STARTED' || event.type === 'ITEM_COMPLETED')) for (const item of event.items || (event.item ? [event.item] : [])) this.upsert(item);
    if (items && event.type === 'MESSAGE_DELTA' && event.itemId) {
      const item = items.find(value => value.id === event.itemId) || this.upsert({ id: event.itemId, kind: 'assistant', text: '' });
      item.text += event.delta || '';
    }
    if (items && event.type === 'COMMAND_OUTPUT' && event.itemId) {
      const item = items.find(value => value.id === event.itemId) || this.upsert({ id: event.itemId, kind: 'command', text: 'Running command', detail: '', status: 'inProgress' });
      item.detail = (item.detail || '') + (event.delta || '');
    }
    if (items && event.type === 'PLAN_UPDATED') this.upsert({ id: event.itemId || `${event.turnId}:plan`, kind: 'plan', text: event.delta || '', status: 'inProgress' });
    if (items && event.type === 'DIFF_UPDATED') this.upsert({ id: `${event.turnId}:diff`, kind: 'file', text: 'Turn changes', detail: event.diff || '', status: 'inProgress' });
    if (event.type === 'APPROVAL_REQUESTED' && event.approval) {
      this.approvals.push(event.approval);
      this.showApproval();
      this.updateTurnUi('Codex is waiting for approval.');
    }
    if (event.type === 'APPROVAL_RESOLVED') {
      this.approvals = this.approvals.filter(value => value.requestId !== event.itemId);
      this.showApproval();
    }
    if (event.type === 'TOKEN_USAGE' && event.usage) { this.usage = event.usage; this.renderStats(); }
    if (event.type === 'ERROR') this.updateTurnUi(event.message || 'Codex encountered an error.');
    if (event.type === 'TURN_COMPLETED') {
      this.running = false;
      this.updateRunningUi();
      this.updateTurnUi(event.status === 'completed' ? 'Turn complete.' : event.status === 'interrupted' ? 'Turn stopped.' : `Turn failed · ${event.message || 'Unknown error'}`);
      el('chat-source').textContent = `CODEX · ${String(event.status || 'complete').toUpperCase()}`;
      void this.read(true);
    }
    if (['ITEM_STARTED', 'ITEM_COMPLETED', 'MESSAGE_DELTA', 'COMMAND_OUTPUT', 'PLAN_UPDATED', 'DIFF_UPDATED'].includes(event.type) && this.content) this.renderContent(this.content);
  }

  private upsert(item: CodexItem): CodexItem {
    if (!this.content) throw new Error('No active Codex content.');
    const existing = this.content.items.find(value => value.id === item.id && value.kind === item.kind);
    if (existing) { Object.assign(existing, item); return existing; }
    this.content.items.push(item);
    return item;
  }

  private showApproval() {
    const approval = this.approvals[0];
    el('approval').classList.toggle('hidden', !approval);
    if (!approval) return;
    el('approval-title').textContent = approval.title;
    el('approval-command').textContent = approval.command;
    el('approval-reason').textContent = approval.reason;
    el('allow-session').classList.toggle('hidden', !approval.allowSession);
  }

  private async resolveApproval(decision: CodexApprovalDecision) {
    const approval = this.approvals[0];
    if (!approval) return;
    for (const id of ['allow', 'allow-session', 'deny']) (el(id) as HTMLButtonElement).disabled = true;
    try {
      await window.spatialDesktop!.resolveCodexApproval(approval.requestId, decision);
      this.approvals.shift();
      this.showApproval();
      this.updateTurnUi(decision.startsWith('accept') ? 'Approved. Codex is continuing…' : 'Denied. Codex is continuing…');
    } catch (error) { this.updateTurnUi(`Approval failed · ${this.message(error)}`); }
    finally { for (const id of ['allow', 'allow-session', 'deny']) (el(id) as HTMLButtonElement).disabled = false; }
  }

  private updateRunningUi() {
    el('live-stop').classList.toggle('hidden', !this.running);
    el('agent-state').textContent = this.running ? 'RUNNING · LIVE' : this.resumed ? 'READY · LIVE' : 'SAVED HISTORY';
    this.renderStats();
  }

  private updateTurnUi(value: string) { el('live-turn-status').textContent = value; }
  private message(error: unknown) { return error instanceof Error ? error.message : String(error); }

  private renderContent({ task, items }: CodexTaskContent) {
    el('workspace-name').textContent = projectName(task);
    el('live-project').textContent = projectName(task);
    el('live-path').textContent = task.cwd || 'No local working directory';
    el('agent-provider').textContent = 'CODEX';
    el('agent-title').textContent = task.title;
    el('agent-state').textContent = `${this.running ? 'RUNNING · LIVE' : this.resumed ? 'READY · LIVE' : state(task.status).toUpperCase()}${task.branch ? ' · ' + task.branch : ''}`;
    el('branch').textContent = task.branch || 'BRANCH UNKNOWN';
    this.renderStats();

    const log = el('chat-messages');
    const follow = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    const previousScroll = log.scrollTop;
    log.innerHTML = items.filter(item => ['user', 'assistant', 'plan'].includes(item.kind)).map(item => `<article class="chat-message ${item.kind}"><small>${item.kind === 'user' ? 'YOU' : item.kind === 'plan' ? 'PLAN' : 'CODEX'}</small><p>${escape(item.text)}</p></article>`).join('') || '<p class="chat-empty">No conversation messages saved yet.</p>';
    log.scrollTop = follow ? log.scrollHeight : previousScroll;
    this.renderInspector();
  }

  private async createWritableTask() {
    const cwd = this.content?.task.cwd;
    if (!cwd) throw new Error('This stored chat has no project directory for a new live task.');
    const content = await window.spatialDesktop!.createCodexTask(cwd);
    this.tasks.unshift(content.task);
    this.selected = content.task.id;
    this.revision++;
    this.content = content;
    this.lastContent = JSON.stringify(content);
    this.resumed = true;
    this.lockedByWriter = false;
    this.running = false;
    this.selectedFile = '';
    this.projectTree = [];
    this.projectTreeRoot = '';
    this.projectFile = undefined;
    this.resetTerminal();
    this.usage = { used: 0, last: 0, context: null, remaining: null };
    this.renderTasks();
    this.renderContent(content);
    this.updateTurnUi('Created a new live chat because the selected task is open in Codex.');
  }

  private renderStats() {
    if (!document.getElementById('stat-model')) return;
    const task = this.content?.task;
    el('stat-model').textContent = task?.model || 'DEFAULT';
    el('stat-context').textContent = this.usage.context === null ? 'WAITING' : this.tokens(this.usage.context);
    el('stat-used').textContent = this.usage.used ? this.tokens(this.usage.used) : '—';
    el('stat-left').textContent = this.usage.remaining === null ? 'WAITING' : this.tokens(this.usage.remaining);
    el('stat-last').textContent = this.usage.last ? this.tokens(this.usage.last) : '—';
    el('stat-session').textContent = this.running ? 'RUNNING' : this.resumed ? 'LIVE' : this.lockedByWriter ? 'IN CODEX' : 'STORED';
  }

  private tokens(value: number) { return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}K` : String(value); }

  speakLatest() {
    const message = [...(this.content?.items || [])].reverse().find(item => item.kind === 'assistant' && item.text.trim());
    if (!message) { this.updateTurnUi('There is no Codex response to read yet.'); return; }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message.text);
    utterance.rate = .96;
    utterance.pitch = 1;
    speechSynthesis.speak(utterance);
    this.updateTurnUi('Reading the latest Codex response aloud. Tap the orb again to restart.');
  }

  private addInspectorTab(kind: InspectorKind) {
    el('tool-menu').classList.add('hidden');
    const existing = this.inspectorTabs.find(tab => tab.kind === kind);
    if (existing) this.activeInspectorTab = existing.id;
    else {
      const labels: Record<InspectorKind, string> = { files: 'Files', sidechat: 'Side chat', browser: 'Browser', terminal: 'Terminal', activity: 'Activity' };
      const tab = { id: `${kind}-${++this.tabSequence}`, kind, label: labels[kind] };
      this.inspectorTabs.push(tab);
      this.activeInspectorTab = tab.id;
    }
    this.inspector = kind;
    this.renderInspectorTabs();
    this.renderInspector();
  }

  private closeInspectorTab(id: string) {
    if (this.inspectorTabs.length === 1) return;
    const index = this.inspectorTabs.findIndex(tab => tab.id === id);
    this.inspectorTabs = this.inspectorTabs.filter(tab => tab.id !== id);
    if (this.activeInspectorTab === id) {
      const next = this.inspectorTabs[Math.min(index, this.inspectorTabs.length - 1)];
      this.activeInspectorTab = next.id;
      this.inspector = next.kind;
    }
    this.renderInspectorTabs();
    this.renderInspector();
  }

  private renderInspectorTabs() {
    const host = document.getElementById('tool-tabs');
    if (!host) return;
    host.replaceChildren();
    for (const tab of this.inspectorTabs) {
      const button = document.createElement('button');
      button.className = `tool-tab ${tab.id === this.activeInspectorTab ? 'active' : ''}`;
      button.innerHTML = `<span>${tab.kind === 'terminal' ? '›_' : tab.kind === 'browser' ? '◎' : tab.kind === 'sidechat' ? '◉' : tab.kind === 'activity' ? '⌁' : '▱'}</span><strong>${escape(tab.label)}</strong>${this.inspectorTabs.length > 1 ? '<i>×</i>' : ''}`;
      button.onclick = () => { this.activeInspectorTab = tab.id; this.inspector = tab.kind; this.renderInspectorTabs(); this.renderInspector(); };
      button.querySelector('i')?.addEventListener('click', event => { event.stopPropagation(); this.closeInspectorTab(tab.id); });
      host.append(button);
    }
  }

  private renderInspector() {
    const target = el('live-inspector');
    const items = this.content?.items || [];
    target.replaceChildren();
    if (this.inspector === 'files') void this.renderFiles(target, items.filter(item => item.kind === 'file'));
    if (this.inspector === 'sidechat') this.renderSideChat(target);
    if (this.inspector === 'browser') this.renderBrowser(target);
    if (this.inspector === 'activity') this.renderActivity(target, items.filter(item => ['file', 'command', 'tool'].includes(item.kind)));
    if (this.inspector === 'terminal') this.renderTerminal(target, items.filter(item => item.kind === 'command'));
  }

  private async renderFiles(target: HTMLElement, changedFiles: CodexItem[]) {
    const root = this.content?.task.cwd;
    if (!root) { target.innerHTML = '<p class="rail-empty">Select a chat with a local project to browse files.</p>'; return; }
    if (this.projectTreeRoot !== root) {
      target.innerHTML = '<p class="rail-empty">Loading project files…</p>';
      try {
        this.projectTree = await window.spatialDesktop!.listProjectFiles(this.selected) as ProjectEntry[];
        this.projectTreeRoot = root;
      } catch (error) { target.innerHTML = `<p class="rail-empty">Could not load files · ${escape(this.message(error))}</p>`; return; }
      if (this.content?.task.cwd !== root || this.inspector !== 'files') return;
    }
    target.replaceChildren();
    const workbench = document.createElement('div');
    workbench.className = 'files-workbench';
    const preview = document.createElement('section');
    preview.className = 'project-file-preview';
    preview.innerHTML = this.projectFile
      ? `<header><span>${escape(this.projectFile.path)}</span><small>${this.projectFile.truncated ? 'FIRST 256 KB' : this.tokens(this.projectFile.size) + 'B'}</small></header><pre>${escape(this.projectFile.content)}</pre>`
      : `<div class="file-placeholder"><b>SELECT A FILE</b><span>Source opens here while the project tree remains visible.</span></div>`;
    const sidebar = document.createElement('aside');
    sidebar.className = 'project-tree-pane';
    sidebar.innerHTML = `<label>⌕ <input placeholder="Filter files…" aria-label="Filter project files"></label><div class="changed-file-key">${changedFiles.length ? `${changedFiles.length} FILE CHANGE${changedFiles.length === 1 ? '' : 'S'} IN CHAT` : 'PROJECT FILES'}</div>`;
    const tree = document.createElement('div');
    tree.className = 'project-tree';
    sidebar.append(tree);
    const draw = (filter = '') => { tree.replaceChildren(); this.appendProjectEntries(tree, this.projectTree, filter.toLowerCase(), 0); if (!tree.childElementCount) tree.innerHTML = '<p class="rail-empty">No matching files.</p>'; };
    sidebar.querySelector('input')!.addEventListener('input', event => draw((event.currentTarget as HTMLInputElement).value));
    draw();
    workbench.append(preview, sidebar);
    target.append(workbench);
  }

  private appendProjectEntries(host: HTMLElement, entries: ProjectEntry[], filter: string, depth: number) {
    for (const entry of entries) {
      const matches = !filter || entry.name.toLowerCase().includes(filter) || entry.children?.some(child => this.entryMatches(child, filter));
      if (!matches) continue;
      if (entry.type === 'directory') {
        const folder = document.createElement('details');
        folder.className = 'tree-folder';
        folder.open = depth === 0 || Boolean(filter);
        folder.innerHTML = `<summary><span>⌄</span>${escape(entry.name)}</summary><div></div>`;
        this.appendProjectEntries(folder.querySelector('div')!, entry.children || [], filter, depth + 1);
        host.append(folder);
      } else {
        const button = document.createElement('button');
        button.className = `tree-file ${this.selectedFile === entry.path ? 'selected' : ''}`;
        button.innerHTML = `<span>${this.fileGlyph(entry.name)}</span><strong>${escape(entry.name)}</strong>`;
        button.onclick = () => void this.openProjectFile(entry.path);
        host.append(button);
      }
    }
  }

  private entryMatches(entry: ProjectEntry, filter: string): boolean { return entry.name.toLowerCase().includes(filter) || Boolean(entry.children?.some(child => this.entryMatches(child, filter))); }
  private fileGlyph(name: string) { const ext = name.split('.').pop()?.toLowerCase(); return ext === 'ts' || ext === 'tsx' ? 'TS' : ext === 'js' || ext === 'jsx' ? 'JS' : ext === 'md' ? 'M↓' : ext === 'json' ? '{}' : '·'; }

  private async openProjectFile(relativePath: string) {
    const root = this.content?.task.cwd;
    if (!root) return;
    this.selectedFile = relativePath;
    this.projectFile = undefined;
    this.renderInspector();
    try {
      this.projectFile = await window.spatialDesktop!.readProjectFile(this.selected, relativePath);
      const tab = this.inspectorTabs.find(value => value.id === this.activeInspectorTab);
      if (tab) tab.label = relativePath.split('/').pop() || 'Files';
      this.renderInspectorTabs();
      this.renderInspector();
    } catch (error) { this.updateTurnUi(`Could not open file · ${this.message(error)}`); }
  }

  private renderSideChat(target: HTMLElement) {
    const recent = (this.content?.items || []).filter(item => item.kind === 'assistant').slice(-2);
    target.innerHTML = `<div class="side-chat"><div class="side-chat-log">${recent.map(item => `<article><small>CODEX</small><p>${escape(item.text)}</p></article>`).join('') || '<p class="rail-empty">No Codex response in this task yet.</p>'}</div><label><textarea rows="4" placeholder="Ask in this task…"></textarea><button>SEND ↗</button></label><small>Uses the selected Codex task and the same approval flow.</small></div>`;
    const input = target.querySelector('textarea')!;
    const send = () => { const text = input.value.trim(); if (!text) return; (el('live-prompt') as HTMLTextAreaElement).value = text; input.value = ''; void this.sendPrompt(); };
    target.querySelector('button')!.addEventListener('click', send);
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } });
  }

  private renderBrowser(target: HTMLElement) {
    target.innerHTML = `<div class="browser-tool"><form><input value="${escape(this.browserUrl)}" aria-label="Browser address"><button>GO</button></form><iframe title="Workspace browser" sandbox="allow-forms allow-scripts allow-same-origin allow-popups"></iframe></div>`;
    const input = target.querySelector('input')!;
    const frame = target.querySelector('iframe')!;
    const navigate = () => {
      const raw = input.value.trim();
      const url = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
      try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); this.browserUrl = parsed.href; frame.src = parsed.href; }
      catch { this.updateTurnUi('Browser accepts HTTP and HTTPS addresses.'); }
    };
    target.querySelector('form')!.addEventListener('submit', event => { event.preventDefault(); navigate(); });
    navigate();
  }

  private renderActivity(target: HTMLElement, items: CodexItem[]) {
    if (!items.length) target.innerHTML = '<p class="rail-empty">No saved activity in this chat.</p>';
    for (const item of [...items].reverse().slice(0, 100)) {
      const detail = document.createElement('details');
      detail.className = 'inspector-detail';
      detail.innerHTML = `<summary><small>${item.kind.toUpperCase()} · ${escape(item.status || '')}</small><span>${escape(item.text)}</span></summary><pre>${escape(item.detail || 'No additional output saved.')}</pre>`;
      target.append(detail);
    }
  }

  private resetTerminal() {
    const id = this.terminalId;
    this.terminalId = '';
    this.terminalOutput = '';
    this.terminalShell = '';
    this.terminalState = 'stopped';
    if (id) void window.spatialDesktop?.stopTerminal(id);
  }

  private async startInteractiveTerminal() {
    if (!this.selected || this.terminalState === 'starting' || this.terminalState === 'running') return;
    this.terminalState = 'starting';
    this.renderInspector();
    try {
      const result = await window.spatialDesktop!.startTerminal(this.selected);
      this.terminalId = result.id;
      this.terminalShell = result.shell.split('/').pop() || result.shell;
      this.terminalState = 'running';
      await window.spatialDesktop!.resizeTerminal(result.id, 92, 28);
    } catch (error) {
      this.terminalState = 'exited';
      this.terminalOutput += `\nCould not start terminal: ${this.message(error)}\n`;
    }
    if (this.inspector === 'terminal') this.renderInspector();
  }

  private handleTerminalData(event: { id: string; taskId: string; data: string }) {
    if (event.taskId !== this.selected || (this.terminalId && event.id !== this.terminalId)) return;
    if (!this.terminalId) this.terminalId = event.id;
    this.terminalState = 'running';
    this.terminalOutput = (this.terminalOutput + this.cleanTerminal(event.data)).slice(-120_000);
    const output = document.getElementById('pty-output');
    if (output) { output.textContent = this.terminalOutput; output.scrollTop = output.scrollHeight; }
  }

  private handleTerminalExit(event: { id: string; taskId: string; exitCode: number; signal?: number }) {
    if (event.taskId !== this.selected || event.id !== this.terminalId) return;
    this.terminalState = 'exited';
    this.terminalOutput += `\n[process exited ${event.exitCode}${event.signal ? ` · signal ${event.signal}` : ''}]\n`;
    if (this.inspector === 'terminal') this.renderInspector();
  }

  private cleanTerminal(value: string) {
    return value.replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '').replace(/\x1B(?:[@-_]|\[[0-?]*[ -/]*[@-~])/g, '').replace(/\r(?!\n)/g, '');
  }

  private renderTerminal(target: HTMLElement, commands: CodexItem[]) {
    target.innerHTML = `<section class="interactive-terminal"><header><span><i></i><strong>${escape(this.terminalShell || 'LOCAL SHELL')}</strong><small>${this.terminalState.toUpperCase()} · ${commands.length} AGENT COMMAND${commands.length === 1 ? '' : 'S'}</small></span><div><button id="terminal-clear">CLEAR</button><button id="terminal-interrupt" ${this.terminalState !== 'running' ? 'disabled' : ''}>CTRL-C</button><button id="terminal-restart">${this.terminalState === 'running' ? 'TERMINATE' : 'START'}</button></div></header><pre id="pty-output" tabindex="0">${escape(this.terminalOutput || (this.terminalState === 'starting' ? 'Starting local pseudo-terminal…' : ''))}</pre><form><span>›</span><input id="pty-input" autocomplete="off" spellcheck="false" placeholder="Type a command and press Enter" ${this.terminalState !== 'running' ? 'disabled' : ''}><button ${this.terminalState !== 'running' ? 'disabled' : ''}>RUN</button></form><footer>The shell runs locally in the selected project. Ctrl+C interrupts the foreground process.</footer></section>`;
    const output = el('pty-output'); output.scrollTop = output.scrollHeight;
    el('terminal-clear').onclick = () => { this.terminalOutput = ''; output.textContent = ''; };
    el('terminal-interrupt').onclick = () => { if (this.terminalId) void window.spatialDesktop!.writeTerminal(this.terminalId, '\x03'); };
    el('terminal-restart').onclick = () => {
      if (this.terminalState === 'running') { const id = this.terminalId; this.resetTerminal(); if (id) this.updateTurnUi('Terminal terminated.'); this.renderInspector(); }
      else void this.startInteractiveTerminal();
    };
    const input = el('pty-input') as HTMLInputElement;
    const send = () => { const command = input.value; if (!command || !this.terminalId) return; input.value = ''; void window.spatialDesktop!.writeTerminal(this.terminalId, command + '\r'); };
    target.querySelector('form')!.addEventListener('submit', event => { event.preventDefault(); send(); });
    input.onkeydown = event => { if (event.ctrlKey && event.key.toLowerCase() === 'c' && this.terminalId) { event.preventDefault(); void window.spatialDesktop!.writeTerminal(this.terminalId, '\x03'); } };
    if (this.terminalState === 'stopped') void this.startInteractiveTerminal();
  }
}
