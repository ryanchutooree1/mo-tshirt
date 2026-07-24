import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  INVENTORY_PHOTO_LOG_COLLECTION,
  INVENTORY_PHOTO_UPLOADS_COLLECTION,
  isInventoryPhotoEligibleForDeletion,
} from "@/lib/inventory-photo-log";
import {
  MOB_INVENTORY_SETTINGS_ID,
  MOB_SETTINGS_COLLECTION,
  mapMobInventorySettings,
} from "@/lib/mob-inventory";

export type InventoryPhotoCleanupResult = {
  enabled: boolean;
  retentionDays: number;
  scanned: number;
  eligible: number;
  deleted: number;
  failed: number;
  deletedRecordIds: string[];
};

export async function getMobInventorySettings() {
  const snapshot = await getDoc(
    doc(db, MOB_SETTINGS_COLLECTION, MOB_INVENTORY_SETTINGS_ID)
  );
  return mapMobInventorySettings(
    snapshot.exists()
      ? (snapshot.data() as Record<string, unknown>)
      : undefined
  );
}

export async function runInventoryPhotoRetentionCleanup(options?: {
  now?: Date;
}) {
  const settings = await getMobInventorySettings();
  const result: InventoryPhotoCleanupResult = {
    enabled: settings.deleteCompletedPhotos,
    retentionDays: settings.photoRetentionDays,
    scanned: 0,
    eligible: 0,
    deleted: 0,
    failed: 0,
    deletedRecordIds: [],
  };
  if (!settings.deleteCompletedPhotos) return result;

  const now = options?.now || new Date();
  const photoSnapshot = await getDocs(
    query(
      collection(db, INVENTORY_PHOTO_LOG_COLLECTION),
      orderBy("uploadedAtIso", "asc"),
      limit(300)
    )
  );
  result.scanned = photoSnapshot.size;

  const candidates = photoSnapshot.docs.filter((entry) => {
    const data = entry.data() as Record<string, unknown>;
    return isInventoryPhotoEligibleForDeletion(
      data,
      settings.photoRetentionDays,
      now
    );
  });
  result.eligible = candidates.length;

  for (const candidate of candidates) {
    try {
      const data = candidate.data() as Record<string, unknown>;
      const uploadId =
        typeof data.uploadId === "string" ? data.uploadId.trim() : "";
      const batch = writeBatch(db);

      if (uploadId) {
        const chunkSnapshot = await getDocs(
          query(
            collection(
              db,
              INVENTORY_PHOTO_UPLOADS_COLLECTION,
              uploadId,
              "chunks"
            ),
            orderBy("index", "asc")
          )
        );
        chunkSnapshot.docs.forEach((chunk) => batch.delete(chunk.ref));
        batch.delete(
          doc(db, INVENTORY_PHOTO_UPLOADS_COLLECTION, uploadId)
        );
      }

      const deletedAtIso = now.toISOString();
      batch.update(candidate.ref, {
        imageDeleted: true,
        photoDeletedAt: serverTimestamp(),
        photoDeletedAtIso: deletedAtIso,
        updatedAt: serverTimestamp(),
        updatedAtIso: deletedAtIso,
      });
      await batch.commit();

      result.deleted += 1;
      result.deletedRecordIds.push(candidate.id);
    } catch (error) {
      result.failed += 1;
      console.error("inventory-photo-retention:record", candidate.id, error);
    }
  }

  return result;
}
