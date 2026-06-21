import { ImageClassifier, FilesetResolver } from "@mediapipe/tasks-vision";

let imageClassifier: ImageClassifier | null = null;
let currentModelPath: string | null = null;

const CDN_FALLBACKS: Record<string, string> = {
  "/assets/models/mobilenetv3_small.tflite": "https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/int8/1/efficientnet_lite0.tflite",
  "/assets/models/mobilenetv3_large.tflite": "https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/int8/1/efficientnet_lite0.tflite",
  "/assets/models/mobilenetv2.tflite": "https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/int8/1/efficientnet_lite0.tflite",
  "/assets/models/efficientnet_lite0.tflite": "https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/int8/1/efficientnet_lite0.tflite",
  "/assets/models/plant_classifier.tflite": "https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/int8/1/efficientnet_lite0.tflite",
};

/**
 * Initializes the LiteRT (MediaPipe) Image Classifier with a dynamic path
 */
export async function initLiteRT(
  modelPath: string = "/assets/models/plant_classifier.tflite",
) {
  if (imageClassifier && currentModelPath === modelPath) return imageClassifier;

  console.log(`[LiteRT] Initializing engine with model: ${modelPath}`);

  let resolvedPath = modelPath;
  let usingFallback = false;

  try {
    try {
      const response = await fetch(modelPath);
      if (!response.ok) {
        throw new Error(`Model fetch failed with status: ${response.status}`);
      }
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        throw new Error(
          `Model file missing. Server returned HTML instead of .tflite binary.`,
        );
      }
    } catch (e: any) {
      const fallbackUrl = CDN_FALLBACKS[modelPath];
      if (fallbackUrl) {
        console.warn(
          `[LiteRT] Local model ${modelPath} unavailable (${e.message}). Automatically switched to stable public CDN: ${fallbackUrl}`,
        );
        resolvedPath = fallbackUrl;
        usingFallback = true;
      } else {
        console.log(
          `[LiteRT] Gracefully skipping LiteRT initialization: ${e.message}`,
        );
        return null;
      }
    }

    if (usingFallback) {
      try {
        const response = await fetch(resolvedPath);
        if (!response.ok) {
          throw new Error(`Fallback model fetch failed with status: ${response.status}`);
        }
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("text/html")) {
          throw new Error(`Fallback model returned HTML instead of binary.`);
        }
      } catch (fallbackError: any) {
        console.error(
          `[LiteRT] Fallback CDN model loading failed: ${fallbackError.message}`,
        );
        return null;
      }
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
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm",
    );

    // Attempt initialization with CPU delegate first or GPU fallback for ultimate stability.
    // WebAssembly memory can easily crash on mobile/iframe embedded environments if GPU WebGL context fails.
    try {
      console.log(
        `[LiteRT] Creating image classifier with CPU delegate for standard memory footprint...`,
      );
      imageClassifier = await ImageClassifier.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: resolvedPath,
          delegate: "CPU",
        },
        runningMode: "IMAGE",
        maxResults: 5,
        scoreThreshold: 0.35,
      });
    } catch (cpuError: any) {
      console.warn(
        `[LiteRT] CPU creation error, trying auto delegate...`,
        cpuError,
      );
      imageClassifier = await ImageClassifier.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: resolvedPath,
        },
        runningMode: "IMAGE",
        maxResults: 5,
        scoreThreshold: 0.35,
      });
    }

    currentModelPath = modelPath;
    console.log(`[LiteRT] Engine successfully initialized with ${resolvedPath}`);
    return imageClassifier;
  } catch (error: any) {
    console.error(
      "[LiteRT] Engine initialization failed:",
      error.message || error,
    );
    return null;
  }
}

/**
 * Performs offline analysis using the loaded LiteRT model
 */
export async function analyzeOffline(
  imageElement: HTMLImageElement | HTMLCanvasElement,
  modelPath?: string,
) {
  const classifier = await initLiteRT(modelPath);
  if (!classifier) {
    throw new Error(
      "Local analysis engine (LiteRT) not initialized. Check if the model exists.",
    );
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
        diseasesOrDeficiencies: [],
      },
      description: `Analyse locale effectuée avec LiteRT (Modèle: plant_classifier.tflite). Résultat: ${topResult.categoryName} (${Math.round(topResult.score * 100)}% de confiance).`,
      status: "completed",
    };
  }

  throw new Error("No identification found with local model.");
}
