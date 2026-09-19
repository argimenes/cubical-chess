import * as THREE from 'three';
import { coordinates } from '../rules/geometry';
import type { Cell } from '../rules/types';
import { disposeVisual } from './themes/dispose';

export type LatticeMode = 'full' | 'structural' | 'adaptive';
/** Navigation geometry only. Consumes engine-supplied cells; themes have no lattice settings. */
export class LatticeView {
  readonly root = new THREE.Group();
  private mode: LatticeMode = 'full';
  private readonly grid: THREE.LineSegments;
  private readonly structural: THREE.LineSegments;
  private readonly frostGrid: THREE.LineSegments;
  private readonly frostTime = { value: 0 };
  private frosted = false;
  private previousTime: number | null = null;
  private readonly edge: THREE.LineSegments;
  private readonly homes: THREE.GridHelper[] = [];
  private readonly local: THREE.LineSegments;
  private localCells: Cell[] = [];
  constructor() {
    const lines = (values: number[], opacity: number) => {
      const points: number[] = [];
      for (const a of values) for (const b of values) points.push(-4,a,b,4,a,b,a,-4,b,a,4,b,a,b,-4,a,b,4);
      return new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(points,3)),
        new THREE.LineBasicMaterial({ color: 0x6aadd6, transparent: true, opacity, depthWrite: false }));
    };
    this.grid = lines(Array.from({length:9},(_,i)=>i-4),0.075);
    this.structural = lines([-4,0,4],0.055);
    // Reuse the exact analytical lines, not 512 overlapping box outlines.
    this.frostGrid = new THREE.LineSegments(this.grid.geometry, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false,
      uniforms: { time: this.frostTime },
      vertexShader: 'varying vec3 cellPoint; void main(){ cellPoint=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `
        uniform float time; varying vec3 cellPoint;
        void main(){
          float grain = pow(0.5 + 0.5 * sin(dot(cellPoint, vec3(53.1, 71.7, 91.3))), 24.0);
          float phase = dot(floor(cellPoint * 3.0), vec3(2.7, 4.1, 1.9));
          float glitter = pow(0.5 + 0.5 * sin(phase + time * 1.1), 24.0);
          gl_FragColor = vec4(mix(vec3(0.48, 0.68, 0.86), vec3(0.85, 0.94, 1.0), glitter), 0.042 + grain * (0.04 + glitter * 0.38));
          #include <colorspace_fragment>
        }`,
    }));
    this.edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(8,8,8)), new THREE.LineBasicMaterial({color:0x79d4ff,transparent:true,opacity:0.42}));
    for (const [height,colour] of [[-4,0x79d4ff],[4,0xff8f89]]) {
      const grid = new THREE.GridHelper(8,8,colour,colour); grid.position.y=height;
      (grid.material as THREE.Material).transparent=true; (grid.material as THREE.Material).opacity=0.2;
      this.homes.push(grid); this.root.add(grid);
    }
    this.local = new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:0.42,depthWrite:false}));
    this.root.add(this.grid,this.structural,this.edge,this.local,this.frostGrid); this.setMode('full');
  }
  setMode(mode: LatticeMode): void {
    this.mode=mode; this.grid.visible=!this.frosted && mode!=='structural'; this.structural.visible=!this.frosted && mode==='structural'; this.frostGrid.visible=this.frosted; this.local.visible=mode==='adaptive';
    (this.grid.material as THREE.LineBasicMaterial).opacity=mode==='adaptive'?0.012:0.075;
    (this.edge.material as THREE.LineBasicMaterial).opacity=mode==='full'?0.42:0.14;
    this.homes.forEach(grid=>{ grid.visible=!this.frosted && mode!=='structural'; (grid.material as THREE.Material).opacity=mode==='adaptive'?0.035:0.2; });
  }
  setFrosted(enabled: boolean): void { this.frosted=enabled; this.setMode(this.mode); }
  /** The active Luminous runtime supplies the redraw cadence; static modes never request frames. */
  update(now: number, animated: boolean): void {
    const dt=this.previousTime===null?0:Math.min(Math.max(now-this.previousTime,0),100);
    this.previousTime=now;
    if(this.frosted && animated)this.frostTime.value+=dt/1000;
  }
  inspect(selected: Cell | null, destinations: readonly Cell[], path: readonly Cell[], visible: (cell:Cell)=>boolean): void {
    const cells = new Map<Cell,number>();
    destinations.forEach(c=>cells.set(c,0.3)); path.forEach(c=>cells.set(c,0.7)); if(selected!==null)cells.set(selected,1);
    this.localCells=[...cells.keys()].filter(visible);
    const points:number[]=[], colors:number[]=[];
    for(const cell of this.localCells){
      const [x,y,z]=coordinates(cell), centre=[x-3.5,z-3.5,y-3.5], weight=cells.get(cell)!;
      // Exact cell corners, short brackets: never add full rays or a second move field.
      for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1])for(let axis=0;axis<3;axis++){
        const sign=[sx,sy,sz], a=centre.map((v,i)=>v+sign[i]*0.5), b=[...a]; b[axis]-=sign[axis]*(0.08+weight*0.1);
        points.push(...a,...b); for(let i=0;i<2;i++)colors.push(0.32*weight,0.56*weight,0.66*weight);
      }
    }
    this.local.geometry.dispose();
    this.local.geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(points,3)).setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  }
  metrics(){ return {mode:this.mode, frostedCells:this.frosted, localCells:this.mode==='adaptive'?[...this.localCells]:[], localSegments:this.mode==='adaptive'?this.localCells.length*24:0}; }
  dispose(){disposeVisual(this.root);this.root.clear();}
}
