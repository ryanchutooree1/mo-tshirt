// app/admin/dms/page.tsx
'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  ref as storageRef,
  list,
  listAll, // still used for recursive deletes
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
  FiCheckCircle,
  FiBarChart2,
  FiSearch,
  FiTrash2,
  FiEdit2,
  FiDownload,
  FiCopy,
  FiChevronLeft,
  FiX,
  FiZoomIn,
  FiZoomOut,
  FiEye
} from 'react-icons/fi';

type DocItem = {
  name: string;
  fullPath?: string;
  isFolder?: boolean;
  url?: string;
  ref?: any;
  size?: number;
  updated?: string | null;
};

const DOCUMENTS_PATH = 'documents/';
const ROOT_PATH = DOCUMENTS_PATH;

export default function DMSPage() {
  const [currentPath, setCurrentPath] = useState<string>(ROOT_PATH);
  const [items, setItems] = useState<DocItem[]>([]);
  const [filtered, setFiltered] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [paging, setPaging] = useState<boolean>(false);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState<boolean>(false);
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

  // pagination config
  const PAGE_SIZE = 50; // adjust as you like

  // toast auto-clear
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(id);
  }, [message]);

  // initial load or when path/sort changes -> reset list & load first page
  useEffect(() => {
    resetAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, sortBy]);

  // search debounce over currently loaded items
  useEffect(() => {
    if (debouncer.current) window.clearTimeout(debouncer.current);
    debouncer.current = window.setTimeout(() => {
      if (!search.trim()) {
        setFiltered(sortItems([...items]));
      } else {
        const q = search.trim().toLowerCase();
        setFiltered(sortItems(items.filter(i => i.name.toLowerCase().includes(q))));
      }
    }, 250) as unknown as number;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, items, sortBy]);

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

  async function resetAndLoad() {
    setLoading(true);
    setItems([]);
    setFiltered([]);
    setSelected({});
    setNextPageToken(undefined);
    setHasMore(false);
    try {
      const { entries, nextToken } = await fetchPage(undefined);
      setItems(entries);
      setFiltered(sortItems(entries));
      setNextPageToken(nextToken);
      setHasMore(Boolean(nextToken));
    } catch (err: any) {
      console.error('list error', err);
      setMessage({ type: 'err', text: `Failed to list: ${err?.message ?? err}` });
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextPageToken || paging) return;
    setPaging(true);
    try {
      const { entries, nextToken } = await fetchPage(nextPageToken);
      const combined = sortItems([...items, ...entries]);
      setItems(combined);
      setFiltered(combined.filter(i => i.name.toLowerCase().includes(search.trim().toLowerCase() || '')));
      setNextPageToken(nextToken);
      setHasMore(Boolean(nextToken));
    } catch (err: any) {
      setMessage({ type: 'err', text: `Failed to load more: ${err?.message ?? err}` });
    } finally {
      setPaging(false);
    }
  }

  /** Fetch a single page using Firebase Storage `list` */
  async function fetchPage(pageToken?: string) {
    const ref = storageRef(storage, currentPath);
    const res = await list(ref, { maxResults: PAGE_SIZE, pageToken });

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

    // files (with URL + metadata)
    const filePromises = res.items.map(async (it: any) => {
      let url = '';
      let meta: any = null;
      try {
        url = await getDownloadURL(it);
        meta = await getMetadata(it);
      } catch {
        /* ignore failures for thumbnails/metadata */
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
    return { entries: [...entries, ...fileEntries], nextToken: res.nextPageToken as string | undefined };
  }

  // navigation
  function openFolder(name: string) {
    setCurrentPath(prev => `${prev}${name}/`);
  }
  function navigateUp() {
    if (currentPath === ROOT_PATH) return;
    const relativePath = currentPath.startsWith(ROOT_PATH)
      ? currentPath.slice(ROOT_PATH.length)
      : currentPath;
    const parts = relativePath.split('/').filter(Boolean);
    parts.pop();
    const newPath = parts.length ? `${ROOT_PATH}${parts.join('/')}/` : ROOT_PATH;
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
      await resetAndLoad();
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
      uploadFile(f);
    }
    (e.target as HTMLInputElement).value = '';
    setTimeout(resetAndLoad, 900);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dt = e.dataTransfer;
    if (!dt) return;
    const files = Array.from(dt.files);
    for (const f of files) uploadFile(f);
    setTimeout(resetAndLoad, 900);
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
        await resetAndLoad();
      }
    );
  }

  // delete single or bulk (recursive for folders)
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
      await resetAndLoad();
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
      await resetAndLoad();
    } catch (err: any) {
      setMessage({ type: 'err', text: `Bulk delete failed: ${err?.message ?? err}` });
    } finally {
      setLoading(false);
    }
  }

  // rename (reupload then delete)
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
      await resetAndLoad();
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
  const crumbs = currentPath
    .slice(ROOT_PATH.length)
    .replace(/\/$/, '')
    .split('/')
    .filter(Boolean);
  const atBucketRoot = currentPath === ROOT_PATH;

  // UI helpers
  const isImage = (name = '') => /\.(jpe?g|png|gif|webp)$/i.test(name);
  const isPdf = (name = '') => /\.pdf$/i.test(name);

  const stats = useMemo(() => {
    const folders = items.filter(i => i.isFolder).length;
    const files = items.filter(i => !i.isFolder).length;
    const selectedCount = Object.values(selected).filter(Boolean).length;
    const totalSize = items.reduce((sum, i) => sum + (i.size || 0), 0);
    return { folders, files, selectedCount, totalSize };
  }, [items, selected]);

  // keyboard: close preview with Esc
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPreviewUrl(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <main className="relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-12rem] h-80 w-80 rounded-full bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.35),transparent_70%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-10rem] top-48 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.25),transparent_70%)] blur-3xl"
      />
      <div className="relative mx-auto max-w-6xl space-y-6 px-6 py-8">
        {/* Hero */}
        <section
          className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm backdrop-blur"
          style={{ animation: 'fadeUp 0.6s ease-out both' }}
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_60%)]"
          />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-600">DMS</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">Documents</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                Browse the protected documents area, upload into any folder, and manage PDFs & images with quick previews and shareable links.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                  <FiUploadCloud className="h-4 w-4" /> Fast uploads
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <FiFileText className="h-4 w-4" /> PDF & image preview
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  Shareable links
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setCurrentPath(DOCUMENTS_PATH)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                Documents Home
              </button>
              <button
                onClick={createFolder}
                className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
              >
                <FiFolder className="h-4 w-4" /> New Folder
              </button>
              <button
                onClick={triggerFilePicker}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <FiUploadCloud className="h-4 w-4" /> Upload
              </button>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section
          className="grid grid-cols-2 gap-4 md:grid-cols-4"
          style={{ animation: 'fadeUp 0.6s ease-out both', animationDelay: '0.08s' }}
        >
          <StatCard label="Folders" value={stats.folders} tone="sky" icon={<FiFolder className="h-4 w-4" />} />
          <StatCard label="Files" value={stats.files} tone="slate" icon={<FiFileText className="h-4 w-4" />} />
          <StatCard label="Selected" value={stats.selectedCount} tone="amber" icon={<FiCheckCircle className="h-4 w-4" />} />
          <StatCard label="Storage" value={humanSize(stats.totalSize)} tone="emerald" icon={<FiBarChart2 className="h-4 w-4" />} />
        </section>

        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFilesSelected} />

        {/* Dropzone */}
        <section
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={clsx(
            'rounded-3xl border-2 border-dashed p-5 shadow-sm transition',
            dragOver ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white/90'
          )}
          style={{ animation: 'fadeUp 0.6s ease-out both', animationDelay: '0.14s' }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800">Drag & drop files here</div>
              <div className="text-xs text-slate-500">Or use the upload button to choose files.</div>
            </div>
            <button
              onClick={triggerFilePicker}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <FiUploadCloud className="h-4 w-4" /> Choose files
            </button>
          </div>
        </section>

        {/* Filters */}
        <section
          className="sticky top-20 z-10 rounded-3xl border border-slate-200/70 bg-white/90 p-4 shadow-sm backdrop-blur"
          style={{ animation: 'fadeUp 0.6s ease-out both', animationDelay: '0.18s' }}
        >
          <div className="flex flex-wrap items-start gap-3">
            <button onClick={navigateUp} title="Up" className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50">
              <FiChevronLeft />
            </button>
            <div className="text-xs text-slate-500">
              Path:
              <span className="ml-2">
                <button onClick={() => setCurrentPath(ROOT_PATH)} className="text-sky-600 font-semibold hover:underline">
                  documents
                </button>
                {atBucketRoot && <span className="ml-2 text-slate-400">/</span>}
                {crumbs.map((c, idx) => (
                  <span key={idx} className="ml-2">
                    /{' '}
                    <button
                      onClick={() => {
                        const p = crumbs.slice(0, idx + 1).join('/');
                        setCurrentPath(p ? `${ROOT_PATH}${p}/` : ROOT_PATH);
                      }}
                      className="text-sky-600 font-semibold hover:underline ml-1"
                    >
                      {c}
                    </button>
                  </span>
                ))}
              </span>
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
              aria-label="Sort files"
            >
              <option value="name">Sort: Name</option>
              <option value="date">Sort: Date</option>
              <option value="size">Sort: Size</option>
            </select>

            <div className="relative w-full sm:w-auto">
              <input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200 sm:w-64"
              />
              <FiSearch className="absolute left-3 top-2.5 text-slate-400" />
            </div>

            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <button
                onClick={bulkCopyLinks}
                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 shadow-sm hover:border-amber-300 hover:bg-amber-100"
                title="Copy links for selected"
              >
                Copy Links
              </button>
              <button
                onClick={bulkDelete}
                className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-100"
                title="Delete selected"
              >
                Delete
              </button>
            </div>
          </div>
        </section>

      {/* upload progress */}
      {Object.keys(uploadingFiles).length > 0 && (
        <div className="mb-4 space-y-2">
          {Object.entries(uploadingFiles).map(([name, pct]) => (
            <div key={name}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">{name}</span>
                <span>{pct}%</span>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded">
                <div style={{ width: `${pct}%` }} className="h-2 bg-green-500 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* file list */}
      <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
        {loading ? (
          <div className="text-center py-8 text-slate-500">Loading documents...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No files or folders found here.</div>
        ) : (
          <>
            <ul className="space-y-2">
              {filtered.map((it) => {
                const image = isImage(it.name);
                const pdf = isPdf(it.name);
                const checked = !!selected[it.fullPath || it.name];
                return (
                  <li key={it.fullPath ?? it.name} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setSelected(prev => ({ ...prev, [it.fullPath || it.name]: e.target.checked }));
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-sky-600"
                      />
                      <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200 overflow-hidden">
                        {it.isFolder ? <FiFolder className="text-orange-500" size={20} /> : image ? <img src={it.url} alt={it.name} className="w-full h-full object-cover" /> : pdf ? <FiFileText className="text-rose-500" size={20} /> : <FiFileText size={20} className="text-slate-400" />}
                      </div>

                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 truncate max-w-[60vw] sm:max-w-none">{it.name}</div>
                        <div className="text-xs text-slate-500">{it.isFolder ? 'Folder' : `${humanSize(it.size)} ${it.updated ? `• ${new Date(it.updated).toLocaleDateString()}` : ''}`}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                      {it.isFolder ? (
                        <button onClick={() => openFolder(it.name)} className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">Open</button>
                      ) : (
                        <>
                          <button onClick={() => preview(it)} className="p-2 hover:bg-slate-100 rounded" title="Preview"><FiEye /></button>
                          <button onClick={() => downloadFile(it)} className="p-2 hover:bg-slate-100 rounded" title="Download"><FiDownload /></button>
                          <button onClick={() => copyLink(it)} className="p-2 hover:bg-slate-100 rounded" title="Copy link"><FiCopy /></button>
                        </>
                      )}

                      {!it.isFolder && (
                        <button onClick={() => handleRename(it)} className="p-2 hover:bg-slate-100 rounded" title="Rename"><FiEdit2 /></button>
                      )}
                      <button onClick={() => handleDelete(it)} className="p-2 hover:bg-slate-100 rounded text-rose-600" title="Delete"><FiTrash2 /></button>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Load more */}
            {hasMore && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={loadMore}
                  disabled={paging}
                  className={clsx(
                    'px-4 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-600 shadow-sm',
                    paging ? 'opacity-70 cursor-not-allowed' : 'hover:border-slate-300 hover:bg-slate-50'
                  )}
                >
                  {paging ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="bg-white w-full max-w-6xl h-[90vh] rounded-2xl overflow-hidden flex flex-col border border-slate-200 shadow-2xl">
            <div className="flex items-center justify-between p-3 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="font-semibold truncate max-w-lg text-slate-800">{previewName}</div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => { navigator.clipboard.writeText(previewUrl || '').then(() => setMessage({ type: 'ok', text: 'Link copied' })); }} className="px-3 py-1 rounded-full bg-sky-600 text-white text-xs font-semibold">Copy Link</button>
                <button onClick={() => { if (previewUrl) window.open(previewUrl, '_blank'); }} className="px-3 py-1 rounded-full bg-slate-200 text-xs font-semibold text-slate-700">Open</button>
                <button onClick={() => { if (previewUrl) { const a = document.createElement('a'); a.href = previewUrl; a.download = previewName || 'file'; a.click(); } }} className="px-3 py-1 rounded-full bg-emerald-600 text-white text-xs font-semibold">Download</button>
                <button onClick={() => setPreviewUrl(null)} className="px-3 py-1 rounded-full bg-rose-50 text-rose-700"><FiX /></button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden bg-black flex items-center justify-center relative">
              {/* controls */}
              <div className="absolute top-4 left-4 z-50 flex gap-2 bg-black/40 p-2 rounded-2xl">
                <button onClick={() => setZoom(z => Math.min(3, +(z + 0.2).toFixed(2)))} title="Zoom in" className="p-2 bg-white/10 rounded-xl text-white"><FiZoomIn /></button>
                <button onClick={() => setZoom(z => Math.max(0.4, +(z - 0.2).toFixed(2)))} title="Zoom out" className="p-2 bg-white/10 rounded-xl text-white"><FiZoomOut /></button>
                <div className="px-2 text-sm text-white">Zoom: {Math.round(zoom * 100)}%</div>
              </div>

              {/* content */}
              {previewName?.toLowerCase().endsWith('.pdf') ? (
                <iframe src={previewUrl!} className="w-full h-full" title={previewName!} />
              ) : (/\.(jpe?g|png|gif|webp)$/i.test(previewName || '')) ? (
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
        <div className={clsx('fixed right-6 bottom-6 py-2 px-4 rounded-full shadow-lg text-sm font-semibold', message.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white')}>
          {message.text}
        </div>
      )}
      <style jsx>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  tone = 'slate',
  icon,
}: {
  label: string;
  value: string | number;
  tone?: 'slate' | 'sky' | 'emerald' | 'amber';
  icon?: React.ReactNode;
}) {
  const tones = {
    slate: {
      border: 'border-slate-200',
      bg: 'from-slate-50 via-white to-white',
      accent: 'bg-slate-100 text-slate-700',
      glow: 'bg-slate-200/40',
      value: 'text-slate-900',
    },
    sky: {
      border: 'border-sky-100',
      bg: 'from-sky-50 via-white to-white',
      accent: 'bg-sky-100 text-sky-700',
      glow: 'bg-sky-200/40',
      value: 'text-slate-900',
    },
    emerald: {
      border: 'border-emerald-100',
      bg: 'from-emerald-50 via-white to-white',
      accent: 'bg-emerald-100 text-emerald-700',
      glow: 'bg-emerald-200/40',
      value: 'text-slate-900',
    },
    amber: {
      border: 'border-amber-100',
      bg: 'from-amber-50 via-white to-white',
      accent: 'bg-amber-100 text-amber-700',
      glow: 'bg-amber-200/40',
      value: 'text-slate-900',
    },
  } as const;
  const theme = tones[tone] ?? tones.slate;
  const displayValue = typeof value === 'number' ? value.toLocaleString() : value;

  return (
    <div className={`relative overflow-hidden rounded-2xl border ${theme.border} bg-gradient-to-br ${theme.bg} p-4 shadow-sm`}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          {label}
        </div>
        {icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-full ${theme.accent}`}>
            {icon}
          </span>
        )}
      </div>
      <div className={`mt-3 text-2xl font-semibold ${theme.value}`}>{displayValue}</div>
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full blur-2xl ${theme.glow}`}
      />
    </div>
  );
}
