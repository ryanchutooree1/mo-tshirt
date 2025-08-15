// app/admin/dms/page.tsx
'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  ref as storageRef,
  listAll,
  getDownloadURL,
  uploadBytesResumable,
  deleteObject,
  getMetadata,
} from 'firebase/storage';
import { storage } from '@/lib/firebase';
import clsx from 'clsx';
import {
  FiUploadCloud,
  FiFolder,
  FiFileText,
  FiSearch,
  FiTrash2,
  FiEdit2,
  FiDownload,
  FiCopy,
  FiChevronLeft,
  FiChevronRight,
  FiX,
  FiZoomIn,
  FiZoomOut,
  FiEye
} from 'react-icons/fi';

/**
 * Improved DMSPage
 * - drag & drop upload
 * - multi-select & bulk delete / copy links
 * - search debounce
 * - sort by name/date/size
 * - image thumbnails, PDF inline preview (iframe)
 * - preview modal with zoom + download + copy link
 * - nicer upload progress per file
 */

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
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('name');
  const debouncer = useRef<number | null>(null);
  const [zoom, setZoom] = useState<number>(1);

  // toast auto-clear
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(id);
  }, [message]);

  useEffect(() => {
    listCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, sortBy]);

  useEffect(() => {
    // filter + debounced
    if (debouncer.current) window.clearTimeout(debouncer.current);
    debouncer.current = window.setTimeout(() => {
      if (!search.trim()) {
        setFiltered([...items]);
      } else {
        const q = search.trim().toLowerCase();
        setFiltered(items.filter(i => i.name.toLowerCase().includes(q)));
      }
    }, 250) as unknown as number;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, items]);

  function humanSize(bytes?: number) {
    if (!bytes && bytes !== 0) return '';
    const b = Number(bytes);
    if (b === 0) return '0 B';
    const sizes = ['B','KB','MB','GB','TB'];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return `${(b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${sizes[i]}`;
  }

  const sortItems = (list: DocItem[]) => {
    return [...list].sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'date') {
        const ta = a.updated ? new Date(a.updated).getTime() : 0;
        const tb = b.updated ? new Date(b.updated).getTime() : 0;
        return tb - ta;
      }
      if (sortBy === 'size') return (b.size || 0) - (a.size || 0);
      return 0;
    });
  };

  async function listCurrent() {
    setLoading(true);
    try {
      const ref = storageRef(storage, currentPath);
      const res = await listAll(ref);

      const entries: DocItem[] = [];

      // prefixes -> folders
      for (const prefix of res.prefixes) {
        entries.push({
          name: prefix.name,
          fullPath: `${prefix.fullPath}`,
          isFolder: true,
          ref: prefix,
        });
      }

      // files
      const filePromises = res.items.map(async (it: any) => {
        // getDownloadURL + metadata (if available)
        let url = '';
        let meta: any = null;
        try {
          url = await getDownloadURL(it);
          meta = await getMetadata(it);
        } catch (e) {
          // ignore
        }
        return {
          name: it.name,
          fullPath: it.fullPath,
          isFolder: false,
          url,
          size: meta?.size ?? undefined,
          updated: meta?.timeCreated ?? null,
          ref: it,
        } as DocItem;
      });

      const fileEntries = await Promise.all(filePromises);
      const combined = sortItems([...entries, ...fileEntries]);
      setItems(combined);
      setFiltered(combined);
      // clear selection
      setSelected({});
    } catch (err: any) {
      console.error('list error', err);
      setMessage({ type: 'err', text: `Failed to list: ${err?.message ?? err}` });
    } finally {
      setLoading(false);
    }
  }

  // navigation
  function openFolder(name: string) {
    setCurrentPath(prev => `${prev}${name}/`);
  }
  function navigateUp() {
    if (currentPath === 'documents/') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const newPath = parts.length ? `${parts.join('/')}/` : 'documents/';
    setCurrentPath(newPath);
  }

  // folder creation
  async function createFolder() {
    const folderName = prompt('Enter new folder name (no slashes):');
    if (!folderName) return;
    const safe = folderName.replace(/[\/\\]+/g, '');
    if (!safe) return;
    try {
      setLoading(true);
      const placeholderRef = storageRef(storage, `${currentPath}${safe}/.keep`);
      await uploadBytesResumable(placeholderRef, new Blob(['']), {});
      setMessage({ type: 'ok', text: `Folder "${safe}" created` });
      await listCurrent();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'err', text: `Failed to create folder: ${err?.message ?? err}` });
    } finally {
      setLoading(false);
    }
  }

  // upload helpers
  function triggerFilePicker() {
    fileInputRef.current?.click();
  }

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    for (const f of arr) {
      // upload concurrently but keep UI responsive
      uploadFile(f);
    }
    (e.target as HTMLInputElement).value = '';
    // refresh after a short delay so metadata is available
    setTimeout(listCurrent, 900);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dt = e.dataTransfer;
    if (!dt) return;
    const files = Array.from(dt.files);
    for (const f of files) uploadFile(f);
    setTimeout(listCurrent, 900);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }
  function handleDragLeave() {
    setDragOver(false);
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
        await listCurrent();
      }
    );
  }

  // delete single or bulk
  async function handleDelete(item: DocItem) {
    const ok = confirm(`Delete "${item.name}" ? This cannot be undone.`);
    if (!ok) return;
    try {
      setLoading(true);
      if (item.isFolder) {
        const folderRef = storageRef(storage, item.fullPath!);
        const res = await listAll(folderRef);
        const promises = res.items.map((it: any) => deleteObject(it));
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
    } finally {
      setLoading(false);
    }
  }

  async function bulkDelete() {
    const keys = Object.keys(selected).filter(k => selected[k]);
    if (keys.length === 0) {
      setMessage({ type: 'err', text: 'No files selected' });
      return;
    }
    const ok = confirm(`Delete ${keys.length} selected item(s)? This cannot be undone.`);
    if (!ok) return;
    try {
      setLoading(true);
      const toDelete = items.filter(i => keys.includes(i.fullPath || i.name));
      await Promise.all(toDelete.map(i => i.isFolder ? (async () => {
        const folderRef = storageRef(storage, i.fullPath!);
        const res = await listAll(folderRef);
        const p = res.items.map((it: any) => deleteObject(it));
        for (const x of res.prefixes) {
          const nested = await listAll(x);
          p.push(...nested.items.map((it: any) => deleteObject(it)));
        }
        return Promise.all(p);
      })() : deleteObject(storageRef(storage, i.fullPath!))));
      setMessage({ type: 'ok', text: `${keys.length} items deleted` });
      setSelected({});
      await listCurrent();
    } catch (err: any) {
      setMessage({ type: 'err', text: `Bulk delete failed: ${err?.message ?? err}` });
    } finally {
      setLoading(false);
    }
  }

  // rename file (reupload then delete)
  async function handleRename(item: DocItem) {
    const newName = prompt('Enter new name', item.name);
    if (!newName || newName === item.name) return;
    try {
      setLoading(true);
      const oldRef = storageRef(storage, item.fullPath!);
      const blob = await (await fetch(item.url!)).blob();
      const newRef = storageRef(storage, `${currentPath}${newName}`);
      await uploadBytesResumable(newRef, blob);
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

  // preview (image/pdf)
  function preview(item: DocItem) {
    if (!item.url) return setMessage({ type: 'err', text: 'No download URL' });
    setPreviewUrl(item.url);
    setPreviewName(item.name);
    setZoom(1);
  }

  async function copyLink(item: DocItem) {
    try {
      const url = item.url ?? await getDownloadURL(storageRef(storage, item.fullPath!));
      await navigator.clipboard.writeText(url);
      setMessage({ type: 'ok', text: 'Download link copied to clipboard' });
    } catch (err: any) {
      setMessage({ type: 'err', text: `Failed to copy link: ${err?.message ?? err}` });
    }
  }

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

  // bulk copy links
  async function bulkCopyLinks() {
    const keys = Object.keys(selected).filter(k => selected[k]);
    if (keys.length === 0) return setMessage({ type: 'err', text: 'No files selected' });
    try {
      const urls = await Promise.all(keys.map(async (fullPath) => {
        const it = items.find(i => (i.fullPath || i.name) === fullPath);
        if (!it) return '';
        return it.url ?? await getDownloadURL(storageRef(storage, it.fullPath!));
      }));
      const text = urls.filter(Boolean).join('\n');
      await navigator.clipboard.writeText(text);
      setMessage({ type: 'ok', text: `${urls.length} links copied` });
    } catch (err: any) {
      setMessage({ type: 'err', text: `Failed to copy links: ${err?.message ?? err}` });
    }
  }

  // breadcrumbs helper
  const crumbs = currentPath.replace(/\/$/, '').split('/').filter(Boolean);

  // UI helpers
  const isImage = (name = '') => /\.(jpe?g|png|gif|webp)$/i.test(name);
  const isPdf = (name = '') => /\.pdf$/i.test(name);

  // keyboard: close preview with Esc
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPreviewUrl(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">DMS — Documents</h1>
          <p className="text-gray-600">Upload, manage and share PDFs & images securely</p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentPath('documents/')} className="px-3 py-2 bg-white border rounded shadow">Home</button>
          <button onClick={createFolder} className="px-3 py-2 bg-blue-600 text-white rounded shadow"><FiFolder className="inline mr-2" />New Folder</button>
          <button onClick={triggerFilePicker} className="px-3 py-2 bg-green-600 text-white rounded shadow"><FiUploadCloud className="inline mr-2" />Upload</button>
        </div>
      </div>

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFilesSelected} />

      {/* drag area + search + sort + bulk actions */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={clsx('border-2 rounded p-4 mb-4 flex items-center justify-between gap-4', dragOver ? 'border-dashed border-blue-400 bg-blue-50' : 'border-gray-100')}
      >
        <div className="flex items-center gap-4 flex-1">
          <div className="flex items-center gap-2">
            <button onClick={navigateUp} title="Up" className="px-3 py-2 bg-white border rounded">
              <FiChevronLeft />
            </button>
            <div className="text-sm text-gray-700">Path:
              <span className="ml-2">
                <button onClick={() => setCurrentPath('documents/')} className="text-blue-600 hover:underline">documents</button>
                {crumbs.map((c, idx) => (
                  <span key={idx} className="ml-2"> / <button onClick={() => {
                    const p = crumbs.slice(0, idx + 1).join('/') + '/';
                    setCurrentPath(`documents/${p}`);
                  }} className="text-blue-600 hover:underline ml-2">{c}</button></span>
                ))}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="p-2 border rounded bg-white"
            aria-label="Sort files"
          >
            <option value="name">Sort: Name</option>
            <option value="date">Sort: Date</option>
            <option value="size">Sort: Size</option>
          </select>

          <div className="relative">
            <input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-3 py-2 border rounded w-64" />
            <FiSearch className="absolute left-3 top-2.5 text-gray-400" />
          </div>

          <div className="flex items-center gap-2">
            <button onClick={bulkCopyLinks} className="px-3 py-2 bg-yellow-50 text-yellow-800 border rounded" title="Copy links for selected">Copy Links</button>
            <button onClick={bulkDelete} className="px-3 py-2 bg-red-50 text-red-700 border rounded" title="Delete selected">Delete</button>
          </div>
        </div>
      </div>

      {/* upload progress */}
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
              const image = isImage(it.name);
              const pdf = isPdf(it.name);
              const checked = !!selected[it.fullPath || it.name];
              return (
                <li key={it.fullPath ?? it.name} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setSelected(prev => ({ ...prev, [it.fullPath || it.name]: e.target.checked }));
                      }}
                    />
                    <div className="w-12 h-12 flex items-center justify-center rounded bg-gray-50 border overflow-hidden">
                      {it.isFolder ? <FiFolder className="text-orange-500" size={20} /> : image ? <img src={it.url} alt={it.name} className="w-full h-full object-cover" /> : pdf ? <FiFileText className="text-red-500" size={20} /> : <FiFileText size={20} />}
                    </div>

                    <div>
                      <div className="font-medium">{it.name}</div>
                      <div className="text-xs text-gray-500">{it.isFolder ? 'Folder' : `${humanSize(it.size)} ${it.updated ? `• ${new Date(it.updated).toLocaleDateString()}` : ''}`}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {it.isFolder ? (
                      <button onClick={() => openFolder(it.name)} className="px-3 py-1 bg-blue-50 text-blue-700 rounded">Open</button>
                    ) : (
                      <>
                        <button onClick={() => preview(it)} className="p-2 hover:bg-gray-100 rounded" title="Preview"><FiEye /></button>
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

      {/* preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-6">
          <div className="bg-white w-full max-w-6xl h-[90vh] rounded overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-3 border-b">
              <div className="flex items-center gap-3">
                <div className="font-semibold truncate max-w-lg">{previewName}</div>
                <div className="text-sm text-gray-500">{previewUrl ? '' : ''}</div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => { navigator.clipboard.writeText(previewUrl || '').then(() => setMessage({ type: 'ok', text: 'Link copied' })); }} className="px-3 py-1 bg-blue-600 text-white rounded">Copy Link</button>
                <button onClick={() => { if (previewUrl) window.open(previewUrl, '_blank'); }} className="px-3 py-1 bg-gray-200 rounded">Open</button>
                <button onClick={() => { if (previewUrl) { const a = document.createElement('a'); a.href = previewUrl; a.download = previewName || 'file'; a.click(); } }} className="px-3 py-1 bg-green-600 text-white rounded">Download</button>
                <button onClick={() => setPreviewUrl(null)} className="px-3 py-1 bg-red-50 text-red-700 rounded"><FiX /></button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden bg-black flex items-center justify-center relative">
              {/* controls */}
              <div className="absolute top-4 left-4 z-50 flex gap-2 bg-black/40 p-2 rounded">
                <button onClick={() => setZoom(z => Math.min(3, +(z + 0.2).toFixed(2)))} title="Zoom in" className="p-2 bg-white/10 rounded text-white"><FiZoomIn /></button>
                <button onClick={() => setZoom(z => Math.max(0.4, +(z - 0.2).toFixed(2)))} title="Zoom out" className="p-2 bg-white/10 rounded text-white"><FiZoomOut /></button>
                <div className="px-2 text-sm text-white">Zoom: {Math.round(zoom * 100)}%</div>
              </div>

              {/* content */}
              {previewName?.toLowerCase().endsWith('.pdf') ? (
                <iframe src={previewUrl} className="w-full h-full" title={previewName} />
              ) : isImage(previewName || '') ? (
                <div className="w-full h-full flex items-center justify-center p-4">
                  <img src={previewUrl || ''} alt={previewName || 'preview'} style={{ transform: `scale(${zoom})` }} className="max-w-full max-h-full object-contain transition-transform" />
                </div>
              ) : (
                <div className="text-white">Preview not available. Use Download or Open.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {message && (
        <div className={clsx('fixed right-6 bottom-6 py-2 px-4 rounded shadow-lg', message.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white')}>
          {message.text}
        </div>
      )}
    </main>
  );
}
