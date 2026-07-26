type PublicArtworkAttachment = {
  name: string;
  url: string;
  contentType: string | null;
  size: number | null;
  uploadedAt: string;
};

type JsonBody = {
  error?: string;
  attachment?: PublicArtworkAttachment;
  uploadId?: string;
  uploadToken?: string;
  sessionId?: string;
  chunkSize?: number;
};

async function readJson(response: Response) {
  const body = (await response.json().catch(() => ({}))) as JsonBody;
  if (!response.ok) {
    throw new Error(body.error || "Artwork upload failed.");
  }
  return body;
}

export async function uploadPublicArtwork(input: {
  file: File;
  filename: string;
  sessionId: string;
}) {
  const created = await readJson(
    await fetch("/api/ai-assistant/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: input.filename,
        contentType: input.file.type,
        size: input.file.size,
        sessionId: input.sessionId,
      }),
    })
  );

  if (
    !created.uploadId ||
    !created.uploadToken ||
    !created.chunkSize ||
    !created.sessionId
  ) {
    throw new Error("Artwork upload could not be started.");
  }

  const uploadUrl = `/api/ai-assistant/uploads/${encodeURIComponent(created.uploadId)}`;
  let index = 0;
  for (let offset = 0; offset < input.file.size; offset += created.chunkSize) {
    await readJson(
      await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Chunk-Index": String(index),
          "X-Upload-Token": created.uploadToken,
        },
        body: input.file.slice(offset, offset + created.chunkSize),
      })
    );
    index += 1;
  }

  const completed = await readJson(
    await fetch(uploadUrl, {
      method: "PATCH",
      headers: { "X-Upload-Token": created.uploadToken },
    })
  );

  if (!completed.attachment) {
    throw new Error("Artwork upload could not be completed.");
  }

  return {
    attachment: completed.attachment,
    sessionId: completed.sessionId || created.sessionId,
  };
}
