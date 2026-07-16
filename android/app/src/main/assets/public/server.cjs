var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json({ limit: "50mb" }));
  app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
  const getAI = () => {
    let apiKey = process.env.GEMINI_API_KEY || "";
    if (apiKey === "MY_GEMINI_API_KEY" || apiKey === "MISSING_API_KEY") {
      apiKey = "";
    }
    const resolvedKey = apiKey.trim() || "AIzaSyFakeKey_NoCrashOnInstantiation";
    return new import_genai.GoogleGenAI({ apiKey: resolvedKey });
  };
  app.post("/api/gemini/generateContent", async (req, res) => {
    const { model, contents, config, userKey } = req.body;
    const apiKey = userKey || process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "MISSING_API_KEY") {
      return res.status(403).json({ error: "Cl\xE9 API Gemini manquante. Veuillez configurer la cl\xE9 dans les param\xE8tres de l'application (Ic\xF4ne engrenage)." });
    }
    try {
      console.log(`[AI] Generating content with model: ${req.body.model || "default"}`);
      const ai = new import_genai.GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: req.body.model || "gemini-2.5-flash",
        contents: req.body.contents,
        config: req.body.config
      });
      console.log(`[AI] Generation successful`);
      res.json({
        text: response.text,
        candidates: response.candidates
      });
    } catch (error) {
      console.error("[AI] Error in generateContent:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/gemini/analyze", async (req, res) => {
    const { images, userKey } = req.body;
    const apiKey = userKey || process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "MISSING_API_KEY") {
      return res.status(403).json({ error: "Cl\xE9 API Gemini manquante. Veuillez configurer la cl\xE9 dans les param\xE8tres de l'application (Ic\xF4ne engrenage)." });
    }
    try {
      console.log(`[AI] Analyzing ${images?.length || 0} images`);
      const ai = new import_genai.GoogleGenAI({ apiKey });
      const parts = images.slice(0, 6).map((img) => ({
        inlineData: {
          data: img.base64Image,
          mimeType: img.mimeType || "image/jpeg"
        }
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
        8. Provide a detailed technical description.`
      });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: import_genai.Type.OBJECT,
            properties: {
              family: { type: import_genai.Type.STRING },
              species: { type: import_genai.Type.STRING },
              variety: { type: import_genai.Type.STRING },
              culture: { type: import_genai.Type.STRING, description: "Main culture name" },
              bbchDominant: { type: import_genai.Type.STRING, description: "Dominant BBCH stage" },
              bbchSecondary: {
                type: import_genai.Type.ARRAY,
                items: { type: import_genai.Type.STRING },
                description: "Secondary BBCH stages present"
              },
              organCounts: {
                type: import_genai.Type.OBJECT,
                properties: {
                  flowers: { type: import_genai.Type.NUMBER },
                  fruits: { type: import_genai.Type.NUMBER },
                  details: { type: import_genai.Type.STRING, description: "Details of counts by development stage" }
                },
                required: ["flowers", "fruits", "details"]
              },
              phenologicalStage: { type: import_genai.Type.STRING, description: "General phenological stage name" },
              stageIntensity: { type: import_genai.Type.STRING },
              stageQuality: { type: import_genai.Type.STRING },
              characterizationTraits: {
                type: import_genai.Type.ARRAY,
                items: { type: import_genai.Type.STRING }
              },
              phenotypicTraits: {
                type: import_genai.Type.OBJECT,
                properties: {
                  color: { type: import_genai.Type.STRING },
                  shape: { type: import_genai.Type.STRING },
                  size: { type: import_genai.Type.STRING },
                  healthStatus: { type: import_genai.Type.STRING },
                  diseasesOrDeficiencies: {
                    type: import_genai.Type.ARRAY,
                    items: { type: import_genai.Type.STRING }
                  }
                },
                required: ["color", "shape", "size", "healthStatus", "diseasesOrDeficiencies"]
              },
              description: { type: import_genai.Type.STRING }
            },
            required: ["family", "species", "variety", "culture", "phenotypicTraits", "description", "phenologicalStage"]
          }
        }
      });
      const text = response.text;
      if (!text) {
        throw new Error("Empty response from Gemini");
      }
      res.json(JSON.parse(text));
    } catch (error) {
      console.error("Error in analyze:", error);
      if (error.message?.includes("429") || error.status === 429 || error.message?.includes("RESOURCE_EXHAUSTED")) {
        if (error.message?.includes("spending cap")) {
          return res.status(429).json({ error: "Quota API d\xE9pass\xE9 : Le plafond de d\xE9penses de votre projet Google Cloud a \xE9t\xE9 atteint. Veuillez v\xE9rifier vos param\xE8tres de facturation dans la console Google Cloud.", original: error.message });
        }
        return res.status(429).json({ error: "Limite de requ\xEAtes atteinte : Trop de demandes en peu de temps. Veuillez patienter une minute avant de r\xE9essayer.", original: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/gemini/chat", async (req, res) => {
    const { message, history, userKey } = req.body;
    const apiKey = userKey || process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "MISSING_API_KEY") {
      return res.status(403).json({ error: "Cl\xE9 API Gemini manquante. Veuillez configurer la cl\xE9 dans les param\xE8tres de l'application (Ic\xF4ne engrenage)." });
    }
    try {
      console.log(`[AI] Chat request`);
      const ai = new import_genai.GoogleGenAI({ apiKey });
      const contents = history.map((msg) => ({
        role: msg.role === "model" ? "model" : "user",
        parts: [{ text: msg.text }]
      }));
      contents.push({ role: "user", parts: [{ text: message }] });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents
      });
      res.json({ text: response.text });
    } catch (error) {
      console.error("[AI] Error in chat:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app.get("/api/weather/geocode", async (req, res) => {
    try {
      const { name } = req.query;
      console.log(`[Weather] Geocoding: ${name}`);
      if (!name) return res.status(400).json({ error: "Name is required" });
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=fr&format=json`);
      if (!response.ok) throw new Error(`Geocoding error: ${response.statusText}`);
      const data = await response.json();
      res.json(data);
    } catch (error) {
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
    } catch (error) {
      console.error("[Weather] Weather proxy error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
