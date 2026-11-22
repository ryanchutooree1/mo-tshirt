**Source visual truth**

- `/var/folders/_h/ppw6mc6n4cl22q1r6wy90bd80000gn/T/TemporaryItems/NSIRD_screencaptureui_hijMOW/Screenshot 2026-11-22 at 16.46.34.png`
- Source pixels: 2206 × 582. The requested surface is the compact quotation/order list where Tanvi needs to see final-mockup readiness without opening every job.

**Implementation evidence**

- Live page: `https://www.mo-tshirt.mu/admin/quotation-approval?verify=64e8df4`
- Production deployment: `dpl_Bs6WRNenHwK4RqpuB7Pp6SLg6F3E`, commit `64e8df47cac2eb1f2eb67e9527cf7cb6ab544af5`, state `READY`.
- Live Chrome verification used Tanvi's signed-in production workspace, not localhost.
- The active-job table displayed a compact `Mockup needed` pill under Product for 30 visible loaded rows.
- Opening the first live job displayed the `Final mockup` upload bar immediately below `Finished product`, with Front and Back selectors and an enabled `Upload final mockup` action.
- Front was initially selected; switching to Back updated the selected state correctly.
- Console check: no errors.

**Full-view comparison evidence**

- The existing seven-column table, customer/product hierarchy, totals, status, Open action, and delete action remain in the same order and density as the supplied reference.
- Mockup readiness is added inside the existing Product cell rather than as a new column, so the list stays compact and scannable.
- The amber `Mockup needed` state is visually secondary to the product name. The green `Mockup uploaded` state is reserved for a final mockup explicitly uploaded from the admin order workspace.

**Focused region comparison evidence**

- List: the small status pill sits directly below each product summary and is visible without opening the job.
- Open job: the upload bar is grouped with Finished product, making the next action obvious without introducing another page or modal.
- Front and Back use a two-option segmented control; the upload action remains a single orange button.
- Completed, declined, delivered, released, sending, and unconfirmed jobs cannot be modified through this flow.

**Required fidelity surfaces**

- Typography and spacing use the existing Tanvi workspace tokens and compact scale.
- Warm orange remains the primary action; green is used only for confirmed admin-uploaded mockups; amber communicates the missing state.
- The flow accepts PNG, JPG, or WEBP images up to 4 MB and preserves the other garment side when one side is replaced.
- No production file was uploaded during QA because no specific live order/file was authorized. Upload behavior, late-response protection, replacement semantics, permissions, and closed-job safeguards are covered by automated tests.

**Verification**

- `npm run test:print-jobs`: passed, including the new mockup backend and component suites.
- Focused mockup/visual suites: 27 passed, 0 failed.
- ESLint: passed.
- Production build: passed.
- Final code review: no actionable findings.

**Findings**

- No actionable P0, P1, or P2 mismatch found.

final result: passed
