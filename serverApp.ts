import express from "express";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();

// Increase payload limit to support large images
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Helper to init AI
const getAI = (apiKey?: string) => {
  let key = apiKey || process.env.GEMINI_API_KEY || "";
  if (key === "MY_GEMINI_API_KEY" || key === "MISSING_API_KEY") {
    key = "";
  }
  
  // Fallback if we really want to prevent a crash
  const resolvedKey = key.trim() || "AIzaSyFakeKey_NoCrashOnInstantiation";
  return new GoogleGenAI(resolvedKey);
};

const handleAIError = (error: any, res: any) => {
  const message = error.message || String(error);
  const status = error.status || 500;
  
  if (message.includes('403') || message.includes('PERMISSION_DENIED')) {
    return res.status(403).json({ 
      error: "Clé API non autorisée (403 PERMISSION_DENIED). Vérifiez que 'Generative Language API' est activée dans la console Google Cloud et que la clé n'a pas de restrictions IP/Referer bloquantes.",
      original: message 
    });
  }
  
  if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED') || status === 429) {
    if (message.includes('spending cap')) {
      return res.status(429).json({ error: "Quota API dépassé : Le plafond de dépenses a été atteint.", original: message });
    }
    return res.status(429).json({ error: "Limite de requêtes atteinte : Veuillez patienter une minute avant de réessayer.", original: message });
  }

  res.status(status).json({ error: message });
};

app.post("/api/gemini/generateContent", async (req, res) => {
  const { model, contents, config, userKey } = req.body;

  const apiKey = userKey || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "MISSING_API_KEY") {
    return res.status(403).json({ error: "Clé API Gemini manquante. Veuillez configurer la clé dans les paramètres de l'application (Icône engrenage)." });
  }

  try {
    console.log(`[AI] Generating content with model: ${req.body.model || 'default'}`);
    const ai = getAI(apiKey);
    const response = await ai.models.generateContent({
      model: req.body.model || "gemini-3-flash-preview",
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
    handleAIError(error, res);
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
    const ai = getAI(apiKey);
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
      throw new Error("Empty response from Gemini");
    }
    res.json(JSON.parse(text));
  } catch (error: any) {
    console.error("Error in analyze:", error);
    handleAIError(error, res);
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
    const ai = getAI(apiKey);
    
    const contents = history.map((msg: any) => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));
    contents.push({ role: 'user', parts: [{ text: message }] });

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: contents
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("[AI] Error in chat:", error);
    handleAIError(error, res);
  }
});

// Proxy for Weather API to avoid client-side fetch errors
app.get("/api/weather/geocode", async (req, res) => {
  try {
    const { name } = req.query;
    console.log(`[Weather] Geocoding: ${name}`);
    if (!name) return res.status(400).json({ error: "Name is required" });

    let data: any = null;

    try {
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name as string)}&count=1&language=fr&format=json`);
      if (response.ok) {
        data = await response.json();
      }
    } catch (err: any) {
      console.error("[Weather] Open-Meteo geocode failed:", err.message);
    }

    // Fallback geocoding if Open-Meteo failed or didn't return results
    if (!data || !data.results || data.results.length === 0) {
      console.log("[Weather] Attemping fallback geocoding...");
      if (process.env.OPENWEATHERMAP_API_KEY) {
        try {
          const owmGeoUrl = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(name as string)}&limit=1&appid=${process.env.OPENWEATHERMAP_API_KEY}`;
          const owmRes = await fetch(owmGeoUrl);
          if (owmRes.ok) {
            const owmData = await owmRes.json();
            if (owmData && owmData.length > 0) {
              // Map to Open-Meteo format
              data = {
                results: [{
                  latitude: owmData[0].lat,
                  longitude: owmData[0].lon,
                  name: owmData[0].name,
                  admin1: owmData[0].state || owmData[0].country,
                  country: owmData[0].country
                }]
              };
            }
          }
        } catch (e: any) {
           console.error("[Weather] OWM geocode fallback err:", e.message);
        }
      } else if (process.env.WEATHERAPI_API_KEY && (!data || !data.results)) {
         try {
            const wapiUrl = `https://api.weatherapi.com/v1/search.json?key=${process.env.WEATHERAPI_API_KEY}&q=${encodeURIComponent(name as string)}`;
            const wapiRes = await fetch(wapiUrl);
            if (wapiRes.ok) {
              const wapiData = await wapiRes.json();
              if (wapiData && wapiData.length > 0) {
                 data = {
                  results: [{
                    latitude: wapiData[0].lat,
                    longitude: wapiData[0].lon,
                    name: wapiData[0].name,
                    admin1: wapiData[0].region,
                    country: wapiData[0].country
                  }]
                };
              }
            }
         } catch (e: any) {
            console.error("[Weather] WeatherAPI geocode fallback err:", e.message);
         }
      }
    }

    if (!data || !data.results || data.results.length === 0) {
      return res.status(404).json({ error: "Lieu non trouvé (toutes les API ont échoué)" });
    }

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

    // 1. Open-Meteo (Gratuit, aucune clé API requise)
    let baseData: any = {};
    try {
      const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,et0_fao_evapotranspiration,shortwave_radiation_sum,uv_index_max&past_days=31&forecast_days=16&timezone=auto`;
      const response = await fetch(openMeteoUrl);
      if (response.ok) {
        baseData = await response.json();
      } else {
        console.error("[Weather] Open-Meteo failed:", response.statusText);
      }
    } catch (e: any) {
      console.error("[Weather] Open-Meteo fetch error:", e.message);
    }

    let extraData: any = {};

    // 2. OpenWeatherMap
    if (process.env.OPENWEATHERMAP_API_KEY) {
      try {
        const owmUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${process.env.OPENWEATHERMAP_API_KEY}&units=metric&lang=fr`;
        const owmRes = await fetch(owmUrl);
        if (owmRes.ok) extraData.openweathermap = await owmRes.json();
      } catch (e: any) {
        console.error("Erreur OpenWeatherMap:", e.message);
      }
    }

    // 3. WeatherAPI
    if (process.env.WEATHERAPI_API_KEY) {
      try {
        const waUrl = `https://api.weatherapi.com/v1/forecast.json?key=${process.env.WEATHERAPI_API_KEY}&q=${lat},${lng}&days=3&aqi=yes&alerts=yes&lang=fr`;
        const waRes = await fetch(waUrl);
        if (waRes.ok) extraData.weatherapi = await waRes.json();
      } catch (e: any) {
        console.error("Erreur WeatherAPI:", e.message);
      }
    }

    // 4. Visual Crossing
    if (process.env.VISUALCROSSING_API_KEY) {
      try {
        const vcUrl = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${lat},${lng}?unitGroup=metric&key=${process.env.VISUALCROSSING_API_KEY}&contentType=json&lang=fr`;
        const vcRes = await fetch(vcUrl);
        if (vcRes.ok) extraData.visualcrossing = await vcRes.json();
      } catch (e: any) {
        console.error("Erreur VisualCrossing:", e.message);
      }
    }

    // Merge extra sources along with Open-Meteo
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

      const today = new Date().toISOString().split("T")[0];

      if (extraData.visualcrossing && extraData.visualcrossing.days) {
        baseData.current.temperature_2m = extraData.visualcrossing.currentConditions?.temp || 20;
        baseData.current.wind_speed_10m = extraData.visualcrossing.currentConditions?.windspeed || 0;
        baseData.current.uv_index = extraData.visualcrossing.currentConditions?.uvindex || 0;
        baseData.current.relative_humidity_2m = extraData.visualcrossing.currentConditions?.humidity || 50;

        extraData.visualcrossing.days.forEach((day: any) => {
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

        extraData.weatherapi.forecast.forecastday.forEach((day: any) => {
          baseData.daily.time.push(day.date);
          baseData.daily.temperature_2m_max.push(day.day.maxtemp_c);
          baseData.daily.temperature_2m_min.push(day.day.mintemp_c);
          baseData.daily.temperature_2m_mean.push(day.day.avgtemp_c);
          baseData.daily.precipitation_sum.push(day.day.totalprecip_mm);
          baseData.daily.precipitation_probability_max.push(day.day.daily_chance_of_rain);
          baseData.daily.wind_speed_10m_max.push(day.day.maxwind_kph);
          baseData.daily.uv_index_max.push(day.day.uv);
          baseData.daily.weather_code.push(0);
        });
      } else if (extraData.openweathermap) {
        baseData.current.temperature_2m = extraData.openweathermap.main?.temp || 20;
        baseData.current.wind_speed_10m = (extraData.openweathermap.wind?.speed || 0) * 3.6;
        baseData.current.relative_humidity_2m = extraData.openweathermap.main?.humidity || 50;

        baseData.daily.time.push(today);
        baseData.daily.temperature_2m_max.push(extraData.openweathermap.main?.temp_max || 20);
        baseData.daily.temperature_2m_min.push(extraData.openweathermap.main?.temp_min || 20);
        baseData.daily.temperature_2m_mean.push(extraData.openweathermap.main?.temp || 20);
        baseData.daily.precipitation_sum.push(0);
        baseData.daily.precipitation_probability_max.push(0);
        baseData.daily.wind_speed_10m_max.push(baseData.current.wind_speed_10m);
        baseData.daily.uv_index_max.push(0);
        baseData.daily.weather_code.push(0);
      } else {
        throw new Error("Toutes les API météo ont échoué.");
      }
    }

    const data = {
      ...baseData,
      extras: extraData,
      isFallback: usedFallback
    };

    res.json(data);
  } catch (error: any) {
    console.error("[Weather] Weather proxy error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default app;
