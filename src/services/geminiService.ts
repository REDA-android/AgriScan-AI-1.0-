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
  // no-op, server-side now
}

export async function chatWithGemini(message: string, history: { role: 'user'|'model'; text: string }[]): Promise<string> {
  const userKey = localStorage.getItem('user_gemini_api_key') || "";

  const response = await fetch('/api/gemini/chat', {
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
}

export async function analyzePlantImage(images: { base64Image: string, mimeType: string }[]): Promise<any> {
  const userKey = localStorage.getItem('user_gemini_api_key') || "";

  const response = await fetch('/api/gemini/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images, userKey })
  });

  const data = await response.json();
  if (!response.ok) {
     if (data.error && data.error.includes("Clé API Gemini manquante")) {
        throw new Error(data.error);
     }
     if (data.error && data.error.includes("Quota API dépassé")) {
        throw new Error(data.error);
     }
     if (data.error && data.error.includes("Limite de requêtes atteinte")) {
        throw new Error(data.error);
     }
     throw new Error(data.error || 'Erreur lors de l\'analyse');
  }

  return data;
}
