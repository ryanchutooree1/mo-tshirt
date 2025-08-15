// app/admin/dms/page.tsx
'use client';

import React, { useEffect, useState, useRef } from 'react';
import { storage } from '@/lib/firebase';
import {
  ref,
  listAll,
  getDownloadURL,
  getMetadata,
  deleteObject,
  uploadBytesResumable,
} from 'firebase/storage';
import Link from 'next/link';

type FileEntry = {
  name: string;
  url: string;
  fullPath: string;
  contentType?: string;
  size?: number;
};

export default function AdminDMSPage() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const storageFolder = 'documents/';

  useEffect(() => {
    listFiles();
  }, []);

  async function listFiles() {
    setError(null);
    setLoading(true);
    try {
      const listRef = ref(storage, storageFolder);
      const res = await listAll(listRef);

      const items = await Promise.all(
        res.items.map(async (itemRef) => {
          const url = await getDownloadURL(itemRef);
          const meta = await getMetadata(itemRef);
          return {
            name: itemRef.name,
            url,
            fullPath: itemRef.fullPath,
            contentType: meta.contentType,
            size: meta.size,
          } as FileEntry;
        })
      );

      // sort by name or date (optional)
      items.sort((a, b) => a.name.localeCompare(b.name));
      setFiles(items);
    } catch (err: any) {
      console.error('listFiles error', err);
      setError('Failed to list documents. Check console & Firebase rules.');
    } finally {
      setLoading(false);
    }
  }

  function handleChooseFile() {
    inputRef.current?.click();
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const path = `${storageFolder}${file.name}`;
    const storageRef = ref(storage, path);

    setUploading(true);
    setProgress(0);

    const task = uploadBytesResumable(storageRef, file);
    task.on(
      'state_changed',
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        setProgress(pct);
      },
      (err) => {
        console.error('upload error', err);
        setError('Upload failed. See console for details.');
        setUploading(false);
      },
      async () => {
        // finished
        setUploading(false);
        setProgress(0);
        // refresh list
        await listFiles();
      }
    );

    // clear input so same filename re-upload works
    e.currentTarget.value = '';
  };

  const handleDelete = async (fullPath: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await deleteObject(ref(storage, fullPath));
      await listFiles();
      alert('Deleted');
    } catch (err) {
      console.error(err);
      alert('Failed to delete. Check console & rules.');
    }
  };

  // Preview logic: if image, open modal with img; if pdf, open in new tab
  function handlePreview(f: FileEntry) {
    if (!f.url) return alert('No URL available');
    const isImage = f.contentType?.startsWith('image/');
    if (isImage) {
      setPreviewUrl(f.url);
      setPreviewName(f.name);
    } else {
      // open pdf/other in new tab
      window.open(f.url, '_blank');
    }
  }

  function closePreview() {
    setPreviewUrl(null);
    setPreviewName(null);
  }

  return (
    <main className="min-h-screen max-w-5xl mx-auto p-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Document Management (DMS)</h1>
          <p className="text-sm text-gray-600">Upload, preview and manage your business documents.</p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/admin" className="px-4 py-2 bg-white border rounded shadow hover:bg-gray-50">Back</Link>

          <button
            onClick={handleChooseFile}
            className="px-4 py-2 bg-sky-500 text-white rounded shadow hover:bg-sky-600"
          >
            Upload Document
          </button>

          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={handleUpload}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif"
          />
        </div>
      </header>

      {uploading && (
        <div className="mb-4">
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div className="h-3 bg-sky-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-sm mt-2">Uploading... {progress}%</p>
        </div>
      )}

      {error && <div className="mb-4 text-red-600">{error}</div>}

      <section className="bg-white border rounded p-4 shadow">
        <h2 className="font-semibold mb-3">Documents</h2>

        {loading ? (
          <div className="text-gray-500">Loading...</div>
        ) : files.length === 0 ? (
          <div className="text-gray-500">No documents yet. Use “Upload Document” to add files.</div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {files.map((f) => {
              const isImage = f.contentType?.startsWith('image/');
              return (
                <li key={f.fullPath} className="flex items-center justify-between gap-4 p-3 border rounded hover:shadow-sm">
                  <div className="flex items-center gap-3">
                    {isImage ? (
                      <img
                        src={f.url}
                        alt={f.name}
                        onClick={() => handlePreview(f)}
                        style={{ width: 72, height: 72, objectFit: 'cover', cursor: 'pointer', borderRadius: 6 }}
                      />
                    ) : (
                      <div className="w-18 h-18 flex items-center justify-center bg-gray-100 rounded">
                        <span className="text-sm">{f.name.split('.').pop()?.toUpperCase()}</span>
                      </div>
                    )}

                    <div>
                      <div className="font-medium">{f.name}</div>
                      <div className="text-xs text-gray-500">
                        {f.contentType ?? '—'} • {f.size ? `${(f.size / 1024).toFixed(1)} KB` : '—'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePreview(f)}
                      className="px-3 py-1 rounded border bg-white hover:bg-gray-50"
                    >
                      Preview
                    </button>
                    <a href={f.url} target="_blank" rel="noreferrer" className="px-3 py-1 rounded border bg-white hover:bg-gray-50">
                      Download
                    </a>
                    <button
                      onClick={() => handleDelete(f.fullPath, f.name)}
                      className="px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Image preview modal */}
      {previewUrl && (
        <div
          onClick={closePreview}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="bg-white rounded max-w-4xl w-full max-h-[90vh] overflow-auto p-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <div className="font-semibold">{previewName}</div>
              <button className="px-3 py-1 rounded bg-gray-200" onClick={closePreview}>Close</button>
            </div>
            <img src={previewUrl} alt={previewName ?? 'preview'} style={{ width: '100%', height: 'auto', borderRadius: 6 }} />
          </div>
        </div>
      )}
    </main>
  );
}
