import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const errors: string[] = [];
test.beforeEach(async ({page}) => {
  errors.length=0; page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/'); await page.waitForFunction(()=>!!window.__cubical);
});
test.afterEach(()=>expect(errors).toEqual([]));

test('lattice modes remain independent and derive adaptive cells from the authoritative field',async({page})=>{
  await page.locator('#setup').selectOption('spatial-study');await page.locator('#new-game').click();
  const before=await page.evaluate(()=>window.__cubical.snapshot());
  const save=await page.evaluate(()=>localStorage.getItem('cubical-chess.active-game'));
  for(const mode of ['full','structural','adaptive']){
    await page.locator('#lattice-mode').selectOption(mode);
    for(const theme of ['luminous','crystal','diagnostic']){
      await page.locator('#theme').selectOption(theme);
      expect((await page.evaluate(()=>window.__cubical.presentation())).lattice.mode).toBe(mode);
      expect((await page.evaluate(()=>window.__cubical.snapshot())).moves).toEqual(before.moves);
    }
  }
  const expected=[...new Set([before.pieces[before.selected!].cell!,...before.moves.map(m=>m.to)])].sort((a,b)=>a-b);
  expect((await page.evaluate(()=>window.__cubical.presentation())).lattice.localCells.sort((a,b)=>a-b)).toEqual(expected);
  await page.locator('#theme').selectOption('luminous');
  await page.getByRole('button',{name:'Move to (4, 3, 5)',exact:true}).focus();
  expect((await page.evaluate(()=>window.__cubical.movementField())).dashed).toBe(true);
  expect(await page.evaluate(()=>localStorage.getItem('cubical-chess.active-game'))).toBe(save);
  await page.getByRole('button',{name:'Move to (4, 3, 5)',exact:true}).press('Enter');
  expect((await page.evaluate(()=>window.__cubical.snapshot())).pieces[9].cell).toBeNull();
  await page.locator('#undo').click();expect((await page.evaluate(()=>window.__cubical.snapshot())).board).toEqual(before.board);
  await page.locator('#piece-navigator').selectOption('2');
  await page.locator('#plane').selectOption('3');await page.locator('#isolate').check();
  expect((await page.evaluate(()=>window.__cubical.presentation())).lattice.localCells.every(c=>Math.floor(c/64)===3)).toBe(true);
});

test('close inspection enters the volume without touching the game and interrupts immediately',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#setup').selectOption('spatial-study');await page.locator('#new-game').click();
  await page.locator('#theme').selectOption('luminous');await page.locator('#lattice-mode').selectOption('structural');
  const before=await page.evaluate(()=>window.__cubical.snapshot());
  await page.locator('#camera-study summary').click();await page.locator('#close-piece').click();
  const camera=await page.evaluate(()=>window.__cubical.camera());expect(camera.every(v=>Math.abs(v)<4)).toBe(true);
  expect((await page.evaluate(()=>window.__cubical.snapshot())).board).toEqual(before.board);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#close-piece').click();
  expect((await page.evaluate(()=>window.__cubical.presentation())).director).toBe('inspection');
  await page.keyboard.press('Tab');expect((await page.evaluate(()=>window.__cubical.presentation())).director).toBe('manual');
});

test('records lattice comparisons, a dense opening and comparable orbit costs',async({page})=>{
  test.setTimeout(120000);
  await page.locator('#setup').selectOption('spatial-study');await page.locator('#new-game').click();
  await page.locator('#ambient-effects').uncheck();
  const results:Record<string,unknown>={};
  for(const theme of ['diagnostic','luminous']) for(const mode of ['full','structural','adaptive']){
    await page.locator('#theme').selectOption(theme);await page.locator('#lattice-mode').selectOption(mode);
    await page.getByRole('button',{name:'Isometric',exact:true}).click();
    await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
    const name=theme+'-'+mode;
    const fixed=await page.evaluate(()=>({...window.__cubical.presentation(),...window.__cubical.metrics()}));
    await page.screenshot({path:'docs/electric-'+name+'.png'});
    await page.locator('#camera-study summary').click();await page.locator('#orbit-piece').click();
    const intervals=await page.evaluate(async()=>{
      let previous=0;const samples:number[]=[];
      for(let i=0;i<24;i++){const now=await new Promise<number>(r=>requestAnimationFrame(r));if(i>5)samples.push(now-previous);previous=now;}
      return samples.sort((a,b)=>a-b);
    });
    results[name]={fixed,camera:await page.evaluate(()=>window.__cubical.presentation()),frameIntervalsMs:intervals};
    await page.locator('#manual-camera').click();await page.locator('#camera-study summary').click();
  }
  await writeFile('docs/electric-measurements.json',JSON.stringify(results,null,2)+'\n');
  await page.locator('#setup').selectOption('outer-planes');await page.locator('#new-game').click();await page.locator('#piece-navigator').selectOption('3');
  await page.getByRole('button',{name:'Isometric',exact:true}).click();
  await page.screenshot({path:'docs/electric-opening.png'});
  await expect(page.locator('.piece-label:visible')).toHaveCount(32);
  expect((await page.evaluate(()=>window.__cubical.movementField())).cells).toHaveLength(33);
});

test('exports seven-view recognition sheets for both armies',async({page})=>{
  test.setTimeout(60000);await page.setViewportSize({width:1300,height:1050});
  for(const owner of ['white','black']){
    await page.evaluate(async owner=>{
      const threeURL='/node_modules/three/build/three.module.js', themeURL='/src/view/themes/index.ts';
      const THREE=await import(threeURL), {createTheme}=await import(themeURL);
      const theme=createTheme('luminous'), scene=new THREE.Scene();scene.background=theme.background;scene.add(theme.root);
      const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1300,1050);renderer.setPixelRatio(1);
      renderer.setScissorTest(true);
      const surface=document.createElement('div');surface.id='recognition';surface.style.cssText='position:fixed;inset:0;background:#010207;z-index:99999;color:#aec7df;font:12px system-ui';
      surface.append(renderer.domElement);document.body.append(surface);
      const text=(s:string,x:number,y:number)=>{const e=document.createElement('span');e.textContent=s;e.style.cssText=`position:absolute;left:${x}px;top:${y}px`;surface.append(e);};
      text('LUMINOUS · '+owner.toUpperCase()+' · SAME MODELS, SEVEN VIEWPOINTS',20,12);
      const types=['pawn','rook','bishop','knight','queen','king'];
      const poses=[[0,0,1],[0,0,-1],[-1,0,0],[1,0,0],[0,1,0.001],[0,-1,0.001],[1,0.7,1.2]];
      const names=['Front','Rear','Left','Right','Above','Below','Oblique'];
      const visuals=types.map(type=>theme.createPiece({type,owner}));
      visuals.forEach(visual=>scene.add(visual.object));
      const camera=new THREE.PerspectiveCamera(34,192/130,0.05,120);
      camera.position.set(0,0,1.8);camera.lookAt(0,0,0);
      await renderer.compileAsync(scene,camera);
      visuals.forEach(visual=>{visual.object.visible=false;});
      for(let row=0;row<7;row++){
        text(names[row],12,88+row*136);
        for(let col=0;col<6;col++){
          if(row===0)text(types[col],130+col*192,40);
          const visual=visuals[col];visual.object.visible=true;
          camera.position.set(...poses[row]).normalize().multiplyScalar(1.8);camera.lookAt(0,0,0);
          renderer.setViewport(110+col*192,1050-64-(row+1)*136,184,130);renderer.setScissor(110+col*192,1050-64-(row+1)*136,184,130);renderer.render(scene,camera);
          visual.object.visible=false;
        }
      }
      renderer.getContext().finish();
      visuals.forEach(visual=>visual.dispose());theme.dispose();renderer.dispose();
    },owner);
    await page.locator('#recognition').screenshot({path:'docs/electric-pieces-'+owner+'.png'});
    await page.locator('#recognition').evaluate(e=>e.remove());
  }
});
