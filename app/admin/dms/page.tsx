// app/admin/dms/page.tsx  (or components/admin/DMS.tsx)
'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  ref as storageRef,
  listAll,
  getDownloadURL,
  uploadBytesResumable,
  deleteObject,
  getMetadata,
  getBlob,
} from 'firebase/storage';
import { storage } from '@/lib/firebase'; // <-- ensure exported
import clsx from 'clsx'; // optional; if not installed you can remove clsx usage
import { FiUploadCloud, FiFolder, FiFileText, FiSearch, FiTrash2, FiEdit2, FiDownload, FiCopy } from 'react-icons/fi';

type DocItem = {
  name: string;
  fullPath?: string;
  isFolder?: boolean;
  url?: string;
  ref?: any;
  size?: number;
  updated?: string | null;
};

export default function DMSPage() {
  const [currentPath, setCurrentPath] = useState<string>('documents/');
  const [items, setItems] = useState<DocItem[]>([]);
  const [filtered, setFiltered] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [renaming, setRenaming] = useState<{ oldName: string; ref: any } | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Small toast
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(id);
  }, [message]);

  useEffect(() => {
    listCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  useEffect(() => {
    if (!search) {
      setFiltered(items);
      return;
    }
    const q = search.trim().toLowerCase();
    setFiltered(items.filter(i => i.name.toLowerCase().includes(q)));
  }, [search, items]);

  async function listCurrent() {
    setLoading(true);
    try {
      const ref = storageRef(storage, currentPath);
      const res = await listAll(ref);

      // gather file data
      const entries: DocItem[] = [];

      // prefixes are 'folders'
      for (const prefix of res.prefixes) {
        entries.push({
          name: prefix.name,
          fullPath: `${prefix.fullPath}`,
          isFolder: true,
          ref: prefix,
        });
      }

      // items are files
      const filePromises = res.items.map(async (it: any) => {
        const url = await getDownloadURL(it);
        let meta;
        try {
          meta = await getMetadata(it);
        } catch (e) {
          meta = null;
        }
        return {
          name: it.name,
          fullPath: it.fullPath,
          isFolder: false,
          url,
          size: meta?.size,
          updated: meta?.timeCreated ?? null,
          ref: it,
        } as DocItem;
      });

      const fileEntries = await Promise.all(filePromises);
      const combined = [...entries, ...fileEntries];
      setItems(combined);
      setFiltered(combined);
    } catch (err: any) {
      console.error('list error', err);
      setMessage({ type: 'err', text: `Failed to list: ${err?.message ?? err}` });
    } finally {
      setLoading(false);
    }
  }

  // navigate to folder
  function openFolder(name: string) {
    setCurrentPath(prev => `${prev}${name}/`);
  }

  // go up
  function navigateUp() {
    if (currentPath === 'documents/') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const newPath = parts.length ? `${parts.join('/')}/` : 'documents/';
    setCurrentPath(newPath);
  }

  // create folder (create placeholder .keep)
  async function createFolder() {
    const folderName = prompt('Enter new folder name (no slashes):');
    if (!folderName) return;
    const safe = folderName.replace(/[\/\\]+/g, '');
    if (!safe) return;
    setCreatingFolder(true);
    try {
      const placeholderRef = storageRef(storage, `${currentPath}${safe}/.keep`);
      await uploadBytesResumable(placeholderRef, new Blob(['']), {});
      setMessage({ type: 'ok', text: `Folder "${safe}" created` });
      await listCurrent();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'err', text: `Failed to create folder: ${err?.message ?? err}` });
    } finally {
      setCreatingFolder(false);
    }
  }

  // Upload files
  function triggerFilePicker() {
    fileInputRef.current?.click();
  }

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    for (const f of arr) {
      await uploadFile(f);
    }
    // reset input
    (e.target as HTMLInputElement).value = '';
    await listCurrent();
  }

  async function uploadFile(file: File) {
    const fullPath = `${currentPath}${file.name}`;
    const ref = storageRef(storage, fullPath);
    const task = uploadBytesResumable(ref, file);
    setUploadingFiles(prev => ({ ...prev, [file.name]: 0 }));

    task.on(
      'state_changed',
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        setUploadingFiles(prev => ({ ...prev, [file.name]: pct }));
      },
      (err) => {
        console.error('upload err', err);
        setMessage({ type: 'err', text: `Upload failed: ${err?.message ?? err}` });
        setUploadingFiles(prev => {
          const copy = { ...prev };
          delete copy[file.name];
          return copy;
        });
      },
      async () => {
        setUploadingFiles(prev => {
          const copy = { ...prev };
          delete copy[file.name];
          return copy;
        });
        setMessage({ type: 'ok', text: `Uploaded ${file.name}` });
        // refresh items
        await listCurrent();
      }
    );
  }

  // delete
  async function handleDelete(item: DocItem) {
    const ok = confirm(`Delete "${item.name}" ? This cannot be undone.`);
    if (!ok) return;
    try {
      if (item.isFolder) {
        // remove all files under the folder (listAll) — caution!
        const folderRef = storageRef(storage, item.fullPath!);
        const res = await listAll(folderRef);
        // delete files
        const promises = res.items.map((it: any) => deleteObject(it));
        // delete nested files recursively for nested prefixes
        for (const p of res.prefixes) {
          const r = await listAll(p);
          promises.push(...r.items.map((it: any) => deleteObject(it)));
        }
        await Promise.all(promises);
        setMessage({ type: 'ok', text: `Folder ${item.name} deleted` });
      } else {
        await deleteObject(storageRef(storage, item.fullPath!));
        setMessage({ type: 'ok', text: `${item.name} deleted` });
      }
      await listCurrent();
    } catch (err: any) {
      console.error('delete err', err);
      setMessage({ type: 'err', text: `Delete failed: ${err?.message ?? err}` });
    }
  }

  // rename: fetch blob and reupload to new name then delete old
  async function handleRename(item: DocItem) {
    const newName = prompt('Enter new name', item.name);
    if (!newName || newName === item.name) return;
    try {
      setLoading(true);

      const oldRef = storageRef(storage, item.fullPath!);
      const blob = await (await fetch(item.url!)).blob();
      const newRef = storageRef(storage, `${currentPath}${newName}`);

      // upload
      await uploadBytesResumable(newRef, blob);
      // delete old
      await deleteObject(oldRef);

      setMessage({ type: 'ok', text: `Renamed to ${newName}` });
      await listCurrent();
    } catch (err: any) {
      console.error('rename err', err);
      setMessage({ type: 'err', text: `Rename failed: ${err?.message ?? err}` });
    } finally {
      setLoading(false);
    }
  }

  // preview a file (pdf/image) in modal by opening its download URL
  function preview(item: DocItem) {
    if (!item.url) return;
    setPreviewUrl(item.url);
    setPreviewName(item.name);
  }

  // copy share link
  async function copyLink(item: DocItem) {
    try {
      if (!item.url) {
        const url = await getDownloadURL(storageRef(storage, item.fullPath!));
        await navigator.clipboard.writeText(url);
      } else {
        await navigator.clipboard.writeText(item.url);
      }
      setMessage({ type: 'ok', text: 'Download link copied to clipboard' });
    } catch (err: any) {
      setMessage({ type: 'err', text: `Failed to copy link: ${err?.message ?? err}` });
    }
  }

  // download via anchor
  function downloadFile(item: DocItem) {
    const url = item.url;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = item.name;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // breadcrumbs
  const crumbs = currentPath.replace(/\/$/, '').split('/').filter(Boolean);

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">DMS — Documents</h1>
          <p className="text-gray-600">Upload, manage and share PDFs & documents securely</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentPath('documents/')}
            className="px-4 py-2 bg-white border rounded shadow hover:bg-gray-50"
          >
            Home
          </button>
          <button
            onClick={createFolder}
            className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700"
            disabled={creatingFolder}
          >
            <FiFolder className="inline mr-2" /> New Folder
          </button>
          <button
            onClick={triggerFilePicker}
            className="px-4 py-2 bg-green-600 text-white rounded shadow hover:bg-green-700"
          >
            <FiUploadCloud className="inline mr-2" /> Upload
          </button>
        </div>
      </div>

      {/* upload input hidden */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFilesSelected}
      />

      {/* breadcrumb + search */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <button onClick={navigateUp} className="px-2 py-1 bg-white border rounded">Up</button>
          <div className="flex items-center gap-1">
            <span className="text-gray-400">Path:</span>
            <nav className="flex gap-1 items-center">
              <button onClick={() => setCurrentPath('documents/')} className="text-blue-600 hover:underline">documents</button>
              {crumbs.map((c, idx) => (
                <span key={idx} className="flex items-center gap-1">
                  <span className="text-gray-400">/</span>
                  <button
                    onClick={() => {
                      const p = crumbs.slice(0, idx + 1).join('/') + '/';
                      setCurrentPath(`documents/${p}`);
                    }}
                    className="text-blue-600 hover:underline"
                  >
                    {c}
                  </button>
                </span>
              ))}
            </nav>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border rounded w-64"
            />
            <FiSearch className="absolute left-3 top-2.5 text-gray-400" />
          </div>
        </div>
      </div>

      {/* toast */}
      {message && (
        <div className={clsx(
          'sticky top-4 py-2 px-4 rounded mb-4 w-fit',
          message.type === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        )}>
          {message.text}
        </div>
      )}

      {/* uploading progress */}
      {Object.keys(uploadingFiles).length > 0 && (
        <div className="mb-4 space-y-2">
          {Object.entries(uploadingFiles).map(([name, pct]) => (
            <div key={name}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">{name}</span>
                <span>{pct}%</span>
              </div>
              <div className="w-full bg-gray-200 h-2 rounded">
                <div style={{ width: `${pct}%` }} className="h-2 bg-green-500 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* file list */}
      <div className="bg-white shadow rounded-lg p-4">
        {loading ? (
          <div className="text-center py-8">Loading documents...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No documents found.</div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((it) => {
              const isPdf = it.name.toLowerCase().endsWith('.pdf');
              const isImage = /\.(jpe?g|png|gif|webp)$/i.test(it.name);
              return (
                <li key={it.fullPath ?? it.name} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 flex items-center justify-center rounded bg-gray-50 border">
                      {it.isFolder ? <FiFolder className="text-orange-500" size={20} /> : isPdf ? <FiFileText className="text-red-500" size={20} /> : <FiFileText size={20} />}
                    </div>
                    <div>
                      <div className="font-medium">{it.name}</div>
                      <div className="text-xs text-gray-500">{it.isFolder ? 'Folder' : `${it.size ? `${Math.round((it.size/1024))} KB` : ''} ${it.updated ? `• ${new Date(it.updated).toLocaleDateString()}` : ''}`}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {it.isFolder ? (
                      <button onClick={() => openFolder(it.name)} className="px-3 py-1 bg-blue-50 text-blue-700 rounded">Open</button>
                    ) : (
                      <>
                        <button onClick={() => preview(it)} className="p-2 hover:bg-gray-100 rounded" title="Preview"><FiFileText /></button>
                        <button onClick={() => downloadFile(it)} className="p-2 hover:bg-gray-100 rounded" title="Download"><FiDownload /></button>
                        <button onClick={() => copyLink(it)} className="p-2 hover:bg-gray-100 rounded" title="Copy link"><FiCopy /></button>
                      </>
                    )}

                    {!it.isFolder && (
                      <button onClick={() => handleRename(it)} className="p-2 hover:bg-gray-100 rounded" title="Rename"><FiEdit2 /></button>
                    )}
                    <button onClick={() => handleDelete(it)} className="p-2 hover:bg-gray-100 rounded text-red-600" title="Delete"><FiTrash2 /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white w-[90%] max-w-5xl h-[90%] rounded overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b">
              <div className="font-semibold">{previewName}</div>
              <div className="flex gap-2">
                <button onClick={() => { if (previewUrl) navigator.clipboard.writeText(previewUrl).then(() => setMessage({ type: 'ok', text: 'Link copied' })); }} className="px-3 py-1 bg-blue-600 text-white rounded">Copy Link</button>
                <button onClick={() => setPreviewUrl(null)} className="px-3 py-1 bg-gray-200 rounded">Close</button>
              </div>
            </div>
            <div className="h-full">
              {/* embed PDF or show image */}
              {previewName?.toLowerCase().endsWith('.pdf') ? (
                <iframe src={previewUrl} className="w-full h-full" title={previewName} />
              ) : (
                <img src={previewUrl} alt={previewName || 'preview'} className="w-full h-full object-contain" />
              )}
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
