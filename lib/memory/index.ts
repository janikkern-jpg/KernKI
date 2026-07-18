/**
 * Barrel-Export für das Gedächtnis-System.
 * Nutzer importieren typischerweise nicht von hier, sondern direkt aus
 * `./store`, `./retrieve`, `./extract` – dieses File existiert nur für
 * Convenience.
 */

export { saveMemory } from "./store";
export { retrieveRelevantMemories } from "./retrieve";
export { extractAndStoreMemories } from "./extract";
export { embed, EMBEDDING_MODEL, EMBEDDING_DIM } from "./embeddings";
