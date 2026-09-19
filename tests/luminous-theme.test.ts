import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createTheme } from '../src/view/themes';

it('all Luminous bodies fit the unchanged piece-picking sphere from every direction',()=>{
  const theme=createTheme('luminous');
  for(const owner of ['white','black'] as const)for(const type of ['pawn','rook','bishop','knight','queen','king'] as const){
    const visual=theme.createPiece({owner,type});
    visual.object.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      const points=object.geometry.getAttribute('position');
      for(let i=0;i<points.count;i++)expect(Math.hypot(points.getX(i),points.getY(i),points.getZ(i))).toBeLessThan(0.34);
    });
    visual.dispose();
  }
  theme.dispose();
});
