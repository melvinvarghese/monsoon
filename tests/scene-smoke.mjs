import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mime = { ".html": "text/html", ".js": "text/javascript", ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".jpg": "image/jpeg", ".png": "image/png" };
const server = createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/favicon.ico") { res.writeHead(204).end(); return; }
  const file = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    let body = readFileSync(file);
    if (pathname === "/landscape.js") {
      const marker = "const rockGeo=new THREE.SphereGeometry(1,14,10);";
      const crownMarker = "const crowns=[0,1].map(variant=>new THREE.InstancedMesh(canopyGeometry(variant),leafMat,treeCapacity));";
      const countMarker = "crowns.forEach((forest,i)=>{forest.count=crownN[i];});";
      const foregroundMarker = "for(const [x,z,h,spread] of foreground)tree(x,z,h,spread,0);";
      const terrainMarker = "function setProgress(n,label){loaderFill.style.width=n+\"%\";if(label)loaderLabel.textContent=label;}";
      const sizeMarker = "scene.add(rocks);";
      const waterMarker = "waterGeo.setIndex(waterIndices);";
      const fallMarker = "fallGeo.setIndex(fallIndices);";
      const fallMaterialMarker = "scene.add(new THREE.Mesh(fallGeo,fallMat));";
      const rangeMarker = "m.position.z=zBase;scene.add(m);";
      const sceneMarker = 'setProgress(92,"Waking the landscape");';
      const frameMarker = "requestAnimationFrame(animate);";
      let source = body.toString();
      assert.ok(source.includes(marker), "the rock geometry test hook can locate the real geometry");
      assert.ok(source.includes(crownMarker), "the foliage test hook can locate the real crowns");
      assert.ok(source.includes(countMarker), "the forest test hook can locate the actual placed crowns");
      assert.ok(source.includes(foregroundMarker), "the framing test hook can locate the existing foreground trees");
      assert.ok(source.includes(terrainMarker), "the terrain test hook can locate the real height field");
      assert.ok(source.includes(sizeMarker), "the understory test hook can locate the real plant and rock instances");
      assert.ok(source.includes(waterMarker), "the stream test hook can locate the real water surface");
      assert.ok(source.includes(fallMarker), "the waterfall test hook can locate the real curtain geometry");
      assert.ok(source.includes(fallMaterialMarker), "the waterfall test hook can locate the real flow shader");
      assert.ok(source.includes(rangeMarker), "the relief test hook can locate the real mountain geometry");
      assert.ok(source.includes(sceneMarker), "the asset test hook can inspect the completed scene");
      assert.ok(source.includes(frameMarker), "the preview test hook can observe completed scene frames");
      source = source.replace(marker, `${marker}\n    window.__monsoonTestRockGeometry=rockGeo;window.__monsoonTestRockOriginal=Array.from(rockGeo.attributes.position.array);`);
      source = source.replace(crownMarker, `${crownMarker}\n    window.__monsoonTestCanopyGeometry=crowns[0].geometry;window.__monsoonTestCanopyGeometry.computeBoundingBox();window.__monsoonTestCanopyMaterial=leafMat;`);
      source = source.replace(waterMarker, `${waterMarker}\n    window.__monsoonTestWaterGeometry=waterGeo;`);
      source = source.replace(fallMarker, `${fallMarker}\n    window.__monsoonTestFallGeometry=fallGeo;`);
      source = source.replace(fallMaterialMarker, `${fallMaterialMarker}\n    window.__monsoonTestFallMaterial=fallMat;`);
      source = source.replace(rangeMarker, `${rangeMarker}\n    window.__monsoonTestRangeMeshes??=[];window.__monsoonTestRangeMeshes.push({mesh:m,nx,nz,width,depth,zBase});`);
      source = source.replace(foregroundMarker, `${foregroundMarker}\n    window.__monsoonTestForegroundTrees=foreground.map(([x,z])=>[x,z]);`);
      source = source.replace(terrainMarker, `${terrainMarker}\n    window.__monsoonTestTerrainHeight=terrainHeight;window.__monsoonTestSurfaceHeight=surfaceHeight;window.__monsoonTestFallZ=fallZ;window.__monsoonTestRiverCenter=riverX;window.__monsoonTestRiverWidth=riverWidth;`);
      source = source.replace(sizeMarker, `${sizeMarker}\n    const __measureMatrix=new THREE.Matrix4(),__measurePosition=new THREE.Vector3(),__measureRotation=new THREE.Quaternion(),__measureScale=new THREE.Vector3();let __fernMaxScale=0,__rockMaxScale=0;scene.getObjectByName("Fern 02 understory")?.traverse(object=>{if(!object.isInstancedMesh)return;for(let i=0;i<object.count;i++){object.getMatrixAt(i,__measureMatrix);__measureMatrix.decompose(__measurePosition,__measureRotation,__measureScale);__fernMaxScale=Math.max(__fernMaxScale,__measureScale.x,__measureScale.y,__measureScale.z);}});for(let i=0;i<rocks.count;i++){rocks.getMatrixAt(i,__measureMatrix);__measureMatrix.decompose(__measurePosition,__measureRotation,__measureScale);__rockMaxScale=Math.max(__rockMaxScale,__measureScale.x,__measureScale.y,__measureScale.z);}window.__monsoonTestMaxFernScale=__fernMaxScale;window.__monsoonTestMaxRockScale=__rockMaxScale;`);
      source = source.replace(countMarker, `${countMarker}\n    window.__monsoonTestTreeCount=treeRoots.length;window.__monsoonTestBranchCount=branchCount;window.__monsoonTestTreeRoots=treeRoots.map(root=>[root.x,root.z]);window.__monsoonTestLedgeTreePositions=ledgeTreePositions;window.__monsoonTestWoodCapacity=wood.reduce((sum,mesh)=>sum+mesh.instanceMatrix.count,0);window.__monsoonTestWoodUsed=wood.reduce((sum,mesh)=>sum+mesh.count,0);window.__monsoonTestWoodGeometryTriangles=wood.map(mesh=>mesh.geometry.index.count/3);window.__monsoonTestCrownCapacities=crowns.map(c=>c.instanceMatrix.count);window.__monsoonTestCrownUsed=crowns.map(c=>c.count);const testMatrix=new THREE.Matrix4();crowns[0].getMatrixAt(0,testMatrix);const e=testMatrix.elements;window.__monsoonTestCanopyHorizontalScale=Math.hypot(e[0],e[1],e[2]);window.__monsoonTestCanopyVerticalRatio=Math.hypot(e[4],e[5],e[6])/Math.hypot(e[0],e[1],e[2]);`);
      body = source.replace(frameMarker, `window.__monsoonTestFrameCount=(window.__monsoonTestFrameCount||0)+1;window.__monsoonTestRender=render;window.__monsoonTestGraphicsLost=()=>graphicsLost;window.__monsoonTestProjectPoint=(x,y,z)=>new THREE.Vector3(x,y,z).project(camera).toArray();${frameMarker}`);
      body = body.replace(sceneMarker, `${sceneMarker}\nwindow.__monsoonTestScene=scene;window.__monsoonTestTerrainMaterial=terrainMat;window.__monsoonTestBarkMaterial=bark;`);
      body = body.replace("window.__monsoonTestTerrainMaterial=terrainMat;", `window.__monsoonTestTerrainMaterial=terrainMat;const __testTerrainCompile=terrainMat.onBeforeCompile;terrainMat.onBeforeCompile=(shader,renderer)=>{__testTerrainCompile.call(terrainMat,shader,renderer);window.__monsoonTestTerrainShader=shader.fragmentShader;window.__monsoonTestCliffMaps=[shader.uniforms.rockColorMap?.value?.image?.src||null,shader.uniforms.rockRoughnessMap?.value?.image?.src||null];};`);
    }
    res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404).end(); }
});

await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const url = `http://127.0.0.1:${server.address().port}/?debug`;
const wait = ms => new Promise(resolveWait => setTimeout(resolveWait, ms));

async function inspect(width, height) {
  const profile = mkdtempSync(resolve(tmpdir(), "monsoon-smoke-"));
  const chrome = spawn(process.env.CHROME_BIN || "chromium", [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--enable-webgl",
    "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--use-gl=angle",
    "--use-angle=swiftshader", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, url
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const debug = process.env.DEBUG_SCENE_TEST === "1";
  const debugLog = (...args) => { if (debug) console.error(`[scene-smoke ${width}x${height}]`, ...args); };
  chrome.stderr.on("data", chunk => debugLog(`[chromium] ${String(chunk).trimEnd()}`));
  chrome.on("exit", (code, signal) => debugLog(`Chromium exited: code=${code}, signal=${signal}`));
  let socket;
  try {
    let port;
    for (let i = 0; i < 100 && !port; i++) {
      try { port = Number(readFileSync(resolve(profile, "DevToolsActivePort"), "utf8").split("\n")[0]); }
      catch { await wait(100); }
    }
    assert.ok(port, "Chromium DevTools starts");
    debugLog("DevTools port started", port);
    let target;
    for (let i = 0; i < 100 && !target; i++) {
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === "page"); }
      catch { await wait(100); }
    }
    assert.ok(target, "a page target is available");
    debugLog("Page target available", target.url);
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => { socket.onopen = resolveOpen; socket.onerror = rejectOpen; });
    debugLog("DevTools WebSocket connected");
    let id = 0;
    const pending = new Map();
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (debug && (message.method === "Inspector.targetCrashed" || message.method === "Target.targetCrashed")) debugLog("DevTools crash event", message.method, message.params);
      if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      }
    };
    socket.onclose = event => {
      const error = `DevTools WebSocket closed (code ${event.code})`;
      debugLog(error);
      for (const [requestId, finish] of pending) { finish({ error: { message: error } }); pending.delete(requestId); }
    };
    const call = (method, params = {}) => new Promise((resolveCall, rejectCall) => {
      const requestId = ++id;
      const timeout = setTimeout(() => { pending.delete(requestId); rejectCall(new Error(`DevTools timeout: ${method}`)); }, 10000);
      pending.set(requestId, message => { clearTimeout(timeout); message.error ? rejectCall(new Error(JSON.stringify(message.error))) : resolveCall(message.result); });
      if (debug && method !== "Runtime.evaluate") debugLog("CDP request", method);
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
    let evaluateCount = 0;
    const evaluate = async expression => {
      evaluateCount++;
      if (debug && (evaluateCount === 1 || evaluateCount % 50 === 0)) debugLog("Runtime.evaluate", evaluateCount, expression.slice(0, 70));
      const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(`${result.exceptionDetails.text}: ${result.exceptionDetails.exception?.description||""}`);
      return result.result.value;
    };
    await call("Page.enable");
    await call("Runtime.enable");
    await call("Page.addScriptToEvaluateOnNewDocument", { source: `window.__monsoonBootErrors=[];addEventListener('error',e=>window.__monsoonBootErrors.push(JSON.stringify({kind:'error',message:e.message||'',target:e.target?.tagName||'window',src:e.target?.currentSrc||e.target?.src||'',filename:e.filename||'',line:e.lineno||0})),true);addEventListener('unhandledrejection',e=>window.__monsoonBootErrors.push(JSON.stringify({kind:'rejection',reason:e.reason?.stack||e.reason?.message||String(e.reason)})));addEventListener('webglcontextlost',e=>window.__monsoonBootErrors.push('webglcontextlost on '+(e.target?.id||'canvas')),true);addEventListener('webglcontextrestored',e=>window.__monsoonBootErrors.push('webglcontextrestored on '+(e.target?.id||'canvas')),true);const originalError=console.error;console.error=(...args)=>{window.__monsoonBootErrors.push(args.map(x=>x?.stack||x?.message||String(x)).join(' '));originalError.apply(console,args)};` });
    await call("Page.reload", { ignoreCache: true });
    let ready = false;
    for (let i = 0; i < 150 && !ready; i++) {
      await wait(200);
      ready = await evaluate("!!document.getElementById('enterButton') && !document.getElementById('enterButton').disabled");
    }
    const loadState = await evaluate(`JSON.stringify({label:document.getElementById('loaderLabel')?.textContent,errors:window.__monsoonBootErrors,contextLost:document.querySelector('#world canvas')?.getContext('webgl2')?.isContextLost()??null,resources:performance.getEntriesByType('resource').map(entry=>[new URL(entry.name).pathname,entry.responseStatus||0])})`);
    assert.ok(ready, `the landscape finishes loading (${loadState})`);
    const result = JSON.parse(await evaluate("JSON.stringify({state:window.monsoonDebug.state(),canvas:!!document.querySelector('#world canvas')})"));
    assert.ok(result.canvas, "the 3D canvas is present");
    const waterfallViewingDistance=Math.abs(result.state.position[2]-await evaluate("window.__monsoonTestFallZ"));
    assert.ok(waterfallViewingDistance>=30,`the opening has enough distance to show the river valley and waterfall together (${waterfallViewingDistance}m)`);
    const assetRequests = JSON.parse(await evaluate(`JSON.stringify((()=>{const entries=performance.getEntriesByType("resource");return {paths:entries.map(entry=>new URL(entry.name).pathname),external:entries.filter(entry=>/^https?:/.test(entry.name)&&new URL(entry.name).origin!==location.origin).map(entry=>entry.name)}})())`));
    const requiredAssetPaths = [
      "/assets/ground/Ground024_1K-JPG_Color.jpg",
      "/assets/ground/Ground024_1K-JPG_NormalGL.jpg",
      "/assets/ground/Ground024_1K-JPG_Roughness.jpg",
      "/assets/cliff/Rock011_1K-JPG_Color.jpg",
      "/assets/cliff/Rock011_1K-JPG_NormalGL.jpg",
      "/assets/cliff/Rock011_1K-JPG_Roughness.jpg",
      "/assets/bark/Bark004_1K-JPG_Color.jpg",
      "/assets/bark/Bark004_1K-JPG_NormalGL.jpg",
      "/assets/bark/Bark004_1K-JPG_Roughness.jpg",
      "/assets/leaves/LeafSet017_1K-JPG_Color.jpg",
      "/assets/leaves/LeafSet017_1K-JPG_Opacity.jpg",
      "/assets/leaves/LeafSet017_1K-JPG_NormalGL.jpg",
      "/assets/fern/fern_02_1k.gltf",
      "/assets/fern/fern_02.bin",
      "/assets/fern/textures/fern_02_diff_1k.jpg",
      "/assets/fern/textures/fern_02_nor_gl_1k.jpg",
      "/assets/fern/textures/fern_02_arm_1k.jpg",
      "/vendor/examples/jsm/loaders/GLTFLoader.js",
      "/vendor/examples/jsm/utils/BufferGeometryUtils.js"
    ];
    for (const path of requiredAssetPaths) assert.ok(assetRequests.paths.includes(path), `bundled asset loads locally: ${path}`);
    assert.deepEqual(assetRequests.external, [], "all scene assets load without third-party runtime requests");
    const pbrMaps = JSON.parse(await evaluate(`JSON.stringify({ground:[window.__monsoonTestTerrainMaterial.map?.image?.src,window.__monsoonTestTerrainMaterial.normalMap?.image?.src,window.__monsoonTestTerrainMaterial.roughnessMap?.image?.src],cliff:window.__monsoonTestCliffMaps||[],bark:[window.__monsoonTestBarkMaterial.map?.image?.src,window.__monsoonTestBarkMaterial.normalMap?.image?.src,window.__monsoonTestBarkMaterial.roughnessMap?.image?.src]})`));
    assert.ok(pbrMaps.ground.every(path=>path&&new URL(path).pathname.startsWith("/assets/ground/")), "the terrain actually uses bundled ground PBR maps");
    assert.ok(pbrMaps.cliff.length===2&&pbrMaps.cliff.every(path=>path&&new URL(path).pathname.startsWith("/assets/cliff/")), "steep terrain actually uses bundled CC0 cliff color and roughness maps");
    assert.ok(pbrMaps.bark.every(path=>path&&new URL(path).pathname.startsWith("/assets/bark/")), "tree trunks actually use bundled bark PBR maps");
    const leafAtlas = JSON.parse(await evaluate(`(()=>{const m=window.__monsoonTestCanopyMaterial,c=m.map?.image;let coverage=0;if(c instanceof HTMLCanvasElement){const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let visible=0;for(let i=3;i<d.length;i+=4)if(d[i]>230)visible++;coverage=visible/(c.width*c.height);}return JSON.stringify({color:c instanceof HTMLCanvasElement,alpha:m.alphaMap?.image instanceof HTMLCanvasElement,normal:m.normalMap?.image instanceof HTMLCanvasElement,size:[c?.width,c?.height],coverage,alphaTest:m.alphaTest})})()`));
    assert.ok(leafAtlas.color&&leafAtlas.alpha&&leafAtlas.normal&&leafAtlas.size[0]===1024&&leafAtlas.size[1]===1024,
      `leaf atlases are composed locally from the bundled CC0 PBR set (${JSON.stringify(leafAtlas)})`);
    assert.ok(leafAtlas.coverage>.4&&leafAtlas.coverage<.85&&leafAtlas.alphaTest>=.25,
      `cluster cards must fill enough of their area for a dense crown while keeping transparent leaf edges (${JSON.stringify(leafAtlas)})`);
    const fernAsset = JSON.parse(await evaluate(`JSON.stringify((()=>{const group=window.__monsoonTestScene.getObjectByName("Fern 02 understory"),meshes=[];group?.traverse(object=>{if(object.isInstancedMesh)meshes.push({count:object.count,triangles:(object.geometry.index?.count||object.geometry.attributes.position.count)/3})});return {exists:!!group,meshes:meshes.length,instances:meshes.reduce((sum,item)=>sum+item.count,0),triangles:meshes.reduce((sum,item)=>sum+item.count*item.triangles,0)}})())`));
    assert.ok(fernAsset.exists&&fernAsset.meshes>0&&fernAsset.instances>0, "the real Fern 02 model is instanced into the understory");
    assert.ok(fernAsset.triangles<=100_000, `instanced Fern 02 stays within the foliage triangle budget (${JSON.stringify(fernAsset)})`);
    const waterfallAim = await evaluate(`(()=>{const p=window.monsoonDebug.state().position,river=window.__monsoonTestRiverCenter,dx=river(-91)-p[0],dz=-91-p[2];return Math.atan2(-dx,-dz);})()`);
    assert.ok(Math.abs(result.state.yaw-waterfallAim) < .05, "the opening view centers the waterfall axis instead of drifting off toward the bare ridge");
    assert.ok(result.state.pitch >= .22 && result.state.pitch <= .29, `the opening frame includes the living canopy above the waterfall (${result.state.pitch})`);
    assert.ok(result.state.position[2] <= -60, "the opening view places the waterfall at an immersive foreground scale");
    assert.equal(await evaluate("document.getElementById('loaderLabel').textContent"), "The valley is ready",
      "the scene reports a successful render");
    assert.ok(Number.isFinite(result.state.understoryPlants) && result.state.understoryPlants > 0,
      "a distinct understory plant layer is present");
    const rockGeometry = JSON.parse(await evaluate(`(() => {
      const original=window.__monsoonTestRockOriginal;
      const current=window.__monsoonTestRockGeometry.attributes.position.array;
      const groups=new Map();
      for(let i=0;i<original.length;i+=3){
        const key=original[i].toFixed(6)+","+original[i+1].toFixed(6)+","+original[i+2].toFixed(6);
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(i);
      }
      let sharedGroups=0,crackedGroups=0;
      for(const indices of groups.values())if(indices.length>1){
        sharedGroups++;
        const first=indices[0];
        if(indices.some(i=>Math.abs(current[i]-current[first])>1e-5||Math.abs(current[i+1]-current[first+1])>1e-5||Math.abs(current[i+2]-current[first+2])>1e-5))crackedGroups++;
      }
      return JSON.stringify({sharedGroups,crackedGroups});
    })()`));
    assert.ok(rockGeometry.sharedGroups > 0, "the generated rock geometry contains shared face vertices");
    assert.equal(rockGeometry.crackedGroups, 0, "rock shaping preserves coincident duplicated vertices");
    const canopy = JSON.parse(await evaluate(`(() => {
      const g=window.__monsoonTestCanopyGeometry,b=g.boundingBox;
      const uv=g.attributes.uv,leafPatches=new Set();
      for(let i=0;i<uv.count;i+=4){const u=(uv.getX(i)+uv.getX(i+1)+uv.getX(i+2)+uv.getX(i+3))/4,v=(uv.getY(i)+uv.getY(i+1)+uv.getY(i+2)+uv.getY(i+3))/4;leafPatches.add(Math.floor(u*2)+":"+Math.floor((1-v)*3));}
      return JSON.stringify({vertices:g.attributes.position.count,triangles:g.index.count/3,leafCards:g.index.count/6,leafPatches:leafPatches.size,span:[b.max.x-b.min.x,b.max.y-b.min.y,b.max.z-b.min.z]});
    })()`));
    assert.equal(canopy.leafCards, 72, `each combined crown stays within the per-tree leaf-card budget (${JSON.stringify(canopy)})`);
    assert.ok(canopy.leafPatches >= 4, `tree crowns vary the photographed leaves instead of repeating one cutout (${JSON.stringify(canopy)})`);
    assert.ok(canopy.span.every(axis => axis > .8), "leaf cards occupy an irregular 3D crown instead of a flat billboard");
    const canopyVerticalRatio = await evaluate("window.__monsoonTestCanopyVerticalRatio");
    assert.ok(canopyVerticalRatio > .85, "foreground tree crowns retain vertical volume instead of flattening into umbrellas");
    const canopyHorizontalScale = await evaluate("window.__monsoonTestCanopyHorizontalScale");
    assert.ok(canopyHorizontalScale >= 4.5, `individual leaf masses stay broad enough to overlap into full crowns (${canopyHorizontalScale})`);
    const forestCount = await evaluate("window.__monsoonTestTreeCount");
    assert.ok(forestCount >= (width >= 700 ? 400 : 210), "the Western Ghats forest has enough tree crowns to avoid an open, prop-like scattering");
    const crownInstanceCount = await evaluate("window.__monsoonTestCrownUsed.reduce((sum,count)=>sum+count,0)");
    assert.ok(crownInstanceCount >= forestCount, `each tree contributes one merged multi-lobed crown (${crownInstanceCount} crowns for ${forestCount} trees)`);
    assert.ok(await evaluate("window.__monsoonTestBranchCount") >= 5, "tree crowns are supported by irregular scaffold limbs rather than three spokes");
    const ledgeForest = JSON.parse(await evaluate(`(() => {
      const roots=window.__monsoonTestLedgeTreePositions,heightAt=window.__monsoonTestSurfaceHeight;
      const center=window.__monsoonTestRiverCenter,width=window.__monsoonTestRiverWidth,fallZ=window.__monsoonTestFallZ;
      const sampleZ=fallZ-21,samples=[8,12,16,20].flatMap(gap=>[-1,1].map(side=>({gap,side,y:heightAt(center(sampleZ)+side*(width(sampleZ)+gap),sampleZ)})));
      const visibleApexCount=roots.filter(([x,z,y])=>{const [nx,ny,nz]=window.__monsoonTestProjectPoint(x,y+12,z);return nx>-.96&&nx<.96&&ny>-.96&&ny<.96&&nz>-1&&nz<1;}).length;
      return JSON.stringify({count:roots.length,positions:roots,fallZ,samples,visibleApexCount,
        maxSurfaceError:roots.length?Math.max(...roots.map(([x,z,y])=>Math.abs(heightAt(x,z)-y))):Infinity,
        minRiverClearance:roots.length?Math.min(...roots.map(([x,z])=>Math.abs(x-center(z))-width(z))):-Infinity});
    })()`));
    assert.equal(ledgeForest.count,width>=700?12:6,`an evergreen ledge layer breaks up the bare waterfall shelf (${JSON.stringify(ledgeForest)})`);
    assert.ok(ledgeForest.maxSurfaceError<.001,`ledge trees sit on the real valley mesh instead of floating (${JSON.stringify(ledgeForest)})`);
    assert.ok(ledgeForest.positions.every(([,z])=>Math.abs(z-ledgeForest.fallZ)<=26)&&ledgeForest.minRiverClearance>=8,`waterfall-side trees frame but do not block the stream (${JSON.stringify(ledgeForest)})`);
    assert.ok(ledgeForest.visibleApexCount>=(width>=700?6:2),`the waterfall-side tree crowns appear in the actual opening camera frame (${JSON.stringify(ledgeForest)})`);
    const instanceCapacity = JSON.parse(await evaluate(`JSON.stringify({woodUsed:window.__monsoonTestWoodUsed,woodCapacity:window.__monsoonTestWoodCapacity,crowns:window.__monsoonTestCrownUsed.map((used,i)=>({used,capacity:window.__monsoonTestCrownCapacities[i]}))})`));
    assert.ok(instanceCapacity.woodUsed<=instanceCapacity.woodCapacity&&instanceCapacity.crowns.every(c=>c.used<=c.capacity),`ridge planting must not overrun instanced tree buffers (${JSON.stringify(instanceCapacity)})`);
    assert.ok(instanceCapacity.woodUsed >= forestCount && (await evaluate("window.__monsoonTestWoodGeometryTriangles.every(triangles=>triangles>=150)")), `tree silhouettes use merged geometry with bent trunk sections and scaffold limbs (${JSON.stringify(instanceCapacity)})`);
    const valleyCoverage = JSON.parse(await evaluate(`(() => {
      const roots=window.__monsoonTestTreeRoots,center=window.__monsoonTestRiverCenter;
      const near=roots.filter(([x,z])=>z>=-150&&z<=-60&&Math.abs(x-center(z))>=10&&Math.abs(x-center(z))<=70);
      return JSON.stringify({total:near.length,left:near.filter(([x,z])=>x<center(z)).length,right:near.filter(([x,z])=>x>center(z)).length});
    })()`));
    assert.ok(valleyCoverage.total >= (width >= 700 ? 180 : 90), "the waterfall approach has dense forest along both valley walls");
    assert.ok(valleyCoverage.left >= (width >= 700 ? 60 : 30) && valleyCoverage.right >= (width >= 700 ? 60 : 30), "the forest covers both sides of the ravine rather than leaving one slope bare");
    const bankCoverage = JSON.parse(await evaluate(`(() => {
      const roots=window.__monsoonTestTreeRoots,center=window.__monsoonTestRiverCenter,width=window.__monsoonTestRiverWidth;
      const near=roots.filter(([x,z])=>z>=-150&&z<=-60&&Math.abs(x-center(z))-width(z)>=4&&Math.abs(x-center(z))-width(z)<=10);
      return JSON.stringify({total:near.length,left:near.filter(([x,z])=>x<center(z)).length,right:near.filter(([x,z])=>x>center(z)).length});
    })()`));
    assert.ok(bankCoverage.total >= (width >= 700 ? 32 : 16), `evergreen crowns reach close enough to shade the wet stream banks (${JSON.stringify(bankCoverage)})`);
    const foregroundTrees = JSON.parse(await evaluate("JSON.stringify(window.__monsoonTestForegroundTrees)"));
    assert.ok(foregroundTrees.length >= 6 && foregroundTrees.every(([,z])=>z < -60), "the existing foreground trees frame the waterfall rather than repeating the old distant composition");
    const rightFlankCount = foregroundTrees.filter(([x,z])=>{
      const dx=x-result.state.position[0],dz=z-result.state.position[2],yaw=result.state.yaw;
      const forward=-Math.sin(yaw)*dx-Math.cos(yaw)*dz,right=Math.cos(yaw)*dx-Math.sin(yaw)*dz;
      return forward>=10&&forward<=20&&right>=9&&right<=16;
    }).length;
    assert.ok(rightFlankCount>=1, "a nearby tree frames the right side of the waterfall instead of leaving the ridge empty");
    const understoryScale = JSON.parse(await evaluate("JSON.stringify({fern:window.__monsoonTestMaxFernScale,rock:window.__monsoonTestMaxRockScale})"));
    assert.ok(understoryScale.fern <= .72, "fern fans stay small enough to read as understory rather than oversized props");
    assert.ok(understoryScale.rock <= .70, "stream rocks stay low enough to sit within the bank instead of dominating it");
    const river = JSON.parse(await evaluate(`(() => {
      const p=window.__monsoonTestWaterGeometry.attributes.position;
      let min=Infinity,max=-Infinity;
      for(let i=0;i<p.count;i+=2){const x=(p.getX(i)+p.getX(i+1))*.5;min=Math.min(min,x);max=Math.max(max,x);}
      return JSON.stringify({centerSpan:max-min});
    })()`));
    assert.ok(river.centerSpan >= 20, "the stream meanders across at least 20 metres instead of reading as a repeated narrow ribbon");
    const averageRiverWidth = JSON.parse(await evaluate(`(() => {
      const p=window.__monsoonTestWaterGeometry.attributes.position;let total=0,sections=0;
      for(let i=0;i<p.count;i+=2){total+=Math.abs(p.getX(i+1)-p.getX(i));sections++;}
      return JSON.stringify({width:total/sections});
    })()`));
    assert.ok(averageRiverWidth.width <= 3.8, "the stream stays within a narrow natural channel instead of a broad ribbon");
    const waterfallShape = JSON.parse(await evaluate(`(() => {
      const p=window.__monsoonTestFallGeometry.attributes.position,widths=[];
      for(let i=0;i<21;i++)widths.push(Math.abs(p.getX(i*2+1)-p.getX(i*2))*.5);
      const bends=[];for(let i=1;i<20;i++)bends.push(widths[i+1]-2*widths[i]+widths[i-1]);
      const mean=bends.reduce((a,b)=>a+b,0)/bends.length;
      return JSON.stringify({variation:Math.sqrt(bends.reduce((sum,b)=>sum+(b-mean)**2,0)/bends.length)});
    })()`));
    assert.ok(waterfallShape.variation >= .001, "the waterfall edge varies instead of forming a perfectly smooth ribbon");
    const bankRelief = JSON.parse(await evaluate(`(() => {
      const height=window.__monsoonTestTerrainHeight,center=window.__monsoonTestRiverCenter,width=window.__monsoonTestRiverWidth;
      let squares=0,count=0;
      for(const z of [15,-30,-70]){
        const x0=center(z)+width(z)+1,values=[];
        for(let i=0;i<16;i++)values.push(height(x0+i*1.5,z));
        for(let i=1;i<15;i++){const bend=values[i+1]-2*values[i]+values[i-1];squares+=bend*bend;count++;}
      }
      return JSON.stringify({roughness:Math.sqrt(squares/count)});
    })()`));
    assert.ok(bankRelief.roughness >= .20, "near-stream banks contain short-scale relief instead of smooth rolling sheets");
    const visualRefinement = JSON.parse(await evaluate(`JSON.stringify((()=>{
      const sections=window.__monsoonTestWaterGeometry.attributes.position;
      const widths=[];
      for(let i=0;i<sections.count;i+=2){const z=(sections.getZ(i)+sections.getZ(i+1))*.5;if(z>=-80&&z<=-20)widths.push(Math.abs(sections.getX(i+1)-sections.getX(i)));}
      const bends=[];for(let i=1;i<widths.length-1;i++)bends.push(widths[i+1]-2*widths[i]+widths[i-1]);
      const channelRelief=Math.sqrt(bends.reduce((sum,b)=>sum+b*b,0)/Math.max(1,bends.length));
      const {mesh,nx,nz}=window.__monsoonTestRangeMeshes[0],p=mesh.geometry.attributes.position,ix=Math.floor(nx*.5),heights=[];
      for(let iz=0;iz<=nz;iz++)heights.push(p.getY(iz*(nx+1)+ix));
      const ridgeBends=[];for(let iz=1;iz<nz;iz++)ridgeBends.push(heights[iz+1]-2*heights[iz]+heights[iz-1]);
      const ridgeRelief=Math.sqrt(ridgeBends.reduce((sum,b)=>sum+b*b,0)/ridgeBends.length);
      const terrain=window.__monsoonTestScene.getObjectByName("Ground024 forest floor").geometry.attributes.position;
      let rowZ=0,rowDistance=Infinity;for(let i=0;i<terrain.count;i++){const z=terrain.getZ(i),distance=Math.abs(z+118);if(distance<rowDistance){rowZ=z;rowDistance=distance;}}
      const fallX=window.__monsoonTestRiverCenter(-91),cliffPoints=[];
      for(let i=0;i<terrain.count;i++)if(Math.abs(terrain.getZ(i)-rowZ)<1e-4&&Math.abs(terrain.getX(i)-fallX)<20)cliffPoints.push([terrain.getX(i),terrain.getY(i)]);
      cliffPoints.sort((a,b)=>a[0]-b[0]);const cliffBends=[];for(let i=1;i<cliffPoints.length-1;i++)cliffBends.push(cliffPoints[i+1][1]-2*cliffPoints[i][1]+cliffPoints[i-1][1]);
      const cliffRelief=Math.sqrt(cliffBends.reduce((sum,b)=>sum+b*b,0)/Math.max(1,cliffBends.length)),cliffSpacing=cliffPoints[1][0]-cliffPoints[0][0];
      const spray=window.__monsoonTestScene.getObjectByName("Waterfall impact spray"),material=window.__monsoonTestTerrainMaterial;
      const ridgeMaps=[mesh.material.map,mesh.material.normalMap,mesh.material.roughnessMap];
      return {openingWidth:window.__monsoonTestRiverWidth(-74),channelRelief,ridgeRelief,groundRoughness:material.roughness,
        roughnessFloor:window.__monsoonTestTerrainShader?.includes("max(roughnessFactor, 0.82)")||false,
        sprayPoints:spray?.geometry?.attributes?.position?.count||0,sprayTransparent:!!spray?.material?.transparent,
        ridgePbrMaps:ridgeMaps.every(texture=>texture?.image?.src&&new URL(texture.image.src).pathname.startsWith("/assets/cliff/")),
        ridgeUvCount:mesh.geometry.attributes.uv?.count||0,cliffRelief,cliffSpacing};
    })())`));
    assert.ok(visualRefinement.openingWidth <= 1.9, `the opening stream reads as a narrow natural channel (${JSON.stringify(visualRefinement)})`);
    assert.ok(visualRefinement.channelRelief >= .075, `stream width varies over short distances instead of remaining uniform (${JSON.stringify(visualRefinement)})`);
    assert.ok(visualRefinement.ridgeRelief >= 2.9, `the ridge has eroded surface relief rather than a smooth wall (${JSON.stringify(visualRefinement)})`);
    assert.ok(visualRefinement.cliffSpacing <= (width>=700?1.9:2.9)&&visualRefinement.cliffRelief >= (width>=700?1.5:.9), `the waterfall face has enough mesh density and geometric erosion to read as rock, not a smooth wall (${JSON.stringify(visualRefinement)})`);
    assert.ok(visualRefinement.ridgePbrMaps && visualRefinement.ridgeUvCount > 0, `the ridge uses locally bundled licensed color, normal and roughness maps (${JSON.stringify(visualRefinement)})`);
    assert.ok(visualRefinement.groundRoughness >= .99 && visualRefinement.roughnessFloor, `damp ground keeps a matte roughness floor while retaining its texture map (${JSON.stringify(visualRefinement)})`);
    assert.ok(visualRefinement.sprayPoints >= 80 && visualRefinement.sprayTransparent, `the waterfall landing has a translucent impact-spray layer (${JSON.stringify(visualRefinement)})`);
    if (width >= 700) {
      await evaluate("document.getElementById('enterButton').click()");
      assert.equal(await evaluate("document.getElementById('intro').classList.contains('hidden')"), true,
        "the entry button opens the landscape");
      await evaluate("document.getElementById('helpButton').click()");
      assert.equal(await evaluate("document.getElementById('helpButton').getAttribute('aria-expanded')"), "true",
        "the help button opens the control panel");
    }
    if (width >= 700) {
      await evaluate("document.getElementById('metrics').hidden = true");
      await evaluate("document.getElementById('helpPanel').classList.remove('open');document.getElementById('hud').classList.remove('visible');document.getElementById('controls').classList.remove('visible');document.getElementById('toast').classList.remove('show');document.getElementById('intro').remove()");
      await evaluate(`(()=>{const q=document.getElementById('quality');q.value='high';q.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      const firstFrame = await evaluate("window.__monsoonTestFrameCount||0");
      let renderedFrames = firstFrame;
      for(let i=0;i<60&&renderedFrames<firstFrame+2;i++){await wait(250);renderedFrames=await evaluate("window.__monsoonTestFrameCount||0");}
      const captureState = await evaluate(`JSON.stringify((()=>{const c=document.querySelector('#world canvas'),r=c.getBoundingClientRect(),s=getComputedStyle(c),gl=c.getContext('webgl2');return {frames:window.__monsoonTestFrameCount,canvas:[c.width,c.height,r.width,r.height],display:s.display,visibility:s.visibility,opacity:s.opacity,page:document.visibilityState,center:document.elementFromPoint(innerWidth/2,innerHeight/2)?.tagName,contextLost:gl?.isContextLost(),scene:window.monsoonDebug.state()}})())`);
      assert.ok(renderedFrames >= firstFrame + 2, `the preview renderer did not complete two fresh frames (${captureState})`);
      if(process.env.DEBUG_SCENE_STATE)console.log(`PREVIEW_STATE ${captureState}`);
      await wait(Number(process.env.PREVIEW_SETTLE_MS||1200));
      await evaluate("window.__monsoonTestRender()");
      const postRenderState=await evaluate(`JSON.stringify((()=>{const c=document.querySelector('#world canvas'),gl=c.getContext('webgl2');return {frames:window.__monsoonTestFrameCount,appContextLost:window.__monsoonTestGraphicsLost(),contextLost:gl?.isContextLost(),glError:gl?.getError(),scene:window.monsoonDebug.state()}})())`);
      if(process.env.DEBUG_SCENE_STATE)console.log(`PREVIEW_POST_RENDER ${postRenderState}`);
      const screenshot = await call("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
      const postCaptureState=await evaluate(`JSON.stringify((()=>{const c=document.querySelector('#world canvas'),gl=c.getContext('webgl2');return {frames:window.__monsoonTestFrameCount,appContextLost:window.__monsoonTestGraphicsLost(),contextLost:gl?.isContextLost(),glError:gl?.getError(),scene:window.monsoonDebug.state()}})())`);
      if(process.env.DEBUG_SCENE_STATE)console.log(`PREVIEW_POST_CAPTURE ${postCaptureState}`);
      if(process.env.PREVIEW_FILE)writeFileSync(process.env.PREVIEW_FILE, Buffer.from(screenshot.data, "base64"));
      const screenshotUrl=`data:image/png;base64,${screenshot.data}`;
      const pixels=JSON.parse(await evaluate(`(async()=>{
        const image=new Image();image.src=${JSON.stringify(screenshotUrl)};await image.decode();
        const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
        const context=canvas.getContext("2d");context.drawImage(image,0,0);const {data,width:iw,height:ih}=context.getImageData(0,0,canvas.width,canvas.height);
        const luma=(x,y)=>{const i=(y*iw+x)*4;return .2126*data[i]+.7152*data[i+1]+.0722*data[i+2];};
        let sceneSum=0,sceneSquare=0,sceneCount=0;
        for(let y=100;y<Math.min(570,ih);y++)for(let x=200;x<Math.min(1100,iw);x++){const value=luma(x,y);sceneSum+=value;sceneSquare+=value*value;sceneCount++;}
        let cliffContrast=0,cliffCount=0;
        for(let y=210;y<Math.min(350,ih-1);y++)for(let x=760;x<Math.min(1030,iw-1);x++){
          const center=luma(x,y),neighborhood=(luma(x-1,y)+luma(x+1,y)+luma(x,y-1)+luma(x,y+1))*.25;
          cliffContrast+=Math.abs(center-neighborhood);cliffCount++;
        }
        const fall=window.__monsoonTestFallGeometry.attributes.position,project=window.__monsoonTestProjectPoint;
        let minX=iw,minY=ih,maxX=0,maxY=0;
        for(let i=0;i<fall.count;i++){const [nx,ny]=project(fall.getX(i),fall.getY(i),fall.getZ(i));const x=(nx*.5+.5)*iw,y=(.5-ny*.5)*ih;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
        const x0=Math.max(0,Math.floor(minX)-2),x1=Math.min(iw,Math.ceil(maxX)+2),y0=Math.max(0,Math.floor(minY)-2),y1=Math.min(ih,Math.ceil(maxY)+2),runs=[];
        for(let x=x0;x<x1;x++){let best=0,current=0;for(let y=y0;y<y1;y++){
          if(luma(x,y)>90){current++;best=Math.max(best,current);}else current=0;}runs.push(best);}
        runs.sort((a,b)=>a-b);
        return JSON.stringify({sceneLumaStd:Math.sqrt(Math.max(0,sceneSquare/sceneCount-(sceneSum/sceneCount)**2)),cliffLocalContrast:cliffContrast/Math.max(1,cliffCount),waterfallBounds:[x0,y0,x1,y1],waterfallRunP90:runs[Math.floor(runs.length*.9)]});
      })()`));
      assert.ok(pixels.sceneLumaStd >= 5, `the screenshot contains a rendered landscape rather than a blank canvas (${JSON.stringify(pixels)})`);
      assert.ok(pixels.cliffLocalContrast >= .55, `the waterfall cliff retains visible fine-scale texture above its original smooth-wall baseline (${JSON.stringify(pixels)})`);
      assert.ok(pixels.waterfallRunP90 <= 90, `the real waterfall render breaks up long, straight bright streaks (${JSON.stringify(pixels)})`);
    }
    if (width < 700 && process.env.PREVIEW_MOBILE_FILE) {
      await evaluate("for(const id of ['intro','touchUI','hud','controls','metrics'])document.getElementById(id)?.remove()");
      await wait(400);
      const screenshot=await call("Page.captureScreenshot",{format:"png",fromSurface:true,captureBeyondViewport:false});
      writeFileSync(process.env.PREVIEW_MOBILE_FILE,Buffer.from(screenshot.data,"base64"));
    }
    return result.state;
  } finally {
    socket?.close();
    chrome.kill("SIGTERM");
    await new Promise(resolveExit => { if (chrome.exitCode !== null) resolveExit(); else chrome.once("exit", resolveExit); });
    rmSync(profile, { recursive: true, force: true });
  }
}

try {
  const desktop = await inspect(1280, 800);
  const mobile = await inspect(390, 844);
  if (process.env.DEBUG_SCENE_STATE) console.log(JSON.stringify({desktop,mobile},null,2));
  assert.ok(Number.isFinite(desktop.instances)&&Number.isFinite(mobile.instances), `scene instance metrics remain finite after combining tree meshes (${JSON.stringify({desktop:desktop.instances,mobile:mobile.instances})})`);
  assert.ok(desktop.instances < 2500, "desktop scene stays within its instance budget with merged tree geometry");
  assert.ok(mobile.instances < desktop.instances, "mobile scene remains lighter than desktop");
  assert.ok(mobile.understoryPlants < desktop.understoryPlants, "mobile gets a smaller understory layer");
  assert.ok(desktop.triangles < 300_000, `desktop scene stays below the 300k triangle budget (${desktop.triangles})`);
  assert.ok(mobile.triangles < 160_000, `mobile scene stays below the 160k triangle budget (${mobile.triangles})`);
  console.log(`PASS scene smoke: ${desktop.instances} desktop instances; ${mobile.instances} mobile instances`);
} finally {
  await new Promise(resolveClose => server.close(resolveClose));
}
