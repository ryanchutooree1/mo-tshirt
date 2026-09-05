# Homepage: saved website with selected additions

The homepage now uses the user-provided **MO T-SHIRT | Custom T-Shirt Printing Mauritius** website as its base.

## Source

- Saved HTML: `/Users/ryanchutooree/Downloads/MO T-SHIRT _ Custom T-Shirt Printing Mauritius.html`
- Saved CSS and hero: the adjacent `MO T-SHIRT _ Custom T-Shirt Printing Mauritius_files` folder.
- Local hero asset: `public/editorial/hero-founder.png`, copied without image editing.

The saved announcement, navigation, “MAKE IT HAPPEN” hero, ticker, standard, four service rows, statement and footer are retained. Styles were copied from the saved website’s custom CSS and scoped to this homepage. Saved framework scripts are not included.

## Selected additions

Only the three sections selected in the user’s screenshots were brought across from the earlier redesign:

1. **Order in 4 steps** with `public/editorial/buying-flow-v2.png` and short step descriptions, replacing the saved website’s original process.
2. The **Printed for** client strip.
3. The **Made for Le Rochester** section using existing customer-work photography.

These sections remain responsive native page content, with functional links and accessible text. The prior product hero, collection, FAQ and contact layout are no longer displayed.

The ordering flow sits directly below the “ONE SHIRT OR 1,000 / SAME STANDARD / ZERO GUESSWORK” strip, followed immediately by the Printed for client strip. The size guides sit directly below the client strip, followed by the full-width design-and-quote workspace. The Le Rochester section remains after the services.

## Size guides

“Find your fit” presents the existing adult and kids measurement images in two white cards on a cool grey surface. A single T-Shirt / Polo Shirt selector changes both charts. Each card opens a native modal dialog with an enlarged original image, an orange 100–300% zoom slider with a live percentage and a scrollable viewport. The slider supports dragging, touch and native keyboard controls in 1% increments. At 100%, the complete chart fits both the available width and height; it refits on window resizing, with the header and zoom controls always visible. Escape, the close button or the backdrop dismisses it and returns focus to the card. On phones, the cards stack. Measurements are reused unchanged from the four existing WebP assets.

The hero includes the user-provided claim “Trusted by 80+ businesses” beneath its main actions. A small orange people icon and bold count keep the message compact; the link jumps to the existing client strip at `#printed-for`.

## Interactions

The mobile menu uses a native disclosure with close-on-selection and Escape behavior. Section links stay on localhost.

Below the size guides, clients choose **Design studio OR Quote form** using two clear tabs. Each tool uses the full workspace width. The studio restores its roomy sidebar, garment canvas and editing panel; at tablet widths its step navigation uses small boxes. The quote form has a spacious centered layout, grouped fields, a collapsible printing guide and normal page scrolling. Both tools remain mounted after first use, so switching preserves design changes, uploaded artwork and form entries during the visit. The draggable divider has been removed.

The tabs support Left/Right arrows and Home/End. The `#order` link selects the studio, and `#quote-form` selects the quote form, including on initial navigation. Switching tabs updates the URL without moving the workspace. Hidden panels are excluded from focus and the accessibility tree.

The studio supports live product selection, front/back previews, artwork and custom text. Desktop and tablet navigation separates Choose colour (step 2) from Sizes & quantities (step 3), for nine steps in total. Colours use a single scrolling panel. The quantities step shows the selected garment, a Change colour shortcut, available size fields and a live total. The rush-production option and its 12% surcharge have been removed from desktop and phone ordering. Phone controls already separate garment selection from sizes. Preview text scales against the same 550px reference as the exported mockup. The quote form supports multiple garments, artwork files and delivery details through the existing `POST /api/contact` endpoint. The former compact form is replaced to keep a single quote destination. On phones, the studio retains its existing touch controls. Quote labels are associated with controls, and active studio controls expose their state to assistive technology. Styling is scoped to the homepage. The shared studio also uses the separate colour and quantity steps when opened directly. Contact submission, authentication and shop data retain their existing behavior.

## Order workspace palette

The homepage studio and quote form use crisp white surfaces, cool light-grey canvas areas and charcoal text. The storefront's `#ff3b22` orange-red marks active controls, focus rings, progress and the quote submit button. Garment cards use a dark header with a fine accent rule; beige field and panel fills are removed. These colour changes stay within the homepage order workspace.

## Parcel tracking

A white photo-and-form section sits after the closing statement and above the footer. It reuses `Postman.webp` and `Postofficelogo.webp`, with dark typography and an orange-red tracking button. On phones, the photo and form stack.

The accessible native GET form sends `tracking_code` to [Mauritius Post’s official Track & Trace page](https://www.mauritiuspost.mu/track-trace/) in a new tab with `noopener noreferrer`. The field requires a nonblank tracking number; it does not submit a quote or store customer data. The external destination and query parameter were checked against the official website. No customer tracking number was submitted during verification.

## Footer

The dark footer retains the old homepage’s essential quote, work, Terms, Privacy, Instagram, TikTok and WhatsApp links. It adds the existing phone/email contact details, Surinam location, design studio and parcel tracking shortcuts. The links use the current section IDs. Contact information and WhatsApp URLs reuse the shared business constants.

The copyright row stays visible on phones. “All Rights Reserved” is a discreet, keyboard-accessible `/login` link with prefetch disabled, leading to the existing login route on whichever host serves the page. No authentication behavior is changed. The year follows the current year at render time.

## Local review

Run `npm run dev -- --hostname 127.0.0.1 --port 3000` from this checkout and open **http://localhost:3000/**. Use localhost for the existing same-origin checks.

The page is checked at desktop and phone widths, including the selected sections and mobile navigation. No live quotation or customer message is submitted during visual checks.
