export async function start(fail) {
    const THREE = await import("./vendor/three.module.min.js");
    const {GLTFLoader}=await import("./vendor/examples/jsm/loaders/GLTFLoader.js");
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
    const skyColor = new THREE.Color(0x9cb8ae);
    const sunDirection = new THREE.Vector3(-.58,.25,-.77).normalize();
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
        vec3 color=mix(vec3(.21,.34,.34),vec3(.075,.19,.23),smoothstep(0.,.82,h));
        vec2 p=d.xz/(.24+h)*2.7+vec2(time*.026,-.4);
        float cover=noise(p)*.63+noise(p*2.2)*.25+noise(p*5.1)*.12;
        color=mix(color,mix(vec3(.22,.33,.33),vec3(.64,.67,.60),cover),smoothstep(.27,.73,cover)*smoothstep(.01,.2,h));
        float opening=pow(facing,5.)*(1.-cover*.72);
        color+=vec3(.20,.12,.045)*opening+vec3(.7,.54,.32)*smoothstep(.996,.9995,facing)*(1.-cover*.8);
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`
    }));
    sky.scale.setScalar(460);sky.frustumCulled=false;sky.renderOrder=-10;scene.add(sky);
    scene.fog = new THREE.FogExp2(skyColor, .0105);
    const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, .18, 620);
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
    renderer.toneMappingExposure = 1.16;
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
    function leafClusterLayout(random){
      return Array.from({length:6},()=>Array.from({length:60},()=>({
        source:Math.floor(random()*6),x:.17+random()*.66,y:.17+random()*.66,
        rotation:random()*Math.PI*2,scale:.20+random()*.07
      })));
    }
    function smoothNoise(x,z){
      const ix=Math.floor(x), iz=Math.floor(z), fx=x-ix, fz=z-iz;
      const h=(a,b)=>{let n=Math.sin(a*127.1+b*311.7+19.19)*43758.5453;return n-Math.floor(n);};
      const u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);
      return lerp(lerp(h(ix,iz),h(ix+1,iz),u),lerp(h(ix,iz+1),h(ix+1,iz+1),u),v)*2-1;
    }
    function fbm(x,z){let n=0,a=.55,f=.045;for(let i=0;i<4;i++){n+=smoothNoise(x*f,z*f)*a;a*=.5;f*=2.03;}return n;}
    function riverX(z){return Math.sin(z*.018)*10+Math.sin(z*.043+1.2)*3.2+Math.sin(z*.089-.4)*.8;}
    const fallZ=-95,fallDrop=8.4,fallTopZ=fallZ-3.3,fallPoolZ=fallZ+1.2;
    // Broad forest pockets frame the valley instead of distributing trees uniformly.
    function forestDensity(x,z){
      const pockets=.54+.20*Math.sin(x*.031+z*.018)*Math.cos(z*.026-x*.014)+.14*Math.sin(x*.012-z*.017);
      const riverOpening=clamp((Math.abs(x-riverX(z))-4)/8,0,1);
      const pathX=trailX(z);
      const pathOpening=clamp((Math.abs(x-pathX)-2.5)/8,0,1);
      return clamp(pockets*riverOpening*pathOpening,.08,.9);
    }
    function riverLevel(z){const base=.5+(77-z)*.032,drop=1-THREE.MathUtils.smoothstep(z,fallTopZ,fallPoolZ);return base+fallDrop*drop;}
    function riverWidth(z){const core=1.08+2.55*Math.exp(-((z+86)**2)/75),fan=4.7*Math.exp(-((z-(fallZ-2.3))**2)/16),plunge=4.2*Math.exp(-((z-(fallZ+.6))**2)/14);const ripple=.18*Math.sin(z*.36+.8*Math.sin(z*.11))+.12*Math.sin(z*.72+2.1)+.10*smoothNoise(17,z*.42);return Math.max(.82,core+fan+plunge+ripple);}
    const fallX=riverX(fallZ), fallBase=riverLevel(fallPoolZ);
    function trailX(z){return riverX(z)+riverWidth(z)+3.3+.9*Math.sin(z*.07);}
    function terrainHeight(x,z){
      const distance=Math.abs(x-riverX(z));
      const bank=riverWidth(z);
      const detailWarp=smoothNoise(x*.16+14,z*.16-27)*6;
      const terrainNoise=fbm(x+140+detailWarp,z-70-detailWarp*.72);
      const bankJitter=.58*Math.sin(z*.22+Math.sin(x*.13+z*.045)*1.3)+smoothNoise(x*.34+14,z*.34-19)*.65;
      const wideSlope=1-Math.exp(-((distance/38)**2));
      const ribs=.64+.36*terrainNoise;
      const valley=wideSlope*(25+28*ribs)*Math.min(1,distance/95);
      const rockWeathering=1+.34*smoothNoise(x*.17+27,z*.17-41)+.12*smoothNoise(x*.32-13,z*.29+18);
      const rawRockFace=Math.exp(-(((x-fallX)/18)**4))*12*rockWeathering*
        THREE.MathUtils.smoothstep(-z,93.5,96.5)*(1-THREE.MathUtils.smoothstep(-z,130,144));
      const gorgeCut=Math.exp(-Math.pow((x-riverX(z))/(riverWidth(z)+5.2),6))*(1-THREE.MathUtils.smoothstep(z,fallZ+1,fallZ+4));
      const rockFace=rawRockFace*(1-gorgeCut);
      const shoreline=THREE.MathUtils.smoothstep(distance,bank-1.35+bankJitter,bank+1.4+bankJitter);
      const cutbank=Math.exp(-((distance-bank-3.2-bankJitter)**2)/14)*(.55*Math.sin(z*.24+x*.07)+.4*smoothNoise(x*.28+41,z*.28-10));
      const fineNoise=fbm(x*1.4+18+detailWarp*.35,z*1.4-27-detailWarp*.24);
      return riverLevel(z)+lerp(-1.15,.73,shoreline)+valley+terrainNoise*6*Math.min(1,distance/13)+
        fineNoise*2.2*Math.min(1,distance/4)+cutbank+rockFace;
    }
    function setProgress(n,label){loaderFill.style.width=n+"%";if(label)loaderLabel.textContent=label;}

    setProgress(5,"Loading local forest materials");
    const textureLoader=new THREE.TextureLoader();
    async function loadTexture(path,isColor=false){
      const texture=await textureLoader.loadAsync(path);
      texture.colorSpace=isColor?THREE.SRGBColorSpace:THREE.NoColorSpace;
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
      texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
      return texture;
    }
    const [groundAlbedo,groundNormal,groundRoughness,barkAlbedo,barkNormal,barkRoughness,leafAlbedo,leafOpacity,leafNormal,rockAlbedo,rockNormal,rockRoughness]=await Promise.all([
      loadTexture("./assets/ground/Ground024_1K-JPG_Color.jpg",true),
      loadTexture("./assets/ground/Ground024_1K-JPG_NormalGL.jpg"),
      loadTexture("./assets/ground/Ground024_1K-JPG_Roughness.jpg"),
      loadTexture("./assets/bark/Bark004_1K-JPG_Color.jpg",true),
      loadTexture("./assets/bark/Bark004_1K-JPG_NormalGL.jpg"),
      loadTexture("./assets/bark/Bark004_1K-JPG_Roughness.jpg"),
      loadTexture("./assets/leaves/LeafSet017_1K-JPG_Color.jpg",true),
      loadTexture("./assets/leaves/LeafSet017_1K-JPG_Opacity.jpg"),
      loadTexture("./assets/leaves/LeafSet017_1K-JPG_NormalGL.jpg"),
      loadTexture("./assets/cliff/Rock011_1K-JPG_Color.jpg",true),
      loadTexture("./assets/cliff/Rock011_1K-JPG_NormalGL.jpg"),
      loadTexture("./assets/cliff/Rock011_1K-JPG_Roughness.jpg")
    ]);
    for(const texture of [groundAlbedo,groundNormal,groundRoughness])texture.repeat.set(82,82);
    for(const texture of [barkAlbedo,barkNormal,barkRoughness])texture.repeat.set(1,4);
    for(const texture of [leafAlbedo,leafOpacity,leafNormal])texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
    function makeLeafAtlases(colorSource,opacitySource,normalSource){
      const atlasWidth=1024,atlasHeight=1024,cellWidth=512,cellHeight=atlasHeight/3,spriteHeight=Math.ceil(cellHeight);
      const colorCanvas=document.createElement("canvas"),alphaCanvas=document.createElement("canvas"),normalCanvas=document.createElement("canvas");
      for(const canvas of [colorCanvas,alphaCanvas,normalCanvas]){canvas.width=atlasWidth;canvas.height=atlasHeight;}
      const colorContext=colorCanvas.getContext("2d"),alphaContext=alphaCanvas.getContext("2d"),normalContext=normalCanvas.getContext("2d");
      alphaContext.fillStyle="#000";alphaContext.fillRect(0,0,atlasWidth,atlasHeight);
      normalContext.fillStyle="rgb(128,128,255)";normalContext.fillRect(0,0,atlasWidth,atlasHeight);
      const spriteColor=document.createElement("canvas"),spriteOpacity=document.createElement("canvas"),spriteMask=document.createElement("canvas"),spriteNormal=document.createElement("canvas");
      for(const canvas of [spriteColor,spriteOpacity,spriteMask,spriteNormal]){canvas.width=cellWidth;canvas.height=spriteHeight;}
      const colorSpriteContext=spriteColor.getContext("2d"),opacitySpriteContext=spriteOpacity.getContext("2d"),maskSpriteContext=spriteMask.getContext("2d"),normalSpriteContext=spriteNormal.getContext("2d");
      const sourceSprites=[];
      for(let source=0;source<6;source++){
        const sx=(source%2)*cellWidth,sy=Math.floor(source/2)*cellHeight;
        for(const context of [colorSpriteContext,opacitySpriteContext,normalSpriteContext])context.clearRect(0,0,cellWidth,spriteHeight);
        colorSpriteContext.drawImage(colorSource.image,sx,sy,cellWidth,cellHeight,0,0,cellWidth,spriteHeight);
        opacitySpriteContext.drawImage(opacitySource.image,sx,sy,cellWidth,cellHeight,0,0,cellWidth,spriteHeight);
        normalSpriteContext.drawImage(normalSource.image,sx,sy,cellWidth,cellHeight,0,0,cellWidth,spriteHeight);
        const sourceAlpha=opacitySpriteContext.getImageData(0,0,cellWidth,spriteHeight).data,maskData=maskSpriteContext.createImageData(cellWidth,spriteHeight);
        for(let i=0;i<sourceAlpha.length;i+=4){maskData.data[i]=255;maskData.data[i+1]=255;maskData.data[i+2]=255;maskData.data[i+3]=sourceAlpha[i+1];}
        maskSpriteContext.putImageData(maskData,0,0);
        colorSpriteContext.globalCompositeOperation="destination-in";colorSpriteContext.drawImage(spriteMask,0,0);colorSpriteContext.globalCompositeOperation="source-over";
        sourceSprites.push({color:spriteColor.cloneNode(),mask:spriteMask.cloneNode(),normal:spriteNormal.cloneNode()});
        sourceSprites[source].color.getContext("2d").drawImage(spriteColor,0,0);
        sourceSprites[source].mask.getContext("2d").drawImage(spriteMask,0,0);
        sourceSprites[source].normal.getContext("2d").drawImage(spriteNormal,0,0);
      }
      const drawLeaf=(context,image,x,y,width,height,rotation)=>{context.save();context.translate(x,y);context.rotate(rotation);context.drawImage(image,-width/2,-height/2,width,height);context.restore();};
      const layout=leafClusterLayout(seeded(61247));
      for(let patch=0;patch<layout.length;patch++){
        const ox=(patch%2)*cellWidth,oy=Math.floor(patch/2)*cellHeight;
        for(const leaf of layout[patch]){
          const x=ox+leaf.x*cellWidth,y=oy+leaf.y*cellHeight,w=cellWidth*leaf.scale,h=cellHeight*leaf.scale,sprite=sourceSprites[leaf.source];
          for(const context of [colorContext,alphaContext,normalContext]){context.save();context.beginPath();context.rect(ox,oy,cellWidth,cellHeight);context.clip();}
          drawLeaf(colorContext,sprite.color,x,y,w,h,leaf.rotation);drawLeaf(alphaContext,sprite.mask,x,y,w,h,leaf.rotation);drawLeaf(normalContext,sprite.normal,x,y,w,h,leaf.rotation);
          for(const context of [colorContext,alphaContext,normalContext])context.restore();
        }
      }
      const canvasTexture=(canvas,colorSpace)=>{const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=colorSpace;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return texture;};
      return {color:canvasTexture(colorCanvas,THREE.SRGBColorSpace),alpha:canvasTexture(alphaCanvas,THREE.NoColorSpace),normal:canvasTexture(normalCanvas,THREE.NoColorSpace)};
    }
    const leafAtlases=makeLeafAtlases(leafAlbedo,leafOpacity,leafNormal);

    const hemi = new THREE.HemisphereLight(0xd6ede0,0x263e27,2.1);scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe1c0,2.55);sun.position.copy(sunDirection).multiplyScalar(100);scene.add(sun);

    // Sculpt the broad valley from a deterministic height field.
    setProgress(12,"Sculpting the valley");
    const terrainSize=300, terrainSegments=isMobile?104:160;
    const terrainGeo=new THREE.PlaneGeometry(terrainSize,terrainSize,terrainSegments,terrainSegments);
    terrainGeo.rotateX(-Math.PI/2);
    const pos=terrainGeo.attributes.position;
    const colors=[];
    const cLow=new THREE.Color(0x3b3325),cMid=new THREE.Color(0x4b5237),cHigh=new THREE.Color(0x637052),cRock=new THREE.Color(0x484d47);
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
    const groundCanvas=document.createElement("canvas");groundCanvas.width=groundCanvas.height=512;
    const groundContext=groundCanvas.getContext("2d"),groundImage=groundContext.createImageData(512,512),groundPixels=groundImage.data,groundRandom=seeded(21907);
    for(let py=0;py<512;py++)for(let px=0;px<512;px++){
      const x=(px/511-.5)*terrainSize,z=(py/511-.5)*terrainSize;
      const broad=(smoothNoise(x*.042+23,z*.042-7)+1)*.5,micro=(smoothNoise(x*.27+3,z*.27+11)+1)*.5,grain=groundRandom();
      const moss=clamp((broad*.65+micro*.35-.55)*2.5,0,.9),shade=228+(broad-.5)*34+(micro-.5)*26+(grain-.5)*16,i=(py*512+px)*4;
      groundPixels[i]=clamp(shade+(broad-.5)*10-moss*14,0,255);
      groundPixels[i+1]=clamp(shade+(micro-.5)*9+moss*18,0,255);
      groundPixels[i+2]=clamp(shade-(broad-.5)*8-moss*8,0,255);groundPixels[i+3]=255;
    }
    groundContext.putImageData(groundImage,0,0);
    const groundTexture=new THREE.CanvasTexture(groundCanvas);groundTexture.colorSpace=THREE.SRGBColorSpace;
    groundTexture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    const terrainMat=new THREE.MeshStandardMaterial({map:groundAlbedo,normalMap:groundNormal,normalScale:new THREE.Vector2(.48,.48),
      roughnessMap:groundRoughness,bumpMap:groundTexture,bumpScale:.10,vertexColors:true,roughness:1});
    terrainMat.onBeforeCompile=(shader)=>{
      shader.uniforms.rockColorMap={value:rockAlbedo};
      shader.uniforms.rockRoughnessMap={value:rockRoughness};
      shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nvarying vec3 vTerrainWorld;");
      shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nvTerrainWorld=(modelMatrix*vec4(transformed,1.0)).xyz;");
      shader.fragmentShader=shader.fragmentShader.replace("#include <common>",`#include <common>
        varying vec3 vTerrainWorld;
        uniform sampler2D rockColorMap;
        uniform sampler2D rockRoughnessMap;
        float grain(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float mottling(vec2 p){vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(grain(i),grain(i+vec2(1,0)),f.x),mix(grain(i+vec2(0,1)),grain(i+1.),f.x),f.y);}
      `);
      shader.fragmentShader=shader.fragmentShader.replace("#include <color_fragment>",`#include <color_fragment>
        vec2 p=vTerrainWorld.xz;
        float mottle=mottling(p*.10+vec2(41.))*.45+mottling(p*.42)*.35+mottling(p*1.6)*.20;
        float fine=mottling(p*5.+vec2(9.));
        float moss=mottling(p*.045+vec2(11.))*.55+mottling(p*.36+vec2(31.))*.45;
        float center=sin(p.y*.018)*10.+sin(p.y*.043+1.2)*3.2+sin(p.y*.089-.4)*.8;
        float width=max(.82,1.08+2.55*exp(-((p.y+86.)*(p.y+86.))/75.)+.18*sin(p.y*.36+.8*sin(p.y*.11))+.12*sin(p.y*.72+2.1)+.10*(mottling(vec2(17.,p.y*.42))*2.-1.));
        float trail=abs(p.x-(center+width+3.3+.9*sin(p.y*.07)));
        float bank=abs(p.x-center);
        float wetEdge=1.-smoothstep(width+1.4,width+11.,bank);
        vec3 terrainNormal=normalize(cross(dFdx(vTerrainWorld),dFdy(vTerrainWorld)));
        vec3 triWeights=abs(terrainNormal);
        triWeights/=max(triWeights.x+triWeights.y+triWeights.z,.0001);
        vec2 rockUvX=vTerrainWorld.zy*.18,rockUvY=vTerrainWorld.xz*.18,rockUvZ=vTerrainWorld.xy*.18;
        vec3 rockColor=texture2D(rockColorMap,rockUvX).rgb*triWeights.x+
          texture2D(rockColorMap,rockUvY).rgb*triWeights.y+texture2D(rockColorMap,rockUvZ).rgb*triWeights.z;
        float slope=1.-abs(terrainNormal.y);
        diffuseColor.rgb*=mix(.56,1.34,mottle)*(.72+mottling(p*.075+vec2(17.))*.52);
        vec3 stone=mix(vec3(.062,.078,.068),vec3(.19,.205,.17),mottle);
        diffuseColor.rgb=mix(diffuseColor.rgb,stone,smoothstep(.15,.68,slope));
        float cliffMask=smoothstep(.18,.55,slope)*smoothstep(3.,9.,vTerrainWorld.y);
        diffuseColor.rgb=mix(diffuseColor.rgb,rockColor,cliffMask*.88);
        float strata=smoothstep(.74,.93,fine);
        diffuseColor.rgb*=1.-strata*smoothstep(.25,.75,slope)*.12;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.087,.062,.032)*(.7+mottle*.65),
          (1.-smoothstep(.53,1.25,trail+fine*.30))*smoothstep(-102.,-89.,p.y));
        diffuseColor.rgb*=.83+fine*.34;
        vec3 damp=diffuseColor.rgb*vec3(.75,.89,.80)+vec3(.009,.02,.012)*moss;
        diffuseColor.rgb=mix(diffuseColor.rgb,damp,wetEdge*.40);
        float soilBand=1.-smoothstep(width+.8,width+5.5,bank);
        vec3 wetSoil=vec3(.11,.075,.038)*(.68+mottle*.58);
        diffuseColor.rgb=mix(diffuseColor.rgb,wetSoil,soilBand*.42);
        float mossPatch=smoothstep(.43,.68,moss)*(1.-smoothstep(.32,.78,slope));
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.48,1.12,.58),mossPatch*.62);
        diffuseColor.rgb*=mix(.76,1.,smoothstep(width-1.,width+1.,bank));
      `);
      shader.fragmentShader=shader.fragmentShader.replace("#include <roughnessmap_fragment>",`#include <roughnessmap_fragment>
        vec3 roughNormal=normalize(cross(dFdx(vTerrainWorld),dFdy(vTerrainWorld)));
        vec3 roughWeights=abs(roughNormal);
        roughWeights/=max(roughWeights.x+roughWeights.y+roughWeights.z,.0001);
        vec2 roughUvX=vTerrainWorld.zy*.18,roughUvY=vTerrainWorld.xz*.18,roughUvZ=vTerrainWorld.xy*.18;
        float cliffRoughness=texture2D(rockRoughnessMap,roughUvX).r*roughWeights.x+
          texture2D(rockRoughnessMap,roughUvY).r*roughWeights.y+texture2D(rockRoughnessMap,roughUvZ).r*roughWeights.z;
        float cliffSlope=1.-abs(roughNormal.y);
        float cliffRoughnessMask=smoothstep(.18,.55,cliffSlope)*smoothstep(3.,9.,vTerrainWorld.y);
        roughnessFactor=mix(roughnessFactor,cliffRoughness,cliffRoughnessMask*.78);
        roughnessFactor=max(roughnessFactor, 0.82);
      `);
    };
    const terrain=new THREE.Mesh(terrainGeo,terrainMat);
    terrain.name="Ground024 forest floor";
    scene.add(terrain);

    // Props must use the rendered triangles, not an unsampled height-field peak.
    function surfaceHeight(x,z){
      const cells=terrainSegments,step=terrainSize/cells;
      const gx=clamp((x+terrainSize*.5)/step,0,cells-.00001),gz=clamp((z+terrainSize*.5)/step,0,cells-.00001);
      const ix=Math.floor(gx),iz=Math.floor(gz),fx=gx-ix,fz=gz-iz,a=iz*(cells+1)+ix,c=a+cells+1;
      const ha=pos.getY(a),hb=pos.getY(a+1),hc=pos.getY(c),hd=pos.getY(c+1);
      return fx+fz<=1?ha+fx*(hb-ha)+fz*(hc-ha):hd+(1-fx)*(hc-hd)+(1-fz)*(hb-hd);
    }


    // Sculpted mountain walls: overlapping ridge silhouettes with natural variation.
    setProgress(25,"Raising the Western Ghats");
    const ridgeMaterial=new THREE.MeshStandardMaterial({map:rockAlbedo,normalMap:rockNormal,roughnessMap:rockRoughness,
      normalScale:new THREE.Vector2(1,1),vertexColors:true,roughness:1,side:THREE.DoubleSide});
    ridgeMaterial.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace("#include <roughnessmap_fragment>",`#include <roughnessmap_fragment>
        roughnessFactor=max(roughnessFactor, 0.84);
      `);
    };
    const ridgeUvScale=new THREE.Vector2(18,5);
    function buildRange(zBase,width,depth,height,seed,tint,layer){
      const r=seeded(seed),nx=isMobile?112:176,nz=layer===0?30:24,vertices=[],uvs=[],indices=[],colors=[],peaks=[];
      const peakCount=[7,9,12][layer];
      for(let p=0;p<peakCount;p++)peaks.push({x:(r()-.5)*width*.94,left:24+r()*38,right:30+r()*52,h:height*(.20+r()*.36)});
      for(let iz=0;iz<=nz;iz++){const v=iz/nz,z=(v-.5)*depth;for(let ix=0;ix<=nx;ix++){
        const x=(ix/nx-.5)*width,warpedX=x+Math.sin(z*.026+seed)*width*.018;
        const floor=height*(.24+.07*Math.sin(x*.014+seed)+.05*Math.cos(x*.031-seed));let ridge=floor;
        for(const p of peaks){const side=warpedX<p.x?p.left:p.right,q=Math.abs((warpedX-p.x)/side),crest=Math.exp(-Math.pow(q,1.72)),shoulder=.2*Math.exp(-Math.pow(q*.34,2));
          const fracture=.96+.04*Math.sin((x+p.x)*.11+z*.06+seed)*Math.cos(x*.041-z*.052);ridge=Math.max(ridge,floor+p.h*(crest+shoulder)*fracture);}
        const gapX=Math.sin(z*.031+seed)*width*.11+width*.06,gully=Math.exp(-Math.pow((x-gapX)/(width*.058),2))*[.18,.4,.22][layer];
        ridge*=(1-gully)*(1-.48*Math.exp(-(((x-fallX)/42)**2)));
        const edge=Math.pow(Math.sin(Math.PI*v),.55),fold=Math.sin(x*.073+z*.031+seed)*Math.cos(x*.029-z*.067+seed)*height*.018;
        const weathering=smoothNoise(x*.31+seed*.19,z*.36-seed*.07)*2.9+smoothNoise(x*.73-seed*.11,z*.79+seed*.09)*.85;
        const y=1.5+ridge*edge+fbm(x+seed,z+seed)*height*.095*edge+fold*edge+weathering*edge;
        uvs.push(ix/nx*ridgeUvScale.x,iz/nz*ridgeUvScale.y);
        vertices.push(x,y,z);const c=new THREE.Color(tint).multiplyScalar(clamp(.79+ridge/height*.22+fbm(x+seed,z-seed)*.04,.52,1.08));colors.push(c.r,c.g,c.b);
        if(ix<nx&&iz<nz){const q=iz*(nx+1)+ix,k=q+nx+1;indices.push(q,k,q+1,k,k+1,q+1);}
      }}
      const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));g.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
      const m=new THREE.Mesh(g,ridgeMaterial);m.position.z=zBase;scene.add(m);
    }
    buildRange(-170,388,83,56,301,0xc5d4c3,0);buildRange(-231,426,88,78,602,0xb4c5bb,1);buildRange(-297,488,95,96,903,0x9fb4ac,2);

    // Scanned LeafSet017 cutouts replace the repeated smooth crown blobs.
    // Shared geometry and instancing keep the dense forest affordable on mobile hardware.
    setProgress(40,"Growing the rainforest canopy");
    const leafMat=new THREE.MeshStandardMaterial({map:leafAtlases.color,alphaMap:leafAtlases.alpha,normalMap:leafAtlases.normal,
      normalScale:new THREE.Vector2(.42,.42),roughness:.88,alphaTest:.34,depthWrite:true,side:THREE.DoubleSide});
    leafMat.onBeforeCompile=shader=>{
      shader.uniforms.windTime=time;
      shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nuniform float windTime;");
      shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>",`#include <begin_vertex>
        vec3 root=instanceMatrix[3].xyz;
        transformed.x+=sin(root.x*.11+root.z*.09+windTime*1.32+position.y)*.042;
        transformed.z+=cos(root.z*.12+windTime*1.03+position.x*2.)*.039;
      `);
    };
    function canopyGeometry(variant,leafCount=72){
      const random=seeded(8531+variant*817);
      const leafUVs=[[.01,.49,.01,.323],[.51,.99,.01,.323],[.01,.49,.344,.657],[.51,.99,.344,.657],[.01,.49,.677,.99],[.51,.99,.677,.99]];
      const clumps=variant===0?[
        [-.34,-.38,.17,.15],[.32,-.30,-.23,.14],[-.12,.10,-.30,.15],[.33,.08,.24,.15],[-.30,.31,-.16,.14],[.06,.43,.22,.14]
      ]:[
        [-.28,-.40,-.20,.15],[.33,-.25,.15,.15],[-.18,.12,.29,.14],[.09,-.08,-.32,.15],[.30,.24,-.19,.14],[-.32,.42,.10,.14]
      ];
      const vertices=[],uv=[],indices=[];
      for(let i=0;i<leafCount;i++){
        const [cx,cy,cz,radius]=clumps[i%clumps.length];
        const angle=random()*Math.PI*2,reach=Math.pow(random(),.82)*radius;
        const centerX=cx+Math.cos(angle)*reach,centerY=cy+(random()-.5)*radius*.62,centerZ=cz+Math.sin(angle)*reach;
        const width=.08+random()*.03,height=.09+random()*.03;
        const orientation=new THREE.Euler((random()-.5)*1.8,random()*Math.PI*2,(random()-.5)*1.8);
        const rotation=new THREE.Quaternion().setFromEuler(orientation);
        const corners=[[-width/2,-height/2,0],[width/2,-height/2,0],[width/2,height/2,0],[-width/2,height/2,0]];
        const offset=vertices.length/3;
        for(const [x,y,z] of corners){
          const point=new THREE.Vector3(x,y,z).applyQuaternion(rotation);
          vertices.push(centerX+point.x,centerY+point.y,centerZ+point.z);
        }
        const [u0,u1,y0,y1]=leafUVs[Math.floor(random()*leafUVs.length)],v0=1-y1,v1=1-y0;
        uv.push(u0,v0,u1,v0,u1,v1,u0,v1);
        indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
      geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
      geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();return geometry;
    }
    function treeProfile(random){
      const layer=random();
      if(layer<.12)return [22+random()*6,8+random()*2.4];
      if(layer<.46)return [15+random()*7,6+random()*2.2];
      if(layer<.82)return [9+random()*6,4+random()*2];
      return [4.8+random()*4.2,2.3+random()*1.3];
    }
    function canopyLobeLayout(random,height,spread){
      const count=height>=16?6:4,phase=random()*Math.PI*2;
      return Array.from({length:count},(_,i)=>{
        const angle=phase+i*Math.PI*2/count+(random()-.5)*.36,radius=spread*(.14+random()*.36);
        return {x:Math.cos(angle)*radius,y:height*(.58+random()*.24),z:Math.sin(angle)*radius,
          scale:spread*(.50+random()*.10),rotation:angle+(random()-.5)*.28};
      });
    }
    const trunkGeo=new THREE.CylinderGeometry(.012,.035,1,8,2);
    const branchGeo=new THREE.CylinderGeometry(.24,.52,1,3,2);
    const buttressGeo=new THREE.CylinderGeometry(.04,.52,1,5,1);
    const bark=new THREE.MeshStandardMaterial({color:0x69775b,map:barkAlbedo,normalMap:barkNormal,normalScale:new THREE.Vector2(.48,.75),
      roughnessMap:barkRoughness,roughness:.94});
    const trunkSegments=5,branchCount=6,buttressCount=4,treeCount=isMobile?225:450,ledgeTreeTarget=isMobile?6:12,treeCapacity=treeCount+ledgeTreeTarget;
    function treeStructureGeometry(style){
      const positions=[],normals=[],uvs=[],indices=[],transform=new THREE.Object3D(),up=new THREE.Vector3(0,1,0),axis=new THREE.Vector3();
      function appendGeometry(geometry){
        const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv,base=positions.length/3;
        for(let i=0;i<p.count;i++){positions.push(p.getX(i),p.getY(i),p.getZ(i));normals.push(n.getX(i),n.getY(i),n.getZ(i));uvs.push(uv.getX(i),uv.getY(i));}
        for(const index of geometry.index.array)indices.push(base+index);
      }
      function addSegment(start,end,radius,profile=branchGeo,curved=false){
        axis.subVectors(end,start);const length=axis.length(),geometry=profile.clone(),p=geometry.attributes.position;
        const fractions=curved?Array.from({length:p.count},(_,i)=>p.getY(i)+.5):null;
        transform.position.copy(start).add(end).multiplyScalar(.5);transform.quaternion.setFromUnitVectors(up,axis.divideScalar(length));
        transform.scale.set(radius,length,radius);transform.updateMatrix();geometry.applyMatrix4(transform.matrix);
        if(curved){
          const bendDirection=new THREE.Vector3(-axis.z,0,axis.x).normalize(),bend=length*.20,positions=geometry.attributes.position;
          for(let i=0;i<positions.count;i++){const amount=Math.sin(Math.PI*fractions[i])*bend;positions.setXYZ(i,positions.getX(i)+bendDirection.x*amount,positions.getY(i),positions.getZ(i)+bendDirection.z*amount);}
          geometry.computeVertexNormals();
        }
        appendGeometry(geometry);
        geometry.dispose();
      }
      const random=seeded(21991+style*907),phase=random()*Math.PI*2,bend=.035+random()*.025,stem=[];
      for(let i=0;i<=trunkSegments;i++){
        const t=i/trunkSegments;
        stem.push(new THREE.Vector3(Math.sin(phase+t*2.4)*bend*t,t,Math.cos(phase*1.3+t*1.9)*bend*.68*t));
      }
      const trunk=trunkGeo.clone(),trunkPositions=trunk.attributes.position;
      for(let i=0;i<trunkPositions.count;i++){
        const t=trunkPositions.getY(i)+.5;
        trunkPositions.setXYZ(i,trunkPositions.getX(i)+Math.sin(phase+t*2.4)*bend*t,t,
          trunkPositions.getZ(i)+Math.cos(phase*1.3+t*1.9)*bend*.68*t);
      }
      trunk.computeVertexNormals();appendGeometry(trunk);trunk.dispose();
      for(let branch=0;branch<branchCount;branch++){
        const fraction=.48+branch/(branchCount-1)*.42+(random()-.5)*.035,position=fraction*trunkSegments,segment=Math.min(trunkSegments-1,Math.floor(position));
        const joint=stem[segment].clone().lerp(stem[segment+1],position-segment),angle=phase+branch*Math.PI*2/branchCount+style*.38+(random()-.5)*.4;
        const length=(style===0?.11:.10)+random()*.06,tip=joint.clone().add(new THREE.Vector3(Math.cos(angle)*length,.06+random()*.08,Math.sin(angle)*length));
        addSegment(joint,tip,.009,branchGeo,true);
      }
      if(style===0)for(let root=0;root<buttressCount;root++){
        const angle=phase+root*Math.PI*.5+(random()-.5)*.28,length=.12+random()*.035;
        addSegment(new THREE.Vector3(0,.10,0),new THREE.Vector3(Math.cos(angle)*length,.014,Math.sin(angle)*length),.055,buttressGeo);
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));
      geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeBoundingBox();return geometry;
    }
    const wood=[0,1].map(style=>new THREE.InstancedMesh(treeStructureGeometry(style),bark,treeCapacity));
    const crowns=[0,1].map(variant=>new THREE.InstancedMesh(canopyGeometry(variant),leafMat,treeCapacity));
    const dummy=new THREE.Object3D();
    const treeRoots=[];
    const treeShapeRandom=seeded(27343);
    const woodN=[0,0],crownN=[0,0];
    function tree(x,z,h,spread,variant,baseY=surfaceHeight(x,z)){
      const forest=crowns[variant];
      treeRoots.push({x,z,r:.37+h*.018});
      const structure=h>=15&&random()<.72?0:1;
      dummy.position.set(x,baseY-.30,z);dummy.rotation.set((random()-.5)*.045,random()*Math.PI*2,(random()-.5)*.045);
      dummy.scale.setScalar(h);dummy.updateMatrix();wood[structure].setMatrixAt(woodN[structure]++,dummy.matrix);
      const layout=canopyLobeLayout(treeShapeRandom,h,spread);let offsetX=0,offsetY=0,offsetZ=0,scale=0;
      for(const lobe of layout){offsetX+=lobe.x;offsetY+=lobe.y;offsetZ+=lobe.z;scale=Math.max(scale,lobe.scale);}
      const inverse=1/layout.length,angle=treeShapeRandom()*Math.PI*2;dummy.position.set(x+offsetX*inverse,baseY+offsetY*inverse,z+offsetZ*inverse);
      dummy.rotation.set((treeShapeRandom()-.5)*.10,angle,(treeShapeRandom()-.5)*.10);
      scale*=1.86;dummy.scale.set(scale,scale*(.89+treeShapeRandom()*.07),scale*(.94+treeShapeRandom()*.08));dummy.updateMatrix();
      forest.setMatrixAt(crownN[variant],dummy.matrix);forest.setColorAt(crownN[variant]++,new THREE.Color().setRGB(.41+random()*.17,.63+random()*.16,.28+random()*.14));
    }
    const viewAnchorX=trailX(-60),viewAnchorZ=-60,viewHeading=Math.atan2(viewAnchorX-riverX(fallZ),viewAnchorZ-fallZ);
    const framingTree=(forward,right,height,spread)=>[
      viewAnchorX-Math.sin(viewHeading)*forward+Math.cos(viewHeading)*right,
      viewAnchorZ-Math.cos(viewHeading)*forward-Math.sin(viewHeading)*right,height,spread
    ];
    const foreground=[
      framingTree(18,-18,22,9.4),framingTree(15,12,20,8.8),
      framingTree(33,-26,24,9.8),framingTree(33,26,19,8.4),
      framingTree(50,-34,21,9.2),framingTree(50,34,23,10)
    ];
    for(const [x,z,h,spread] of foreground)tree(x,z,h,spread,0);
    for(let attempt=0;treeRoots.length<treeCount&&attempt<treeCount*18;attempt++){
      const z=random()<.78?-150+random()*90:-60+random()*190,side=random()<.5?-1:1;
      const x=riverX(z)+side*(riverWidth(z)+4+Math.pow(random(),1.7)*44);
      if(Math.abs(x-riverX(z))<riverWidth(z)+4||Math.abs(x-trailX(z))<4||random()>forestDensity(x,z))continue;
      if(treeRoots.some(root=>(root.x-x)**2+(root.z-z)**2<9))continue;
      const variant=random()<.32?1:0;
      const [height,spread]=treeProfile(random);
      tree(x,z,height,spread,variant);
    }
    const ledgeTreePositions=[],ledgeRandom=seeded(81953);
    let ledgeAttempts=0;
    while(ledgeTreePositions.length<ledgeTreeTarget&&ledgeAttempts<ledgeTreeTarget*80){
      ledgeAttempts++;
      const z=fallZ-18-ledgeRandom()*6,side=ledgeTreePositions.length%2===0?-1:1;
      const x=riverX(z)+side*(riverWidth(z)+8+ledgeRandom()*4),ground=surfaceHeight(x,z);
      if(ground<5||treeRoots.some(root=>(root.x-x)**2+(root.z-z)**2<1.44))continue;
      tree(x,z,12+ledgeRandom()*5,4.2+ledgeRandom()*1.5,ledgeRandom()<.5?0:1,ground);
      ledgeTreePositions.push([x,z,ground]);
    }
    wood.forEach((mesh,i)=>{mesh.count=woodN[i];});
    crowns.forEach((forest,i)=>{forest.count=crownN[i];});
    scene.add(...wood,...crowns);

    // Real Fern 02 clumps add detailed, local photogrammetry to the wet banks.
    setProgress(55,"Growing the Fern 02 understory");
    const fernLoader=new GLTFLoader();
    const fernGltf=await fernLoader.loadAsync("./assets/fern/fern_02_1k.gltf");
    fernGltf.scene.updateMatrixWorld(true);
    const fernSources=[];
    fernGltf.scene.traverse(object=>{if(object.isMesh)fernSources.push(object);});
    if(!fernSources.length)throw new Error("Fern 02 contains no mesh data");
    const fernBounds=new THREE.Box3().setFromObject(fernGltf.scene);
    const fernSize=fernBounds.getSize(new THREE.Vector3());
    const baseFernScale=clamp(1.25/Math.max(fernSize.x,fernSize.z),.28,.66);
    const fernCount=isMobile?4:7,ferns=new THREE.Group();
    ferns.name="Fern 02 understory";
    const fernMeshes=fernSources.map((source,index)=>{
      const geometry=source.geometry.clone();geometry.applyMatrix4(source.matrixWorld);
      const mesh=new THREE.InstancedMesh(geometry,source.material,fernCount);
      mesh.name=`Fern 02 mesh ${index+1}`;mesh.castShadow=false;mesh.receiveShadow=true;
      ferns.add(mesh);return mesh;
    });
    for(let i=0;i<fernCount;i++){
      const z=-75-i*(22/Math.max(1,fernCount-1))+(random()-.5)*2,side=i%2?1:-1;
      let x=riverX(z)+side*(riverWidth(z)+1.05+random()*2.5);
      if(Math.abs(x-trailX(z))<1.6)x+=side*2.1;
      const y=surfaceHeight(x,z),scale=baseFernScale*(.84+random()*.25);
      dummy.position.set(x,y-fernBounds.min.y*scale,z);
      dummy.rotation.set((random()-.5)*.12,random()*Math.PI*2,(random()-.5)*.12);
      dummy.scale.setScalar(scale);dummy.updateMatrix();
      for(const mesh of fernMeshes)mesh.setMatrixAt(i,dummy.matrix);
    }
    for(const mesh of fernMeshes){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.computeBoundingBox();}
    const fernInstanceCount=fernCount;
    scene.add(ferns);

    const understoryVertices=[],understoryColors=[],understoryIndices=[],understoryUvs=[];
    const plantRandom=seeded(90371);
    for(let leaf=0;leaf<8;leaf++){
      const angle=leaf*Math.PI*.764,reach=.65+plantRandom()*.52,rise=.65+plantRandom()*.55;
      const base=understoryVertices.length/3;
      const u0=(leaf%2)*.5+.02,u1=u0+.46,v0=1-(Math.floor(leaf%6/2)+1)/3+.015,v1=v0+.303;
      for(let step=0;step<=6;step++){
        const t=step/6,width=Math.sin(Math.PI*t)**.65*(.12+reach*.07);
        const length=reach*t,y=rise*Math.sin(t*1.75)-t*t*.21;
        for(const side of [-1,1]){
          understoryVertices.push(Math.cos(angle)*length-Math.sin(angle)*width*side,y-width*.18,Math.sin(angle)*length+Math.cos(angle)*width*side);
          const shade=.64+.30*Math.sin(Math.PI*t);
          understoryColors.push(.40*shade,.64*shade,.28*shade);
          understoryUvs.push(side<0?u0:u1,v0+(v1-v0)*t);
        }
        if(step<6){const q=base+step*2;understoryIndices.push(q,q+1,q+2,q+1,q+3,q+2);}
      }
    }
    const understoryGeo=new THREE.BufferGeometry();
    understoryGeo.setAttribute('position',new THREE.Float32BufferAttribute(understoryVertices,3));
    understoryGeo.setAttribute('color',new THREE.Float32BufferAttribute(understoryColors,3));
    understoryGeo.setAttribute('uv',new THREE.Float32BufferAttribute(understoryUvs,2));
    understoryGeo.setIndex(understoryIndices);understoryGeo.computeVertexNormals();
    const understory=new THREE.InstancedMesh(understoryGeo,new THREE.MeshStandardMaterial({map:leafAlbedo,alphaMap:leafOpacity,normalMap:leafNormal,normalScale:new THREE.Vector2(.4,.4),alphaTest:.3,vertexColors:true,side:THREE.DoubleSide,roughness:.78}),isMobile?20:46);
    understory.name='Clustered tropical bank leaves';
    const understoryRandom=seeded(7502);
    for(let i=0;i<understory.count;i++){
      const z=-75-understoryRandom()*27,side=i%2?1:-1;
      let x=riverX(z)+side*(riverWidth(z)+.9+understoryRandom()*5.5);
      if(Math.abs(x-trailX(z))<1.2)x+=side*2;
      dummy.position.set(x,surfaceHeight(x,z)-.08,z);
      dummy.rotation.set(0,understoryRandom()*Math.PI*2,0);
      dummy.scale.setScalar(.82+understoryRandom()*.64);dummy.updateMatrix();understory.setMatrixAt(i,dummy.matrix);
    }
    scene.add(understory);

    setProgress(59,"Shaping the wet rock and stream banks");
    // The rocks are weathered by shared-vertex displacement, not added as decorative scatter.
    const rockGeo=new THREE.SphereGeometry(1,14,10);
    const rockPositions=rockGeo.attributes.position;
    const rockVertexScales=new Map();
    for(let i=0;i<rockPositions.count;i++){
      const x=rockPositions.getX(i),y=rockPositions.getY(i),z=rockPositions.getZ(i);
      const key=`${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
      const candidateScale=.68+random()*.62;
      let scale=rockVertexScales.get(key);
      if(scale===undefined){scale=candidateScale;rockVertexScales.set(key,scale);}
      rockPositions.setXYZ(i,x*scale,y*scale,z*scale);
    }
    rockGeo.computeVertexNormals();
    const rockMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9,metalness:0});
    const rocks=new THREE.InstancedMesh(rockGeo,rockMat,isMobile?38:58);
    for(let i=0;i<rocks.count;i++){
      const z=(random()-.5)*205,nearRiver=random()<.72,side=random()<.5?-1:1;
      const x=nearRiver?riverX(z)+side*(riverWidth(z)+.55+random()*4.2):trailX(z)+side*(2.2+random()*5.3);
      const y=surfaceHeight(x,z),s=.10+random()*.42;
      dummy.position.set(x,y+s*.35,z);dummy.rotation.set(random()*2,random()*Math.PI,random()*2);dummy.scale.set(s*1.25,s*.7,s);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);
      rocks.setColorAt(i,new THREE.Color().setHSL(.26,.12,.20+random()*.07));
    }
    scene.add(rocks);

    const boulderRandom=seeded(5224);
    const boulders=new THREE.InstancedMesh(rockGeo,new THREE.MeshStandardMaterial({map:rockAlbedo,normalMap:rockNormal,roughnessMap:rockRoughness,color:0x5b6954,roughness:.91}),isMobile?10:22);
    boulders.name='Weathered stream boulders';
    for(let i=0;i<boulders.count;i++){
      const z=-77-boulderRandom()*14,side=i%2?1:-1;
      const x=riverX(z)+side*(riverWidth(z)+.15+boulderRandom()*2.1),scale=.42+boulderRandom()*.8;
      dummy.position.set(x,surfaceHeight(x,z)-scale*.32,z);
      dummy.rotation.set(boulderRandom(),boulderRandom()*Math.PI*2,boulderRandom()*.5);
      dummy.scale.set(scale*(1+boulderRandom()*.6),scale*.68,scale);dummy.updateMatrix();boulders.setMatrixAt(i,dummy.matrix);
    }
    scene.add(boulders);


    setProgress(68,"Drawing the mountain stream");
    const waterGeo=new THREE.BufferGeometry(),waterVerts=[],waterUvs=[],waterIndices=[];
    const divisions=145,waterSections=[[132,fallPoolZ],[fallZ-47,fallTopZ]];
    for(const [startZ,endZ] of waterSections){
      const offset=waterVerts.length/3;
      for(let i=0;i<=divisions;i++){
        const t=i/divisions,z=lerp(startZ,endZ,t);
        for(let side=0;side<2;side++){
          waterVerts.push(riverX(z)+(side===0?-1:1)*riverWidth(z),riverLevel(z),z);
          waterUvs.push(side,t);
        }
        if(i<divisions){const a=offset+i*2;waterIndices.push(a,a+1,a+2,a+1,a+3,a+2);}
      }
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
        float warp=sin(p.x*.34+p.y*.055+time*.11)*.26+sin(p.y*.19-p.x*.23-time*.14)*.16;
        float a=p.x*2.1+p.y*.12+time*1.2+warp, b=p.x*5.8+p.y*.28-time*2.1+warp*1.9;
        float c=p.x*1.1+p.y*.11+sin(p.y*.12+warp)*.65-time*.95;
        float ripple=p.x*11.+p.y*.42+time*2.4+warp*2.4;
        vec3 n=normalize(vec3(cos(a)*.045+cos(b)*.035+cos(ripple)*.025,1.,sin(c)*.07-cos(a)*.05+sin(ripple)*.025));
        vec3 view=normalize(cameraPosition-vWorld),reflection=reflect(-view,n);
        float fresnel=pow(1.-max(dot(view,n),0.),4.);
        float edge=abs(vUv.x-.5)*2.;
        float current=sin(a+sin(c)*.5)*.45+sin(b)*.28+sin(c)*.27;
        float spark=pow(max(dot(reflection,sunDirection),0.),56.);
        vec3 deep=vec3(.012,.035,.028), shallows=vec3(.065,.125,.087);
        vec3 color=mix(deep,shallows,smoothstep(.18,.90,edge))*(1.+current*.19);
        vec3 reflected=mix(vec3(.02,.05,.037),vec3(.13,.22,.16),smoothstep(.0,.56,reflection.y+.045*sin(p.y*.12)));
        color=mix(color,reflected,fresnel*.25+.025)+vec3(.68,.75,.53)*spark*.12;
        float foam=smoothstep(.9,.999,edge)*smoothstep(.3,.95,current)*.24;
        color=mix(color,vec3(.42,.52,.46),foam);
        float distanceToEye=length(cameraPosition-vWorld);
        color=mix(color,skyColor,1.-exp(-pow(distanceToEye*.009,2.)));
        gl_FragColor=vec4(color,(.86+fresnel*.12)*(1.-smoothstep(.96,1.,edge)));
        #include <colorspace_fragment>
      }`
    });
    scene.add(new THREE.Mesh(waterGeo,waterMat));

    // Three separate tongues follow the carved gorge from its upper stream into the pool.
    const fallGeo=new THREE.BufferGeometry();
    const fallVertices=[],fallUV=[],fallIndices=[];
    const fallRows=30,fallFlowCount=3,upperWater=riverLevel(fallTopZ);
    for(let flow=0;flow<fallFlowCount;flow++){
      const offset=fallVertices.length/3,flowOffset=(flow-1)*4.0;
      for(let row=0;row<=fallRows;row++){
        const v=row/fallRows,edgeWarp=.12*Math.sin(v*17+flow*1.4)+.05*Math.sin(v*31+flow*.8);
        const halfWidth=1.70+.55*v+edgeWarp*.45;
        const bend=Math.sin(Math.PI*v),center=lerp(riverX(fallTopZ),riverX(fallPoolZ),v)+flowOffset+(.35*Math.sin(v*8+flow*1.7))*bend;
        const z=lerp(fallTopZ,fallPoolZ,v)+.14*Math.sin(v*11+flow)*bend;
        const y=lerp(upperWater,fallBase,v)+.10*Math.sin(v*12+flow*1.3)*bend;
        for(const side of [-1,1]){
          const sideWobble=.08*Math.sin(v*11+side*1.7+flow)+.035*Math.sin(v*25-side*.9);
          fallVertices.push(center+side*halfWidth+sideWobble,y,z+side*.08*Math.sin(v*9+flow));fallUV.push((side+1)/2,v);
        }
        if(row<fallRows){const a=offset+row*2;fallIndices.push(a,a+1,a+2,a+1,a+3,a+2);}
      }
    }
    fallGeo.setAttribute("position",new THREE.Float32BufferAttribute(fallVertices,3));
    fallGeo.setAttribute("uv",new THREE.Float32BufferAttribute(fallUV,2));fallGeo.setIndex(fallIndices);
    fallGeo.userData.flowCount=fallFlowCount;
    const fallMat=new THREE.ShaderMaterial({
      side:THREE.DoubleSide,transparent:true,depthWrite:false,uniforms:{time,skyColor:{value:skyColor}},
      vertexShader:`varying vec2 v;varying vec3 world;void main(){v=uv;world=position;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 v;varying vec3 world;uniform float time;uniform vec3 skyColor;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
        void main(){
        float sway=.035*sin(v.y*5.-time*.2)+.018*sin(v.y*13.2+time*.15);
        float warpA=(noise(vec2(v.y*6.8-time*.32,v.x*4.4))-.5)*.045;
        float warpB=(noise(vec2(v.x*8.+1.7,v.y*5.2-time*.48))-.5)*.025;
        float across=v.x+warpA+warpB+sway;
        float sheet=noise(vec2(across*48.+v.y*.7,v.y*3.2-time*1.8));
        float channel=noise(vec2(across*95.+sheet*.8,v.y*7.2-time*2.15));
        float detail=noise(vec2(across*180.+channel*.9,v.y*15.-time*3.));
        float rivulet=smoothstep(.32,.75,sheet*.48+channel*.38+detail*.14);
        float breakNoise=noise(vec2(across*5.5+v.y*3.1,v.y*4.8-time*1.25));
        float flowPatch=smoothstep(.46,.73,breakNoise);
        float flow=noise(vec2(across*25.+channel*1.2,v.y*11.-time*1.7));
        float plume=smoothstep(.74,.98,v.y);
        float edge=smoothstep(0.,.08+rivulet*.18,v.x)*smoothstep(0.,.10+rivulet*.15,1.-v.x);
        float highlight=clamp(.28+rivulet*.38+flow*.14+flowPatch*.18+plume*.06,0.,.94);
        vec3 color=mix(vec3(.24,.37,.33),vec3(.87,.94,.87),highlight);
        color=mix(color,skyColor,1.-exp(-pow(length(cameraPosition-world)*.007,2.)));
        gl_FragColor=vec4(color,edge*(.14+flowPatch*(.20+rivulet*.34)+plume*.10));
        #include <colorspace_fragment>
      }`
    });
    scene.add(new THREE.Mesh(fallGeo,fallMat));
    const sprayPositions=[],sprayPhases=[],spraySizes=[];
    for(let i=0;i<112;i++){
      const angle=random()*Math.PI*2,radius=Math.sqrt(random())*1.25;
      sprayPositions.push(Math.cos(angle)*radius,random()*.34,Math.sin(angle)*radius*.58);
      sprayPhases.push(random());spraySizes.push(.35+random()*.8);
    }
    const sprayGeometry=new THREE.BufferGeometry();
    sprayGeometry.setAttribute("position",new THREE.Float32BufferAttribute(sprayPositions,3));
    sprayGeometry.setAttribute("phase",new THREE.Float32BufferAttribute(sprayPhases,1));
    sprayGeometry.setAttribute("size",new THREE.Float32BufferAttribute(spraySizes,1));
    const sprayMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time},
      vertexShader:`attribute float phase,size;uniform float time;varying float opacity;
        void main(){float life=fract(time*.42+phase);vec3 p=position;p.y+=life*(1.2+size*.5);
          p.x+=sin(time*1.3+phase*26.)*life*.14;p.z+=cos(time*1.1+phase*17.)*life*.12;
          vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp(size*46./max(-mv.z,1.),1.,8.);
          opacity=smoothstep(0.,.12,life)*(1.-smoothstep(.55,1.,life));gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`varying float opacity;void main(){float r=length(gl_PointCoord-.5);float soft=1.-smoothstep(.12,.5,r);
        gl_FragColor=vec4(.72,.81,.77,soft*opacity*.22);}`});
    const spray=new THREE.Points(sprayGeometry,sprayMaterial);spray.name="Waterfall impact spray";
    spray.position.set(fallX,fallBase+.12,fallZ+1.9);spray.renderOrder=2;scene.add(spray);
    function haze(x,y,z,width,height,opacity){
      const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{time,opacity:{value:opacity},skyColor:{value:skyColor}},
        vertexShader:`varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader:`varying vec2 v;uniform float time,opacity;uniform vec3 skyColor;
          void main(){vec2 p=(v-.5)*2.;float warp=sin(p.x*5.+p.y*3.+time*.3)*.035+sin(p.x*11.-time*.4)*.018;
          float edge=pow(max(1.-dot(vec2(p.x,p.y+warp),vec2(p.x,p.y+warp)),0.),2.2);
          float drift=.7+.16*sin(p.x*8.+p.y*4.+time*.35)+.14*sin(p.x*17.-time*.55);
          gl_FragColor=vec4(skyColor,edge*drift*opacity);
          #include <colorspace_fragment>
        }`});
      const mist=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);
      mist.position.set(x,y,z);scene.add(mist);
    }
    haze(-8,5.4,-55,90,5.2,.19);
    haze(fallX+.5,fallBase+.82,fallZ+1.5,13,4.3,.61);
    haze(-11,8,-96,113,13,.23);
    haze(17,20,-126,171,19,.36);
    haze(-28,37,-175,259,32,.40);
    const lightShaft=new THREE.Mesh(new THREE.PlaneGeometry(72,50),new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{time},
      vertexShader:`varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 v;uniform float time;void main(){
        float spread=mix(.012,.082,1.-v.y),drift=sin(time*.08)*.012;
        float left=exp(-pow((v.x-(.31+(1.-v.y)*.11+drift))/spread,2.));
        float right=exp(-pow((v.x-(.67-(1.-v.y)*.08-drift))/spread,2.));
        float opening=smoothstep(.14,.42,v.y)*(1.-smoothstep(.9,1.,v.y));
        float veil=pow(max(1.-abs(v.x-.5)*2.,0.),3.)*.055;
        float shimmer=.88+.12*sin(v.y*19.+v.x*8.-time*.28);
        float alpha=(left*.19+right*.12+veil)*opening*shimmer;
        vec3 color=mix(vec3(.53,.70,.65),vec3(1.,.79,.52),smoothstep(.08,.62,left+right));
        gl_FragColor=vec4(color,alpha);
        #include <colorspace_fragment>
      }`
    }));
    lightShaft.position.set(fallX-6,22,fallZ+1);scene.add(lightShaft);

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
      [viewAnchorX,viewAnchorZ,viewHeading,.25],
      [trailX(-24),-24, .34,-.03],
      [trailX(15),15, .44,-.10]
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
        textures:memory.textures,estimatedAtlasBytes:Math.ceil(3*1024*1024*4*4/3),
        instances:wood.reduce((sum,mesh)=>sum+mesh.count,0)+crowns[0].count+crowns[1].count+fernInstanceCount+rocks.count+understory.count+boulders.count,
        understoryPlants:fernInstanceCount+understory.count,
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
      sun.intensity=2.55+Math.sin(time.value*.07)*.18;
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
