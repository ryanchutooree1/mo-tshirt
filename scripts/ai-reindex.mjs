import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAssistantTrainingState } from "../src/lib/ai-assistant.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "../src/data/ai");

const training = buildAssistantTrainingState([], [], [], new Date().toISOString());
const kindCounts = training.retrievalDocuments.reduce((counts, document) => {
  counts[document.kind] = (counts[document.kind] || 0) + 1;
  return counts;
}, {});

await mkdir(dataDir, { recursive: true });
await writeFile(
  path.join(dataDir, "retrieval-index-meta.json"),
  `${JSON.stringify(
    {
      ...training.retrievalIndexMetadata,
      kindCounts,
      sampleDocuments: training.retrievalDocuments.slice(0, 10).map((document) => ({
        id: document.id,
        kind: document.kind,
        text: document.text,
      })),
      updatedAt: training.updatedAt,
    },
    null,
    2
  )}\n`,
  "utf8"
);

console.log(
  JSON.stringify(
    {
      ok: true,
      retrievalIndexMetaWrittenTo: "src/data/ai/retrieval-index-meta.json",
      documentCount: training.retrievalDocumentCount,
    },
    null,
    2
  )
);
