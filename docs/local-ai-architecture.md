# Local Sales AI Architecture

## Overview

MO T-SHIRT Sales AI is a narrow local AI assistant. It does not use an LLM, remote inference, or third-party model endpoint. It combines four explainable layers:

1. Intent classification
2. Entity extraction
3. Retrieval memory
4. Decision and response generation

## Core pipeline

1. The user message is scored by a local intent classifier.
2. The entity extractor parses structured order details with confidence values.
3. The retrieval engine searches local memory using TF-IDF and cosine similarity.
4. The decision engine chooses the next action from a finite action set.
5. The response generator ranks template-based responses and returns the highest scoring candidate.
6. A debug object is attached to every turn so the reasoning is auditable.

## Intent model

- Model: multinomial Naive Bayes with TF-IDF centroid fallback
- Training source: local JSON dataset plus approved-session feedback
- Output: label, confidence, score map, explanation

## Entity layer

- Method: regex + heuristics + fuzzy alias matching
- Capabilities:
  - confidence per entity
  - alias resolution
  - typo tolerance
  - conflict detection

## Retrieval memory

- Vectorization: TF-IDF
- Search: cosine similarity
- Memory sources:
  - past leads
  - approved order summaries
  - accepted assistant replies
  - product aliases
  - FAQ pairs

## Learning

The system learns incrementally from:

- approved leads
- saved knowledge
- admin feedback comments
- accepted assistant replies

It updates:

- alias tables
- FAQ memory
- classifier training samples
- retrieval metadata

## Limits

- It is not a general-purpose chatbot.
- It does not reason like an LLM.
- It depends on local training coverage and structured extraction quality.
- It can escalate when confidence is low or fields conflict.

## Migration steps

1. Run `npm run ai:train`.
2. Run `npm run ai:reindex`.
3. Run `npm run ai:evaluate`.
4. Open `/admin/ai-assistant` and use `Retrain` to refresh Firestore-backed memory from approved leads and knowledge.
5. Review the debug object on assistant turns when validating changes.
