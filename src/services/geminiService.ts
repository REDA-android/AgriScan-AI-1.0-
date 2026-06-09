import { GoogleGenAI, Type } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

export function clearAIInstance() {
  aiInstance = null;
}

export function getAI(): GoogleGenAI {
  if (!aiInstance) {
    let apiKey = "";
    try {
      apiKey = (import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) || "";
    } catch (e) {}

    // Fallback to user saved custom key in settings or localStorage if env variable is missing or placeholder
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "MISSING_API_KEY") {
      try {
        apiKey = localStorage.getItem('user_gemini_api_key') || "";
      } catch (e) {}
    }

    // GoogleGenAI constructor requires a valid-looking prefix in browser contexts to prevent instant crash
    const resolvedKey = apiKey.trim() || "AIzaSyFakeKey_NoCrashOnInstantiation";
    
    aiInstance = new GoogleGenAI({ 
      apiKey: resolvedKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiInstance;
}

export interface PlantAnalysis {
  family: string;
  species: string;
  variety: string;
  culture?: string;
  domain?: string;
  status?: 'pending' | 'completed' | 'error';
  plantingDate?: string | null;
  breeder?: string | null;
  pruningDate?: string | null;
  harvestQuantity?: string | null;
  density?: string | null;
  fruitFirmness?: string | null;
  defects?: string | null;
  phenologicalStage?: string;
  bbchDominant?: string;
  bbchSecondary?: string[];
  organCounts?: {
    flowers: number;
    fruits: number;
    details: string;
  };
  stageIntensity?: string;
  stageQuality?: string;
  characterizationTraits?: string[];
  phenotypicTraits: {
    color: string;
    shape: string;
    size: string;
    healthStatus: string;
    diseasesOrDeficiencies: string[];
  };
  description: string;
  imageUrls?: string[];
  userNotes?: string;
}

export async function chatWithGemini(message: string, history: { role: 'user'|'model'; text: string }[]): Promise<string> {
  const hasNoKey = (!import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY === "MY_GEMINI_API_KEY" || import.meta.env.VITE_GEMINI_API_KEY === "MISSING_API_KEY") && !(localStorage.getItem('user_gemini_api_key') || "").trim();

  if (hasNoKey) {
    throw new Error("Clé API Gemini manquante. Veuillez configurer la clé dans les paramètres de l'application (Icône engrenage).");
  }

  const ai = getAI();
  const formattedHistory = history.map(msg => ({
    role: msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.text }]
  }));

  try {
    const chat = ai.chats.create({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction: "Tu es Chronos Gemma, le système de surveillance neuronale des plantes (AgroScan IA), spécialisé en agronomie et botanique. Tes réponses doivent être professionnelles, techniquement précises, et axées sur l'agriculture."
      }
    });

    const response = await chat.sendMessage({
      message: message
    });

    return response.text || "Erreur lors de la génération de la réponse.";
  } catch (error: any) {
    console.error("Error in chatWithGemini:", error);
    throw error;
  }
}

export async function analyzePlantImage(images: { base64Image: string, mimeType: string }[]): Promise<PlantAnalysis> {
  // Check if a valid API key exists (either system or user-provided)
  let systemKey = "";
  try {
    systemKey = (import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) || "";
  } catch (e) {}

  let userKey = "";
  try {
    userKey = localStorage.getItem('user_gemini_api_key') || "";
  } catch (e) {}

  const hasNoKey = (!systemKey || systemKey === "MY_GEMINI_API_KEY" || systemKey === "MISSING_API_KEY") && !userKey.trim();

  if (hasNoKey) {
    throw new Error("Clé API Gemini manquante. Veuillez configurer la clé dans les paramètres de l'application (Icône engrenage).");
  }

  // Limit to first 6 images to reduce payload size and improve reliability
  const parts: any[] = images.slice(0, 6).map(img => ({
    inlineData: {
      data: img.base64Image,
      mimeType: img.mimeType || 'image/jpeg',
    },
  }));

  parts.push({
    text: `Analyze these plant photos for agronomic purposes. 
    1. Identify the family, species, variety, and the main culture (e.g., Apple, Tomato, Wheat).
    2. Identify the dominant phenological stage according to the BBCH scale (e.g., BBCH 65).
    3. Identify any secondary phenological stages present (e.g., [BBCH 61, BBCH 63]).
    4. Count the production organs visible: flowers and fruits. Provide counts and a brief detail of their development stages.
    5. Extract phenotypic traits: color, shape, size, and health status (including diseases or deficiencies).
    6. Identify the general phenological stage name, its intensity, and quality.
    7. List main characterization traits for variety comparison.
    8. Provide a detailed technical description.`,
  });

  try {
    const response = await getAI().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: parts,
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            family: { type: Type.STRING },
            species: { type: Type.STRING },
            variety: { type: Type.STRING },
            culture: { type: Type.STRING, description: "Main culture name" },
            bbchDominant: { type: Type.STRING, description: "Dominant BBCH stage" },
            bbchSecondary: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Secondary BBCH stages present"
            },
            organCounts: {
              type: Type.OBJECT,
              properties: {
                flowers: { type: Type.NUMBER },
                fruits: { type: Type.NUMBER },
                details: { type: Type.STRING, description: "Details of counts by development stage" }
              },
              required: ["flowers", "fruits", "details"]
            },
            phenologicalStage: { type: Type.STRING, description: "General phenological stage name" },
            stageIntensity: { type: Type.STRING },
            stageQuality: { type: Type.STRING },
            characterizationTraits: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            phenotypicTraits: {
              type: Type.OBJECT,
              properties: {
                color: { type: Type.STRING },
                shape: { type: Type.STRING },
                size: { type: Type.STRING },
                healthStatus: { type: Type.STRING },
                diseasesOrDeficiencies: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ["color", "shape", "size", "healthStatus", "diseasesOrDeficiencies"],
            },
            description: { type: Type.STRING },
          },
          required: ["family", "species", "variety", "culture", "phenotypicTraits", "description", "phenologicalStage"],
        },
      },
    });

    const text = response.text;
    if (!text) {
      console.error("Empty response from Gemini");
      throw new Error("Empty response from Gemini");
    }
    return JSON.parse(text);
  } catch (error: any) {
    console.error("Error in analyzePlantImage:", error);
    
    // Check for specific 429 Quota/Spending Cap errors
    if (error.message?.includes('429') || error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED')) {
      if (error.message?.includes('spending cap')) {
        throw new Error("Quota API dépassé : Le plafond de dépenses de votre projet Google Cloud a été atteint. Veuillez vérifier vos paramètres de facturation dans la console Google Cloud.");
      }
      throw new Error("Limite de requêtes atteinte : Trop de demandes en peu de temps. Veuillez patienter une minute avant de réessayer.");
    }
    
    throw error;
  }
}
