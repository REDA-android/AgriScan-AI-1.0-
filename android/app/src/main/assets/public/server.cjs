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
var import_express2 = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");

// serverApp.ts
var import_express = __toESM(require("express"), 1);
var import_genai = require("@google/genai");
var app = (0, import_express.default)();
app.use((req, res, next) => {
  res.setHeader("X-Server-Reached", "true");
  res.setHeader("X-Debug-Req-URL", req.url || "none");
  console.log(`[Server] ${req.method} ${req.url}`);
  next();
});
app.get(["/api/ping", "/ping"], (req, res) => {
  res.json({ status: "pong", time: (/* @__PURE__ */ new Date()).toISOString(), url: req.url });
});
app.use(import_express.default.json({ limit: "100mb" }));
app.use(import_express.default.urlencoded({ limit: "100mb", extended: true }));
var getAI = (apiKey) => {
  let key = apiKey || process.env.GEMINI_API_KEY || "";
  if (key === "MY_GEMINI_API_KEY" || key === "MISSING_API_KEY") {
    key = "";
  }
  const resolvedKey = key.trim() || "AIzaSyFakeKey_NoCrashOnInstantiation";
  return new import_genai.GoogleGenAI({
    apiKey: resolvedKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
};
var handleAIError = (error, res) => {
  const message = error.message || String(error);
  const status = error.status || 500;
  if (message.includes("403") || message.includes("PERMISSION_DENIED")) {
    return res.status(403).json({
      error: "Cl\xE9 API non autoris\xE9e (403 PERMISSION_DENIED). V\xE9rifiez que 'Generative Language API' est activ\xE9e dans la console Google Cloud et que la cl\xE9 n'a pas de restrictions IP/Referer bloquantes.",
      original: message
    });
  }
  if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED") || status === 429) {
    if (message.includes("spending cap")) {
      return res.status(429).json({
        error: "Quota API d\xE9pass\xE9 : Le plafond de d\xE9penses a \xE9t\xE9 atteint.",
        original: message
      });
    }
    return res.status(429).json({
      error: "Limite de requ\xEAtes atteinte : Veuillez patienter une minute avant de r\xE9essayer.",
      original: message
    });
  }
  res.status(status).json({ error: message });
};
app.post(
  ["/api/gemini/generateContent", "/gemini/generateContent"],
  async (req, res) => {
    const { model, contents, config, userKey } = req.body;
    const apiKey = userKey || process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "MISSING_API_KEY") {
      return res.status(403).json({
        error: "Cl\xE9 API Gemini manquante. Veuillez configurer la cl\xE9 dans les param\xE8tres de l'application (Ic\xF4ne engrenage)."
      });
    }
    try {
      const ai = getAI(apiKey);
      let response;
      let retries = 2;
      while (retries >= 0) {
        try {
          response = await ai.models.generateContent({
            model: req.body.model || "gemini-2.5-flash",
            contents: req.body.contents,
            config: req.body.config
          });
          break;
        } catch (err) {
          if (err.message?.includes("503") && retries > 0) {
            console.log(`[AI] 503 error, retrying... (${retries} left)`);
            retries--;
            await new Promise((r) => setTimeout(r, 2e3));
            continue;
          }
          throw err;
        }
      }
      res.json({
        text: response.text,
        candidates: response.candidates
      });
    } catch (error) {
      console.error("[AI] Error in generateContent:", error);
      handleAIError(error, res);
    }
  }
);
app.post(["/api/gemini/analyze", "/gemini/analyze"], async (req, res) => {
  const { images, userKey } = req.body;
  const apiKey = userKey || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "MISSING_API_KEY") {
    return res.status(403).json({
      error: "Cl\xE9 API Gemini manquante. Veuillez configurer la cl\xE9 dans les param\xE8tres de l'application (Ic\xF4ne engrenage)."
    });
  }
  try {
    const ai = getAI(apiKey);
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
    let response;
    let retries = 2;
    while (retries >= 0) {
      try {
        response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts }],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: import_genai.Type.OBJECT,
              properties: {
                family: { type: import_genai.Type.STRING },
                species: { type: import_genai.Type.STRING },
                variety: { type: import_genai.Type.STRING },
                culture: {
                  type: import_genai.Type.STRING,
                  description: "Main culture name"
                },
                bbchDominant: {
                  type: import_genai.Type.STRING,
                  description: "Dominant BBCH stage"
                },
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
                    details: {
                      type: import_genai.Type.STRING,
                      description: "Details of counts by development stage"
                    }
                  },
                  required: ["flowers", "fruits", "details"]
                },
                phenologicalStage: {
                  type: import_genai.Type.STRING,
                  description: "General phenological stage name"
                },
                stageIntensity: { type: import_genai.Type.STRING },
                stageQuality: { type: import_genai.Type.STRING },
                characterizationTraits: {
                  type: import_genai.Type.ARRAY,
                  items: { type: import_genai.Type.STRING }
                },
                description: { type: import_genai.Type.STRING },
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
                  required: [
                    "color",
                    "shape",
                    "size",
                    "healthStatus",
                    "diseasesOrDeficiencies"
                  ]
                }
              },
              required: [
                "family",
                "species",
                "variety",
                "culture",
                "phenotypicTraits",
                "description",
                "phenologicalStage"
              ]
            }
          }
        });
        break;
      } catch (err) {
        if (err.message?.includes("503") && retries > 0) {
          console.log(`[AI-Analyze] 503 error, retrying... (${retries} left)`);
          retries--;
          await new Promise((r) => setTimeout(r, 2e3));
          continue;
        }
        throw err;
      }
    }
    if (!response.text) {
      throw new Error("Empty response from Gemini");
    }
    res.json(JSON.parse(response.text));
  } catch (error) {
    console.error("Error in analyze:", error);
    handleAIError(error, res);
  }
});
app.post(["/api/gemini/chat", "/gemini/chat"], async (req, res) => {
  const { message, history, userKey } = req.body;
  const apiKey = userKey || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "MISSING_API_KEY") {
    return res.status(403).json({
      error: "Cl\xE9 API Gemini manquante. Veuillez configurer la cl\xE9 dans les param\xE8tres de l'application (Ic\xF4ne engrenage)."
    });
  }
  try {
    const ai = getAI(apiKey);
    const contents = (Array.isArray(history) ? history : []).map((msg) => ({
      role: msg.role === "model" ? "model" : "user",
      parts: [{ text: msg.text || msg.parts && msg.parts[0]?.text || "" }]
    }));
    contents.push({ role: "user", parts: [{ text: message }] });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents
    });
    res.json({ text: response.text });
  } catch (error) {
    console.error("[AI] Error in chat:", error);
    handleAIError(error, res);
  }
});
app.get(["/api/weather/geocode", "/weather/geocode"], async (req, res) => {
  try {
    const { name } = req.query;
    console.log(`[Weather] Geocoding: ${name}`);
    if (!name) return res.status(400).json({ error: "Name is required" });
    let data = null;
    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=fr&format=json`
      );
      if (response.ok) {
        data = await response.json();
      }
    } catch (err) {
      console.error("[Weather] Open-Meteo geocode failed:", err.message);
    }
    if (!data || !data.results || data.results.length === 0) {
      console.log("[Weather] Attemping fallback geocoding...");
      if (process.env.OPENWEATHERMAP_API_KEY) {
        try {
          const owmGeoUrl = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(name)}&limit=1&appid=${process.env.OPENWEATHERMAP_API_KEY}`;
          const owmRes = await fetch(owmGeoUrl);
          if (owmRes.ok) {
            const owmData = await owmRes.json();
            if (owmData && owmData.length > 0) {
              data = {
                results: [
                  {
                    latitude: owmData[0].lat,
                    longitude: owmData[0].lon,
                    name: owmData[0].name,
                    admin1: owmData[0].state || owmData[0].country,
                    country: owmData[0].country
                  }
                ]
              };
            }
          }
        } catch (e) {
          console.error("[Weather] OWM geocode fallback err:", e.message);
        }
      } else if (process.env.WEATHERAPI_API_KEY && (!data || !data.results)) {
        try {
          const wapiUrl = `https://api.weatherapi.com/v1/search.json?key=${process.env.WEATHERAPI_API_KEY}&q=${encodeURIComponent(name)}`;
          const wapiRes = await fetch(wapiUrl);
          if (wapiRes.ok) {
            const wapiData = await wapiRes.json();
            if (wapiData && wapiData.length > 0) {
              data = {
                results: [
                  {
                    latitude: wapiData[0].lat,
                    longitude: wapiData[0].lon,
                    name: wapiData[0].name,
                    admin1: wapiData[0].region,
                    country: wapiData[0].country
                  }
                ]
              };
            }
          }
        } catch (e) {
          console.error(
            "[Weather] WeatherAPI geocode fallback err:",
            e.message
          );
        }
      }
    }
    if (!data || !data.results || data.results.length === 0) {
      return res.status(404).json({ error: "Lieu non trouv\xE9 (toutes les API ont \xE9chou\xE9)" });
    }
    res.json(data);
  } catch (error) {
    console.error("[Weather] Geocode proxy error:", error);
    res.status(500).json({ error: error.message });
  }
});
app.get(["/api/weather/forecast", "/weather/forecast"], async (req, res) => {
  try {
    const { lat, lng } = req.query;
    console.log(`[Weather] Forecast for lat=${lat}, lng=${lng}`);
    if (!lat || !lng)
      return res.status(400).json({ error: "Lat and Lng are required" });
    let baseData = {};
    try {
      const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,et0_fao_evapotranspiration,shortwave_radiation_sum,uv_index_max&past_days=31&forecast_days=16&timezone=auto`;
      const response = await fetch(openMeteoUrl);
      if (response.ok) {
        baseData = await response.json();
      } else {
        console.error("[Weather] Open-Meteo failed:", response.statusText);
      }
    } catch (e) {
      console.error("[Weather] Open-Meteo fetch error:", e.message);
    }
    let extraData = {};
    if (process.env.OPENWEATHERMAP_API_KEY) {
      try {
        const owmUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${process.env.OPENWEATHERMAP_API_KEY}&units=metric&lang=fr`;
        const owmRes = await fetch(owmUrl);
        if (owmRes.ok) extraData.openweathermap = await owmRes.json();
      } catch (e) {
        console.error("Erreur OpenWeatherMap:", e.message);
      }
    }
    if (process.env.WEATHERAPI_API_KEY) {
      try {
        const waUrl = `https://api.weatherapi.com/v1/forecast.json?key=${process.env.WEATHERAPI_API_KEY}&q=${lat},${lng}&days=3&aqi=yes&alerts=yes&lang=fr`;
        const waRes = await fetch(waUrl);
        if (waRes.ok) extraData.weatherapi = await waRes.json();
      } catch (e) {
        console.error("Erreur WeatherAPI:", e.message);
      }
    }
    if (process.env.VISUALCROSSING_API_KEY) {
      try {
        const vcUrl = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${lat},${lng}?unitGroup=metric&key=${process.env.VISUALCROSSING_API_KEY}&contentType=json&lang=fr`;
        const vcRes = await fetch(vcUrl);
        if (vcRes.ok) extraData.visualcrossing = await vcRes.json();
      } catch (e) {
        console.error("Erreur VisualCrossing:", e.message);
      }
    }
    let usedFallback = false;
    if (!baseData || Object.keys(baseData).length === 0 || !baseData.daily) {
      console.log("[Weather] Building fallback from extra sources");
      usedFallback = true;
      baseData = {
        current: {
          temperature_2m: 20,
          wind_speed_10m: 0,
          uv_index: 0,
          relative_humidity_2m: 50,
          weather_code: 0
        },
        daily: {
          time: [],
          temperature_2m_max: [],
          temperature_2m_min: [],
          temperature_2m_mean: [],
          precipitation_sum: [],
          precipitation_probability_max: [],
          wind_speed_10m_max: [],
          et0_fao_evapotranspiration: [],
          shortwave_radiation_sum: [],
          uv_index_max: [],
          weather_code: []
        }
      };
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      if (extraData.visualcrossing && extraData.visualcrossing.days) {
        baseData.current.temperature_2m = extraData.visualcrossing.currentConditions?.temp || 20;
        baseData.current.wind_speed_10m = extraData.visualcrossing.currentConditions?.windspeed || 0;
        baseData.current.uv_index = extraData.visualcrossing.currentConditions?.uvindex || 0;
        baseData.current.relative_humidity_2m = extraData.visualcrossing.currentConditions?.humidity || 50;
        extraData.visualcrossing.days.forEach((day) => {
          baseData.daily.time.push(day.datetime);
          baseData.daily.temperature_2m_max.push(day.tempmax);
          baseData.daily.temperature_2m_min.push(day.tempmin);
          baseData.daily.temperature_2m_mean.push(day.temp);
          baseData.daily.precipitation_sum.push(day.precip);
          baseData.daily.precipitation_probability_max.push(day.precipprob);
          baseData.daily.wind_speed_10m_max.push(day.windspeed);
          baseData.daily.uv_index_max.push(day.uvindex);
          baseData.daily.weather_code.push(0);
        });
      } else if (extraData.weatherapi && extraData.weatherapi.forecast) {
        baseData.current.temperature_2m = extraData.weatherapi.current?.temp_c || 20;
        baseData.current.wind_speed_10m = extraData.weatherapi.current?.wind_kph || 0;
        baseData.current.uv_index = extraData.weatherapi.current?.uv || 0;
        baseData.current.relative_humidity_2m = extraData.weatherapi.current?.humidity || 50;
        extraData.weatherapi.forecast.forecastday.forEach((day) => {
          baseData.daily.time.push(day.date);
          baseData.daily.temperature_2m_max.push(day.day.maxtemp_c);
          baseData.daily.temperature_2m_min.push(day.day.mintemp_c);
          baseData.daily.temperature_2m_mean.push(day.day.avgtemp_c);
          baseData.daily.precipitation_sum.push(day.day.totalprecip_mm);
          baseData.daily.precipitation_probability_max.push(
            day.day.daily_chance_of_rain
          );
          baseData.daily.wind_speed_10m_max.push(day.day.maxwind_kph);
          baseData.daily.uv_index_max.push(day.day.uv);
          baseData.daily.weather_code.push(0);
        });
      } else if (extraData.openweathermap) {
        baseData.current.temperature_2m = extraData.openweathermap.main?.temp || 20;
        baseData.current.wind_speed_10m = (extraData.openweathermap.wind?.speed || 0) * 3.6;
        baseData.current.relative_humidity_2m = extraData.openweathermap.main?.humidity || 50;
        baseData.daily.time.push(today);
        baseData.daily.temperature_2m_max.push(
          extraData.openweathermap.main?.temp_max || 20
        );
        baseData.daily.temperature_2m_min.push(
          extraData.openweathermap.main?.temp_min || 20
        );
        baseData.daily.temperature_2m_mean.push(
          extraData.openweathermap.main?.temp || 20
        );
        baseData.daily.precipitation_sum.push(0);
        baseData.daily.precipitation_probability_max.push(0);
        baseData.daily.wind_speed_10m_max.push(baseData.current.wind_speed_10m);
        baseData.daily.uv_index_max.push(0);
        baseData.daily.weather_code.push(0);
      } else {
        console.warn("[Weather] Warning: All weather APIs failed, serving complete fallback defaults.");
        for (let i = 0; i < 5; i++) {
          const d = /* @__PURE__ */ new Date();
          d.setDate(d.getDate() + i);
          const dateStr = d.toISOString().split("T")[0];
          baseData.daily.time.push(dateStr);
          baseData.daily.temperature_2m_max.push(20 + i % 3);
          baseData.daily.temperature_2m_min.push(15 - i % 2);
          baseData.daily.temperature_2m_mean.push(17);
          baseData.daily.precipitation_sum.push(0);
          baseData.daily.precipitation_probability_max.push(10);
          baseData.daily.wind_speed_10m_max.push(12);
          baseData.daily.et0_fao_evapotranspiration.push(3);
          baseData.daily.shortwave_radiation_sum.push(15);
          baseData.daily.uv_index_max.push(4);
          baseData.daily.weather_code.push(0);
        }
      }
    }
    const data = {
      ...baseData,
      extras: extraData,
      isFallback: usedFallback
    };
    res.json(data);
  } catch (error) {
    console.error("[Weather] Weather proxy error:", error);
    res.status(500).json({ error: error.message });
  }
});
app.use(["/api/*", "/api"], (req, res) => {
  console.warn(`[Server] 404 API Route non trouv\xE9e: ${req.method} ${req.url}`);
  res.status(404).json({
    error: "Route API non trouv\xE9e",
    method: req.method,
    path: req.url,
    hint: "Assurez-vous que l'URL commence par /api/ et correspond \xE0 un endpoint valide."
  });
});
var serverApp_default = app;

// server.ts
var PORT = 3e3;
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    serverApp_default.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    serverApp_default.use(import_express2.default.static(distPath));
    serverApp_default.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  serverApp_default.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
