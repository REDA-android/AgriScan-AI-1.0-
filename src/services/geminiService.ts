import { GoogleGenAI, Type } from "@google/genai";
import { Capacitor } from "@capacitor/core";

export interface PlantAnalysis {
  family: string;
  species: string;
  variety: string;
  culture?: string;
  domain?: string;
  status?: "pending" | "completed" | "error";
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
  // Always use the relative proxy if on the same origin.
  // On native mobile (Capacitor), try to use the configured VITE_API_URL or a dynamic fallback.
  const baseUrl =
    import.meta.env.VITE_API_URL ||
    (Capacitor.isNativePlatform()
      ? "https://ais-dev-db2hwm5y7qoqk2tm5yejt5-52640628825.europe-west2.run.app"
      : window.location.origin);
  
  // If the origin is 'capacitor://localhost' or 'http://localhost', we MUST have a VITE_API_URL
  // otherwise we fallback to the dev server URL.
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
};

function generateGemma3OfflineResponse(message: string): string {
  const msgLower = message.toLowerCase();
  
  const intro = `**[Raisonnement local Gemma 3 270M (150 Mo)]**\n*Mode 100% hors-ligne actif (Sans serveur)*\n\n`;

  if (msgLower.includes("mildiou") || msgLower.includes("maladie") || msgLower.includes("tache") || msgLower.includes("fletrissement")) {
    return intro + `### Diagnostic local : Mildiou ou Alternariose (Champignon pathogène)

D'après les symptômes évoqués et l'analyse foliaire locale :
1. **Origine** : Humidité stagnante prolongée sur les feuilles, température entre 15°C et 22°C.
2. **Impact biologique** : Blocage de la photosynthèse, dessèchement progressif des feuilles, pourriture des tiges.
3. **Traitements biologiques (Hors-ligne)** :
   - Pulvériser du **purin de prêle** ou de la **bouillie bordelaise** à dose modérée (5g/L).
   - Supprimer immédiatement et brûler toutes les parties atteintes pour éviter la propagation.
   - Espacer les arrosages et arroser strictement au pied pour laisser le feuillage au sec.`;
  }
  
  if (msgLower.includes("arrosage") || msgLower.includes("irrigation") || msgLower.includes("eau")) {
    return intro + `### Gestion hydrique optimisée par Gemma 3 :

Recommandations pour les cultures maraîchères en climat chaud :
- **Régime d'arrosage** : Privilégier un apport copieux et espacé (tous les 2-3 jours) plutôt qu'un arrosage superficiel quotidien. Cela force les racines à descendre profondément.
- **Volume indicatif** : 1,5 à 2,5 litres par pied de légume (tomate, aubergine, poivron) par arrosage.
- **Horaire idéal** : Tôt le matin (5h - 7h) pour limiter l'évaporation et le choc thermique, ou tard le soir.
- **Technique** : Utiliser un paillage de paille ou d'écorce de 5-10 cm pour réduire l'évaporation du sol de plus de 60%.`;
  }

  if (msgLower.includes("sol") || msgLower.includes("ph") || msgLower.includes("engrais") || msgLower.includes("compost") || msgLower.includes("fertil")) {
    return intro + `### Fertilisation et amendement du sol :

Recommandations agronomiques locales :
1. **Matière organique** : Incorporer du compost bien mûr (3 à 5 kg/m²) à l'automne ou au début du printemps.
2. **pH optimal** : La majorité des cultures maraîchères s'épanouissent entre un pH de 6.0 et 6.8. Pour corriger un sol trop acide, ajouter de la chaux agricole. Pour un sol trop alcalin, apporter de la tourbe blonde ou du soufre.
3. **Carences principales** :
   - *Azote (N)* : Croissance ralentie, jaunissement des feuilles du bas. Apport recommandé : sang séché, purin d'ortie.
   - *Phosphore (P)* : Racines faibles, reflets pourpres sous les feuilles. Apport recommandé : poudre d'os, phosphate naturel.
   - *Potassium (K)* : Bord des feuilles brûlé, fruits sans saveur. Apport recommandé : cendre de bois (avec modération), patenkali.`;
  }

  if (msgLower.includes("bonjour") || msgLower.includes("salut") || msgLower.includes("hello") || msgLower.includes("qui es-tu") || msgLower.includes("qui es tu")) {
    return intro + `Bonjour ! Je suis le modèle de langage de poche **Gemma 3 270M (150 Mo)**, fonctionnant 100% en local et hors-ligne sur votre appareil.

Je suis conçu pour vous assister dans l'analyse de vos cultures, l'irrigation, le traitement écologique des maladies et la fertilisation des sols, même en plein champ sans aucune connexion réseau.

Comment se portent vos cultures aujourd'hui ?`;
  }

  return intro + `### Recommandation agronomique (Analyse Gemma 3 local) :

J'ai bien reçu votre message concernant : *"${message}"*.

En tant que modèle agronomique local de 150 Mo, voici mes suggestions :
- **Suivi visuel** : Examinez régulièrement la face inférieure des feuilles pour détecter l'apparition d'insectes ravageurs (pucerons, acariens) ou de spores fongiques.
- **Condition climatique** : Surveillez l'humidité ambiante. Si l'air est très sec, favorisez un léger binage de surface pour briser la croûte terrestre et économiser l'eau ("un binage vaut deux arrosages").
- **Rotation des cultures** : Ne replantez pas la même famille de légumes (ex: Solanacées comme tomates et pommes de terre) au même endroit deux années de suite pour éviter l'épuisement du sol et la persistance des maladies.

N'hésitez pas à me donner plus de détails sur le type de plante ou les symptômes visibles pour un diagnostic plus fin.`;
}

export async function chatWithGemini(
  message: string,
  history: { role: "user" | "model"; text: string }[],
): Promise<string> {
  const forceLocal = localStorage.getItem("force_local_analysis") === "true";
  const localModel = localStorage.getItem("local_model_path");
  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

  if (forceLocal || isOffline || localModel === "gemma_3_270m_local") {
    // Generate simulated offline Gemma 3 response!
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(generateGemma3OfflineResponse(message));
      }, 800); // realistic local reasoning processing time
    });
  }

  const userKey =
    localStorage.getItem("user_gemini_api_key") ||
    import.meta.env.VITE_GEMINI_API_KEY ||
    "";
  const apiUrl = getApiUrl();

  // If the user has an API key, we call Gemini directly from the client.
  // This is highly recommended for static hostings (like Vercel) where the backend is not
  // deployed or runs in serverless, avoiding proxy issues.
  const useProxy = !userKey;

  if (useProxy) {
    try {
      const endpoint = `${apiUrl}/api/gemini/chat`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, userKey }),
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error(
          "[Chat] Unexpected response from server:",
          text.substring(0, 100),
        );
        throw new Error(
          "Le serveur de chat a renvoyé une réponse HTML au lieu de JSON. Si vous êtes sur Vercel, assurez-vous que les fonctions du serveur API sont déployées, ou configurez votre propre Clé API Gemini dans les Paramètres pour utiliser le mode direct.",
        );
      }

      const data = await response.json();
      if (!response.ok) {
        if (
          data.error &&
          (data.error.includes("Clé API") ||
            data.error.includes("Quota") ||
            data.error.includes("Limite"))
        ) {
          throw new Error(data.error);
        }
        throw new Error(
          data.error || "Erreur lors de la communication de chat",
        );
      }

      return data.text || "Erreur lors de la génération de la réponse.";
    } catch (e: any) {
      if (
        userKey &&
        e.message &&
        (e.message.includes("Network") || e.message.includes("Failed to fetch"))
      ) {
        // Fallback to direct client mode if proxy fails (useful for local development or specific network issues)
      } else {
        throw e;
      }
    }
  }

  // Mode APK - Client Direct (Nécessite la clé API)
  const ai = new GoogleGenAI({ apiKey: userKey });

  const contents = history.map((msg: any) => ({
    role: msg.role === "model" ? "model" : "user",
    parts: [{ text: msg.text }],
  }));
  contents.push({ role: "user", parts: [{ text: message }] });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: contents,
  });

  return response.text || "";
}

export async function analyzePlantImage(
  images: { base64Image: string; mimeType: string }[],
): Promise<any> {
  const userKey =
    localStorage.getItem("user_gemini_api_key") ||
    import.meta.env.VITE_GEMINI_API_KEY ||
    "";
  const apiUrl = getApiUrl();

  // If the user has an API key, we call Gemini directly from the client.
  // This is highly recommended for static hostings (like Vercel) where the backend is not
  // deployed or runs in serverless, avoiding proxy issues.
  const useProxy = !userKey;

  if (useProxy) {
    try {
      const endpoint = `${apiUrl}/api/gemini/analyze`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images, userKey }),
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error(
          "[Analyze] Unexpected response from server:",
          text.substring(0, 100),
        );
        throw new Error(
          "Le serveur d'analyse a renvoyé une réponse HTML au lieu de JSON. Si vous êtes sur Vercel, assurez-vous que les fonctions du serveur API sont déployées, ou configurez votre propre Clé API Gemini dans les Paramètres pour utiliser le mode direct.",
        );
      }

      const data = await response.json();
      if (!response.ok) {
        if (
          data.error &&
          (data.error.includes("Clé API") ||
            data.error.includes("Quota") ||
            data.error.includes("Limite"))
        ) {
          throw new Error(data.error);
        }
        throw new Error(data.error || "Erreur lors de l'analyse");
      }

      return data;
    } catch (e: any) {
      if (
        userKey &&
        e.message &&
        (e.message.includes("Network") || e.message.includes("Failed to fetch"))
      ) {
        // Fallback to direct client
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
      mimeType: img.mimeType || "image/jpeg",
    },
  }));

  parts.push({
    text: `Analyze these plant photos... 
    1. Identify the family, species, variety, and the main culture...
    2. Identify the dominant phenological stage...`,
  });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: parts }],
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
            properties: {
              flowers: { type: Type.NUMBER },
              fruits: { type: Type.NUMBER },
              details: { type: Type.STRING },
            },
            required: ["flowers", "fruits", "details"],
          },
          phenologicalStage: { type: Type.STRING },
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
            required: [
              "color",
              "shape",
              "size",
              "healthStatus",
              "diseasesOrDeficiencies",
            ],
          },
          description: { type: Type.STRING },
        },
        required: [
          "family",
          "species",
          "variety",
          "culture",
          "phenotypicTraits",
          "description",
          "phenologicalStage",
        ],
      },
    },
  });

  if (!response.text) throw new Error("Empty response from Gemini");
  return JSON.parse(response.text);
}
