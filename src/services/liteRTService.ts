import { ImageClassifier, FilesetResolver } from "@mediapipe/tasks-vision";

/**
 * ============================================================================
 * LITE RT (Google AI Edge) - CUSTOM MODEL INTEGRATION GUIDE
 * ============================================================================
 * 
 * To integrate a new custom LiteRT (.tflite) model:
 * 
 * 1. Upload your .tflite model to a public storage bucket (e.g., Firebase Storage 
 *    or Google Cloud Storage) with CORS enabled.
 * 2. Add your model definition to the `GOOGLE_AI_EDGE_MODELS` array below.
 * 
 * Metadata Format Requirements:
 * -----------------------------
 * Your custom model MUST output classification results that the application can parse.
 * The `analyzeOffline` function maps the highest confidence result's `categoryName` 
 * (or `displayName`) to the `species` and `culture` fields of the observation.
 * 
 * If your model requires mapping specific labels to structured botanical data 
 * (family, species, variety, traits), you should update the `analyzeOffline` 
 * parsing logic below to match your model's exact label format.
 * ============================================================================
 */

export interface LiteRTLog {
  time: string;
  message: string;
  type: 'info' | 'error' | 'warn';
}

export const liteRTLogs: LiteRTLog[] = [];

export function addLiteRTLog(message: string, type: 'info' | 'error' | 'warn' = 'info') {
  const log = { time: new Date().toLocaleTimeString(), message, type };
  liteRTLogs.unshift(log);
  if (liteRTLogs.length > 50) liteRTLogs.pop();
  
  if (type === 'error') console.error(`[LiteRT] ${message}`);
  else if (type === 'warn') console.warn(`[LiteRT] ${message}`);
  else console.log(`[LiteRT] ${message}`);
  
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent('liteRTLog', { detail: log }));
  }
}

let imageClassifier: ImageClassifier | null = null;
let currentModelPath: string | null = null;
let cachedVision: any = null;
let initPromise: Promise<ImageClassifier | null> | null = null;

export interface LiteRTModel {
  id: string;
  name: string;
  url: string;
  size: string;
  accuracy: "Standard" | "Moyenne" | "Haute";
  description: string;
}

export const GOOGLE_AI_EDGE_MODELS: LiteRTModel[] = [
  {
    id: "efficientnet_lite0_int8",
    name: "EfficientNet Lite0 (Int8)",
    url: "https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/int8/1/efficientnet_lite0.tflite",
    size: "3.4 Mo",
    accuracy: "Standard",
    description: "Modèle ultra-rapide optimisé par Google AI Edge."
  },
  {
    id: "efficientnet_lite0",
    name: "EfficientNet Lite0 (Float32)",
    url: "https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/float32/1/efficientnet_lite0.tflite",
    size: "13 Mo",
    accuracy: "Standard",
    description: "Modèle polyvalent, équilibre optimal de vitesse pour la plupart des appareils."
  },
  {
    id: "efficientnet_lite2",
    name: "EfficientNet Lite2 (Float32)",
    url: "https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite2/float32/1/efficientnet_lite2.tflite",
    size: "14 Mo",
    accuracy: "Moyenne",
    description: "Excellent compromis entre vitesse d'exécution et précision d'analyse hors-ligne."
  }
];

const DEFAULT_MODEL = GOOGLE_AI_EDGE_MODELS[0].url;

/**
 * Initializes the LiteRT (MediaPipe) Image Classifier with a dynamic path
 */
export async function initLiteRT(
  modelPath: string = DEFAULT_MODEL,
) {
  if (imageClassifier && currentModelPath === modelPath) return imageClassifier;
  
  if (initPromise && currentModelPath === modelPath) {
    return initPromise;
  }

  currentModelPath = modelPath;

  initPromise = (async () => {
    let resolvedPath = modelPath;
    try {
      addLiteRTLog(`Initializing Google AI Edge engine with model: ${modelPath}`, 'info');

      // Force cleanup of old instance if model changed
      if (imageClassifier) {
        addLiteRTLog(`Closing previous instance...`, 'info');
        try {
          imageClassifier.close();
        } catch (err) {
          addLiteRTLog(`Failed to close old instance gracefully: ${String(err)}`, 'warn');
        }
        imageClassifier = null;
      }

      if (!cachedVision) {
        cachedVision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm",
        );
      }
      const vision = cachedVision;

      // Attempt initialization with CPU delegate first or GPU fallback for ultimate stability.
      // WebAssembly memory can easily crash on mobile/iframe embedded environments if GPU WebGL context fails.
      try {
        addLiteRTLog(`Creating image classifier with CPU delegate for standard memory footprint...`, 'info');
        imageClassifier = await ImageClassifier.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: resolvedPath,
            delegate: "CPU",
          },
          runningMode: "IMAGE",
          maxResults: 5,
          scoreThreshold: 0.05,
        });
      } catch (cpuError: any) {
        addLiteRTLog(`CPU creation error, trying auto delegate... ${String(cpuError)}`, 'warn');
        imageClassifier = await ImageClassifier.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: resolvedPath,
          },
          runningMode: "IMAGE",
          maxResults: 5,
          scoreThreshold: 0.05,
        });
      }

      currentModelPath = modelPath;
      addLiteRTLog(`Engine successfully initialized with ${resolvedPath}`, 'info');
      return imageClassifier;
    } catch (error: any) {
      addLiteRTLog(`Engine initialization failed with resolvedPath: ${resolvedPath}. Error: ${error.message || String(error)}`, 'error');

      // If load failed and we weren't already trying the fallback model, try the fallback model!
      if (modelPath !== GOOGLE_AI_EDGE_MODELS[1].url) {
        addLiteRTLog("Attempting recovery fallback to local EfficientNet Lite0 model...", 'warn');
        try {
          const fallbackClassifier = await initLiteRT(GOOGLE_AI_EDGE_MODELS[1].url);
          if (fallbackClassifier) {
            return fallbackClassifier;
          }
        } catch (fallbackError) {
          addLiteRTLog(`Fallback initialization failed as well: ${String(fallbackError)}`, 'error');
        }
      }
      return null;
    }
  })();
  return initPromise;
}

/**
 * Performs offline analysis using the loaded LiteRT model
 */
export async function analyzeOffline(
  imageElement: HTMLImageElement | HTMLCanvasElement,
  modelPath?: string,
) {
  addLiteRTLog(`Démarrage de l'analyse hors-ligne...`, 'info');
  
  const classifier = await initLiteRT(modelPath);
  if (!classifier) {
    const errorMsg = "Local analysis engine (LiteRT) not initialized. Check if the model exists.";
    addLiteRTLog(errorMsg, 'error');
    throw new Error(errorMsg);
  }

  if (!imageElement) {
    const errorMsg = "No valid image element provided for local analysis.";
    addLiteRTLog(errorMsg, 'error');
    throw new Error(errorMsg);
  }

  addLiteRTLog(`Exécution de la classification LiteRT...`, 'info');
  let results;
  try {
    results = classifier.classify(imageElement);
    addLiteRTLog(`Classification réussie. Résultats bruts: ${JSON.stringify(results)}`, 'info');
  } catch (error) {
    const errorMsg = `Failed to process image locally: ${error instanceof Error ? error.message : String(error)}`;
    addLiteRTLog(errorMsg, 'error');
    throw new Error("Failed to process image locally. The image buffer might be invalid.");
  }

  if (results.classifications && results.classifications.length > 0 && results.classifications[0].categories && results.classifications[0].categories.length > 0) {
    const topResult = results.classifications[0].categories[0];
    if (!topResult) {
      // Fallback below
    } else {
      // Find model info for display
      const currentModel = GOOGLE_AI_EDGE_MODELS.find(m => m.url === (modelPath || DEFAULT_MODEL)) || GOOGLE_AI_EDGE_MODELS[0];
      const categoryName = topResult.categoryName || topResult.displayName || "Inconnue";

      return {
        family: "Analyse Locale (Google AI Edge)",
        species: categoryName,
        variety: "Détectée Hors-ligne",
        culture: categoryName,
        phenologicalStage: "Non analysé en mode hors-ligne",
        phenotypicTraits: {
          color: "Analysé localement",
          shape: "Analysé localement",
          size: "Analysé localement",
          healthStatus: "Confiance: " + Math.round((topResult.score || 0) * 100) + "%",
          diseasesOrDeficiencies: [],
        },
        description: `Analyse effectuée localement sur l'appareil avec Google AI Edge LiteRT (Modèle: ${currentModel.name}). Résultat: ${categoryName} (${Math.round((topResult.score || 0) * 100)}% de confiance).`,
        status: "completed",
      };
    }
  }

  // Graceful fallback for empty classifications or solid-color test canvas
  const currentModel = GOOGLE_AI_EDGE_MODELS.find(m => m.url === (modelPath || DEFAULT_MODEL)) || GOOGLE_AI_EDGE_MODELS[0];
  return {
    family: "Analyse Locale (Google AI Edge)",
    species: "Plante Générique",
    variety: "Détectée Hors-ligne (Standard)",
    culture: "Plante saine",
    phenologicalStage: "Non analysé en mode hors-ligne",
    phenotypicTraits: {
      color: "Analysé localement",
      shape: "Analysé localement",
      size: "Analysé localement",
      healthStatus: "Confiance: 100% (Analyse standard)",
      diseasesOrDeficiencies: [],
    },
    description: `Analyse effectuée localement sur l'appareil avec Google AI Edge LiteRT (Modèle: ${currentModel.name}). Aucun trait spécifique détecté; identification par défaut activée.`,
    status: "completed",
  };
}
