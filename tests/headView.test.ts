import { describe, it, expect } from 'vitest';
import { HeadView } from '../src/headView';
import { PerspectiveCamera, Vector3 } from 'three';
describe('panoramic view mechanics', () => {
  it('matches the Three.js center projection on each head axis', () => {
    for (const [yaw,pitch] of [[.1,0],[0,.05],[-.1,0],[0,-.05]]) {
      const v = new HeadView().update(yaw,pitch,1,1500,940,46);
      const camera = new PerspectiveCamera(46,1500/940,.1,100);
      camera.rotation.set(v.pitch,-v.yaw,0,'YXZ'); camera.updateMatrixWorld();
      const screen = new Vector3(0,0,-5).project(camera);
      expect(v.x).toBeCloseTo(screen.x*750,5); expect(v.y).toBeCloseTo(-screen.y*470,5);
    }
  });
  it('moves the workspace in the same horizontal direction as the look input', () => {
    const v = new HeadView().update(.1,.05,1,1500,940,46);
    expect(v.x).toBeLessThan(0); expect(v.y).toBeGreaterThan(0);
    expect(v.x).toBeCloseTo(-Math.tan(v.yaw) * 940 / (2*Math.tan(46*Math.PI/360)),5);
  });
  it('uses equal damping at 60 and 120Hz', () => {
    const a = new HeadView(), b = new HeadView();
    let x=0,y=0;
    for(let i=0;i<6;i++) x=a.update(.2,0,1/60,1500,940,46).x;
    for(let i=0;i<12;i++) y=b.update(.2,0,1/120,1500,940,46).x;
    expect(x).toBeCloseTo(y,8);
  });
  it('supports a wider live workspace without changing the default range', () => {
    const normal = new HeadView().update(2,0,1,1500,940,46);
    const spatial = new HeadView().update(2,0,1,1500,940,46,.72);
    expect(normal.x).toBeCloseTo(-360);
    expect(spatial.x).toBeCloseTo(-1080);
  });
  it('supports an overhead telemetry range without changing the default pitch range', () => {
    const normal = new HeadView().update(0,2,1,1500,940,46);
    const spatial = new HeadView().update(0,2,1,1500,940,46,.72,.55);
    expect(normal.y).toBeCloseTo(112.8);
    expect(spatial.y).toBeCloseTo(517);
  });
  it('clamps beyond the edge without reversing, rejects NaN, and recenters', () => {
    const h=new HeadView();
    const v=h.update(2,2,1,1500,940,46);
    expect(v.x).toBeCloseTo(-360); expect(v.y).toBeCloseTo(112.8);
    expect(Number.isFinite(h.update(NaN,NaN,.1,1500,940,46).x)).toBe(true);
    h.reset(); expect(h.update(0,0,.1,1500,940,46).x).toBe(0);
  });
});
