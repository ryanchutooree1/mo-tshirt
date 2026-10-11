**Source visual truth**

- `/Users/ryanchutooree/mo-t-shirt/.codex/download-icons-source.png`
- Source pixels: 1248 × 1452. The requested state is the selected-job gallery showing two finished-product images and one print-artwork image.

**Implementation evidence**

- `/Users/ryanchutooree/mo-t-shirt/.codex/download-icons-implementation.png`
- Browser viewport and screenshot: 1280 × 720 CSS pixels at device scale factor 1.
- State: isolated rendering of the production `JobVisuals` component with front, back, and original-artwork examples.
- Primary interaction tested: the front-image download control completed a real browser download through `/api/shops/download` and produced `front_mockup.png`.
- Console check: no errors. Two pre-existing Next.js image warnings came from global page assets, not the gallery or download controls.

**Full-view comparison evidence**

- The source and implementation were opened together for comparison. Existing two-column finished-product layout, four-column artwork grid, typography, labels, image treatment, and spacing remain unchanged because the implementation only adds an overlay control.
- Each full-size image now has a clearly visible circular download icon at its top-right corner. The icon does not cover the subject in the supplied reference composition.

**Focused region comparison evidence**

- Finished product: both front and back images have identical 36 px controls with consistent 10 px inset.
- Print artwork: the smaller thumbnail uses a proportional 32 px control with 7 px inset.
- Compact client-list thumbnails intentionally omit links so a download link is not nested inside the job-opening button.

**Required fidelity surfaces**

- Fonts and typography: unchanged from the source component.
- Spacing and layout rhythm: unchanged; the controls are absolutely positioned and do not reflow figures or captions.
- Colors and visual tokens: white translucent controls, neutral border, dark icon, and existing orange focus ring remain legible on light, dark, and transparent artwork.
- Image quality and asset fidelity: original image URLs are preserved; the download endpoint returns the original file rather than a screenshot or recompressed copy.
- Copy and content: existing headings and captions are unchanged; download controls have specific accessible labels.

**Findings**

- No actionable P0, P1, or P2 mismatch found.

**Comparison history**

- Pass 1: no actionable visual mismatch. Functional test confirmed one control for every full-size gallery image; browser test confirmed the download completes.

**Follow-up polish**

- None required for this request.

final result: passed
