import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload as UploadIcon, Image as ImageIcon, Play, Cpu, AlertTriangle, X, RotateCcw,
  History, Trash2, Film, RotateCw,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import DetectionLegend from '../components/ui/DetectionLegend';
import { useUploadStore, type HistoryEntry } from '../store/useUploadStore';

export default function Upload() {
  const {
    file, preview, kind,
    result, resultKind, metadata,
    isProcessing, error, engine,
    history,
    applyFile, clearFile, setEngine, runInference,
    deleteHistoryEntry, clearHistory, replayFromHistory,
  } = useUploadStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // TestHistory: when leaving the Upload page after a completed run, drop the
  // active result so coming back shows a clean slate — the history card below
  // keeps the run. Do NOT clear while a run is in flight (isProcessing); that
  // state must survive tab switches so the Output panel picks it back up.
  useEffect(() => {
    return () => {
      const s = useUploadStore.getState();
      if (!s.isProcessing && s.result) s.clearFile();
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) applyFile(f);
    e.target.value = '';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) applyFile(f);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 overflow-y-auto custom-scrollbar"
    >
      <div className="p-8 max-w-6xl mx-auto">
        <PageHeader
          kicker="Inference tools"
          title="Upload & Infer"
          description="Run detection on a single image or video. Annotated output is returned inline with confidence metrics."
          icon={<UploadIcon size={18} />}
          actions={
            file && (
              <Button variant="ghost" leftIcon={<RotateCcw size={14} />} onClick={clearFile}>
                Reset
              </Button>
            )
          }
        />

        <div className="mb-6">
          <DetectionLegend />
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
              exit={{ opacity: 0, height: 0 }}
              role="alert"
              className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-2"
            >
              <AlertTriangle size={14} /> {error}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`card p-6 flex flex-col cursor-pointer transition-all ${
              isDragging ? 'border-cyan-400/60 bg-cyan-500/[0.05]' : 'hover:border-white/15'
            }`}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Source media drop zone"
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <input
              type="file"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,video/*"
            />
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="label-kicker mb-1">Source</div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <ImageIcon size={14} className="text-cyan-300" /> Media input
                </h2>
              </div>
              {file && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    clearFile();
                  }}
                  className="text-white/40 hover:text-white transition-colors p-1 rounded"
                  aria-label="Remove selected file"
                  title="Remove"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex-1 relative border-2 border-dashed border-white/10 rounded-lg min-h-[340px] flex flex-col items-center justify-center gap-3 overflow-hidden bg-black/40">
              {preview ? (
                kind === 'video' ? (
                  <video
                    src={preview}
                    controls
                    muted
                    playsInline
                    onClick={e => e.stopPropagation()}
                    className="absolute inset-0 w-full h-full object-contain bg-black"
                  />
                ) : (
                  <img src={preview} alt="Upload preview" className="absolute inset-0 w-full h-full object-contain" />
                )
              ) : (
                <>
                  <div className={`w-14 h-14 rounded-full border flex items-center justify-center transition-colors ${
                    isDragging
                      ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-300'
                      : 'bg-white/[0.02] border-white/10 text-white/40'
                  }`}>
                    <UploadIcon size={22} />
                  </div>
                  <p className="text-sm text-white/70 font-medium">
                    {isDragging ? 'Release to upload' : 'Drag & drop or click to browse'}
                  </p>
                  <p className="text-[11px] text-white/40 mono-data uppercase tracking-widest">
                    Images · Videos · Max 50MB
                  </p>
                </>
              )}
            </div>
            {file && (
              <div className="mt-3 text-xs text-white/50 flex items-center justify-between mono-data">
                <span className="truncate max-w-[70%]">{file.name}</span>
                <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            )}
          </div>

          <div className="card p-6 flex flex-col">
            <div className="mb-4">
              <div className="label-kicker mb-1">Output</div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Cpu size={14} className="text-cyan-300" /> Inference result
              </h2>
            </div>
            <div className="flex-1 bg-black/50 border border-white/10 rounded-lg flex flex-col relative overflow-hidden min-h-[340px]">
              {isProcessing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 z-20">
                  <div className="w-10 h-10 border-2 border-cyan-400/60 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-white/90">Analyzing scene...</span>
                  <span className="text-[10px] text-white/40 mono-data uppercase tracking-widest">
                    safe to switch tabs — run continues in background
                  </span>
                </div>
              )}
              {result ? (
                <>
                  <div className="flex-1 relative min-h-0">
                    {resultKind === 'video' ? (
                      <video
                        src={result}
                        controls
                        playsInline
                        className="absolute inset-0 w-full h-full object-contain bg-black"
                      />
                    ) : (
                      <img src={result} alt="Inference result" className="absolute inset-0 w-full h-full object-contain" />
                    )}
                  </div>
                  {metadata && metadata.kind === 'image' && (
                    <div className="grid grid-cols-3 border-t border-white/10 bg-black/70">
                      <div className="p-3 border-r border-white/10">
                        <div className="label-kicker">Targets</div>
                        <div className="mono-data text-lg font-semibold text-white mt-0.5">{metadata.count}</div>
                      </div>
                      <div className="p-3 border-r border-white/10">
                        <div className="label-kicker">Avg. confidence</div>
                        <div className="mono-data text-lg font-semibold text-cyan-300 mt-0.5">{(metadata.avg_conf * 100).toFixed(1)}%</div>
                      </div>
                      <div className="p-3">
                        <div className="label-kicker">Model</div>
                        <div className="mono-data text-lg font-semibold text-white mt-0.5 uppercase">{metadata.model}</div>
                      </div>
                    </div>
                  )}
                  {metadata && metadata.kind === 'video' && (
                    <div className="grid grid-cols-4 border-t border-white/10 bg-black/70">
                      <div className="p-3 border-r border-white/10">
                        <div className="label-kicker">Detections</div>
                        <div className="mono-data text-lg font-semibold text-white mt-0.5">{metadata.total_detections}</div>
                      </div>
                      <div className="p-3 border-r border-white/10">
                        <div className="label-kicker">Tracks</div>
                        <div className="mono-data text-lg font-semibold text-cyan-300 mt-0.5">{metadata.unique_tracks}</div>
                      </div>
                      <div className="p-3 border-r border-white/10">
                        <div className="label-kicker">Alerts</div>
                        <div className="mono-data text-lg font-semibold text-white mt-0.5">{metadata.total_alerts}</div>
                      </div>
                      <div className="p-3">
                        <div className="label-kicker">Avg FPS</div>
                        <div className="mono-data text-lg font-semibold text-white mt-0.5">{metadata.avg_fps}</div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
                  <Cpu size={22} className="text-white/20" />
                  <span className="text-sm text-white/40">Output appears here after inference</span>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2">
                <span className="label-kicker">Engine</span>
                <div role="radiogroup" aria-label="Inference engine" className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
                  {(['auto', 'yolo', 'rtdetr'] as const).map(opt => (
                    <button
                      key={opt}
                      type="button"
                      role="radio"
                      aria-checked={engine === opt}
                      onClick={() => setEngine(opt)}
                      disabled={isProcessing}
                      title={
                        opt === 'auto'
                          ? 'Auto: runs YOLO and RT-DETR, merges with safety-aware NMS (recommended for high-stakes review)'
                          : opt === 'yolo'
                            ? 'YOLOv8 only — fastest'
                            : 'RT-DETR only — better small-object recall'
                      }
                      className={`px-3 h-8 rounded-md text-[11px] uppercase tracking-widest transition-colors ${
                        engine === opt
                          ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-400/40'
                          : 'text-white/55 hover:text-white border border-transparent'
                      } disabled:opacity-50`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                variant="primary"
                size="lg"
                onClick={runInference}
                disabled={!file}
                loading={isProcessing}
                leftIcon={!isProcessing ? <Play size={14} /> : undefined}
              >
                {isProcessing ? 'Analyzing...' : 'Execute inference'}
              </Button>
            </div>
          </div>
        </div>

        {/* TestHistory: past runs persist to localStorage (thumbnail + metadata) */}
        <div className="mt-8 card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="label-kicker mb-1">Previous runs</div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <History size={14} className="text-cyan-300" /> Test History
                {history.length > 0 && (
                  <span className="ml-1 text-[11px] font-normal text-white/50 mono-data">
                    {history.length} {history.length === 1 ? 'entry' : 'entries'}
                  </span>
                )}
              </h2>
            </div>
            {history.length > 0 && (
              confirmClear ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/60">Clear all?</span>
                  <Button
                    variant="danger"
                    size="sm"
                    leftIcon={<Trash2 size={12} />}
                    onClick={() => { clearHistory(); setConfirmClear(false); }}
                  >
                    Yes, clear
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Trash2 size={12} />}
                  onClick={() => setConfirmClear(true)}
                >
                  Clear history
                </Button>
              )
            )}
          </div>

          {history.length === 0 ? (
            <div className="py-8 text-center text-sm text-white/40 border border-dashed border-white/10 rounded-lg">
              No runs yet. Completed inferences will appear here.
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {history.map(entry => (
                <HistoryCard
                  key={entry.id}
                  entry={entry}
                  onReplay={() => replayFromHistory(entry.id)}
                  onDelete={() => deleteHistoryEntry(entry.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function HistoryCard({
  entry,
  onReplay,
  onDelete,
}: {
  entry: HistoryEntry;
  onReplay: () => void;
  onDelete: () => void;
}) {
  const when = new Date(entry.timestamp);
  const detailLine =
    entry.metadata.kind === 'image'
      ? `${entry.metadata.count} target${entry.metadata.count === 1 ? '' : 's'} · ${(entry.metadata.avg_conf * 100).toFixed(1)}% avg`
      : `${entry.metadata.total_detections} det · ${entry.metadata.unique_tracks} tracks · ${entry.metadata.total_alerts} alerts`;

  return (
    <li className="border border-white/10 rounded-lg overflow-hidden bg-black/30 hover:border-white/20 transition-colors flex flex-col">
      <div className="relative aspect-video bg-black/60 flex items-center justify-center border-b border-white/10">
        {entry.thumbnail ? (
          <img src={entry.thumbnail} alt="" className="absolute inset-0 w-full h-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-white/30">
            {entry.kind === 'video' ? <Film size={22} /> : <ImageIcon size={22} />}
            <span className="text-[10px] uppercase tracking-widest mono-data">
              preview unavailable
            </span>
          </div>
        )}
        <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-widest mono-data bg-black/70 border border-white/10 text-white/80">
          {entry.kind}
        </span>
        <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-widest mono-data bg-cyan-500/15 border border-cyan-400/30 text-cyan-200">
          {entry.engine}
        </span>
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm text-white font-medium truncate" title={entry.filename}>
              {entry.filename}
            </div>
            <div className="text-[11px] text-white/45 mono-data">
              {when.toLocaleDateString()} · {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
        <div className="text-xs text-white/70">{detailLine}</div>
        <div className="text-[11px] text-white/40 uppercase tracking-widest mono-data">
          {entry.metadata.model} · {(entry.fileSize / 1024 / 1024).toFixed(2)} MB
        </div>
        <div className="flex items-center justify-between gap-2 pt-2 mt-auto border-t border-white/5">
          <button
            onClick={onReplay}
            className="inline-flex items-center gap-1.5 text-xs text-cyan-300 hover:text-cyan-200 transition-colors"
            title="Load into result panel"
          >
            <RotateCw size={12} /> View
          </button>
          <button
            onClick={onDelete}
            className="text-white/40 hover:text-red-300 transition-colors p-1 rounded hover:bg-red-500/10"
            aria-label="Delete from history"
            title="Delete from history"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </li>
  );
}
