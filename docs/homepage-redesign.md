# Homepage design review

The homepage uses the supplied black service-list screenshot as its principal layout reference: oversized bold typography, fine dividers, numbered rows and generous space. The lifestyle references inform the architectural composition and a palette of ink black, warm ivory, cool grey and midnight navy.

The changes are limited to the homepage, its two small interactive components and its new image. The existing admin, shop, design studio, quotation backend and authentication remain unchanged.

## Local review

Run `npm run dev -- --hostname 127.0.0.1 --port 3000` from this checkout and open **http://localhost:3000/**. Use the localhost hostname for the application's existing same-origin checks.

The homepage links to the existing shop and design studio. The full quotation form loads when its disclosure is opened, and its state stays available when closed and reopened. Customer messages and quotation submissions were not sent during visual testing.

## Image provenance

Saved project asset: `public/editorial/navy-studio.png`.
Generated using the built-in image generation tool. The image is a styled apparel concept; the Le Rochester section retains existing actual project photography. The supplied lifestyle photos were used to understand the direction and are not published on the page.

Prompt:

> Use case: product-mockup. Asset type: portrait editorial hero photograph for a minimalist Mauritius custom T-shirt business homepage. Create a photorealistic, architecturally composed apparel still life inspired by a very minimal contemporary office and quiet luxury navy tailoring. In the centre a beautiful plain midnight navy cotton T-shirt with structured short sleeves on a polished steel hanger suspended from a straight thin chrome garment rail. To the lower right a precisely folded navy polo shirt and an ivory T-shirt on a matte white rectangular monolithic plinth. Restrained white and cool light grey plaster walls, pale grey stone floor, soft natural side light from a huge frosted window just outside the frame, a subtle warm ambient light accent at far left. Geometric modern luxury showroom. No wood, no plants, no tropical motifs, no rounded arches, no tan or green palette. Very tactile cotton fabric, deep inky blue, chalk white, cool grey, black shadows. Spare composition, the hanging navy T-shirt dominates the frame, entire shirt and hanger visible. Camera frontal eye level, 4:5 portrait image, fine fashion editorial photography. No people, no text, no typography, no logos, no watermark. Tasteful, precise, confident and minimal.
