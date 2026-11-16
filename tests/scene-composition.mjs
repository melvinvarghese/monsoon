import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../vendor/three.module.min.js';

const source = readFileSync(new URL('../landscape.js', import.meta.url), 'utf8');
const atlasEstimate = source.match(/estimatedAtlasBytes:Math\.ceil\(([^)]*)\)/)?.[1] ?? '';
assert.match(atlasEstimate, /^3\s*\*\s*1024\s*\*\s*1024\s*\*\s*4\s*\*\s*4\s*\/\s*3$/,
  'the debug memory estimate covers all three 1024×1024 RGBA foliage atlases including mipmaps');
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const terrainCode = source.slice(source.indexOf('function seeded('), source.indexOf('function setProgress('));
const world = new Function('THREE', 'clamp', 'lerp', `${terrainCode};return {terrainHeight,riverX,riverWidth,riverLevel,fallX,fallZ,fallTopZ,fallPoolZ,fallBase,seeded};`)(THREE, clamp, lerp);
assert.ok(world.riverLevel(world.fallZ - 5) - world.riverLevel(world.fallZ + 5) >= 6,
  'the upper stream must arrive above the downstream pool instead of meeting the fall at one flat level');
assert.ok(world.riverWidth(world.fallZ + 2) >= 5.5,
  'the waterfall lands in a broad local plunge pool rather than a narrow river ribbon');
const canopyCode = source.slice(source.indexOf('function canopyGeometry('), source.indexOf('const trunkGeo='));
const canopy = new Function('THREE', 'seeded', `${canopyCode};return canopyGeometry(0);`)(THREE, world.seeded);
const p = canopy.attributes.position, uv = canopy.attributes.uv, index = canopy.index;
assert.equal(index.count / 6, 72, 'each combined multi-lobed crown stays within the per-tree leaf-card budget');
let area = 0;
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
for (let i = 0; i < index.count; i += 3) {
  a.fromBufferAttribute(p, index.getX(i)); b.fromBufferAttribute(p, index.getX(i + 1)); c.fromBufferAttribute(p, index.getX(i + 2));
  area += b.sub(a).cross(c.sub(a)).length() * .5;
}
let widestLeaf = 0, longestLeaf = 0;
for (let i = 0; i < p.count; i += 4) {
  const cornerA = new THREE.Vector3().fromBufferAttribute(p, i);
  const cornerB = new THREE.Vector3().fromBufferAttribute(p, i + 1);
  const cornerC = new THREE.Vector3().fromBufferAttribute(p, i + 2);
  widestLeaf = Math.max(widestLeaf, cornerA.distanceTo(cornerB));
  longestLeaf = Math.max(longestLeaf, cornerB.distanceTo(cornerC));
}
console.log('Canopy leaf-card area/max dimensions:', area.toFixed(3), widestLeaf.toFixed(3), longestLeaf.toFixed(3));
assert.ok(area >= .55 && area <= 1.0, `scanned leaves stay closer to natural leaf scale while remaining clustered; got ${area.toFixed(3)} local square units`);
const crownQuadrants=new Set();
for(let i=0;i<p.count;i+=4){const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2)+p.getX(i+3))/4,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2)+p.getZ(i+3))/4;crownQuadrants.add(`${x<0?0:1}:${z<0?0:1}`);}
assert.equal(crownQuadrants.size,4,'combined crown geometry places foliage masses around the trunk rather than one detached tuft');
assert.ok(widestLeaf >= .08 && longestLeaf >= .09 && widestLeaf <= .12 && longestLeaf <= .13,
  `scanned broadleaf cards should not become metre-scale leaf billboards after tree scaling; got ${widestLeaf.toFixed(3)} × ${longestLeaf.toFixed(3)} local units`);
const horizontalCrownSpan=Math.max(canopy.boundingBox.max.x-canopy.boundingBox.min.x,canopy.boundingBox.max.z-canopy.boundingBox.min.z);
assert.ok(horizontalCrownSpan>=1 && horizontalCrownSpan<=1.35,
  `clustered crowns should overlap into compact leaf masses rather than separated tufts; got ${horizontalCrownSpan.toFixed(3)} local units`);
const rockStart=source.indexOf('const rockGeo=new THREE.SphereGeometry(1,14,10);');
const rockEnd=source.indexOf('const rockMat=',rockStart);
const rockBuilder=new Function('THREE','random',`${source.slice(rockStart,rockEnd)};return rockGeo;`);
const rockGeometry=rockBuilder(THREE,world.seeded(1712)),rockVertices=rockGeometry.attributes.position;
let smallestRockRadius=Infinity,largestRockRadius=0;
for(let i=0;i<rockVertices.count;i++){
  const radius=new THREE.Vector3().fromBufferAttribute(rockVertices,i).length();
  smallestRockRadius=Math.min(smallestRockRadius,radius);largestRockRadius=Math.max(largestRockRadius,radius);
}
assert.ok(largestRockRadius/smallestRockRadius>=1.8,
  `stream stones need a visibly irregular silhouette rather than near-spherical props; radius ratio ${ (largestRockRadius/smallestRockRadius).toFixed(2) }`);
const layoutStart = source.indexOf('function leafClusterLayout(random){');
const layoutEnd = source.indexOf('\n    function smoothNoise', layoutStart);
assert.ok(layoutStart >= 0 && layoutEnd > layoutStart, 'the scene exposes its pure leaf-cluster layout to direct geometry tests');
const leafClusterLayout = new Function(`${source.slice(layoutStart, layoutEnd)};return leafClusterLayout;`)();
const clusters = leafClusterLayout(world.seeded(4071));
assert.equal(clusters.length, 6, 'the clustered leaf atlas has six distinct material patches');
assert.ok(clusters.every(cluster => cluster.length === 60), 'each foliage patch contains sixty locally sourced leaves');
assert.ok(clusters.flat().every(leaf => leaf.source >= 0 && leaf.source < 6 && leaf.scale >= .20 && leaf.scale <= .27),
  'small overlapping leaf placements keep individual leaves natural-sized inside a dense crown patch');

const fallCode = source.slice(source.indexOf('const fallGeo=new THREE.BufferGeometry();'), source.indexOf('const fallMat='));
const fall = new Function('THREE', 'lerp', 'riverX', 'riverLevel', 'fallX', 'fallZ', 'fallTopZ', 'fallPoolZ', 'fallBase', 'terrainHeight', `${fallCode};return fallGeo;`)
  (THREE, lerp, world.riverX, world.riverLevel, world.fallX, world.fallZ, world.fallTopZ, world.fallPoolZ, world.fallBase, world.terrainHeight);
const f = fall.attributes.position;
let exposed = 0, samples = 0;
assert.ok(fall.userData.flowCount >= 3, `the waterfall needs at least three distinct falling tongues; got ${fall.userData.flowCount}`);
const rows = f.count / (fall.userData.flowCount * 2);
let minFallX = Infinity, maxFallX = -Infinity;
for (let flow = 0; flow < fall.userData.flowCount; flow++) for (let row = 0; row < rows; row++) {
  const i = (flow * rows + row) * 2;
  const x = (f.getX(i) + f.getX(i + 1)) * .5, y = (f.getY(i) + f.getY(i + 1)) * .5, z = (f.getZ(i) + f.getZ(i + 1)) * .5;
  minFallX = Math.min(minFallX, f.getX(i), f.getX(i + 1)); maxFallX = Math.max(maxFallX, f.getX(i), f.getX(i + 1));
  if (y >= world.terrainHeight(x, z) + .03) exposed++;
  samples++;
}
console.log('Exposed waterfall sections:', exposed, '/', samples);
assert.ok(exposed / samples >= .9, 'the waterfall must sit visibly above its rock face rather than disappear inside terrain');
assert.ok(maxFallX - minFallX >= 12, `the falling water should span a broad, ledged rock face; got ${(maxFallX - minFallX).toFixed(2)}m`);
let widestCascadeGap=-Infinity;
for(let row=0;row<rows;row++){
  const spans=[];
  for(let flow=0;flow<fall.userData.flowCount;flow++){const i=(flow*rows+row)*2;spans.push([Math.min(f.getX(i),f.getX(i+1)),Math.max(f.getX(i),f.getX(i+1))]);}
  spans.sort((left,right)=>left[0]-right[0]);
  for(let i=1;i<spans.length;i++)widestCascadeGap=Math.max(widestCascadeGap,spans[i][0]-spans[i-1][1]);
}
assert.ok(widestCascadeGap<=1.1, `cascade tongues should overlap into a broad falling sheet instead of three detached ribbons; widest gap ${widestCascadeGap.toFixed(2)}m`);
const fallShaderStart=source.indexOf('const fallMat=new THREE.ShaderMaterial({'),fallShaderEnd=source.indexOf('\n    scene.add(new THREE.Mesh(fallGeo,fallMat));',fallShaderStart);
assert.ok(fallShaderStart>=0&&fallShaderEnd>fallShaderStart,'the waterfall shader is exposed for a vertical-flow pattern check');
const fallShader=source.slice(fallShaderStart,fallShaderEnd),breakupMatch=fallShader.match(/breakNoise=noise\(vec2\([^,]+,v\.y\*([0-9.]+)-time/);
const verticalBreakRate=Number(breakupMatch?.[1]);
assert.ok(Number.isFinite(verticalBreakRate)&&verticalBreakRate<=6,
  `waterfall breakup should make a few flowing streaks instead of repetitive horizontal bands; vertical rate ${verticalBreakRate}`);

const lobeStart = source.indexOf('function canopyLobeLayout(random,height,spread){');
const lobeEnd = source.indexOf('\n    const trunkGeo=', lobeStart);
assert.ok(lobeStart >= 0 && lobeEnd > lobeStart, 'tree crowns expose a pure multi-lobe layout for geometry tests');
const canopyLobeLayout = new Function(`${source.slice(lobeStart, lobeEnd)};return canopyLobeLayout;`)();
const largeTreeLobes = canopyLobeLayout(world.seeded(4071), 22, 9);
assert.ok(largeTreeLobes.length >= 5, `emergent Western Ghats trees need several overlapping crown masses; got ${largeTreeLobes.length}`);
assert.ok(largeTreeLobes.reduce((sum,lobe)=>sum+lobe.y,0)/largeTreeLobes.length < 22*.76,
  'tropical evergreen crowns reach lower down the trunk rather than leaving an oversized bare stem');
const crownScale=Number(source.match(/scale\*=([0-9.]+);dummy\.scale\.set/)?.[1]);
assert.ok(crownScale>=1.8,`broad crown masses should overlap to form a layered evergreen canopy; scale ${crownScale}`);
const lobeRadii = largeTreeLobes.map(lobe => Math.hypot(lobe.x, lobe.z));
assert.ok(Math.max(...lobeRadii) > 2.2 && Math.max(...lobeRadii) < 7.0,
  `large-tree crown masses should spread around the trunk without detaching; radii ${lobeRadii.map(x => x.toFixed(2)).join(', ')}`);
assert.ok(Math.max(...largeTreeLobes.map(lobe => lobe.y)) - Math.min(...largeTreeLobes.map(lobe => lobe.y)) > 1.4,
  'crown masses form layered vertical depth instead of one detached umbrella');
const structureStart=source.indexOf('function treeStructureGeometry(style){'),structureEnd=source.indexOf('\n    const wood=',structureStart);
assert.ok(structureStart>=0&&structureEnd>structureStart,'tree branch geometry is exposed for a real silhouette check');
const trunkParameters=source.match(/const trunkGeo=new THREE\.CylinderGeometry\(([^)]*)\);/);
assert.ok(trunkParameters,'tree trunk profile is defined');
const trunkArgs=trunkParameters[1].split(',').map(Number);
assert.ok(trunkArgs[3]>=8&&trunkArgs[4]>=2,`tree trunks use a rounded, bent bark profile instead of a visibly faceted pole (${trunkArgs[3]} radial × ${trunkArgs[4]} vertical segments)`);
const branchParameters=source.match(/const branchGeo=new THREE\.CylinderGeometry\(([^)]*)\);/);
const rootParameters=source.match(/const buttressGeo=new THREE\.CylinderGeometry\(([^)]*)\);/);
assert.ok(branchParameters&&rootParameters,'curved limbs and buttress roots use separate low-cost bark profiles');
const branchArgs=branchParameters[1].split(',').map(Number),rootArgs=rootParameters[1].split(',').map(Number);
assert.ok(branchArgs[3]>=3&&branchArgs[4]>=2&&rootArgs[3]>=4,
  `branches retain a curved tapered shape and root flares stay smooth enough (${branchArgs[3]}×${branchArgs[4]} limbs; ${rootArgs[3]}-sided roots)`);
const branchRadius=Number(source.match(/addSegment\(joint,tip,([0-9.]+),branchGeo,true\)/)?.[1]);
const branchBend=Number(source.match(/bend=length\*([0-9.]+)/)?.[1]);
assert.ok(branchRadius<=.010&&branchBend>=.18&&rootArgs[0]<=.10,
  `canopy limbs stay slender and genuinely arced while buttress roots taper to the ground (${branchRadius}/${branchBend}/${rootArgs[0]})`);
const structureParameters=source.match(/const trunkSegments=(\d+),branchCount=(\d+),buttressCount=(\d+)/);
assert.ok(structureParameters,'tree structure exposes its trunk, branch, and buttress counts');
const [trunkSegments,branchCount,buttressCount]=structureParameters.slice(1).map(Number);
assert.ok(trunkSegments>=5&&branchCount>=5&&buttressCount>=4,
  `mature Western Ghats trees need a gently bent trunk, spreading limbs, and buttress flares (${trunkSegments}/${branchCount}/${buttressCount})`);
const structureFactory=new Function('THREE','seeded','trunkGeo','branchGeo','buttressGeo','trunkSegments','branchCount','buttressCount',`${source.slice(structureStart,structureEnd)};return treeStructureGeometry;`)
  (THREE,world.seeded,new THREE.CylinderGeometry(...trunkArgs),new THREE.CylinderGeometry(...branchArgs),new THREE.CylinderGeometry(...rootArgs),trunkSegments,branchCount,buttressCount);
const branchGeometry=structureFactory(0),slenderTreeGeometry=structureFactory(1),branchBounds=branchGeometry.boundingBox;
const branchSpan=Math.max(branchBounds.max.x-branchBounds.min.x,branchBounds.max.z-branchBounds.min.z);
assert.ok(branchSpan>.27&&branchSpan<=.44,`slender limbs reach into the crown without becoming oversized scaffold beams; got ${branchSpan.toFixed(3)} local units`);
assert.ok(branchGeometry.index.count/3>=190&&branchGeometry.index.count/3<=240,
  `tree silhouettes balance curved trunks and buttress forms against the per-tree triangle budget (${branchGeometry.index.count/3} triangles)`);
assert.ok(slenderTreeGeometry.index.count/3>=150&&slenderTreeGeometry.index.count/3<=160,
  `the slimmer tree form keeps its curved limbs without unnecessary root geometry (${slenderTreeGeometry.index.count/3} triangles)`);

const fernCountParameters=source.match(/const fernCount=isMobile\?(\d+):(\d+),ferns=/);
assert.ok(fernCountParameters,'the local fern understory has an explicit desktop/mobile instance budget');
const [mobileFerns,desktopFerns]=fernCountParameters.slice(1).map(Number);
const fernAsset=JSON.parse(readFileSync(new URL('../assets/fern/fern_02_1k.gltf',import.meta.url),'utf8'));
const fernTriangles=fernAsset.meshes.reduce((sum,mesh)=>sum+mesh.primitives.reduce((meshSum,primitive)=>{
  const indices=primitive.indices===undefined?null:fernAsset.accessors[primitive.indices];
  return meshSum+(indices?(indices.count/3):Math.floor(fernAsset.accessors[primitive.attributes.POSITION].count/3));
},0),0);
assert.ok(mobileFerns>=4&&desktopFerns>=7&&mobileFerns<desktopFerns&&desktopFerns*fernTriangles<=100_000,
  `the streamside fern layer adds visible clusters without exceeding its 100k triangle budget (${mobileFerns}/${desktopFerns} × ${fernTriangles})`);

const surfaceCode = source.slice(source.indexOf('function surfaceHeight('), source.indexOf('// Sculpted mountain walls:'));
const positions = new THREE.Float32BufferAttribute([-1,0,-1, 1,2,-1, -1,4,1, 1,12,1], 3);
const surface = new Function('clamp', 'terrainSegments', 'terrainSize', 'pos', `${surfaceCode};return surfaceHeight;`)(clamp, 1, 2, positions);
assert.equal(surface(-.5, -.5), 1.5, 'lower mesh triangle uses its rendered plane, not a bilinear or analytic peak');
assert.equal(surface(.5, .5), 7.5, 'upper mesh triangle uses its own rendered plane');
assert.equal(surface(0, 0), 3, 'the two triangle planes meet continuously on the diagonal');
console.log('PASS scene composition geometry');
