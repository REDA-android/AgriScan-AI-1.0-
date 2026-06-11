import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit to support large images
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Helper to init AI
  const getAI = () => {
    let apiKey = process.env.GEMINI_API_KEY || "";
    if (apiKey === "MY_GEMINI_API_KEY" || apiKey === "MISSING_API_KEY") {
      apiKey = "";
    }
    
    // Fallback if we really want to prevent a crash
    const resolvedKey = apiKey.trim() || "AIzaSyFakeKey_NoCrashOnInstantiation";
    return new GoogleGenAI({ apiKey: resolvedKey });
  };

  app.post("/api/gemini/generateContent", async (req, res) => {
    const { model, contents, config, userKey } = req.body;

    const apiKey = userKey || process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "MISSING_API_KEY") {
      return res.status(403).json({ error: "Clé API Gemini manquante. Veuillez configurer la clé dans les paramètres de l'application (Icône engrenage)." });
    }

    try {
      console.log(`[AI] Generating content with model: ${req.body.model || 'default'}`);
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: req.body.model || "gemini-2.5-flash",
        contents: req.body.contents,
        config: req.body.config
      });

      console.log(`[AI] Generation successful`);
      res.json({ 
        text: response.text, 
        candidates: (response as any).candidates 
      });
    } catch (error: any) {
      console.error("[AI] Error in generateContent:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/gemini/analyze", async (req, res) => {
    const { images, userKey } = req.body;
    
    const apiKey = userKey || process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "MISSING_API_KEY") {
      return res.status(403).json({ error: "Clé API Gemini manquante. Veuillez configurer la clé dans les paramètres de l'application (Icône engrenage)." });
    }

    try {
      console.log(`[AI] Analyzing ${images?.length || 0} images`);
      const ai = new GoogleGenAI({ apiKey });
      const parts: any[] = images.slice(0, 6).map((img: any) => ({
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

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
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
        throw new Error("Empty response from Gemini");
      }
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("Error in analyze:", error);
      
      // Specifically handle 429
      if (error.message?.includes('429') || error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED')) {
        if (error.message?.includes('spending cap')) {
          return res.status(429).json({ error: "Quota API dépassé : Le plafond de dépenses de votre projet Google Cloud a été atteint. Veuillez vérifier vos paramètres de facturation dans la console Google Cloud.", original: error.message });
        }
        return res.status(429).json({ error: "Limite de requêtes atteinte : Trop de demandes en peu de temps. Veuillez patienter une minute avant de réessayer.", original: error.message });
      }

      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/gemini/chat", async (req, res) => {
    const { message, history, userKey } = req.body;
    
    const apiKey = userKey || process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "MISSING_API_KEY") {
      return res.status(403).json({ error: "Clé API Gemini manquante. Veuillez configurer la clé dans les paramètres de l'application (Icône engrenage)." });
    }

    try {
      console.log(`[AI] Chat request`);
      const ai = new GoogleGenAI({ apiKey });
      
      const contents = history.map((msg: any) => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.text }]
      }));
      contents.push({ role: 'user', parts: [{ text: message }] });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contents
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("[AI] Error in chat:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Proxy for Weather API to avoid client-side fetch errors
  app.get("/api/weather/geocode", async (req, res) => {
    try {
      const { name } = req.query;
      console.log(`[Weather] Geocoding: ${name}`);
      if (!name) return res.status(400).json({ error: "Name is required" });

      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name as string)}&count=1&language=fr&format=json`);
      if (!response.ok) throw new Error(`Geocoding error: ${response.statusText}`);
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("[Weather] Geocode proxy error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/weather/forecast", async (req, res) => {
    try {
      const { lat, lng } = req.query;
      console.log(`[Weather] Forecast for lat=${lat}, lng=${lng}`);
      if (!lat || !lng) return res.status(400).json({ error: "Lat and Lng are required" });

      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,et0_fao_evapotranspiration,shortwave_radiation_sum,uv_index_max&past_days=31&forecast_days=16&timezone=auto`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Weather error: ${response.statusText}`);
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("[Weather] Weather proxy error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // In express 4:
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
