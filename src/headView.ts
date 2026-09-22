// A level panoramic desktop surface. Camera and HTML use one filtered pose.
// This is not a stereoscopic/world-anchored XR projection.
export class HeadView {
  private yaw = 0;
  private pitch = 0;
  reset() { this.yaw = 0; this.pitch = 0; }
  update(yaw: number, pitch: number, dt: number, width: number, height: number, fov: number, horizontalRange = .24, verticalRange = .12) {
    const focal = height / (2 * Math.tan(fov * Math.PI / 360));
    const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));
    // Clamp angles BEFORE projection: sin(angle) used to reverse after 90 degrees.
    const targetYaw = clamp(Number.isFinite(yaw) ? yaw : this.yaw, Math.atan(width * horizontalRange / focal));
    const targetPitch = clamp(Number.isFinite(pitch) ? pitch : this.pitch, Math.atan(height * verticalRange / focal));
    const alpha = 1 - Math.exp(-Math.max(0, dt) / .025);
    this.yaw += (targetYaw - this.yaw) * alpha;
    this.pitch += (targetPitch - this.pitch) * alpha;
    return { yaw: this.yaw, pitch: this.pitch, targetYaw, targetPitch,
      x: this.yaw === 0 ? 0 : -Math.tan(this.yaw) * focal,
      y: this.pitch === 0 ? 0 : Math.tan(this.pitch) * focal };
  }
}
