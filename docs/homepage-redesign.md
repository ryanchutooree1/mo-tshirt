# Homepage: saved website with selected additions

The homepage now uses the user-provided **MO T-SHIRT | Custom T-Shirt Printing Mauritius** website as its base.

## Source

- Saved HTML: `/Users/ryanchutooree/Downloads/MO T-SHIRT _ Custom T-Shirt Printing Mauritius.html`
- Saved CSS and hero: the adjacent `MO T-SHIRT _ Custom T-Shirt Printing Mauritius_files` folder.
- Local hero asset: `public/editorial/hero-founder.png`, copied without image editing.

The saved announcement, navigation, “MAKE IT HAPPEN” hero, ticker, standard, four service rows, statement, order layout and footer are retained. Styles were copied from the saved website’s custom CSS and scoped to this homepage. Saved framework scripts are not included.

## Selected additions

Only the three sections selected in the user’s screenshots were brought across from the earlier redesign:

1. **Order in 4 steps** with `public/editorial/buying-flow-v2.png` and short step descriptions, replacing the saved website’s original process.
2. The **Printed for** client strip.
3. The **Made for Le Rochester** section using existing customer-work photography.

These sections remain responsive native page content, with functional links and accessible text. The prior product hero, collection, FAQ and contact layout are no longer displayed.

The ordering flow sits directly below the “ONE SHIRT OR 1,000 / SAME STANDARD / ZERO GUESSWORK” strip, followed immediately by the Printed for client strip. The Le Rochester section remains after the services.

## Interactions

The mobile menu uses a native disclosure with close-on-selection and Escape behavior. Section links stay on localhost. The saved compact quote form is connected to the existing `POST /api/contact` endpoint, with required fields, pending/error/success feedback and retained input after failures. The contact backend, admin, authentication, shop and design studio are unchanged.

## Local review

Run `npm run dev -- --hostname 127.0.0.1 --port 3000` from this checkout and open **http://localhost:3000/**. Use localhost for the existing same-origin checks.

The page is checked at desktop and phone widths, including the selected sections and mobile navigation. No live quotation or customer message is submitted during visual checks.
