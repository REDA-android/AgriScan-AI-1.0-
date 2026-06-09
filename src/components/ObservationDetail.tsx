import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, MapPin, Calendar, Trash2, RefreshCw, Save, Info, CheckCircle2, AlertCircle, Clock, ChevronRight, ChevronLeft, Maximize2, Edit2, X, Share2, Download as QrDownload } from 'lucide-react';
import QRCode from 'qrcode';
import { Observation } from '../types';

interface ObservationDetailProps {
  observation: Observation;
  onBack: () => void;
  onDelete: (id: string) => void;
  onReset: (id: string) => void;
  onSaveNotes: (id: string, notes: string) => void;
  t: any;
}

const ObservationDetail: React.FC<ObservationDetailProps> = ({
  observation,
  onBack,
  onDelete,
  onReset,
  onSaveNotes,
  t
}) => {
  const [notes, setNotes] = React.useState(observation.userNotes || '');
  const [isEditingNotes, setIsEditingNotes] = React.useState(false);
  const [currentImageIndex, setCurrentImageIndex] = React.useState(0);
  const [qrCodeDataUrl, setQrCodeDataUrl] = React.useState<string>('');
  const images = observation.imageUrls || [observation.imageUrl];

  React.useEffect(() => {
    // Determine sharing/linking URL for specific botanical observation
    const url = `${window.location.origin}?observationId=${observation.id}`;
    QRCode.toDataURL(url, {
      width: 250,
      margin: 2,
      color: {
        dark: '#0f172a', // elegant slate-900 line color
        light: '#ffffff'
      }
    })
      .then(u => setQrCodeDataUrl(u))
      .catch(err => console.error("Error generating QR code", err));
  }, [observation.id]);

  const handleSave = () => {
    onSaveNotes(observation.id, notes);
    setIsEditingNotes(false);
  };

  const getStatusBadge = () => {
    switch (observation.status) {
      case 'completed':
        return <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase tracking-wider"><CheckCircle2 className="w-3 h-3" /> {t.success}</span>;
      case 'error':
        return <span className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-[10px] font-bold rounded-full uppercase tracking-wider"><AlertCircle className="w-3 h-3" /> {t.error}</span>;
      case 'analyzing':
        return <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full uppercase tracking-wider animate-pulse"><Clock className="w-3 h-3" /> {t.pending}</span>;
      default:
        return <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-[10px] font-bold rounded-full uppercase tracking-wider">{observation.status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b px-4 py-3 flex items-center justify-between">
        <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors">
          <ArrowLeft className="w-6 h-6 text-gray-900" />
        </button>
        <div className="text-center flex-grow px-4">
          <h1 className="text-lg font-black text-gray-900 truncate tracking-tight">
            {observation.variety || observation.culture || t.observationDetails}
          </h1>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">
            {observation.domain}
          </p>
        </div>
        <div className="flex gap-1">
          <button 
            onClick={() => onDelete(observation.id)}
            className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Image Gallery */}
      <div className="relative aspect-square bg-black overflow-hidden shadow-inner">
        <AnimatePresence mode="wait">
          <motion.img
            key={images[currentImageIndex]}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            src={images[currentImageIndex]}
            alt="Observation"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </AnimatePresence>
        
        {images.length > 1 && (
          <>
            <button 
              onClick={() => setCurrentImageIndex(prev => (prev > 0 ? prev - 1 : images.length - 1))}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/20 backdrop-blur-md rounded-full text-white"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button 
              onClick={() => setCurrentImageIndex(prev => (prev < images.length - 1 ? prev + 1 : 0))}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/20 backdrop-blur-md rounded-full text-white"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <div 
                  key={i} 
                  className={`h-1.5 rounded-full transition-all ${i === currentImageIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/40'}`} 
                />
              ))}
            </div>
          </>
        )}
        
        <div className="absolute top-4 right-4">
          {getStatusBadge()}
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 -mt-6 relative z-10 space-y-4">
        {/* Quick Info Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border p-5 space-y-4">
          <div className="flex justify-between items-center border-b pb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-50 rounded-xl">
                <Calendar className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t.recent}</p>
                <p className="text-sm font-black text-gray-900">
                  {observation.capturedAt && !isNaN(Date.parse(observation.capturedAt))
                    ? new Date(observation.capturedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                    : (observation.createdAt?.toDate ? observation.createdAt.toDate().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('fr-FR'))}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">BBCH</p>
              <p className="text-lg font-black text-green-600">{observation.bbchDominant || '--'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t.family}</p>
              <p className="text-sm font-bold text-gray-900">{observation.family || '--'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Espèce</p>
              <p className="text-sm font-bold text-gray-900">{observation.species || '--'}</p>
            </div>
          </div>
        </div>

        {/* AI Analysis Section */}
        {observation.status === 'completed' && (
          <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Info className="w-5 h-5 text-blue-500" />
                {t.analysis}
              </h2>
              <button 
                onClick={() => onReset(observation.id)}
                className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-all"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-sm text-gray-700 leading-relaxed italic">
                  "{observation.description}"
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">Fleurs</p>
                  <p className="text-xl font-black text-blue-600">{observation.organCounts?.flowers ?? 0}</p>
                </div>
                <div className="p-3 bg-orange-50/50 rounded-xl border border-orange-100">
                  <p className="text-[10px] font-bold text-orange-400 uppercase tracking-wider mb-1">Fruits</p>
                  <p className="text-xl font-black text-orange-600">{observation.organCounts?.fruits ?? 0}</p>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Traits Phénotypiques</h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Couleur', value: observation.phenotypicTraits?.color },
                    { label: 'Forme', value: observation.phenotypicTraits?.shape },
                    { label: 'Taille', value: observation.phenotypicTraits?.size },
                    { label: 'Santé', value: observation.phenotypicTraits?.healthStatus },
                  ].map((trait, i) => (
                    <div key={i} className="flex justify-between items-center p-2 bg-white border rounded-lg">
                      <span className="text-[10px] font-bold text-gray-400 uppercase">{trait.label}</span>
                      <span className="text-xs font-bold text-gray-900">{trait.value || 'Non spécifié'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {observation.phenotypicTraits?.diseasesOrDeficiencies && Array.isArray(observation.phenotypicTraits.diseasesOrDeficiencies) && observation.phenotypicTraits.diseasesOrDeficiencies.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-black text-red-400 uppercase tracking-widest">Alertes Sanitaires</h3>
                  <div className="flex flex-wrap gap-2">
                    {observation.phenotypicTraits.diseasesOrDeficiencies.map((d, i) => (
                      <span key={i} className="px-2 py-1 bg-red-50 text-red-600 text-[10px] font-bold rounded-md border border-red-100">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Share & QR Code Card */}
        <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-4">
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 border-b pb-2">
            <Share2 className="w-4 h-4 text-emerald-600" />
            Code QR de Terrain
          </h2>
          <div className="flex flex-col items-center justify-center text-center space-y-3">
            <p className="text-[11px] text-gray-500 leading-normal max-w-xs">
              Scannez ce code QR pour ouvrir instantanément cette fiche botanique sur un autre appareil mobile.
            </p>
            {qrCodeDataUrl ? (
              <div className="p-2 bg-white border border-gray-100 rounded-xl shadow-inner inline-block">
                <img src={qrCodeDataUrl} alt="Code QR de l'observation" className="w-36 h-36" />
              </div>
            ) : (
              <div className="w-36 h-36 bg-gray-50 animate-pulse rounded-xl border border-dashed flex items-center justify-center text-[10px] text-gray-400">
                Génération en cours...
              </div>
            )}
            <div className="flex gap-2 w-full max-w-xs justify-center">
              <button
                onClick={() => {
                  const url = `${window.location.origin}?observationId=${observation.id}`;
                  navigator.clipboard.writeText(url)
                    .then(() => alert("Lien d'observation copié !"))
                    .catch(() => alert("Échec de la copie."));
                }}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
              >
                Copier le lien
              </button>
              {qrCodeDataUrl && (
                <a
                  href={qrCodeDataUrl}
                  download={`agroscan_qr_${observation.id}.png`}
                  className="px-3 py-1.5 bg-green-50 border border-green-100 hover:bg-green-100 text-green-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                >
                  <QrDownload className="w-3.5 h-3.5" /> Télécharger
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Agronomist Notes */}
        <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-orange-500" />
              {t.notes}
            </h2>
            {!isEditingNotes ? (
              <button 
                onClick={() => setIsEditingNotes(true)}
                className="text-xs font-bold text-blue-600"
              >
                Modifier
              </button>
            ) : (
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsEditingNotes(false)}
                  className="p-1 text-gray-400"
                >
                  <X className="w-5 h-5" />
                </button>
                <button 
                  onClick={handleSave}
                  className="p-1 text-green-600"
                >
                  <Save className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>

          {isEditingNotes ? (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-32 p-3 bg-orange-50/30 border border-orange-100 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all"
              placeholder="Saisissez vos observations terrain ici..."
            />
          ) : (
            <div className="p-4 bg-orange-50/30 rounded-xl border border-orange-100 min-h-[80px]">
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {observation.userNotes || "Aucune note pour le moment."}
              </p>
            </div>
          )}
        </div>

        {/* Technical Details Grid (Field Ops) */}
        <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-4">
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">Données Opérationnelles</h2>
          <div className="grid grid-cols-2 gap-y-4 gap-x-8">
            {[
              { label: 'Date Plantation', value: observation.plantingDate },
              { label: 'Obtenteur', value: observation.breeder },
              { label: 'Date Taille', value: observation.pruningDate },
              { label: 'Quantité Récolte', value: observation.harvestQuantity },
              { label: 'Densité', value: observation.density },
              { label: 'Fermeté Fruit', value: observation.fruitFirmness },
            ].map((item, i) => (
              <div key={i} className="space-y-0.5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{item.label}</p>
                <p className="text-xs font-bold text-gray-900">{item.value || '--'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ObservationDetail;
