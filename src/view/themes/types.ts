import type * as THREE from 'three';
import type { PieceType, PlayerId } from '../../rules/types';

export type ThemeId = 'diagnostic' | 'luminous' | 'crystal';
/** refraction selects the art-directed cut facets/reflections; no screen displacement. */
export interface CrystalEffects { refraction: boolean; spectral: boolean; caustics: boolean; inclusions: boolean }
export type Point3 = readonly [number, number, number];
/** Presentation data only: no board, legal-move generator, commands or live objects. */
export interface PieceAppearance { readonly type: PieceType; readonly owner: PlayerId }
export type SceneCue =
  | { readonly kind: 'selection' | 'trajectory' | 'check' | 'position'; readonly at: Point3 }
  | { readonly kind: 'move' | 'capture'; readonly from: Point3; readonly at: Point3; readonly owner: PlayerId };
export interface PieceVisual { readonly object: THREE.Group; dispose(): void }
export interface MotionStyle { readonly durationMs: number; sample(progress: number): number }
/** Optional world compositor (with or without postprocessing). Reset metrics before render. */
export interface PresentationPass {
  readonly enabled?: boolean;
  readonly preservePieceSilhouettes?: boolean;
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void;
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}
export interface ThemeRuntime {
  readonly id: ThemeId;
  readonly root: THREE.Group;
  readonly background: THREE.Color | null;
  /** Optional image-based lighting; its texture is owned/disposed by the theme. */
  readonly environment?: THREE.Texture;
  readonly volume: { readonly gridColor: number; readonly gridOpacity: number; readonly edgeOpacity: number; readonly homeOpacity: number };
  readonly motion: MotionStyle;
  /** Optional contrast backing for the common destination field; never changes hit targets. */
  readonly markerBackdrop?: number;
  readonly postprocessing?: PresentationPass;
  readonly optical?: { set(effects: CrystalEffects): void; get(): CrystalEffects };
  createPiece(piece: PieceAppearance): PieceVisual;
  onCue(cue: SceneCue, time: number): void;
  /** Return true only when an effect needs a frame; effects never block game commands. */
  update(time: number, motionEnabled: boolean): boolean;
  clearTransient(): void;
  dispose(): void;
}
