import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, Plus, Grid3x3, Maximize, Trash2, Edit3, X, Check } from 'lucide-react'
import CameraFeed from '../components/CameraFeed'
import { api } from '../services/api'
import clsx from 'clsx'

const ZONES = ['Runway', 'Taxiway', 'Apron', 'Perimeter', 'Terminal', 'General']

const MODEL_TYPES = [
  { id: 'yolo', label: 'YOLOv8', desc: 'Fast, real-time detection', color: 'text-violet-400 border-violet-500/40 bg-violet-500/10' },
  { id: 'rtdetr', label: 'RT-DETR', desc: 'Transformer-based, high accuracy', color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' },
]

const ZONE_BADGE_COLORS = {
  Runway:    'text-red-400 border-red-500/40 bg-red-500/10',
  Taxiway:   'text-amber-400 border-amber-500/40 bg-amber-500/10',
  Apron:     'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
  Perimeter: 'text-blue-400 border-blue-500/40 bg-blue-500/10',
  Terminal:  'text-teal-400 border-teal-500/40 bg-teal-500/10',
  General:   'text-sky-400 border-sky-500/40 bg-sky-500/10',
}

function AddCameraModal({ open, onClose, onAdd }) {
  const [name, setName] = useState('')
  const [source, setSource] = useState('0')
  const [zone, setZone] = useState('General')
  const [isRunway, setIsRunway] = useState(false)
  const [modelType, setModelType] = useState('yolo')

  // Sync zone ↔ runway
  const handleZoneChange = (z) => {
    setZone(z)
    if (z === 'Runway') setIsRunway(true)
    if (z !== 'Runway' && isRunway) setIsRunway(false)
  }
  const handleRunwayToggle = (checked) => {
    setIsRunway(checked)
    if (checked) setZone('Runway')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    await onAdd({ name: name || 'Camera', source, zone, is_runway: isRunway, model_type: modelType })
    setName(''); setSource('0'); setZone('General'); setIsRunway(false); setModelType('yolo')
    onClose()
  }

  if (!open) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="glass-strong p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-sky-100">Add Camera</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-sky-800/60 text-sky-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-sky-400 mb-1.5 uppercase tracking-wider">Camera Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Runway South"
              className="w-full px-3 py-2.5 rounded-lg bg-sky-900/60 border border-sky-800/50 text-sky-200 text-sm focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 placeholder:text-sky-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-sky-400 mb-1.5 uppercase tracking-wider">
              Source <span className="text-sky-600">(webcam index, RTSP URL, or file path)</span>
            </label>
            <input
              type="text"
              value={source}
              onChange={e => setSource(e.target.value)}
              placeholder="0, rtsp://..., or /path/to/video.mp4"
              className="w-full px-3 py-2.5 rounded-lg bg-sky-900/60 border border-sky-800/50 text-sky-200 text-sm font-mono focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 placeholder:text-sky-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-sky-400 mb-1.5 uppercase tracking-wider">AI Model</label>
            <div className="grid grid-cols-2 gap-2">
              {MODEL_TYPES.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModelType(m.id)}
                  className={clsx(
                    'px-3 py-2.5 rounded-lg text-left transition-all border',
                    modelType === m.id ? m.color : 'bg-sky-900/40 text-sky-400 border-sky-800/30 hover:bg-sky-800/60'
                  )}
                >
                  <p className="text-xs font-semibold">{m.label}</p>
                  <p className="text-[10px] opacity-70 mt-0.5">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-sky-400 mb-1.5 uppercase tracking-wider">Zone</label>
            <div className="grid grid-cols-3 gap-2">
              {ZONES.map(z => (
                <button
                  key={z}
                  type="button"
                  onClick={() => handleZoneChange(z)}
                  className={clsx(
                    'px-3 py-2 rounded-lg text-xs font-medium transition-all border',
                    zone === z
                      ? (ZONE_BADGE_COLORS[z] || 'bg-accent-blue/20 text-accent-blue border-accent-blue/40')
                      : 'bg-sky-900/40 text-sky-400 border-sky-800/30 hover:bg-sky-800/60'
                  )}
                >
                  {z}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-3 p-3 rounded-lg bg-sky-900/40 border border-sky-800/30 cursor-pointer hover:bg-sky-800/40 transition-colors">
            <input
              type="checkbox"
              checked={isRunway}
              onChange={e => handleRunwayToggle(e.target.checked)}
              className="w-4 h-4 rounded border-sky-700 bg-sky-900 text-accent-blue focus:ring-accent-blue/30"
            />
            <div>
              <p className="text-sm font-medium text-sky-200">Designate as Runway Camera</p>
              <p className="text-xs text-sky-500">Enables zone polygon, intrusion detection, and approach alerts</p>
            </div>
          </label>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg bg-sky-800/40 text-sky-300 text-sm font-medium hover:bg-sky-800/60 transition-colors">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 px-4 py-2.5 rounded-lg bg-accent-blue text-white text-sm font-medium hover:bg-accent-blue/90 transition-colors">
              Add Camera
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}

export default function Cameras() {
  const [cameras, setCameras] = useState([])
  const [viewMode, setViewMode] = useState('grid') // grid | single
  const [expandedCam, setExpandedCam] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [zoneFilter, setZoneFilter] = useState('All')
  const [modelFilter, setModelFilter] = useState('All')

  const loadCameras = async () => {
    try {
      const data = await api.getCameras()
      setCameras(data)
    } catch (e) { /* */ }
  }

  useEffect(() => {
    loadCameras()
    const interval = setInterval(loadCameras, 5000)
    return () => clearInterval(interval)
  }, [])

  const filteredCameras = cameras.filter(cam => {
    if (zoneFilter !== 'All' && cam.zone !== zoneFilter) return false
    if (modelFilter !== 'All' && cam.model_type !== modelFilter) return false
    return true
  })

  const handleAdd = async (data) => {
    await api.addCamera(data)
    loadCameras()
  }

  const handleRemove = async (id) => {
    await api.removeCamera(id)
    loadCameras()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-2xl font-bold text-sky-100">Camera Monitoring</h2>
          <p className="text-sm text-sky-500 mt-0.5">{cameras.length} cameras configured</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Zone filter */}
          <select value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-sky-900/60 border border-sky-800/30 text-sky-300 text-xs focus:outline-none focus:border-accent-blue/40">
            <option value="All">All Zones</option>
            {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
          {/* Model filter */}
          <select value={modelFilter} onChange={e => setModelFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-sky-900/60 border border-sky-800/30 text-sky-300 text-xs focus:outline-none focus:border-accent-blue/40">
            <option value="All">All Models</option>
            <option value="yolo">YOLOv8</option>
            <option value="rtdetr">RT-DETR</option>
          </select>
          {/* View toggle */}
          <div className="flex items-center bg-sky-900/60 border border-sky-800/30 rounded-lg p-1">
            <button onClick={() => { setViewMode('grid'); setExpandedCam(null) }}
              className={clsx('p-1.5 rounded-md transition-colors', viewMode === 'grid' ? 'bg-accent-blue/20 text-accent-blue' : 'text-sky-500 hover:text-sky-300')}>
              <Grid3x3 className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('single')}
              className={clsx('p-1.5 rounded-md transition-colors', viewMode === 'single' ? 'bg-accent-blue/20 text-accent-blue' : 'text-sky-500 hover:text-sky-300')}>
              <Maximize className="w-4 h-4" />
            </button>
          </div>

          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-blue text-white text-sm font-medium hover:bg-accent-blue/90 transition-colors">
            <Plus className="w-4 h-4" />
            Add Camera
          </button>
        </div>
      </motion.div>

      {/* Camera Grid */}
      {filteredCameras.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass p-16 text-center">
          <Camera className="w-20 h-20 text-sky-800 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-sky-300 mb-2">No Cameras Connected</h3>
          <p className="text-sm text-sky-500 mb-6 max-w-md mx-auto">
            Add your first camera to begin real-time avian intrusion monitoring.
            Supports webcams, RTSP streams, and video files.
          </p>
          <button onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-accent-blue text-white font-medium hover:bg-accent-blue/90 transition-colors">
            <Plus className="w-5 h-5" />
            Add Your First Camera
          </button>
        </motion.div>
      ) : viewMode === 'single' ? (
        <div className="space-y-4">
          {/* Camera selector */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {filteredCameras.map(cam => (
              <button key={cam.id}
                onClick={() => setExpandedCam(cam.id)}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                  expandedCam === cam.id
                    ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/40'
                    : 'bg-sky-900/40 text-sky-400 border border-sky-800/30 hover:bg-sky-800/60'
                )}
              >
                <Camera className="w-3.5 h-3.5" />
                {cam.name}
                {cam.is_runway && <span className="text-[9px] bg-accent-blue/20 px-1.5 py-0.5 rounded-full">RWY</span>}
              </button>
            ))}
          </div>
          {/* Focused camera */}
          {(expandedCam ? filteredCameras.filter(c => c.id === expandedCam) : filteredCameras.slice(0, 1)).map(cam => (
            <CameraFeed key={cam.id} camera={cam} expanded />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence>
            {filteredCameras.map(cam => (
              <div key={cam.id} className="relative group">
                <CameraFeed camera={cam} />
                <button
                  onClick={() => handleRemove(cam.id)}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-500/20 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add Camera Modal */}
      <AnimatePresence>
        {showAdd && <AddCameraModal open={showAdd} onClose={() => setShowAdd(false)} onAdd={handleAdd} />}
      </AnimatePresence>
    </div>
  )
}
