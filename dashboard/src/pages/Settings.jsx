import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Settings as SettingsIcon, Save, Camera, Cpu, Sliders, Shield, Trash2, Edit3, Check, X } from 'lucide-react'
import StatusBadge from '../components/StatusBadge'
import { api } from '../services/api'
import clsx from 'clsx'

const ZONES = ['Runway', 'Taxiway', 'Apron', 'Perimeter', 'Terminal', 'General']

function SliderInput({ label, value, onChange, min, max, step, unit, description }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-sky-300">{label}</label>
        <span className="text-sm font-mono text-accent-blue">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full bg-sky-800/60 appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-blue [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(59,130,246,0.4)]"
      />
      {description && <p className="text-xs text-sky-600">{description}</p>}
    </div>
  )
}

export default function Settings() {
  const [config, setConfig] = useState({})
  const [cameras, setCameras] = useState([])
  const [saved, setSaved] = useState(false)
  const [editingCam, setEditingCam] = useState(null)
  const [editName, setEditName] = useState('')
  const [editZone, setEditZone] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const [cfg, cams] = await Promise.all([api.getConfig(), api.getCameras()])
        setConfig(cfg)
        setCameras(cams)
      } catch (e) { /* */ }
    }
    load()
  }, [])

  const handleSave = async () => {
    try {
      await api.updateConfig(config)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) { /* */ }
  }

  const handleDeleteCam = async (id) => {
    await api.removeCamera(id)
    setCameras(prev => prev.filter(c => c.id !== id))
  }

  const handleEditCam = (cam) => {
    setEditingCam(cam.id)
    setEditName(cam.name)
    setEditZone(cam.zone)
  }

  const handleSaveCam = async (id) => {
    await api.updateCamera(id, { name: editName, zone: editZone })
    setCameras(prev => prev.map(c => c.id === id ? { ...c, name: editName, zone: editZone } : c))
    setEditingCam(null)
  }

  const handleToggleRunway = async (cam) => {
    await api.updateCamera(cam.id, { is_runway: !cam.is_runway })
    setCameras(prev => prev.map(c => c.id === cam.id ? { ...c, is_runway: !c.is_runway } : c))
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-2xl font-bold text-sky-100">Settings</h2>
          <p className="text-sm text-sky-500 mt-0.5">Configure detection, tracking, and camera settings</p>
        </div>
        <button onClick={handleSave}
          className={clsx(
            'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all',
            saved
              ? 'bg-accent-emerald/20 text-accent-emerald border border-accent-emerald/30'
              : 'bg-accent-blue text-white hover:bg-accent-blue/90'
          )}>
          {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved!' : 'Save Configuration'}
        </button>
      </motion.div>

      {/* Model Status */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass p-5">
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="w-4 h-4 text-accent-blue" />
          <h3 className="text-sm font-semibold text-sky-200 uppercase tracking-wider">AI Model Status</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* YOLO */}
          <div className="p-4 rounded-xl bg-violet-500/[0.04] border border-violet-500/15">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-violet-400 uppercase tracking-wider">YOLOv8</span>
              <StatusBadge variant="online" label="Online" />
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-sky-500">Weights</span><span className="text-sky-300 font-mono">best.pt</span></div>
              <div className="flex justify-between"><span className="text-sky-500">Tracker</span><span className="text-sky-300 font-mono">ByteTrack</span></div>
              <div className="flex justify-between"><span className="text-sky-500">Inference</span><span className="text-sky-300 font-mono">{config.imgsz || 640}px</span></div>
            </div>
          </div>
          {/* RT-DETR */}
          <div className="p-4 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/15">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">RT-DETR</span>
              <StatusBadge variant="online" label="Online" />
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-sky-500">Weights</span><span className="text-sky-300 font-mono">rtdetr-l.pt</span></div>
              <div className="flex justify-between"><span className="text-sky-500">Architecture</span><span className="text-sky-300 font-mono">Transformer</span></div>
              <div className="flex justify-between"><span className="text-sky-500">Inference</span><span className="text-sky-300 font-mono">{config.imgsz || 640}px</span></div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Detection Settings */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass p-5">
        <div className="flex items-center gap-2 mb-5">
          <Sliders className="w-4 h-4 text-accent-cyan" />
          <h3 className="text-sm font-semibold text-sky-200 uppercase tracking-wider">Detection & Tracking</h3>
        </div>
        <div className="space-y-5">
          <SliderInput
            label="Confidence Threshold"
            value={config.confidence_threshold || 0.25}
            onChange={v => setConfig(prev => ({ ...prev, confidence_threshold: v }))}
            min={0.05} max={0.95} step={0.05} unit=""
            description="Minimum confidence score for detections. Lower = more sensitive, higher = fewer false positives."
          />
          <SliderInput
            label="IOU Threshold"
            value={config.iou_threshold || 0.45}
            onChange={v => setConfig(prev => ({ ...prev, iou_threshold: v }))}
            min={0.1} max={0.95} step={0.05} unit=""
            description="Non-max suppression overlap threshold. Higher = allow more overlapping boxes."
          />
          <SliderInput
            label="Track Buffer"
            value={config.track_buffer || 30}
            onChange={v => setConfig(prev => ({ ...prev, track_buffer: Math.round(v) }))}
            min={10} max={120} step={5} unit=" frames"
            description="Frames to keep lost tracks alive. Higher = more stable IDs, lower = faster cleanup."
          />
        </div>
      </motion.div>

      {/* Alert Settings */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass p-5">
        <div className="flex items-center gap-2 mb-5">
          <Shield className="w-4 h-4 text-accent-amber" />
          <h3 className="text-sm font-semibold text-sky-200 uppercase tracking-wider">Alert Thresholds</h3>
        </div>
        <div className="space-y-5">
          <SliderInput
            label="Persistence Alert"
            value={config.persistence_sec || 3}
            onChange={v => setConfig(prev => ({ ...prev, persistence_sec: v }))}
            min={1} max={15} step={0.5} unit="s"
            description="Seconds a bird must remain in the zone before triggering HIGH RISK."
          />
          <SliderInput
            label="Density Threshold"
            value={config.density_threshold || 5}
            onChange={v => setConfig(prev => ({ ...prev, density_threshold: Math.round(v) }))}
            min={1} max={20} step={1} unit=" birds"
            description="Number of active birds that triggers a CRITICAL density alert."
          />
        </div>
      </motion.div>

      {/* Camera Management */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass p-5">
        <div className="flex items-center gap-2 mb-4">
          <Camera className="w-4 h-4 text-accent-emerald" />
          <h3 className="text-sm font-semibold text-sky-200 uppercase tracking-wider">Camera Management</h3>
        </div>

        {cameras.length === 0 ? (
          <p className="text-sm text-sky-500 py-4 text-center">No cameras configured. Add cameras from the Cameras page.</p>
        ) : (
          <div className="space-y-2">
            {cameras.map(cam => (
              <div key={cam.id} className="flex items-center gap-3 p-3 rounded-lg bg-sky-900/30 border border-sky-800/20">
                {editingCam === cam.id ? (
                  <>
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                      className="flex-1 px-2 py-1 rounded bg-sky-900/60 border border-sky-800/50 text-sky-200 text-sm" />
                    <select value={editZone} onChange={e => setEditZone(e.target.value)}
                      className="px-2 py-1 rounded bg-sky-900/60 border border-sky-800/50 text-sky-200 text-sm">
                      {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                    </select>
                    <button onClick={() => handleSaveCam(cam.id)} className="p-1 text-accent-emerald hover:bg-emerald-500/20 rounded">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingCam(null)} className="p-1 text-sky-500 hover:bg-sky-800/40 rounded">
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 text-sky-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-sky-200 font-medium">{cam.name}</p>
                      <p className="text-xs text-sky-500 font-mono truncate">{cam.source}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-sky-800/40 text-sky-400">{cam.zone}</span>
                    {cam.is_runway && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent-blue/15 text-accent-blue border border-accent-blue/30">RWY</span>
                    )}
                    <StatusBadge variant={cam.status === 'active' ? 'active' : 'inactive'} label={cam.status || 'active'} />
                    <button onClick={() => handleToggleRunway(cam)}
                      className={clsx('p-1 rounded transition-colors', cam.is_runway ? 'text-accent-blue hover:bg-blue-500/20' : 'text-sky-600 hover:bg-sky-800/40')}>
                      <Shield className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleEditCam(cam)} className="p-1 text-sky-500 hover:bg-sky-800/40 rounded">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeleteCam(cam.id)} className="p-1 text-red-400 hover:bg-red-500/20 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}
