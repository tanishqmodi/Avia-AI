// TestHistory: upload state lives here so an in-flight inference survives a
// tab switch (the component unmounts, but the fetch promise writing into this
// store does not). History is persisted to localStorage so past runs stick
// across reloads — image thumbnails are downscaled before storing to stay
// under browser quota.
//
// Per-user scoping: each logged-in user's history is stored under a separate
// localStorage key (`skyguard-upload:<userId>`) and IndexedDB blobs are keyed
// `<userId>:<entryId>`. `setUserContext` swaps which user's state is live —
// called from App.tsx when the auth user changes. Logged-out state stays
// in-memory only.
import { create } from 'zustand';
import { putBlob, getBlob, deleteBlob } from './uploadBlobStore';

export type MediaKind = 'image' | 'video';
export type Engine = 'yolo' | 'rtdetr' | 'auto';

export type ImageMeta = { kind: 'image'; count: number; model: string; avg_conf: number };
export type VideoMeta = {
  kind: 'video';
  total_detections: number;
  unique_tracks: number;
  total_alerts: number;
  avg_fps: number;
  duration: number;
  model: string;
};
export type Metadata = ImageMeta | VideoMeta;

export interface HistoryEntry {
  id: string;
  timestamp: number;
  kind: MediaKind;
  filename: string;
  fileSize: number;
  engine: Engine;
  metadata: Metadata;
  // For images this is a downscaled JPEG dataURL (<= ~150KB). For videos null —
  // encoded mp4 blobs are too large for localStorage.
  thumbnail: string | null;
}

interface UploadState {
  file: File | null;
  preview: string | null;
  kind: MediaKind | null;
  result: string | null;
  resultKind: MediaKind | null;
  metadata: Metadata | null;
  isProcessing: boolean;
  error: string | null;
  engine: Engine;
  // A nonce we bump when fresh input should scroll back into focus after
  // switching tabs and returning — small UX nicety.
  lastUpdate: number;

  history: HistoryEntry[];
  _activeUserId: string | null;

  applyFile: (file: File) => void;
  clearFile: () => void;
  setEngine: (e: Engine) => void;
  setError: (msg: string | null) => void;
  runInference: () => Promise<void>;
  deleteHistoryEntry: (id: string) => void;
  clearHistory: () => void;
  replayFromHistory: (id: string) => Promise<void>;
  setUserContext: (userId: string | null) => void;
}

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_HISTORY = 20;
const THUMB_MAX_DIM = 480;
const THUMB_QUALITY = 0.72;
const STORAGE_PREFIX = 'skyguard-upload';

type PersistedSnapshot = { history: HistoryEntry[]; engine: Engine };

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

function blobKey(userId: string | null, entryId: string): string {
  return userId ? `${userId}:${entryId}` : entryId;
}

function loadSnapshot(userId: string): PersistedSnapshot {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { history: [], engine: 'auto' };
    const parsed = JSON.parse(raw) as Partial<PersistedSnapshot>;
    return {
      history: Array.isArray(parsed.history) ? parsed.history : [],
      engine: (parsed.engine as Engine) || 'auto',
    };
  } catch {
    return { history: [], engine: 'auto' };
  }
}

function saveSnapshot(userId: string, snap: PersistedSnapshot) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(snap));
  } catch (err) {
    console.warn('TestHistory: failed to persist snapshot', err);
  }
}

function revoke(url: string | null) {
  if (url) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }
}

// Only object URLs need revoking. data: URLs are inert strings.
function revokeIfObject(url: string | null) {
  if (url && url.startsWith('blob:')) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

// Downscale an annotated image dataURL so history stays under localStorage quota.
async function makeImageThumbnail(dataUrl: string): Promise<string | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image load failed'));
      el.src = dataUrl;
    });
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    const scale = Math.min(1, THUMB_MAX_DIM / Math.max(w, h));
    const tw = Math.round(w * scale);
    const th = Math.round(h * scale);
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, tw, th);
    return canvas.toDataURL('image/jpeg', THUMB_QUALITY);
  } catch {
    return null;
  }
}

// Capture a poster frame from a video src (object URL) for history previews.
// Uses a hidden <video> element and draws a frame onto a canvas; bounded by a
// timeout so a misbehaving file can't hang history writes forever.
async function makeVideoThumbnail(src: string): Promise<string | null> {
  return new Promise(resolve => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    let settled = false;
    const settle = (val: string | null) => {
      if (settled) return;
      settled = true;
      try { video.removeAttribute('src'); video.load(); } catch { /* ignore */ }
      resolve(val);
    };
    const drawFrame = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        // Dimensions may be 0 if an event fires before the first frame is
        // actually decoded — return (without settling) and wait for the next.
        if (!w || !h) return;
        const scale = Math.min(1, THUMB_MAX_DIM / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return settle(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        settle(canvas.toDataURL('image/jpeg', THUMB_QUALITY));
      } catch {
        settle(null);
      }
    };
    // Hook the earliest-possible decoded-frame events. `loadeddata` /
    // `canplay` fire once the first frame is painted; `seeked` covers the
    // case where we nudged currentTime forward past an opening black frame.
    video.onloadeddata = drawFrame;
    video.oncanplay = drawFrame;
    video.onseeked = drawFrame;
    video.onloadedmetadata = () => {
      const t = Math.min(0.1, Math.max(0, (video.duration || 1) * 0.05));
      try { video.currentTime = t; } catch { /* draw on loadeddata */ }
    };
    video.onerror = () => settle(null);
    video.src = src;
    setTimeout(() => settle(null), 8000);
  });
}

export const useUploadStore = create<UploadState>()((set, get) => {
  const persistIfScoped = () => {
    const { _activeUserId, history, engine } = get();
    if (_activeUserId) saveSnapshot(_activeUserId, { history, engine });
  };

  return {
    file: null,
    preview: null,
    kind: null,
    result: null,
    resultKind: null,
    metadata: null,
    isProcessing: false,
    error: null,
    engine: 'auto',
    lastUpdate: 0,

    history: [],
    _activeUserId: null,

    applyFile: (selected: File) => {
      if (selected.size > MAX_UPLOAD_BYTES) {
        set({ error: `File exceeds ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.` });
        return;
      }
      const current = get();
      revoke(current.preview);
      revokeIfObject(current.result);
      const nextKind: MediaKind = selected.type.startsWith('video/') ? 'video' : 'image';
      set({
        file: selected,
        preview: URL.createObjectURL(selected),
        kind: nextKind,
        result: null,
        resultKind: null,
        metadata: null,
        error: null,
        lastUpdate: Date.now(),
      });
    },

    clearFile: () => {
      const current = get();
      revoke(current.preview);
      revokeIfObject(current.result);
      set({
        file: null,
        preview: null,
        kind: null,
        result: null,
        resultKind: null,
        metadata: null,
        error: null,
      });
    },

    setEngine: (e) => {
      set({ engine: e });
      persistIfScoped();
    },
    setError: (msg) => set({ error: msg }),

    runInference: async () => {
      const { file, kind, engine, isProcessing } = get();
      if (!file || !kind || isProcessing) return;

      set({ isProcessing: true, error: null });
      const formData = new FormData();
      formData.append('file', file);
      const endpoint = kind === 'video' ? '/api/upload/video' : '/api/upload/image';
      const url = `http://localhost:8000${endpoint}?model_type=${encodeURIComponent(engine)}`;

      try {
        const res = await fetch(url, { method: 'POST', body: formData });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(body || `Upload failed (${res.status})`);
        }
        const data = await res.json();
        let result: string | null = null;
        let meta: Metadata | null = null;

        if (kind === 'video') {
          if (data.video) {
            result = `data:video/mp4;base64,${data.video}`;
            meta = {
              kind: 'video',
              total_detections: data.total_detections ?? 0,
              unique_tracks: data.unique_tracks ?? 0,
              total_alerts: data.total_alerts ?? 0,
              avg_fps: data.avg_fps ?? 0,
              duration: data.duration ?? 0,
              model: data.model_used,
            };
          } else {
            throw new Error('Server returned no annotated video.');
          }
        } else {
          if (data.annotated) {
            result = `data:image/jpeg;base64,${data.annotated}`;
            meta = {
              kind: 'image',
              count: data.count,
              model: data.model_used,
              avg_conf: data.avg_confidence,
            };
          } else {
            throw new Error('Server returned no annotated output.');
          }
        }

        // TestHistory: convert the annotated payload to a Blob once and
        // reuse it for both (a) the poster frame and (b) IDB storage. The
        // annotated mp4 is known to be browser-decodable — we play it in
        // the Output panel — so using it for the poster is more reliable
        // than reading the original uploaded file, whose codec the
        // browser may not support for seek/draw.
        let blob: Blob | null = null;
        if (result) {
          try {
            blob = await dataUrlToBlob(result);
          } catch (err) {
            console.warn('TestHistory: failed to convert annotated payload to blob', err);
          }
        }

        let thumbnail: string | null = null;
        if (kind === 'image' && result) {
          thumbnail = await makeImageThumbnail(result);
          if (!thumbnail && result.length < 400_000) thumbnail = result;
        } else if (kind === 'video' && blob) {
          const posterUrl = URL.createObjectURL(blob);
          try {
            thumbnail = await makeVideoThumbnail(posterUrl);
          } finally {
            try { URL.revokeObjectURL(posterUrl); } catch { /* ignore */ }
          }
        }

        const entry: HistoryEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          kind,
          filename: file.name,
          fileSize: file.size,
          engine,
          metadata: meta!,
          thumbnail,
        };

        // Scope the blob under the active user so it can't leak across users.
        const scopedUserId = get()._activeUserId;
        if (blob) {
          try {
            await putBlob(blobKey(scopedUserId, entry.id), blob);
          } catch (err) {
            console.warn('TestHistory: failed to persist annotated blob', err);
          }
        }

        // Trim IDB blobs for entries that will be evicted from the capped
        // history so we don't leak storage.
        const prevHistory = get().history;
        const trimmed = [entry, ...prevHistory].slice(0, MAX_HISTORY);
        const dropped = prevHistory.filter(h => !trimmed.find(t => t.id === h.id));
        for (const d of dropped) {
          deleteBlob(blobKey(scopedUserId, d.id)).catch(() => { /* ignore */ });
        }

        const prevResult = get().result;
        revokeIfObject(prevResult);
        set({
          result,
          resultKind: kind,
          metadata: meta,
          isProcessing: false,
          history: trimmed,
          lastUpdate: Date.now(),
        });
        persistIfScoped();
      } catch (e: any) {
        set({
          error: e?.message || 'Inference failed. Check that the server is reachable.',
          isProcessing: false,
        });
      }
    },

    deleteHistoryEntry: (id) => {
      const userId = get()._activeUserId;
      deleteBlob(blobKey(userId, id)).catch(() => { /* ignore */ });
      set(state => ({ history: state.history.filter(h => h.id !== id) }));
      persistIfScoped();
    },

    clearHistory: () => {
      const { history, _activeUserId } = get();
      // Only clear this user's blobs — other users' history must stay intact.
      for (const h of history) {
        deleteBlob(blobKey(_activeUserId, h.id)).catch(() => { /* ignore */ });
      }
      set({ history: [] });
      persistIfScoped();
    },

    replayFromHistory: async (id) => {
      const entry = get().history.find(h => h.id === id);
      if (!entry) return;

      const current = get();
      revoke(current.preview);
      revokeIfObject(current.result);

      // Show the analyzing overlay briefly while IDB reads the blob — for a
      // big annotated mp4 this can take a moment.
      set({
        file: null,
        preview: null,
        kind: entry.kind,
        result: null,
        resultKind: null,
        metadata: entry.metadata,
        isProcessing: true,
        error: null,
      });

      let objUrl: string | null = null;
      try {
        const userId = get()._activeUserId;
        let blob = await getBlob(blobKey(userId, entry.id));
        // Backwards compat: entries written before per-user keying were
        // stored under the raw entry id.
        if (!blob && userId) blob = await getBlob(entry.id);
        if (blob) objUrl = URL.createObjectURL(blob);
      } catch (err) {
        console.warn('TestHistory: failed to load annotated blob', err);
      }

      set({
        // Fall back to the stored thumbnail if the Blob is missing (e.g.
        // entry written before IDB wiring, or IDB evicted by the browser).
        result: objUrl ?? entry.thumbnail,
        resultKind: entry.kind,
        metadata: entry.metadata,
        isProcessing: false,
        lastUpdate: Date.now(),
      });
    },

    setUserContext: (userId) => {
      const prev = get()._activeUserId;
      if (prev === userId) return;

      // Save outgoing user's snapshot before swapping.
      if (prev) {
        saveSnapshot(prev, { history: get().history, engine: get().engine });
      }

      // Clear ephemeral UI (in-flight file/preview/result) so one user's
      // current test never leaks to the next. In-flight inference for the
      // outgoing user is abandoned by design — the fetch promise will still
      // resolve, but its setState lands into the new user's context and
      // will be discarded by the next setUserContext if they log in later.
      const current = get();
      revoke(current.preview);
      revokeIfObject(current.result);

      if (userId) {
        const snap = loadSnapshot(userId);
        set({
          _activeUserId: userId,
          history: snap.history,
          engine: snap.engine,
          file: null,
          preview: null,
          kind: null,
          result: null,
          resultKind: null,
          metadata: null,
          isProcessing: false,
          error: null,
          lastUpdate: 0,
        });
      } else {
        set({
          _activeUserId: null,
          history: [],
          engine: 'auto',
          file: null,
          preview: null,
          kind: null,
          result: null,
          resultKind: null,
          metadata: null,
          isProcessing: false,
          error: null,
          lastUpdate: 0,
        });
      }
    },
  };
});
