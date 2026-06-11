const { GoogleGenAI } = require("@google/genai");

async function test() {
  const ai = new GoogleGenAI({});
  const models = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-2.0-flash', 'gemini-3.0-flash', 'gemini-3-flash-preview', 'gemini-1.5-flash'];
  
  for (const m of models) {
    try {
      await ai.models.generateContent({ model: m, contents: "Hello" });
      console.log(m + ' SUCCESS');
    } catch(e) {
      console.log(m + ' FAILED: ' + e.message);
    }
  }
}
test();
