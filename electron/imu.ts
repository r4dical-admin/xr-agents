// Original implementation using the community-documented One Pro wire layout.
// Protocol reference: github.com/taowen/ar-glass-lib and device_imu_net.c.
export interface Sample { time: bigint; gyro: number[]; accel: number[] }
export class FrameDecoder {
  private bytes = Buffer.alloc(0);
  push(chunk: Buffer): Sample[] {
    this.bytes = Buffer.concat([this.bytes, chunk]);
    const samples: Sample[] = [];
    let offset = 0;
    while (offset + 134 <= this.bytes.length) {
      const b = this.bytes;
      if (![0x27, 0x28].includes(b[offset]) || !b.subarray(offset + 1, offset + 6).equals(Buffer.from([0x36, 0, 0, 0, 0x80]))) { offset++; continue; }
      const gyro = [0, 1, 2].map(i => b.readFloatLE(offset + 34 + i * 4));
      const accel = [0, 1, 2].map(i => b.readFloatLE(offset + 46 + i * 4));
      if ([...gyro, ...accel].every(Number.isFinite) && Math.hypot(...gyro) < 40 && Math.hypot(...accel) > 1 && Math.hypot(...accel) < 100) {
        samples.push({ time: b.readBigUInt64LE(offset + 14), gyro, accel }); offset += 134;
      } else offset++;
    }
    this.bytes = this.bytes.subarray(offset);
    return samples;
  }
}
export type Quat = [number, number, number, number];
export function multiply(a: Quat, b: Quat): Quat {
  const [x,y,z,w] = a, [u,v,s,t] = b;
  return [w*u+x*t+y*s-z*v,w*v-x*s+y*t+z*u,w*s+x*v-y*u+z*t,w*t-x*u-y*v-z*s];
}
export class OrientationFilter {
  q: Quat = [0,0,0,1];
  origin: Quat = [0,0,0,1];
  calibrated = false;
  private last?: bigint;
  private count = 0;
  private sum = [0,0,0];
  private gravity = [0,1,0];
  private bias = [0,0,0];
  recenter() { this.origin = [-this.q[0],-this.q[1],-this.q[2],this.q[3]]; }
  update(sample: Sample): Quat {
    const dt = this.last === undefined ? 0 : Number(sample.time - this.last) / 1e9;
    this.last = sample.time;
    // Raw axes are pitch, yaw, roll. Camera forward is -Z.
    const g = [sample.gyro[0],sample.gyro[1],-sample.gyro[2]];
    const a = [sample.accel[0],sample.accel[1],-sample.accel[2]];
    const norm = Math.hypot(...a);
    if (!this.calibrated) {
      if (Math.hypot(...g) > .08 || Math.abs(norm - 9.81) > .6) { this.count = 0; this.sum = [0,0,0]; return this.q; }
      g.forEach((v,i) => this.sum[i] += v);
      if (++this.count >= 1000) { this.bias = this.sum.map(v => v / this.count); this.gravity = a.map(v => v / norm); this.calibrated = true; }
      return this.q;
    }
    if (dt <= 0 || dt > .05) return multiply(this.origin, this.q);
    let omega = g.map((v,i) => v - this.bias[i]);
    // Gravity feedback removes pitch/roll drift; yaw remains unobservable.
    if (Math.abs(norm - 9.81) < 1.2) {
      const inv: Quat = [-this.q[0],-this.q[1],-this.q[2],this.q[3]];
      const expected = multiply(multiply(inv, [...this.gravity,0] as Quat), this.q);
      const n = a.map(v => v / norm);
      const error = [n[1]*expected[2]-n[2]*expected[1],n[2]*expected[0]-n[0]*expected[2],n[0]*expected[1]-n[1]*expected[0]];
      omega = omega.map((v,i) => v + error[i] * .7);
    }
    const derivative = multiply(this.q, [...omega,0] as Quat);
    const next = this.q.map((v,i) => v + derivative[i]*dt*.5);
    const length = Math.hypot(...next);
    this.q = next.map(v => v/length) as Quat;
    return multiply(this.origin, this.q);
  }
}
