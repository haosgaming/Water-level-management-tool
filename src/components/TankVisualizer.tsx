import { motion } from "motion/react";
import { ArrowBigDown, ArrowRight, ShieldCheck, AlertTriangle } from "lucide-react";
import { SystemSettings, SimulationState } from "../types";

interface TankVisualizerProps {
  settings: SystemSettings;
  simState: SimulationState;
  onSetLevelA: (val: number) => void;
  onSetLevelB: (val: number) => void;
}

export default function TankVisualizer({ settings, simState, onSetLevelA, onSetLevelB }: TankVisualizerProps) {
  const { tankA, tankB, enableBTransfer } = settings;
  const { waterLevelA, waterLevelB, refillValveOpen, transferPumpActive, errorState } = simState;

  return (
    <div id="tank-visualizer" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
      <div className="absolute top-4 right-4 flex gap-2">
        {errorState !== "none" ? (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/30 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" />
            {errorState === "refill_timeout" ? "Timeout dopouštění" : errorState === "dry_run_pump" ? "Blokace čerpadla" : "Chyba senzoru"}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <ShieldCheck className="w-3.5 h-3.5" />
            Systém v pořádku
          </span>
        )}
      </div>

      <h3 className="text-lg font-medium text-slate-100 mb-6 flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
        Interaktivní simulace nádrží
      </h3>

      {/* Main Flex Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center py-4">
        
        {/* Tank A (Primary) */}
        <div id="tank-a-container" className="md:col-span-5 flex flex-col items-center">
          <div className="flex justify-between w-full mb-1 px-2">
            <span className="text-xs font-mono text-slate-400 font-semibold text-center w-full">
              NÁDRŽ A (Primární, výška {tankA.totalHeightCm} cm)
            </span>
          </div>

          <div className="relative w-48 h-64 bg-slate-800/40 rounded-b-2xl border-x-4 border-b-4 border-slate-600 shadow-inner flex flex-col justify-end overflow-hidden group">
            
            {/* Sensor Beam Visualizer (Ultrasonic) */}
            {tankA.sensorType === "ultrasonic" && (
              <div className="absolute top-0 left-0 right-0 h-4 flex justify-center z-10">
                <div className="w-8 h-3 bg-indigo-500 rounded-b-md border-x border-b border-indigo-400"></div>
                {/* Laser sensor wave */}
                <div className="absolute top-3 w-1 bg-indigo-500/40 animate-pulse" style={{ height: `${220 - (waterLevelA * 2.22)}px` }}></div>
              </div>
            )}

            {/* Float switches levels pointers */}
            {tankA.sensorType === "floats" && (
              <div className="absolute inset-y-0 right-2 flex flex-col justify-between py-6 text-[9px] font-mono text-slate-500 select-none">
                <span className={waterLevelA >= 90 ? "text-emerald-400 font-bold" : ""}>● Float MAX (100%)</span>
                <span className={waterLevelA >= 50 ? "text-indigo-400 font-bold" : ""}>● Float MED (50%)</span>
                <span className={waterLevelA >= 20 ? "text-amber-400 font-bold" : ""}>● Float LOW (20%)</span>
              </div>
            )}

            {/* Interactive Threshold Lines */}
            <div 
              className="absolute left-0 right-0 border-t border-rose-500/60 z-10 flex justify-between px-2 text-[9px] text-rose-400 font-mono transition-all duration-300"
              style={{ bottom: `${tankA.minLevelPercent}%` }}
            >
              <span>MIN {tankA.minLevelPercent}%</span>
              <span>Spustit dopust</span>
            </div>
            <div 
              className="absolute left-0 right-0 border-t border-emerald-500/60 z-10 flex justify-between px-2 text-[9px] text-emerald-400 font-mono transition-all duration-300"
              style={{ bottom: `${tankA.maxLevelPercent}%` }}
            >
              <span>MAX {tankA.maxLevelPercent}%</span>
              <span>Stop dopust</span>
            </div>

            {/* Water Water Vector Mesh */}
            <motion.div 
              id="water-mesh-a"
              className="w-full bg-gradient-to-t from-cyan-600 to-cyan-400/90 relative rounded-b-xl"
              animate={{ height: `${waterLevelA}%` }}
              transition={{ type: "tween", ease: "easeInOut", duration: 0.3 }}
            >
              {/* Waves Animation effect top */}
              <div className="absolute -top-2 left-0 right-0 h-2 bg-cyan-300/40 rounded-full blur-[1px] animate-pulse"></div>
              
              {/* Internal Bubble effect */}
              {refillValveOpen && (
                <div className="absolute inset-0 bg-cyan-300/10 pointer-events-none flex justify-center">
                  <div className="w-full h-full relative overflow-hidden">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <span 
                        key={i} 
                        className="absolute bottom-0 w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce"
                        style={{
                          left: `${20 * i}%`,
                          animationDelay: `${i * 0.4}s`,
                          animationDuration: "1.2s"
                        }}
                      ></span>
                    ))}
                  </div>
                </div>
              )}

              {/* Text indicator inside water */}
              <div className="absolute inset-0 flex items-center justify-center font-bold text-lg text-white drop-shadow-md">
                {waterLevelA}%
              </div>
            </motion.div>
          </div>

          {/* Interactive slider under the tank to manipulate values */}
          <div className="w-full mt-4 bg-slate-800/50 p-3 rounded-lg border border-slate-800">
            <label className="text-xs text-slate-400 flex justify-between mb-1 font-mono">
              <span>Simulovat hladinu A</span>
              <span className="text-cyan-400 font-semibold">{waterLevelA}%</span>
            </label>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={waterLevelA}
              onChange={(e) => onSetLevelA(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
          </div>
        </div>

        {/* Center Connectors/Pipes, refilling sources, transfer pump */}
        <div className="md:col-span-2 flex flex-col items-center justify-center min-h-[160px] gap-6">
          
          {/* Electroventil Refill Source */}
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
              Dopouštění z řádu
            </span>
            <div className="flex items-center gap-2 mt-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border font-mono text-xs font-bold transition-all ${refillValveOpen ? "bg-emerald-500/20 text-emerald-400 border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]" : "bg-slate-800 text-slate-500 border-slate-700"}`}>
                V1
              </div>
              <span className="text-xs font-medium text-slate-300">
                {refillValveOpen ? "Ventil OTEVŘEN" : "Ventil ZAVŘEN"}
              </span>
            </div>
            
            {/* Down Flow animation */}
            <div className="h-10 w-2 bg-slate-850 relative mt-1 rounded-sm overflow-hidden">
              {refillValveOpen && (
                <motion.div 
                  className="bg-cyan-400 w-full h-full"
                  animate={{ y: ["-100%", "100%"] }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                />
              )}
            </div>
            {refillValveOpen && <ArrowBigDown className="w-5 h-5 text-cyan-400 animate-bounce -mt-1" />}
          </div>

          {/* Transfer pump section between A and B */}
          {enableBTransfer && (
            <div className="flex flex-col items-center w-full">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                Přečerpávání A → B
              </span>
              <div className="flex items-center gap-2 mt-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border font-mono text-[10px] font-bold transition-all ${transferPumpActive ? "bg-indigo-500/20 text-indigo-400 border-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.3)]" : "bg-slate-800 text-slate-500 border-slate-700"}`}>
                  P1
                </div>
                <span className="text-xs font-medium text-slate-300">
                  {transferPumpActive ? "Čerpadlo BĚŽÍ" : "Čerpadlo STOJÍ"}
                </span>
              </div>

              {/* Arrow and water particles pipe */}
              <div className="flex items-center gap-1 mt-2 w-full justify-center">
                <div className="h-2 w-12 bg-slate-800 rounded relative overflow-hidden">
                  {transferPumpActive && (
                    <motion.div 
                      className="bg-indigo-400 w-full h-full"
                      animate={{ x: ["-100%", "100%"] }}
                      transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                    />
                  )}
                </div>
                <ArrowRight className={`w-4 h-4 ${transferPumpActive ? "text-indigo-400 animate-pulse" : "text-slate-600"}`} />
              </div>
            </div>
          )}
        </div>

        {/* Tank B (Secondary / Larger Storage Tank) */}
        <div id="tank-b-container" className="md:col-span-5 flex flex-col items-center">
          {enableBTransfer ? (
            <>
              <div className="flex justify-between w-full mb-1 px-2">
                <span className="text-xs font-mono text-slate-400 font-semibold text-center w-full">
                  NÁDRŽ B (Velkoobjemová úložiště)
                </span>
              </div>

              <div className="relative w-56 h-64 bg-slate-800/40 rounded-b-2xl border-x-4 border-b-4 border-slate-600 shadow-inner flex flex-col justify-end overflow-hidden">
                
                {/* Sensor Beam Visualizer (Ultrasonic or floats) */}
                {tankB.sensorType === "ultrasonic" ? (
                  <div className="absolute top-0 left-0 right-0 h-4 flex justify-center z-10">
                    <div className="w-8 h-3 bg-indigo-500 rounded-b-md border-x border-b border-indigo-400"></div>
                    <div className="absolute top-3 w-1 bg-indigo-500/40 animate-pulse" style={{ height: `${220 - (waterLevelB * 2.22)}px` }}></div>
                  </div>
                ) : (
                  <div className="absolute inset-y-0 right-2 flex flex-col justify-between py-6 text-[9px] font-mono text-slate-500 select-none">
                    <span className={waterLevelB >= 90 ? "text-emerald-400 font-bold" : ""}>● Float MAX (90%)</span>
                    <span className={waterLevelB <= 30 ? "text-amber-400 font-bold" : ""}>● Float MIN (30%)</span>
                  </div>
                )}

                {/* Threshold Lines */}
                <div 
                  className="absolute left-0 right-0 border-t border-rose-500/60 z-10 flex justify-between px-2 text-[9px] text-rose-400 font-mono transition-all duration-300"
                  style={{ bottom: `${tankB.minLevelPercent}%` }}
                >
                  <span>CÍL MIN {tankB.minLevelPercent}%</span>
                  <span>Spustit čerp.</span>
                </div>
                <div 
                  className="absolute left-0 right-0 border-t border-emerald-500/60 z-10 flex justify-between px-2 text-[9px] text-emerald-400 font-mono transition-all duration-300"
                  style={{ bottom: `${tankB.maxLevelPercent}%` }}
                >
                  <span>CÍL MAX {tankB.maxLevelPercent}%</span>
                  <span>Stop čerp.</span>
                </div>

                {/* Dry safety threshold visual clue */}
                <div className="absolute left-0 right-0 border-t border-blue-400/30 bottom-[30%] z-10 p-0.5">
                  <span className="bg-slate-900/80 px-1 py-0.2 rounded text-[8px] text-blue-300 font-mono tracking-wider">
                    ODSTÁVKA PŘECERPÁVÁNÍ PRI SLABÉM VSTUPU (&lt;30%)
                  </span>
                </div>

                {/* Water level B indicator */}
                <motion.div 
                  id="water-mesh-b"
                  className="w-full bg-gradient-to-t from-blue-700 to-indigo-500/90 relative rounded-b-xl"
                  animate={{ height: `${waterLevelB}%` }}
                  transition={{ type: "tween", ease: "easeInOut", duration: 0.3 }}
                >
                  <div className="absolute -top-2 left-0 right-0 h-2 bg-blue-300/40 rounded-full blur-[1px] animate-pulse"></div>
                  
                  {/* Pumping bubbles */}
                  {transferPumpActive && (
                    <div className="absolute inset-0 bg-blue-400/10 pointer-events-none flex justify-center">
                      <div className="w-full h-full relative overflow-hidden">
                        {[1, 2, 3, 4].map((i) => (
                          <span 
                            key={i} 
                            className="absolute bottom-0 w-1.5 h-1.5 bg-cyan-200/40 rounded-full animate-bounce"
                            style={{
                              left: `${25 * i - 12}%`,
                              animationDelay: `${i * 0.3}s`,
                              animationDuration: "1s"
                            }}
                          ></span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="absolute inset-0 flex items-center justify-center font-bold text-lg text-white drop-shadow-md">
                    {waterLevelB}%
                  </div>
                </motion.div>
              </div>

              {/* Slider for Tank B */}
              <div className="w-full mt-4 bg-slate-800/50 p-3 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 flex justify-between mb-1 font-mono">
                  <span>Simulovat hladinu B</span>
                  <span className="text-indigo-400 font-semibold">{waterLevelB}%</span>
                </label>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={waterLevelB}
                  onChange={(e) => onSetLevelB(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                />
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-2xl p-8 bg-slate-900/40 text-center min-h-[320px]">
              <span className="text-slate-600 font-mono text-sm uppercase tracking-wider mb-2">
                Druhá nádrž vypnuta
              </span>
              <p className="text-slate-500 text-xs max-w-[280px]">
                V nastavení na levé straně můžete zapnout možnost přečerpávání do druhé, větší nádrže.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
