/*
  ESP32 Full Sensor Test Sketch
  Components: RFID RC522, TDS sensor, DS18B20 waterproof temp, push button,
              buzzer, HC-SR04 ultrasonic
  Purpose: Verify each component works independently via Serial Monitor
           before combining into full application logic.

  Required Libraries (install via Library Manager):
    - MFRC522 by GithubCommunity
    - OneWire by Paul Stoffregen
    - DallasTemperature by Miles Burton

  Pin Map:
    RFID RC522   : SDA=5, SCK=18, MOSI=23, MISO=19, RST=22
    TDS sensor   : GPIO34 (ADC1, analog)
    DS18B20      : GPIO4 (+4.7k pull-up to 3.3V)
    Push button  : GPIO27 (INPUT_PULLUP, active LOW)
    Buzzer       : GPIO25 (active buzzer, digital)
    Ultrasonic   : TRIG=26, ECHO=33 (via voltage divider 1k/2k)
*/

#include <SPI.h>
#include <MFRC522.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ---------- Pin Definitions ----------
#define RFID_SS_PIN     5
#define RFID_RST_PIN    15

#define TDS_PIN         34

#define ONE_WIRE_BUS    4

#define BUTTON_PIN      27

#define BUZZER_PIN      14

#define TRIG_PIN        26
#define ECHO_PIN        33

// ---------- Network / Server ----------
const char* WIFI_SSID    = "Xperia";
const char* WIFI_PASS    = "1234565432";
const char* SERVER_HOST  = "https://farmcareservices.com/api/iot";
const char* DEVICE_ID    = "esp32_collar_1";

// ---------- Objects ----------
MFRC522 rfid(RFID_SS_PIN, RFID_RST_PIN);
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature tempSensor(&oneWire);

// ---------- Cow linked via last RFID scan ----------
int currentCowId = -1;
String currentCowName = "";

// ---------- Timing (non-blocking) ----------
unsigned long lastTDSRead = 0;
unsigned long lastTempRead = 0;
unsigned long lastUltrasonicRead = 0;
unsigned long lastButtonCheck = 0;

const unsigned long TDS_INTERVAL = 1000;
const unsigned long TEMP_INTERVAL = 2000;
const unsigned long ULTRASONIC_INTERVAL = 500;
const unsigned long BUTTON_DEBOUNCE = 50;

unsigned long lastServerPost = 0;
const unsigned long SERVER_POST_INTERVAL = 10000;

// Latest sensor values, updated by the periodic readers, sent on the next POST
float latestTempC = DEVICE_DISCONNECTED_C;
float latestTdsPpm = 0.0;
float latestDistanceCm = -1.0;

bool lastButtonState = HIGH;
bool buttonState = HIGH;
unsigned long lastDebounceTime = 0;

// ---------- Buzzer non-blocking beep ----------
bool buzzerActive = false;
unsigned long buzzerStartTime = 0;
unsigned long buzzerDuration = 0;

void beep(unsigned long duration) {
  digitalWrite(BUZZER_PIN, HIGH);
  buzzerActive = true;
  buzzerStartTime = millis();
  buzzerDuration = duration;
}

void handleBuzzer() {
  if (buzzerActive && (millis() - buzzerStartTime >= buzzerDuration)) {
    digitalWrite(BUZZER_PIN, LOW);
    buzzerActive = false;
  }
}

// ---------- Setup ----------
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== ESP32 Full Sensor Test ===");

  // RFID
  SPI.begin();
  rfid.PCD_Init();
  Serial.println("RFID RC522 initialized.");

  // DS18B20
  tempSensor.begin();
  Serial.print("DS18B20 devices found: ");
  Serial.println(tempSensor.getDeviceCount());

  // Button
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  // Buzzer
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // Ultrasonic
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  // WiFi
  connectWiFi();

  Serial.println("Setup complete. Starting tests...\n");
  beep(150); // startup beep
}

// ---------- TDS Read ----------
void readTDS() {
  int raw = analogRead(TDS_PIN);
  float voltage = raw * (3.3 / 4095.0);
  // Simple uncompensated estimate; refine with temp compensation later
  float tdsValue = (133.42 * voltage * voltage * voltage
                     - 255.86 * voltage * voltage
                     + 857.39 * voltage) * 0.5;
  latestTdsPpm = tdsValue;

  Serial.print("[TDS] Raw: ");
  Serial.print(raw);
  Serial.print("  Voltage: ");
  Serial.print(voltage, 3);
  Serial.print("V  Estimated TDS: ");
  Serial.print(tdsValue, 1);
  Serial.println(" ppm");
}

// ---------- DS18B20 Read ----------
void readTemperature() {
  tempSensor.requestTemperatures();
  float tempC = tempSensor.getTempCByIndex(0);
  latestTempC = tempC;

  Serial.print("[TEMP] ");
  if (tempC == DEVICE_DISCONNECTED_C) {
    Serial.println("Sensor disconnected or not detected!");
  } else {
    Serial.print(tempC, 2);
    Serial.println(" C");
  }
}

// ---------- Ultrasonic Read ----------
void readUltrasonic() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms timeout (~5m range)
  float distanceCm = duration * 0.0343 / 2.0;
  latestDistanceCm = (duration == 0) ? -1.0 : distanceCm;

  Serial.print("[ULTRASONIC] Duration: ");
  Serial.print(duration);
  Serial.print(" us  Distance: ");
  if (duration == 0) {
    Serial.println("No echo (out of range or wiring issue)");
  } else {
    Serial.print(distanceCm, 1);
    Serial.println(" cm");
  }
}

// ---------- WiFi ----------
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[WIFI] Connecting");
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 20) {
    delay(300);
    Serial.print(".");
    tries++;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WIFI] Connected, IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[WIFI] Failed to connect, will retry later.");
  }
}

// ---------- Send RFID scan, resolve cow_id ----------
void sendRfidScan(const String& uidStr) {
  if (WiFi.status() != WL_CONNECTED) return;

  StaticJsonDocument<256> doc;
  doc["device_id"] = DEVICE_ID;
  doc["rfid_tag"]  = uidStr;
  String payload;
  serializeJson(doc, payload);

  HTTPClient http;
  http.setTimeout(5000);
  http.begin(String(SERVER_HOST) + "/rfid-scan");
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(payload);

  if (code == 200) {
    String resp = http.getString();
    StaticJsonDocument<384> respDoc;
    if (deserializeJson(respDoc, resp) == DeserializationError::Ok) {
      if (respDoc["found"] == true) {
        currentCowId = respDoc["cow_id"] | -1;
        currentCowName = respDoc["cow_name"] | "";
        Serial.print("[RFID] Linked to cow: ");
        Serial.print(currentCowName);
        Serial.print(" (cow_id=");
        Serial.print(currentCowId);
        Serial.println(")");
      } else {
        currentCowId = -1;
        currentCowName = "";
        Serial.println("[RFID] Tag not registered to any cow.");
      }
    }
  } else {
    Serial.print("[HTTP] RFID scan POST failed, code: ");
    Serial.println(code);
  }
  http.end();
}

// ---------- Send collar sensor data (temp, TDS, ultrasonic) ----------
void sendCollarData() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    return;
  }

  StaticJsonDocument<384> doc;
  doc["device_id"] = DEVICE_ID;
  if (currentCowId >= 0) doc["cow_id"] = currentCowId;
  if (latestTempC != DEVICE_DISCONNECTED_C) doc["temperature"] = latestTempC;
  doc["tds_ppm"] = latestTdsPpm;
  if (latestDistanceCm >= 0) doc["distance_cm"] = latestDistanceCm;

  String payload;
  serializeJson(doc, payload);

  HTTPClient http;
  http.setTimeout(5000);
  http.begin(String(SERVER_HOST) + "/wearable-collar");
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(payload);

  Serial.print("[HTTP] Collar POST code: ");
  Serial.println(code);
  http.end();
}

// ---------- Button Check (debounced) ----------
void checkButton() {
  bool reading = digitalRead(BUTTON_PIN);

  if (reading != lastButtonState) {
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > BUTTON_DEBOUNCE) {
    if (reading != buttonState) {
      buttonState = reading;
      if (buttonState == LOW) {
        Serial.println("[BUTTON] Pressed!");
        beep(100);
      } else {
        Serial.println("[BUTTON] Released.");
      }
    }
  }

  lastButtonState = reading;
}

// ---------- RFID Check ----------
void checkRFID() {
  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;

  Serial.print("[RFID] Card UID: ");
  String uidStr = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) Serial.print("0");
    Serial.print(rfid.uid.uidByte[i], HEX);
    uidStr += String(rfid.uid.uidByte[i], HEX);
  }
  Serial.println();

  beep(200); // acknowledge scan

  sendRfidScan(uidStr);

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}

// ---------- Main Loop ----------
void loop() {
  unsigned long now = millis();

  if (now - lastTDSRead >= TDS_INTERVAL) {
    lastTDSRead = now;
    readTDS();
  }

  if (now - lastTempRead >= TEMP_INTERVAL) {
    lastTempRead = now;
    readTemperature();
  }

  if (now - lastUltrasonicRead >= ULTRASONIC_INTERVAL) {
    lastUltrasonicRead = now;
    readUltrasonic();
  }

  checkButton();
  checkRFID();
  handleBuzzer();

  if (now - lastServerPost >= SERVER_POST_INTERVAL) {
    lastServerPost = now;
    sendCollarData();
  }
}
