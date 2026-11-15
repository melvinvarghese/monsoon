export async function start(fail) {
    const THREE = await import("./vendor/three.module.min.js");
    const mount = document.getElementById("world");
    const loader = document.getElementById("loader");
    const loaderFill = document.getElementById("loaderFill");
    const loaderLabel = document.getElementById("loaderLabel");
    const intro = document.getElementById("intro");
    const hud = document.getElementById("hud");
    const controlsUI = document.getElementById("controls");
    const helpPanel = document.getElementById("helpPanel");
    const toast = document.getElementById("toast");
    const touchUI = document.getElementById("touchUI");
    const touchStick = document.getElementById("touchStick");
    const touchKnob = document.getElementById("touchKnob");
    const touchLook = document.getElementById("touchLook");

    const isMobile = matchMedia("(pointer: coarse)").matches || innerWidth < 700;
    const scene = new THREE.Scene();
    const skyColor = new THREE.Color(0xa3b7ab);
    const sunDirection = new THREE.Vector3(-.43,.34,-.83).normalize();
    const time = {value:0};
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1,24,14),new THREE.ShaderMaterial({
      side:THREE.BackSide,depthWrite:false,uniforms:{time,sunDirection:{value:sunDirection}},
      vertexShader:`varying vec3 direction;void main(){
        direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
      fragmentShader:`varying vec3 direction;uniform float time;uniform vec3 sunDirection;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      void main(){
        vec3 d=normalize(direction);
        float h=max(d.y,0.), facing=max(dot(d,sunDirection),0.);
        vec3 color=mix(vec3(.36,.46,.41),vec3(.16,.30,.34),smoothstep(0.,.82,h));
        vec2 p=d.xz/(.24+h)*2.7+vec2(time*.026,-.4);
        float cover=noise(p)*.63+noise(p*2.2)*.25+noise(p*5.1)*.12;
        color=mix(color,mix(vec3(.32,.40,.39),vec3(.64,.66,.57),cover),smoothstep(.27,.73,cover)*smoothstep(.01,.2,h));
        color+=vec3(.35,.22,.10)*pow(facing,12.)+vec3(.7,.54,.32)*smoothstep(.996,.9995,facing)*(1.-cover*.8);
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`
    }));
    sky.scale.setScalar(460);sky.frustumCulled=false;sky.renderOrder=-10;scene.add(sky);
    scene.fog = new THREE.FogExp2(skyColor, .0068);
    const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .18, 620);
    const renderer = new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:"high-performance"});
    let graphicsLost = false;
    renderer.domElement.addEventListener("webglcontextlost", event => {
      event.preventDefault();
      graphicsLost = true;
      document.exitPointerLock?.();
      loader.classList.remove("done");
      fail("Graphics memory was interrupted. Reload to return to the valley.");
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);
    const query = new URLSearchParams(location.search);
    const profiles = [.63,.85,1.14];
    let profile = isMobile ? 1 : 2;
    let quality = "auto";
    const qualitySelect = document.getElementById("quality");
    function resize(){
      const base = Math.min(devicePixelRatio,profiles[profile]);
      const cap = [430000,950000,1900000][profile];
      renderer.setPixelRatio(Math.min(base,Math.sqrt(cap/(innerWidth*innerHeight))));
      renderer.setSize(innerWidth,innerHeight);
      camera.aspect=innerWidth/innerHeight;
      camera.updateProjectionMatrix();
    }
    qualitySelect.addEventListener("change",()=>{
      quality=qualitySelect.value;
      profile=quality==="auto" ? (isMobile?1:2) : ["low","medium","high"].indexOf(quality);
      resize();
    });
    resize();
    addEventListener("resize",resize);

    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const keys = {};
    let started = false, soundOn = false, audioContext = null, masterGain = null;
    let yaw = 0, pitch = -0.06, pointerLocked = false;
    const touchMove = {x:0,y:0};
    let stickPointer = null, lookPointer = null, lastLookX = 0, lastLookY = 0;
    let toastTimer = null;
    const clamp = THREE.MathUtils.clamp;
    const lerp = THREE.MathUtils.lerp;

    function seeded(seed){let t=seed>>>0;return ()=>{t+=0x6D2B79F5;let x=t;x=Math.imul(x^x>>>15,x|1);x^=x+Math.imul(x^x>>>7,x|61);return ((x^x>>>14)>>>0)/4294967296;};}
    const random = seeded(82417);
    function smoothNoise(x,z){
      const ix=Math.floor(x), iz=Math.floor(z), fx=x-ix, fz=z-iz;
      const h=(a,b)=>{let n=Math.sin(a*127.1+b*311.7+19.19)*43758.5453;return n-Math.floor(n);};
      const u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);
      return lerp(lerp(h(ix,iz),h(ix+1,iz),u),lerp(h(ix,iz+1),h(ix+1,iz+1),u),v)*2-1;
    }
    function fbm(x,z){let n=0,a=.55,f=.045;for(let i=0;i<4;i++){n+=smoothNoise(x*f,z*f)*a;a*=.5;f*=2.03;}return n;}
    function riverX(z){return Math.sin(z*.027)*7+Math.sin(z*.071)*1.7;}
    // Broad forest pockets frame the valley instead of distributing trees uniformly.
    function forestDensity(x,z){
      const pockets=.54+.20*Math.sin(x*.031+z*.018)*Math.cos(z*.026-x*.014)+.14*Math.sin(x*.012-z*.017);
      const riverOpening=clamp((Math.abs(x-riverX(z))-9)/13,0,1);
      const pathX=trailX(z);
      const pathOpening=clamp((Math.abs(x-pathX)-2.5)/8,0,1);
      return clamp(pockets*riverOpening*pathOpening,.08,.9);
    }
    function riverLevel(z){return .5+(77-z)*.032;}
    const fallZ=-91, fallX=riverX(fallZ), fallBase=riverLevel(fallZ);
    function riverWidth(z){return 2.15+4.2*Math.exp(-((z+86)**2)/100)+.38*Math.sin(z*.13);}
    function trailX(z){return riverX(z)+riverWidth(z)+3.3+.9*Math.sin(z*.07);}
    function terrainHeight(x,z){
      const distance=Math.abs(x-riverX(z));
      const bank=riverWidth(z);
      const wideSlope=1-Math.exp(-((distance/38)**2));
      const ribs=(.64+.21*Math.sin(z*.048+x*.028)+.15*Math.cos(z*.083-x*.04));
      const valley=wideSlope*(25+28*ribs)*Math.min(1,distance/95);
      const rockFace=Math.exp(-(((x-fallX)/14)**4))*14*
        THREE.MathUtils.smoothstep(-z,90,104)*(1-THREE.MathUtils.smoothstep(-z,130,144));
      return riverLevel(z)+lerp(-1.15,.73,THREE.MathUtils.smoothstep(distance,bank-1.35,bank+1.4))+
        valley+fbm(x+140,z-70)*6*Math.min(1,distance/13)+rockFace;
    }
    function setProgress(n,label){loaderFill.style.width=n+"%";if(label)loaderLabel.textContent=label;}

    const hemi = new THREE.HemisphereLight(0xd0e3e4,0x56604a,1.62);scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffdfac,2.05);sun.position.copy(sunDirection).multiplyScalar(100);scene.add(sun);

    // Sculpt the broad valley from a deterministic height field.
    setProgress(12,"Sculpting the valley");
    const terrainSize=300, terrainSegments=128;
    const terrainGeo=new THREE.PlaneGeometry(terrainSize,terrainSize,terrainSegments,terrainSegments);
    terrainGeo.rotateX(-Math.PI/2);
    const pos=terrainGeo.attributes.position;
    const colors=[];
    const cLow=new THREE.Color(0x293c2e),cMid=new THREE.Color(0x526c43),cHigh=new THREE.Color(0x71805a),cRock=new THREE.Color(0x555d50);
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),z=pos.getZ(i),h=terrainHeight(x,z);
      pos.setY(i,h);
      const moisture=clamp(.5+fbm(x+90,z-30)*.22,0,1);
      const slope=Math.abs(fbm(x*.7,z*.7));
      let col=cLow.clone().lerp(cMid,clamp((h+3)/15,0,1));
      col.lerp(cHigh,clamp((h-8)/18,0,.55));
      col.lerp(cRock,clamp((slope-.48)*.32,0,.25));
      col.multiplyScalar(.84+moisture*.2);
      colors.push(col.r,col.g,col.b);
    }
    terrainGeo.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));terrainGeo.computeVertexNormals();
    const terrainMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.83});
    terrainMat.onBeforeCompile=(shader)=>{
      shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nvarying vec3 vTerrainWorld;");
      shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nvTerrainWorld=(modelMatrix*vec4(transformed,1.0)).xyz;");
      shader.fragmentShader=shader.fragmentShader.replace("#include <common>",`#include <common>
        varying vec3 vTerrainWorld;
        float grain(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float mottling(vec2 p){vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(grain(i),grain(i+vec2(1,0)),f.x),mix(grain(i+vec2(0,1)),grain(i+1.),f.x),f.y);}
      `);
      shader.fragmentShader=shader.fragmentShader.replace("#include <color_fragment>",`#include <color_fragment>
        vec2 p=vTerrainWorld.xz;
        float mottle=mottling(p*.25)*.72+mottling(p*1.1)*.28;
        float fine=mottling(p*8.);
        float center=sin(p.y*.027)*7.+sin(p.y*.071)*1.7;
        float width=2.15+4.2*exp(-((p.y+86.)*(p.y+86.))/100.)+.38*sin(p.y*.13);
        float trail=abs(p.x-(center+width+3.3+.9*sin(p.y*.07)));
        float bank=abs(p.x-center);
        float slope=1.-normalize(cross(dFdx(vTerrainWorld),dFdy(vTerrainWorld))).y;
        diffuseColor.rgb*=mix(.48,1.18,mottle);
        vec3 stone=mix(vec3(.042,.050,.043),vec3(.133,.14,.121),mottle);
        diffuseColor.rgb=mix(diffuseColor.rgb,stone,smoothstep(.15,.68,slope));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.087,.062,.032)*(.7+mottle*.65),
          (1.-smoothstep(.53,1.25,trail+fine*.30))*smoothstep(-102.,-89.,p.y));
        diffuseColor.rgb*=.82+fine*.36;
        diffuseColor.rgb*=mix(.60,1.,smoothstep(width-1.,width+1.,bank));
      `);
    };
    const terrain=new THREE.Mesh(terrainGeo,terrainMat);
    scene.add(terrain);

    // Sculpted mountain walls: overlapping ridge silhouettes with natural variation.
    setProgress(25,"Raising the Western Ghats");
    function buildRange(zBase,width,depth,height,seed,tint){
      const r=seeded(seed),nx=isMobile?100:160,nz=20,vertices=[],indices=[],colors=[],peaks=[];
      for(let p=0;p<15;p++)peaks.push({x:(r()-.5)*width*.96,w:9+r()*24,h:height*(.4+r()*.75)});
      for(let iz=0;iz<=nz;iz++){const v=iz/nz,z=(v-.5)*depth;for(let ix=0;ix<=nx;ix++){
        const x=(ix/nx-.5)*width;let ridge=0;for(const p of peaks)ridge=Math.max(ridge,p.h*Math.exp(-Math.pow((x-p.x)/p.w,2)));
        const edge=Math.pow(Math.sin(Math.PI*v),.64),y=1.5+ridge*edge+fbm(x+seed,z+seed)*height*.23*edge;
        vertices.push(x,y,z);const c=new THREE.Color(tint).multiplyScalar(clamp(.76+ridge/height*.25+fbm(x,z)*.025,.55,1.08));colors.push(c.r,c.g,c.b);
        if(ix<nx&&iz<nz){const q=iz*(nx+1)+ix,k=q+nx+1;indices.push(q,k,q+1,k,k+1,q+1);}
      }}
      const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));g.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
      const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));m.position.z=zBase;scene.add(m);
    }
    buildRange(-143,360,91,60,301,0x395849);buildRange(-201,410,97,84,602,0x597568);buildRange(-265,475,110,103,903,0x7d968e);

    // Alpha-cut foliage uses one small procedural atlas and crossed cards, with
    // shared trunk geometry. Leaf silhouettes and interior lighting live in the atlas.
    setProgress(40,"Growing the rainforest canopy");
    const atlas=document.createElement("canvas");
    atlas.width=512;atlas.height=256;
    const paint=atlas.getContext("2d");
    const foliageRandom=seeded(5531);
    for(let variant=0;variant<2;variant++){
      const clusters=[];
      for(let i=0;i<16;i++){
        const a=i*2.399, reach=Math.sqrt(i/16);
        clusters.push([128+Math.cos(a)*reach*84,126+Math.sin(a)*reach*(variant?90:61),18+foliageRandom()*23]);
      }
      paint.save();paint.translate(variant*256,0);
      for(let pass=0;pass<2;pass++){
        for(const [x,y,radius] of clusters){
          for(let i=0;i<32;i++){
            const a=foliageRandom()*Math.PI*2, rad=Math.sqrt(foliageRandom())*radius;
            const length=(2.6+foliageRandom()*7.0)*(pass?1:.84);
            paint.save();paint.translate(x+Math.sin(a)*rad,y+Math.cos(a)*rad);
            paint.rotate(a+foliageRandom());
            const light=pass?21+foliageRandom()*19:10+foliageRandom()*11;
            paint.fillStyle=`hsl(${92+foliageRandom()*42} ${26+foliageRandom()*27}% ${light}%)`;
            paint.beginPath();paint.moveTo(-length,0);
            paint.quadraticCurveTo(-length*.1,-length*.77,length,0);
            paint.quadraticCurveTo(length*.04,length*.57,-length,0);
            paint.fill();paint.restore();
          }
        }
      }
      paint.restore();
    }
    const foliageTexture=new THREE.CanvasTexture(atlas);
    foliageTexture.colorSpace=THREE.SRGBColorSpace;
    foliageTexture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    const leafMat=new THREE.MeshLambertMaterial({map:foliageTexture,alphaTest:.41,depthWrite:true,side:THREE.DoubleSide});
    leafMat.onBeforeCompile=shader=>{
      shader.uniforms.windTime=time;
      shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nuniform float windTime;");
      shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>",`#include <begin_vertex>
        vec3 root=instanceMatrix[3].xyz;
        transformed.x+=sin(root.x*.11+root.z*.09+windTime*1.32+position.y)*.042;
        transformed.z+=cos(root.z*.12+windTime*1.03+position.x*2.)*.039;
      `);
    };
    function canopyCards(variant){
      const vertices=[],uv=[],indices=[];
      for(let i=0;i<3;i++){
        const a=i*Math.PI/3, x=Math.cos(a), z=Math.sin(a);
        const tilt=i===1?.32:-.21;
        vertices.push(-x,-1,-z, x,-1,z, x+z*tilt,1,z-x*tilt,-x+z*tilt,1,-z-x*tilt);
        const left=variant*.5+.008,right=left+.484;
        uv.push(left,0,right,0,right,1,left,1);
        const v=i*4;indices.push(v,v+1,v+2,v,v+2,v+3);
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
      geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
      geometry.setIndex(indices);geometry.computeVertexNormals();
      return geometry;
    }
    const trunkGeo=new THREE.CylinderGeometry(.37,.63,1,6,1);
    const bark=new THREE.MeshLambertMaterial({color:0x3c392b});
    const treeCount=isMobile?125:220;
    const wood=new THREE.InstancedMesh(trunkGeo,bark,treeCount*3);
    const crowns=[0,1].map(variant=>new THREE.InstancedMesh(canopyCards(variant),leafMat,treeCount*3));
    const dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0),axis=new THREE.Vector3();
    const treeRoots=[];
    function putSegment(index,start,end,r){
      axis.subVectors(end,start);
      const length=axis.length();
      dummy.position.copy(start).add(end).multiplyScalar(.5);
      dummy.quaternion.setFromUnitVectors(up,axis.divideScalar(length));
      dummy.scale.set(r,length,r);dummy.updateMatrix();wood.setMatrixAt(index,dummy.matrix);
    }
    let woodN=0;
    const crownN=[0,0];
    function tree(x,z,h,spread,variant){
      const forest=crowns[variant];
      const y=terrainHeight(x,z)-.30;
      const root=new THREE.Vector3(x,y,z),top=new THREE.Vector3(x+(random()-.5)*1.1,y+h,z+(random()-.5)*1.3);
      treeRoots.push({x,z,r:.37+h*.018});
      putSegment(woodN++,root,top,.27+h*.036);
      const angle=random()*Math.PI*2;
      for(let branch=0;branch<2;branch++){
        const side=branch===0?1:-1;
        const joint=root.clone().lerp(top,.59+branch*.10);
        const tip=joint.clone().add(new THREE.Vector3(Math.cos(angle)*side*spread*.68,h*.23,Math.sin(angle)*side*spread*.68));
        putSegment(woodN++,joint,tip,.16+h*.015);
        dummy.position.copy(tip);dummy.position.y+=h*.10;
        dummy.rotation.set(0,angle+branch*1.9,0);
        dummy.scale.set(spread*.77,h*(variant?.34:.25),spread*.77);dummy.updateMatrix();
        forest.setMatrixAt(crownN[variant],dummy.matrix);
        forest.setColorAt(crownN[variant]++,new THREE.Color().setRGB(.72+random()*.24,.75+random()*.25,.65+random()*.26));
      }
      dummy.position.copy(top);dummy.rotation.set(0,angle+.9,0);
      dummy.scale.set(spread,h*(variant?.36:.27),spread);dummy.updateMatrix();
      forest.setMatrixAt(crownN[variant],dummy.matrix);
      forest.setColorAt(crownN[variant]++,new THREE.Color().setRGB(.91,1.,.83));
    }
    const foreground=[[-7,52,11,5],[16,49,12,5],[-11,40,12,5],[14,38,9,4],[-11,26,10,4],[14,17,13,5]];
    for(const [x,z,h,spread] of foreground)tree(x,z,h,spread,0);
    for(let attempt=0;treeRoots.length<treeCount&&attempt<treeCount*18;attempt++){
      const x=(random()-.5)*235,z=(random()-.52)*245;
      if(Math.abs(x-riverX(z))<riverWidth(z)+4||Math.abs(x-trailX(z))<4||random()>forestDensity(x,z))continue;
      if(treeRoots.some(root=>(root.x-x)**2+(root.z-z)**2<19))continue;
      const variant=random()<.32?1:0;
      tree(x,z,4.4+random()*9,2.4+random()*3.9,variant);
    }
    wood.count=woodN;
    crowns.forEach((forest,i)=>{forest.count=crownN[i];});
    scene.add(wood,...crowns);

    // Broadleaf fern fans built from curved, individually tapered leaflets.
    setProgress(55,"Layering the forest understory");
    function createFernFan(){
      const v=[],idx=[];
      for(let leaf=0;leaf<8;leaf++){const angle=leaf/8*Math.PI*2,len=.85+Math.sin(leaf*5.7)*.25,start=v.length/3,steps=5;
        for(let j=0;j<=steps;j++){const t=j/steps,w=Math.sin(Math.PI*t)*.13*(1-t*.35),cx=Math.cos(angle)*len*t,cz=Math.sin(angle)*len*t,cy=.06+Math.sin(t*Math.PI*.72)*.62;
          v.push(cx-Math.sin(angle)*w,cy,cz+Math.cos(angle)*w,cx+Math.sin(angle)*w,cy,cz-Math.cos(angle)*w);
          if(j<steps){const q=start+j*2;idx.push(q,q+1,q+2,q+1,q+3,q+2);}
        }
      }
      const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();return g;
    }
    const fernGeo=createFernFan(),fernMat=new THREE.MeshStandardMaterial({color:0x527749,roughness:1,side:THREE.DoubleSide});
    const fernCount=isMobile?86:128,ferns=new THREE.InstancedMesh(fernGeo,fernMat,fernCount);
    for(let i=0;i<fernCount;i++){let z=64-random()*158;let x=trailX(z)+(random()<.5?-1:1)*(1.4+random()**2*17);if(Math.abs(x-riverX(z))<riverWidth(z)+.8)x=riverX(z)-riverWidth(z)-1;
      const y=terrainHeight(x,z),scale=.65+random()*1.25;dummy.position.set(x,y,z);dummy.rotation.set((random()-.5)*.2,random()*Math.PI*2,(random()-.5)*.2);dummy.scale.set(scale,scale,scale);dummy.updateMatrix();ferns.setMatrixAt(i,dummy.matrix);
      ferns.setColorAt(i,new THREE.Color().setHSL(.27+random()*.08,.38,.24+random()*.13));
    }
    scene.add(ferns);
    // Moss-dark boulders, placed in loose natural groups.
    const rockGeo=new THREE.DodecahedronGeometry(1,0);
    const rockMat=new THREE.MeshStandardMaterial({color:0x738071,roughness:1,flatShading:true});
    const rocks=new THREE.InstancedMesh(rockGeo,rockMat,isMobile?48:78);
    for(let i=0;i<rocks.count;i++){
      const x=(random()-.5)*200,z=(random()-.5)*205,y=terrainHeight(x,z);
      const s=.35+random()*1.45;
      dummy.position.set(x,y+s*.35,z);dummy.rotation.set(random()*2,random()*Math.PI,random()*2);dummy.scale.set(s*1.25,s*.7,s);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);
      rocks.setColorAt(i,new THREE.Color().setHSL(.32,.08,.28+random()*.13));
    }
    scene.add(rocks);

    setProgress(68,"Drawing the mountain stream");
    const waterGeo=new THREE.BufferGeometry(),waterVerts=[],waterUvs=[],waterIndices=[];
    const divisions=145;
    for(let i=0;i<=divisions;i++){
      const t=i/divisions,z=132+(fallZ-132)*t;
      for(let side=0;side<2;side++){
        waterVerts.push(riverX(z)+(side===0?-1:1)*riverWidth(z),riverLevel(z),z);
        waterUvs.push(side,t);
      }
      if(i<divisions){const a=i*2;waterIndices.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
    waterGeo.setAttribute("position",new THREE.Float32BufferAttribute(waterVerts,3));
    waterGeo.setAttribute("uv",new THREE.Float32BufferAttribute(waterUvs,2));
    waterGeo.setIndex(waterIndices);
    const waterMat=new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,uniforms:{time,skyColor:{value:skyColor},sunDirection:{value:sunDirection}},
      vertexShader:`varying vec2 vUv;varying vec3 vWorld;
      void main(){vUv=uv;vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 vUv;varying vec3 vWorld;
      uniform float time;uniform vec3 skyColor,sunDirection;
      void main(){
        vec2 p=vWorld.xz;
        float a=p.x*1.5-p.y*3.1+time*2.4, b=p.x*4.6+p.y*.8+time*.71;
        float c=p.x*.65+p.y*1.8+sin(p.y*.2)*1.7-time*1.4;
        vec3 n=normalize(vec3(cos(a)*.055+cos(b)*.046,1.,sin(c)*.10-cos(a)*.095));
        vec3 view=normalize(cameraPosition-vWorld),reflection=reflect(-view,n);
        float fresnel=pow(1.-max(dot(view,n),0.),4.);
        float edge=abs(vUv.x-.5)*2.;
        float current=sin(a+sin(c)*1.8)*sin(b)*sin(c);
        float spark=pow(max(dot(reflection,sunDirection),0.),64.);
        vec3 deep=vec3(.024,.083,.071), shallows=vec3(.085,.125,.080);
        vec3 color=mix(deep,shallows,smoothstep(.28,.94,edge))*(1.+current*.24);
        vec3 reflected=mix(vec3(.075,.14,.12),vec3(.48,.59,.54),smoothstep(.0,.56,reflection.y+.085*sin(p.y*.24)));
        color=mix(color,reflected,fresnel*.8+.11)+vec3(.8,.62,.40)*spark*.48;
        float foam=smoothstep(.87,.995,edge)*smoothstep(.22,.89,current)*.35;
        color=mix(color,vec3(.52,.63,.53),foam);
        float distanceToEye=length(cameraPosition-vWorld);
        color=mix(color,skyColor,1.-exp(-pow(distanceToEye*.009,2.)));
        gl_FragColor=vec4(color,(.81+fresnel*.16)*(1.-smoothstep(.96,1.,edge)));
        #include <colorspace_fragment>
      }`
    });
    scene.add(new THREE.Mesh(waterGeo,waterMat));

    // A tapered sheet hugs the edge of the rock ledge and falls into the stream.
    const fallGeo=new THREE.BufferGeometry();
    const fallVertices=[],fallUV=[],fallIndices=[];
    for(let i=0;i<=20;i++){
      const v=i/20,width=1.55+v*v*1.1;
      const z=fallZ-8+8.4*v**1.65;
      const y=fallBase+13.1*(1-v);
      for(const side of [-1,1]){
        fallVertices.push(fallX+side*width+.48*v,y,z);fallUV.push((side+1)/2,v);
      }
      if(i<20){const a=i*2;fallIndices.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
    fallGeo.setAttribute("position",new THREE.Float32BufferAttribute(fallVertices,3));
    fallGeo.setAttribute("uv",new THREE.Float32BufferAttribute(fallUV,2));fallGeo.setIndex(fallIndices);
    const fallMat=new THREE.ShaderMaterial({
      side:THREE.DoubleSide,transparent:true,depthWrite:false,uniforms:{time,skyColor:{value:skyColor}},
      vertexShader:`varying vec2 v;varying vec3 world;void main(){v=uv;world=position;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 v;varying vec3 world;uniform float time;uniform vec3 skyColor;void main(){
        float streak=pow(.5+.5*sin(v.x*79.+sin(v.y*11.-time)*1.3),4.);
        float flow=.5+.5*sin(v.x*28.+v.y*43.-time*5.+sin(v.x*93.)*.8);
        float plume=smoothstep(.72,.99,v.y);
        float edge=smoothstep(0.,.17+streak*.09,v.x)*smoothstep(0.,.22,1.-v.x);
        vec3 color=mix(vec3(.16,.27,.24),vec3(.77,.85,.81),.4*flow+.53*streak+plume*.43);
        color=mix(color,skyColor,1.-exp(-pow(length(cameraPosition-world)*.007,2.)));
        gl_FragColor=vec4(color,edge*(.47+streak*.46+plume*.06));
        #include <colorspace_fragment>
      }`
    });
    scene.add(new THREE.Mesh(fallGeo,fallMat));
    function haze(x,y,z,width,height,opacity){
      const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{time,opacity:{value:opacity},skyColor:{value:skyColor}},
        vertexShader:`varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader:`varying vec2 v;uniform float time,opacity;uniform vec3 skyColor;
          void main(){vec2 p=(v-.5)*2.;float edge=pow(max(1.-dot(p,p),0.),2.);
          float drift=.7+.16*sin(p.x*8.+p.y*4.+time*.35)+.14*sin(p.x*17.-time*.55);
          gl_FragColor=vec4(skyColor,edge*drift*opacity);
          #include <colorspace_fragment>
        }`});
      const mist=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);
      mist.position.set(x,y,z);scene.add(mist);
    }
    haze(fallX+.5,fallBase+.82,fallZ+1.5,13,4.3,.61);
    haze(-11,8,-76,113,13,.29);
    haze(17,20,-126,171,19,.36);
    haze(-28,37,-175,259,32,.40);

    // Three distant swallows share a single draw. They circle above the ravine.
    const birdGeometry=new THREE.BufferGeometry();
    const birdVertices=[],birdIds=[],birdTriangles=[];
    for(let bird=0;bird<3;bird++){
      birdVertices.push(-.61,0,.14, -.28,0,-.12, 0,0,-.07, .28,0,-.12, .61,0,.14, 0,0,.24);
      birdIds.push(bird,bird,bird,bird,bird,bird);
      const v=bird*6;
      birdTriangles.push(v,v+1,v+2,v,v+2,v+5,v+2,v+3,v+4,v+2,v+4,v+5);
    }
    birdGeometry.setAttribute("position",new THREE.Float32BufferAttribute(birdVertices,3));
    birdGeometry.setAttribute("bird",new THREE.Float32BufferAttribute(birdIds,1));
    birdGeometry.setIndex(birdTriangles);
    const birds=new THREE.Mesh(birdGeometry,new THREE.ShaderMaterial({
      side:THREE.DoubleSide,uniforms:{time,skyColor:{value:skyColor}},
      vertexShader:`uniform float time;attribute float bird;varying float distanceToEye;void main(){
        float orbit=time*.14+bird*.11;
        vec3 center=vec3(-13.+cos(orbit)*32.,25.+sin(orbit*2.)*2.+bird*.8,-85.+sin(orbit)*25.-bird*1.8);
        vec3 forward=normalize(vec3(-sin(orbit)*32.,0.,cos(orbit)*25.));
        vec3 side=vec3(forward.z,0.,-forward.x);
        vec3 world=center+position.x*side-position.z*forward;
        world.y+=abs(position.x)*sin(time*7.4+bird*1.72)*.58;
        distanceToEye=length(world-cameraPosition);
        gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);
      }`,
      fragmentShader:`uniform vec3 skyColor;varying float distanceToEye;void main(){
        gl_FragColor=vec4(mix(vec3(.055,.079,.069),skyColor,1.-exp(-pow(distanceToEye*.0068,2.))),1.);
        #include <colorspace_fragment>
      }`
    }));
    birds.frustumCulled=false;scene.add(birds);

    setProgress(92,"Waking the landscape");
    const viewpoints=[
      [trailX(52),52, .10,-.075],
      [trailX(-24),-24, .26,-.01],
      [trailX(-74),-74, .32,.16]
    ];
    function viewpoint(index){
      const [x,z,heading,tilt]=viewpoints[index];
      camera.position.set(x,terrainHeight(x,z)+1.72,z);
      yaw=heading;pitch=tilt;
    }
    viewpoint(0);


    function showToast(message){toast.textContent=message;toast.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove("show"),2100);}
    let streamGain, birdTimer;
    function scheduleBird(){
      clearTimeout(birdTimer);
      birdTimer=setTimeout(()=>{
        if(!soundOn)return;
        const now=audioContext.currentTime;
        const bird=audioContext.createOscillator(), envelope=audioContext.createGain();
        bird.frequency.setValueAtTime(1820+Math.random()*780,now);
        bird.frequency.exponentialRampToValueAtTime(1280,now+.22);
        envelope.gain.setValueAtTime(.0001,now);
        envelope.gain.exponentialRampToValueAtTime(.025,now+.04);
        envelope.gain.exponentialRampToValueAtTime(.0001,now+.25);
        bird.connect(envelope);envelope.connect(masterGain);
        bird.onended=()=>{bird.disconnect();envelope.disconnect();};
        bird.start();bird.stop(now+.27);
        scheduleBird();
      },3000+Math.random()*8500);
    }
    function beginAudio(){
      if(!audioContext){
        const Audio=window.AudioContext||window.webkitAudioContext;
        if(!Audio)throw new Error("Audio unavailable");
        audioContext=new Audio();
        masterGain=audioContext.createGain();masterGain.gain.value=0;
        masterGain.connect(audioContext.destination);
        const buffer=audioContext.createBuffer(1,audioContext.sampleRate*2,audioContext.sampleRate);
        const samples=buffer.getChannelData(0);
        for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*.30;
        const noise=audioContext.createBufferSource();noise.buffer=buffer;noise.loop=true;
        const wind=audioContext.createBiquadFilter();wind.type="lowpass";wind.frequency.value=320;
        const stream=audioContext.createBiquadFilter();stream.type="bandpass";stream.frequency.value=810;stream.Q.value=.53;
        streamGain=audioContext.createGain();streamGain.gain.value=.23;
        noise.connect(wind);wind.connect(masterGain);noise.connect(stream);stream.connect(streamGain);streamGain.connect(masterGain);
        noise.start();
      }
      audioContext.resume().catch(()=>showToast("Ambient audio is unavailable"));
      masterGain.gain.setTargetAtTime(.27,audioContext.currentTime,.14);
      scheduleBird();
    }
    const soundButton=document.getElementById("soundButton");
    function toggleSound(){
      soundOn=!soundOn;
      if(soundOn){
        try{beginAudio();}catch{soundOn=false;showToast("Ambient audio is unavailable");return;}
      }else{
        clearTimeout(birdTimer);
        masterGain.gain.setTargetAtTime(0,audioContext.currentTime,.15);
      }
      soundButton.setAttribute("aria-pressed",String(soundOn));
      showToast(soundOn?"Ambient sound on":"Ambient sound off");
    }
    soundButton.addEventListener("click",toggleSound);
    const helpButton=document.getElementById("helpButton");
    function setHelp(open){
      helpPanel.classList.toggle("open",open);
      helpButton.setAttribute("aria-expanded",String(open));
    }
    helpButton.addEventListener("click",()=>setHelp(!helpPanel.classList.contains("open")));
    if(isMobile){
      const labels=helpPanel.querySelectorAll(".key");
      labels[0].textContent="Joystick";labels[1].textContent="Drag right side";
      labels[2].parentElement.hidden=true;labels[3].parentElement.hidden=true;
      labels[4].textContent="Sound button";
    }
    function clearInput(){
      for(const key in keys)keys[key]=false;
      stickPointer=lookPointer=null;
      touchMove.x=touchMove.y=0;touchKnob.style.transform="";
    }
    function menu(){
      started=false;clearInput();
      intro.classList.remove("hidden");hud.classList.remove("visible");
      touchUI.classList.remove("active");
      setHelp(false);
      document.getElementById("enterButton").focus();
    }
    function dragFallback(){
      if(started&&!pointerLocked)showToast("Drag the landscape to look around");
    }
    document.getElementById("enterButton").addEventListener("click",()=>{
      started=true;intro.classList.add("hidden");hud.classList.add("visible");controlsUI.classList.add("visible");
      helpButton.focus({preventScroll:true});
      if(isMobile)touchUI.classList.add("active");
      else if(renderer.domElement.requestPointerLock){
        try{renderer.domElement.requestPointerLock()?.catch(dragFallback);}catch{dragFallback();}
      }else dragFallback();
    });
    document.addEventListener("pointerlockerror",dragFallback);
    document.addEventListener("pointerlockchange",()=>{
      const wasLocked=pointerLocked;
      pointerLocked=document.pointerLockElement===renderer.domElement;
      if(wasLocked&&!pointerLocked&&!graphicsLost)menu();
    });
    renderer.domElement.addEventListener("pointerdown",event=>{
      if(!started||pointerLocked||isMobile||event.button!==0)return;
      renderer.domElement.setPointerCapture(event.pointerId);
    });
    renderer.domElement.addEventListener("pointermove",event=>{
      if(!started||pointerLocked||!renderer.domElement.hasPointerCapture(event.pointerId))return;
      yaw-=event.movementX*.004;
      pitch=clamp(pitch-event.movementY*.003,-1.22,1.1);
    });
    addEventListener("blur",clearInput);
    touchStick.addEventListener("pointerdown",e=>{if(!started)return;stickPointer=e.pointerId;touchStick.setPointerCapture(e.pointerId);updateStick(e);e.preventDefault();});
    function updateStick(e){const r=touchStick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=r.width*.34,len=Math.hypot(dx,dy)||1,k=Math.min(1,max/len);touchMove.x=dx/max*k;touchMove.y=dy/max*k;touchKnob.style.transform="translate("+dx*k+"px,"+dy*k+"px)";}
    touchStick.addEventListener("pointermove",e=>{if(e.pointerId===stickPointer)updateStick(e);});
    function releaseStick(e){if(e.pointerId!==stickPointer)return;stickPointer=null;touchMove.x=touchMove.y=0;touchKnob.style.transform="translate(0,0)";}
    touchStick.addEventListener("pointerup",releaseStick);touchStick.addEventListener("pointercancel",releaseStick);
    touchLook.addEventListener("pointerdown",e=>{if(!started)return;lookPointer=e.pointerId;lastLookX=e.clientX;lastLookY=e.clientY;touchLook.setPointerCapture(e.pointerId);e.preventDefault();});
    touchLook.addEventListener("pointermove",e=>{if(e.pointerId!==lookPointer)return;const dx=e.clientX-lastLookX,dy=e.clientY-lastLookY;lastLookX=e.clientX;lastLookY=e.clientY;yaw-=dx*.004;pitch=clamp(pitch-dy*.003,-1.2,1.05);});
    function releaseLook(e){if(e.pointerId===lookPointer)lookPointer=null;}
    touchLook.addEventListener("pointerup",releaseLook);touchLook.addEventListener("pointercancel",releaseLook);
    document.addEventListener("mousemove",e=>{if(!pointerLocked)return;yaw-=e.movementX*.0022;pitch-=e.movementY*.0018;pitch=clamp(pitch,-1.25,1.15);});
    touchStick.addEventListener("lostpointercapture",releaseStick);
    touchLook.addEventListener("lostpointercapture",releaseLook);
    const motionKeys=["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowLeft","ArrowDown","ArrowRight","ShiftLeft","ShiftRight"];
    const debug=query.has("debug"), metrics=document.getElementById("metrics");
    metrics.hidden=!debug;
    document.addEventListener("keydown",e=>{
      if(e.target instanceof HTMLSelectElement)return;
      if(started&&motionKeys.includes(e.code)){keys[e.code]=true;e.preventDefault();}
      if(e.repeat)return;
      if(e.code==="KeyM")toggleSound();
      if(e.code==="Escape"&&started&&!pointerLocked)menu();
      if(e.code==="KeyH"&&debug)metrics.hidden=!metrics.hidden;
      if(debug&&["Digit1","Digit2","Digit3"].includes(e.code))viewpoint(Number(e.code.at(-1))-1);
      if(debug&&e.code==="KeyB")startBenchmark();
    });
    document.addEventListener("keyup",e=>{if(motionKeys.includes(e.code))keys[e.code]=false;});

    function moveToward(x,z){
      x=clamp(x,-108,108);z=clamp(z,-107,115);
      for(const root of treeRoots){
        const dx=x-root.x,dz=z-root.z;
        if(dx*dx+dz*dz<root.r*root.r)return;
      }
      if(terrainHeight(x,z)-terrainHeight(camera.position.x,camera.position.z)>.86)return;
      camera.position.x=x;camera.position.z=z;
    }
    let elapsed=0,lastFrame=0,windowTime=0,windowFrames=0,stableWindows=0,fps=0,benchmark=null,report=null;
    let startupMs=0,slowWindows=0;
    const benchmarkPath=new THREE.CatmullRomCurve3(viewpoints.map(([x,z])=>new THREE.Vector3(x,0,z)));
    const benchmarkPoint=new THREE.Vector3();
    function startBenchmark(){
      if(benchmark)return;
      report=null;
      benchmark={start:performance.now(),frames:[],draws:0,triangles:0};
      metrics.hidden=false;
    }
    function state(){
      const {render,memory}=renderer.info;
      return {fps,drawCalls:render.calls,triangles:render.triangles,geometries:memory.geometries,
        textures:memory.textures,estimatedAtlasBytes:Math.ceil(512*256*4*4/3),
        instances:wood.count+crowns[0].count+crowns[1].count+ferns.count+rocks.count,
        width:renderer.domElement.width,height:renderer.domElement.height,profile:["Low","Medium","High"][profile],startupMs,
        position:camera.position.toArray(),yaw,pitch,soundOn};
    }
    if(debug)window.monsoonDebug={state,viewpoint,startBenchmark,result:()=>report};
    const compilerErrors=[];
    renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{
      const message=[gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment)].filter(Boolean).join("\n");
      compilerErrors.push(message||"Shader compilation failed");console.error(message);
    };
    function render(){
      camera.rotation.set(pitch,yaw,0,"YXZ");
      sky.position.copy(camera.position);
      renderer.render(scene,camera);
      if(compilerErrors.length){
        graphicsLost=true;
        loader.classList.remove("done");
        document.exitPointerLock?.();
        fail("This graphics driver could not draw the valley. Reload or try another browser.");
      }
    }
    function animate(now){
      if(graphicsLost)return;
      const frame=lastFrame?now-lastFrame:0;
      lastFrame=now;
      const dt=Math.min(frame/1000,.055);
      elapsed+=dt;
      time.value=motion.matches?0:elapsed;
      sun.intensity=2.05+Math.sin(time.value*.07)*.27;
      if(benchmark){
        const progress=clamp((now-benchmark.start)/20000,0,1);
        benchmarkPath.getPoint(progress,benchmarkPoint);
        camera.position.set(benchmarkPoint.x,terrainHeight(benchmarkPoint.x,benchmarkPoint.z)+1.72,benchmarkPoint.z);
        yaw=.17+.21*progress;pitch=-.085+.22*progress;
      }else if(started){
        const longitudinal=Number(!!(keys.KeyW||keys.ArrowUp))-Number(!!(keys.KeyS||keys.ArrowDown))-touchMove.y;
        const lateral=Number(!!(keys.KeyD||keys.ArrowRight))-Number(!!(keys.KeyA||keys.ArrowLeft))+touchMove.x;
        const step=(keys.ShiftLeft||keys.ShiftRight?6.8:3.8)*dt/Math.max(1,Math.hypot(longitudinal,lateral));
        const x=camera.position.x+(-Math.sin(yaw)*longitudinal+Math.cos(yaw)*lateral)*step;
        const z=camera.position.z+(-Math.cos(yaw)*longitudinal-Math.sin(yaw)*lateral)*step;
        if(longitudinal||lateral)moveToward(x,z);
        const floor=Math.max(terrainHeight(camera.position.x,camera.position.z),riverLevel(camera.position.z)-.5);
        camera.position.y=lerp(camera.position.y,floor+1.72,Math.min(1,dt*9));
      }
      if(soundOn&&streamGain){
        const distance=Math.abs(camera.position.x-riverX(camera.position.z));
        streamGain.gain.value=.10+.48*Math.exp(-distance*.1);
      }
      render();
      if(benchmark&&frame>0){
        benchmark.frames.push(frame);
        benchmark.draws=Math.max(benchmark.draws,renderer.info.render.calls);
        benchmark.triangles=Math.max(benchmark.triangles,renderer.info.render.triangles);
        if(now-benchmark.start>=20000){
          const frames=benchmark.frames.sort((a,b)=>a-b);
          report={...state(),fps:+(1000*frames.length/frames.reduce((sum,n)=>sum+n,0)).toFixed(1),
            p95Ms:+frames[Math.floor((frames.length-1)*.95)].toFixed(1),peakDrawCalls:benchmark.draws,peakTriangles:benchmark.triangles};
          console.info("MONSOON benchmark",report);benchmark=null;
        }
      }
      if(frame>0){
        windowTime+=frame;windowFrames++;
        if(windowTime>=2200){
          fps=1000*windowFrames/windowTime;
          windowTime=windowFrames=0;
          if(quality==="auto"&&!benchmark){
            slowWindows=fps<30?slowWindows+1:0;
            stableWindows=fps>56?stableWindows+1:0;
            const next=slowWindows>=2?Math.max(0,profile-1):stableWindows>=8?Math.min(isMobile?1:2,profile+1):profile;
            if(next!==profile){profile=next;slowWindows=stableWindows=0;resize();}
          }
          if(debug&&!metrics.hidden){
            const s=state();
            metrics.textContent=`${s.profile} · ${s.width} × ${s.height}
${fps.toFixed(1)} fps · ${(1000/fps).toFixed(1)} ms mean
${s.drawCalls} draws · ${s.triangles.toLocaleString()} triangles
${s.geometries} geometries · ${s.instances} instances
${s.textures} textures · ~${Math.round(s.estimatedAtlasBytes/1024)} KiB atlas
${Math.round(startupMs)} ms to first rendered frame
1–3 Views · B Benchmark · H Hide`;
            if(benchmark)metrics.textContent+="\nBenchmark running…";
            if(report)metrics.textContent+=`\nBenchmark ${report.fps} fps · p95 ${report.p95Ms} ms`;
          }
        }
      }
      requestAnimationFrame(animate);
    }
    document.addEventListener("visibilitychange",()=>{
      lastFrame=windowTime=windowFrames=0;
      if(document.hidden){clearInput();benchmark=null;}
    });
    render();
    if(graphicsLost)return;
    startupMs=performance.now();
    setProgress(100,"The valley is ready");
    document.getElementById("enterButton").disabled=false;
    loader.classList.add("done");
    requestAnimationFrame(animate);
}
