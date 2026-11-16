# Third-party assets and licenses

All scene art assets listed here are released under **CC0 1.0 Universal**. CC0 permits redistribution in this public repository and does not require attribution; the source links are retained as courtesy credit and provenance. The browser loads the bundled copies from `assets/` rather than requesting them from third-party servers.

## Forest floor — ambientCG Ground024

Source: [Ground024](https://ambientcg.com/view?id=Ground024) from [ambientCG](https://ambientcg.com/), distributed under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Bundled at 1K JPG resolution:

- `assets/ground/Ground024_1K-JPG_Color.jpg`
- `assets/ground/Ground024_1K-JPG_NormalGL.jpg`
- `assets/ground/Ground024_1K-JPG_Roughness.jpg`

## Tree bark — ambientCG Bark004

Source: [Bark004](https://ambientcg.com/view?id=Bark004) from [ambientCG](https://ambientcg.com/), distributed under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Bundled at 1K JPG resolution:

- `assets/bark/Bark004_1K-JPG_Color.jpg`
- `assets/bark/Bark004_1K-JPG_NormalGL.jpg`
- `assets/bark/Bark004_1K-JPG_Roughness.jpg`

## Broadleaf canopy — ambientCG LeafSet017

Source: [LeafSet017](https://ambientcg.com/view?id=LeafSet017) from [ambientCG](https://ambientcg.com/), distributed under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Bundled at 1K JPG resolution; these maps are used together for the instanced leaf-card crowns:

- `assets/leaves/LeafSet017_1K-JPG_Color.jpg`
- `assets/leaves/LeafSet017_1K-JPG_Opacity.jpg`
- `assets/leaves/LeafSet017_1K-JPG_NormalGL.jpg`

## Understory fern — Poly Haven Fern 02

Source: [Fern 02](https://polyhaven.com/a/fern_02) from [Poly Haven](https://polyhaven.com/), distributed under [CC0](https://polyhaven.com/license). Bundled as the 1K glTF model with its required local dependencies:

- `assets/fern/fern_02_1k.gltf`
- `assets/fern/fern_02.bin`
- `assets/fern/textures/fern_02_diff_1k.jpg`
- `assets/fern/textures/fern_02_nor_gl_1k.jpg`
- `assets/fern/textures/fern_02_arm_1k.jpg`

## Mossy cliff stone — ambientCG Rock011

Source: [Rock011](https://ambientcg.com/view?id=Rock011) from [ambientCG](https://ambientcg.com/), distributed under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Bundled at 1K JPG resolution. The color and roughness maps are projected in world space onto steep terrain; all three maps are also used on ridge meshes. Files are loaded locally:

- `assets/cliff/Rock011_1K-JPG_Color.jpg`
- `assets/cliff/Rock011_1K-JPG_NormalGL.jpg`
- `assets/cliff/Rock011_1K-JPG_Roughness.jpg`

## Loader code

`vendor/examples/jsm/loaders/GLTFLoader.js` and `vendor/examples/jsm/utils/BufferGeometryUtils.js` are from the official Three.js r180 release and are covered by the MIT notice in [`vendor/LICENSE`](vendor/LICENSE).
