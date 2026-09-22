import net from 'node:net';
import os from 'node:os';
import { FrameDecoder, OrientationFilter } from './imu';

export class HeadTracker {
  private socket?: net.Socket;
  private retry?: ReturnType<typeof setTimeout>;
  private enabled = false;
  private generation = 0;
  private filter = new OrientationFilter();
  private lastSent = 0;
  constructor(private send: (value: object) => void) {}
  start() { this.stop(); this.enabled = true; this.connect(); }
  stop() { this.enabled = false; this.generation++; clearTimeout(this.retry); this.socket?.destroy(); this.socket = undefined; this.send({ state: 'disconnected' }); }
  recenter() { this.filter.recenter(); }
  private connect() {
    const generation = this.generation;
    const peers = new Set<string>();
    Object.values(os.networkInterfaces()).flat().forEach(info => {
      if (info?.family === 'IPv4' && info.address.startsWith('169.254.') && !info.internal) peers.add(info.address.split('.').slice(0,3).join('.') + '.1');
    });
    peers.add('169.254.2.1'); peers.add('169.254.1.1');
    const candidates = [...peers];
    const attempt = () => {
      if (!this.enabled || generation !== this.generation) return;
      const host = candidates.shift();
      if (!host) { this.send({ state:'disconnected', message:'No glasses detected · enable Ethernet in the glasses menu' }); this.retry = setTimeout(() => this.connect(), 4000); return; }
      this.send({ state:'connecting' });
      const decoder = new FrameDecoder(); this.filter = new OrientationFilter();
      const socket = net.createConnection({ host, port:52998 }); this.socket = socket;
      socket.setNoDelay(true); socket.setTimeout(2500);
      let lastValid = Date.now();
      socket.on('timeout', () => socket.destroy());
      socket.on('error', () => socket.destroy());
      socket.on('data', chunk => {
        if (generation !== this.generation) return;
        const samples = decoder.push(chunk);
        if (samples.length) lastValid = Date.now();
        else if (Date.now() - lastValid > 2500) { socket.destroy(); return; }
        for (const sample of samples) {
          const quaternion = this.filter.update(sample);
          const now = Date.now();
          if (now - this.lastSent >= 8) { this.lastSent = now; this.send({ state:this.filter.calibrated ? 'tracking' : 'calibrating', quaternion, timestamp:now }); }
        }
      });
      socket.once('close', attempt);
    };
    attempt();
  }
}
