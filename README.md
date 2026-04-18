This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Shops admin

- Public catalog: `http://localhost:3000/shops`
- Admin: `http://localhost:3000/admin/shops` (protected by password)
- AI assistant lab: `http://localhost:3000/admin/ai-assistant` (admin-only testing)

## What makes this an AI assistant?

This project uses a local narrow AI stack for the MO T-SHIRT sales assistant. It does not call OpenAI, Anthropic, Gemini, or any other remote model API.

- Local intent model: messages are classified with a small local classifier using Naive Bayes plus a TF-IDF similarity fallback.
- Similarity retrieval: the assistant searches local memory with TF-IDF vectors and cosine similarity across past leads, approved summaries, accepted replies, aliases, and FAQ pairs.
- Adaptive memory: approved leads, saved knowledge, and admin feedback update alias tables, FAQ memory, and training samples.
- Feedback learning: new approved conversations and admin corrections are folded into the local learning data and can be retrained without remote inference.
- Confidence-based decisions: each turn includes intent confidence, extracted entities, missing fields, retrieval matches, and a chosen action before a template response is generated.

### Limits

- It is a narrow sales assistant, not a general chatbot.
- It uses explainable local ML plus heuristics, not deep learning.
- Retrieval and classifier quality depend on the local dataset and approved examples.
- When confidence is low or extracted fields conflict, the assistant should clarify or escalate instead of pretending certainty.

### Local AI commands

```bash
npm run ai:train
npm run ai:reindex
npm run ai:evaluate
```

### Migration steps

1. Run `npm run ai:train` to rebuild the checked-in local intent model.
2. Run `npm run ai:reindex` to refresh retrieval metadata.
3. Run `npm run ai:evaluate` to verify classifier, entity, and retrieval quality.
4. Use the admin AI Lab retrain action to rebuild Firestore-backed runtime memory from approved leads and knowledge.
5. Review [`docs/local-ai-architecture.md`](/Users/ryanchutooree/mo-t-shirt/docs/local-ai-architecture.md) for the module layout and debug flow.

### Environment

Set the admin password in `.env.local`:

```
ADMIN_PASSWORD=your-strong-password
```

To secure Firebase Storage, also create a Firebase Authentication email/password admin user that uses the same password as `ADMIN_PASSWORD`, then set:

```
NEXT_PUBLIC_FIREBASE_ADMIN_EMAIL=admin@example.com
```

Deploy the Storage rules in [`storage.rules`](/Users/ryanchutooree/mo-t-shirt/storage.rules) after that setup. See [`docs/firebase-storage-security.md`](/Users/ryanchutooree/mo-t-shirt/docs/firebase-storage-security.md) for the exact flow.

### OpenClaw Tuya Control

This repo now includes a server endpoint for OpenClaw to control Tuya devices directly:

`POST /api/openclaw/tuya`

Important:

- This does not automate the Tuya mobile app UI.
- It sends the power command straight to Tuya Cloud, which is more reliable than trying to open the Tuya app and tap buttons.
- Protect it with `OPENCLAW_TUYA_SECRET`.

Example request:

```bash
curl -X POST http://localhost:3000/api/openclaw/tuya \
  -H "Authorization: Bearer $OPENCLAW_TUYA_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"message":"turn on office light"}'
```

One-command wrapper for the `GGT Light` device:

```bash
npm run ggt:on
```

Behavior:

- First tries the `/api/openclaw/tuya` endpoint
- If that fails, it falls back to a direct click on the desktop `GGT Light` widget on this Mac

Optional environment variables:

- `OPENCLAW_BASE_URL` to target a deployed site instead of `http://localhost:3000`
- `OPENCLAW_TUYA_SECRET` or `OPENCLAW_SECRET` for authenticated requests
- `GGT_LIGHT_WIDGET_X` and `GGT_LIGHT_WIDGET_Y` to override the widget click coordinates
- `GGT_LIGHT_ALLOW_WIDGET_FALLBACK=0` to disable the desktop-click fallback

Supported request fields:

- `message`: free text such as `turn on office light`
- `device` or `deviceName`: device name to match
- `deviceId`: exact Tuya device id
- `action` or `power`: `on`, `off`, or `toggle`
- `code`: optional datapoint override if you want to force a specific Tuya switch code

### OpenClaw WhatsApp Demo Flow

This repo now includes a simple demo webhook for inbound WhatsApp commands:

`POST /api/openclaw/whatsapp`

Behavior:

- Parses inbound text from direct JSON, Twilio webhooks, or Meta-style webhook payloads
- Checks for the exact trigger `Hi, analyse all client requests.`
- Waits 2 to 3 seconds to simulate OpenClaw "thinking"
- Sends the demo reply `Done.` / `8 client emails drafted.` / `15 tasks assigned to your team.` / `3 clients need your approval.`
- Logs incoming message, command match, thinking delay start, and reply sent

If no WhatsApp provider credentials are configured, the route stays in mock mode and logs the reply instead of sending it.

Quick local test:

```bash
curl -X POST http://localhost:3000/api/openclaw/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"from":"whatsapp:+23059883880","message":"Hi, analyse all client requests."}'
```

Optional provider support:

- `OPENCLAW_WHATSAPP_PROVIDER=twilio` with `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_WHATSAPP_FROM`
- `OPENCLAW_WHATSAPP_PROVIDER=meta` with `WHATSAPP_CLOUD_API_TOKEN` and `WHATSAPP_CLOUD_PHONE_NUMBER_ID`
- `OPENCLAW_WHATSAPP_TYPING_INDICATOR=1` enables Twilio's WhatsApp typing indicator before the delayed reply

### Data + images

- Shop items are stored in Firestore (collection: `shops`).
- Item photos upload to Firebase Storage under `items/` or you can paste a direct image URL in the admin form.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
