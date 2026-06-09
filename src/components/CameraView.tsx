import exifr from 'exifr';
import { Camera, Image as ImageIcon, MapPin, Upload, X, WifiOff, CheckCircle, Plus, Play, ChevronDown, ChevronUp, Sliders, Check, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useRef, useState, useEffect, ChangeEvent } from 'react';

import { compressImage } from '../utils/imageUtils';
import { triggerHaptic } from '../utils/haptics';

export interface CaptureMetadata {
  lat?: number;
  lng?: number;
  date?: string;
  variety: string;
  culture?: string;
  domain?: string;
  notes?: string;
  plantingDate?: string;
  breeder?: string;
  pruningDate?: string;
  harvestQuantity?: string;
  density?: string;
  fruitFirmness?: string;
  defects?: string;
}

export interface ProcessedImage {
  blob: Blob;
  dataUrl: string;
  mimeType: string;
}

interface CameraViewProps {
  onCapture: (input: File[] | ProcessedImage[], metadata: CaptureMetadata) => void;
  isOnline: boolean;
  onOpenMapPicker: () => void;
  manualLocation: { lat: number; lng: number } | null;
  offlineQueueCount?: number;
}

// Convolution-based image sharpening on a 2D canvas context
const applyFiltersToImage = (
  originalPreview: string,
  contrastVal: number,
  saturationVal: number,
  sharpnessVal: number
): Promise<{ dataUrl: string; blob: Blob }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = originalPreview;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Canvas context is null"));
        return;
      }
      canvas.width = img.width;
      canvas.height = img.height;

      // Apply CSS Filters in canvas context for high rendering speed
      ctx.filter = `contrast(${contrastVal}%) saturate(${saturationVal}%)`;
      ctx.drawImage(img, 0, 0);

      // Programmatic 3x3 sharpening convolution if sharpness is positive
      if (sharpnessVal > 0) {
        const mix = sharpnessVal / 100;
        const width = canvas.width;
        const height = canvas.height;
        
        // Edge sharpening weights kernel
        const weights = [
          0, -1, 0,
          -1, 4 + 1 / mix, -1,
          0, -1, 0
        ];
        
        const srcData = ctx.getImageData(0, 0, width, height);
        const dstData = ctx.createImageData(width, height);
        const src = srcData.data;
        const dst = dstData.data;
        
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const dstOff = (y * width + x) * 4;
            let r = 0, g = 0, b = 0;
            
            for (let cy = 0; cy < 3; cy++) {
              for (let cx = 0; cx < 3; cx++) {
                const scy = y + cy - 1;
                const scx = x + cx - 1;
                
                if (scy >= 0 && scy < height && scx >= 0 && scx < width) {
                  const srcOff = (scy * width + scx) * 4;
                  const wt = weights[cy * 3 + cx];
                  r += src[srcOff] * wt;
                  g += src[srcOff + 1] * wt;
                  b += src[srcOff + 2] * wt;
                }
              }
            }
            
            const normVal = 1 / (4 + 1 / mix - 4);
            dst[dstOff] = Math.min(255, Math.max(0, r * normVal));
            dst[dstOff + 1] = Math.min(255, Math.max(0, g * normVal));
            dst[dstOff + 2] = Math.min(255, Math.max(0, b * normVal));
            dst[dstOff + 3] = src[dstOff + 3]; // original alpha
          }
        }
        ctx.putImageData(dstData, 0, 0);
      }

      canvas.toBlob((blob) => {
        if (blob) {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              dataUrl: reader.result as string,
              blob: blob
            });
          };
          reader.readAsDataURL(blob);
        } else {
          reject(new Error("Blob extraction failed"));
        }
      }, "image/jpeg", 0.85);
    };
    img.onerror = (e) => reject(e);
  });
};

export default function CameraView({ onCapture, isOnline, onOpenMapPicker, manualLocation, offlineQueueCount }: CameraViewProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  
  const [files, setFiles] = useState<{ file: File, preview: string, blob: Blob }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationSource, setLocationSource] = useState<'gps' | 'exif' | null>(null);
  const [offlineQueue, setOfflineQueue] = useState<number>(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Filter & photo-tuning states
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [tempContrast, setTempContrast] = useState(100);
  const [tempSaturation, setTempSaturation] = useState(100);
  const [tempSharpness, setTempSharpness] = useState(0);
  const [isFilterApplying, setIsFilterApplying] = useState(false);

  // Form state
  const [variety, setVariety] = useState('');
  const [culture, setCulture] = useState('');
  const [domain, setDomain] = useState('');
  const [notes, setNotes] = useState('');
  const [plantingDate, setPlantingDate] = useState('');
  const [breeder, setBreeder] = useState('');
  const [pruningDate, setPruningDate] = useState('');
  const [harvestQuantity, setHarvestQuantity] = useState('');
  const [density, setDensity] = useState('');
  const [fruitFirmness, setFruitFirmness] = useState('');
  const [defects, setDefects] = useState('');

  const [exifDate, setExifDate] = useState<string | undefined>(undefined);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Only set GPS if we haven't already set EXIF location
          setCurrentLocation(prev => {
            if (locationSource === 'exif') return prev;
            setLocationSource('gps');
            return {
              lat: position.coords.latitude,
              lng: position.coords.longitude
            };
          });
        },
        (error) => console.warn("Geolocation error:", error),
        { enableHighAccuracy: true }
      );
    }

    if (offlineQueueCount !== undefined) {
      setOfflineQueue(offlineQueueCount);
    } else {
      const queue = JSON.parse(localStorage.getItem('agroscan_offline_queue') || '[]');
      setOfflineQueue(queue.length);
    }
  }, [locationSource, offlineQueueCount]);

  useEffect(() => {
    if (offlineQueueCount !== undefined) {
      setOfflineQueue(offlineQueueCount);
    }
  }, [offlineQueueCount]);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles: File[] = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      setIsProcessing(true);
      
      // Extract EXIF from the first file if available
      if (files.length === 0) {
        try {
          const exifData = await exifr.parse(selectedFiles[0], { gps: true, exif: true });
          if (exifData) {
            if (exifData.latitude && exifData.longitude) {
              setCurrentLocation({ lat: exifData.latitude, lng: exifData.longitude });
              setLocationSource('exif');
            }
            if (exifData.DateTimeOriginal) {
              setExifDate(exifData.DateTimeOriginal.toISOString());
            }
          }
        } catch (exifError) {
          console.warn("No EXIF data found", exifError);
        }
      }
      
      try {
        const newFiles = [];
        // Process sequentially to avoid memory crashes on mobile
        for (const file of selectedFiles) {
          try {
            const { dataUrl, blob } = await compressImage(file, 1600, 1600, 0.85);
            newFiles.push({ file, preview: dataUrl, blob });
          } catch (compressError) {
            console.error("Compression failed for file", file.name, compressError);
            // Fallback
            const fallbackPreview = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = (ev) => resolve(ev.target?.result as string);
              reader.readAsDataURL(file);
            });
            const fallbackBlob = await (await fetch(fallbackPreview)).blob();
            newFiles.push({ file, preview: fallbackPreview, blob: fallbackBlob });
          }
        }

        setFiles(prev => [...prev, ...newFiles]);
        triggerHaptic('light');
      } catch (error) {
        console.error("Error processing files:", error);
        alert("Erreur lors du traitement des images.");
      } finally {
        setIsProcessing(false);
      }
    }
    // Reset input
    if (e.target) e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => {
      const newFiles = prev.filter((_, i) => i !== index);
      if (newFiles.length === 0) {
        setLocationSource(null);
        setExifDate(undefined);
      }
      return newFiles;
    });
  };

  const handleAnalyze = async () => {
    if (files.length === 0 || !variety.trim()) return;
    
    setIsProcessing(true);
    
    const firstFile = files[0].file;
    
    let latitude = manualLocation?.lat || currentLocation?.lat;
    let longitude = manualLocation?.lng || currentLocation?.lng;
    let date = exifDate;

    const metadata: CaptureMetadata = {
      lat: latitude,
      lng: longitude,
      date,
      variety: variety.trim(),
      culture: culture.trim() || undefined,
      domain: domain.trim() || undefined,
      notes: notes.trim() || undefined,
      plantingDate: plantingDate.trim() || undefined,
      breeder: breeder.trim() || undefined,
      pruningDate: pruningDate.trim() || undefined,
      harvestQuantity: harvestQuantity.trim() || undefined,
      density: density.trim() || undefined,
      fruitFirmness: fruitFirmness.trim() || undefined,
      defects: defects.trim() || undefined,
    };

    // Pass the compressed data to onCapture
    const processedImages: ProcessedImage[] = files.map(f => ({
      blob: f.blob,
      dataUrl: f.preview,
      mimeType: f.file.type
    }));
    
    onCapture(processedImages, metadata);
    setIsProcessing(false);
    setFiles([]);
    setVariety('');
    setCulture('');
    setDomain('');
    setNotes('');
    setPlantingDate('');
    setBreeder('');
    setPruningDate('');
    setHarvestQuantity('');
    setDensity('');
    setFruitFirmness('');
    setDefects('');
    setExifDate(undefined);
    setLocationSource(null);
  };

  return (
    <div className="space-y-6">
      {/* Image Gallery / Upload Area */}
      <div className="bg-[#161c18] rounded-2xl p-4 shadow-none border border-white/5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-200">Photos ({files.length})</h3>
          {files.length > 0 && (
            <div className="flex gap-2">
              <button 
                onClick={() => cameraInputRef.current?.click()}
                className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition-colors flex items-center gap-1 text-xs font-bold"
              >
                <Camera size={16} />
                Prendre
              </button>
              <button 
                onClick={() => galleryInputRef.current?.click()}
                className="p-2 bg-[#0d120f] text-slate-400 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-1 text-xs font-bold"
              >
                <Upload size={16} />
                Importer
              </button>
            </div>
          )}
        </div>

        <input 
          type="file" 
          ref={cameraInputRef} 
          onChange={handleFileChange} 
          accept="image/*" 
          capture="environment"
          className="hidden" 
        />
        <input 
          type="file" 
          ref={galleryInputRef} 
          onChange={handleFileChange} 
          accept="image/*" 
          multiple
          className="hidden" 
        />

        {files.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {files.map((f, i) => (
              <div 
                key={i} 
                onClick={() => {
                  setSelectedImageIndex(i);
                  // Initialize slider buffers
                  setTempContrast(100);
                  setTempSaturation(100);
                  setTempSharpness(0);
                }}
                className="relative aspect-square rounded-xl overflow-hidden border border-white/10 group cursor-pointer hover:ring-2 hover:ring-emerald-500 transition-all"
                title="Cliquer pour ajuster l'image"
              >
                <img src={f.preview} alt={`Preview ${i}`} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-[#0d120f]/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-[10px] font-black uppercase text-white bg-[#0d120f]/80 px-2 py-1 rounded-md tracking-wider flex items-center gap-1">
                    <Sliders size={10} /> Ajuster
                  </span>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(i);
                  }}
                  className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors z-10"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button 
              onClick={() => cameraInputRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center text-slate-400 hover:text-emerald-500 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-colors"
            >
              <Plus size={24} />
              <span className="text-[10px] font-bold mt-1">Ajouter</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <button 
              onClick={() => cameraInputRef.current?.click()}
              className="w-full aspect-[21/9] bg-emerald-500/10 rounded-xl border-2 border-dashed border-emerald-500/30 flex flex-col items-center justify-center text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              <Camera size={32} className="mb-2" />
              <span className="text-sm font-bold">Prendre une photo</span>
              <span className="text-xs text-emerald-400/70 mt-1">Utiliser l'appareil photo</span>
            </button>
            <button 
              onClick={() => galleryInputRef.current?.click()}
              className="w-full aspect-[21/9] bg-[#0d120f] rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center text-slate-400 hover:bg-white/5 transition-colors"
            >
              <Upload size={32} className="mb-2" />
              <span className="text-sm font-bold">Importer des photos</span>
              <span className="text-xs text-slate-400 mt-1">Depuis la galerie</span>
            </button>
          </div>
        )}
      </div>

      {/* Photo Filter Editor Modal Overlay */}
      <AnimatePresence>
        {selectedImageIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-[#161c18] rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="px-5 py-3 border-b flex justify-between items-center bg-[#0d120f]">
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-emerald-400" />
                  <span className="font-black text-xs text-slate-300 uppercase tracking-wider">Ajustements botaniques</span>
                </div>
                <button
                  onClick={() => setSelectedImageIndex(null)}
                  className="p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-slate-400"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 flex-1 overflow-y-auto space-y-5">
                <div className="relative aspect-square rounded-xl overflow-hidden bg-[#0d120f] border flex items-center justify-center">
                  <img
                    src={files[selectedImageIndex]?.preview}
                    alt="Tuning preview"
                    className="max-w-full max-h-full object-contain"
                    style={{
                      filter: `contrast(${tempContrast}%) saturate(${tempSaturation}%)`
                    }}
                  />
                  {tempSharpness > 0 && (
                    <span className="absolute bottom-2 right-2 px-2 py-0.5 bg-emerald-600/95 text-white text-[9px] font-black rounded uppercase tracking-widest">
                      Netteté +{tempSharpness}%
                    </span>
                  )}
                </div>

                <div className="space-y-4">
                  {/* Contrast */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <span>Contraste</span>
                      <span className="text-emerald-400">{tempContrast}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="180"
                      value={tempContrast}
                      onChange={(e) => setTempContrast(Number(e.target.value))}
                      className="w-full accent-emerald-600 cursor-pointer"
                    />
                  </div>

                  {/* Saturation */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <span>Saturation</span>
                      <span className="text-emerald-400">{tempSaturation}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="180"
                      value={tempSaturation}
                      onChange={(e) => setTempSaturation(Number(e.target.value))}
                      className="w-full accent-emerald-600 cursor-pointer"
                    />
                  </div>

                  {/* Sharpness */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <span>Netteté (Clarté)</span>
                      <span className="text-emerald-400">{tempSharpness}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={tempSharpness}
                      onChange={(e) => setTempSharpness(Number(e.target.value))}
                      className="w-full accent-emerald-600 cursor-pointer"
                    />
                    <p className="text-[9px] text-slate-400">
                      Améliore la visibilité des détails morphologiques fins pour l'intelligence artificielle.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="p-4 border-t bg-[#0d120f] flex gap-2">
                <button
                  onClick={() => setSelectedImageIndex(null)}
                  className="flex-1 py-2 text-xs font-bold bg-white/10 hover:bg-slate-300 text-slate-300 rounded-lg"
                >
                  Fermer
                </button>
                <button
                  disabled={isFilterApplying}
                  onClick={async () => {
                    if (selectedImageIndex === null) return;
                    setIsFilterApplying(true);
                    try {
                      const original = files[selectedImageIndex];
                      const result = await applyFiltersToImage(
                        original.preview,
                        tempContrast,
                        tempSaturation,
                        tempSharpness
                      );
                      
                      setFiles(prev => {
                        const copy = [...prev];
                        copy[selectedImageIndex] = {
                          file: original.file,
                          preview: result.dataUrl,
                          blob: result.blob
                        };
                        return copy;
                      });
                      
                      triggerHaptic('success');
                      setSelectedImageIndex(null);
                    } catch (err) {
                      console.error(err);
                      alert("Erreur de filtrage.");
                    } finally {
                      setIsFilterApplying(false);
                    }
                  }}
                  className="flex-1 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center gap-1 shadow"
                >
                  {isFilterApplying ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <>
                      <Check size={14} /> Appliquer
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Metadata Form */}
      <div className="bg-[#161c18] rounded-2xl p-4 shadow-none border border-white/5 space-y-4">
        <h3 className="font-bold text-slate-200 text-sm">Informations de l'observation</h3>
        
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Culture (Espèce principale)</label>
            <input 
              type="text" 
              value={culture}
              onChange={e => setCulture(e.target.value)}
              placeholder="Ex: Tomate, Poivron, Fraise..."
              className="w-full px-3 py-2 bg-[#0d120f] border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nom de la variété <span className="text-red-400">*</span></label>
            <input 
              type="text" 
              value={variety}
              onChange={e => setVariety(e.target.value)}
              placeholder="Ex: Tomate Marmande..."
              className="w-full px-3 py-2 bg-[#0d120f] border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Domaine / Site de production</label>
            <input 
              type="text" 
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="Ex: Parcelle Nord, Serre A..."
              className="w-full px-3 py-2 bg-[#0d120f] border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Notes générales</label>
            <textarea 
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Observations supplémentaires..."
              className="w-full px-3 py-2 bg-[#0d120f] border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 min-h-[60px]"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full py-2 text-xs font-bold text-emerald-400 uppercase tracking-wider border-t border-white/5 mt-2 pt-4"
          >
            Informations additionnelles (Facultatif)
            {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-3 overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Date de plantation</label>
                    <input 
                      type="date" 
                      value={plantingDate}
                      onChange={e => setPlantingDate(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0d120f] border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Date de Taille</label>
                    <input 
                      type="date" 
                      value={pruningDate}
                      onChange={e => setPruningDate(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0d120f] border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Obtenteur de la variété</label>
                  <input 
                    type="text" 
                    value={breeder}
                    onChange={e => setBreeder(e.target.value)}
                    placeholder="Ex: Vilmorin, Gautier..."
                    className="w-full px-3 py-2 bg-[#0d120f] border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Qté récoltée (Kg/pot)</label>
                    <input 
                      type="number" 
                      step="0.1"
                      value={harvestQuantity}
                      onChange={e => setHarvestQuantity(e.target.value)}
                      placeholder="Ex: 2.5"
                      className="w-full px-3 py-2 bg-[#0d120f] border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Densité</label>
                    <input 
                      type="text" 
                      value={density}
                      onChange={e => setDensity(e.target.value)}
                      placeholder="Ex: 3.5 pl/m²"
                      className="w-full px-3 py-2 bg-[#0d120f] border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Fermeté des fruits</label>
                  <input 
                    type="text" 
                    value={fruitFirmness}
                    onChange={e => setFruitFirmness(e.target.value)}
                    placeholder="Ex: Très ferme, molle..."
                    className="w-full px-3 py-2 bg-[#0d120f] border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Défauts qualitatifs observés</label>
                  <textarea 
                    value={defects}
                    onChange={e => setDefects(e.target.value)}
                    placeholder="Ex: Micro-fissures, coloration hétérogène..."
                    className="w-full px-3 py-2 bg-[#0d120f] border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 min-h-[60px]"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Action Button */}
      <button 
        onClick={handleAnalyze}
        disabled={files.length === 0 || isProcessing || !variety.trim()}
        className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isProcessing ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        ) : (
          <>
            <Play size={18} />
            Lancer l'analyse IA
          </>
        )}
      </button>

      {/* Status Badges */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 justify-center">
          {!isOnline && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-400 text-[10px] font-bold rounded-full">
              <WifiOff size={12} />
              HORS-LIGNE
            </div>
          )}
          {(currentLocation || manualLocation) && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded-full">
              <MapPin size={12} />
              {manualLocation ? 'GPS MANUEL' : (locationSource === 'exif' ? 'GPS EXIF' : 'GPS ACTIF')}
            </div>
          )}
        </div>
        <button 
          onClick={onOpenMapPicker}
          className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest hover:underline flex items-center justify-center gap-1"
        >
          <MapPin size={12} />
          {manualLocation ? 'Changer la position manuelle' : 'Définir la position manuellement'}
        </button>
      </div>

      <AnimatePresence>
        {offlineQueue > 0 && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <CheckCircle className="text-emerald-500" size={20} />
              <span className="text-xs font-medium text-emerald-400">
                {offlineQueue} photo(s) en attente de synchro
              </span>
            </div>
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

