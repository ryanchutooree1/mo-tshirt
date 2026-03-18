import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAssistantTrainingState } from "../src/lib/ai-assistant.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "../src/data/ai");

const training = buildAssistantTrainingState([], [], [], new Date().toISOString());

await mkdir(dataDir, { recursive: true });
await writeFile(
  path.join(dataDir, "intent-model.json"),
  `${JSON.stringify(training.intentModel, null, 2)}\n`,
  "utf8"
);
await writeFile(
  path.join(dataDir, "training-summary.json"),
  `${JSON.stringify(
    {
      positiveKeywordCount: training.positiveKeywordCount,
      classifierSampleCount: training.classifierSampleCount,
      classifierLabelCount: training.classifierLabelCount,
      faqCount: training.faqCount,
      retrievalDocumentCount: training.retrievalDocumentCount,
      learnedProductAliasCount: training.learnedProductAliasCount,
      retrievalIndexMetadata: training.retrievalIndexMetadata,
      topKeywords: training.topKeywords,
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
      intentModelWrittenTo: "src/data/ai/intent-model.json",
      trainingSummaryWrittenTo: "src/data/ai/training-summary.json",
      classifierSampleCount: training.classifierSampleCount,
      retrievalDocumentCount: training.retrievalDocumentCount,
    },
    null,
    2
  )
);
