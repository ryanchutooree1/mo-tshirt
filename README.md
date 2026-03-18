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
