import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload as UploadIcon, Image, Film, X, Bird, Radar,
  Download, Loader2, CheckCircle2, BarChart3, AlertTriangle,
} from 'lucide-react'
import clsx from 'clsx'

export default function Upload() {
  const [mode, setMode] = useState('image') // image | video
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [modelType, setModelType] = useState('yolo')
  const fileRef = useRef(null)

  const accept = mode === 'image'
    ? '.jpg,.jpeg,.png,.bmp,.webp'
    : '.mp4,.avi,.mov,.mkv'

  const handleFile = (f) => {
    if (!f) return
    setFile(f)
    setResult(null)
    if (mode === 'image') {
      const reader = new FileReader()
      reader.onload = (e) => setPreview(e.target.result)
      reader.readAsDataURL(f)
    } else {
      setPreview(URL.createObjectURL(f))
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }

  const handleAnalyze = async () => {
    if (!file) return
    setLoading(true)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const endpoint = mode === 'image' ? '/api/upload/image' : '/api/upload/video'
      const res = await fetch(`${endpoint}?conf=0.25&iou=0.45&model_type=${modelType}`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      setResult(data)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  const handleReset = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
  }

  const handleDownloadImage = () => {
    if (!result?.annotated) return
    const link = document.createElement('a')
    link.href = `data:image/jpeg;base64,${result.annotated}`
    link.download = `skyguard_detected_${file.name}`
    link.click()
  }

  const handleDownloadVideo = () => {
    if (!result?.video) return
    const byteChars = atob(result.video)
    const byteArr = new Uint8Array(byteChars.length)
    for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i)
    const blob = new Blob([byteArr], { type: 'video/mp4' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `skyguard_tracked_${file.name}`
    link.click()
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-2xl font-bold text-sky-100">Upload & Analyze</h2>
        <p className="text-sm text-sky-500 mt-0.5">
          Upload images or videos for AI-powered bird detection and tracking
        </p>
      </motion.div>

      {/* Mode + Model Toggle */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex flex-wrap items-center gap-4"
      >
        <div className="flex gap-2 p-1.5 rounded-2xl bg-[rgba(10,18,36,0.6)] border border-sky-800/20 w-fit">
          {[
            { id: 'image', icon: Image, label: 'Image Detection' },
            { id: 'video', icon: Film, label: 'Video Tracking' },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => { setMode(id); handleReset() }}
              className={clsx(
                'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300',
                mode === id
                  ? 'bg-gradient-to-r from-blue-600/90 to-blue-500/90 text-white shadow-lg shadow-blue-500/20'
                  : 'text-sky-500 hover:text-sky-300 hover:bg-sky-900/30'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 p-1.5 rounded-2xl bg-[rgba(10,18,36,0.6)] border border-sky-800/20 w-fit">
          {[
            { id: 'yolo', label: 'YOLOv8', color: 'from-violet-600/90 to-violet-500/90 shadow-violet-500/20' },
            { id: 'rtdetr', label: 'RT-DETR', color: 'from-emerald-600/90 to-emerald-500/90 shadow-emerald-500/20' },
          ].map(({ id, label, color }) => (
            <button
              key={id}
              onClick={() => setModelType(id)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300',
                modelType === id
                  ? `bg-gradient-to-r ${color} text-white shadow-lg`
                  : 'text-sky-500 hover:text-sky-300 hover:bg-sky-900/30'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Upload Zone */}
      {!file && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={clsx('upload-zone p-12 text-center cursor-pointer relative overflow-hidden', dragOver && 'drag-over')}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />

          <div className="relative z-10">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center float">
              <UploadIcon className="w-8 h-8 text-blue-400" />
            </div>
            <p className="text-lg font-semibold text-sky-200 mb-2">
              {dragOver ? 'Drop file here' : 'Drag & drop or click to browse'}
            </p>
            <p className="text-sm text-sky-600">
              {mode === 'image'
                ? 'Supports JPG, PNG, BMP, WebP'
                : 'Supports MP4, AVI, MOV, MKV'
              }
            </p>
            <p className="text-xs text-sky-700 mt-3">
              Files are processed locally on the server with {modelType === 'rtdetr' ? 'RT-DETR' : 'YOLOv8'}
            </p>
          </div>

          {/* Decorative gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.02] to-cyan-500/[0.02] pointer-events-none" />
        </motion.div>
      )}

      {/* File Selected — Preview + Actions */}
      {file && !result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {mode === 'image' ? <Image className="w-5 h-5 text-blue-400" /> : <Film className="w-5 h-5 text-blue-400" />}
              <div>
                <p className="text-sm font-medium text-sky-200">{file.name}</p>
                <p className="text-xs text-sky-600">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
            <button onClick={handleReset} className="p-2 rounded-xl hover:bg-sky-900/40 text-sky-500 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Preview */}
          <div className="rounded-xl overflow-hidden mb-6 bg-sky-950 relative">
            {mode === 'image' ? (
              <img src={preview} alt="Preview" className="w-full max-h-[500px] object-contain" />
            ) : (
              <video src={preview} controls className="w-full max-h-[500px]" />
            )}
          </div>

          {/* Analyze button */}
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className={clsx('btn-primary w-full flex items-center justify-center gap-2 py-3', loading && 'opacity-70 cursor-not-allowed')}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {mode === 'image' ? 'Detecting birds...' : 'Processing video with tracking...'}
              </>
            ) : (
              <>
                <Radar className="w-4 h-4" />
                {mode === 'image' ? 'Run Detection' : 'Run Detection + Tracking + RTDTER'}
              </>
            )}
          </button>

          {loading && mode === 'video' && (
            <p className="text-xs text-sky-600 text-center mt-3">
              Video processing may take a while depending on length. Hang tight...
            </p>
          )}
        </motion.div>
      )}

      {/* Results — Image */}
      {result && mode === 'image' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Birds Detected', value: result.count, icon: Bird, color: 'from-cyan-500/20 to-blue-500/20', text: 'text-cyan-400' },
              { label: 'Avg Confidence', value: `${(result.avg_confidence * 100).toFixed(1)}%`, icon: BarChart3, color: 'from-blue-500/20 to-indigo-500/20', text: 'text-blue-400' },
              { label: 'Max Confidence', value: `${(result.max_confidence * 100).toFixed(1)}%`, icon: CheckCircle2, color: 'from-emerald-500/20 to-teal-500/20', text: 'text-emerald-400' },
              { label: 'Min Confidence', value: `${(result.min_confidence * 100).toFixed(1)}%`, icon: AlertTriangle, color: 'from-amber-500/20 to-orange-500/20', text: 'text-amber-400' },
            ].map((m, i) => (
              <motion.div
                key={m.label}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="glass-card p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-semibold text-sky-500 uppercase tracking-wider">{m.label}</span>
                  <div className={clsx('p-2 rounded-xl bg-gradient-to-br', m.color)}>
                    <m.icon className={clsx('w-4 h-4', m.text)} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-sky-100">{m.value}</p>
              </motion.div>
            ))}
          </div>

          {/* Side by side images */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="glass-card overflow-hidden">
              <div className="px-4 py-3 border-b border-sky-800/20">
                <span className="text-xs font-semibold text-sky-400 uppercase tracking-wider">Original</span>
              </div>
              <img src={`data:image/jpeg;base64,${result.original}`} alt="Original" className="w-full" />
            </div>
            <div className="glass-card overflow-hidden glow-blue">
              <div className="px-4 py-3 border-b border-sky-800/20 flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Detected</span>
                <span className="text-[10px] font-mono text-sky-500">{result.count} birds</span>
              </div>
              <img src={`data:image/jpeg;base64,${result.annotated}`} alt="Detected" className="w-full" />
            </div>
          </div>

          {/* Detections table */}
          {result.detections?.length > 0 && (
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-3 border-b border-sky-800/20 flex items-center justify-between">
                <span className="text-xs font-semibold text-sky-400 uppercase tracking-wider">Detection Details</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sky-800/15">
                      {['#', 'X1', 'Y1', 'X2', 'Y2', 'Width', 'Height', 'Confidence'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-sky-600 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sky-800/10">
                    {result.detections.map((d) => (
                      <tr key={d.id} className="hover:bg-sky-900/20 transition-colors">
                        <td className="px-4 py-2 text-sky-300 font-medium">{d.id}</td>
                        <td className="px-4 py-2 text-sky-400 font-mono text-xs">{d.bbox[0]}</td>
                        <td className="px-4 py-2 text-sky-400 font-mono text-xs">{d.bbox[1]}</td>
                        <td className="px-4 py-2 text-sky-400 font-mono text-xs">{d.bbox[2]}</td>
                        <td className="px-4 py-2 text-sky-400 font-mono text-xs">{d.bbox[3]}</td>
                        <td className="px-4 py-2 text-sky-400 font-mono text-xs">{d.width}</td>
                        <td className="px-4 py-2 text-sky-400 font-mono text-xs">{d.height}</td>
                        <td className="px-4 py-2">
                          <span className={clsx(
                            'text-xs font-semibold px-2.5 py-1 rounded-full',
                            d.confidence > 0.7 ? 'bg-emerald-500/10 text-emerald-400' :
                            d.confidence > 0.4 ? 'bg-amber-500/10 text-amber-400' :
                            'bg-red-500/10 text-red-400'
                          )}>
                            {(d.confidence * 100).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={handleDownloadImage} className="btn-primary flex items-center gap-2">
              <Download className="w-4 h-4" /> Download Result
            </button>
            <button onClick={handleReset} className="btn-ghost flex items-center gap-2">
              <UploadIcon className="w-4 h-4" /> Upload Another
            </button>
          </div>
        </motion.div>
      )}

      {/* Results — Video */}
      {result && mode === 'video' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            {[
              { label: 'Frames', value: result.total_frames?.toLocaleString() },
              { label: 'Detections', value: result.total_detections?.toLocaleString() },
              { label: 'Avg FPS', value: result.avg_fps },
              { label: 'Unique Tracks', value: result.unique_tracks },
              { label: 'Alerts', value: result.total_alerts },
              { label: 'Duration', value: `${result.duration}s` },
            ].map((m, i) => (
              <motion.div
                key={m.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-card p-4 text-center"
              >
                <p className="text-[10px] font-semibold text-sky-500 uppercase tracking-wider mb-1">{m.label}</p>
                <p className="text-xl font-bold text-sky-100">{m.value}</p>
              </motion.div>
            ))}
          </div>

          {/* Processed video */}
          <div className="glass-card overflow-hidden glow-blue">
            <div className="px-5 py-3 border-b border-sky-800/20 flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Processed Video — Detection + Tracking + RTDTER</span>
            </div>
            <video
              src={`data:video/mp4;base64,${result.video}`}
              controls
              className="w-full"
            />
          </div>

          {/* Alert summary */}
          {result.alerts?.length > 0 && (
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-3 border-b border-sky-800/20">
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Alert Summary ({result.total_alerts} events)</span>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-sky-800/10">
                {result.alerts.map((a, i) => (
                  <div key={i} className="px-5 py-2.5 flex items-center gap-3 hover:bg-sky-900/20 transition-colors">
                    <span className={clsx(
                      'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase',
                      a.level === 'CRITICAL' ? 'bg-red-500/10 text-red-400' :
                      a.level === 'HIGH_RISK' ? 'bg-orange-500/10 text-orange-400' :
                      a.level === 'INTRUSION' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-blue-500/10 text-blue-400'
                    )}>{a.level}</span>
                    {a.track_id && <span className="text-[10px] font-mono text-sky-500 bg-sky-900/40 px-1.5 py-0.5 rounded">ID:{a.track_id}</span>}
                    <span className="text-xs text-sky-300 flex-1 truncate">{a.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={handleDownloadVideo} className="btn-primary flex items-center gap-2">
              <Download className="w-4 h-4" /> Download Video
            </button>
            <button onClick={handleReset} className="btn-ghost flex items-center gap-2">
              <UploadIcon className="w-4 h-4" /> Upload Another
            </button>
          </div>
        </motion.div>
      )}
    </div>
  )
}
