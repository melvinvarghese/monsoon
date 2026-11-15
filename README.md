# MONSOON — The Living Western Ghats

An immersive, interactive landscape inspired by Kerala after the monsoon. MONSOON is a quiet place to wander: a fictional valley shaped by the ecology and atmosphere of the Western Ghats.

## Try it

Enable GitHub Pages for this repository (Settings → Pages → Deploy from a branch → main → /(root)), then visit:

https://melvinvarghese.github.io/monsoon/

The experience is a static site. It does not require a server, account, backend, or build step. Three.js is loaded as an ES module from jsDelivr, so an internet connection is required.

## Current build

**Batch 1 — Foundation**
- Higher-resolution folded valley terrain and layered, sculpted Western Ghats ridge meshes
- Instanced broadleaf rainforest canopy with branching trunks, curved fern fans and mossy rocks
- Wind-swaying canopy shader and atmospheric sky gradient
- A winding mountain stream with animated water
- Drifting cloud banks and low valley mist
- First-person keyboard movement and mouse-look
- On-screen mobile joystick and touch-look controls
- Minimal introduction screen and controls panel
- Lightweight synthesized ambient sound toggle
- Adaptive scene density for smaller screens

## Controls

| Action | Control |
|---|---|
| Move | W A S D / arrow keys |
| Look | Mouse (after entering) |
| Move faster | Shift |
| Release pointer | Esc |
| Toggle ambient sound | M |

On desktop, click **Enter the landscape** to capture the pointer. Press Escape to release it. On phones, use the on-screen joystick to walk and drag the right side of the screen to look around.

## Development

The project is a static site with a real-time Three.js scene and procedural geometry. Open `index.html` through a local static server while developing; ES modules are not reliably loaded from `file://` URLs.

## Roadmap

1. Foundation and first valley
2. Landscape detail and connected forest paths
3. Waterfalls, richer water and atmospheric lighting
4. Living vegetation and wildlife
5. Dynamic weather and day/night cycle
6. Additional connected locations
7. Spatial environmental audio
8. Further mobile optimisation and polish

## Credits and technology

- [Three.js](https://threejs.org/) for real-time 3D rendering.
- No third-party 3D models or landscape photographs are used in the scene.
- The landscape is procedurally generated in the browser.

## License

MIT
