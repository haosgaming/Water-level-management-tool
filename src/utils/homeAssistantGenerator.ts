import { SystemSettings } from "../types";

export function generateESPHomeYaml(settings: SystemSettings): string {
  const { tankA, tankB, pins, enableBTransfer, safetyDryRun } = settings;

  let yaml = `# ESPHome konfigurace pro integraci do Home Assistenta
# Tento soubor nahrajte do svého ESP32 nebo ESP8266 zařízení přes rozhraní ESPHome.
# Zařízení se poté automaticky objeví v Home Assistentu jako nová integrace.

esphome:
  name: aqualogic-controller
  comment: "AquaLogic inteligentní správce vody v nádržích"

esp32:
  board: esp32dev

# Připojení k Vaší WiFi síti
wifi:
  ssid: "Vase_WiFi_Nazev"
  password: "Vase_WiFi_Heslo"

  # Zapnutí záložního Access Pointu v případě výpadku wifi
  ap:
    ssid: "AquaLogic-Fallback-AP"

# Webový server pro lokální diagnostiku v prohlížeči
web_server:
  port: 80

# Povolení nativního API rozhraní pro Home Assistant
api:
  encryption:
    key: "GenerovaneUnikatniHesloProHAAPIKey="

# Služba pro OTA (bezdrátové) aktualizace firmwaru
ota:
  - platform: esphome

# I2C sběrnice pro LCD / OLED displej
i2c:
  sda: GPIO21
  scl: GPIO22
  scan: true

`;

  // 1. Display Configuration for ESPHome
  if (settings.displayType === "lcd1602") {
    yaml += `# Konfigurace LCD 1602 Displeje přes I2C
display:
  - platform: lcd_pcf8574
    dimensions: 16x2
    address: 0x27
    id: muj_displej
    lambda: |-
      it.printf(0, 0, "A: %.1f%%  Vent: %s", id(hladina_nadrze_a).state, id(ventil_dopousteni).state ? "ZAP" : "VYP");
      ${enableBTransfer ? `it.printf(0, 1, "B: %.1f%%  Cerp: %s", id(hladina_nadrze_b).state, id(cerpadlo_p1).state ? "ZAP" : "VYP");` : `it.printf(0, 1, "AquaLogic OK");`}
\n`;
  } else if (settings.displayType === "oled1306") {
    yaml += `# Konfigurace OLED SSD1306 Displeje přes I2C
font:
  - file: "gfonts://Roboto"
    id: roboto_font
    size: 11

display:
  - platform: ssd1306_i2c
    model: "SSD1306 128x64"
    address: 0x3C
    id: oled_displej
    lambda: |-
      it.printf(0, 0, id(roboto_font), "AQUALOGIC SYSTEM");
      it.printf(0, 16, id(roboto_font), "Hladina A: %.0f%%", id(hladina_nadrze_a).state);
      ${enableBTransfer ? `it.printf(0, 32, id(roboto_font), "Hladina B: %.0f%%", id(hladina_nadrze_b).state);` : ""}
      it.printf(0, 48, id(roboto_font), "V1: %s  |  P1: %s", 
        id(ventil_dopousteni).state ? "ON" : "OFF",
        ${enableBTransfer ? `id(cerpadlo_p1).state ? "ON" : "OFF"` : `"Mimo linku"`});
\n`;
  }

  // 2. Sensors configuration (Senzory)
  yaml += `# --- SENZORY ---
sensor:
`;

  if (tankA.sensorType === "ultrasonic") {
    yaml += `  - platform: ultrasonic
    trigger_pin: GPIO${pins.tankATrigger}
    echo_pin: GPIO${pins.tankAEcho}
    name: "Hladina Nádrže A (Vzdálenost)"
    id: vzdalenost_nadrze_a
    update_interval: 2s
    accuracy_decimals: 1

  # Virtuální senzor pro výpočet procent hladiny Nádrže A
  - platform: template
    name: "Nádrž A - Hladina v %"
    id: hladina_nadrze_a
    unit_of_measurement: "%"
    icon: "mdi:water-percent"
    accuracy_decimals: 0
    lambda: |-
      // Přepočet vzdálenosti z výšky ${tankA.totalHeightCm} cm na procenta %
      float dist_cm = id(vzdalenost_nadrze_a).state * 100.0;
      if (isnan(dist_cm) || dist_cm <= 0) return 0.0;
      float pct = ((${tankA.totalHeightCm}.0 - dist_cm) / ${tankA.totalHeightCm}.0) * 100.0;
      if (pct < 0) pct = 0;
      if (pct > 100) pct = 100;
      return pct;
`;
  } else {
    yaml += `  # Nádrž A používá plovákové nebo tlakové senzory
  - platform: analog_reader
    pin: GPIO36 # Použit analogový kanál (vhodné pro tlakové sondy)
    name: "Tlakový Senzor Nádrž A"
    id: tlak_nadrz_a
    update_interval: 2s
`;
  }

  if (enableBTransfer) {
    if (tankB.sensorType === "ultrasonic") {
      yaml += `
  - platform: ultrasonic
    trigger_pin: GPIO${pins.tankBTrigger}
    echo_pin: GPIO${pins.tankBEcho}
    name: "Hladina Nádrže B (Vzdálenost)"
    id: vzdalenost_nadrze_b
    update_interval: 2s
    accuracy_decimals: 1

  - platform: template
    name: "Nádrž B - Hladina v %"
    id: hladina_nadrze_b
    unit_of_measurement: "%"
    icon: "mdi:water-percent"
    accuracy_decimals: 0
    lambda: |-
      float dist_cm = id(vzdalenost_nadrze_b).state * 100.0;
      if (isnan(dist_cm) || dist_cm <= 0) return 0.0;
      float pct = ((${tankB.totalHeightCm}.0 - dist_cm) / ${tankB.totalHeightCm}.0) * 100.0;
      if (pct < 0) pct = 0;
      if (pct > 100) pct = 100;
      return pct;
`;
    }
  }

  // 3. Output Switches config
  yaml += `
# --- VÝSTUPNÍ AKČNÍ ČLENY (RELÉ) ---
switch:
  - platform: gpio
    pin: GPIO${pins.refillValve}
    name: "Refill Elektroventil (V1)"
    id: ventil_dopousteni
    icon: "mdi:water-pump"
`;

  if (enableBTransfer) {
    yaml += `
  - platform: gpio
    pin: GPIO${pins.transferPump}
    name: "Přečerpávací Čerpadlo (P1)"
    id: cerpadlo_p1
    icon: "mdi:pump"
`;
  }

  // 4. Automation Logic implemented inside ESPHome Core for direct safety & offline durability!
  yaml += `
# --- CHYTRÉ AUTOMATIZACE BĚŽÍCÍ LOKÁLNĚ NA ZAŘÍZENÍ ---
# Tyto automatizace fungují i při výpadku WiFi nebo Home Assistenta!
interval:
  - interval: 1s
    then:
      - lambda: |-
          // Logika dopouštění nádrže A
          if (id(hladina_nadrze_a).state < ${tankA.minLevelPercent}) {
            if (!id(ventil_dopousteni).state) {
              id(ventil_dopousteni).turn_on();
              ESP_LOGD("main", "Spusteno automaticke dopousteni nadrze A due to low capacity.");
            }
          }
          if (id(hladina_nadrze_a).state >= ${tankA.maxLevelPercent}) {
            if (id(ventil_dopousteni).state) {
              id(ventil_dopousteni).turn_off();
              ESP_LOGD("main", "Zastaveno dopousteni nadrze A.");
            }
          }

          ${enableBTransfer ? `
          // Logika přečerpávání do Nádrže B s ochranou suchého chodu
          if (id(hladina_nadrze_b).state < ${tankB.minLevelPercent}) {
            // Ochrana chodu na sucho:
            ${safetyDryRun ? `if (id(hladina_nadrze_a).state >= 30.0) {` : ""}
              if (!id(cerpadlo_p1).state) {
                id(cerpadlo_p1).turn_on();
                ESP_LOGD("main", "Spusteno cerpani do Nadrze B.");
              }
            ${safetyDryRun ? `} else {
              if (id(cerpadlo_p1).state) {
                id(cerpadlo_p1).turn_off();
              }
              ESP_LOGW("main", "Blokace cerpani! Nedostatek vody v zdrojove nadrzi A.");
            }` : ""}
          }

          if (id(hladina_nadrze_b).state >= ${tankB.maxLevelPercent}) {
            if (id(cerpadlo_p1).state) {
              id(cerpadlo_p1).turn_off();
              ESP_LOGD("main", "Konec cerpani - Nadrz B naplnena.");
            }
          }

          // Pokud hladina A klesne pod kritickou hranici v prubehu chodu cerpadla
          if (id(hladina_nadrze_a).state < 25.0) {
            if (id(cerpadlo_p1).state) {
              id(cerpadlo_p1).turn_off();
              ESP_LOGE("main", "Nouzove zastaveni cerpadla! Hrozba behu na sucho.");
            }
          }
          ` : ""}
`;

  return yaml;
}

export function generateHomeAssistantYaml(settings: SystemSettings): string {
  const { tankA, tankB, pins, enableBTransfer } = settings;

  return `# Home Assistant ruční konfigurace (pokud nepoužíváte ESPHome a posíláte data z Arduina přes MQTT)
# Vložte do Vašeho souboru /config/configuration.yaml v Home Assistentu

# 1. Definice MQTT Senzorů (Příjem dat z Arduina)
mqtt:
  sensor:
    - name: "AquaLogic Nádrž A - Hladina"
      state_topic: "aqualogic/nadrz_a/hladina"
      unit_of_measurement: "%"
      value_template: "{{ value | float }}"
      icon: "mdi:water-percent"

    - name: "AquaLogic Nádrž A - Vzdálenost"
      state_topic: "aqualogic/nadrz_a/cm"
      unit_of_measurement: "cm"
      value_template: "{{ value | float }}"
      icon: "mdi:ruler"

    ${enableBTransfer ? `
    - name: "AquaLogic Nádrž B - Hladina"
      state_topic: "aqualogic/nadrz_b/hladina"
      unit_of_measurement: "%"
      value_template: "{{ value | float }}"
      icon: "mdi:water-percent"
    ` : ""}

  # 2. Spínače relé ovládané přes MQTT z Home Assistenta
  switch:
    - name: "AquaLogic Solenoid Ventil V1"
      state_topic: "aqualogic/ventil/stav"
      command_topic: "aqualogic/ventil/cmd"
      payload_on: "ON"
      payload_off: "OFF"
      state_on: "ON"
      state_off: "OFF"
      icon: "mdi:water-pump"

    ${enableBTransfer ? `
    - name: "AquaLogic Čerpadlo P1"
      state_topic: "aqualogic/cerpadlo/stav"
      command_topic: "aqualogic/cerpadlo/cmd"
      payload_on: "ON"
      payload_off: "OFF"
      state_on: "ON"
      state_off: "OFF"
      icon: "mdi:pump"
    ` : ""}

# 3. Pomocná automatizace přímo v Home Assistentu (alternativa k lokální logice)
# Vkládá se do /config/automations.yaml
# (Z bezpečnostních důvodů však doporučujeme nechat logiku běžet lokálně na desce)
`;
}
