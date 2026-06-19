import { ImageClassifier, FilesetResolver } from '@mediapipe/tasks-vision';

let imageClassifier: ImageClassifier | null = null;
let currentModelPath: string | null = null;

/**
 * Initializes the LiteRT (MediaPipe) Image Classifier with a dynamic path
 */
export async function initLiteRT(modelPath: string = "/assets/models/plant_classifier.tflite") {
  if (imageClassifier && currentModelPath === modelPath) return imageClassifier;

  console.log(`[LiteRT] Initializing engine with model: ${modelPath}`);

  try {
    // 1. Verify file exists and is NOT a HTML/SPA redirection page before MediaPipe loads it
    try {
      const response = await fetch(modelPath);
      if (!response.ok) {
        throw new Error(`Le fichier modèle n'a pas pu être récupéré (Status: ${response.status}).`);
      }
      
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        throw new Error(`Fichier modèle manquant ou invalide : le serveur a renvoyé une page HTML (redirection 404) au lieu du fichier binaire '.tflite'.`);
      }

      // Read first few bytes to check for HTML tag headers
      const reader = response.body?.getReader();
      if (reader) {
        const { value } = await reader.read();
        reader.cancel(); // Immediately release resources
        if (value) {
          const textHeader = new TextDecoder().decode(value.slice(0, 100)).trim();
          if (textHeader.startsWith('<!DOCTYPE') || textHeader.startsWith('<html') || textHeader.includes('<head')) {
            throw new Error(`Fichier modèle manquant : redirection d'URL active. Le fichier '${modelPath.split('/').pop()}' est manquant dans '/public/assets/models/'.`);
          }
        }
      }
    } catch (e: any) {
      console.warn(`[LiteRT] Model verification failed:`, e.message);
      throw new Error(e.message || `Assurez-vous d'avoir placé le modèle '${modelPath.split('/').pop()}' dans le dossier 'public/assets/models/'.`);
    }

    // Force cleanup of old instance if model changed
    if (imageClassifier) {
      console.log(`[LiteRT] Closing previous instance...`);
      try {
        imageClassifier.close();
      } catch (err) {
        console.warn(`[LiteRT] Failed to close old stance gracefully`, err);
      }
      imageClassifier = null;
    }

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    
    // Attempt initialization with CPU delegate first or GPU fallback for ultimate stability.
    // WebAssembly memory can easily crash on mobile/iframe embedded environments if GPU WebGL context fails.
    try {
      console.log(`[LiteRT] Creating image classifier with CPU delegate for standard memory footprint...`);
      imageClassifier = await ImageClassifier.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: "CPU"
        },
        runningMode: "IMAGE",
        maxResults: 5,
        scoreThreshold: 0.35
      });
    } catch (cpuError: any) {
      console.warn(`[LiteRT] CPU creation error, trying auto delegate...`, cpuError);
      imageClassifier = await ImageClassifier.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath
        },
        runningMode: "IMAGE",
        maxResults: 5,
        scoreThreshold: 0.35
      });
    }

    currentModelPath = modelPath;
    console.log(`[LiteRT] Engine successfully initialized with ${modelPath}`);
    return imageClassifier;
  } catch (error: any) {
    console.error("[LiteRT] Engine initialization failed:", error.message || error);
    return null;
  }
}

/**
 * Performs offline analysis using the loaded LiteRT model
 */
export async function analyzeOffline(imageElement: HTMLImageElement | HTMLCanvasElement, modelPath?: string) {
  const classifier = await initLiteRT(modelPath);
  if (!classifier) {
    throw new Error("Local analysis engine (LiteRT) not initialized. Check if the model exists.");
  }

  const results = classifier.classify(imageElement);
  
  if (results.classifications.length > 0) {
    const topResult = results.classifications[0].categories[0];
    
    // Transform LiteRT results into our PlantAnalysis format (partial)
    return {
      family: "Non identifiée (Offline)",
      species: topResult.categoryName || "Inconnue",
      variety: "Non identifiée (Offline)",
      culture: topResult.categoryName,
      phenologicalStage: "Non analysé en mode hors-ligne",
      phenotypicTraits: {
        color: "Non analysé",
        shape: "Non analysé",
        size: "Non analysé",
        healthStatus: "Confiance: " + Math.round(topResult.score * 100) + "%",
        diseasesOrDeficiencies: []
      },
      description: `Analyse locale effectuée avec LiteRT (Modèle: plant_classifier.tflite). Résultat: ${topResult.categoryName} (${Math.round(topResult.score * 100)}% de confiance).`,
      status: 'completed'
    };
  }

  throw new Error("No identification found with local model.");
}
