import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, WifiOff, Plus, Trash2, AlertTriangle, CheckCircle2, X, Radio } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { useStore } from '../store/useStore';
import { useCameraStream } from '../hooks/useCameraStream';
import { api } from '../services/api';

function GridCameraFeed({ id, name, zone, model, onDelete }: { id: string; name: string; zone: string; model: string; onDelete: (id: string, name: string) => void }) {
  const { data, isConnected } = useCameraStream(id);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="card card-interactive overflow-hidden flex flex-col"
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex items-center">
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-red-400' : 'bg-slate-500'}`} />
            {isConnected && <span className="absolute inset-0 rounded-full bg-red-400/50 animate-ping" />}
          </span>
          <span className="text-sm font-medium text-white truncate">{name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] mono-data text-cyan-300/80 uppercase tracking-wider">{model}</span>
          <button
            onClick={() => onDelete(id, name)}
            className="text-white/30 hover:text-red-400 transition-colors p-1 rounded"
            aria-label={`Remove camera ${name}`}
            title="Remove sensor"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="relative bg-black/60 aspect-video">
        {data?.frame ? (
          <img src={`data:image/jpeg;base64,${data.frame}`} alt={`Feed ${name}`} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/30">
            <WifiOff size={18} />
            <span className="text-[10px] mono-data uppercase tracking-widest">No signal</span>
          </div>
        )}
        <div className="absolute top-2 left-2 text-[10px] mono-data text-cyan-300 bg-black/70 px-2 py-0.5 rounded border border-cyan-400/20">
          {zone.toUpperCase()}
        </div>
      </div>
    </motion.div>
  );
}

export default function Cameras() {
  const { cameras, fetchCameras } = useStore();
  const [isAdding, setIsAdding] = useState(false);

  const [newCamName, setNewCamName] = useState('');
  const [newCamSource, setNewCamSource] = useState('');
  const [newCamZone, setNewCamZone] = useState('Runway');
  const [newCamModel, setNewCamModel] = useState('yolo');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleAddCamera = async () => {
    if (!newCamName || !newCamSource) {
      setErrorMsg('Name and source are required.');
      return;
    }
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      await api.addCamera({
        name: newCamName,
        source: newCamSource,
        zone: newCamZone,
        is_runway: newCamZone === 'Runway',
        model_type: newCamModel,
      });
      await fetchCameras();
      setSuccessMsg('Sensor deployed successfully.');
      setNewCamName('');
      setNewCamSource('');
      setTimeout(() => {
        setSuccessMsg(null);
        setIsAdding(false);
      }, 1800);
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to deploy sensor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestDelete = (id: string, name: string) => setPendingDelete({ id, name });

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await api.deleteCamera(pendingDelete.id);
      await fetchCameras();
      setPendingDelete(null);
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to remove sensor.');
    } finally {
      setIsDeleting(false);
    }
  };

  const inputCls =
    'w-full bg-black/40 border border-white/10 rounded-lg px-3 h-10 text-sm text-white placeholder:text-white/30 focus:border-cyan-400/50 focus:bg-black/60 outline-none transition-colors';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 overflow-y-auto custom-scrollbar"
    >
      <div className="p-8 max-w-[1600px] mx-auto">
        <PageHeader
          kicker={`${cameras.length} deployed`}
          title="Sensor Array"
          description="Deploy, configure, and monitor every optical sensor feeding the detection pipeline."
          icon={<Camera size={18} />}
          actions={
            <Button
              variant={isAdding ? 'secondary' : 'primary'}
              leftIcon={isAdding ? <X size={14} /> : <Plus size={14} />}
              onClick={() => {
                setIsAdding(v => !v);
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              aria-expanded={isAdding}
            >
              {isAdding ? 'Cancel' : 'Deploy sensor'}
            </Button>
          }
        />

        <AnimatePresence>
          {isAdding && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginBottom: 0 }}
              animate={{ height: 'auto', opacity: 1, marginBottom: 24 }}
              exit={{ height: 0, opacity: 0, marginBottom: 0 }}
              className="overflow-hidden"
            >
              <section className="card p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="label-kicker mb-1">New sensor</div>
                    <h2 className="text-lg font-semibold text-white">Deployment</h2>
                  </div>
                  <Radio size={16} className="text-cyan-300" />
                </div>

                <AnimatePresence mode="wait">
                  {errorMsg && (
                    <motion.div
                      key="err"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      role="alert"
                      className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-2"
                    >
                      <AlertTriangle size={14} /> {errorMsg}
                    </motion.div>
                  )}
                  {successMsg && (
                    <motion.div
                      key="ok"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      role="status"
                      className="mb-4 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-center gap-2"
                    >
                      <CheckCircle2 size={14} /> {successMsg}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="cam-id" className="label-kicker">Name</label>
                    <input id="cam-id" value={newCamName} onChange={e => setNewCamName(e.target.value)} className={inputCls} placeholder="RNW-North" disabled={isSubmitting} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="cam-src" className="label-kicker">Source</label>
                    <input id="cam-src" value={newCamSource} onChange={e => setNewCamSource(e.target.value)} className={inputCls} placeholder="0 or rtsp://..." disabled={isSubmitting} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="cam-zone" className="label-kicker">Zone</label>
                    <select id="cam-zone" value={newCamZone} onChange={e => setNewCamZone(e.target.value)} className={inputCls + ' appearance-none'} disabled={isSubmitting}>
                      <option>Runway</option><option>Taxiway</option><option>Terminal</option><option>Perimeter</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="cam-engine" className="label-kicker">Engine</label>
                    <select id="cam-engine" value={newCamModel} onChange={e => setNewCamModel(e.target.value)} className={inputCls + ' appearance-none'} disabled={isSubmitting}>
                      <option value="yolo">YOLOv8</option><option value="rtdetr">RT-DETR</option>
                    </select>
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <Button
                    variant="primary"
                    onClick={handleAddCamera}
                    loading={isSubmitting}
                    leftIcon={!isSubmitting ? <Plus size={14} /> : undefined}
                  >
                    {isSubmitting ? 'Deploying...' : 'Confirm deployment'}
                  </Button>
                </div>
              </section>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence>
            {cameras.map(cam => (
              <GridCameraFeed
                key={cam.id}
                id={cam.id}
                name={cam.name}
                zone={cam.zone}
                model={cam.model_type}
                onDelete={requestDelete}
              />
            ))}
          </AnimatePresence>
          {cameras.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-16 gap-4 card border-dashed">
              <Camera size={32} className="text-white/20" />
              <div className="text-center">
                <div className="text-sm text-white/70">No sensors deployed</div>
                <div className="text-xs text-white/40 mt-1">Add your first camera to start monitoring</div>
              </div>
              <Button variant="primary" size="sm" leftIcon={<Plus size={12} />} onClick={() => setIsAdding(true)}>
                Deploy first sensor
              </Button>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {pendingDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <motion.div
              initial={{ scale: 0.95, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 8 }}
              className="card max-w-md w-full p-6 relative border border-red-500/20"
            >
              <button
                onClick={() => setPendingDelete(null)}
                className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
                aria-label="Cancel"
              >
                <X size={16} />
              </button>
              <div className="flex items-center gap-3 mb-3 text-red-300">
                <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-400/20 flex items-center justify-center">
                  <AlertTriangle size={16} />
                </div>
                <h3 id="delete-title" className="text-base font-semibold text-white">Decommission sensor</h3>
              </div>
              <p className="text-sm text-white/65 mb-6 leading-relaxed">
                Remove <span className="text-white font-medium">{pendingDelete.name}</span> from the optical array? This cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setPendingDelete(null)} disabled={isDeleting}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={confirmDelete} loading={isDeleting} leftIcon={!isDeleting ? <Trash2 size={14} /> : undefined}>
                  {isDeleting ? 'Removing...' : 'Remove sensor'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
