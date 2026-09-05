# Shop side images

Generated with the built-in image generation tool on 4 September 2026 from each product's existing photo, then saved through the shop's authenticated Firebase upload route.

The collection contains 56 new side views: 12 polo shirts, 21 T-shirts, 12 baseball caps, 4 cotton caps, 4 trucker caps, and 3 mugs. The two existing long-sleeve shirt side views were retained.

- `generated/`: final PNG images, named by product and colour.
- `generations.json`: the prompt used for every image and its original generation path.
- `targets.json`: product IDs and colour mapping.
- `upload-receipts.json`: Firebase upload IDs and product image URLs.
- `verification.json`: full-image and thumbnail validation results.
- `shop-side-preview.png`: browser check showing the selected third thumbnail.

Shirts use a left-facing side profile, invisible mannequin, and white background. Caps preserve their fabric, mesh, brim, and trim. The magic mugs show their solid-colour cold state, matching the unheated mug in the original reference.

The shop reads `sidePhotoUrl` from Firebase. Uploads use the existing `shopUploads` document/chunk format and include the usual optimized image and thumbnail. Gallery controls and download links use the new images without application code changes. Caps and mugs previously had only a front image, so their galleries now contain Front and Side.

To resume an interrupted upload from the repository root, run `node output/shop-side-images/upload.mjs`. It authenticates using the existing local environment, reuses receipts, and skips completed products. Run `node output/shop-side-images/verify.mjs` to repeat verification; the original local `catalog-before.json` backup is required for the unchanged-field comparison. Source downloads and full catalog backups are retained locally and excluded from this artifact's commit.
