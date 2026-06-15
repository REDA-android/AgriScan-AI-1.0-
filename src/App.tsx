import React, { useEffect, useState, useMemo, useCallback, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LogOut, Map as MapIcon, Plus, Search, Wind, Edit2, Save, RefreshCw, X, 
  TrendingUp, Calendar, Image as ImageIcon, Trash2, Globe, Cloud, Download, Upload,
  MapPin, User as UserIcon, Mail, Lock, AlertCircle, ArrowLeft, ChevronLeft,
  Book, Filter, Info, Maximize2, CheckSquare, Square, ChevronRight, Star, MessageSquare, Bot, Leaf, CheckCircle,
  Sun, Moon
} from 'lucide-react';
import * as XLSX from 'xlsx';

import { GoogleGenAI } from "@google/genai";
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType, signInWithGoogle, logout, uploadImage, registerWithEmail, loginWithEmail, resetPassword, testConnection, checkRedirectResult, isNetworkOfflineError } from './firebase';
import { Capacitor } from '@capacitor/core';
import { addDoc, collection, serverTimestamp, updateDoc, doc, deleteDoc, getDocFromServer, getDocs, setDoc, limit, query, where, orderBy, onSnapshot, getDocsFromServer, getDocsFromCache } from 'firebase/firestore';
import { analyzePlantImage, PlantAnalysis, clearAIInstance } from './services/geminiService';
import { triggerHaptic } from './utils/haptics';

import { 
  ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Line 
} from 'recharts';
import CameraView, { ProcessedImage } from './components/CameraView';
import MapView from './components/MapView';
import { ChatBot } from './components/ChatBot';
// Hooks & Utils
import { useUserProfile } from './hooks/useUserProfile';
import { useObservations } from './hooks/useObservations';
import { translations, AGRO_DOMAINS, CULTURES, MOROCCAN_REGIONS } from './constants';
import { compressImage, dataUrlToBlob } from './utils/imageUtils';
import { saveOfflineObservation, getOfflineObservations, deleteOfflineObservation, updateOfflineStatus, OfflineObservation } from './lib/db';

// Types
import { Observation, UserProfile, Location, BackgroundTask, WeatherData } from './types';




// Emit custom event for notifications
export const notifyUser = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app-notify', { detail: { message, type } }));
  }
};

const runBackgroundAnalysis = async (docId: string, images: any[], metadata: any, taskId?: string, setBackgroundTasks?: React.Dispatch<React.SetStateAction<any[]>>) => {
  try {
    console.log(`Starting background analysis for doc ${docId}...`);
    if (taskId && setBackgroundTasks) {
      setBackgroundTasks(prev => prev.map(t => t.id === taskId ? { ...t, progress: 30 } : t));
    }

    // 1. Call Gemini API with timeout (Increased to 120s)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Timeout: L'analyse IA a pris trop de temps.")), 120000)
    );
    
    const analysisPromise = analyzePlantImage(images);
    const result = await Promise.race([analysisPromise, timeoutPromise]) as any;
    
    console.log(`Analysis successful for doc ${docId}`, result);
    
    if (taskId && setBackgroundTasks) {
      setBackgroundTasks(prev => prev.map(t => t.id === taskId ? { ...t, progress: 90 } : t));
    }

    // Override analysis with user provided data if available
    if (metadata.variety) result.variety = metadata.variety;
    if (metadata.culture) result.culture = metadata.culture;

    // Single write for the final result
    await updateDoc(doc(db, 'observations', docId), {
      ...result,
      status: 'completed',
      description: "Analyse terminée avec succès.",
      analyzedAt: serverTimestamp()
    });
    
    notifyUser("Analyse IA terminée avec succès.", 'success');
    console.log(`Firestore updated for doc ${docId}`);
  } catch (error: any) {
    console.error(`Background analysis failed for doc ${docId}:`, error);
    let errorMessage = "L'analyse IA a échoué.";
    
    if (error.message?.includes("Timeout")) {
      errorMessage = "L'analyse IA a pris trop de temps. Veuillez réessayer.";
    } else if (error.message?.includes("Quota API dépassé") || error.message?.includes("RESOURCE_EXHAUSTED")) {
      errorMessage = "Quota Gemini épuisé : Vérifiez votre plafond de dépenses dans la console Google Cloud.";
    } else if (error.message?.includes("Limite de requêtes")) {
      errorMessage = "Trop de requêtes : Veuillez patienter une minute.";
    } else if (error.message?.includes("spending cap")) {
      errorMessage = "Limite de budget atteinte sur votre projet Google Cloud.";
    } else if (error.message?.includes("Clé API Gemini manquante")) {
      errorMessage = error.message;
    } else {
      errorMessage = "Erreur technique : " + (error.message || "Inconnue");
    }

    notifyUser(errorMessage, 'error');

    await updateDoc(doc(db, 'observations', docId), {
      status: 'error',
      species: "échec de l'analyse",
      description: errorMessage,
      error: error.message
    });
    throw error;
  }
};

interface WeatherInfo {
  locationName?: string;
  region?: string;
  current: {
    temp: number;
    tempMax: number;
    tempMin: number;
    humidity: number;
    windSpeed: number;
    condition: string;
    et0: number;
    dpv: number;
    par: number;
    precipQty: number;
    precipProb: number;
    airQuality: string;
    uvIndex?: number;
  };
  forecast: {
    date: string;
    tempMax: number;
    tempMin: number;
    tempAvg: number;
    humidity: number;
    et0: number;
    dpv: number;
    par: number;
    precipQty: number;
    precipProb: number;
    windSpeed: number;
    airQuality: string;
    condition: string;
    uvIndexMax?: number;
  }[];
}

function ObservationDetail({ observation, onClose, t, isArabic, isAdmin, onDelete, isDeleting, onRetry, onDownload, language }: { 
  observation: any, 
  onClose: () => void, 
  t: any, 
  isArabic: boolean,
  isAdmin: boolean,
  onDelete: (id: string) => void,
  isDeleting: string | null,
  onRetry: (id: string) => void,
  onDownload: (url: string, filename: string) => void,
  language: 'fr' | 'en' | 'ar'
}) {
  if (!observation) return null;

  const [currentIndex, setCurrentIndex] = useState(0);
  const images = (observation.imageUrls && Array.isArray(observation.imageUrls) && observation.imageUrls.length > 0)
    ? observation.imageUrls 
    : [observation.imageUrl || 'https://images.unsplash.com/photo-1463936575829-25148e1db1b8?w=800&auto=format&fit=crop'];

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const getWhatsAppLabel = () => {
    if (language === 'en') return 'Share on WhatsApp';
    if (language === 'ar') return 'مشاركة على واتساب';
    return 'Partager sur WhatsApp';
  };

  const handleShareWhatsApp = () => {
    const variety = observation.variety || (language === 'en' ? 'Unspecified variety' : language === 'ar' ? 'نوع غير محدد' : 'Variété non spécifiée');
    const culture = observation.culture || (language === 'en' ? 'Unspecified culture' : language === 'ar' ? 'ثقافة غير محددة' : 'Culture non spécifiée');
    const date = observation.capturedAt 
      ? new Date(observation.capturedAt).toLocaleDateString(language === 'ar' ? 'ar-EG' : language === 'en' ? 'en-US' : 'fr-FR') 
      : (observation.createdAt?.toDate ? observation.createdAt.toDate().toLocaleDateString(language === 'ar' ? 'ar-EG' : language === 'en' ? 'en-US' : 'fr-FR') : 'N/A');
    const status = observation.phenotypicTraits?.healthStatus || 'N/A';
    const diseases = observation.phenotypicTraits?.diseasesOrDeficiencies && Array.isArray(observation.phenotypicTraits.diseasesOrDeficiencies)
      ? observation.phenotypicTraits.diseasesOrDeficiencies.join(', ')
      : '';
    const location = observation.location ? `https://www.google.com/maps/search/?api=1&query=${observation.location.lat},${observation.location.lng}` : '';

    let text = "";
    if (language === 'en') {
      text += `🌱 *Plant Health Diagnosis* 🌱\n\n`;
      text += `*Plant/Variety:* ${variety}\n`;
      text += `*Culture:* ${culture}\n`;
      text += `*Date:* ${date}\n`;
      text += `*Health Status:* ${status}\n`;
      if (diseases) {
        text += `*Health Alerts:* ${diseases}\n`;
      }
      if (observation.bbchDominant) {
        text += `*BBCH Stage:* ${observation.bbchDominant}\n`;
      }
      if (observation.userNotes) {
        text += `*User Notes:* ${observation.userNotes}\n`;
      }
      if (location) {
        text += `📍 *Location:* ${location}\n`;
      }
      text += `\nShared via AgroScan application.`;
    } else if (language === 'ar') {
      text += `🌱 *تشخيص صحة النبات* 🌱\n\n`;
      text += `*النبات/الصنف:* ${variety}\n`;
      text += `*الزراعة:* ${culture}\n`;
      text += `*التاريخ:* ${date}\n`;
      text += `*الحالة الصحية:* ${status}\n`;
      if (diseases) {
        text += `*تنبيهات صحية:* ${diseases}\n`;
      }
      if (observation.bbchDominant) {
        text += `*مرحلة BBCH:* ${observation.bbchDominant}\n`;
      }
      if (observation.userNotes) {
        text += `*ملاحظات المستخدم:* ${observation.userNotes}\n`;
      }
      if (location) {
        text += `📍 *الموقع:* ${location}\n`;
      }
      text += `\nتمت المشاركة عبر تطبيق AgroScan.`;
    } else {
      text += `🌱 *Diagnostic de Santé du Végétal* 🌱\n\n`;
      text += `*Plante/Variété :* ${variety}\n`;
      text += `*Culture :* ${culture}\n`;
      text += `*Date :* ${date}\n`;
      text += `*État de santé :* ${status}\n`;
      if (diseases) {
        text += `*Alertes sanitaires :* ${diseases}\n`;
      }
      if (observation.bbchDominant) {
        text += `*Stade BBCH :* ${observation.bbchDominant}\n`;
      }
      if (observation.userNotes) {
        text += `*Notes utilisateur :* ${observation.userNotes}\n`;
      }
      if (location) {
        text += `📍 *Localisation :* ${location}\n`;
      }
      text += `\nPartagé via l'application AgroScan.`;
    }

    const encodedText = encodeURIComponent(text);
    const whatsappUrl = `https://wa.me/?text=${encodedText}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-[#161c18] flex flex-col"
      dir={isArabic ? 'rtl' : 'ltr'}
    >
      <header className="px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] border-b border-white/5 flex items-center gap-4 sticky top-0 bg-[#161c18] z-10">
        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
          <ChevronLeft size={24} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-200 truncate">{observation.variety || observation.culture || t.observationDetails || "Détails de l'observation"}</h2>
          {isAdmin && observation.isDeletedByCreator && (
            <p className="text-[8px] font-black text-red-400 uppercase tracking-widest flex items-center gap-1">
              <Trash2 size={10} /> Supprimé par l'utilisateur
            </p>
          )}
        </div>
        {(isAdmin || observation.userId === auth.currentUser?.uid) && (
          <button 
            onClick={() => onDelete(observation.id)}
            className={`p-2 rounded-xl transition-all ${isDeleting === observation.id ? 'bg-red-600 text-white' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'}`}
          >
            {isDeleting === observation.id ? <CheckSquare size={20} /> : <Trash2 size={20} />}
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-[calc(3rem+env(safe-area-inset-bottom))]">
        <div className="space-y-4">
          <div className="relative rounded-3xl overflow-hidden shadow-lg border border-white/5 bg-[#0d120f] min-h-[300px] flex items-center justify-center group">
            <AnimatePresence mode="wait">
              <motion.img 
                key={currentIndex}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                src={images[currentIndex]} 
                alt="" 
                className="w-full h-auto max-h-[70vh] object-contain" 
                referrerPolicy="no-referrer"
              />
            </AnimatePresence>
            
            {['pending', 'uploading', 'analyzing'].includes(observation.status) && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center text-white p-6 text-center">
                <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mb-4"></div>
                <h4 className="text-lg font-bold mb-2">
                  {observation.status === 'uploading' ? 'Téléversement des photos...' : 'Analyse IA en cours...'}
                </h4>
                <p className="text-sm opacity-80 max-w-xs">
                  {observation.description || "Veuillez patienter pendant que nous traitons votre observation."}
                </p>
              </div>
            )}

            {observation.status === 'error' && (
              <div className="absolute inset-0 bg-red-500/90 backdrop-blur-sm flex flex-col items-center justify-center text-white p-6 text-center">
                <AlertCircle size={48} className="mb-4" />
                <h4 className="text-lg font-bold mb-2">L'analyse a échoué</h4>
                <p className="text-sm opacity-80 max-w-xs mb-6">
                  {observation.description || "Une erreur technique est survenue lors de l'analyse."}
                </p>
                <button 
                  onClick={() => onRetry(observation.id)}
                  className="px-6 py-2 bg-[#161c18] text-red-400 rounded-full font-bold hover:bg-red-500/10 transition-colors"
                >
                  Ressayer l'analyse
                </button>
              </div>
            )}
            
            {images.length > 1 && (
              <>
                <button 
                  onClick={handlePrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-[#161c18]/80 backdrop-blur-md rounded-full shadow-md text-slate-200 hover:bg-[#161c18] transition-colors z-10"
                >
                  <ChevronLeft size={20} />
                </button>
                <button 
                  onClick={handleNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-[#161c18]/80 backdrop-blur-md rounded-full shadow-md text-slate-200 hover:bg-[#161c18] transition-colors z-10"
                >
                  <ChevronRight size={20} />
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-3 py-1 rounded-full z-10">
                  {currentIndex + 1} / {images.length}
                </div>
              </>
            )}

            <button 
              onClick={(e) => {
                e.stopPropagation();
                onDownload(images[currentIndex], `agroscan_${observation.id}_${currentIndex}.jpg`);
              }}
              className="absolute top-2 right-2 p-2 bg-[#161c18]/20 backdrop-blur-md border border-white/30 text-white rounded-full hover:bg-[#161c18]/40 transition-all z-10"
              title="Télécharger l'image"
            >
              <Download size={18} />
            </button>
          </div>
          
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {images.map((url: string, i: number) => (
                <button 
                  key={i} 
                  onClick={() => setCurrentIndex(i)}
                  className={`w-20 h-20 rounded-xl overflow-hidden border-2 flex-shrink-0 transition-all ${currentIndex === i ? 'border-emerald-500 scale-95 shadow-inner' : 'border-white/10'}`}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <section className="space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-2xl font-black text-slate-200 tracking-tight">{observation.variety || 'Variété non spécifiée'}</h3>
              <p className="text-sm font-bold text-emerald-400 uppercase tracking-widest">{observation.culture || observation.family || 'Culture non spécifiée'}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {observation.capturedAt ? new Date(observation.capturedAt).toLocaleDateString() : (observation.createdAt?.toDate ? observation.createdAt.toDate().toLocaleDateString() : 'N/A')}
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {observation.capturedAt ? new Date(observation.capturedAt).toLocaleTimeString() : (observation.createdAt?.toDate ? observation.createdAt.toDate().toLocaleTimeString() : 'N/A')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-[#0d120f] rounded-2xl border border-white/5">
              <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">{t.region}</p>
              <p className="text-xs font-bold text-slate-300">{observation.region || 'Non spécifié'}</p>
            </div>
            <div className="p-3 bg-[#0d120f] rounded-2xl border border-white/5">
              <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">{t.domain}</p>
              <p className="text-xs font-bold text-slate-300">{observation.domain || 'Non spécifié'}</p>
            </div>
          </div>

          <div className="mt-2">
            <button
              onClick={handleShareWhatsApp}
              className="w-full py-3 bg-[#25D366] hover:bg-[#20ba56] text-white rounded-full font-black flex items-center justify-center gap-2 shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.4.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.717-1.455L0 24zm6.59-4.846c1.6.95 3.1 1.4 4.8.195 5.4-3.1 9.394-4.912 9.398-11.13.002-5.05-4.059-9.157-9.055-9.159-5.003-.002-9.07 4.101-9.073 9.153-.001 2.01.522 3.98 1.51 5.7l-.993 3.633 3.714-.975zm11.367-5.541c-.247-.124-1.461-.72-1.685-.802-.224-.082-.388-.124-.552.124-.164.247-.635.802-.779.965-.143.164-.287.185-.534.062-.247-.124-1.044-.385-1.988-1.227-.735-.656-1.232-1.466-1.376-1.714-.143-.247-.015-.38.11-.502.112-.11.247-.287.371-.432.124-.143.165-.247.247-.412.082-.164.041-.31-.02-.432-.062-.124-.552-1.332-.756-1.823-.203-.488-.406-.412-.552-.42l-.471-.008c-.164 0-.432.062-.656.31-.224.247-.857.837-.857 2.041 0 1.204.877 2.367.999 2.533.123.164 1.725 2.634 4.181 3.693.584.252 1.04.403 1.396.516.587.186 1.12.16 1.543.097.472-.072 1.46-.597 1.666-1.174.206-.576.206-1.07.145-1.173-.06-.104-.224-.164-.471-.287z"/>
              </svg>
              {getWhatsAppLabel()}
            </button>
          </div>
        </section>

        {observation.bbchDominant && (
          <section className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <TrendingUp size={14} /> Phénologie (BBCH)
            </h4>
            <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-emerald-400 uppercase">Stade Dominant</span>
                <span className="text-sm font-black text-emerald-400">{observation.bbchDominant}</span>
              </div>
              {observation.bbchSecondary && Array.isArray(observation.bbchSecondary) && observation.bbchSecondary.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="text-[8px] font-bold text-slate-400 uppercase w-full">Stades Secondaires</span>
                  {observation.bbchSecondary.map((s: string) => (
                    <span key={s} className="px-2 py-0.5 bg-[#161c18] border border-emerald-500/20 rounded-full text-[10px] font-bold text-emerald-400">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Plus size={14} /> Organes de Production
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-[#161c18] rounded-2xl border border-white/5 shadow-none text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Fleurs</p>
              <p className="text-2xl font-black text-slate-200">{observation.organCounts?.flowers ?? 0}</p>
            </div>
            <div className="p-4 bg-[#161c18] rounded-2xl border border-white/5 shadow-none text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Fruits</p>
              <p className="text-2xl font-black text-slate-200">{observation.organCounts?.fruits ?? 0}</p>
            </div>
            <div className="col-span-2 p-3 bg-[#0d120f] rounded-xl text-[10px] text-slate-400 italic">
              {observation.organCounts?.details || "Pas de détails additionnels."}
            </div>
          </div>
        </section>

        {observation.characterizationTraits && (
          <section className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Edit2 size={14} /> Caractérisation
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(observation.characterizationTraits).map(([key, value]: [string, any]) => (
                <div key={key} className="p-3 bg-[#161c18] rounded-2xl border border-white/5 shadow-none">
                  <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">{key}</p>
                  <p className="text-xs font-bold text-slate-300">{String(value || 'Non spécifié')}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <TrendingUp size={14} /> Traits Phénotypiques
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Couleur', value: observation.phenotypicTraits?.color },
              { label: 'Forme', value: observation.phenotypicTraits?.shape },
              { label: 'Taille', value: observation.phenotypicTraits?.size },
              { label: 'Santé', value: observation.phenotypicTraits?.healthStatus },
            ].map((trait, i) => (
              <div key={i} className="p-3 bg-[#161c18] rounded-2xl border border-white/5 shadow-none">
                <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">{trait.label}</p>
                <p className="text-xs font-bold text-emerald-400">{trait.value || 'Non spécifié'}</p>
              </div>
            ))}
          </div>

                {observation.phenotypicTraits?.diseasesOrDeficiencies && Array.isArray(observation.phenotypicTraits.diseasesOrDeficiencies) && observation.phenotypicTraits.diseasesOrDeficiencies.length > 0 && (
            <div className="space-y-2 mt-2">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Alertes Sanitaires</span>
              <div className="flex flex-wrap gap-2">
                {observation.phenotypicTraits.diseasesOrDeficiencies.map((d: string, i: number) => (
                  <span key={i} className="px-2 py-1 bg-red-500/10 text-red-400 text-[10px] font-bold rounded-md border border-red-500/20">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {observation.userNotes && (
          <section className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Book size={14} /> {t.notes}
            </h4>
            <div className="p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20 text-slate-300 text-sm leading-relaxed italic">
              {observation.userNotes}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <MapPin size={14} /> Localisation
          </h4>
          <div className="p-4 bg-[#0d120f] rounded-2xl border border-white/5 flex justify-between items-center">
            <div>
              <p className="text-[10px] font-bold text-slate-500">Latitude: {observation.location?.lat?.toFixed ? observation.location.lat.toFixed(6) : '48.8566'}</p>
              <p className="text-[10px] font-bold text-slate-500">Longitude: {observation.location?.lng?.toFixed ? observation.location.lng.toFixed(6) : '2.3522'}</p>
            </div>
            <button 
              onClick={() => {
                const lat = observation.location?.lat || 48.8566;
                const lng = observation.location?.lng || 2.3522;
                const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
                window.open(url, '_blank');
              }}
              className="p-2 bg-[#161c18] text-emerald-400 rounded-xl border border-white/10 shadow-none"
            >
              <Globe size={18} />
            </button>
          </div>
        </section>
      </div>
    </motion.div>
  );
}

function AdminView({ t, isArabic, onObservationClick }: { t: any, isArabic: boolean, onObservationClick: (obs: any) => void }) {
  const [users, setUsers] = useState<any[]>([]);
  const [observations, setObservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const fetchData = async (forceServer = false) => {
    setIsRefreshing(true);
    try {
      const qUsers = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(50));
      const qObs = query(collection(db, 'observations'), orderBy('createdAt', 'desc'), limit(100));

      let userSnap;
      let obsSnap;

      if (forceServer) {
        userSnap = await getDocsFromServer(qUsers);
        obsSnap = await getDocsFromServer(qObs);
      } else {
        try {
          userSnap = await getDocsFromCache(qUsers);
          if (userSnap.empty) userSnap = await getDocsFromServer(qUsers);
        } catch (e) {
          userSnap = await getDocsFromServer(qUsers);
        }

        try {
          obsSnap = await getDocsFromCache(qObs);
          if (obsSnap.empty) obsSnap = await getDocsFromServer(qObs);
        } catch (e) {
          obsSnap = await getDocsFromServer(qObs);
        }
      }

      setUsers(userSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setObservations(obsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    } catch (e) {
      console.error("Admin fetch error", e);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdateStatus = async (userId: string, status: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        accessStatus: status
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'users');
    }
  };

  const handleUpdateRole = async (userId: string, role: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        role: role
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'users');
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">{t.loading}</div>;

  const pendingUsers = users.filter(u => u.accessStatus === 'pending');
  const otherUsers = users.filter(u => u.accessStatus !== 'pending');

  if (selectedUserId) {
    const userObs = observations.filter(o => o.userId === selectedUserId);
    const user = users.find(u => u.uid === selectedUserId);

    return (
      <div className="p-6 space-y-6 pb-32" dir={isArabic ? 'rtl' : 'ltr'}>
        <header className="flex items-center gap-4">
          <button onClick={() => setSelectedUserId(null)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-200 tracking-tight">{user?.displayName || 'Utilisateur'}</h2>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{userObs.length} Observations</p>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-4">
          {userObs.map(obs => (
            <div 
              key={obs.id} 
              onClick={() => onObservationClick(obs)}
              className="bg-[#161c18] rounded-2xl border border-white/5 overflow-hidden shadow-none cursor-pointer hover:border-emerald-500/30 transition-colors group"
            >
              <div className="relative">
                <img src={obs.imageUrl} alt="" className="w-full aspect-square object-cover" />
                {['pending', 'uploading', 'analyzing'].includes(obs.status) && (
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
                {obs.isDeletedByCreator && (
                  <div className="absolute top-2 left-2 bg-red-500/100 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-lg uppercase tracking-widest z-10 flex items-center gap-1">
                    <Trash2 size={10} />
                    Supprimé par l'utilisateur
                  </div>
                )}
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Maximize2 className="text-white" size={20} />
                </div>
              </div>
              <div className="p-3">
                <p className="font-bold text-xs text-slate-200 truncate">{obs.variety}</p>
                <p className="text-[8px] text-slate-400 uppercase font-bold">{obs.family}</p>
              </div>
            </div>
          ))}
        </div>

        {userObs.length === 0 && (
          <div className="text-center py-12">
            <Search size={48} className="mx-auto text-slate-200 mb-4" />
            <p className="text-slate-500 text-sm">Aucune observation pour cet utilisateur.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 pb-32" dir={isArabic ? 'rtl' : 'ltr'}>
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-200 tracking-tight">{t.admin}</h2>
          <div className="flex items-center gap-2">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">{users.length} {t.users}</p>
            {lastUpdated && (
              <p className="text-slate-300 text-[8px] font-bold uppercase tracking-widest">
                 {t.loading.replace('...', '')} {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
        <button 
          onClick={() => fetchData(true)}
          disabled={isRefreshing}
          className="p-3 bg-white/5 text-slate-400 rounded-2xl hover:bg-white/10 transition-all active:scale-95 disabled:opacity-50 shadow-none border border-white/10"
          title="Actualiser les données"
        >
          <RefreshCw size={20} className={isRefreshing ? 'animate-spin text-emerald-400' : ''} />
        </button>
      </header>

      {pendingUsers.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
            <Info size={14} /> {t.pendingUsers}
          </h3>
          <div className="space-y-3">
            {pendingUsers.map(user => (
              <div key={user.id} className="p-4 bg-[#161c18] rounded-2xl border border-amber-500/20 shadow-none">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="font-bold text-slate-200">{user.displayName || 'Utilisateur'}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </div>
                  <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[8px] font-bold rounded-full border border-amber-500/20 uppercase">
                    {user.accessStatus}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleUpdateStatus(user.id, 'approved')}
                    className="flex-1 py-2 bg-gradient-to-r from-emerald-400 to-[#124227] text-[#0d120f] rounded-full text-[10px] font-bold uppercase shadow-[0_0_15px_rgba(52,211,153,0.2)] tracking-widest hover:bg-emerald-700 transition-colors"
                  >
                    {t.approve}
                  </button>
                  <button 
                    onClick={() => handleUpdateStatus(user.id, 'rejected')}
                    className="flex-1 py-2 bg-red-500/10 text-red-400 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-red-500/20 transition-colors"
                  >
                    {t.reject}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t.userCatalog}</h3>
        <div className="space-y-3">
          {otherUsers.map(user => {
            const userObsCount = observations.filter(o => o.userId === user.uid).length;
            return (
              <div 
                key={user.id} 
                onClick={() => setSelectedUserId(user.uid)}
                className="p-4 bg-[#161c18] rounded-2xl border border-white/5 shadow-none flex justify-between items-center cursor-pointer hover:border-emerald-500/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-slate-500">
                    <UserIcon size={20} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-200 text-sm">{user.displayName || 'Utilisateur'}</p>
                    <p className="text-[10px] text-slate-400">{user.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">{userObsCount} Obs.</p>
                  <ChevronRight size={16} className="text-slate-300 ml-auto" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t.allUsers}</h3>
        <div className="bg-[#161c18] rounded-3xl border border-white/5 overflow-hidden shadow-none">
          {otherUsers.map((user, i) => (
            <div key={user.id} className={`p-4 flex items-center justify-between ${i !== otherUsers.length - 1 ? 'border-b border-white/5' : ''}`}>
              <div className="flex-1 min-w-0 mr-4">
                <p className="font-bold text-slate-200 truncate">{user.displayName || 'Utilisateur'}</p>
                <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <select 
                  value={user.role}
                  onChange={(e) => handleUpdateRole(user.id, e.target.value)}
                  className="text-[10px] font-bold bg-[#0d120f] border-none rounded-lg px-2 py-1 focus:ring-0"
                >
                  <option value="viewer">Viewer</option>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                <div className={`w-2 h-2 rounded-full ${user.accessStatus === 'approved' ? 'bg-emerald-500' : 'bg-red-500/100'}`}></div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function WeatherCard({ 
  weather, 
  t, 
  isArabic, 
  onSearch, 
  isLoading,
  savedLocations,
  onSaveLocation,
  onRemoveLocation,
  onSelectSavedLocation
}: { 
  weather: WeatherInfo; 
  t: any; 
  isArabic: boolean; 
  onSearch: (query: string) => void; 
  isLoading: boolean;
  savedLocations: any[];
  onSaveLocation: (loc: any) => void;
  onRemoveLocation: (id: string) => void;
  onSelectSavedLocation: (loc: any) => void;
}) {
  const [selectedIndicator, setSelectedIndicator] = useState<keyof WeatherInfo['forecast'][0]>('tempAvg');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [viewMode, setViewMode] = useState<'forecast' | 'history'>('forecast');

  useEffect(() => {
    if (weather && weather.current) {
      const condition = weather.current.condition.toLowerCase();
      const temp = weather.current.temp;
      if (condition.includes('orage') || temp > 35 || temp < 0) {
        notifyUser(`Alerte Météo: Conditions à haut risque (${weather.current.condition}, ${temp}°C)`, 'error');
      }
    }
  }, [weather]);

  const indicators = [
    { key: 'tempAvg', label: t.tempAvg, unit: 'C', color: '#3b82f6' },
    { key: 'tempMax', label: t.tempMax, unit: 'C', color: '#ef4444' },
    { key: 'tempMin', label: t.tempMin, unit: 'C', color: '#60a5fa' },
    { key: 'humidity', label: t.humidityRel, unit: '%', color: '#10b981' },
    { key: 'et0', label: t.et0, unit: 'mm', color: '#f59e0b' },
    { key: 'dpv', label: t.dpv, unit: 'kPa', color: '#8b5cf6' },
    { key: 'par', label: t.par, unit: 'W/m2', color: '#fbbf24' },
    { key: 'precipQty', label: t.precipQty, unit: 'mm', color: '#3b82f6' },
    { key: 'precipProb', label: t.precipProb, unit: '%', color: '#60a5fa' },
    { key: 'windSpeed', label: t.windSpeed, unit: 'km/h', color: '#64748b' },
    { key: 'uvIndexMax', label: 'Index UV', unit: '', color: '#f97316' },
  ];

  const currentIndicator = indicators.find(i => i.key === selectedIndicator) || indicators[0];

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onSearch(searchQuery);
      setIsSearching(false);
    }
  };

  if (!weather || !weather.current || !weather.forecast) return null;

  const todayStr = new Date().toISOString().split('T')[0];
  const todayIndex = weather.forecast.findIndex(d => d.date === todayStr);
  const splitIndex = todayIndex !== -1 ? todayIndex : 31;

  const historyData = weather.forecast.slice(0, splitIndex);
  const forecastData = weather.forecast.slice(splitIndex);

  const displayData = viewMode === 'forecast' ? forecastData : historyData;

  const handleToggleSave = () => {
    const isSaved = savedLocations.find(l => l.name === weather.locationName);
    if (isSaved) {
      onRemoveLocation(isSaved.id);
    } else {
      onSaveLocation({
        id: Math.random().toString(36).substring(7),
        name: weather.locationName,
        region: weather.region
      });
    }
  };

  const isCurrentSaved = savedLocations.some(l => l.name === weather.locationName);

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-5 bg-[#161c18] rounded-3xl shadow-xl shadow-blue-900/5 border border-blue-500/20 overflow-hidden relative"
    >
      <div className="absolute top-0 right-0 p-6 opacity-5 text-blue-400 pointer-events-none">
        <Cloud size={80} />
      </div>
      
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-blue-500 flex items-center gap-2">
                <Cloud size={14} /> Météo & Climat
              </h3>
              <button 
                onClick={() => setIsSearching(!isSearching)}
                className="p-1 hover:bg-white/5 rounded-full text-slate-400 transition-colors"
                title="Rechercher un site"
              >
                <Search size={14} />
              </button>
              <button 
                onClick={handleToggleSave}
                className={`p-1 rounded-full transition-colors ${isCurrentSaved ? 'text-yellow-500 hover:bg-yellow-50' : 'text-slate-400 hover:bg-white/5'}`}
                title="Sauvegarder ce site"
              >
                <Star size={14} fill={isCurrentSaved ? 'currentColor' : 'none'} />
              </button>
            </div>
            
            {isSearching ? (
              <form onSubmit={handleSearchSubmit} className="mb-2 space-y-2">
                <div className="flex gap-2">
                  <input 
                    autoFocus
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t.searchLocation}
                    className="flex-1 text-xs p-2 bg-[#0d120f] border border-white/5 rounded-xl focus:ring-0 focus:outline-none"
                  />
                  <button type="submit" className="p-2 bg-blue-500/100 text-white rounded-xl">
                    <ChevronRight size={14} />
                  </button>
                </div>
                {savedLocations.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {savedLocations.map(loc => (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => {
                          onSelectSavedLocation(loc);
                          setIsSearching(false);
                        }}
                        className="px-2 py-1 bg-white/5 font-medium text-slate-400 rounded-lg text-[10px] hover:bg-white/10 transition-colors"
                      >
                        {loc.name}
                      </button>
                    ))}
                  </div>
                )}
              </form>
            ) : (
              <div className="mb-2">
                <p className="text-sm font-black text-slate-200 tracking-tight flex items-center gap-1">
                  <MapPin size={12} className="text-blue-500" />
                  {weather.locationName || t.nearestSite}
                </p>
                {weather.region && <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{weather.region}</p>}
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-slate-200 tracking-tighter">{isLoading ? '...' : (weather.current.temp ?? '--')}</span>
                <span className="text-sm font-bold text-slate-400 uppercase">{weather.current.condition ?? '--'}</span>
              </div>
              {weather.current.uvIndex !== undefined && (
                <div className="px-2 py-1 bg-orange-500/10 rounded-lg border border-orange-500/20">
                  <p className="text-[7px] font-bold text-orange-500 uppercase tracking-widest leading-none mb-0.5">Index UV</p>
                  <p className="text-[10px] font-black text-orange-400 leading-none">{weather.current.uvIndex}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex gap-2 mb-4">
          <button 
            onClick={() => setViewMode('history')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${viewMode === 'history' ? 'bg-emerald-500/20 text-emerald-400 text-white' : 'bg-white/5 text-slate-500 hover:bg-white/10'}`}
          >
            Historique (30J)
          </button>
          <button 
            onClick={() => setViewMode('forecast')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${viewMode === 'forecast' ? 'bg-blue-500/100 text-white' : 'bg-blue-500/10 text-blue-500 hover:bg-blue-100'}`}
          >
            Prévisions (15J)
          </button>
        </div>

        <div className="mb-4">
          <select 
            value={selectedIndicator}
            onChange={(e) => setSelectedIndicator(e.target.value as any)}
            className="w-full p-2 bg-[#0d120f] rounded-xl border border-white/5 text-[10px] font-bold text-slate-400 focus:ring-0 focus:outline-none"
          >
            {indicators.map(ind => (
              <option key={ind.key} value={ind.key}>{ind.label}</option>
            ))}
          </select>
        </div>

        <div className="h-40 w-full mb-6 min-w-0 flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
            <LineChart data={displayData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" fontSize={8} tickMargin={5} minTickGap={20} tickFormatter={(val) => {
                const parts = val.split('-');
                return parts.length === 3 ? `${parts[2]}/${parts[1]}` : val;
              }} />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeight: 'bold' }}
                labelFormatter={(label) => `Date: ${label}`}
                formatter={(value: any) => [`${value} ${currentIndicator.unit}`, currentIndicator.label]}
              />
              <Line 
                type="monotone" 
                dataKey={selectedIndicator} 
                stroke={currentIndicator.color} 
                strokeWidth={3} 
                dot={{ r: 0 }}
                activeDot={{ r: 5, strokeWidth: 0, fill: currentIndicator.color }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 snap-x">
          {displayData.map((day, i) => (
            <div key={i} className="text-center p-2 bg-[#0d120f] rounded-2xl border border-white/5 shrink-0 min-w-[70px] snap-center">
              <p className="text-[7px] font-bold text-slate-400 mb-1">
                {day?.date ? new Date(day.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' }) : '--'}
              </p>
              <p className="text-xs font-black text-slate-300">{day?.tempAvg ?? '--'}°</p>
              <p className="text-[7px] font-bold text-blue-500 uppercase truncate mt-1">{day?.condition ?? '--'}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLightMode, setIsLightMode] = useState(() => {
    const saved = localStorage.getItem('agro_light_mode');
    if (saved !== null) {
      return saved === 'true';
    }
    return !window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [activeTab, setActiveTab] = useState<'scan' | 'map' | 'weather' | 'catalog' | 'admin'>('scan');
  const [analysis, setAnalysis] = useState<PlantAnalysis | null>(null);

  useEffect(() => {
    localStorage.setItem('agro_light_mode', isLightMode.toString());
    if (isLightMode) {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, [isLightMode]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem('agro_light_mode') === null) {
        setIsLightMode(!e.matches);
      }
    };
    
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    } else {
      mediaQuery.addListener(handleSystemThemeChange);
    }
    
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleSystemThemeChange);
      } else {
        mediaQuery.removeListener(handleSystemThemeChange);
      }
    };
  }, []);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [backgroundTasks, setBackgroundTasks] = useState<{ id: string, type: 'upload' | 'analysis', progress: number }[]>([]);
  const [observations, setObservations] = useState<any[]>([]);
  const [isObservationsLoading, setIsObservationsLoading] = useState(true);
  const [userNotes, setUserNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineObservations, setOfflineObservations] = useState<OfflineObservation[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [firebaseStatus, setFirebaseStatus] = useState<'connected' | 'offline' | 'error' | 'checking'>('checking');
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [language, setLanguage] = useState<'fr' | 'en' | 'ar'>('fr');

  useEffect(() => {
    const checkConnection = async () => {
      try {
        await testConnection();
        setFirebaseStatus('connected');
      } catch (err: any) {
        if (isNetworkOfflineError(err)) {
          setFirebaseStatus('offline');
          setFirebaseError('offline');
        } else {
          setFirebaseStatus('error');
          setFirebaseError(err.message || String(err));
        }
      }
    };
    checkConnection();
  }, []);

  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);
  const [manualLocation, setManualLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);
  
  // New States
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [quickFilter, setQuickFilter] = useState<'week' | 'month' | 'quarter' | 'custom'>('week');
  const [regionFilter, setRegionFilter] = useState('');
  const [familyFilter, setFamilyFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [showTrend, setShowTrend] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedObservation, setSelectedObservation] = useState<any | null>(null);
  
  // Auth States
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgotPassword' | 'verifyEmail'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isGoogleConnecting, setIsGoogleConnecting] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Notification State
  interface AppNotification {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
  }
  const [appNotifications, setAppNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    const handleNotify = (e: any) => {
      const { message, type } = e.detail;
      const id = Date.now().toString() + Math.random().toString();
      setAppNotifications(prev => [...prev, { id, message, type }]);
      setTimeout(() => {
        setAppNotifications(prev => prev.filter(n => n.id !== id));
      }, 5000);
    };
    window.addEventListener('app-notify', handleNotify);
    return () => window.removeEventListener('app-notify', handleNotify);
  }, []);

  // Chatbot & Preference States
  interface CropReminder {
    id: string;
    text: string;
    priority: 'high' | 'medium' | 'low';
    dueDate?: string;
  }
  const [reminders, setReminders] = useState<CropReminder[]>(() => {
    try {
      const stored = localStorage.getItem('crop_reminders');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem('crop_reminders', JSON.stringify(reminders));
  }, [reminders]);

  const [newReminderText, setNewReminderText] = useState('');
  const [newReminderPriority, setNewReminderPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [newReminderDate, setNewReminderDate] = useState('');

  const handleAddReminder = () => {
    if (!newReminderText.trim()) return;
    setReminders(prev => [...prev, {
      id: Date.now().toString(),
      text: newReminderText,
      priority: newReminderPriority,
      dueDate: newReminderDate
    }]);
    setNewReminderText('');
    setNewReminderDate('');
    notifyUser("Rappel ajouté au catalogue.", "success");
  };

  const [chatMessages, setChatMessages] = useState<any[]>(() => {
    try {
      const stored = localStorage.getItem('agro_chat_messages');
      return stored ? JSON.parse(stored) : [
        {
          id: 'welcome_msg',
          sender: 'bot',
          text: "Bonjour ! Je suis l'assistant agronome AgroScan IA. Posez-moi vos questions sur vos cultures, l'agriculture maraîchère, l'identification de symptômes ou les sols.",
          timestamp: new Date().toISOString()
        }
      ];
    } catch (e) {
      return [{ id: 'welcome_msg', sender: 'bot', text: "Bonjour ! Je suis l'assistant AgroScan.", timestamp: new Date().toISOString() }];
    }
  });
  const [chatInput, setChatInput] = useState('');
  const [useGoogleSearch, setUseGoogleSearch] = useState(false);
  const [useHighThinking, setUseHighThinking] = useState(false);
  const [isChatTyping, setIsChatTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [customGeminiKey, setCustomGeminiKey] = useState(() => localStorage.getItem('user_gemini_api_key') || '');
  const [isSpeechSupported, setIsSpeechSupported] = useState(() => typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window));

  const handleUpdateGeminiKey = (newKey: string) => {
    const trimmed = newKey.trim();
    setCustomGeminiKey(trimmed);
    if (trimmed) {
      localStorage.setItem('user_gemini_api_key', trimmed);
    } else {
      localStorage.removeItem('user_gemini_api_key');
    }
    // Invalide le cache d'initialisation de l'API
    clearAIInstance();
  };

  const handleClearChat = () => {
    if (confirm("Effacer tout l'historique de discussion ?")) {
      const empty = [
        {
          id: 'welcome_msg_reset',
          sender: 'bot',
          text: "Historique réinitialisé. Comment puis-je vous aider ?",
          timestamp: new Date().toISOString()
        }
      ];
      setChatMessages(empty);
      localStorage.setItem('agro_chat_messages', JSON.stringify(empty));
    }
  };

  const handleSendChatMessage = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || isChatTyping) return;

    const userText = chatInput;
    setChatInput('');
    setIsChatTyping(true);
    triggerHaptic('light');

    const newUserMsg = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toISOString()
    };
    
    const updatedMessages = [...chatMessages, newUserMsg];
    setChatMessages(updatedMessages);
    localStorage.setItem('agro_chat_messages', JSON.stringify(updatedMessages));

    try {
      // Préparer les outils si Grounding est coché
      const tools: any[] = [];
      if (useGoogleSearch) {
        tools.push({ googleSearch: {} });
      }

      // Préparer les instructions système pour un comportement agricole hyper rigoureux
      const systemInstruction = "Vous êtes un ingénieur agronome expert et compagnon virtuel d'AgroScan IA. Vous donnez des réponses extrêmement professionnelles, précises et scientifiques en langue française ou arabe selon le message de l'utilisateur. Détaillez l'identification des maladies, les cultures maraîchères locales, l'irrigation et les stades phénologiques BBCH. Répondez de manière structurée avec des puces élégantes.";

      // Construire l'historique de discussion à passer à l'API
      const contents = updatedMessages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));

      // Configurer la requête
      const config: any = {
        systemInstruction,
        tools: tools.length > 0 ? tools : undefined,
      };

      if (useHighThinking) {
        config.thinkingConfig = {
          thinkingLevel: 'HIGH'
        };
      }

      const userKey = localStorage.getItem('user_gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || "";
      const apiUrl = import.meta.env.VITE_API_URL || "";

      let responseTextStr = "";
      let groundingChunksData = null;

      if (apiUrl || !userKey) {
        const proxyRes = await fetch(`${apiUrl}/api/gemini/generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
             model: 'gemini-2.5-flash',
             contents, 
             config,
             userKey
          })
        }).catch(err => {
          console.error("Fetch error chat:", err);
          throw new Error(`Erreur de connexion au serveur chat: ${err.message || "Serveur injoignable"}`);
        });

        const responseData = await proxyRes.json().catch(() => null);

        if (!proxyRes.ok) {
          throw new Error(responseData?.error || `Erreur chat AI (${proxyRes.status})`);
        }

        if (!responseData) {
          throw new Error("Réponse vide reçue de l'assistant.");
        }

        responseTextStr = responseData.text || "Désolé, je n'ai pas pu générer de réponse.";
        groundingChunksData = responseData.candidates?.[0]?.groundingMetadata?.groundingChunks;
      } else {
        // Mode APK Direct Fallback
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: userKey });
        const res = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents,
          config
        });
        responseTextStr = res.text || "Désolé, je n'ai pas pu générer de réponse.";
        groundingChunksData = (res as any).candidates?.[0]?.groundingMetadata?.groundingChunks;
      }

      const responseText = responseTextStr;
      
      // Récupérer les sources de grounding si applicables
      const groundingChunks = groundingChunksData;
      const groundingSources = groundingChunks ? groundingChunks.map((chunk: any) => ({
        title: chunk.web?.title || "Source Google Search",
        uri: chunk.web?.uri
      })).filter((src: any) => src.uri) : [];

      const newBotMsg = {
        id: `bot_${Date.now()}`,
        sender: 'bot',
        text: responseText,
        timestamp: new Date().toISOString(),
        groundingSources: groundingSources.length > 0 ? groundingSources : undefined
      };

      const finalMessages = [...updatedMessages, newBotMsg];
      setChatMessages(finalMessages);
      localStorage.setItem('agro_chat_messages', JSON.stringify(finalMessages));
    } catch (err: any) {
      console.error("Erreur de discussion avec Gemini:", err);
      let errorMsg = "Désolé, une erreur est survenue lors de l'envoi du message.";
      if (err.message && (err.message.includes('API_KEY') || err.message.includes('key') || err.message.includes('Instantiation'))) {
        errorMsg = "Votre clé API Gemini est manquante ou invalide. Veuillez configurer une clé API valide dans la section d'ajustement des paramètres ci-dessus pour activer l'assistant virtuel.";
      }
      
      const newSystemMsg = {
        id: `system_${Date.now()}`,
        sender: 'system',
        text: errorMsg,
        timestamp: new Date().toISOString()
      };
      
      const finalMsgList = [...updatedMessages, newSystemMsg];
      setChatMessages(finalMsgList);
      localStorage.setItem('agro_chat_messages', JSON.stringify(finalMsgList));
    } finally {
      setIsChatTyping(false);
      triggerHaptic('light');
    }
  };

  const startSpeechRecognition = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("La reconnaissance vocale n'est pas supportée sur ce navigateur ou cet appareil.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = language === 'ar' ? 'ar-MA' : language === 'en' ? 'en-US' : 'fr-FR';
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
        triggerHaptic('medium');
      };

      recognition.onresult = (event: any) => {
        const resultText = event.results[0][0].transcript;
        if (resultText) {
          setChatInput(prev => prev ? prev + ' ' + resultText : resultText);
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Erreur de reconnaissance vocale:", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        triggerHaptic('medium');
      };

      recognition.start();
    } catch (e) {
      console.error(e);
      setIsListening(false);
    }
  };

  const speakMessage = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      alert("La synthèse vocale n'est pas supportée.");
      return;
    }

    window.speechSynthesis.cancel();
    
    // Nettoyer légèrement le Markdown pour une synthèse audio fluide
    const cleanText = text.replace(/[*_#`\-+]/g, ' ');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = language === 'ar' ? 'ar-EG' : language === 'en' ? 'en-US' : 'fr-FR';
    window.speechSynthesis.speak(utterance);
    triggerHaptic('light');
  };

  const t = translations[language];
  const isArabic = language === 'ar';
  const isAdmin = user?.email === 'relkrouchni@gmail.com' || user?.email === 'elkrouchni@gmail.com' || userData?.role === 'admin';
  const canManage = isAdmin || userData?.role === 'user' || user?.isAnonymous;

  const handleLogout = async () => {
    try {
      await logout();
      notifyUser("Déconnecté avec succès. Vos données de session sont sécurisées.", 'success');
    } catch (e) {
      console.error(e);
      notifyUser("Erreur lors de la déconnexion", 'error');
    }
  };

  useEffect(() => {
    // Consommer le résultat d'un éventuel redirect au démarrage
    checkRedirectResult().catch(e => console.warn("Initial redirect check failed:", e));
    
    // Handle Deep Linking callback on native environments to close Custom Tab and finalize log in
    let appUrlListener: any = null;
    const isNative = Capacitor.isNativePlatform();
    if (isNative) {
      import('@capacitor/app').then(({ App }) => {
        App.addListener('appUrlOpen', async (event: any) => {
          console.log('App opened with URL:', event.url);
          // Close the Chrome Custom Tab automatically on Deep Link trigger
          import('@capacitor/browser').then(({ Browser }) => {
            Browser.close().catch(() => {});
          });

          // Check for redirect result inside the shared persistent state
          try {
            const redirectUser = await checkRedirectResult();
            if (redirectUser) {
              console.log("Utilisateur connecté via Deep Link retour natif :", redirectUser.uid);
              setUser(redirectUser);
            }
          } catch (e) {
            console.error("Erreur de récupération d'auth par Deep Link :", e);
          }
        });
      });
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    let unsubscribeUserDoc: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }
      
      if (u) {
        localStorage.removeItem('agroscan_use_local_guest');
        setUser(u);
        if (!u.emailVerified && u.providerData[0]?.providerId === 'password') {
          setAuthMode('verifyEmail');
        }

        // Listen to user data changes in real-time (efficient for single doc)
        const userRef = doc(db, 'users', u.uid);
        unsubscribeUserDoc = onSnapshot(userRef, async (docSnap) => {
          try {
            if (docSnap.exists()) {
              const data = docSnap.data();
              if ((u.email === 'relkrouchni@gmail.com' || u.email === 'elkrouchni@gmail.com') && (data.role !== 'admin' || data.accessStatus !== 'approved')) {
                await updateDoc(userRef, {
                  role: 'admin',
                  accessStatus: 'approved'
                });
              } else {
                setUserData(data);
              }
            } else {
              // Create user doc if it doesn't exist (one-time write)
              const newUser = {
                uid: u.uid,
                email: u.email,
                displayName: u.displayName || (u.isAnonymous ? 'Invité' : displayName),
                photoURL: u.photoURL,
                role: (u.email === 'relkrouchni@gmail.com' || u.email === 'elkrouchni@gmail.com') ? 'admin' : (u.isAnonymous ? 'user' : 'viewer'),
                accessStatus: (u.email === 'relkrouchni@gmail.com' || u.email === 'elkrouchni@gmail.com' || u.isAnonymous) ? 'approved' : 'pending',
                createdAt: serverTimestamp()
              };
              await setDoc(userRef, newUser);
              // The next snapshot will trigger and set userData
            }
            setIsAuthReady(true);
          } catch (err: any) {
            try {
              const errMessage = err.message || String(err);
              if (errMessage.includes('Quota exceeded') || errMessage.includes('quota limit exceeded')) {
                setQuotaExceeded(true);
              }
            } catch (e) {}
            console.error("User data fetch error", err);
            setIsAuthReady(true);
          }
        }, (err) => {
          console.error("User snapshot error", err);
          setIsAuthReady(true);
        });
      } else {
        setUser(null);
        setUserData(null);
        setIsAuthReady(true);
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (unsubscribeUserDoc) unsubscribeUserDoc();
      unsubscribe();
    };
  }, []);

  const [savedLocations, setSavedLocations] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('agro_saved_locations');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const fetchWeather = async (lat?: number, lng?: number, query?: string) => {
    if (isWeatherLoading) return;
    setIsWeatherLoading(true);
    try {
      let locationLat = lat;
      let locationLng = lng;
      let locName = 'Inconnu';
      let locRegion = '';

      if (query) {
        const geoRes = await fetch(`/api/weather/geocode?name=${encodeURIComponent(query)}`).catch(e => {
          console.error("Fetch error geocode:", e);
          throw new Error(`Impossible de contacter le service de géocodage: ${e.message}`);
        });
        
        if (!geoRes.ok) {
          const errData = await geoRes.json().catch(() => ({}));
          throw new Error(errData.error || `Erreur géocodage (${geoRes.status})`);
        }
        const geoData = await geoRes.json().catch(() => {
          throw new Error("Réponse de géocodage invalide");
        });
        
        if (geoData.results && geoData.results.length > 0) {
          locationLat = geoData.results[0].latitude;
          locationLng = geoData.results[0].longitude;
          locName = geoData.results[0].name;
          locRegion = geoData.results[0].admin1 || geoData.results[0].country || '';
        } else {
          throw new Error("Lieu non trouvé");
        }
      } else if (lat && lng) {
        locationLat = lat;
        locationLng = lng;
        locName = `Ma Position`;
      }

      if (locationLat === undefined || locationLng === undefined) {
        setIsWeatherLoading(false);
        return;
      }

      const weatherRes = await fetch(`/api/weather/forecast?lat=${locationLat}&lng=${locationLng}`).catch(e => {
        console.error("Fetch error weather:", e);
        throw new Error(`Impossible de contacter le service météo: ${e.message}`);
      });
      
      if (!weatherRes.ok) {
        const errData = await weatherRes.json().catch(() => ({}));
        throw new Error(errData.error || `Erreur météo (${weatherRes.status})`);
      }
      const weatherData = await weatherRes.json().catch(() => {
        throw new Error("Réponse météo invalide");
      });
      
      if (!weatherData || !weatherData.daily) {
        throw new Error("Données météo incomplètes reçues de l'API");
      }

      const getWeatherCondition = (code: number) => {
        if (code === 0) return 'SOLEIL';
        if (code >= 1 && code <= 3) return 'NUAGEUX';
        if (code >= 45 && code <= 48) return 'BROUILLARD';
        if (code >= 51 && code <= 67) return 'PLUIE';
        if (code >= 71 && code <= 77) return 'NEIGE';
        if (code >= 80 && code <= 82) return 'PLUIE';
        if (code >= 95) return 'ORAGE';
        return 'INCONNU';
      };

      const daily = weatherData.daily;
      const forecastArray = daily.time.map((timeStr: string, index: number) => {
        const parApprox = daily.shortwave_radiation_sum[index] ? daily.shortwave_radiation_sum[index] * 1000000 / (24 * 3600) * 0.45 : 0;
        
        // Approx DPV max daily
        const tMax = daily.temperature_2m_max[index] ?? 20;
        const es = 0.6108 * Math.exp(17.27 * tMax / (tMax + 237.3));
        const ea = es * 0.6; // assuming 60% rh
        const dpvApprox = es - ea;

        return {
          date: timeStr,
          tempMax: daily.temperature_2m_max[index],
          tempMin: daily.temperature_2m_min[index],
          tempAvg: daily.temperature_2m_mean[index],
          humidity: 60,
          et0: daily.et0_fao_evapotranspiration[index] || 0,
          dpv: Number(dpvApprox.toFixed(2)),
          par: Number(parApprox.toFixed(0)),
          precipQty: daily.precipitation_sum[index] || 0,
          precipProb: daily.precipitation_probability_max?.[index] || 0,
          windSpeed: daily.wind_speed_10m_max[index] || 0,
          airQuality: "Bonne",
          condition: getWeatherCondition(daily.weather_code[index] || 0),
          uvIndexMax: daily.uv_index_max?.[index] || 0
        };
      }).filter((day: any) => day.tempMax !== null && day.tempMax !== undefined);

      const todayStr = new Date().toISOString().split('T')[0];
      const todayIndex = daily.time.indexOf(todayStr);
      // Open-Meteo with past_days=31 puts today at index 31 if data is available for all days.
      // If today is not in daily.time (unlikely but possible), fallback to index 31 or last.
      const safeIndex = todayIndex !== -1 ? todayIndex : (daily.time.length >= 32 ? 31 : daily.time.length - 1);
      
      const currentCode = weatherData.current?.weather_code || 0;
      
      const currentTemp = weatherData.current?.temperature_2m || 0;
      const currentEs = 0.6108 * Math.exp(17.27 * currentTemp / (currentTemp + 237.3));
      const currentEa = currentEs * ((weatherData.current?.relative_humidity_2m || 60) / 100);
      const currentDpv = currentEs - currentEa;

      const finalData: WeatherInfo = {
        locationName: locName,
        region: locRegion,
        current: {
          temp: currentTemp,
          tempMax: daily.temperature_2m_max[safeIndex] || 0,
          tempMin: daily.temperature_2m_min[safeIndex] || 0,
          humidity: weatherData.current?.relative_humidity_2m || 0,
          windSpeed: weatherData.current?.wind_speed_10m || 0,
          condition: getWeatherCondition(currentCode),
          et0: daily.et0_fao_evapotranspiration[safeIndex] || 0,
          dpv: Number(currentDpv.toFixed(2)),
          par: Number(((daily.shortwave_radiation_sum[safeIndex] || 0) * 1000000 / (24 * 3600) * 0.45).toFixed(0)),
          precipQty: weatherData.current?.precipitation || 0,
          precipProb: daily.precipitation_probability_max?.[safeIndex] || 0,
          airQuality: "Bonne",
          uvIndex: weatherData.current?.uv_index || 0
        },
        forecast: forecastArray
      };

      setWeather(finalData);
    } catch (error) {
      console.error("Failed to fetch weather", error);
    } finally {
      setIsWeatherLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      const fetchLocationAndWeather = async () => {
        try {
          const { Geolocation } = await import('@capacitor/geolocation');
          // Important: Don't request permissions right away if this fires on startup 
          // to avoid annoying the user until explicitly needed, 
          // or use Geolocation API without assuming it works immediately if denied.
          const pos = await Geolocation.getCurrentPosition({ timeout: 10000 });
          fetchWeather(pos.coords.latitude, pos.coords.longitude);
        } catch (err) {
          console.warn("Geolocation failed/denied, defaulting to Paris", err);
          fetchWeather(48.8566, 2.3522);
        }
      };
      
      fetchLocationAndWeather();
    }
  }, [user, language]);

  const handleExportExcel = () => {
    const headers = [
      "Culture", "Varit", "Espce", "Famille", "Rgion", "Domaine", 
      "Latitude", "Longitude", "Date", "Notes Utilisateur",
      "BBCH Dominant", "BBCH Secondaires", "Fleurs", "Fruits", "Dtails Organes",
      "Stade Phnologique", "Intensité", "Qualité", "Traits de Caractérisation",
      "Couleur", "Forme", "Taille", "tat de Santé", "Maladies/Carences", "Description Technique"
    ];

    // Group by culture
    const cultures = Array.from(new Set(filteredObservations.map(o => o.culture || "Inconnue")));
    const wb = XLSX.utils.book_new();

    if (cultures.length === 0) {
      const ws = XLSX.utils.aoa_to_sheet([["Aucune donne  exporter"]]);
      XLSX.utils.book_append_sheet(wb, ws, "Vide");
    } else {
      cultures.forEach(cultureNameObj => {
        const cultureName = cultureNameObj as string;
        const cultureObs = filteredObservations.filter(o => (o.culture || "Inconnue") === cultureName);
        const data = cultureObs.map(obs => [
          obs.culture || "Inconnue",
          obs.variety || "",
          obs.species || "",
          obs.family || "",
          obs.region || "",
          obs.domain || "",
          obs.location?.lat || "",
          obs.location?.lng || "",
          obs.capturedAt ? new Date(obs.capturedAt).toLocaleDateString() : (obs.createdAt?.toDate ? obs.createdAt.toDate().toLocaleDateString() : ""),
          obs.userNotes || "",
          obs.bbchDominant || "",
          (obs.bbchSecondary || []).join(", "),
          obs.organCounts?.flowers || 0,
          obs.organCounts?.fruits || 0,
          obs.organCounts?.details || "",
          obs.phenologicalStage || "",
          obs.stageIntensity || "",
          obs.stageQuality || "",
          (obs.characterizationTraits || []).join(", "),
          obs.phenotypicTraits?.color || "",
          obs.phenotypicTraits?.shape || "",
          obs.phenotypicTraits?.size || "",
          obs.phenotypicTraits?.healthStatus || "",
          (obs.phenotypicTraits?.diseasesOrDeficiencies || []).join(", "),
          obs.description || ""
        ]);

        const ws = XLSX.utils.aoa_to_sheet([
          [`RAPPORT D'EXTRACTION AGROSCAN IA - CULTURE: ${cultureName.toUpperCase()}`],
          [`Intervalle d'extraction: ${startDate || 'Origine'} au ${endDate || 'Aujourd\'hui'}`],
          [`Date d'exportation: ${new Date().toLocaleString()}`],
          [],
          headers,
          ...data
        ]);

        const wscols = headers.map(() => ({ wch: 25 }));
        ws['!cols'] = wscols;

        // Clean sheet name (max 31 chars, no special chars)
        const safeSheetName = cultureName.replace(/[\\*?\/\[\]]/g, '').substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName || "Culture");
      });
    }

    // Save file
    XLSX.writeFile(wb, `agroscan_export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const [isImportingCSV, setIsImportingCSV] = useState(false);

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsImportingCSV(true);
    triggerHaptic('light');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (rows.length === 0) {
          alert("Le fichier importé est vide.");
          setIsImportingCSV(false);
          return;
        }

        const helperClean = (str: string) => 
          String(str || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();

        // Standard image fallback for bulk imported historical records
        const historicalImagePlaceholders = [
          "https://images.unsplash.com/photo-1463936575829-25148e1db1b8?w=800&auto=format&fit=crop",
          "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=800&auto=format&fit=crop",
          "https://images.unsplash.com/photo-1520302873429-194c54096b7b?w=800&auto=format&fit=crop"
        ];

        const importedObservations: any[] = [];

        for (let idx = 0; idx < rows.length; idx++) {
          const row = rows[idx];
          
          let rowCulture = "";
          let rowVariety = "";
          let rowSpecies = "";
          let rowFamily = "";
          let rowDomain = "Import historique";
          let rowLat = 48.8566;
          let rowLng = 2.3522;
          let rowCapturedAt = new Date().toISOString();
          let rowNotes = "";
          let rowBbchDominant = "";
          let rowBbchSecondary: string[] = [];
          let rowFlowers = 0;
          let rowFruits = 0;
          let rowDescription = "Données historiques importées en lot.";
          let rowImageUrl = historicalImagePlaceholders[idx % historicalImagePlaceholders.length];

          // Field ops properties
          let rowPlantingDate = "";
          let rowBreeder = "";
          let rowPruningDate = "";
          let rowHarvestQuantity = "";
          let rowDensity = "";
          let rowFruitFirmness = "";
          let rowDefects = "";

          // Phenotypic properties
          let rowColor = "Couleur non spécifiée";
          let rowShape = "Forme non spécifiée";
          let rowSize = "Taille non spécifiée";
          let rowHealth = "Sain";
          let rowDiseases: string[] = [];

          Object.keys(row).forEach(key => {
            const val = row[key];
            const cleaned = helperClean(key);

            if (cleaned === "culture" || cleaned.includes("espece principal")) {
              rowCulture = String(val);
            } else if (cleaned.includes("varit") || cleaned === "variety" || cleaned === "variete") {
              rowVariety = String(val);
            } else if (cleaned === "espece" || cleaned === "species") {
              rowSpecies = String(val);
            } else if (cleaned === "famille" || cleaned === "family") {
              rowFamily = String(val);
            } else if (cleaned === "domaine" || cleaned === "site" || cleaned === "domain") {
              rowDomain = String(val);
            } else if (cleaned === "latitude" || cleaned === "lat") {
              rowLat = Number(val) || 48.8566;
            } else if (cleaned === "longitude" || cleaned === "lng" || cleaned === "lon") {
              rowLng = Number(val) || 2.3522;
            } else if (cleaned === "date" || cleaned === "captured" || cleaned === "capturedat" || cleaned === "saissie" || cleaned === "saisie") {
              try {
                if (val) {
                  if (typeof val === 'number') {
                    const excelDate = new Date((val - 25569) * 86400 * 1000);
                    rowCapturedAt = excelDate.toISOString();
                  } else {
                    rowCapturedAt = new Date(val).toISOString();
                  }
                }
              } catch (dateErr) {
                console.warn("Date parsing issue at index " + idx, dateErr);
              }
            } else if (cleaned.includes("note") || cleaned.includes("commentaire")) {
              rowNotes = String(val);
            } else if (cleaned.includes("bbch dominant") || cleaned === "bbch") {
              rowBbchDominant = String(val);
            } else if (cleaned.includes("bbch second")) {
              rowBbchSecondary = String(val).split(",").map(s => s.trim()).filter(Boolean);
            } else if (cleaned === "fleurs" || cleaned.includes("flower") || cleaned === "bloom") {
              rowFlowers = Number(val) || 0;
            } else if (cleaned === "fruits" || cleaned.includes("fruit")) {
              rowFruits = Number(val) || 0;
            } else if (cleaned.includes("description") || cleaned.includes("details")) {
              rowDescription = String(val);
            } else if (cleaned === "photo" || cleaned === "image" || cleaned === "url" || cleaned === "imageurl") {
              if (String(val).startsWith("http")) {
                rowImageUrl = String(val);
              }
            } else if (cleaned.includes("plantation") || cleaned.includes("planting")) {
              rowPlantingDate = String(val);
            } else if (cleaned === "obtenteur" || cleaned === "breeder") {
              rowBreeder = String(val);
            } else if (cleaned.includes("taille") || cleaned.includes("pruning")) {
              rowPruningDate = String(val);
            } else if (cleaned.includes("recolte") || cleaned.includes("harvest")) {
              rowHarvestQuantity = String(val);
            } else if (cleaned === "densite" || cleaned === "density") {
              rowDensity = String(val);
            } else if (cleaned.includes("fermete") || cleaned.includes("firmness")) {
              rowFruitFirmness = String(val);
            } else if (cleaned === "defauts" || cleaned === "defects") {
              rowDefects = String(val);
            } else if (cleaned === "couleur" || cleaned === "color") {
              rowColor = String(val);
            } else if (cleaned === "forme" || cleaned === "shape") {
              rowShape = String(val);
            } else if (cleaned === "taille" || cleaned === "size") {
              rowSize = String(val);
            } else if (cleaned.includes("sante") || cleaned.includes("health")) {
              rowHealth = String(val);
            } else if (cleaned.includes("maladie") || cleaned.includes("carence") || cleaned.includes("disease")) {
              rowDiseases = String(val).split(",").map(s => s.trim()).filter(Boolean);
            }
          });

          if (!rowVariety) rowVariety = "Variété Historique";
          if (!rowCulture) rowCulture = "En attente...";

          const cleanObs = {
            userId: user.uid,
            userName: user.displayName || 'Chercheur Historique',
            userEmail: user.email || 'chercheur@agroscan',
            domain: rowDomain,
            location: { lat: rowLat, lng: rowLng },
            capturedAt: rowCapturedAt,
            imageUrl: rowImageUrl,
            imageUrls: [rowImageUrl],
            culture: rowCulture,
            variety: rowVariety,
            species: rowSpecies || rowVariety,
            family: rowFamily || "Botany Root",
            bbchDominant: rowBbchDominant,
            bbchSecondary: rowBbchSecondary,
            organCounts: { flowers: rowFlowers, fruits: rowFruits, details: "" },
            phenotypicTraits: {
              color: rowColor,
              shape: rowShape,
              size: rowSize,
              healthStatus: rowHealth,
              diseasesOrDeficiencies: rowDiseases
            },
            description: rowDescription,
            userNotes: rowNotes,
            status: 'completed',
            createdAt: serverTimestamp(),
            plantingDate: rowPlantingDate || null,
            breeder: rowBreeder || null,
            pruningDate: rowPruningDate || null,
            harvestQuantity: rowHarvestQuantity || null,
            density: rowDensity || null,
            fruitFirmness: rowFruitFirmness || null,
            defects: rowDefects || null,
            isDeletedByCreator: false
          };

          importedObservations.push(cleanObs);
        }

        for (const obs of importedObservations) {
          await addDoc(collection(db, 'observations'), obs);
        }

        triggerHaptic('success');
        alert(`${importedObservations.length} enregistrements botaniques ont été importés avec succès !`);
      } catch (err) {
        console.error("Bulk CSV import error", err);
        triggerHaptic('error');
        alert("Une erreur est survenue lors de l'importation.");
      } finally {
        setIsImportingCSV(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleGlobalReset = async () => {
    if (!window.confirm(t.allUsersReset + "?")) return;
    try {
      const querySnapshot = await getDocs(collection(db, 'observations'));
      for (const docSnap of querySnapshot.docs) {
        await updateDoc(doc(db, 'observations', docSnap.id), {
          status: 'pending'
        });
        const obs = docSnap.data();
        const images = (obs.imageUrls || [obs.imageUrl]).map((url: string) => ({
          dataUrl: url,
          base64Image: "",
          mimeType: 'image/jpeg'
        }));
        
        const fetchAndAnalyze = async () => {
          try {
            const res = await fetch(obs.imageUrl);
            if (!res.ok) throw new Error("Impossible de récupérer l'image pour analyse");
            const blob = await res.blob();
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve) => {
              reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
              reader.readAsDataURL(blob);
            });
            runBackgroundAnalysis(docSnap.id, [{ base64Image: base64, mimeType: blob.type, dataUrl: obs.imageUrl }], { variety: obs.variety });
          } catch (e) {
            console.error("Fetch and analyze failed", e);
          }
        };
        fetchAndAnalyze();
      }
      alert("Réinitialisation globale lancée !");
    } catch (e) {
      console.error("Global reset failed", e);
    }
  };

  const handleDownloadImage = async (url: string, filename: string) => {
    try {
      const response = await fetch(url, { referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error("Impossible de télécharger l'image");
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename || 'agroscan_image.jpg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Image download failed", error);
      window.open(url, '_blank');
    }
  };

  useEffect(() => {
    if (editingId && observations.length > 0) {
      const updatedObs = observations.find(o => o.id === editingId);
      if (updatedObs && updatedObs.status !== analysis?.status) {
        setAnalysis({
          family: updatedObs.family,
          species: updatedObs.species,
          variety: updatedObs.variety,
          domain: updatedObs.domain,
          status: updatedObs.status,
          plantingDate: updatedObs.plantingDate,
          breeder: updatedObs.breeder,
          pruningDate: updatedObs.pruningDate,
          harvestQuantity: updatedObs.harvestQuantity,
          density: updatedObs.density,
          fruitFirmness: updatedObs.fruitFirmness,
          defects: updatedObs.defects,
          phenologicalStage: updatedObs.phenologicalStage,
          stageIntensity: updatedObs.stageIntensity,
          stageQuality: updatedObs.stageQuality,
          characterizationTraits: updatedObs.characterizationTraits,
          phenotypicTraits: updatedObs.phenotypicTraits,
          description: updatedObs.description || '',
          imageUrls: updatedObs.imageUrls || [updatedObs.imageUrl]
        });
        setCurrentImageIndex(0);
      }
    }
  }, [observations, editingId]);

  // Offline Sync Logic
  useEffect(() => {
    const loadOffline = async () => {
      const obs = await getOfflineObservations();
      setOfflineObservations(obs);
    };
    loadOffline();

    const handleStorageChange = () => loadOffline();
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const syncOfflineData = async () => {
    if (!isOnline || !user || isSyncing) return;
    
    const queue = await getOfflineObservations();
    if (queue.length === 0) return;

    setIsSyncing(true);
    console.log(`Syncing ${queue.length} offline observations...`);
    let syncedCount = 0;
    
    for (const item of queue) {
      if (item.status === 'syncing') continue;
      
      try {
        await updateOfflineStatus(item.id, 'syncing');
        setOfflineObservations(prev => prev.map(o => o.id === item.id ? { ...o, status: 'syncing' } : o));

        // Upload to Storage first
        const storagePath = `observations/${user.uid}/${Date.now()}_offline_${item.id}.jpg`;
        const blob = await dataUrlToBlob(item.fileData);
        const storageUrl = await uploadImage(blob, storagePath);

        const observationData = {
          userId: user.uid,
          location: item.metadata,
          createdAt: serverTimestamp(),
          capturedAt: item.capturedAt || new Date().toISOString(),
          imageUrl: storageUrl,
          imageUrls: [storageUrl],
          culture: item.metadata.culture || "En attente d'analyse",
          variety: item.metadata.variety || "En attente d'analyse",
          species: item.metadata.species || "Inconnu",
          family: item.metadata.family || "Inconnu",
          bbchDominant: "",
          bbchSecondary: [],
          organCounts: { flowers: 0, fruits: 0, details: "" },
          phenotypicTraits: { color: '?', healthStatus: '?', diseases: [] },
          userNotes: item.metadata.userNotes || "Captur hors-ligne",
          status: 'pending',
          plantingDate: item.metadata.plantingDate || null,
          breeder: item.metadata.breeder || null,
          pruningDate: item.metadata.pruningDate || null,
          harvestQuantity: item.metadata.harvestQuantity || null,
          density: item.metadata.density || null,
          fruitFirmness: item.metadata.fruitFirmness || null,
          defects: item.metadata.defects || null,
        };
        
        const docRef = await addDoc(collection(db, 'observations'), observationData);
        
        // Trigger background analysis
        const images = [{
          base64Image: item.fileData.split(',')[1],
          mimeType: item.fileType || 'image/jpeg',
          dataUrl: item.fileData
        }];
        runBackgroundAnalysis(docRef.id, images, item.metadata);

        // Remove from IndexedDB
        await deleteOfflineObservation(item.id);
        setOfflineObservations(prev => prev.filter(o => o.id !== item.id));
        syncedCount++;
      } catch (e) {
        console.error("Sync failed for item", item.id, e);
        notifyUser(`Erreur de synchronisation pour l'élément hors-ligne`, 'error');
        await updateOfflineStatus(item.id, 'error', String(e));
        setOfflineObservations(prev => prev.map(o => o.id === item.id ? { ...o, status: 'error', error: String(e) } : o));
      }
    }
    setIsSyncing(false);
    if (syncedCount > 0) {
      triggerHaptic('success');
      notifyUser(`${syncedCount} observation(s) synchronisée(s) avec succès.`, 'success');
    }
  };

  useEffect(() => {
    if (isOnline && user) {
      syncOfflineData();
    }
  }, [isOnline, user]);

  useEffect(() => {
    if (!user || !isAuthReady) return;

    const q = isAdmin 
      ? query(
          collection(db, 'observations'),
          orderBy('createdAt', 'desc'),
          limit(100)
        )
      : query(
          collection(db, 'observations'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(50)
        );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const obs = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter((o: any) => isAdmin || !o.isDeletedByCreator);
      setObservations(obs);
      setIsObservationsLoading(false);
    }, (error: any) => {
      console.error("Observations listener error", error);
      setIsObservationsLoading(false);
      if (error.message.includes('Quota exceeded')) {
        setQuotaExceeded(true);
      }
    });

    return () => unsubscribe();
  }, [user, isAuthReady, isAdmin]);

  const handleCapture = async (input: File[] | ProcessedImage[], metadata: any) => {
    if (!user || input.length === 0) return;
    
    const uploadTaskId = "upload_" + Math.random().toString(36).substring(7);
    const analysisTaskId = "analysis_" + Math.random().toString(36).substring(7);
    
    // 0. Immediate feedback
    setBackgroundTasks(prev => [
      ...prev, 
      { id: uploadTaskId, type: 'upload', progress: 0 },
      { id: analysisTaskId, type: 'analysis', progress: 0 }
    ]);

    // 1. Initial compression / Processing
    const storageImages: { blob: Blob, mimeType: string }[] = [];
    const aiImages: { base64Image: string, mimeType: string }[] = [];
    let tempThumbUrl = "";

    const isProcessed = input.length > 0 && 'blob' in input[0];

    if (isProcessed) {
      const processed = input as ProcessedImage[];
      
      // 1.1 Create small thumbnail for Firestore (300px)
      try {
        const thumbRes = await compressImage(new File([processed[0].blob], "thumb.jpg"), 300, 300, 0.5);
        tempThumbUrl = thumbRes.dataUrl;
      } catch (e) {
        tempThumbUrl = processed[0].dataUrl;
      }

      // 1.2 Process all images for AI (768px) and Storage (1600px)
      for (const res of processed) {
        const file = new File([res.blob], "image.jpg", { type: res.mimeType });
        
        // For AI (Small)
        const aiRes = await compressImage(file, 768, 768, 0.7);
        aiImages.push({ base64Image: aiRes.dataUrl.split(',')[1], mimeType: res.mimeType });
        
        // For Storage (High)
        const storageRes = await compressImage(file, 1600, 1600, 0.8);
        storageImages.push({ blob: storageRes.blob, mimeType: res.mimeType });
      }
    } else {
      const files = input as File[];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // For AI (Small)
        const aiRes = await compressImage(file, 768, 768, 0.7);
        aiImages.push({ base64Image: aiRes.dataUrl.split(',')[1], mimeType: file.type });
        
        // For Storage (High)
        const storageRes = await compressImage(file, 1600, 1600, 0.8);
        storageImages.push({ blob: storageRes.blob, mimeType: file.type });
        
        // Thumbnail (only for first)
        if (i === 0) {
          const thumbRes = await compressImage(file, 300, 300, 0.5);
          tempThumbUrl = thumbRes.dataUrl;
        }
      }
    }

    // 1.5 Handle Offline Mode
    if (!isOnline) {
      const offlineId = crypto.randomUUID();
      const offlineObs: OfflineObservation = {
        id: offlineId,
        userId: user.uid,
        metadata: { ...metadata, variety: metadata.variety || "Captur Hors-ligne" },
        fileData: tempThumbUrl, // Store thumb for preview
        fileType: storageImages[0].mimeType,
        capturedAt: new Date().toISOString(),
        status: 'pending'
      };
      await saveOfflineObservation(offlineObs);
      setOfflineObservations(prev => [...prev, offlineObs]);
      setBackgroundTasks(prev => prev.filter(t => t.id !== uploadTaskId && t.id !== analysisTaskId));
      alert("Observation enregistrée localement dans la base de données interne.");
      return;
    }

    // 2. Create document IMMEDIATELY to prevent loss on refresh
    let docId = "";
    try {
      const observationData = {
        userId: user.uid,
        domain: metadata.domain || '',
        location: {
          lat: metadata.lat || 48.8566,
          lng: metadata.lng || 2.3522,
        },
        createdAt: serverTimestamp(),
        capturedAt: metadata.date || new Date().toISOString(),
        imageUrl: tempThumbUrl, // Use temp thumb until upload completes
        imageUrls: [tempThumbUrl],
        culture: metadata.culture || "En attente...",
        userNotes: metadata.notes || '',
        status: 'uploading',
        variety: metadata.variety || "Analyse en cours...",
        species: "En attente d'analyse IA...",
        family: "Prparation...",
        bbchDominant: "",
        bbchSecondary: [],
        organCounts: { flowers: 0, fruits: 0, details: "" },
        phenotypicTraits: { color: '...', shape: '...', size: '...', healthStatus: '...', diseasesOrDeficiencies: [] },
        description: "Envoi des photos en cours...",
        plantingDate: metadata.plantingDate || null,
        breeder: metadata.breeder || null,
        pruningDate: metadata.pruningDate || null,
        harvestQuantity: metadata.harvestQuantity || null,
        density: metadata.density || null,
        fruitFirmness: metadata.fruitFirmness || null,
        defects: metadata.defects || null,
        isDeletedByCreator: false
      };

      const docRef = await addDoc(collection(db, 'observations'), observationData);
      docId = docRef.id;
    } catch (error) {
      console.error("Failed to create initial document", error);
      setBackgroundTasks(prev => prev.filter(t => t.id !== uploadTaskId && t.id !== analysisTaskId));
      alert("Erreur lors de la cration de l'observation.");
      return;
    }

    // 3. Background process: Upload -> Update Doc -> AI Analysis
    (async () => {
      try {
        // 3.1 Upload sequentially
        const storageUrls = [];
        for (let i = 0; i < storageImages.length; i++) {
          const img = storageImages[i];
          const path = `observations/${user.uid}/${docId}_${i}.jpg`;
          
          let retryCount = 0;
          let success = false;
          let url = "";

          while (retryCount < 3 && !success) {
            try {
              url = await Promise.race([
                uploadImage(img.blob, path, (progress) => {
                  const currentProgress = ((i / storageImages.length) * 100) + (progress / storageImages.length);
                  setBackgroundTasks(prev => prev.map(t => t.id === uploadTaskId ? { ...t, progress: Math.round(currentProgress) } : t));
                }),
                new Promise<string>((_, reject) => 
                  setTimeout(() => reject(new Error(`Timeout image ${i}`)), 90000)
                )
              ]);
              success = true;
            } catch (e) {
              retryCount++;
              if (retryCount >= 3) throw e;
              await new Promise(r => setTimeout(r, 1000));
            }
          }
          storageUrls.push(url);
        }
        
        setBackgroundTasks(prev => prev.filter(t => t.id !== uploadTaskId));

        // 3.2 Update document
        await updateDoc(doc(db, 'observations', docId), {
          imageUrl: storageUrls[0],
          imageUrls: storageUrls,
          status: 'analyzing',
          description: "L'IA analyse vos photos...",
          variety: metadata.variety || "Analyse en cours...",
          species: "Analyse IA en cours...",
        });

        // 3.3 Run analysis
        try {
          await runBackgroundAnalysis(docId, aiImages, metadata, analysisTaskId, setBackgroundTasks);
          setBackgroundTasks(prev => prev.filter(t => t.id !== analysisTaskId));
        } catch (error) {
          console.error("Analysis failed", error);
          setBackgroundTasks(prev => prev.filter(t => t.id !== analysisTaskId));
          await updateDoc(doc(db, 'observations', docId), {
            status: 'error',
            description: "L'analyse IA a échoué. Vous pouvez réessayer manuellement."
          });
        }
      } catch (error) {
        console.error("Background process failed", error);
        setBackgroundTasks(prev => prev.filter(t => t.id !== uploadTaskId && t.id !== analysisTaskId));
        const errorMessage = error instanceof Error ? error.message : "Erreur de connexion";
        
        let displayError = errorMessage;
        if (errorMessage.includes("unauthorized") || errorMessage.includes("permission")) {
          displayError = "Erreur de permission: Vérifiez vos règles Firebase Storage. Autorisez l'accès à /observations.";
          alert("ERREUR FIREBASE STORAGE: L'envoi des images est bloqué car les règles de sécurité Firebase Storage ne sont pas configurées. Veuillez vous rendre sur la console Firebase, section Storage > Règles, et autoriser l'écriture.");
        }
        
        await updateDoc(doc(db, 'observations', docId), {
          status: 'error',
          description: `Échec du téléversement : ${displayError}`
        });
      }
    })();

    // 4. Clear UI immediately
    setAnalysis(null);
    setIsAnalyzing(false);
  };

  const handleSaveNotes = async () => {
    if (!editingId || !user) return;
    
    // Optimization: Avoid write if notes haven't changed
    if (userNotes === (analysis?.userNotes || '')) {
      setAnalysis(null);
      setEditingId(null);
      setUserNotes('');
      return;
    }

    try {
      await updateDoc(doc(db, 'observations', editingId), {
        userNotes: userNotes
      });
      setAnalysis(null);
      setEditingId(null);
      setUserNotes('');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'observations');
    }
  };

  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);

  const handleDelete = async (id: string) => {
    if (isDeleting === id) {
      try {
        if (isAdmin) {
          // Admin performs hard delete
          await deleteDoc(doc(db, 'observations', id));
        } else {
          // User performs soft delete (hidden from users, visible to admin)
          await updateDoc(doc(db, 'observations', id), { 
            isDeletedByCreator: true,
            deletedAt: serverTimestamp()
          });
        }
        
        if (editingId === id) {
          setAnalysis(null);
          setEditingId(null);
        }
        if (selectedObservation?.id === id) {
          setSelectedObservation(null);
        }
        setIsDeleting(null);
        triggerHaptic('heavy');
      } catch (e) {
        handleFirestoreError(e, isAdmin ? OperationType.DELETE : OperationType.UPDATE, 'observations');
        setIsDeleting(null);
        triggerHaptic('error');
      }
    } else {
      setIsDeleting(id);
      triggerHaptic('medium');
      // Auto-reset after 3 seconds if not confirmed
      setTimeout(() => setIsDeleting(prev => prev === id ? null : prev), 3000);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!isDeletingBulk) {
      setIsDeletingBulk(true);
      return;
    }
    
    try {
      const { writeBatch } = await import('firebase/firestore');
      const batch = writeBatch(db);
      
      for (const id of selectedIds) {
        if (isAdmin) {
          batch.delete(doc(db, 'observations', id));
        } else {
          batch.update(doc(db, 'observations', id), { 
            isDeletedByCreator: true,
            deletedAt: serverTimestamp()
          });
        }
      }
      
      await batch.commit();
      setSelectedIds([]);
      setIsSelectionMode(false);
      setIsDeletingBulk(false);
    } catch (e) {
      handleFirestoreError(e, isAdmin ? OperationType.DELETE : OperationType.UPDATE, 'observations');
      setIsDeletingBulk(false);
    }
  };

  const handleRetryAnalysis = async (id: string) => {
    const obs = observations.find(o => o.id === id);
    if (!obs) return;
    
    try {
      const taskId = "analysis_" + Math.random().toString(36).substring(7);
      setBackgroundTasks(prev => [...prev, { id: taskId, type: 'analysis', progress: 0 }]);
      
      // Fetch images to base64
      const processedImages = [];
      for (const url of obs.imageUrls || [obs.imageUrl]) {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Erreur lors de la récupération de l'image: ${response.statusText}`);
          const blob = await response.blob();
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(blob);
          });
          processedImages.push({ base64Image: base64, mimeType: blob.type, dataUrl: url });
        } catch (fetchError) {
          console.error("Fetch error for image", url, fetchError);
          let errMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
          if (errMsg.includes("Failed to fetch")) {
            throw new Error("Erreur CORS: Impossible de télécharger l'image depuis Firebase Storage. Les règles CORS de votre bucket Firebase Storage doivent être configurées pour autoriser votre domaine Vercel.");
          }
          throw fetchError;
        }
      }
      
      await runBackgroundAnalysis(id, processedImages, { variety: obs.variety }, taskId, setBackgroundTasks);
      setBackgroundTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (e) {
      console.error("Retry failed", e);
      alert("Erreur lors de la réinitialisation : " + (e instanceof Error ? e.message : "Erreur inconnue"));
      setBackgroundTasks(prev => prev.filter(t => t.type !== 'analysis'));
    }
  };

  const handleResetAnalysis = async (id: string) => {
    const obs = observations.find(o => o.id === id);
    if (!obs) return;
    
    if (!window.confirm("Voulez-vous réinitialiser l'analyse pour cette observation ?")) return;
    
    try {
      const taskId = "analysis_" + Math.random().toString(36).substring(7);
      setBackgroundTasks(prev => [...prev, { id: taskId, type: 'analysis', progress: 0 }]);
      
      await updateDoc(doc(db, 'observations', id), {
        status: 'analyzing',
        description: "Analyse réinitialisée. Traitement en cours..."
      });
      
      const fetchImages = async () => {
        const processedImages = [];
        for (const url of obs.imageUrls || [obs.imageUrl]) {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Erreur image: ${response.statusText}`);
          const blob = await response.blob();
          
          // Compress for AI (768px) to ensure reliability
          const file = new File([blob], "image.jpg", { type: blob.type });
          const aiRes = await compressImage(file, 768, 768, 0.7);
          
          processedImages.push({ 
            base64Image: aiRes.dataUrl.split(',')[1], 
            mimeType: blob.type, 
            dataUrl: aiRes.dataUrl 
          });
        }
        return processedImages;
      };

      const readyImages = await fetchImages();
      await runBackgroundAnalysis(id, readyImages, { variety: obs.variety }, taskId, setBackgroundTasks);
      setBackgroundTasks(prev => prev.filter(t => t.id !== taskId));
      
      if (editingId === id) {
        setAnalysis(prev => prev ? { ...prev, status: 'analyzing' } : null);
      }
      
      alert("Analyse réinitialisée !");
    } catch (e) {
      console.error("Reset failed", e);
      alert("Erreur lors de la réinitialisation.");
      await updateDoc(doc(db, 'observations', id), {
        status: 'error',
        description: "La réinitialisation de l'analyse a échoué."
      });
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const startEdit = (obs: any) => {
    setEditingId(obs.id);
    setAnalysis({
      family: obs.family,
      species: obs.species,
      variety: obs.variety,
      domain: obs.domain,
      status: obs.status,
      plantingDate: obs.plantingDate,
      breeder: obs.breeder,
      pruningDate: obs.pruningDate,
      harvestQuantity: obs.harvestQuantity,
      density: obs.density,
      fruitFirmness: obs.fruitFirmness,
      defects: obs.defects,
      phenologicalStage: obs.phenologicalStage,
      stageIntensity: obs.stageIntensity,
      stageQuality: obs.stageQuality,
      characterizationTraits: obs.characterizationTraits,
      phenotypicTraits: obs.phenotypicTraits,
      description: obs.description || '',
      imageUrls: obs.imageUrls || [obs.imageUrl],
      userNotes: obs.userNotes || ''
    });
    setCurrentImageIndex(0);
    setUserNotes(obs.userNotes || '');
    setActiveTab('scan');
  };

  const filteredObservations = useMemo(() => {
    const allObs = [
      ...offlineObservations.map(o => ({
        ...o,
        imageUrl: o.fileData,
        variety: o.metadata.variety || "Captur Hors-ligne",
        isOffline: true,
        createdAt: { toDate: () => new Date(o.capturedAt) }
      })),
      ...observations
    ];

    return allObs.filter(obs => {
      const matchesSearch = obs.variety?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           obs.species?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           obs.family?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesRegion = !regionFilter || obs.region === regionFilter;
      const matchesFamily = !familyFilter || obs.family === familyFilter;
      const matchesDomain = !domainFilter || obs.domain === domainFilter;

      const obsDate = obs.capturedAt ? new Date(obs.capturedAt) : (obs.createdAt?.toDate ? obs.createdAt.toDate() : new Date());
      
      let matchesDate = true;
      if (quickFilter === 'week') {
        const now = new Date();
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
        matchesDate = obsDate >= startOfWeek;
      } else if (quickFilter === 'month') {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        matchesDate = obsDate >= startOfMonth;
      } else if (quickFilter === 'quarter') {
        const now = new Date();
        const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        matchesDate = obsDate >= startOfQuarter;
      } else if (quickFilter === 'custom') {
        if (startDate) matchesDate = matchesDate && obsDate >= new Date(startDate);
        if (endDate) matchesDate = matchesDate && obsDate <= new Date(endDate + 'T23:59:59');
      }
      
      return matchesSearch && matchesRegion && matchesFamily && matchesDomain && matchesDate;
    });
  }, [observations, offlineObservations, searchQuery, regionFilter, familyFilter, domainFilter, startDate, endDate, quickFilter]);

  const handleRequestAccess = async () => {
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDocFromServer(userRef);
      
      if (userSnap.exists()) {
        await updateDoc(userRef, {
          accessStatus: 'pending'
        });
      } else {
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          role: 'viewer',
          accessStatus: 'pending',
          createdAt: serverTimestamp()
        });
      }
      alert(t.accessPending);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'users');
    }
  };

  const trendData = useMemo(() => {
    if (!analysis?.variety) return [];
    
    return observations
      .filter(o => o.variety === analysis.variety && o.harvestQuantity)
      .map(o => ({
        date: o.capturedAt ? new Date(o.capturedAt).toLocaleDateString() : o.createdAt?.toDate().toLocaleDateString(),
        quantity: parseFloat(o.harvestQuantity) || 0,
        timestamp: o.capturedAt ? new Date(o.capturedAt).getTime() : o.createdAt?.toDate().getTime()
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [observations, analysis]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#0d120f] flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          {quotaExceeded ? (
            <div className="p-6 bg-[#161c18] rounded-3xl shadow-xl border border-red-500/20 max-w-sm">
              <AlertCircle size={40} className="text-red-400 mx-auto mb-4" />
              <p className="text-slate-200 font-bold mb-2">{t.quotaExceeded}</p>
              <button onClick={() => window.location.reload()} className="text-emerald-400 font-bold text-sm hover:underline">{t.retry}</button>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">{t.loading}</p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!user || authMode === 'verifyEmail') {
    const titleParts = t.title.split(' ');
    const title1 = titleParts[0] || 'AgroScan';
    const title2 = titleParts.slice(1).join(' ') || 'IA';

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-[400px] bg-white rounded-3xl p-8 shadow-xl border border-slate-100 text-center relative overflow-hidden"
          dir={isArabic ? 'rtl' : 'ltr'}
        >

          {/* Removed Google authentication info overlay */}
          
          {quotaExceeded && (
            <div className="mb-6 p-5 bg-red-950/30 border border-red-900/50 rounded-3xl space-y-2">
              <div className="flex items-center gap-3 text-red-400 font-bold">
                <AlertCircle size={20} />
                <span>{t.quotaExceeded}</span>
              </div>
              <p className="text-xs text-red-400/80 leading-relaxed text-left">
                Votre projet Google Cloud semble avoir un "Quota Cap" (Plafonnement) actif. 
                Allez dans la console Google Cloud &gt; Quotas &gt; Cloud Firestore API et augmentez la limite "Read requests per day".
              </p>
            </div>
          )}
          {authMode === 'verifyEmail' ? (
            <div className="space-y-6">
              <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-100">
                <Mail className="text-blue-500" size={40} />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{t.verifyEmail}</h2>
              <p className="text-slate-600 text-sm font-medium leading-relaxed">
                {t.verifyEmailDesc}
              </p>
              <button 
                onClick={handleLogout}
                className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all border border-slate-200"
              >
                {t.back}
              </button>
            </div>
          ) : authMode === 'forgotPassword' ? (
            <div className="space-y-6 relative">
              <button 
                onClick={() => setAuthMode('login')}
                className="absolute -top-4 -left-4 p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <ArrowLeft size={20} className="text-slate-500" />
              </button>
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-100">
                <Lock className="text-emerald-500" size={32} />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{t.resetPassword}</h2>
              <div className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="email" 
                    placeholder={t.email}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  />
                </div>
                <button 
                  onClick={async () => {
                    setIsAuthLoading(true);
                    try {
                      await resetPassword(email);
                      alert(t.sendResetEmail);
                      setAuthMode('login');
                    } catch (e: any) {
                      setAuthError(e.message);
                    } finally {
                      setIsAuthLoading(false);
                    }
                  }}
                  disabled={isAuthLoading}
                  className="w-full py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all disabled:opacity-50"
                >
                  {isAuthLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div> : t.sendResetEmail}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100 relative overflow-hidden">
                <Leaf className="text-emerald-500 relative z-10" size={36} />
              </div>
              
              <div className="space-y-1 mb-8">
                <h1 className="text-2xl font-black tracking-tight mb-2 flex justify-center gap-2">
                  <span className="text-slate-900 uppercase">{title1}</span>
                  <span className="text-emerald-500 uppercase">{title2}</span>
                </h1>
                <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">{t.subtitle}</p>
              </div>

              <div className="text-slate-500 text-sm leading-relaxed mb-6 px-2">
                Connectez-vous pour commencer à numériser et analyser vos cultures avec l'IA.
              </div>

              {authError && (
                authError.includes('auth/unauthorized-domain') || authError.includes('unauthorized-domain') ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col gap-2 text-amber-800 text-sm text-left mb-6">
                    <div className="flex items-center gap-2 font-bold">
                      <AlertCircle className="shrink-0" size={18} />
                      <span>Domaine non autorisé</span>
                    </div>
                    <p className="opacity-90 leading-relaxed font-medium text-xs">
                      Le domaine n'est pas autorisé dans Firebase.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-sm font-medium mb-6 text-left">
                    <AlertCircle size={18} className="shrink-0 mt-0.5" />
                    <span>
                      {authError.includes('auth/invalid-credential') ? t.invalidCredentials : 
                       authError.includes('auth/too-many-requests') ? t.accountLocked : 
                       authError.includes('auth/network-request-failed') ? t.networkIssue : 
                       (authError.includes('GoogleAuth:') ? authError : t.authError + ' : ' + authError)}
                    </span>
                  </div>
                )
              )}

              <div className="flex flex-col gap-3">
                <button 
                  onClick={async () => {
                    setIsAuthLoading(true);
                    setAuthError(null);
                    setIsGoogleConnecting(true);
                    try {
                      await signInWithGoogle();
                    } catch (e: any) {
                      const errMsg = e.message || String(e);
                      if (errMsg.includes('12500')) {
                        setAuthError(`GoogleAuth: Erreur 12500 - L'ID de client OAuth web est manquant ou incorrect (veuillez configurer serverClientId).`);
                      } else if (errMsg.includes('10')) {
                        setAuthError(`GoogleAuth: Erreur 10 - Developer Error. Configuration de la signature SHA-1 non liée.`);
                      } else {
                        setAuthError(`GoogleAuth: ${errMsg}`);
                      }
                      setIsGoogleConnecting(false);
                    } finally {
                      setIsAuthLoading(false);
                    }
                  }}
                  className="w-full py-3 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-slate-50 transition-all shadow-sm cursor-pointer"
                >
                  <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                  {t.connect || "Se connecter avec Google"}
                </button>
              </div>

              <div className="relative mt-8 mb-6">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
                <div className="relative flex justify-center text-xs font-bold uppercase tracking-wider"><span className="bg-white px-4 text-slate-400">Ou avec email</span></div>
              </div>

              <div className="space-y-4">
                {authMode === 'signup' && (
                  <div className="relative">
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="Nom complet"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    />
                  </div>
                )}
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="email" 
                    placeholder={t.email}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="password" 
                    placeholder={t.password}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  />
                </div>

                {authMode === 'login' && (
                  <button 
                    onClick={() => setAuthMode('forgotPassword')}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-500 block ml-auto px-1"
                  >
                    {t.forgotPassword}
                  </button>
                )}

                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={async () => {
                    setIsAuthLoading(true);
                    setAuthError(null);
                    try {
                      if (authMode === 'login') {
                        await loginWithEmail(email, password);
                      } else {
                        await registerWithEmail(email, password, displayName);
                        setAuthMode('verifyEmail');
                      }
                    } catch (e: any) {
                      setAuthError(e.message);
                    } finally {
                      setIsAuthLoading(false);
                    }
                  }}
                  disabled={isAuthLoading}
                  className="w-full py-4 bg-emerald-600 border border-transparent text-white rounded-xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isAuthLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div> : (authMode === 'login' ? t.login : t.signup)}
                </motion.button>
              </div>

              <div className="pt-6">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.1em] mb-4">
                  SÉCURITÉ REQUISE
                </p>
                <p className="text-sm text-slate-600 font-medium">
                  {authMode === 'login' ? "Pas encore de compte ?" : "Déjà un compte ?"}
                  <button 
                    onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                    className="ml-2 text-emerald-600 font-bold hover:text-emerald-500 hover:underline"
                  >
                    {authMode === 'login' ? t.signup : t.login}
                  </button>
                </p>
              </div>
            </div>
          )}
        </motion.div>

        {/* Notifications UI */}
        <div className="fixed bottom-10 left-0 right-0 p-4 z-[200] flex flex-col gap-2 pointer-events-none items-center max-w-md mx-auto">
          <AnimatePresence>
            {appNotifications.map(n => (
              <motion.div
                key={n.id}
                initial={{ y: 50, opacity: 0, scale: 0.9 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 20, opacity: 0, scale: 0.9 }}
                className={`pointer-events-auto px-4 py-3 rounded-2xl flex items-center gap-3 shadow-xl max-w-sm w-full border ${
                  n.type === 'success' ? 'bg-emerald-500/90 border-emerald-500/20 text-white' : 
                  n.type === 'error' ? 'bg-red-500/90 border-red-500/20 text-white' : 
                  'bg-blue-500/90 border-blue-500/20 text-white'
                }`}
              >
                {n.type === 'success' && <CheckCircle size={20} className="shrink-0" />}
                {n.type === 'error' && <AlertCircle size={20} className="shrink-0" />}
                {n.type === 'info' && <Info size={20} className="shrink-0" />}
                <span className="text-sm font-medium">{n.message}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  if (!user.isAnonymous && (!userData || (userData.accessStatus !== 'approved' && !isAdmin))) {
    return (
      <div className="min-h-screen bg-[#0d120f] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-[#161c18] rounded-[40px] p-10 shadow-2xl shadow-emerald-900/10 border border-emerald-500/20 text-center"
          dir={isArabic ? 'rtl' : 'ltr'}
        >
          <div className="w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Info className="text-amber-400" size={40} />
          </div>
          
          {(!userData || userData.accessStatus === 'pending') ? (
            <>
              <h2 className="text-2xl font-black text-slate-200 tracking-tight mb-4">{t.accessPending}</h2>
              <p className="text-slate-500 font-medium mb-8 leading-relaxed">
                {t.accessPendingDesc}
              </p>
              {!userData && (
                <button 
                  onClick={handleRequestAccess}
                  className="w-full py-4 bg-gradient-to-r from-emerald-400 to-[#124227] text-[#0d120f] rounded-full font-black hover:opacity-90 shadow-[0_0_15px_rgba(52,211,153,0.2)] transition-all active:scale-95"
                >
                  {t.requestAccess}
                </button>
              )}
            </>
          ) : (
            <>
              <h2 className="text-2xl font-black text-red-800 tracking-tight mb-4">{t.accessRejected}</h2>
              <p className="text-slate-500 font-medium mb-8 leading-relaxed">
                {t.accessRejectedDesc}
              </p>
            </>
          )}

          <button 
            onClick={handleLogout}
            className="mt-6 text-slate-400 font-bold uppercase tracking-widest text-[10px] hover:text-slate-400 flex items-center justify-center gap-2 mx-auto"
          >
            <LogOut size={14} /> {t.logout}
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111412] text-slate-300 font-sans flex flex-col max-w-md mx-auto shadow-2xl border-x border-white/5" dir={isArabic ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="px-6 pb-6 pt-[calc(1.5rem+env(safe-area-inset-top))] bg-[#161c18] border-b border-white/5 flex justify-between items-center sticky top-0 z-50">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex gap-1 text-white">AgroScan <span className="text-emerald-400">IA</span></h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.1em]">AGRONOMIE</p>
            {!isOnline && <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[8px] font-bold rounded">OFFLINE</span>}
            {firebaseStatus === 'connected' && <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" title="Firebase Connect"></span>}
            {firebaseStatus === 'offline' && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" title="Mode Hors-ligne (Actif)"></span>}
            {firebaseStatus === 'error' && <span className="w-1.5 h-1.5 bg-red-500/100 rounded-full" title="Erreur Firebase"></span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsLightMode(!isLightMode)}
            className="w-10 h-10 rounded-full bg-[#0d120f] border border-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            title="Thème"
          >
            {isLightMode ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button 
            onClick={() => setShowLogoutConfirm(true)}
            className="w-10 h-10 rounded-full bg-[#0d120f] border border-white/5 flex items-center justify-center overflow-hidden hover:opacity-80 transition-opacity"
            title="Profil & Déconnexion"
          >
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Profil" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <UserIcon size={18} className="text-slate-400" />
            )}
          </button>
        </div>
      </header>

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 border-x border-white/5 max-w-md mx-auto"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#161c18] border border-red-500/20 rounded-3xl p-6 w-full shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-32 bg-red-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
              
              <div className="flex flex-col items-center text-center space-y-4 relative z-10">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-400 mb-2 border border-red-500/20">
                  <LogOut size={32} />
                </div>
                
                <h3 className="text-xl font-black text-white">Déconnexion</h3>
                <p className="text-sm text-slate-400">
                  Êtes-vous sûr de vouloir vous déconnecter ? Vous devrez vous reconnecter pour synchroniser vos données.
                </p>
                
                <div className="flex w-full gap-3 mt-6">
                  <button 
                    onClick={() => setShowLogoutConfirm(false)}
                    className="flex-1 py-3 px-4 rounded-xl font-bold text-sm bg-white/5 text-white hover:bg-white/10 transition-colors"
                  >
                    Annuler
                  </button>
                  <button 
                    onClick={() => {
                      setShowLogoutConfirm(false);
                      handleLogout();
                    }}
                    className="flex-1 py-3 px-4 rounded-xl font-bold text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                  >
                    Se déconnecter
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {quotaExceeded && (
        <div className="p-4 bg-red-500/10 border-b border-red-500/20 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-400 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-red-400">{t.quotaExceeded}</p>
            <p className="text-[10px] text-red-400 leading-tight">
              Votre projet Google Cloud a atteint sa limite de lecture gratuite (50k/jour). 
              Veuillez augmenter le "Quota Cap" dans la console Google Cloud.
            </p>
          </div>
        </div>
      )}

      {offlineObservations.length > 0 && (
        <div className={`p-4 border-b flex items-center justify-between transition-colors ${isSyncing ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
          <div className="flex items-center gap-3">
            {isSyncing ? (
              <RefreshCw size={18} className="text-emerald-500 animate-spin" />
            ) : (
              <Cloud size={18} className="text-amber-400" />
            )}
            <div>
              <p className={`text-xs font-bold uppercase tracking-wider ${isSyncing ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isSyncing ? "Synchronisation en cours..." : `${offlineObservations.length} observations en attente`}
              </p>
              {!isOnline && (
                <p className="text-[10px] text-amber-400 font-medium">En attente de connexion internet</p>
              )}
            </div>
          </div>
          {isOnline && !isSyncing && (
            <button 
              onClick={() => syncOfflineData()}
              className="px-3 py-1.5 bg-amber-600 text-white text-[10px] font-bold rounded-xl uppercase tracking-widest hover:bg-amber-700 transition-colors shadow-none"
            >
              Synchroniser
            </button>
          )}
        </div>
      )}

      {deferredPrompt && (
        <div className="p-4 bg-[#161c18] border-b border-white/5 text-emerald-400 flex items-center justify-between select-none">
          <div className="flex items-center gap-3">
            <Download size={20} className="shrink-0" />
            <div>
              <p className="text-sm font-bold leading-tight">Installer AgroScan IA</p>
              <p className="text-[10px] opacity-90">Accès hors-ligne, plein écran, capture rapide.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={async () => {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') setDeferredPrompt(null);
              }}
              className="px-4 py-1.5 bg-[#161c18] text-emerald-400 text-xs font-black rounded-lg uppercase tracking-widest shadow-none hover:scale-105 transition-transform"
            >
              Installer
            </button>
            <button onClick={() => setDeferredPrompt(null)} className="p-1 hover:bg-[#161c18]/20 rounded-full transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Background Tasks Global Notification */}
      <AnimatePresence>
        {backgroundTasks.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 bg-emerald-500/10 border-b border-emerald-500/20 space-y-2"
          >
            {backgroundTasks.map(task => (
              <div key={task.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    {task.type === 'upload' ? `Envoi des photos (${task.progress}%)...` : 'Analyse IA en cours...'}
                  </span>
                </div>
                <div className="text-[10px] font-bold text-emerald-400 bg-[#161c18] px-2 py-0.5 rounded-full border border-emerald-500/20">
                  ARRIRE-PLAN
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 pb-24">
        {activeTab === 'scan' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Admin Global Reset */}
            {canManage && (
              <button 
                onClick={handleGlobalReset}
                className="w-full p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-red-500/20 transition-colors"
              >
                <RefreshCw size={14} /> {t.allUsersReset}
              </button>
            )}

            {!analysis && (
              <CameraView 
                onCapture={handleCapture} 
                isOnline={isOnline} 
                onOpenMapPicker={() => setIsMapPickerOpen(true)}
                manualLocation={manualLocation}
                offlineQueueCount={offlineObservations.length}
              />
            )}

            {analysis && !isAnalyzing && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[#161c18] rounded-2xl shadow-xl shadow-emerald-900/5 border border-emerald-500/20 overflow-hidden"
              >
                {/* Image Carousel */}
                {(analysis as any).imageUrls && (analysis as any).imageUrls.length > 0 && (
                  <div className="relative aspect-video bg-[#0d120f] group">
                    <img 
                      src={(analysis as any).imageUrls[currentImageIndex]} 
                      alt="" 
                      className="w-full h-full object-contain"
                      onClick={() => setSelectedImage((analysis as any).imageUrls[currentImageIndex])}
                    />
                    {(analysis as any).imageUrls.length > 1 && (
                      <>
                        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5">
                          {(analysis as any).imageUrls.map((_: any, i: number) => (
                            <button 
                              key={i}
                              onClick={() => setCurrentImageIndex(i)}
                              className={`w-2 h-2 rounded-full transition-all ${currentImageIndex === i ? 'bg-[#161c18] w-4' : 'bg-[#161c18]/40'}`}
                            />
                          ))}
                        </div>
                        <button 
                          onClick={() => setCurrentImageIndex(prev => (prev === 0 ? (analysis as any).imageUrls.length - 1 : prev - 1))}
                          className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/20 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <ChevronRight className="rotate-180" size={20} />
                        </button>
                        <button 
                          onClick={() => setCurrentImageIndex(prev => (prev === (analysis as any).imageUrls.length - 1 ? 0 : prev + 1))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/20 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <ChevronRight size={20} />
                        </button>
                      </>
                    )}
                  </div>
                )}

                <div className="bg-[#161c18] border-b border-white/5 p-4 text-emerald-400 flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      {analysis.variety}
                      {analysis.status === 'pending' && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                    </h2>
                    <p className="text-sm opacity-90 italic">{analysis.species}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setShowTrend(!showTrend)}
                      className={`p-2 rounded-lg transition-colors ${showTrend ? 'bg-[#161c18] text-emerald-400' : 'bg-[#161c18]/20 hover:bg-[#161c18]/30'}`}
                      title="Tendance de récolte"
                    >
                      <TrendingUp size={18} />
                    </button>
                    <button 
                      onClick={() => { setAnalysis(null); setEditingId(null); setShowTrend(false); }}
                      className="p-2 bg-[#161c18]/20 rounded-lg hover:bg-[#161c18]/30"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
                
                <div className="p-5 space-y-6">
                  {showTrend && trendData.length > 0 && (
                    <div className="p-4 bg-[#0d120f] rounded-2xl border border-white/5">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-4">évolution de la récolte (Kg/pot)</h4>
                      <div className="h-48 w-full min-w-0 flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
                          <LineChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="date" fontSize={10} tickMargin={10} />
                            <YAxis fontSize={10} />
                            <Tooltip 
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            />
                            <Line type="monotone" dataKey="quantity" stroke="#059669" strokeWidth={3} dot={{ r: 4, fill: '#059669' }} activeDot={{ r: 6 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                  {analysis.status === 'pending' && (
                    <div className="p-4 bg-amber-500/10 text-amber-800 rounded-xl border border-amber-500/20 text-sm flex items-start gap-3">
                      <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mt-0.5"></div>
                      <p>L'analyse IA est en cours en arrire-plan. Vous pouvez continuer  utiliser l'application, les rsultats apparatront ici une fois termins.</p>
                    </div>
                  )}
                  {analysis.status === 'error' && (
                    <div className="p-4 bg-red-500/10 text-red-800 rounded-xl border border-red-500/20 text-sm flex items-start gap-3">
                      <X size={20} className="text-red-400 mt-0.5" />
                      <p>L'analyse IA a échoué. {analysis.description}</p>
                    </div>
                  )}
                  {analysis.domain && (
                    <div className="flex items-center gap-2 p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                      <MapIcon size={16} className="text-emerald-400" />
                      <div>
                        <p className="text-[10px] uppercase font-bold text-emerald-400/70">Domaine / Site</p>
                        <p className="text-sm font-medium">{analysis.domain}</p>
                      </div>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-[#0d120f] rounded-xl border border-white/5">
                      <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Famille</p>
                      <p className="text-sm font-medium">{analysis.family}</p>
                    </div>
                    <div className="p-3 bg-[#0d120f] rounded-xl border border-white/5">
                      <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Santé</p>
                      <p className="text-sm font-medium text-emerald-400">{analysis.phenotypicTraits?.healthStatus || "Non spécifié"}</p>
                    </div>
                  </div>

                  {analysis.phenologicalStage && (
                    <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 space-y-2">
                      <h4 className="text-[10px] font-bold text-emerald-400 uppercase">Stade Phnologique</h4>
                      <div className="flex justify-between items-end">
                        <p className="text-lg font-bold text-emerald-400 leading-tight">{analysis.phenologicalStage}</p>
                        <div className="text-right">
                          <p className="text-[10px] text-emerald-400/70 font-bold uppercase">Intensité / Qualité</p>
                          <p className="text-xs font-medium text-emerald-400">{analysis.stageIntensity}  {analysis.stageQuality}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {analysis.characterizationTraits && analysis.characterizationTraits.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase">Traits de Caractérisation</h4>
                      <div className="flex flex-wrap gap-2">
                        {analysis.characterizationTraits.map((trait, i) => (
                          <span key={i} className="px-2 py-1 bg-white/5 text-slate-400 rounded-lg text-[10px] font-medium border border-white/10">
                            {trait}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {(analysis.plantingDate || analysis.breeder || analysis.pruningDate || analysis.harvestQuantity || analysis.density || analysis.fruitFirmness || analysis.defects) && (
                    <div className="space-y-3 p-4 bg-[#0d120f] rounded-xl border border-white/5">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">Informations additionnelles</h4>
                      <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                        {analysis.plantingDate && (
                          <div><span className="text-slate-500 text-xs block">Date plantation</span><span className="font-medium">{analysis.plantingDate}</span></div>
                        )}
                        {analysis.pruningDate && (
                          <div><span className="text-slate-500 text-xs block">Date taille</span><span className="font-medium">{analysis.pruningDate}</span></div>
                        )}
                        {analysis.breeder && (
                          <div className="col-span-2"><span className="text-slate-500 text-xs block">Obtenteur</span><span className="font-medium">{analysis.breeder}</span></div>
                        )}
                        {analysis.harvestQuantity && (
                          <div><span className="text-slate-500 text-xs block">Qt récolte</span><span className="font-medium">{analysis.harvestQuantity} Kg/pot</span></div>
                        )}
                        {analysis.density && (
                          <div><span className="text-slate-500 text-xs block">Densit</span><span className="font-medium">{analysis.density}</span></div>
                        )}
                        {analysis.fruitFirmness && (
                          <div className="col-span-2"><span className="text-slate-500 text-xs block">Fermet</span><span className="font-medium">{analysis.fruitFirmness}</span></div>
                        )}
                        {analysis.defects && (
                          <div className="col-span-2"><span className="text-slate-500 text-xs block">Défauts</span><span className="font-medium">{analysis.defects}</span></div>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-2">
                      <Edit2 size={12} />
                      Notes de l'agronome
                    </h4>
                    <textarea 
                      value={userNotes}
                      onChange={(e) => setUserNotes(e.target.value)}
                      placeholder="Ajouter des observations sur le sol, le cléimat, le rendement..."
                      className="w-full p-3 bg-[#0d120f] rounded-xl border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 min-h-[100px]"
                    />
                  </div>

                  <button 
                    onClick={handleSaveNotes}
                    className="w-full py-3 bg-gradient-to-r from-emerald-400 to-[#124227] text-[#0d120f] rounded-full font-bold hover:opacity-90 shadow-[0_0_15px_rgba(52,211,153,0.2)] transition-colors flex items-center justify-center gap-2"
                  >
                    <Save size={18} />
                    Enregistrer l'observation
                  </button>

                  {canManage && editingId && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <button 
                        onClick={() => analysis?.status === 'error' ? handleRetryAnalysis(editingId) : handleResetAnalysis(editingId)}
                        className={`py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 border ${analysis?.status === 'error' ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700' : 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-100'}`}
                      >
                        {analysis?.status === 'error' ? <RefreshCw size={18} /> : <RefreshCw size={18} />}
                        {analysis?.status === 'error' ? 'Ressayer l\'analyse' : 'Réinitialiser'}
                      </button>
                      <button 
                        onClick={() => handleDelete(editingId)}
                        className={`py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 border ${isDeleting === editingId ? 'bg-red-600 text-white border-red-700' : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'}`}
                      >
                        <Trash2 size={18} />
                        {isDeleting === editingId ? 'Confirmer ?' : 'Supprimer'}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {!analysis && !isAnalyzing && observations.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex justify-between items-center">
                  Analyses Récentes
                  <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded-full">{observations.length}</span>
                </h3>
                {observations.slice(0, 5).map((obs) => (
                  <div key={obs.id} className="flex items-center gap-4 p-3 bg-[#161c18] rounded-xl border border-white/5 shadow-none group relative">
                    <div className="relative cursor-pointer" onClick={() => setSelectedObservation(obs)}>
                      <img src={obs.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover" />
                      {['pending', 'uploading', 'analyzing'].includes(obs.status) && (
                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center rounded-lg">
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      )}
                      {obs.status === 'error' && (
                        <div className="absolute -top-1 -right-1 bg-red-500/100 text-white p-0.5 rounded-full border-2 border-white">
                          <X size={10} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedObservation(obs)}>
                      <h4 className="font-bold text-slate-200 truncate">{obs.variety}</h4>
                      <p className={`text-xs truncate ${obs.status === 'error' ? 'text-red-400 font-medium' : 'text-slate-500'}`}>
                        {obs.status === 'error' ? 'échec de l\'analyse' : obs.species}
                      </p>
                      {obs.domain && <p className="text-[10px] text-emerald-400 truncate mt-0.5 flex items-center gap-1"><MapIcon size={10} />{obs.domain}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => startEdit(obs)}
                        className="p-2 text-slate-300 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all"
                      >
                        <Edit2 size={18} />
                      </button>
                      {(isAdmin || obs.userId === user?.uid) && (
                        <button 
                          onClick={() => handleDelete(obs.id)}
                          className={`p-2 rounded-lg transition-all flex items-center gap-1 ${isDeleting === obs.id ? 'bg-red-600 text-white' : 'text-slate-300 hover:text-red-400 hover:bg-red-500/10'}`}
                        >
                          {isDeleting === obs.id ? (
                            <>
                              <CheckSquare size={18} />
                              <span className="text-[10px] font-bold uppercase">Confirmer ?</span>
                            </>
                          ) : (
                            <Trash2 size={18} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}



        {activeTab === 'weather' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            {/* Weather Widget */}
            {weather ? (
              <WeatherCard 
                weather={weather} 
                t={t} 
                isArabic={isArabic} 
                onSearch={(q) => fetchWeather(undefined, undefined, q)}
                isLoading={isWeatherLoading}
                savedLocations={savedLocations}
                onSaveLocation={(loc) => {
                  const newLocs = [...savedLocations, loc];
                  setSavedLocations(newLocs);
                  localStorage.setItem('agro_saved_locations', JSON.stringify(newLocs));
                }}
                onRemoveLocation={(id) => {
                  const newLocs = savedLocations.filter((l: any) => l.id !== id);
                  setSavedLocations(newLocs);
                  localStorage.setItem('agro_saved_locations', JSON.stringify(newLocs));
                }}
                onSelectSavedLocation={(loc) => {
                  // Wait, we don't have lat, lng in loc, but we have name.
                  // Or we can save lat, lng in loc. 
                  // Because in handleToggleSave I didn't save lat lng. Let's rely on name search.
                  fetchWeather(undefined, undefined, loc.name);
                }}
              />
            ) : isWeatherLoading ? (
              <div className="p-8 bg-[#161c18] rounded-3xl border border-white/5 flex items-center justify-center gap-3">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.loading}</span>
              </div>
            ) : (
              <div className="p-6 bg-[#0d120f] btn-glass rounded-3xl border border-white/5 text-center flex flex-col items-center gap-4">
                <Cloud size={48} className="text-blue-500/50 mb-2" />
                <p className="text-sm font-bold text-slate-300">Impossible d'obtenir votre position</p>
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const input = form.elements.namedItem('city') as HTMLInputElement;
                    if (input.value) {
                      fetchWeather(undefined, undefined, input.value);
                    }
                  }}
                  className="w-full flex gap-2"
                >
                  <input 
                    name="city"
                    type="text" 
                    placeholder="Entrez une ville (ex: Paris)"
                    className="flex-1 px-4 py-2 bg-[#161c18]/50 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-blue-500"
                  />
                  <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded-xl font-bold text-sm">
                    Chercher
                  </button>
                </form>
                <div className="w-full flex items-center gap-4 my-2">
                  <div className="flex-1 h-px bg-white/10"></div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase">ou</span>
                  <div className="flex-1 h-px bg-white/10"></div>
                </div>
                <button 
                  onClick={async () => {
                    try {
                      const { Geolocation } = await import('@capacitor/geolocation');
                      const permissions = await Geolocation.requestPermissions();
                      if (permissions.location === 'denied') {
                        alert("Permission de localisation refusée. Activez-la dans les paramètres de votre appareil.");
                        return;
                      }
                      const pos = await Geolocation.getCurrentPosition({ timeout: 10000 });
                      fetchWeather(pos.coords.latitude, pos.coords.longitude);
                    } catch (err: any) {
                      alert(`Erreur de géolocalisation: ${err.message}`); 
                      console.log(err);
                    }
                  }}
                  className="w-full px-4 py-3 bg-[#161c18] border border-white/5 hover:bg-white/5 text-slate-300 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <MapPin size={16} /> Utiliser le GPS
                </button>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'map' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-[calc(100vh-200px)] flex flex-col"
          >
            <MapView 
              markers={observations.map(o => ({
                id: o.id,
                lat: o.location.lat,
                lng: o.location.lng,
                name: o.variety,
                variety: o.species,
                family: o.family,
                domain: o.domain,
                density: o.density,
                healthStatus: o.phenotypicTraits?.healthStatus,
                fullData: o
              }))} 
              onMarkerClick={(marker) => setSelectedObservation(marker.fullData)}
            />
          </motion.div>
        )}

        {activeTab === 'catalog' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6 pb-24"
          >
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-200">{t.catalog}</h2>
              <div className="flex gap-2">

                <button 
                  onClick={handleExportExcel}
                  className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg flex items-center gap-1 text-xs font-bold"
                  title={t.export}
                >
                  <Download size={16} />
                </button>
                {canManage && (
                  <>
                    <input
                      type="file"
                      id="bulk-csv-import"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleImportCSV}
                      className="hidden"
                    />
                    <button
                      onClick={() => document.getElementById('bulk-csv-import')?.click()}
                      disabled={isImportingCSV}
                      className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg flex items-center gap-1 text-xs font-bold hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                      title="Importer CSV / Excel historique"
                    >
                      {isImportingCSV ? (
                        <RefreshCw size={16} className="animate-spin" />
                      ) : (
                        <Upload size={16} />
                      )}
                    </button>
                  </>
                )}
                {canManage && (
                  <div className="flex gap-2">
                    {isSelectionMode ? (
                      <>
                        <button 
                          onClick={handleBulkDelete}
                          disabled={selectedIds.length === 0}
                          className={`p-2 rounded-lg disabled:opacity-50 flex items-center gap-1 text-xs font-bold transition-all ${isDeletingBulk ? 'bg-red-600 text-white' : 'bg-red-500/10 text-red-400'}`}
                        >
                          <Trash2 size={16} />
                          {isDeletingBulk ? 'Confirmer ?' : `(${selectedIds.length})`}
                        </button>
                        <button 
                          onClick={() => { setIsSelectionMode(false); setSelectedIds([]); }}
                          className="p-2 bg-white/5 text-slate-400 rounded-lg text-xs font-bold"
                        >
                          {t.cancel}
                        </button>
                      </>
                    ) : (
                      <button 
                        onClick={() => setIsSelectionMode(true)}
                        className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg flex items-center gap-1 text-xs font-bold"
                      >
                        <CheckSquare size={16} />
                        {t.select}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder={t.search}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-[#161c18] rounded-2xl border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="p-4 bg-[#161c18] rounded-2xl border border-white/5 space-y-4">
                <div className="flex bg-white/5 p-1 rounded-xl">
                  <button onClick={() => setQuickFilter('week')} className={`flex-1 py-2 text-[10px] font-bold rounded-lg transition-all ${quickFilter === 'week' ? 'bg-[#161c18] text-emerald-400 shadow-none' : 'text-slate-400'}`}>{t.week}</button>
                  <button onClick={() => setQuickFilter('month')} className={`flex-1 py-2 text-[10px] font-bold rounded-lg transition-all ${quickFilter === 'month' ? 'bg-[#161c18] text-emerald-400 shadow-none' : 'text-slate-400'}`}>{t.month}</button>
                  <button onClick={() => setQuickFilter('quarter')} className={`flex-1 py-2 text-[10px] font-bold rounded-lg transition-all ${quickFilter === 'quarter' ? 'bg-[#161c18] text-emerald-400 shadow-none' : 'text-slate-400'}`}>{t.quarter}</button>
                  <button onClick={() => setQuickFilter('custom')} className={`flex-1 py-2 text-[10px] font-bold rounded-lg transition-all ${quickFilter === 'custom' ? 'bg-[#161c18] text-emerald-400 shadow-none' : 'text-slate-400'}`}>{t.custom}</button>
                </div>

                {quickFilter === 'custom' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[8px] font-bold text-slate-400 uppercase ml-1">Du</label>
                      <input 
                        type="date" 
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full p-2 bg-[#0d120f] rounded-xl border border-white/10 text-xs focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-bold text-slate-400 uppercase ml-1">Au</label>
                      <input 
                        type="date" 
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full p-2 bg-[#0d120f] rounded-xl border border-white/10 text-xs focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <select 
                    value={regionFilter} 
                    onChange={(e) => setRegionFilter(e.target.value)}
                    className="p-2 bg-[#0d120f] rounded-xl border border-white/10 text-[10px] font-bold text-slate-400 focus:outline-none"
                  >
                    <option value="">{t.region}</option>
                    {MOROCCAN_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <select 
                    value={familyFilter} 
                    onChange={(e) => setFamilyFilter(e.target.value)}
                    className="p-2 bg-[#0d120f] rounded-xl border border-white/10 text-[10px] font-bold text-slate-400 focus:outline-none"
                  >
                    <option value="">{t.family}</option>
                    {Array.from(new Set(observations.map(o => o.family).filter(Boolean))).map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <select 
                    value={domainFilter} 
                    onChange={(e) => setDomainFilter(e.target.value)}
                    className="p-2 bg-[#0d120f] rounded-xl border border-white/10 text-[10px] font-bold text-slate-400 focus:outline-none"
                  >
                    <option value="">{t.domain}</option>
                    {Array.from(new Set(observations.map(o => o.domain).filter(Boolean))).map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                {(startDate || endDate || searchQuery || regionFilter || familyFilter || domainFilter) && (
                  <button 
                    onClick={() => { setStartDate(''); setEndDate(''); setSearchQuery(''); setRegionFilter(''); setFamilyFilter(''); setDomainFilter(''); setQuickFilter('week'); }}
                    className="text-[10px] text-emerald-400 font-bold uppercase hover:underline w-full text-center"
                  >
                    {t.reset}
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {isObservationsLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0.5 }}
                    animate={{ opacity: [0.5, 0.8, 0.5] }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.15
                    }}
                    className="bg-[#161c18] rounded-2xl border border-white/5 overflow-hidden shadow-none"
                  >
                    <div className="w-full aspect-square bg-white/5 relative overflow-hidden">
                      <motion.div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
                        animate={{ x: ['-100%', '100%'] }}
                        transition={{
                          duration: 1.6,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                      />
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="h-3 bg-white/5 rounded w-3/4 relative overflow-hidden">
                        <motion.div
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
                          animate={{ x: ['-100%', '100%'] }}
                          transition={{
                            duration: 1.6,
                            repeat: Infinity,
                            ease: "linear",
                          }}
                        />
                      </div>
                      <div className="h-2 bg-white/5 rounded w-1/2 relative overflow-hidden">
                        <motion.div
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
                          animate={{ x: ['-100%', '100%'] }}
                          transition={{
                            duration: 1.6,
                            repeat: Infinity,
                            ease: "linear",
                          }}
                        />
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : filteredObservations.length === 0 ? (
                <div className="col-span-2 py-20 text-center">
                  <div className="w-16 h-16 bg-[#0d120f] rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search className="text-slate-300" size={32} />
                  </div>
                  <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">{t.noResults}</p>
                </div>
              ) : filteredObservations.map((obs) => (
                <div 
                  key={obs.id} 
                  className={`bg-[#161c18] rounded-2xl border overflow-hidden shadow-none transition-all relative ${isSelectionMode && selectedIds.includes(obs.id) ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-white/5'}`}
                  onClick={() => isSelectionMode ? toggleSelection(obs.id) : undefined}
                >
                  {isSelectionMode && (
                    <div className="absolute top-2 left-2 z-20">
                      {selectedIds.includes(obs.id) ? (
                        <div className="bg-emerald-500 text-white rounded-md p-0.5 shadow-lg">
                          <CheckSquare size={16} />
                        </div>
                      ) : (
                        <div className="bg-[#161c18]/80 backdrop-blur-md text-slate-400 rounded-md p-0.5 border border-white/10 shadow-none">
                          <Square size={16} />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="relative group" onClick={() => {
                    if (isSelectionMode) {
                      toggleSelection(obs.id);
                      return;
                    }
                    setSelectedObservation(obs);
                  }}>
                    <img src={obs.imageUrl} alt="" className="w-full aspect-square object-cover" />
                    
                    {['pending', 'uploading', 'analyzing'].includes(obs.status) && (
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                    
                    {/* Soft Delete Badge for Admins */}
                    {isAdmin && obs.isDeletedByCreator && (
                      <div className="absolute top-2 left-2 bg-red-500/100 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-lg uppercase tracking-widest z-20 flex items-center gap-1">
                        <Trash2 size={10} />
                        Supprimé par l'utilisateur
                      </div>
                    )}

                    {/* New Badge */}
                    {obs.createdAt && (Date.now() - (obs.createdAt.seconds * 1000)) < 120000 && (
                      <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-lg animate-bounce uppercase tracking-widest z-10">
                        Nouveau
                      </div>
                    )}

                    {obs.imageUrls && obs.imageUrls.length > 1 && (
                      <div className="absolute top-2 left-2 bg-black/50 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1">
                        <ImageIcon size={10} />
                        {obs.imageUrls.length}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Maximize2 className="text-white" size={24} />
                    </div>
                  </div>
                  
                  <div onClick={() => !isSelectionMode && startEdit(obs)}>
                    {obs.isOffline ? (
                      <div className="absolute top-2 right-2 flex gap-1">
                        <button 
                          onClick={(e) => { e.stopPropagation(); if(confirm("Supprimer cette observation locale ?")) deleteOfflineObservation(obs.id).then(() => setOfflineObservations(prev => prev.filter(o => o.id !== obs.id))); }}
                          className="bg-red-500/100/90 backdrop-blur-sm p-1.5 rounded-full shadow-none hover:bg-red-600 transition-colors"
                        >
                          <Trash2 size={12} className="text-white" />
                        </button>
                        <div className="bg-amber-500/90 backdrop-blur-sm p-1.5 rounded-full shadow-none" title={obs.status === 'error' ? `Erreur: ${obs.error}` : "En attente de connexion"}>
                          {obs.status === 'syncing' ? (
                            <RefreshCw size={12} className="text-white animate-spin" />
                          ) : obs.status === 'error' ? (
                            <AlertCircle size={12} className="text-white" />
                          ) : (
                            <Cloud size={12} className="text-white" />
                          )}
                        </div>
                      </div>
                    ) : ['pending', 'uploading', 'analyzing'].includes(obs.status) && (
                      <div className="absolute top-2 right-2 bg-[#161c18]/80 backdrop-blur-md p-1.5 rounded-full shadow-none">
                        <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                    {obs.status === 'error' && (
                      <div className="absolute top-2 right-2 bg-red-500/100 text-white p-1 rounded-full shadow-none">
                        <X size={14} />
                      </div>
                    )}

                    <div className="p-3">
                      <h4 className="font-bold text-sm text-slate-200 truncate">{obs.variety}</h4>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">{obs.family}</p>
                      <div className="flex justify-between items-center mt-1">
                        {obs.domain && <p className="text-[10px] text-emerald-400 truncate flex items-center gap-1"><MapIcon size={10} />{obs.domain}</p>}
                        <p className="text-[8px] text-slate-400 font-medium">
                          {obs.capturedAt ? new Date(obs.capturedAt).toLocaleDateString() : obs.createdAt?.toDate().toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {filteredObservations.length === 0 && (
              <div className="text-center py-12">
                <Search size={48} className="mx-auto text-slate-200 mb-4" />
                <p className="text-slate-500 text-sm">Aucun rsultat ne correspond  vos critères.</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'admin' && isAdmin && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <AdminView t={t} isArabic={isArabic} onObservationClick={setSelectedObservation} />
          </motion.div>
        )}
      </main>

      {/* Fullscreen Image Viewer */}
      {/* Modals */}
      <AnimatePresence>
        {selectedObservation && (
          <ObservationDetail 
            observation={selectedObservation} 
            onClose={() => setSelectedObservation(null)} 
            t={t} 
            isArabic={isArabic} 
            isAdmin={isAdmin}
            onDelete={handleDelete}
            isDeleting={isDeleting}
            onRetry={handleRetryAnalysis}
            onDownload={handleDownloadImage}
            language={language}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-4"
          >
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute top-6 right-6 p-3 bg-[#161c18]/10 hover:bg-[#161c18]/20 rounded-full text-white transition-colors"
            >
              <X size={24} />
            </button>
            <img 
              src={selectedImage} 
              alt="Observation haute qualité" 
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              referrerPolicy="no-referrer"
            />
            <button 
              onClick={() => handleDownloadImage(selectedImage, `agroscan_full_${Date.now()}.jpg`)}
              className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-400 to-[#124227] text-[#0d120f] rounded-full font-bold shadow-[0_0_15px_rgba(52,211,153,0.2)] hover:opacity-90 transition-all active:scale-95"
            >
              <Download size={20} />
              Télécharger l'image
            </button>
            <div className="absolute bottom-10 left-0 right-0 text-center">
              <p className="text-white/60 text-xs font-medium uppercase tracking-widest">Format Optimal / Qualité Maximale</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map Picker Modal */}
      <AnimatePresence>
        {isMapPickerOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#161c18] w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[80vh]"
            >
              <div className="p-4 bg-[#161c18] border-b border-white/5 text-emerald-400 flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2"><MapPin size={18} /> {t.manualLocation}</h3>
                <button onClick={() => setIsMapPickerOpen(false)} className="p-1 hover:bg-[#161c18]/20 rounded-full transition-colors"><X size={20} /></button>
              </div>
              <div className="flex-1 relative">
                <MapView 
                  markers={manualLocation ? [{ id: 'manual', lat: manualLocation.lat, lng: manualLocation.lng, name: 'Sélection', variety: 'Manuel' }] : []}
                  onMapClick={(lat, lng) => setManualLocation({ lat, lng })}
                />
                <div className="absolute top-4 left-4 right-4 bg-[#161c18]/80 backdrop-blur-md p-3 rounded-xl shadow-lg text-[10px] font-medium text-slate-400 border border-white/10">
                  Cliquez sur la carte pour dfinir la position exacte de l'observation.
                </div>
              </div>
              <div className="p-4 border-t border-white/5 bg-[#0d120f]">
                <button 
                  onClick={() => setIsMapPickerOpen(false)}
                  disabled={!manualLocation}
                  className="w-full py-3 bg-gradient-to-r from-emerald-400 to-[#124227] text-[#0d120f] rounded-full font-bold hover:opacity-90 shadow-[0_0_15px_rgba(52,211,153,0.2)] transition-colors disabled:opacity-50"
                >
                  Confirmer la position
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ChatBot />

      {/* Bottom Navigation - Liquid Glass Style */}
      <nav className="fixed bottom-6 left-4 right-4 max-w-md mx-auto bg-white/5 backdrop-blur-3xl border border-white/10 p-2 rounded-[2.5rem] flex justify-around items-center z-50 shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.2)]">
        <div className="absolute -top-3 right-6 flex items-center gap-1.5 bg-[#161c18] border border-white/10 rounded-full px-2.5 py-1 shadow-lg pointer-events-none">
          <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? (offlineObservations.length === 0 ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse') : 'bg-red-500'}`} />
          <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
            {!isOnline ? 'Hors ligne' : (offlineObservations.length > 0 ? (isSyncing ? 'Sync...' : `${offlineObservations.length} en attente`) : 'Synchronisé')}
          </span>
        </div>
        
        <button 
          onClick={() => setActiveTab('map')}
          className={`group flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'map' ? 'text-emerald-400 scale-110' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <div className={`p-2.5 rounded-2xl transition-all duration-300 ${activeTab === 'map' ? 'btn-glass-primary shadow-[0_0_15px_rgba(52,211,153,0.3)]' : 'group-hover:btn-glass btn-glass bg-transparent border-transparent shadow-none'}`}>
            <MapIcon size={20} strokeWidth={activeTab === 'map' ? 2.5 : 2} />
          </div>
          <span className={`text-[8px] font-black uppercase tracking-widest transition-opacity ${activeTab === 'map' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>{t.map}</span>
        </button>

        <button 
          onClick={() => setActiveTab('weather')}
          className={`group flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'weather' ? 'text-blue-400 scale-110' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <div className={`p-2.5 rounded-2xl transition-all duration-300 ${activeTab === 'weather' ? 'btn-glass shadow-[0_0_15px_rgba(59,130,246,0.3)] text-blue-400 border-blue-400/30' : 'group-hover:btn-glass btn-glass bg-transparent border-transparent shadow-none'}`}>
            <Cloud size={20} strokeWidth={activeTab === 'weather' ? 2.5 : 2} />
          </div>
          <span className={`text-[8px] font-black uppercase tracking-widest transition-opacity ${activeTab === 'weather' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>{t.weather}</span>
        </button>

        <button 
          onClick={() => { setActiveTab('scan'); setAnalysis(null); triggerHaptic('light'); }}
          className="relative -top-6"
        >
          <div className={`p-4 rounded-full shadow-[0_15px_35px_rgba(0,0,0,0.5)] transition-all duration-500 active:scale-90 ${activeTab === 'scan' ? 'btn-glass-primary scale-110 ring-4 ring-emerald-500/20' : 'btn-glass-primary hover:scale-105'}`}>
            <Plus size={32} strokeWidth={3} className="text-emerald-300 drop-shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
          </div>
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2">
            <span className={`text-[8px] font-black uppercase tracking-widest transition-all duration-300 ${activeTab === 'scan' ? 'text-emerald-400 opacity-100' : 'text-slate-400 opacity-0'}`}>{t.scan}</span>
          </div>
        </button>

        <button 
          onClick={() => setActiveTab('catalog')}
          className={`group flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'catalog' ? 'text-emerald-400 scale-110' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <div className={`p-2.5 rounded-2xl transition-all duration-300 ${activeTab === 'catalog' ? 'btn-glass-primary shadow-[0_0_15px_rgba(52,211,153,0.3)]' : 'group-hover:btn-glass btn-glass bg-transparent border-transparent shadow-none'}`}>
            <Book size={20} strokeWidth={activeTab === 'catalog' ? 2.5 : 2} />
          </div>
          <span className={`text-[8px] font-black uppercase tracking-widest transition-opacity ${activeTab === 'catalog' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>{t.catalog}</span>
        </button>

        {isAdmin && (
          <button 
            onClick={() => setActiveTab('admin')}
            className={`group flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'admin' ? 'text-emerald-400 scale-110' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <div className={`p-2.5 rounded-2xl transition-all duration-300 ${activeTab === 'admin' ? 'btn-glass-primary shadow-[0_0_15px_rgba(52,211,153,0.3)]' : 'group-hover:btn-glass btn-glass bg-transparent border-transparent shadow-none'}`}>
              <RefreshCw size={20} strokeWidth={activeTab === 'admin' ? 2.5 : 2} />
            </div>
            <span className={`text-[8px] font-black uppercase tracking-widest transition-opacity ${activeTab === 'admin' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>{t.admin}</span>
          </button>
        )}
      </nav>

      {/* Notifications UI */}
      <div className="fixed bottom-24 left-0 right-0 p-4 z-[200] flex flex-col gap-2 pointer-events-none items-center max-w-md mx-auto">
        <AnimatePresence>
          {appNotifications.map(n => (
            <motion.div
              key={n.id}
              initial={{ y: 50, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.9 }}
              className={`pointer-events-auto px-4 py-3 rounded-2xl flex items-center gap-3 shadow-xl max-w-sm w-full border ${
                n.type === 'success' ? 'bg-emerald-500/90 border-emerald-500/20 text-white' : 
                n.type === 'error' ? 'bg-red-500/90 border-red-500/20 text-white' : 
                'bg-blue-500/90 border-blue-500/20 text-white'
              }`}
            >
              {n.type === 'success' && <CheckCircle size={20} className="shrink-0" />}
              {n.type === 'error' && <AlertCircle size={20} className="shrink-0" />}
              {n.type === 'info' && <Info size={20} className="shrink-0" />}
              <span className="text-sm font-medium">{n.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
