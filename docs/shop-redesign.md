# Shop redesign

The `/shop` page uses the homepage's black, white, cool gray and coral palette. Plain products and ready-made uniforms have separate collection views. Responsive product cards retain live catalog data, image views/downloads, size selection, quantities, studio links and WhatsApp ordering. Homepage desktop and mobile navigation now include Shop.

Product size buttons replace the duplicate size dropdown; their tooltips include prices. Hidden order controls are inert. Delivery fields have accessible names.

Verified locally: 58 plain products load; filtering to Magic Mug returns two cards; adding quantity 2 produces Rs 600 subtotal and Rs 700 with Rs 100 postage; removal works. Collection switching and 390px mobile layout checked. Targeted ESLint passes. Project typecheck remains blocked by existing HomeWorkCarousel Swiper setTransition/updateActiveIndex type errors.

No commits or deployment performed.

On a subsequent reload the upstream catalog request exceeded 15 seconds. The shop shell and uniform view now remain available while plain products load, instead of blocking the whole page behind a spinner. Live catalog availability still depends on the existing Firebase service.

Release verification (2026-09-05): production build and targeted ESLint pass after replacing unsupported carousel method calls with the public Swiper API. Pricing tests: 4 pass; the vinyl price-book test fails identically on the backed-up old main (420 vs 270).

Pricing test correction (2026-09-05): the stale Rs 270 expectation predates the intentional July 2026 price-book update (commit 96aa2c06). Updated it to Rs 420 and explicitly checked material, labour, zero overhead and quote total. All five pricing tests now pass; production pricing is unchanged.
