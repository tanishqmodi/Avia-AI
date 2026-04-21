import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings as SettingsIcon, Save, AlertTriangle, CheckCircle2, RotateCcw, Sliders, Cpu } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { api } from '../services/api';

interface Config {
  confidence_threshold: number;
  iou_threshold: number;
  default_model: string;
  alert_sensitivity: string;
  log_retention_days: number;
  inference_mode: string;
}

const DEFAULTS: Config = {
  confidence_threshold: 0.60,
  iou_threshold: 0.45,
  default_model: 'yolo',
  alert_sensitivity: 'Normal',
  log_retention_days: 30,
  inference_mode: 'hybrid',
};

export default function Settings() {
  const [config, setConfig] = useState<Config>(DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    setIsLoading(true);
    api
      .getSettings()
      .then(c => setConfig({ ...DEFAULTS, ...c }))
      .catch(() => setMsg({ type: 'error', text: 'Failed to load settings' }))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setMsg(null);
    try {
      await api.updateSettings(config);
      setMsg({ type: 'success', text: 'Configuration saved.' });
      setTimeout(() => setMsg(null), 3000);
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message || 'Failed to update configuration.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(DEFAULTS);
    setMsg({ type: 'success', text: 'Reverted to defaults. Save to apply.' });
    setTimeout(() => setMsg(null), 3000);
  };

  const inputCls =
    'w-full bg-black/40 border border-white/10 rounded-lg px-3 h-10 text-sm text-white focus:border-cyan-400/50 focus:bg-black/60 outline-none transition-colors';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 overflow-y-auto custom-scrollbar"
    >
      <div className="p-8 max-w-4xl mx-auto">
        <PageHeader
          kicker="System"
          title="Configuration"
          description="Tune detection thresholds, alerting sensitivity, and model defaults. Changes apply globally to new inferences."
          icon={<SettingsIcon size={18} />}
          actions={
            <Button variant="ghost" leftIcon={<RotateCcw size={14} />} onClick={handleReset} disabled={isLoading || isSaving}>
              Reset defaults
            </Button>
          }
        />

        <AnimatePresence>
          {msg && (
            <motion.div
              initial={{ opacity: 0, y: -4, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto', marginBottom: 16 }}
              exit={{ opacity: 0, y: -4, height: 0 }}
              role={msg.type === 'error' ? 'alert' : 'status'}
              className={`text-sm p-3 flex items-center gap-2 border rounded-lg ${
                msg.type === 'error'
                  ? 'bg-red-500/10 border-red-500/20 text-red-300'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              }`}
            >
              {msg.type === 'error' ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />} {msg.text}
            </motion.div>
          )}
        </AnimatePresence>

        {isLoading && (
          <div className="card p-4 flex items-center gap-3 text-sm text-white/60 mb-4">
            <div className="w-4 h-4 border-2 border-cyan-400/50 border-t-transparent rounded-full animate-spin" />
            Loading configuration...
          </div>
        )}

        <fieldset disabled={isLoading || isSaving} className="flex flex-col gap-5">
          <section className="card p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="label-kicker mb-1">Detection</div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Sliders size={16} className="text-cyan-300" /> Thresholds
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <label htmlFor="conf" className="text-sm text-white/70">Confidence threshold</label>
                  <span className="mono-data text-sm text-cyan-300">{(config.confidence_threshold * 100).toFixed(0)}%</span>
                </div>
                <input
                  id="conf"
                  type="range"
                  min="10"
                  max="100"
                  value={config.confidence_threshold * 100}
                  onChange={e => setConfig({ ...config, confidence_threshold: parseInt(e.target.value) / 100 })}
                  className="accent-cyan-400"
                />
                <p className="text-xs text-white/40 leading-relaxed">Minimum confidence required before a detection is surfaced.</p>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <label htmlFor="iou" className="text-sm text-white/70">IOU threshold</label>
                  <span className="mono-data text-sm text-cyan-300">{(config.iou_threshold * 100).toFixed(0)}%</span>
                </div>
                <input
                  id="iou"
                  type="range"
                  min="10"
                  max="100"
                  value={config.iou_threshold * 100}
                  onChange={e => setConfig({ ...config, iou_threshold: parseInt(e.target.value) / 100 })}
                  className="accent-cyan-400"
                />
                <p className="text-xs text-white/40 leading-relaxed">Overlap threshold for non-maximum suppression.</p>
              </div>
            </div>
          </section>

          <section className="card p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="label-kicker mb-1">Engine</div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Cpu size={16} className="text-cyan-300" /> Inference defaults
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="flex flex-col gap-2">
                <label htmlFor="default-model" className="text-sm text-white/70">Default model</label>
                <select id="default-model" value={config.default_model} onChange={e => setConfig({ ...config, default_model: e.target.value })} className={inputCls + ' appearance-none'}>
                  <option value="yolo">YOLOv8</option>
                  <option value="rtdetr">RT-DETR</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="mode" className="text-sm text-white/70">Inference mode</label>
                <select id="mode" value={config.inference_mode} onChange={e => setConfig({ ...config, inference_mode: e.target.value })} className={inputCls + ' appearance-none'}>
                  <option value="hybrid">Hybrid</option>
                  <option value="fast">Fast</option>
                  <option value="accurate">Accurate</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="sens" className="text-sm text-white/70">Alert sensitivity</label>
                <select id="sens" value={config.alert_sensitivity} onChange={e => setConfig({ ...config, alert_sensitivity: e.target.value })} className={inputCls + ' appearance-none'}>
                  <option>High</option>
                  <option>Normal</option>
                  <option>Low</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="retain" className="text-sm text-white/70">Log retention (days)</label>
                <input
                  id="retain"
                  type="number"
                  min={1}
                  max={365}
                  value={config.log_retention_days}
                  onChange={e => setConfig({ ...config, log_retention_days: Math.max(1, parseInt(e.target.value) || 1) })}
                  className={inputCls}
                />
              </div>
            </div>
          </section>
        </fieldset>

        <div className="flex justify-end mt-6">
          <Button
            variant="primary"
            size="lg"
            onClick={handleSave}
            loading={isSaving}
            disabled={isLoading}
            leftIcon={!isSaving ? <Save size={14} /> : undefined}
          >
            {isSaving ? 'Saving...' : 'Save configuration'}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
