import { SystemSettings } from "../types";

export function generateBaselineArduinoCode(settings: SystemSettings, language: "cz" | "en" = "cz"): string {
  const { tankA, tankB, pins, displayType, safetyDryRun, safetyRefillTimeout, enableBTransfer } = settings;

  const isCz = language === "cz";

  const t = {
    header: isCz ? "AUTOMATICKÉ ŘÍZENÍ HLADINY VODNÍCH NÁDRŽÍ" : "AUTOMATIC WATER TANK LEVEL CONTROLLER",
    desc: isCz 
      ? "Tento kód automaticky udržuje hladinu v Nádrži A (dopouštění) a případně přečerpává vodu do Nádrže B podle potřeby s ochranou proti běhu na sucho."
      : "This code automatically registers and refills Tank A, and transfers water to Tank B based on water levels with dry-run protection.",
    averaging_desc: isCz 
      ? "Průměrování hodnot pro odfiltrování šumu a vlnění hladiny"
      : "Running average to filter out wave fluctuation and sensor noise.",
    measuring_pct: isCz ? "Přepočet vzdálenosti z ultrazvuku na procenta" : "Convert ultrasonic distance to percentage",
    trigger_valve: isCz ? "Dopouštění nádrže A (hystereze)" : "Refilling Tank A (hysteresis control)",
    trigger_pump: isCz ? "Přečerpávání do Nádrže B (potřeba a ochrana sucha)" : "Transfer in Tank B (demand with dry-run protection)"
  };

  // 1. Gather libraries
  let libraries = `// ${t.header}\n// ${t.desc}\n\n`;
  if (displayType === "lcd1602") {
    libraries += `#include <Wire.h>                 // I2C komunikace\n`;
    libraries += `#include <LiquidCrystal_I2C.h>   // Knihovna pro LCD 1602 I2C (např. od Frank de Brabander)\n`;
  } else if (displayType === "oled1306") {
    libraries += `#include <Wire.h>                 // I2C komunikace\n`;
    libraries += `#include <Adafruit_GFX.h>          // Základní grafická knihovna Adafruit\n`;
    libraries += `#include <Adafruit_SSD1306.h>     // Knihovna pro OLED SSD1306\n`;
  }

  // 2. Pins definitions
  let pinDefs = `\n// ================= CONFIGURACE PINŮ =================\n`;
  if (tankA.sensorType === "ultrasonic") {
    pinDefs += `const int PIN_TANK_A_TRIG = ${pins.tankATrigger}; // Trigger pin pro ultrazvuk Nádrž A\n`;
    pinDefs += `const int PIN_TANK_A_ECHO = ${pins.tankAEcho};    // Echo pin pro ultrazvuk Nádrž A\n`;
  } else if (tankA.sensorType === "floats") {
    pinDefs += `const int PIN_FLOAT_A_LOW  = ${pins.tankAFloatLow};  // Plovák: Nízká hladina (sucho)\n`;
    pinDefs += `const int PIN_FLOAT_A_MED  = ${pins.tankAFloatMed};  // Plovák: Střední hladina (dopustit)\n`;
    pinDefs += `const int PIN_FLOAT_A_HIGH = ${pins.tankAFloatHigh}; // Plovák: Vysoká hladina (plno)\n`;
  } else {
    pinDefs += `const int PIN_PRESSURE_A   = ${pins.tankAPressureAnalog}; // Analogový tlakový senzor\n`;
  }

  pinDefs += `const int PIN_REFILL_VALVE = ${pins.refillValve}; // Relé ventilu dopouštění (aktivní v LOW/HIGH podle zapojení)\n`;

  if (enableBTransfer) {
    if (tankB.sensorType === "ultrasonic") {
      pinDefs += `const int PIN_TANK_B_TRIG = ${pins.tankBTrigger}; // Trigger pin pro ultrazvuk Nádrž B\n`;
      pinDefs += `const int PIN_TANK_B_ECHO = ${pins.tankBEcho};    // Echo pin pro ultrazvuk Nádrž B\n`;
    } else {
      pinDefs += `const int PIN_FLOAT_B_LOW  = ${pins.tankBFloatLow};  // Plovák B: Nízká hladina (sepne čerpání)\n`;
      pinDefs += `const int PIN_FLOAT_B_HIGH = ${pins.tankBFloatHigh}; // Plovák B: Vysoká hladina (zastaví čerpání)\n`;
    }
    pinDefs += `const int PIN_TRANSFER_PUMP = ${pins.transferPump}; // Relé přečerpávacího čerpadla\n`;
  }

  // Pin for error LED / Buzzer
  pinDefs += `const int PIN_ERROR_LED     = 13; // Zabudovaná LED pro alarm\n`;

  // Constants
  let constants = `\n// ================= PARAMETRY SYSTÉMU =================\n`;
  constants += `const int TANK_A_HEIGHT_CM = ${tankA.totalHeightCm}; // Celková měřená výška nádrže A\n`;
  constants += `const int TANK_A_MIN_PCT   = ${tankA.minLevelPercent};  // Zapnout dopouštění při (%)\n`;
  constants += `const int TANK_A_MAX_PCT   = ${tankA.maxLevelPercent};  // Vypnout dopouštění při (%)\n`;

  if (enableBTransfer) {
    constants += `const int TANK_B_MIN_PCT   = ${tankB.minLevelPercent};  // Spustit přečerpávání pod (%)\n`;
    constants += `const int TANK_B_MAX_PCT   = ${tankB.maxLevelPercent};  // Zastavit přečerpávání při (%)\n`;
  }
  
  if (safetyRefillTimeout > 0) {
    constants += `const unsigned long VALVE_TIMEOUT_MS = ${safetyRefillTimeout} * 1000UL; // Max. čas bezpečného dopouštění\n`;
  }

  // Global instances
  let globalInstances = `\n// ================= GLOBÁLNÍ INSTANCE & PROMĚNNÉ =================\n`;
  if (displayType === "lcd1602") {
    globalInstances += `LiquidCrystal_I2C lcd(0x27, 16, 2); // Nastavení I2C adresy (často 0x27 nebo 0x3F) a LCD displeje\n`;
  } else if (displayType === "oled1306") {
    globalInstances += `#define SCREEN_WIDTH 128\n`;
    globalInstances += `#define SCREEN_HEIGHT 64\n`;
    globalInstances += `#define OLED_RESET    -1\n`;
    globalInstances += `Adafruit_SSD1306 oled(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);\n`;
  }

  globalInstances += `
int levelPercentA = 0; // Aktuální hladina v Nádrži A v %
int levelPercentB = 0; // Aktuální hladina v Nádrži B v %
bool valveState = false; // true = ventil otevřen (napouští)
bool pumpState = false;  // true = čerpadlo běží
bool systemAlarm = false; // true = zablokováno kvůli alarmu (timeout)
unsigned long valveStartTime = 0; // Čas zahájení aktuálního napouštění pro hlídání timeoutu
unsigned long lastMeasureTime = 0; // Čas posledního kontrolního měření
const unsigned long MEASURE_INTERVAL_MS = 1000; // Měřit hladiny každou sekundu
`;

  // Setup Code
  let setupCode = `\nvoid setup() {\n`;
  setupCode += `  Serial.begin(9600); // Inicializace ladícího rozhraní\n`;
  
  if (displayType === "lcd1602") {
    setupCode += `  lcd.init();\n  lcd.backlight();\n  lcd.setCursor(0, 0);\n  lcd.print("Water Control");\n  lcd.setCursor(0, 1);\n  lcd.print("Inicializace...");\n  delay(1500);\n  lcd.clear();\n`;
  } else if (displayType === "oled1306") {
    setupCode += `  if(!oled.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {\n    Serial.println("OLED inicializace selhala!");\n  }\n  oled.clearDisplay();\n  oled.setTextSize(1);\n  oled.setTextColor(SSD1306_WHITE);\n  oled.setCursor(0,0);\n  oled.println("Water Control System");\n  oled.display();\n  delay(1500);\n`;
  }

  // Inputs & Outputs Setup
  setupCode += `\n  // Nastavení pinů senzorů a akčních členů\n`;
  if (tankA.sensorType === "ultrasonic") {
    setupCode += `  pinMode(PIN_TANK_A_TRIG, OUTPUT);\n  pinMode(PIN_TANK_A_ECHO, INPUT);\n`;
  } else if (tankA.sensorType === "floats") {
    setupCode += `  pinMode(PIN_FLOAT_A_LOW, INPUT_PULLUP);\n  pinMode(PIN_FLOAT_A_MED, INPUT_PULLUP);\n  pinMode(PIN_FLOAT_A_HIGH, INPUT_PULLUP);\n`;
  } else {
    setupCode += `  pinMode(PIN_PRESSURE_A, INPUT);\n`;
  }

  if (enableBTransfer) {
    if (tankB.sensorType === "ultrasonic") {
      setupCode += `  pinMode(PIN_TANK_B_TRIG, OUTPUT);\n  pinMode(PIN_TANK_B_ECHO, INPUT);\n`;
    } else {
      setupCode += `  pinMode(PIN_FLOAT_B_LOW, INPUT_PULLUP);\n  pinMode(PIN_FLOAT_B_HIGH, INPUT_PULLUP);\n`;
    }
    setupCode += `  pinMode(PIN_TRANSFER_PUMP, OUTPUT);\n  digitalWrite(PIN_TRANSFER_PUMP, LOW); // Zajistí vypnuté čerpadlo na startu\n`;
  }

  setupCode += `  pinMode(PIN_REFILL_VALVE, OUTPUT);\n  digitalWrite(PIN_REFILL_VALVE, LOW); // Ventil na startu zavřený\n`;
  setupCode += `  pinMode(PIN_ERROR_LED, OUTPUT);\n  digitalWrite(PIN_ERROR_LED, LOW);\n\n  Serial.println("System zinicializovan a spusten.");\n}\n`;

  // Measure Functions
  let measurementFunctions = `\n// ================= MĚŘENÍ HLADIN =================\n`;
  
  // Measure Tank A
  measurementFunctions += `int measureTankA() {\n`;
  if (tankA.sensorType === "ultrasonic") {
    measurementFunctions += `  // ${t.averaging_desc}\n  long celkovaVzdalenost = 0;\n  int platneMireni = 0;\n  \n  for (int i = 0; i < 5; i++) {\n    digitalWrite(PIN_TANK_A_TRIG, LOW);\n    delayMicroseconds(2);\n    digitalWrite(PIN_TANK_A_TRIG, HIGH);\n    delayMicroseconds(10);\n    digitalWrite(PIN_TANK_A_TRIG, LOW);\n    \n    long trvani = pulseIn(PIN_TANK_A_ECHO, HIGH, 30000UL); // Timeout 30ms\n    if (trvani > 0) {\n      long vzdalenost = trvani * 0.034 / 2;\n      if (vzdalenost <= TANK_A_HEIGHT_CM) {\n        celkovaVzdalenost += vzdalenost;\n        platneMireni++;\n      }\n    }\n    delay(20);\n  }\n  \n  if (platneMireni == 0) return -1; // Detekována chyba (senzor neodpovídá)\n  \n  int prumerVzdalenost = celkovaVzdalenost / platneMireni;\n  // ${t.measuring_pct}\n  int pct = map(prumerVzdalenost, TANK_A_HEIGHT_CM, 2, 0, 100); \n  return constrain(pct, 0, 100);\n`;
  } else if (tankA.sensorType === "floats") {
    measurementFunctions += `  // Čtení tří plovákových spínačů\n  bool low = digitalRead(PIN_FLOAT_A_LOW) == LOW;  // Plovák spadne dole (LOW značí přítomnost vody/aktivaci sepnutí, podle zapojení)\n  bool med = digitalRead(PIN_FLOAT_A_MED) == LOW;\n  bool high = digitalRead(PIN_FLOAT_A_HIGH) == LOW;\n  \n  if (high) return 100;\n  if (med) return 50;\n  if (low) return 20; // Pouze spodní čidlo pod vodou\n  return 5; // Sucho / Kritický nedostatek\n`;
  } else {
    measurementFunctions += `  // Čtení analogového senzoru (např. ponorný tlakový senzor)\n  int rawInput = analogRead(PIN_PRESSURE_A);\n  int pct = map(rawInput, 150, 850, 0, 100); // Upravte limity analogu (150 až 850) podle kalibrace Vašeho senzoru\n  return constrain(pct, 0, 100);\n`;
  }
  measurementFunctions += `}\n`;

  // Measure Tank B
  if (enableBTransfer) {
    measurementFunctions += `\nint measureTankB() {\n`;
    if (tankB.sensorType === "ultrasonic") {
      measurementFunctions += `  // Ultrazvuk pro sekundární nádrž B (předpokládáme stejnou logiku / výšku)\n  long trvani, vzdalenost;\n  digitalWrite(PIN_TANK_B_TRIG, LOW);\n  delayMicroseconds(2);\n  digitalWrite(PIN_TANK_B_TRIG, HIGH);\n  delayMicroseconds(10);\n  digitalWrite(PIN_TANK_B_TRIG, LOW);\n  \n  trvani = pulseIn(PIN_TANK_B_ECHO, HIGH, 30000UL);\n  if (trvani == 0) return 30; // Výchozí falešná střední hodnota při chybě\n  \n  vzdalenost = trvani * 0.034 / 2;\n  int pct = map(vzdalenost, 200, 10, 0, 100); // Nastaveno na výšku nádrže B (např. 200 cm)\n  return constrain(pct, 0, 100);\n`;
    } else {
      measurementFunctions += `  // Dva plováky pro nádrž B\n  bool low = digitalRead(PIN_FLOAT_B_LOW) == LOW;\n  bool high = digitalRead(PIN_FLOAT_B_HIGH) == LOW;\n  \n  if (high) return 100;\n  if (low) return 40; // Mezi spodním a svrchním plovákem\n  return 10; // Prázdno (pod spodním plovákem)\n`;
    }
    measurementFunctions += `}\n`;
  }

  // Loop Code
  let loopCode = `\nvoid loop() {\n`;
  loopCode += `  // Zabezpečení zablokovaného stavu vyžadujícího restart (v případě poplachu)\n  if (systemAlarm) {\n    digitalWrite(PIN_REFILL_VALVE, LOW); // Odstavit dopouštění\n`;
  if (enableBTransfer) {
    loopCode += `    digitalWrite(PIN_TRANSFER_PUMP, LOW);  // Odstavit přečerpávání\n`;
  }
  loopCode += `    digitalWrite(PIN_ERROR_LED, HIGH);\n    delay(500);\n    digitalWrite(PIN_ERROR_LED, LOW);\n    delay(500); // Pomalu blikat na indikaci poplachu\n    Serial.println("ALARM!!! System zablokovan kvuli preteceni casu napousteni. Pro reset restartujte Arduino!");\n    return;\n  }\n\n`;

  loopCode += `  unsigned long currentMillis = millis();\n  \n  // Periodické měření\n  if (currentMillis - lastMeasureTime >= MEASURE_INTERVAL_MS) {\n    lastMeasureTime = currentMillis;\n    \n    // 1. Změření hladin\n    levelPercentA = measureTankA();\n`;
  if (enableBTransfer) {
    loopCode += `    levelPercentB = measureTankB();\n`;
  }
  
  loopCode += `    \n    // 2. Řízení electroventilu pro dopouštění Nádrže A\n    if (levelPercentA >= 0) { // Pokud měření nehlásí chybu\n`;
  loopCode += `      if (levelPercentA <= TANK_A_MIN_PCT && !valveState) {\n`;
  loopCode += `        valveState = true;\n`;
  if (safetyRefillTimeout > 0) {
    loopCode += `        valveStartTime = currentMillis; // Zaznamenat čas spuštění dopouštění\n`;
  }
  loopCode += `        digitalWrite(PIN_REFILL_VALVE, HIGH); // Otevřít dopouštěcí ventil (nastavte LOW pokud je relé inverzní)\n`;
  loopCode += `        Serial.println("Hladina A nizka -> Spoustim dopousteni...");\n`;
  loopCode += `      } else if (levelPercentA >= TANK_A_MAX_PCT && valveState) {\n`;
  loopCode += `        valveState = false;\n`;
  loopCode += `        digitalWrite(PIN_REFILL_VALVE, LOW); // Zavřít dopouštěcí ventil\n`;
  loopCode += `        Serial.println("Hladina A dostatecna -> Zastavuji dopousteni.");\n`;
  loopCode += `      }\n    } else {\n      Serial.println("Chyba senzoru nadrze A! Ventil se preventivne zavira.");\n      digitalWrite(PIN_REFILL_VALVE, LOW);\n      valveState = false;\n    }\n`;

  // Check timeout safety
  if (safetyRefillTimeout > 0) {
    loopCode += `    \n    // Kontrola časového limitu dopouštění\n    if (valveState && (currentMillis - valveStartTime > VALVE_TIMEOUT_MS)) {\n      systemAlarm = true;\n      digitalWrite(PIN_REFILL_VALVE, LOW);\n      valveState = false;\n      Serial.println("KRITICKÁ CHYBA: Čas dopouštění překročil bezpečný limit! Možný únik nebo porucha senzoru!");\n    }\n`;
  }

  // Transfer Pump logic
  if (enableBTransfer) {
    loopCode += `    \n    // 3. Řízení čerpadla pro přečerpávání do Nádrže B\n`;
    loopCode += `    // Podmínky: Běží, když hladina B klesne pod minimum, a vypne, když stoupne na maximum.\n`;
    if (safetyDryRun) {
      loopCode += `    // OCHRANA: Přečerpávání sepne POUZE tehdy, pokud je v Nádrži A více než 30 % vody k zamezení chodu nasucho.\n`;
    }
    loopCode += `    if (levelPercentB <= TANK_B_MIN_PCT && !pumpState) {\n`;
    if (safetyDryRun) {
      loopCode += `      if (levelPercentA >= 30) {\n        pumpState = true;\n        digitalWrite(PIN_TRANSFER_PUMP, HIGH);\n        Serial.println("Hladina B nizka & A dostatecna -> Spoustim precerpavani.");\n      } else {\n        Serial.println("Hladina B nizka, ale precerpavani zablokovano - v Nadrzi A je malo vody! (Ochrana sucha)");\n      }\n`;
    } else {
      loopCode += `      pumpState = true;\n      digitalWrite(PIN_TRANSFER_PUMP, HIGH);\n      Serial.println("Hladina B nizka -> Spoustim precerpavani.");\n`;
    }
    loopCode += `    } else if (pumpState) {\n`;
    loopCode += `      // Vypnutí při dosažení maxima, nebo pokud v A klesne pod minimum (u suché ochrany)\n`;
    if (safetyDryRun) {
      loopCode += `      if (levelPercentB >= TANK_B_MAX_PCT || levelPercentA < 25) {\n        pumpState = false;\n        digitalWrite(PIN_TRANSFER_PUMP, LOW);\n        if (levelPercentA < 25) {\n          Serial.println("Zastavuji precerpavani - hrozi chod na sucho nadrze A!");\n        } else {\n          Serial.println("Nadrz B naplnena -> Zastavuji precerpavani.");\n        }\n      }\n`;
    } else {
      loopCode += `      if (levelPercentB >= TANK_B_MAX_PCT) {\n        pumpState = false;\n        digitalWrite(PIN_TRANSFER_PUMP, LOW);\n        Serial.println("Nadrz B naplnena -> Zastavuji precerpavani.");\n      }\n`;
    }
    loopCode += `    }\n`;
  }

  // Debug Print
  loopCode += `    \n    // 4. Výpis stavu na Serial Monitor\n`;
  loopCode += `    Serial.print("Nadrz A: ");\n    if (levelPercentA >= 0) {\n      Serial.print(levelPercentA);\n      Serial.print("%");\n    } else {\n      Serial.print("CHYBA");\n    }\n`;
  if (enableBTransfer) {
    loopCode += `    Serial.print(" | Nadrz B: ");\n    Serial.print(levelPercentB);\n    Serial.print("%");\n`;
  }
  loopCode += `    Serial.print(" | Ventil: ");\n    Serial.print(valveState ? "OTEVREN" : "ZAVREN");\n`;
  if (enableBTransfer) {
    loopCode += `    Serial.print(" | Cerpadlo: ");\n    Serial.print(pumpState ? "BEZI" : "STOGID");\n`;
  }
  loopCode += `    Serial.println();\n`;

  // Display Output
  if (displayType === "lcd1602") {
    loopCode += `    \n    // Aktualizace LCD displeje\n`;
    loopCode += `    lcd.setCursor(0, 0);\n`;
    loopCode += `    lcd.print("A:");\n`;
    loopCode += `    if(levelPercentA >= 0) { lcd.print(levelPercentA); lcd.print("% "); } else { lcd.print("ERR "); }\n`;
    loopCode += `    lcd.print("Ventil:");\n`;
    loopCode += `    lcd.print(valveState ? "Zap" : "Vyp");\n`;
    loopCode += `    lcd.setCursor(0, 1);\n`;
    if (enableBTransfer) {
      loopCode += `    lcd.print("B:");\n    lcd.print(levelPercentB);\n    lcd.print("%   Cerp:");\n    lcd.print(pumpState ? "On " : "Off");\n`;
    } else {
      loopCode += `    lcd.print("Dopousteni bezi");\n`;
    }
  } else if (displayType === "oled1306") {
    loopCode += `    \n    // Aktualizace OLED displeje\n`;
    loopCode += `    oled.clearDisplay();\n`;
    loopCode += `    oled.setCursor(0, 0);\n`;
    loopCode += `    oled.println("== HLADINA VODOMERU ==");\n`;
    loopCode += `    oled.print("Nadrz A: ");\n`;
    loopCode += `    if (levelPercentA >= 0) {\n      oled.print(levelPercentA);\n      oled.println("%");\n    } else {\n      oled.println("CHYBA!");\n    }\n`;
    if (enableBTransfer) {
      loopCode += `    oled.print("Nadrz B: ");\n    oled.print(levelPercentB);\n    oled.println("%");\n`;
    }
    loopCode += `    oled.print("Ventil dopoust:  ");\n    oled.println(valveState ? "[ZAP]" : "[VYP]");\n`;
    if (enableBTransfer) {
      loopCode += `    oled.print("Přečerpat pump:  ");\n      oled.println(pumpState ? "[BEZI]" : "[VYP]");\n`;
    }
    loopCode += `    oled.display();\n`;
  }

  loopCode += `  }\n}\n`;

  return libraries + pinDefs + constants + globalInstances + setupCode + measurementFunctions + loopCode;
}
