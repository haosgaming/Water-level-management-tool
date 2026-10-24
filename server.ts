import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route to generate customized Arduino code via Gemini 3.5 Flash
  app.post("/api/generate-arduino", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({
          error: "GEMINI_API_KEY is missing. Please add it in the Secrets panel in AI Studio settings to unlock AI-powered custom code generation."
        });
      }

      const {
        tankASensorType,
        tankATotalHeight,
        tankAMinLevel,
        tankAMaxLevel,
        tankBSensorType,
        tankBMinLevel,
        tankBMaxLevel,
        enableRefillValve,
        enableBTransfer,
        pinTankATrigger,
        pinTankAEcho,
        pinRefillValve,
        pinTransferPump,
        pinTankBTrigger,
        pinTankBEcho,
        safetyDryRun,
        safetyRefillTimeout,
        displayType,
        customRequirements
      } = req.body;

      // Initialize Google GenAI on-demand (lazy initialization)
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const systemPrompt = `Jsi expert na vestavěné systémy (embedded systems) a programování Arduino (C++).
Tvým úkolem je vygenerovat přehledný, bezpečný, vysoce optimalizovaný a česky komentovaný kód pro desku Arduino spravující systém dvou nádrží na vodu podle konfigurace uživatele.
Uživatel požaduje systém pro:
1. Měření hladiny vody v nádrži A (primární/dopouštěná nahrž).
2. Automatické dopouštění nádrže A pomocí elektroventilu.
3. Volitelné přečerpávání vody z nádrže A do větší nádrže B (sekundární zásobník) pomocí čerpadla podle potřeby a hladiny v obou nádržích.

Použij následující nastavení z konfigurace:
- Nádrž A senzor: ${tankASensorType} (Trigger pin: ${pinTankATrigger}, Echo pin: ${pinTankAEcho})
- Nádrž A celková výška: ${tankATotalHeight} cm
- Nádrž A minimální hladina pro spuštění dopouštění: ${tankAMinLevel} % (např. sepne elektroventil na pinu ${pinRefillValve})
- Nádrž A maximální hladina pro zastavení dopouštění: ${tankAMaxLevel} %
- Nádrž B senzor: ${tankBSensorType} ${tankBSensorType === "ultrasonic" ? `(Trigger pin: ${pinTankBTrigger}, Echo pin: ${pinTankBEcho})` : ""}
- Nádrž B cíle sepnutí čerpadla na pinu ${pinTransferPump}: Spustit, když klesne pod ${tankBMinLevel} %, ale POUZE pokud je v nádrži A dostatek vody (>50 % k zamezení chodu na sucho: ${safetyDryRun ? "Aktivní" : "Vypnuto"}). Zastavit přečerpávání při ${tankBMaxLevel} % nebo když nádrž A klesne pod kritickou úroveň.
- Bezpečnostní pojistky:
  * Ochrana proti chodu na sucho: ${safetyDryRun ? "ANO (čerpadlo neběží, pokud je nádrž A pod 30%)" : "NE"}
  * Časový limit dopouštění (timeout): ${safetyRefillTimeout > 0 ? `${safetyRefillTimeout} sekund (pokud ventil dopouští déle, vypnout a vyhlásit alarm, aby se zamezilo přetečení při poruše senzoru)` : "Vypnuto"}
- Displej: ${displayType} (I2C sběrnice, LCD 16x2 nebo OLED SSD1306, nebo jen Serial monitor)

Uživatel přidal tyto dodatečné požadavky:
"${customRequirements || "Žádné další požadavky."}"

Kód musí:
- Obsahovat kompletní setup(), loop(), pomocné funkce pro měření senzorů, filtrující šum (např. průměrování měření k zamezení sepnutí vlivem čeření hladiny).
- Být napsán v čistém C++ pro Arduino s vynikající strukturou státního automatu (FSM).
- Být bohatě komentován v ČEŠTINĚ, aby uživatel pochopil, co který řádek dělá.
- Obsahovat výpis na Serial monitor, aby uživatel viděl aktuální stav (v % i v cm) a stav ventilu/čerpadla.
- Pokud je vybrán LCD nebo OLED displej, zahrnout inicializaci knihovny (např. <Wire.h> a <LiquidCrystal_I2C.h> nebo <Adafruit_SSD1306.h>) a zobrazovat stav na displeji.
- Být připraven k přímému nahrání do Arduino IDE bez nutnosti složitých úprav.

Formát odpovědi: Vrátíš pouze čistý vygenerovaný kód pro Arduino obalený standardním markdownem se syntaxí \`\`\`cpp ... \`\`\`, a pod ním stručné česky psané zapojení pinů a návod, jak kód nahrát. Nepoužívej žádný jiný úvod.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: req.body.prompt || "Navrhni kód pro Arduino podle zadané specifikace",
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.2,
        }
      });

      res.json({ code: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Nepodařilo se vygenerovat kód." });
    }
  });

  // Setup Vite middleware for developmental rendering, or serve compiled files in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
