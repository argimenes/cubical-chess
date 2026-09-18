import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Point3, SceneCue } from './themes/types';

type Shot = { start: number; duration: number; from: THREE.Vector3; targetFrom: THREE.Vector3; to: THREE.Vector3; target: THREE.Vector3; orbit: boolean };
/** Only camera poses and presentation cues cross this boundary. No game state or commands. */
export class CameraDirector {
  private shot: Shot | null = null;
  private orbitStart: number | null = null;
  private readonly orbitOffset = new THREE.Vector3();
  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly controls: OrbitControls) {}
  get mode(): 'manual' | 'focus' | 'inspection' { return this.shot ? this.shot.orbit ? 'inspection' : 'focus' : this.orbitStart !== null ? 'inspection' : 'manual'; }
  interrupt(): void { this.shot = null; this.orbitStart = null; }

  focus(at: Point3, radius: number, time: number, reducedMotion = false, orbit = false): void {
    this.interrupt();
    // Consume existing manual damping before beginning a shot, then let controls keep the new pose.
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false; this.controls.update(); this.controls.enableDamping = damping;
    const target = new THREE.Vector3().fromArray(at);
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const angle = Math.min(halfFov, Math.atan(Math.tan(halfFov) * this.camera.aspect));
    const distance = THREE.MathUtils.clamp(radius / Math.sin(angle), this.controls.minDistance, this.controls.maxDistance);
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    const to = target.clone().addScaledVector(direction, distance);
    this.shot = { start: time, duration: reducedMotion ? 0 : 650, from: this.camera.position.clone(), targetFrom: this.controls.target.clone(), to, target, orbit: orbit && !reducedMotion };
    this.update(time);
  }

  /** Future replay scheduler can issue these at selection/path/move/capture/check/position beats. */
  focusCue(cue: SceneCue, time: number, reducedMotion = false): void {
    const at: Point3 = 'from' in cue ? cue.at.map((v, i) => (v + cue.from[i]) / 2) as [number, number, number] : cue.at;
    const radius = 'from' in cue ? Math.max(3.2, new THREE.Vector3().fromArray(cue.from).distanceTo(new THREE.Vector3().fromArray(cue.at)) / 2 + 1) : 3.2;
    this.focus(at, radius, time, reducedMotion);
  }

  update(time: number): boolean {
    if (this.shot) {
      const shot = this.shot;
      const t = shot.duration === 0 ? 1 : Math.min(Math.max((time - shot.start) / shot.duration, 0), 1);
      const eased = t * t * (3 - 2 * t);
      this.camera.position.lerpVectors(shot.from, shot.to, eased);
      this.controls.target.lerpVectors(shot.targetFrom, shot.target, eased);
      this.camera.lookAt(this.controls.target);
      if (t === 1) {
        if (shot.orbit) { this.orbitStart = time; this.orbitOffset.copy(shot.to).sub(shot.target); }
        this.shot = null;
      }
      return true;
    }
    if (this.orbitStart !== null) {
      const elapsed = Math.min(time - this.orbitStart, 12000);
      this.camera.position.copy(this.orbitOffset).applyAxisAngle(new THREE.Vector3(0, 1, 0), elapsed / 12000 * Math.PI * 2).add(this.controls.target);
      this.camera.lookAt(this.controls.target);
      if (elapsed === 12000) this.orbitStart = null;
      return true;
    }
    return false;
  }
}
