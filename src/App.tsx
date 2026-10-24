import React, { useState, useEffect, useRef } from "react";
import { 
  Settings, 
  Play, 
  Pause, 
  FileCode, 
  Terminal, 
  Copy, 
  Check, 
  Sparkles, 
  Activity, 
  Thermometer, 
  Clock, 
  HelpCircle,
  RefreshCw,
  Home
} from "lucide-react";
import { SystemSettings, SimulationState, TankSensorType, DisplayType } from "./types";
import { generateBaselineArduinoCode } from "./utils/codeGenerator";
import { generateESPHomeYaml, generateHomeAssistantYaml } from "./utils/homeAssistantGenerator";
import TankVisualizer from "./components/TankVisualizer";

const INITIAL_SETTINGS: SystemSettings = {
  tankA: {
    sensorType: "ultrasonic",
    totalHeightCm: 150,
    minLevelPercent: 20,
    maxLevelPercent: 90
  },
  tankB: {
    sensorType: "ultrasonic",
    totalHeightCm: 250,
    minLevelPercent: 30,
    maxLevelPercent: 85
  },
  pins: {
    tankATrigger: 2,
    tankAEcho: 3,
    tankAFloatLow: 4,
    tankAFloatMed: 5,
    tankAFloatHigh: 6,
    tankAPressureAnalog: 0, // A0
    refillValve: 7,
    tankBTrigger: 8,
    tankBEcho: 9,
    tankBFloatLow: 10,
    tankBFloatHigh: 11,
    transferPump: 12
  },
  displayType: "lcd1602",
  safetyDryRun: true,
  safetyRefillTimeout: 45, // seconds
  enableBTransfer: true
};

export default function App() {
  const [settings, setSettings] = useState<SystemSettings>(INITIAL_SETTINGS);
  
  // Simulation State
  const [sim, setSim] = useState<SimulationState>({
    waterLevelA: 65,
    waterLevelB: 45,
    refillValveOpen: false,
    transferPumpActive: false,
    errorState: "none",
    simulationSpeed: 2,
    isAutoSimulating: true
  });

  const [activeTab, setActiveTab] = useState<"code" | "wiring" | "cheatsheet" | "ha">("code");
  const [customRequirements, setCustomRequirements] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string>("");
  const [isAiGenerating, setIsAiGenerating] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [uptimeSeconds, setUptimeSeconds] = useState<number>(0);
  const [mcuTemp, setMcuTemp] = useState<number>(40.2);
  const [showHelper, setShowHelper] = useState<boolean>(false);
  
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Generate baseline code on load or setting variance
  useEffect(() => {
    const code = generateBaselineArduinoCode(settings, "cz");
    setGeneratedCode(code);
  }, [settings]);

  // Keep uptime and dynamic temperature ticking (simulating real hardware monitoring)
  useEffect(() => {
    const interval = setInterval(() => {
      setUptimeSeconds(prev => prev + 1);
      setMcuTemp(prev => {
        const drift = (Math.random() - 0.5) * 0.4;
        const base = sim.transferPumpActive || sim.refillValveOpen ? 43.5 : 39.0;
        const next = prev * 0.95 + base * 0.05 + drift;
        return parseFloat(next.toFixed(1));
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [sim.transferPumpActive, sim.refillValveOpen]);

  // Add Log Entry Helper
  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString('cs-CZ');
    setLogs(prev => {
      const next = [...prev, `[${timestamp}] ${msg}`];
      // Limit to 45 lines to save memory
      return next.slice(-45);
    });
  };

  const clearLogs = () => {
    setLogs([]);
    addLog("Konsola vymazána. Monitorování aktivní.");
  };

  // Scroll to bottom of terminal when logs change
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Initial greeting logs
  useEffect(() => {
    addLog("Vítejte v AquaLogic Arduino konfigurátoru a simulátoru.");
    addLog("Inicializace firmwaru úspěšná. Senzory online.");
    addLog("Pro vytvoření plně zakázkového kódu s AI klikněte vpravo na tlacitko ✨ Generovat.");
  }, []);

  // Simulation Logic loop
  useEffect(() => {
    let lastTime = Date.now();
    const simInterval = setInterval(() => {
      if (!sim.isAutoSimulating) return;

      setSim(current => {
        let tempLevelA = current.waterLevelA;
        let tempLevelB = current.waterLevelB;
        let tempError = current.errorState;
        let tempValve = current.refillValveOpen;
        let tempPump = current.transferPumpActive;

        const dt = (Date.now() - lastTime) / 1000; // seconds elapsed
        const ticks = dt * current.simulationSpeed;

        // 1. Natural Evaporation / Slow consumption in both tanks
        tempLevelB = Math.max(0, tempLevelB - 0.08 * ticks);
        
        // Evaporation in A is slower, but system transfers water so there might be local uses
        tempLevelA = Math.max(0, tempLevelA - 0.04 * ticks);

        // 2. Control Logic for Refill Valve Tank A
        if (tempError !== "refill_timeout") {
          if (tempLevelA <= settings.tankA.minLevelPercent && !tempValve) {
            tempValve = true;
            addLog("Hladina v Nádrži A klesla pod limit. Otevírám dopouštěcí ventil V1.");
          } else if (tempLevelA >= settings.tankA.maxLevelPercent && tempValve) {
            tempValve = false;
            addLog("Dosažena horní hladina v Nádrži A. Zavírám dopouštěcí ventil V1.");
          }
        }

        // Valve fill action
        if (tempValve) {
          tempLevelA = Math.min(100, tempLevelA + 1.2 * ticks);
        }

        // 3. Control Logic for Transfer Pump (A -> B)
        if (settings.enableBTransfer) {
          if (tempLevelB <= settings.tankB.minLevelPercent && !tempPump) {
            // Check dry run condition
            const hasEnoughWater = tempLevelA >= 30;
            if (!settings.safetyDryRun || hasEnoughWater) {
              tempPump = true;
              addLog("Nízká voda v Nádrži B. Spouštím přečerpávací čerpadlo P1.");
            } else if (settings.safetyDryRun && !hasEnoughWater && tempError !== "dry_run_pump") {
              tempError = "dry_run_pump";
              addLog("VAROVÁNÍ: Chod na sucho zablokován! Nádrž B potřebuje vodu, ale Nádrž A má kriticky málo vody (<30%).");
            }
          } else if (tempLevelB >= settings.tankB.maxLevelPercent && tempPump) {
            tempPump = false;
            addLog("Nádrž B byla plně napuštěna. Vypínám přečerpávací čerpadlo P1.");
          }

          // Safety override during active pump run
          if (tempPump) {
            if (settings.safetyDryRun && tempLevelA < 25) {
              tempPump = false;
              tempError = "dry_run_pump";
              addLog("ALARM: Nouzové zastavení čerpadla P1! Hladina v Nádrži A klesla pod 25% (Ochrana sucha).");
            } else {
              // Pump action: drain A to fill B
              tempLevelA = Math.max(0, tempLevelA - 0.6 * ticks);
              tempLevelB = Math.min(100, tempLevelB + 0.8 * ticks);
              
              // Resolve dry run state if previously blocked but now recovered
              if (tempError === "dry_run_pump" && tempLevelA >= 35) {
                tempError = "none";
              }
            }
          }
        } else {
          tempPump = false;
        }

        // Refill timeout detection (if valve is open too long and level does not go up, etc., simulate by safe timer limits)
        // For actual simulation safety, if valve remains open while isAutoSimulating is running and level is stuck
        
        // Auto recover warning constraints
        if (tempError === "dry_run_pump" && tempLevelA >= 35) {
          tempError = "none";
        }

        return {
          ...current,
          waterLevelA: parseFloat(tempLevelA.toFixed(1)),
          waterLevelB: parseFloat(tempLevelB.toFixed(1)),
          refillValveOpen: tempValve,
          transferPumpActive: tempPump,
          errorState: tempError
        };
      });
      lastTime = Date.now();
    }, 150);

    return () => clearInterval(simInterval);
  }, [settings, sim.isAutoSimulating, sim.simulationSpeed]);

  // Handle Manual Trigger Actions
  const handleResetAlarm = () => {
    setSim(prev => ({
      ...prev,
      errorState: "none",
      refillValveOpen: false,
      transferPumpActive: false
    }));
    addLog("Resetování alarmů a výstrah. Celý systém obnoven.");
  };

  const handleManualRefillToggle = () => {
    if (sim.errorState === "refill_timeout") return;
    setSim(prev => {
      const targetState = !prev.refillValveOpen;
      addLog(`Ruční bypass: ${targetState ? "Zapnutí" : "Vypnutí"} dopouštěcího ventilu V1.`);
      return {
        ...prev,
        refillValveOpen: targetState
      };
    });
  };

  const handleManualPumpToggle = () => {
    if (!settings.enableBTransfer) return;
    setSim(prev => {
      const targetState = !prev.transferPumpActive;
      if (targetState && settings.safetyDryRun && sim.waterLevelA < 30) {
        addLog("Ruční bypass Čerpadla zamítnut! Nedostatek vody v Nádrži A (Ochrana sucha active).");
        return { ...prev, errorState: "dry_run_pump" };
      }
      addLog(`Ruční bypass: ${targetState ? "Zapnutí" : "Vypnutí"} přečerpávacího čerpadla P1.`);
      return {
        ...prev,
        transferPumpActive: targetState
      };
    });
  };

  // Convert uptime seconds to human-readable format
  const getFormattedUptime = () => {
    const hrs = Math.floor(uptimeSeconds / 3600).toString().padStart(2, '0');
    const mins = Math.floor((uptimeSeconds % 3600) / 60).toString().padStart(2, '0');
    const secs = (uptimeSeconds % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  // Copy Code to Clipboard Helper
  const handleCopyCode = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    addLog("Zdrojový kód byl zkopírován do schránky.");
    setTimeout(() => setCopied(false), 2000);
  };

  // Send request to server to generate advanced customized AI code
  const handleAiGenerateCode = async () => {
    setIsAiGenerating(true);
    setAiError(null);
    addLog("Odesílám specifikaci do Gemini AI pro vygenerování pokročilého firmwaru...");
    
    try {
      const response = await fetch("/api/generate-arduino", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          // Pass settings configurations
          tankASensorType: settings.tankA.sensorType,
          tankATotalHeight: settings.tankA.totalHeightCm,
          tankAMinLevel: settings.tankA.minLevelPercent,
          tankAMaxLevel: settings.tankA.maxLevelPercent,
          tankBSensorType: settings.tankB.sensorType,
          tankBMinLevel: settings.tankB.minLevelPercent,
          tankBMaxLevel: settings.tankB.maxLevelPercent,
          enableRefillValve: true,
          enableBTransfer: settings.enableBTransfer,
          pinTankATrigger: settings.pins.tankATrigger,
          pinTankAEcho: settings.pins.tankAEcho,
          pinRefillValve: settings.pins.refillValve,
          pinTransferPump: settings.pins.transferPump,
          pinTankBTrigger: settings.pins.tankBTrigger,
          pinTankBEcho: settings.pins.tankBEcho,
          safetyDryRun: settings.safetyDryRun,
          safetyRefillTimeout: settings.safetyRefillTimeout,
          displayType: settings.displayType,
          customRequirements: customRequirements,
          // Custom prompt wrapping instructions
          prompt: `Ahoj Gemini! Vygeneruj kód pro specifikaci s těmito doplňky: ${customRequirements || "Standardní průběh"}`
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Při komunikaci se serverem došlo k chybě.");
      }

      if (data.code) {
        setGeneratedCode(data.code);
        addLog("Výborně! Gemini AI úspešně vygenerovalo pokročilý kód na míru s bohatými českými popisky.");
      } else {
        throw new Error("Server neposkytl kód v odpovědi.");
      }
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Nepodařilo se navázat spojení se serverovým API.");
      addLog(`CHYBA AI GENERÁTORU: ${err.message || "Nepodařilo se vygenerovat."}`);
    } finally {
      setIsAiGenerating(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#05070a] text-slate-300 font-sans flex flex-col p-4 md:p-6 gap-6 selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* Header Section */}
      <header className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-4 shrink-0 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 bg-cyan-500 rounded-full shadow-[0_0_12px_rgba(6,182,212,0.8)] animate-pulse"></span>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white uppercase font-mono">
              AquaLogic Controller Simulator
            </h1>
          </div>
          <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">
            Arduino Core System • Řízení a monitorování dvou nadrží • Lokalizováno v češtině
          </p>
        </div>
        
        {/* Hardware Status Monitoring Box */}
        <div className="flex flex-wrap items-center gap-4 md:gap-8 bg-slate-900/60 p-3 rounded-xl border border-slate-800/85">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-500" />
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">UPTIME SYSTEMU</div>
              <div className="font-mono text-xs md:text-sm text-cyan-400 font-bold">{getFormattedUptime()}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Thermometer className="w-4 h-4 text-indigo-400" />
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">TEPLOTA ČIPU</div>
              <div className="font-mono text-xs md:text-sm text-indigo-300 font-bold">{mcuTemp} °C</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">ODEZVA SENZORŮ</div>
              <div className="font-mono text-xs md:text-sm text-emerald-400 font-bold">12 ms</div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid Content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        
        {/* Left sidebar: Configuration controls */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-[#0c111a] border border-slate-800/80 rounded-2xl p-4 md:p-5 flex flex-col gap-5 relative overflow-hidden shrink-0">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-cyan-500"></div>
            
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800/60">
              <Settings className="w-5 h-5 text-cyan-400" />
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                Konfigurace & Návrh zapojení
              </h2>
            </div>

            {/* Config Form Tabs or Accordion Blocks */}
            <div className="flex flex-col gap-5 overflow-y-auto max-h-[500px] pr-2 scrollbar-thin scrollbar-thumb-slate-800">
              
              {/* TANK A CONFIGURATION */}
              <div className="space-y-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block"></span>
                    PRIMÁRNÍ NÁDRŽ A
                  </span>
                  <span className="text-[10px] text-slate-500">Dopouštěná</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Typ senzoru hladiny</label>
                    <select 
                      value={settings.tankA.sensorType}
                      onChange={(e) => setSettings({
                        ...settings,
                        tankA: { ...settings.tankA, sensorType: e.target.value as TankSensorType }
                      })}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="ultrasonic">Ultrazvuk (HC-SR04)</option>
                      <option value="floats">3 Plováky (Výška)</option>
                      <option value="pressure">Analogový tlakový s.</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Celková výška (cm)</label>
                    <input 
                      type="number"
                      value={settings.tankA.totalHeightCm}
                      onChange={(e) => setSettings({
                        ...settings,
                        tankA: { ...settings.tankA, totalHeightCm: Math.max(1, Number(e.target.value)) }
                      })}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Hranice sepnutí MIN (%)</label>
                    <input 
                      type="number"
                      min="0"
                      max="99"
                      value={settings.tankA.minLevelPercent}
                      onChange={(e) => setSettings({
                        ...settings,
                        tankA: { ...settings.tankA, minLevelPercent: Math.min(settings.tankA.maxLevelPercent - 5, Math.max(0, Number(e.target.value))) }
                      })}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Hranice vypnutí MAX (%)</label>
                    <input 
                      type="number"
                      min="1"
                      max="100"
                      value={settings.tankA.maxLevelPercent}
                      onChange={(e) => setSettings({
                        ...settings,
                        tankA: { ...settings.tankA, maxLevelPercent: Math.max(settings.tankA.minLevelPercent + 5, Math.min(100, Number(e.target.value))) }
                      })}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>

              {/* TANK B CONFIGURATION */}
              <div className="space-y-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block"></span>
                    SEKUNDÁRNÍ NÁDRŽ B
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">Přečerpávání</span>
                    <input 
                      type="checkbox"
                      checked={settings.enableBTransfer}
                      onChange={(e) => setSettings({ ...settings, enableBTransfer: e.target.checked })}
                      className="rounded accent-indigo-500 cursor-pointer w-3.5 h-3.5"
                    />
                  </div>
                </div>

                {settings.enableBTransfer && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Typ senzoru nádrže B</label>
                        <select 
                          value={settings.tankB.sensorType}
                          onChange={(e) => setSettings({
                            ...settings,
                            tankB: { ...settings.tankB, sensorType: e.target.value as TankSensorType }
                          })}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
                        >
                          <option value="ultrasonic">Ultrazvuk (HC-SR04)</option>
                          <option value="floats">2 Plovákové senzory</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Cílové sepnutí MIN (%)</label>
                        <input 
                          type="number"
                          value={settings.tankB.minLevelPercent}
                          onChange={(e) => setSettings({
                            ...settings,
                            tankB: { ...settings.tankB, minLevelPercent: Math.min(settings.tankB.maxLevelPercent - 5, Number(e.target.value)) }
                          })}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Výška zásobníku B (cm)</label>
                        <input 
                          type="number"
                          value={settings.tankB.totalHeightCm}
                          onChange={(e) => setSettings({
                            ...settings,
                            tankB: { ...settings.tankB, totalHeightCm: Math.max(1, Number(e.target.value)) }
                          })}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Cílové naplnění MAX (%)</label>
                        <input 
                          type="number"
                          value={settings.tankB.maxLevelPercent}
                          onChange={(e) => setSettings({
                            ...settings,
                            tankB: { ...settings.tankB, maxLevelPercent: Math.max(settings.tankB.minLevelPercent + 5, Number(e.target.value)) }
                          })}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* DISPLAY TYPE AND HARDWARE TIMEOUTS */}
              <div className="space-y-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/50">
                <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                  KONFIGURACE PERIFERIÍ & DISPLEJE
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Výstupní zobrazovač</label>
                    <select 
                      value={settings.displayType}
                      onChange={(e) => setSettings({ ...settings, displayType: e.target.value as DisplayType })}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="serial">Jen Sériový monitor</option>
                      <option value="lcd1602">LCD 1602 Display (I2C)</option>
                      <option value="oled1306">OLED SSD1306 (I2C)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Max čas dopouštění (s)</label>
                    <input 
                      type="number"
                      value={settings.safetyRefillTimeout}
                      onChange={(e) => setSettings({ ...settings, safetyRefillTimeout: Math.max(0, Number(e.target.value)) })}
                      placeholder="0 pro zakázání"
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-slate-200">Ochrana proti běhu nasucho</span>
                    <span className="text-[10px] text-slate-500">Zastaví čerpadlo pokud je nádrž A &lt; 30%</span>
                  </div>
                  <input 
                    type="checkbox"
                    checked={settings.safetyDryRun}
                    onChange={(e) => setSettings({ ...settings, safetyDryRun: e.target.checked })}
                    className="rounded accent-emerald-500 cursor-pointer w-4 h-4 ml-4"
                  />
                </div>
              </div>

              {/* GPIO PINS ASSIGNMENT */}
              <div className="space-y-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/50">
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                  PŘIŘAZENÍ PINŮ (GPIO ARDUINA)
                </span>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[9px] text-slate-400">Trigger A (Ultr)</label>
                    <input 
                      type="number"
                      value={settings.pins.tankATrigger}
                      onChange={(e) => setSettings({ ...settings, pins: { ...settings.pins, tankATrigger: Number(e.target.value) }})}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-white text-center font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-slate-400">Echo A (Ultr)</label>
                    <input 
                      type="number"
                      value={settings.pins.tankAEcho}
                      onChange={(e) => setSettings({ ...settings, pins: { ...settings.pins, tankAEcho: Number(e.target.value) }})}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-white text-center font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-slate-400">Ventil V1</label>
                    <input 
                      type="number"
                      value={settings.pins.refillValve}
                      onChange={(e) => setSettings({ ...settings, pins: { ...settings.pins, refillValve: Number(e.target.value) }})}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-white text-center font-mono"
                    />
                  </div>
                </div>

                {settings.enableBTransfer && (
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-850">
                    <div>
                      <label className="block text-[9px] text-slate-400">Trigger B (Ultr)</label>
                      <input 
                        type="number"
                        value={settings.pins.tankBTrigger}
                        onChange={(e) => setSettings({ ...settings, pins: { ...settings.pins, tankBTrigger: Number(e.target.value) }})}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-white text-center font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-slate-400">Echo B (Ultr)</label>
                      <input 
                        type="number"
                        value={settings.pins.tankBEcho}
                        onChange={(e) => setSettings({ ...settings, pins: { ...settings.pins, tankBEcho: Number(e.target.value) }})}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-white text-center font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-slate-400">Čerpadlo P1</label>
                      <input 
                        type="number"
                        value={settings.pins.transferPump}
                        onChange={(e) => setSettings({ ...settings, pins: { ...settings.pins, transferPump: Number(e.target.value) }})}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-white text-center font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Custom AI Guidelines Prompts input */}
            <div className="mt-2 pt-4 border-t border-slate-800 space-y-2">
              <label className="text-xs text-slate-300 font-medium flex items-center justify-between">
                <span>Doplňující požadavky pro AI</span>
                <span className="text-[10px] text-purple-400 flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" /> Volitelná specifikace</span>
              </label>
              <textarea 
                rows={3}
                value={customRequirements}
                onChange={(e) => setCustomRequirements(e.target.value)}
                placeholder="Např. Přidej výstražný bzučák na pin D4 při alarmu napouštění nebo zašli kód pro ESP32..."
                className="w-full bg-slate-950 border border-slate-800/90 rounded-lg p-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20"
              />
            </div>

          </div>

          {/* Quick Arduino Cheat-sheet instructions card */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
              NÁVOD K NAHRÁNÍ DO ARDUINA
            </h4>
            <ol className="text-xs text-slate-400 list-decimal list-inside space-y-1.5 leading-relaxed">
              <li>Zkopírujte kód vygenerovaný v pravém panelu.</li>
              <li>Otevřete program <strong className="text-slate-200 font-medium">Arduino IDE</strong> na počítači.</li>
              <li>Připojte Arduino desku přes USB kabel k PC.</li>
              <li>Vložte kód, vyberte správný port v menu <code className="bg-slate-950 text-cyan-400 px-1 py-0.5 rounded text-[10px]">Nástroje &gt; Port</code>.</li>
              <li>Pokud používáte displej, nainstalujte doporučené knihovny popsané u zapojení.</li>
              <li>Kliknutím na tlačítko <strong className="text-emerald-400 font-medium font-mono">Upload (Nahrát)</strong> nahrajte firmware.</li>
            </ol>
          </div>
        </div>

        {/* Center/Right columns: Interactive Simulator & Generated code */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Active Interactive simulator */}
          <TankVisualizer 
            settings={settings} 
            simState={sim}
            onSetLevelA={(val) => setSim(prev => ({ ...prev, waterLevelA: val }))}
            onSetLevelB={(val) => setSim(prev => ({ ...prev, waterLevelB: val }))}
          />

          {/* Simulation controller dashboard */}
          <div className="bg-[#0c111a] border border-slate-800 p-4 rounded-xl flex flex-wrap gap-4 items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setSim(prev => ({ ...prev, isAutoSimulating: !prev.isAutoSimulating }))}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${sim.isAutoSimulating ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 hover:bg-cyan-500/30" : "bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-white"}`}
              >
                {sim.isAutoSimulating ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    Zastavit simulaci
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Pustit simulaci
                  </>
                )}
              </button>

              <div className="flex items-center gap-1.5 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider px-1">Rychlost:</span>
                {[1, 2, 5, 10].map((speed) => (
                  <button 
                    key={speed}
                    onClick={() => setSim(prev => ({ ...prev, simulationSpeed: speed }))}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${sim.simulationSpeed === speed ? "bg-cyan-500 text-slate-950 font-bold" : "text-slate-400 hover:bg-slate-900"}`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>

            {/* Quick manual overrides */}
            <div className="flex gap-2 items-center flex-wrap">
              <button 
                onClick={handleManualRefillToggle}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${sim.refillValveOpen ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/50" : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-900"}`}
              >
                Bypass Ventil V1: {sim.refillValveOpen ? "ON" : "OFF"}
              </button>

              {settings.enableBTransfer && (
                <button 
                  onClick={handleManualPumpToggle}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${sim.transferPumpActive ? "bg-indigo-950/40 text-indigo-400 border-indigo-500/50" : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-900"}`}
                >
                  Bypass Pumpa P1: {sim.transferPumpActive ? "MĚŘENÍ" : "ODSTAV"}
                </button>
              )}

              {sim.errorState !== "none" && (
                <button 
                  onClick={handleResetAlarm}
                  className="flex items-center gap-1 px-3 py-1.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-lg text-[10px] font-bold uppercase transition-all hover:bg-rose-500 hover:text-white"
                >
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Reset Alarmu
                </button>
              )}
            </div>
          </div>

          {/* Generated Code Display and Tabs */}
          <div className="bg-[#0c111a] border border-slate-800 rounded-2xl p-5 flex flex-col gap-4 relative">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
              
              {/* Selector tabs */}
              <div className="flex gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800 w-fit">
                <button 
                  onClick={() => setActiveTab("code")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${activeTab === "code" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
                >
                  <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                  C++ Zdrojový kód
                </button>
                <button 
                  onClick={() => setActiveTab("wiring")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${activeTab === "wiring" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
                >
                  <Terminal className="w-3.5 h-3.5 text-amber-400" />
                  Zapojení pinů
                </button>
                <button 
                  onClick={() => setActiveTab("ha")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${activeTab === "ha" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
                >
                  <Home className="w-3.5 h-3.5 text-blue-400" />
                  Home Assistant (HA)
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleAiGenerateCode}
                  disabled={isAiGenerating}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-purple-900 disabled:to-indigo-900 disabled:text-slate-600 text-white text-xs font-semibold rounded-lg shadow-lg shadow-purple-900/30 font-mono transition-all uppercase"
                >
                  {isAiGenerating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Vyvíjím kód...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                      Generovat přes Gemini AI ✨
                    </>
                  )}
                </button>

                <button 
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold rounded-lg border border-slate-700 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Zkopírováno!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Kopírovat
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* AI Warning / State info banner */}
            {aiError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs">
                Používám základní vestavěný generátor kódu. Pro odblokování pokročilého AI modelu nejprve zadejte Váš klíč <strong>GEMINI_API_KEY</strong> v Nastavení (Secrets) rozhraní AI Studio.
              </div>
            )}

            {/* TAB-1: C++ Code display window */}
            {activeTab === "code" && (
              <div className="relative bg-slate-950 rounded-xl border border-slate-850 p-4 font-mono text-xs max-h-[420px] overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800">
                <div className="absolute top-2 right-4 text-[10px] text-slate-600 select-none uppercase">
                  arduino-firmware.ino
                </div>
                <pre className="text-emerald-400/90 leading-relaxed">
                  <code>{generatedCode}</code>
                </pre>
              </div>
            )}

            {/* TAB-2: Retro-styled physical wiring block in Czechoslovak syntax */}
            {activeTab === "wiring" && (
              <div className="bg-slate-950 rounded-xl border border-slate-850 p-5 font-mono text-xs max-h-[420px] overflow-y-auto space-y-4">
                <div className="border-b border-dashed border-slate-800 pb-3">
                  <span className="text-amber-400 font-bold uppercase block mb-1">🔌 SCHÉMA ZAPOJENÍ PRO ARDUINO UNO / NANO</span>
                  <span className="text-slate-500 text-[10px]">Zapojte vodiče přesně podle těchto zadaných pinů:</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h5 className="text-slate-200 font-bold underline">Část 1: Vstupní Čidla</h5>
                    <ul className="space-y-1.5 text-slate-350 list-inside text-[11px]">
                      {settings.tankA.sensorType === "ultrasonic" ? (
                        <>
                          <li>🔵 <strong className="text-cyan-400">HC-SR04 Nádrž A</strong> (Ultrazvuk):
                            <ul className="pl-4 text-[10px] space-y-0.5 text-slate-400">
                              <li>VCC ➔ 5V</li>
                              <li>GND ➔ GND</li>
                              <li>Trig ➔ Pin {settings.pins.tankATrigger}</li>
                              <li>Echo ➔ Pin {settings.pins.tankAEcho}</li>
                            </ul>
                          </li>
                        </>
                      ) : settings.tankA.sensorType === "floats" ? (
                        <>
                          <li>🔵 <strong className="text-cyan-400">Plováky Nádrž A</strong> (Signální vodiče sepnou proti GND):
                            <ul className="pl-4 text-[10px] space-y-0.5 text-slate-400">
                              <li>Spodní plovák (Dry)  ➔ Pin {settings.pins.tankAFloatLow}</li>
                              <li>Střední plovák (Min)  ➔ Pin {settings.pins.tankAFloatMed}</li>
                              <li>Svrchní plovák (Max)  ➔ Pin {settings.pins.tankAFloatHigh}</li>
                            </ul>
                          </li>
                        </>
                      ) : (
                        <li>🔵 <strong className="text-cyan-400">Analogový Tlakový Senzor A</strong>: Vodič signálu ➔ Pin A{settings.pins.tankAPressureAnalog}</li>
                      )}

                      {settings.enableBTransfer && (
                        settings.tankB.sensorType === "ultrasonic" ? (
                          <li>🟣 <strong className="text-indigo-400">HC-SR04 Nádrž B</strong> (Ultrazvuk):
                            <ul className="pl-4 text-[10px] space-y-0.5 text-slate-400">
                              <li>VCC ➔ 5V</li>
                              <li>GND ➔ GND</li>
                              <li>Trig ➔ Pin {settings.pins.tankBTrigger}</li>
                              <li>Echo ➔ Pin {settings.pins.tankBEcho}</li>
                            </ul>
                          </li>
                        ) : (
                          <li>🟣 <strong className="text-indigo-400">Plováky Nádrž B</strong> (Sepní):
                            <ul className="pl-4 text-[10px] space-y-0.5 text-slate-400">
                              <li>Spodní Plovák B (Min) ➔ Pin {settings.pins.tankBFloatLow}</li>
                              <li>Svrchní Plovák B (Max) ➔ Pin {settings.pins.tankBFloatHigh}</li>
                            </ul>
                          </li>
                        )
                      )}
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <h5 className="text-slate-200 font-bold underline">Část 2: Výkonové Prvky Relé</h5>
                    <ul className="space-y-1.5 text-slate-350 list-inside text-[11px]">
                      <li>🎛️ <strong className="text-emerald-400">Refill Elektroventil (V1)</strong>:
                        <ul className="pl-4 text-[10px] space-y-0.5 text-slate-400">
                          <li>Sledování Relé IN ➔ Pin {settings.pins.refillValve}</li>
                          <li>Relé COM / NO ➔ zapojeno v sérii s napájením ventilu (např. 12V / 24V / 230V)</li>
                        </ul>
                      </li>

                      {settings.enableBTransfer && (
                        <li>🎛️ <strong className="text-indigo-400">Přečerpávací Čerpadlo (P1)</strong>:
                          <ul className="pl-4 text-[10px] space-y-0.5 text-slate-400">
                            <li>Sledování Relé IN ➔ Pin {settings.pins.transferPump}</li>
                            <li>Relé COM / NO ➔ zapojeno v sérii s napájením čerpadla</li>
                          </ul>
                        </li>
                      )}

                      {settings.displayType !== "serial" && (
                        <li>📺 <strong className="text-amber-400">Obrazovka I2C (Displej)</strong>:
                          <ul className="pl-4 text-[10px] space-y-0.5 text-slate-400">
                            <li>SDA ➔ analogový pin A4 na Uno / Nano</li>
                            <li>SCL ➔ analogový pin A5 na Uno / Nano</li>
                            <li>VCC ➔ 5V | GND ➔ GND</li>
                          </ul>
                        </li>
                      )}
                    </ul>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-900 text-[10px] text-slate-500">
                  ⚠️ <em>Poznámka: Pro silová relé spínající 230V AC vždy doporučujeme svěřit zapojení osobě s odpovídající elektrotechnickou kvalifikací!</em>
                </div>
              </div>
            )}

            {/* TAB-3: Home Assistant & ESPHome custom setups */}
            {activeTab === "ha" && (
              <div className="bg-slate-950 rounded-xl border border-slate-850 p-5 font-mono text-xs max-h-[420px] overflow-y-auto space-y-6">
                <div>
                  <span className="text-blue-400 font-bold uppercase block mb-1 text-[13px]">🏡 INTEGRACE DO CHYTRÉ DOMÁCNOSTI HOME ASSISTANT</span>
                  <span className="text-slate-500 text-[10px]">
                    Pro bezproblémové propojení s Home Assistantem můžete systém postavit na platformě ESP (ESP32/ESP8266) s použitím ESPHome, což je de-facto standard bez programování, nebo využít MQTT.
                  </span>
                </div>

                {/* Sub Tab selection internal to HA tab */}
                <div className="space-y-4">
                  <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-3">
                    <h5 className="text-emerald-400 font-bold text-[13px] border-b border-slate-800 pb-1.5">Možnost A: ESPHome (Doporučeno)</h5>
                    <p className="text-[11px] text-slate-400 leading-normal">
                      ESPHome vytváří nativní propojení s Home Assistantem. Celá logika hlídání hladiny v nádržích navíc běží 
                      <strong> lokálně na desce</strong>. Pokud Vám spadne WiFi nebo domácí server, dopouštění i pumpa budou nadále bezpečně pracovat!
                    </p>
                    
                    <div className="relative pt-2">
                      <span className="text-[10px] text-slate-500 block mb-1 uppercase tracking-wider">Vygenerovaný ESPHome YAML kód:</span>
                      <pre className="p-3 bg-slate-950 rounded-lg text-[10px] text-teal-300 leading-relaxed overflow-x-auto max-h-[220px]">
                        <code>{generateESPHomeYaml(settings)}</code>
                      </pre>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(generateESPHomeYaml(settings));
                          addLog("ESPHome YAML konfigurace zkopírována do schránky.");
                        }}
                        className="mt-2 text-[10px] px-3 py-1 bg-emerald-900/40 text-emerald-300 hover:bg-emerald-500 hover:text-slate-950 rounded font-bold uppercase transition-all"
                      >
                        Zkopírovat ESPHome kód
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-3">
                    <h5 className="text-indigo-400 font-bold text-[13px] border-b border-slate-800 pb-1.5">Možnost B: MQTT (configuration.yaml)</h5>
                    <p className="text-[11px] text-slate-400 leading-normal">
                      Pokud dáváte přednost klasickému Arduinu s Ethernet shieldem nebo posíláte data z Arduina přes WiFi, MQTT broker je skvělá volba. 
                      Postačí, když Vaše Arduino bude publikovat zprávy na specifikovaná témata (Topics) a naslouchat příkazům.
                    </p>

                    <div className="relative pt-2">
                      <span className="text-[10px] text-slate-500 block mb-1 uppercase tracking-wider">Konfigurační kód do configuration.yaml v HA:</span>
                      <pre className="p-3 bg-slate-950 rounded-lg text-[10px] text-indigo-300 leading-relaxed overflow-x-auto max-h-[200px]">
                        <code>{generateHomeAssistantYaml(settings)}</code>
                      </pre>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(generateHomeAssistantYaml(settings));
                          addLog("Home Assistant MQTT configuration.yaml byl zkopírován.");
                        }}
                        className="mt-2 text-[10px] px-3 py-1 bg-indigo-900/40 text-indigo-300 hover:bg-indigo-500 hover:text-slate-950 rounded font-bold uppercase transition-all"
                      >
                        Zkopírovat HA YAML kód
                      </button>
                    </div>
                  </div>

                  <div className="bg-blue-950/20 p-3 rounded-lg border border-blue-500/30 text-[11px] text-blue-300 space-y-1">
                    <strong className="block text-[12px] uppercase">💡 Postup zprovoznění integrace v Home Assistentu:</strong>
                    <ol className="list-decimal list-inside space-y-1 pl-1 text-slate-400">
                      <li>Ujistěte se, že máte v Home Assistantu nainstalovaný add-on <strong>ESPHome</strong>.</li>
                      <li>Vytvořte nové zařízení v ESPHome a vložte do něj zkopírovaný YAML kód výše.</li>
                      <li>Klikněte na <strong>Install</strong> a flashněte firmwaru do Vašeho ESP32 přes USB nebo OTA (WiFi).</li>
                      <li>V Home Assistentu v záložce Nastavení ➔ Zařízení a integrace uvidíte automaticky nalezené zařízení AquaLogic k přihlášení.</li>
                      <li>Přidejte si na svou přehledovou kartu (Lovelace Dashboard) vizuální karty ukazující objem nádrží a stav přepínačů!</li>
                    </ol>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Serial Log / Console output block */}
      <footer className="bg-[#080a0f] border border-slate-800 rounded-2xl flex flex-col md:flex-row shrink-0 overflow-hidden min-h-[160px]">
        {/* Console info terminal rail tab */}
        <div className="w-full md:w-16 bg-slate-950 flex md:flex-col items-center justify-between md:justify-start px-4 md:px-0 md:py-4 border-b md:border-b-0 md:border-r border-slate-850 text-slate-600 gap-2">
          <div className="flex items-center md:flex-col gap-2">
            <Terminal className="w-5 h-5 text-cyan-500 animate-pulse" />
            <div className="text-[10px] md:-rotate-90 md:my-6 whitespace-nowrap uppercase tracking-widest font-mono select-none">
              SERIAL MON
            </div>
          </div>
          <button 
            onClick={clearLogs}
            className="text-[9px] px-2 py-1 bg-slate-900 hover:bg-slate-800 rounded text-slate-400 font-bold transition-all"
          >
            Clear
          </button>
        </div>

        {/* Console Text Logger Container */}
        <div id="serial-terminal" className="flex-1 p-4 font-mono text-[11px] leading-relaxed max-h-[180px] overflow-y-auto bg-[#040609] text-slate-400">
          <div className="text-emerald-500 italic mb-2 uppercase text-[9px] tracking-wider">// Arduino Serial Monitor Output (9600 baud)</div>
          <div className="space-y-1">
            {logs.map((log, index) => (
              <div 
                key={index} 
                className={`${log.includes("VAROVÁNÍ") || log.includes("ALARM") ? "text-rose-400 bg-rose-950/20 px-1 rounded border-l border-rose-500" : log.includes("Úspěšně") || log.includes("v pořádku") ? "text-emerald-400" : "text-slate-400"}`}
              >
                {log}
              </div>
            ))}
            <div ref={consoleEndRef} />
          </div>
        </div>

        {/* Emergency manual controllers on right corner */}
        <div className="w-full md:w-56 bg-slate-900/40 p-4 border-t md:border-t-0 md:border-l border-slate-800 flex flex-row md:flex-col justify-center gap-2">
          <button 
            onClick={() => {
              setSim(prev => ({
                ...prev,
                waterLevelA: 5,
                waterLevelB: 50,
                refillValveOpen: true,
                transferPumpActive: false,
                errorState: "none"
              }));
              addLog("Nouzové vypouštění / Test suché ochrany spuštěn.");
            }}
            className="flex-1 w-full py-2 bg-rose-900/20 border border-rose-500/50 text-rose-500 text-[10px] font-bold uppercase rounded hover:bg-rose-500 hover:text-white transition-all text-center"
          >
            Test Suchého Běhu
          </button>
          
          <button 
            onClick={() => {
              setSettings(INITIAL_SETTINGS);
              addLog("Nastavení pinů a hardwarových senzorů resetováno do výchozích hodnot.");
            }}
            className="flex-1 w-full py-2 bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold uppercase rounded hover:bg-slate-700 transition-all text-center"
          >
            Tovární Reset
          </button>
        </div>
      </footer>
    </div>
  );
}
