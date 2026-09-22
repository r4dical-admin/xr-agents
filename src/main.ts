import * as THREE from 'three';
import { MockAgentProvider, DIFF, ORIGINAL_SOURCE, UPDATED_SOURCE } from './mockProvider';
import type { AgentSession, SpatialAgentEvent } from './models';
import './styles.css';
import { LiveWorkspace } from './liveWorkspace';
import { HeadView } from './headView';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas id="space"></canvas>
  <div class="noise"></div><div class="ambient-horizon"></div>
  <div class="tracking-controls"><button id="connect-tracking">◎ CONNECT XREAL</button><span id="tracking-state">RIGHT-DRAG TO LOOK</span><button id="recenter">RECENTER</button></div>
  <aside class="display-controls" aria-label="Display controls">
    <label><span>TEXT <output id="font-scale-value">100%</output></span><input id="font-scale" type="range" min="0.8" max="1.5" step="0.05" value="1"></label>
    <label><span>VIEWPORT <output id="viewport-scale-value">100%</output></span><input id="viewport-scale" type="range" min="0.7" max="1.3" step="0.05" value="1"></label>
  </aside>
  <div class="horizon-motto">SAME TOOLS. A BIGGER HORIZON.</div>
  <header class="hud drag-region">
    <div><span class="eyebrow">SPATIAL / AGENT IDE</span><strong id="workspace-name">WORKSPACES</strong></div>
    <div class="hud-center"><span class="status-dot"></span><span>LOCAL SIMULATION</span><span>·</span><span id="branch">NO PROJECT</span></div>
    <div class="hud-right"><span id="clock">00:00</span><button id="fullscreen" class="icon-button no-drag" aria-label="Toggle fullscreen">⛶</button></div>
  </header>

  <main id="selector" class="selector-view">
    <div class="selector-copy">
      <span class="eyebrow">SELECT A SPATIAL WORKSPACE</span>
      <h1>Your work,<br><em>in orbit.</em></h1>
      <p>Enter a project to see agents, code, commands and decisions as one living system.</p>
    </div>
    <button id="connect-codex" class="project-object codex-connect">
      <span class="connect-kicker"><i></i> LOCAL AGENT PROVIDER</span>
      <span class="project-glyph codex-glyph"><i></i><i></i><i></i><i></i><i></i><i></i></span>
      <span class="project-meta"><small>ONE-CLICK CONNECTION</small><strong>Connect Codex</strong><span id="codex-connect-state">Browse your local tasks and conversations</span></span>
      <b id="codex-connect-action">CONNECT →</b>
    </button>
  </main>

  <main id="workspace" class="workspace-view hidden">
    <section class="context-rail">
      <div class="rail-title"><span class="eyebrow">PROJECT CONTEXT</span><strong>spatial-agent-ide</strong></div>
      <button class="file-node" id="file-node"><span class="node-icon">TS</span><span><small id="file-action">READY</small><strong>bridge.ts</strong><em id="file-stats">src / bridge.ts</em></span><i></i></button>
      <div class="activity-history"><span class="eyebrow">ACTIVITY STREAM</span><div id="history"><p class="empty">Select CODEX to begin.</p></div></div>
    </section>

    <section class="agent-focus">
      <button id="tts-orb" class="orb-hit-target" aria-label="Read the latest Codex response aloud" title="Read latest response aloud"><span>LISTEN</span></button>
      <div id="activity-field" class="activity-field"></div>
      <div class="agent-label"><span id="agent-provider">SELECT AN AGENT</span><strong id="agent-title">Spatial sessions are standing by</strong><em id="agent-state">IDLE</em></div>
      <section class="chat-panel" aria-label="Agent conversation"><header><span>CONVERSATION</span><small id="chat-source">LOCAL MOCK</small></header><div id="chat-messages" role="log" aria-live="polite"><p class="chat-empty">Select an agent to start a conversation.</p></div></section>
      <div class="composer">
        <input id="prompt" placeholder="Ask agent…" aria-label="Prompt" />
        <button id="send">SEND ↗</button>
        <div class="modes" id="modes"><button class="active">ASK</button><button>PLAN</button><button>IMPLEMENT</button><button>TEST</button><button>REVIEW</button><button>COMMIT</button></div>
      </div>
    </section>

    <aside class="sessions-rail">
      <div class="rail-title"><span class="eyebrow">SESSION CONSTELLATION</span><strong>03 AGENTS</strong></div>
      <div id="sessions"></div>
      <button id="exit-workspace" class="quiet-button">← ALL WORKSPACES</button>
    </aside>

    <button id="terminal-chip" class="terminal-chip hidden"><span></span><code>npm test</code><em>RUNNING</em></button>
  </main>

  <section id="terminal" class="object-panel terminal-panel hidden" aria-label="Terminal">
    <header><span class="traffic">● ● ●</span><strong id="terminal-title">npm test</strong><button data-close="terminal">×</button></header>
    <pre id="terminal-output"></pre><footer><span id="terminal-status">PROCESS ACTIVE</span><button id="cancel">INTERRUPT</button></footer>
  </section>

  <section id="viewer" class="object-panel viewer-panel hidden" aria-label="Code viewer">
    <header><div><span class="eyebrow">READ-ONLY INSPECTOR</span><strong>src / bridge.ts</strong></div><button data-close="viewer">×</button></header>
    <nav><button id="source-tab" class="active">SOURCE</button><button id="diff-tab">DIFF <span>+14 −3</span></button></nav>
    <pre id="code"></pre>
    <footer><span>TypeScript · UTF-8</span><span>Agent changes are simulated</span></footer>
  </section>

  <section id="approval" class="approval-card hidden" role="dialog" aria-modal="true">
    <div class="approval-ring"></div><span class="eyebrow">CODEX REQUESTS PERMISSION</span>
    <h2 id="approval-title">Install package “ws”?</h2><code id="approval-command">npm install ws</code><p id="approval-reason">The simulated agent needs a WebSocket transport.</p>
    <div><button id="deny">DENY</button><button id="allow-session" class="hidden">ALLOW SESSION</button><button id="allow">ALLOW ONCE</button></div>
  </section>

  <div id="toast" class="toast"></div>
`;

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const provider = new MockAgentProvider();
const live = new LiveWorkspace();
const project = provider.workspace.projects[0];
let selected: AgentSession | undefined;
let mode = 'ASK';
let inWorkspace = false;
const activityNodes = new Map<string, HTMLElement>();
let fontScale = Number(localStorage.getItem('spatial-font-scale')) || 1;
let viewportScale = Number(localStorage.getItem('spatial-viewport-scale')) || 1;

function bindScale(id: 'font-scale' | 'viewport-scale', initial: number, apply: (value: number) => void) {
  const input = el<HTMLInputElement>(id);
  const output = el<HTMLOutputElement>(`${id}-value`);
  input.value = String(initial);
  const update = () => { const value = Number(input.value); output.value = `${Math.round(value * 100)}%`; apply(value); };
  input.oninput = update; update();
}
bindScale('font-scale', fontScale, value => { fontScale = value; document.documentElement.style.setProperty('--font-scale', String(value)); localStorage.setItem('spatial-font-scale', String(value)); });
bindScale('viewport-scale', viewportScale, value => { viewportScale = value; localStorage.setItem('spatial-viewport-scale', String(value)); });

const canvas = el<HTMLCanvasElement>('space');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x020810, 0.075);
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0.1, 8);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

scene.add(new THREE.AmbientLight(0x1a5471, 1.6));
const cyanLight = new THREE.PointLight(0x3bdcff, 26, 12); cyanLight.position.set(0, 1, 4); scene.add(cyanLight);
const violetLight = new THREE.PointLight(0x795cff, 15, 10); violetLight.position.set(-3, -1, 3); scene.add(violetLight);

const world = new THREE.Group(); scene.add(world);
const starsGeometry = new THREE.BufferGeometry();
const stars = new Float32Array(420 * 3);
for (let i = 0; i < stars.length; i += 3) { stars[i] = (Math.random() - .5) * 22; stars[i + 1] = (Math.random() - .5) * 12; stars[i + 2] = Math.random() * -12; }
starsGeometry.setAttribute('position', new THREE.BufferAttribute(stars, 3));
world.add(new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: 0x467e99, size: .018, transparent: true, opacity: .55 })));

const grid = new THREE.GridHelper(30, 48, 0x143e56, 0x082536); grid.position.y = -2.65; grid.rotation.x = .03; (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = .25; world.add(grid);

const orbGroup = new THREE.Group(); orbGroup.position.set(0, 1.76, 1.6); world.add(orbGroup);
const orbMaterial = new THREE.MeshPhysicalMaterial({ color: 0x0c6594, emissive: 0x063e70, emissiveIntensity: 1.3, transparent: true, opacity: .16, roughness: .15, metalness: .15 });
const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(.72, 5), orbMaterial); orbGroup.add(orb);
const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(.78, 2), new THREE.MeshBasicMaterial({ color: 0x54dfff, wireframe: true, transparent: true, opacity: .13 })); orbGroup.add(wire);
for (let i = 0; i < 3; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(.92 + i * .14, .006, 5, 100), new THREE.MeshBasicMaterial({ color: i === 2 ? 0x8c73ff : 0x56dcff, transparent: true, opacity: .35 })); ring.rotation.set(Math.PI / 2 + i * .72, i * .45, 0); orbGroup.add(ring); }
const core = new THREE.Mesh(new THREE.SphereGeometry(.16, 32, 32), new THREE.MeshBasicMaterial({ color: 0xb7f5ff, transparent: true, opacity: .8 })); orbGroup.add(core);
core.scale.setScalar(.22);
const halo = new THREE.Mesh(new THREE.SphereGeometry(.755,64,40), new THREE.ShaderMaterial({
  transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
  vertexShader:`varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.0); n=normalize(normalMatrix*normal); v=normalize(-p.xyz); gl_Position=projectionMatrix*p;}`,
  fragmentShader:`varying vec3 n; varying vec3 v; void main(){float rim=pow(1.0-abs(dot(normalize(n),normalize(v))),3.2); gl_FragColor=vec4(.15,.65,1.,rim*.95);}`
})); orbGroup.add(halo);
const wavePositions = new Float32Array(180*3);
const waveGeometry = new THREE.BufferGeometry(); waveGeometry.setAttribute('position',new THREE.BufferAttribute(wavePositions,3));
const waveform = new THREE.Line(waveGeometry,new THREE.LineBasicMaterial({color:0x8cecff,transparent:true,opacity:.85})); waveform.position.z=.77; orbGroup.add(waveform);
for(let i=0;i<4;i++) {
  const base=new THREE.Mesh(new THREE.TorusGeometry(.45+i*.18,.004,4,100),new THREE.MeshBasicMaterial({color:0x45ceff,transparent:true,opacity:.5-i*.08}));
  base.rotation.x=Math.PI/2; base.position.set(0,-1.55,1.6); world.add(base);
}

function setOrbState(state: AgentSession['state']): void {
  const colors: Record<AgentSession['state'], [number, number]> = {
    IDLE: [0x0c6594, 0x063e70], LISTENING: [0x27cfca, 0x0b686c], THINKING: [0x6555ce, 0x33207f],
    READING: [0x1488b0, 0x075a77], EDITING: [0x7855d6, 0x432080], RUNNING: [0x128fbc, 0x075678],
    WAITING_FOR_APPROVAL: [0xc17819, 0x7b3e06], SUCCESS: [0x28ad87, 0x09644d], ERROR: [0xb83d32, 0x6f1712]
  };
  orbMaterial.color.setHex(colors[state][0]); orbMaterial.emissive.setHex(colors[state][1]);
}

function renderSessions(): void {
  if (live.active) return;
  el('sessions').innerHTML = project.sessions.map(item => `<button class="session-object ${selected?.id === item.id ? 'selected' : ''}" data-session="${item.id}">
    <span class="session-sigil ${item.provider}"><i></i></span><span><small>${item.displayName}</small><strong>${item.title}</strong><em>${prettyState(item.state)}</em></span><b>›</b>
  </button>`).join('');
  document.querySelectorAll<HTMLElement>('[data-session]').forEach(button => button.onclick = () => selectSession(button.dataset.session!));
}

function selectSession(id: string): void {
  if (provider.waiting) return toast('Resolve the permission request first.');
  selected = project.sessions.find(item => item.id === id);
  if (!selected) return;
  orbGroup.scale.setScalar(.2); renderSessions(); refresh();
  if (selected.id === 'codex-bridge' && selected.history.length === 0 && !provider.running) startDemo();
}

function startDemo(): void {
  if (!selected) selected = project.sessions[0];
  if (provider.running) return toast('A workflow is already running.');
  clearActivities();
  provider.prompt(selected.id, `${mode}: Implement the normalized bridge boundary`);
}

function refresh(): void {
  if (live.active) return;
  renderSessions();
  if (!selected) return;
  const messages = el('chat-messages');
  const follow = messages.scrollHeight-messages.scrollTop-messages.clientHeight < 60;
  const replies: Partial<Record<SpatialAgentEvent['type'], string>> = {
    THINKING:'I’ll inspect the bridge, update its event boundary, and run the tests.',
    FILE_READ:'Reading src/bridge.ts to understand the existing transport.',
    FILE_EDITED:'The bridge changes are ready to inspect: +14 −3.',
    COMMAND_STARTED:'Running npm test. You can open the terminal for output.',
    APPROVAL_REQUESTED:'I need your permission to install ws before continuing.',
    APPROVAL_RESOLVED:'Your decision has been received. Continuing the workflow.',
    TEST_RESULT:'All 47 simulated tests passed.', TASK_COMPLETED:'Implementation complete. The changes are ready for review.',
    ERROR:'The mock workflow has stopped.'
  };
  const conversation = selected.history.flatMap(event => {
    const text = event.type === 'SESSION_STARTED' ? event.payload.text : event.type === 'MESSAGE' ? event.payload.text : replies[event.type];
    return text ? [`<article class="chat-message ${event.type === 'SESSION_STARTED' ? 'user' : 'assistant'}"><small>${event.type === 'SESSION_STARTED' ? 'YOU' : selected!.displayName + ' · MOCK'}</small><p>${escapeHtml(text)}</p></article>`] : [];
  }).join('');
  messages.innerHTML = conversation || '<p class="chat-empty">Send a message below to begin the simulated workflow.</p>';
  if(follow) messages.scrollTop=messages.scrollHeight;
  el('agent-provider').textContent = selected.displayName;
  el('agent-title').textContent = selected.title;
  el('agent-state').textContent = selected.state === 'SUCCESS' ? 'TASK COMPLETE' : prettyState(selected.state).toUpperCase();
  el('agent-state').className = selected.state.toLowerCase();
  setOrbState(selected.state);
  const file = project.files[0];
  el('file-action').textContent = file.state === 'modified' ? 'EDITED' : file.state === 'being-read' ? 'READING' : 'READY';
  el('file-stats').textContent = file.additions ? `+${file.additions} −${file.deletions}` : 'src / bridge.ts';
  el('history').innerHTML = selected.history.length ? [...selected.history].reverse().filter(event => !['COMMAND_OUTPUT', 'DIFF_AVAILABLE'].includes(event.type)).slice(0, 8).map(event => `<p><i></i><span><strong>${event.type.replaceAll('_', ' ')}</strong><small>${event.payload.path ?? event.payload.text ?? ''}</small></span><time>${new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></p>`).join('') : '<p class="empty">No activity in this session.</p>';
  const terminal = selected.terminals[0];
  el('terminal-output').textContent = terminal?.output || 'No terminal activity in this session.';
  el('terminal-title').textContent = terminal ? `> ${terminal.command}` : '> terminal';
  el('terminal-status').textContent = terminal ? `${terminal.state.toUpperCase()}${terminal.exitCode === 0 ? ' · EXIT 0' : ''}` : 'IDLE';
  el('terminal-chip').classList.toggle('hidden', !terminal);
  if (terminal) el('terminal-chip').querySelector('em')!.textContent = terminal.state.toUpperCase();
}

function prettyState(state: AgentSession['state']): string { return state.replaceAll('_', ' ').toLowerCase().replace(/^./, c => c.toUpperCase()); }

function activity(event: SpatialAgentEvent): void {
  const labels: Partial<Record<SpatialAgentEvent['type'], string>> = {
    FILE_READ: `READ|bridge.ts`, FILE_EDITED: `EDIT · +14 −3|bridge.ts`, COMMAND_STARTED: `RUN|npm test`, TEST_RESULT: `TESTS|47 / 47 PASSED`, TASK_COMPLETED: `COMPLETE|TASK COMPLETE`
  };
  const value = labels[event.type]; if (!value) return;
  const [action, detail] = value.split('|'); const node = document.createElement('button');
  node.className = `activity-node ${event.type === 'TASK_COMPLETED' ? 'complete' : ''}`;
  node.innerHTML = `<small>${event.provider.toUpperCase()} / ${action}</small><strong>${detail}</strong><i></i>`;
  node.onclick = () => event.type.includes('FILE') ? openViewer(event.type === 'FILE_EDITED' ? 'diff' : 'source') : event.type.includes('COMMAND') || event.type === 'TEST_RESULT' ? show('terminal') : undefined;
  el('activity-field').append(node); activityNodes.set(event.type, node);
  if (event.type === 'TASK_COMPLETED') setTimeout(() => document.querySelectorAll('.activity-node:not(.complete)').forEach(item => item.classList.add('collapse')), 500);
}

provider.subscribe(event => {
  if (live.active) return;
  if (event.type === 'APPROVAL_REQUESTED') show('approval');
  if (event.type === 'APPROVAL_RESOLVED') { hide('approval'); toast(event.payload.text || 'Permission resolved'); }
  if (event.type === 'COMMAND_STARTED') show('terminal');
  if (event.type === 'TASK_COMPLETED') setTimeout(() => hide('terminal'), 900);
  if (selected?.id === event.sessionId) { activity(event); refresh(); }
  else renderSessions();
});

function clearActivities(): void { activityNodes.clear(); el('activity-field').innerHTML = ''; }
function show(id: string): void { el(id).classList.remove('hidden'); }
function hide(id: string): void { el(id).classList.add('hidden'); }
function toast(message: string): void { const target = el('toast'); target.textContent = message; target.classList.add('visible'); setTimeout(() => target.classList.remove('visible'), 2400); }

function openViewer(view: 'source' | 'diff'): void {
  show('viewer');
  el('source-tab').classList.toggle('active', view === 'source'); el('diff-tab').classList.toggle('active', view === 'diff');
  const changed = Boolean(selected?.changes.length); const text = view === 'diff' ? (changed ? DIFF : '// No changes in this session yet') : (changed ? UPDATED_SOURCE : ORIGINAL_SOURCE);
  el('code').innerHTML = text.split('\n').map((line, index) => `<span class="code-line ${view === 'diff' ? line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : '' : ''}"><i>${String(index + 1).padStart(2, '0')}</i><b>${escapeHtml(line)}</b></span>`).join('');
}
function escapeHtml(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }

function enterWorkspace(): void {
  inWorkspace = true;
  el('selector').classList.add('hidden');
  el('workspace').classList.remove('hidden');
  el('workspace-name').textContent = 'SPATIAL-AGENT-IDE';
  el('branch').textContent = project.repository.branch.toUpperCase();
  orbGroup.visible = true;
  renderSessions();
}

el<HTMLButtonElement>('connect-codex').onclick = async () => {
  const button = el<HTMLButtonElement>('connect-codex');
  if (!window.spatialDesktop) return toast('Open the Electron app to connect to Codex.');
  if (button.disabled) return;
  button.disabled = true;
  button.classList.add('connecting');
  el('codex-connect-action').textContent = 'CONNECTING…';
  el('codex-connect-state').textContent = 'Finding the Codex desktop service';
  try {
    const connection = await window.spatialDesktop.connectCodex();
    const source = connection.mode === 'desktop-service' ? 'DESKTOP SERVICE' : 'LOCAL APP SERVER';
    el('codex-connect-state').textContent = `${connection.threads.length} Codex tasks available`;
    el('codex-connect-action').textContent = 'CONNECTED ✓';
    selected = undefined;
    document.querySelector('.status-dot')?.classList.add('codex-live');
    button.classList.remove('connecting');
    button.classList.add('connected');
    toast(`Codex connected through ${source.toLowerCase()}.`);
    enterWorkspace();
    live.open(connection);
    button.disabled = false;
  } catch (error) {
    button.disabled = false;
    button.classList.remove('connecting');
    el('codex-connect-action').textContent = 'TRY AGAIN →';
    el('codex-connect-state').textContent = error instanceof Error ? error.message : 'Could not connect to Codex';
    toast('Codex connection failed. Is the Codex app installed?');
  }
};
window.spatialDesktop?.onCodexStatus(status => {
  if (status === 'starting-local-server') el('codex-connect-state').textContent = 'Starting a private local App Server';
});
el('exit-workspace').onclick = () => { if (provider.waiting) return toast('Resolve the permission request first.'); inWorkspace = false; el('workspace').classList.add('hidden'); el('selector').classList.remove('hidden'); el('workspace-name').textContent = 'WORKSPACES'; el('branch').textContent = 'NO PROJECT'; };
el('send').onclick = () => { if (!selected) return toast('Select an agent first.'); const input = el<HTMLInputElement>('prompt'); if (!input.value.trim()) return toast('Enter a prompt first.'); if (provider.running) return toast('Cancel or finish the current workflow first.'); clearActivities(); provider.prompt(selected.id, `${mode}: ${input.value}`); input.value = ''; };
el<HTMLInputElement>('prompt').onkeydown = event => { if (event.key === 'Enter') el<HTMLButtonElement>('send').click(); };
document.querySelectorAll<HTMLButtonElement>('#modes button').forEach(button => button.onclick = () => { mode = button.textContent!; document.querySelectorAll('#modes button').forEach(item => item.classList.remove('active')); button.classList.add('active'); el<HTMLInputElement>('prompt').placeholder = `${mode.toLowerCase()} with agent…`; });
el('file-node').onclick = () => openViewer('source'); el('source-tab').onclick = () => openViewer('source'); el('diff-tab').onclick = () => openViewer('diff');
el('terminal-chip').onclick = () => show('terminal'); el('cancel').onclick = () => selected && provider.cancel(selected.id);
el('allow').onclick = () => provider.pendingRequest && provider.resolveApproval(provider.pendingRequest, true);
el('deny').onclick = () => provider.pendingRequest && provider.resolveApproval(provider.pendingRequest, false);
document.querySelectorAll<HTMLElement>('[data-close]').forEach(button => button.onclick = () => hide(button.dataset.close!));
el('fullscreen').onclick = () => window.spatialDesktop?.toggleFullscreen();

let targetX = 0, targetY = 0;
const headView = new HeadView();
let trackingEnabled = false, poseTime = 0;
const headQuaternion = new THREE.Quaternion();
const viewAngles = new THREE.Euler(0,0,0,'YXZ');
const orbScale = new THREE.Vector3();
el('connect-tracking').onclick = () => {
  if (!window.spatialDesktop) return toast('Open the Electron app to connect glasses.');
  trackingEnabled = !trackingEnabled;
  el('connect-tracking').textContent = trackingEnabled ? '◎ DISCONNECT XREAL' : '◎ CONNECT XREAL';
  void window.spatialDesktop.trackingControl(trackingEnabled ? 'connect' : 'disconnect');
};
el('recenter').onclick = () => { void window.spatialDesktop?.trackingControl('recenter'); targetX=0; targetY=0; poseTime=0; headQuaternion.identity(); headView.reset(); camera.quaternion.identity(); };
window.spatialDesktop?.onPose(pose => {
  el('tracking-state').textContent = pose.state === 'calibrating' ? 'HOLD STILL · CALIBRATING' : pose.state === 'tracking' ? 'XREAL · 3DOF LIVE' : pose.state === 'connecting' ? 'SEARCHING · VIEW HELD' : trackingEnabled ? 'NO SIGNAL · VIEW HELD' : 'RIGHT-DRAG TO LOOK';
  if(pose.state === 'tracking' && pose.quaternion?.length === 4 && pose.quaternion.every(Number.isFinite) && Math.hypot(...pose.quaternion) > .5) { headQuaternion.fromArray(pose.quaternion).normalize(); poseTime=performance.now(); }
  else poseTime=0;
});
// Looking is explicit: ordinary cursor movement must not move a target while clicking it.
addEventListener('pointermove', event => {
  if (!trackingEnabled && event.buttons === 2) {
    targetX -= event.movementX * .002;
    targetY -= event.movementY * .002;
  }
});
addEventListener('contextmenu', event => event.preventDefault());
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
addEventListener('keydown', event => { if (event.key === 'Escape') { hide('viewer'); hide('terminal'); } if (event.key.toLowerCase() === 'f' && event.metaKey) void window.spatialDesktop?.toggleFullscreen(); });

let previous = performance.now();
function animate(now: number): void {
  requestAnimationFrame(animate); const delta = Math.min((now - previous) / 1000, .05); previous = now;
  if (!live.active) provider.tick(delta);
  if(trackingEnabled && poseTime && now-poseTime<250) {
    viewAngles.setFromQuaternion(headQuaternion,'YXZ');
    targetX = viewAngles.y;
    targetY = viewAngles.x;
  } else if (trackingEnabled && poseTime) {
    el('tracking-state').textContent = 'SIGNAL STALE · VIEW HELD';
  }
  const view = headView.update(targetX, targetY, delta, innerWidth, innerHeight, camera.fov, live.active ? .72 : .24, live.active ? .55 : .12);
  targetX = view.targetYaw; targetY = view.targetPitch;
  camera.rotation.set(view.pitch,-view.yaw,0,'YXZ');
  // Keep working surfaces vertically centered. Pitch only reveals the independent overhead status band.
  el('workspace').style.setProperty('--look-y', `${Math.max(0, view.y)}px`);
  el('workspace').style.transform = `translate3d(${view.x}px,0,0) scale(${viewportScale})`;
  for(let i=0;i<180;i++){const x=(i/179-.5)*1.12;wavePositions[i*3]=x;wavePositions[i*3+1]=Math.sin(i*2.3+now*.007)*Math.exp(-x*x*25)*(.04+.06*Math.sin(i*.3+now*.002)**2);}
  waveGeometry.attributes.position.needsUpdate=true;
  const energy = selected?.state === 'THINKING' ? 1.8 : selected?.state === 'WAITING_FOR_APPROVAL' ? .7 : 1;
  orb.rotation.y += delta * .18 * energy; wire.rotation.x += delta * .12 * energy; wire.rotation.y -= delta * .18 * energy;
  orbGroup.children.slice(2,5).forEach((child, index) => { child.rotation.z += delta * (.18 + index * .08) * energy; });
  const scale = (selected?.state === 'SUCCESS' ? 1.12 : 1 + Math.sin(now * .0017) * .025)*.3;
  orbGroup.scale.lerp(orbScale.setScalar(scale), .045);
  orbGroup.visible = inWorkspace;
  world.rotation.y = 0;
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
setInterval(() => { el('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 1000);
el('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
renderSessions();
el('tts-orb').onclick = () => live.active ? live.speakLatest() : toast('Connect Codex and select a chat to use voice playback.');
