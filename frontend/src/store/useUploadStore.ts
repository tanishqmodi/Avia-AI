// TestHistory: upload state lives here so an in-flight inference survives a
// tab switch (the component unmounts, but the fetch promise writing into this
// store does not). History is persisted to the backend so the same user sees
// the same runs across browsers and devices.
//
// Per-user scoping: the server filters /api/uploads/history by the bearer
// token's user. `setUserContext(userId)` triggers a fresh load on user
// change. Logged-out state stays in-memory only.
import { create } from 'zustand';
import { api } from '../services/api';

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
  // Downscaled JPEG dataURL (~150KB) returned by the server. Always present
  // for images; usually present for videos (poster frame captured client-side
  // before upload).
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
const THUMB_MAX_DIM = 480;
const THUMB_QUALITY = 0.72;

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

// Downscale an annotated image dataURL so the thumbnail stays small for the
// history list (sent inline as base64).
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

export const useUploadStore = create<UploadState>()((set, get) => {
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

    setEngine: (e) => set({ engine: e }),
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

        // Convert annotated payload to a Blob once, used for both the local
        // playback object URL and the upload to /api/uploads/history.
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

        // Swap the inline base64 result for an object URL backed by the same
        // bytes. Lighter to render, and matches the replay-from-history path.
        let resultForUi: string | null = result;
        if (blob) {
          revokeIfObject(get().result);
          resultForUi = URL.createObjectURL(blob);
        }

        // Persist to server. If this fails the user still sees the result for
        // this session, but it won't appear in history anywhere else.
        let savedEntry: HistoryEntry | null = null;
        if (blob && get()._activeUserId) {
          try {
            const fd = new FormData();
            fd.append('kind', kind);
            fd.append('filename', file.name);
            fd.append('file_size', String(file.size));
            fd.append('engine', engine);
            fd.append('metadata', JSON.stringify(meta));
            if (thumbnail) fd.append('thumbnail', thumbnail);
            const ext = kind === 'video' ? 'mp4' : 'jpg';
            const mime = kind === 'video' ? 'video/mp4' : 'image/jpeg';
            fd.append('media', new File([blob], `annotated.${ext}`, { type: mime }));
            savedEntry = await api.saveUploadHistory(fd) as HistoryEntry;
          } catch (err) {
            console.warn('TestHistory: failed to save run to server', err);
          }
        }

        const prevHistory = get().history;
        const nextHistory = savedEntry ? [savedEntry, ...prevHistory] : prevHistory;

        set({
          result: resultForUi,
          resultKind: kind,
          metadata: meta,
          isProcessing: false,
          history: nextHistory,
          lastUpdate: Date.now(),
        });
      } catch (e: any) {
        set({
          error: e?.message || 'Inference failed. Check that the server is reachable.',
          isProcessing: false,
        });
      }
    },

    deleteHistoryEntry: (id) => {
      // Optimistic UI; if the server call fails the next list refresh will
      // resync.
      set(state => ({ history: state.history.filter(h => h.id !== id) }));
      api.deleteUploadHistory(id).catch(err => {
        console.warn('TestHistory: server delete failed', err);
      });
    },

    clearHistory: () => {
      set({ history: [] });
      api.clearUploadHistory().catch(err => {
        console.warn('TestHistory: server clear failed', err);
      });
    },

    replayFromHistory: async (id) => {
      const entry = get().history.find(h => h.id === id);
      if (!entry) return;

      const current = get();
      revoke(current.preview);
      revokeIfObject(current.result);

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
        const blob = await api.fetchUploadHistoryMedia(entry.id);
        objUrl = URL.createObjectURL(blob);
      } catch (err) {
        console.warn('TestHistory: failed to fetch annotated media', err);
      }

      set({
        // Fall back to the stored thumbnail if the media fetch failed.
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

      // Clear ephemeral UI (in-flight file/preview/result) so one user's
      // current test never leaks to the next.
      const current = get();
      revoke(current.preview);
      revokeIfObject(current.result);

      set({
        _activeUserId: userId,
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

      if (userId) {
        api.listUploadHistory()
          .then(rows => {
            // Guard against a fast user switch: only apply if the active user
            // is still the one we kicked the request off for.
            if (get()._activeUserId !== userId) return;
            set({ history: rows as HistoryEntry[] });
          })
          .catch(err => {
            console.warn('TestHistory: failed to load history from server', err);
          });
      }
    },
  };
});
