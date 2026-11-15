# MONSOON — The Living Western Ghats

A quiet 3D valley inspired by Kerala’s Western Ghats just after rain. Follow the footpath downstream or walk up the valley to the waterfall. The landscape, foliage, water and ambient sound are generated in the browser.

## Run locally

Start a static server from the project directory and open [http://localhost:8000](http://localhost:8000).

```sh
python3 -m http.server 8000
```

The scene needs a browser with WebGL 2. Three.js r180 is included in `vendor/`, so the project needs no build step, backend, or third-party asset requests. The vendored library’s MIT license is in `vendor/LICENSE`.

## Upload to GitHub Pages

1. Extract the ZIP and place its contents at the root of the repository, with `index.html` beside `landscape.js`. Include the hidden `.github` folder if you are uploading to a new repository.
2. Commit the files to `main`.
3. Under **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source. The included workflow deploys on pushes to `main`. You can also run it manually from the **Actions** tab.

The intended site is [melvinvarghese.github.io/monsoon](https://melvinvarghese.github.io/monsoon/).

## Explore

| Action | Desktop | Touchscreen |
| --- | --- | --- |
| Walk | WASD or arrow keys | Left joystick |
| Look | Mouse after entering, or drag if pointer lock is unavailable | Drag the right side |
| Walk faster | Shift | — |
| Return to entrance menu | Escape | Escape with a keyboard |
| Toggle sound | M or sound button | Sound button |
| Change graphics | Controls panel after releasing the pointer | Controls panel |

Auto quality adjusts the pixel ratio to frame rate. Low, Medium and High select fixed resolution budgets. Coarse-pointer devices start with fewer foliage instances and smaller ridge meshes. Reduced-motion settings freeze environmental animation while preserving camera controls.

## Rendering and verification

The scene uses a shared 512 × 256 cutout foliage atlas and instanced canopy cards and trunks. Rock and trail detail are part of the terrain material. Cloud movement, mist, wind, water and birds run in shaders. The waterfall follows a rock ledge into the stream. Audio combines synthesized wind, running water and occasional bird calls.

The table records Three.js render submissions at the starting camera, using a simulated WebGL interface. The baseline is commit `ddb6536`. These counts include shadow submissions on the original desktop scene. They measure scene workload, with pixel cost and physical GPU memory still to be measured.

| Scene mode | Original draw calls | New draw calls | Original submitted triangles | New submitted triangles |
| --- | ---: | ---: | ---: | ---: |
| Desktop | 29 | 17 | 820,092 | 85,790 |
| Mobile settings | 28 | 17 | 396,696 | 65,600 |

All 11 generated shader programs compiled and linked with Mesa OpenGL ES 3 for both scene settings. Simulated input exercised keyboard movement, joystick movement, touch look and graphics preset selection. Full browser rendering, visual review, physical-device FPS and thermals, and the live Pages deployment remain to be verified.

To take live measurements, add `?debug` to the URL. Press **1–3** to switch viewpoints, **B** to run the 20-second route, and **H** to hide or show the overlay. The benchmark prints mean FPS, 95th-percentile frame time, peak draw calls and triangles to the browser console. Select a fixed graphics preset to compare runs at the same resolution. The atlas memory figure is an estimate including mipmaps.

Visual and technical reference: [Abyssal Garden](https://github.com/Noniv/abyssal-garden).
