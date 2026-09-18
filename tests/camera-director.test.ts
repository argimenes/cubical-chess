import { expect, it } from 'vitest';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CameraDirector } from '../src/view/camera-director';
import type { SceneCue } from '../src/view/themes/types';

function fixture() {
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 120); camera.position.set(12, 9, -15);
  const controls = new OrbitControls(camera); controls.minDistance = 7; controls.maxDistance = 45;
  return { camera, controls, director: new CameraDirector(camera, controls) };
}
it('focus is smooth, finishes at the requested target, and respects framing distance', () => {
  const { camera, controls, director } = fixture();
  const before = camera.position.clone();
  director.focus([1, 2, 3], 3.2, 0);
  expect(camera.position.distanceTo(before)).toBeLessThan(1e-10);
  director.update(325);
  expect(controls.target.toArray()).toEqual([0.5, 1, 1.5]);
  director.update(650);
  expect(controls.target.toArray()).toEqual([1, 2, 3]);
  expect(camera.position.distanceTo(controls.target)).toBeGreaterThanOrEqual(7);
  expect(director.mode).toBe('manual');
});
it('interrupt cancels the remaining focus/orbit without snapping the current pose', () => {
  const { camera, controls, director } = fixture();
  director.focus([1, 2, 3], 3.2, 0, false, true); director.update(650); director.update(1650);
  expect(director.mode).toBe('inspection');
  const position = camera.position.clone(), target = controls.target.clone();
  director.interrupt();
  expect(director.update(5000)).toBe(false);
  expect(camera.position).toEqual(position); expect(controls.target).toEqual(target);
  expect(director.mode).toBe('manual');
});
it('reduced motion snaps focus without starting orbit', () => {
  const { controls, director } = fixture();
  director.focus([1, 2, 3], 3.2, 0, true, true);
  expect(controls.target.toArray()).toEqual([1, 2, 3]);
  expect(director.mode).toBe('manual');
});
it.each(['selection', 'trajectory', 'move', 'capture', 'check', 'position'] as const)('accepts a frozen %s cue without modifying its data', kind => {
  const { director, controls } = fixture();
  const at = Object.freeze([4, 2, 0] as const), from = Object.freeze([0, 0, 0] as const);
  const cue = Object.freeze(kind === 'move' || kind === 'capture' ? { kind, at, from, owner: 'white' as const } : { kind, at }) as SceneCue;
  director.focusCue(cue, 0, true);
  expect(controls.target.toArray()).toEqual('from' in cue ? [2, 1, 0] : [4, 2, 0]);
  expect(cue.at).toEqual([4, 2, 0]);
});
