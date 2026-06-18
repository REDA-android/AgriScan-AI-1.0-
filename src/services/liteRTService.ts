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
    // 1. Verify file exists before MediaPipe tries to load it (prevents silent failures)
    try {
      const response = await fetch(modelPath, { method: 'HEAD' });
      if (!response.ok) {
        throw new Error(`Le fichier modèle est introuvable à l'emplacement: ${modelPath}. Veuillez vous assurer que le fichier 'plant_classifier.tflite' est présent dans le dossier 'public/assets/models/'.`);
      }
    } catch (e: any) {
      if (e.message.includes('introuvable')) throw e;
      console.warn(`[LiteRT] Could not pre-verify file ${modelPath}, attempting MediaPipe load regardless.`);
    }

    // Force cleanup of old instance if model changed
    if (imageClassifier) {
      console.log(`[LiteRT] Closing previous instance...`);
      imageClassifier.close();
      imageClassifier = null;
    }

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    
    imageClassifier = await ImageClassifier.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: modelPath,
        delegate: "GPU"
      },
      runningMode: "IMAGE",
      maxResults: 5,
      scoreThreshold: 0.35 // Slightly lower threshold for better offline results
    });

    currentModelPath = modelPath;
    console.log(`[LiteRT] Engine successfully initialized with ${modelPath}`);
    return imageClassifier;
  } catch (error) {
    console.error("[LiteRT] Engine initialization failed:", error);
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
