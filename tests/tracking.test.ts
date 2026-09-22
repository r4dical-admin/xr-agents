import { describe, it, expect } from 'vitest';
import { FrameDecoder, OrientationFilter } from '../electron/imu';

function frame(time: bigint, header = 0x28) {
  const b = Buffer.alloc(134); b.set([header,0x36,0,0,0,0x80]); b.writeBigUInt64LE(time,14); b.writeFloatLE(9.81,50); return b;
}
describe('One Pro sensor pipeline', () => {
  it('handles fragmentation, garbage, both headers and malformed data', () => {
    const decoder = new FrameDecoder(); const b = frame(1000000n);
    expect(decoder.push(Buffer.concat([Buffer.from([8,2,3]),b.subarray(0,43)]))).toHaveLength(0);
    const bad = frame(2000000n); bad.writeFloatLE(NaN,34);
    const result = decoder.push(Buffer.concat([b.subarray(43),bad,frame(3000000n,0x27)]));
    expect(result.map(s=>s.time)).toEqual([1000000n,3000000n]);
  });
  it('calibrates stationary bias, integrates yaw and recenters', () => {
    const filter = new OrientationFilter(); let time=0n;
    const sample=(gyro:number[])=>({time:time+=1000000n,gyro,accel:[0,9.81,0]});
    for(let i=0;i<1000;i++) filter.update(sample([0,.01,0]));
    expect(filter.calibrated).toBe(true);
    let q=filter.q;
    for(let i=0;i<1000;i++) q=filter.update(sample([0,1.01,0]));
    expect(q[1]).toBeCloseTo(Math.sin(.5),3);
    expect(Math.hypot(...q)).toBeCloseTo(1,8);
    filter.recenter(); q=filter.update(sample([0,.01,0]));
    expect(q[3]).toBeCloseTo(1,5);
  });
  it('does not calibrate while moving',()=>{
    const filter=new OrientationFilter();
    for(let i=0;i<2000;i++) filter.update({time:BigInt(i)*1000000n,gyro:[0,1,0],accel:[0,9.81,0]});
    expect(filter.calibrated).toBe(false);
  });
});
