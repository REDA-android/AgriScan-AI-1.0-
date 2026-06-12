import { GoogleGenAI, Type } from '@google/genai';

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

export function clearAIInstance() {
  // no-op
}

const getApiUrl = () => {
  return import.meta.env.VITE_API_URL || '';
};

export async function chatWithGemini(message: string, history: { role: 'user'|'model'; text: string }[]): Promise<string> {
  const userKey = localStorage.getItem('user_gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || "";
  const apiUrl = getApiUrl();

  // Si on a l'URL de l'API (serveur), on l'utilise
  if (apiUrl || !userKey) {
    try {
      const response = await fetch(`${apiUrl}/api/gemini/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, userKey })
      });

      const data = await response.json();
      if (!response.ok) {
        if (data.error && data.error.includes("Clé API Gemini manquante")) {
            throw new Error(data.error);
        }
        throw new Error(data.error || 'Erreur lors de la communication de chat');
      }

      return data.text || "Erreur lors de la génération de la réponse.";
    } catch(e: any) {
      // Si l'erreur est liée au SSR/backend absent (Typique sur APK sans VITE_API_URL)
      if (!userKey || (e.message && e.message.includes('Network'))) {
        if (!userKey) throw e;
      } else {
        throw e;
      }
    }
  }

  // Mode APK - Client Direct (Nécessite la clé API)
  const ai = new GoogleGenAI({ apiKey: userKey });
  const contents = history.map((msg: any) => ({
    role: msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.text }]
  }));
  contents.push({ role: 'user', parts: [{ text: message }] });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: contents
  });

  return response.text || "";
}

export async function analyzePlantImage(images: { base64Image: string, mimeType: string }[]): Promise<any> {
  const userKey = localStorage.getItem('user_gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || "";
  const apiUrl = getApiUrl();

  if (apiUrl || !userKey) {
    try {
      const response = await fetch(`${apiUrl}/api/gemini/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images, userKey })
      });

      const data = await response.json();
      if (!response.ok) {
         if (data.error && data.error.includes("Clé API Gemini manquante")) throw new Error(data.error);
         if (data.error && data.error.includes("Quota API dépassé")) throw new Error(data.error);
         if (data.error && data.error.includes("Limite de requêtes atteinte")) throw new Error(data.error);
         throw new Error(data.error || 'Erreur lors de l\'analyse');
      }

      return data;
    } catch(e: any) {
      if (!userKey || (e.message && e.message.includes('Network'))) {
        if (!userKey) throw e;
      } else {
        throw e;
      }
    }
  }

  // Mode APK - Client Direct Analyse
  const ai = new GoogleGenAI({ apiKey: userKey });
  const parts: any[] = images.slice(0, 6).map((img: any) => ({
    inlineData: {
      data: img.base64Image,
      mimeType: img.mimeType || 'image/jpeg',
    },
  }));

  parts.push({
    text: `Analyze these plant photos... 
    1. Identify the family, species, variety, and the main culture...
    2. Identify the dominant phenological stage...`
  });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: { parts: parts },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          family: { type: Type.STRING },
          species: { type: Type.STRING },
          variety: { type: Type.STRING },
          culture: { type: Type.STRING },
          bbchDominant: { type: Type.STRING },
          bbchSecondary: { type: Type.ARRAY, items: { type: Type.STRING } },
          organCounts: {
            type: Type.OBJECT,
            properties: { flowers: { type: Type.NUMBER }, fruits: { type: Type.NUMBER }, details: { type: Type.STRING } },
            required: ["flowers", "fruits", "details"]
          },
          phenologicalStage: { type: Type.STRING },
          stageIntensity: { type: Type.STRING },
          stageQuality: { type: Type.STRING },
          characterizationTraits: { type: Type.ARRAY, items: { type: Type.STRING } },
          phenotypicTraits: {
            type: Type.OBJECT,
            properties: { color: { type: Type.STRING }, shape: { type: Type.STRING }, size: { type: Type.STRING }, healthStatus: { type: Type.STRING }, diseasesOrDeficiencies: { type: Type.ARRAY, items: { type: Type.STRING } } },
            required: ["color", "shape", "size", "healthStatus", "diseasesOrDeficiencies"],
          },
          description: { type: Type.STRING },
        },
        required: ["family", "species", "variety", "culture", "phenotypicTraits", "description", "phenologicalStage"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("Empty response from Gemini");
  return JSON.parse(text);
}
