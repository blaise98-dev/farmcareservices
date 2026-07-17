/*
 * ============================================================
 *  NodeMCU ESP8266 — Multi-Sensor Serial Monitor Test
 * ============================================================
 *  Sensors:
 *    1. DS18B20  — Waterproof temperature sensor (OneWire)
 *    2. NEO-6M   — GPS module (with PPS)
 *    3. MAX30102 — Heart-rate & SpO2 (I2C)
 *    4. MPU6050  — Accelerometer / Gyroscope (I2C — RAW registers)
 *
 *  Wiring Summary (NodeMCU ESP8266):
 *  ┌─────────────┬────────────┬───────────────────────┐
 *  │   Sensor    │  Pin       │  NodeMCU GPIO         │
 *  ├─────────────┼────────────┼───────────────────────┤
 *  │ DS18B20     │ DATA       │ D7  (GPIO13)          │
 *  │             │ VCC        │ 3.3V                  │
 *  │             │ GND        │ GND                   │
 *  │             │ 4.7kΩ pull-up between DATA & VCC   │
 *  ├─────────────┼────────────┼───────────────────────┤
 *  │ NEO-6M GPS  │ TX         │ D6  (GPIO12) = RX     │
 *  │             │ RX         │ D5  (GPIO14) = TX     │
 *  │             │ PPS        │ D8  (GPIO15) optional  │
 *  │             │ VCC        │ 3.3V (or Vin if 5V)   │
 *  │             │ GND        │ GND                   │
 *  ├─────────────┼────────────┼───────────────────────┤
 *  │ MAX30102    │ SDA        │ D2  (GPIO4)           │
 *  │             │ SCL        │ D1  (GPIO5)           │
 *  │             │ VIN        │ 3.3V                  │
 *  │             │ GND        │ GND                   │
 *  ├─────────────┼────────────┼───────────────────────┤
 *  │ MPU6050     │ SDA        │ D2  (GPIO4) shared    │
 *  │             │ SCL        │ D1  (GPIO5) shared    │
 *  │             │ VCC        │ 3.3V                  │
 *  │             │ GND        │ GND                   │
 *  │             │ AD0        │ GND (addr 0x68)       │
 *  └─────────────┴────────────┴───────────────────────┘
 *
 *  NOTE: MAX30102 (0x57) and MPU6050 (0x68) share the I2C bus
 *        — no address conflict.
 *
 *  Libraries to install via Arduino Library Manager:
 *    - OneWire                (by Jim Studt)
 *    - DallasTemperature      (by Miles Burton)
 *    - TinyGPSPlus            (by Mikal Hart)
 *    - MAX30105               (by SparkFun)  ← works for MAX30102
 *    *** MPU6050 uses RAW I2C — NO library needed ***
 *
 *  Board: NodeMCU 1.0 (ESP-12E Module)
 *  Upload Speed: 115200
 * ============================================================
 */

#include <Wire.h>

// ── WiFi / HTTP ──
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

// ── DS18B20 ──
#include <OneWire.h>
#include <DallasTemperature.h>

// ── GPS ──
#include <SoftwareSerial.h>
#include <TinyGPSPlus.h>

// ── MAX30102 ──
#include "MAX30105.h"        // SparkFun library (works for MAX30102)
#include "heartRate.h"       // Heart-rate algorithm from SparkFun

// ── MPU6050 — RAW I2C (no library) ──
#define MPU6050_ADDR     0x68
#define REG_WHO_AM_I     0x75
#define REG_PWR_MGMT_1   0x6B
#define REG_SMPLRT_DIV   0x19
#define REG_CONFIG       0x1A
#define REG_ACCEL_CFG    0x1C
#define REG_GYRO_CFG     0x1B
#define REG_ACCEL_XOUT   0x3B  // 14 bytes: accel(6) + temp(2) + gyro(6)

// ═══════════════════════════════════════════
//  PIN DEFINITIONS
// ═══════════════════════════════════════════
#define DS18B20_PIN    D7     // GPIO13
#define GPS_RX_PIN     D6     // GPIO12 (GPS TX → NodeMCU RX)
#define GPS_TX_PIN     D5     // GPIO14 (NodeMCU TX → GPS RX)
#define GPS_PPS_PIN    D8     // GPIO15 (PPS — optional)
#define GPS_BAUD       9600

// ═══════════════════════════════════════════
//  NETWORK / SERVER
// ═══════════════════════════════════════════
const char* WIFI_SSID   = "Xperia";
const char* WIFI_PASS   = "1234565432";
const char* SERVER_HOST = "https://farmcareservices.com/api/iot";
const char* DEVICE_ID   = "esp8266_vitals_1";

// This tag is scanned/assigned once when the collar is paired to a cow
// (e.g. via the ESP32 RFID collar station); it is used at boot to resolve
// cow_id from the backend so vitals/location readings link to that animal.
const char* PAIRED_RFID_TAG = "";

int currentCowId = -1;

// ═══════════════════════════════════════════
//  OBJECT INSTANCES
// ═══════════════════════════════════════════
OneWire           oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);

SoftwareSerial    gpsSerial(GPS_RX_PIN, GPS_TX_PIN);
TinyGPSPlus       gps;

MAX30105          max30102;

// ── Heart-rate variables ──
const byte RATE_SIZE = 4;
byte       rates[RATE_SIZE];
byte       rateSpot   = 0;
long       lastBeat   = 0;
float      beatsPerMinute = 0;
int        beatAvg    = 0;

// ── Timing ──
unsigned long lastPrint = 0;
const unsigned long PRINT_INTERVAL = 2000;  // print every 2 s

// ── Sensor status flags ──
bool ds18b20_ok  = false;
bool max30102_ok = false;
bool mpu6050_ok  = false;
bool gps_ok      = false;

// ── Latest readings, updated by each read*() function, sent by sendVitalsData() ──
float  lastTempC   = DEVICE_DISCONNECTED_C;
double lastLat = 0, lastLng = 0, lastAlt = 0, lastSpeedKmph = 0, lastHdop = 0;
int    lastSats = 0;
bool   lastGpsValid = false;
int    lastSpo2Est = 0;
bool   lastHrValid = false;
float  lastAccelX = 0, lastAccelY = 0, lastAccelZ = 0;
float  lastGyroX = 0, lastGyroY = 0, lastGyroZ = 0;
bool   lastMotion = false;

// ═══════════════════════════════════════════
//  MPU6050 RAW I2C HELPERS
// ═══════════════════════════════════════════
void mpuWriteReg(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission(true);
}

uint8_t mpuReadReg(uint8_t reg) {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom((uint8_t)MPU6050_ADDR, (uint8_t)1);
  return Wire.read();
}

void mpuReadSensorData(int16_t* ax, int16_t* ay, int16_t* az,
                       int16_t* temp,
                       int16_t* gx, int16_t* gy, int16_t* gz) {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(REG_ACCEL_XOUT);
  Wire.endTransmission(false);
  Wire.requestFrom((uint8_t)MPU6050_ADDR, (uint8_t)14, (uint8_t)true);

  *ax   = (Wire.read() << 8) | Wire.read();
  *ay   = (Wire.read() << 8) | Wire.read();
  *az   = (Wire.read() << 8) | Wire.read();
  *temp = (Wire.read() << 8) | Wire.read();
  *gx   = (Wire.read() << 8) | Wire.read();
  *gy   = (Wire.read() << 8) | Wire.read();
  *gz   = (Wire.read() << 8) | Wire.read();
}

bool mpuInit() {
  // Check WHO_AM_I
  uint8_t whoAmI = mpuReadReg(REG_WHO_AM_I);
  Serial.printf("(WHO_AM_I=0x%02X) ", whoAmI);

  // Reset device
  mpuWriteReg(REG_PWR_MGMT_1, 0x80);
  delay(200);

  // Wake up
  mpuWriteReg(REG_PWR_MGMT_1, 0x00);
  delay(100);

  // Configure
  mpuWriteReg(REG_SMPLRT_DIV, 0x07);  // 125 Hz sample rate
  mpuWriteReg(REG_CONFIG,     0x03);   // DLPF ~44 Hz
  mpuWriteReg(REG_ACCEL_CFG,  0x08);   // ±4g
  mpuWriteReg(REG_GYRO_CFG,   0x08);   // ±500°/s

  // Verify it's alive with a test read
  int16_t ax, ay, az, t, gx, gy, gz;
  mpuReadSensorData(&ax, &ay, &az, &t, &gx, &gy, &gz);

  return !(ax == 0 && ay == 0 && az == 0);
}

// ═══════════════════════════════════════════
//  I2C SCANNER (debug helper)
// ═══════════════════════════════════════════
void scanI2C() {
  Serial.println(F("\n── I2C Bus Scan ──"));
  byte count = 0;
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("  Found device at 0x%02X", addr);
      if (addr == 0x57) Serial.print(F("  ← MAX30102"));
      if (addr == 0x68) Serial.print(F("  ← MPU6050"));
      Serial.println();
      count++;
    }
  }
  if (count == 0) Serial.println(F("  No I2C devices found!"));
  Serial.printf("  Total: %d device(s)\n\n", count);
}

// ═══════════════════════════════════════════
//  WIFI / SERVER
// ═══════════════════════════════════════════
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print(F("[WIFI]     Connecting"));
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 20) {
    delay(300);
    Serial.print(".");
    tries++;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(F("[WIFI]     OK — IP: "));
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(F("[WIFI]     FAIL — will retry later"));
  }
}

// Resolve this collar's paired RFID tag to a cow_id via the backend.
void resolveCowId() {
  if (WiFi.status() != WL_CONNECTED || strlen(PAIRED_RFID_TAG) == 0) return;

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.setTimeout(5000);

  StaticJsonDocument<256> doc;
  doc["device_id"] = DEVICE_ID;
  doc["rfid_tag"]  = PAIRED_RFID_TAG;
  String payload;
  serializeJson(doc, payload);

  http.begin(client, String(SERVER_HOST) + "/rfid-scan");
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(payload);

  if (code == 200) {
    String resp = http.getString();
    StaticJsonDocument<384> respDoc;
    if (deserializeJson(respDoc, resp) == DeserializationError::Ok && respDoc["found"] == true) {
      currentCowId = respDoc["cow_id"] | -1;
      Serial.printf("[PAIR]     Linked to cow_id=%d\n", currentCowId);
    } else {
      Serial.println(F("[PAIR]     RFID tag not registered to any cow"));
    }
  } else {
    Serial.printf("[PAIR]     Lookup failed, HTTP code: %d\n", code);
  }
  http.end();
}

// Send current GPS + vitals + motion snapshot to the backend.
void sendVitalsData(float tempC, double lat, double lng, double alt, double speedKmph,
                     int sats, double hdopVal, bool gpsValid,
                     float bpm, int spo2, bool hrValid,
                     float ax, float ay, float az, float gx, float gy, float gz, bool motion) {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    return;
  }

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.setTimeout(5000);

  StaticJsonDocument<768> doc;
  doc["device_id"] = DEVICE_ID;
  if (currentCowId >= 0) doc["cow_id"] = currentCowId;
  if (ds18b20_ok && tempC != DEVICE_DISCONNECTED_C) doc["temperature"] = tempC;

  if (gpsValid) {
    doc["latitude"]   = lat;
    doc["longitude"]  = lng;
    doc["altitude_m"] = alt;
    doc["speed_kmph"] = speedKmph;
    doc["satellites"] = sats;
    doc["hdop"]       = hdopVal;
  }

  if (hrValid) {
    doc["heart_rate_bpm"] = bpm;
    doc["spo2_pct"]       = spo2;
  }

  if (mpu6050_ok) {
    doc["accel_x_g"]  = ax;
    doc["accel_y_g"]  = ay;
    doc["accel_z_g"]  = az;
    doc["gyro_x_dps"] = gx;
    doc["gyro_y_dps"] = gy;
    doc["gyro_z_dps"] = gz;
    doc["is_moving"]  = motion;
  }

  String payload;
  serializeJson(doc, payload);

  http.begin(client, String(SERVER_HOST) + "/wearable-vitals");
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(payload);
  Serial.printf("[HTTP]     Vitals POST code: %d\n", code);
  http.end();
}

// ═══════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println(F("\n"));
  Serial.println(F("╔═══════════════════════════════════════════╗"));
  Serial.println(F("║  NodeMCU Multi-Sensor Test                ║"));
  Serial.println(F("║  DS18B20 | GPS | MAX30102 | MPU6050       ║"));
  Serial.println(F("╚═══════════════════════════════════════════╝"));

  // ── WiFi ──
  connectWiFi();

  // ── I2C ──
  Wire.begin(4, 5);   // SDA=D2(GPIO4), SCL=D1(GPIO5)
  Wire.setClock(100000);
  scanI2C();

  // ── DS18B20 ──
  Serial.print(F("[DS18B20]  Initializing... "));
  ds18b20.begin();
  if (ds18b20.getDeviceCount() > 0) {
    ds18b20_ok = true;
    ds18b20.setResolution(12);
    Serial.printf("OK — %d sensor(s) found\n", ds18b20.getDeviceCount());
  } else {
    Serial.println(F("FAIL — No sensor on D7. Check wiring + 4.7kΩ pull-up."));
  }

  // ── GPS ──
  Serial.print(F("[GPS]      Initializing... "));
  gpsSerial.begin(GPS_BAUD);
  pinMode(GPS_PPS_PIN, INPUT);
  gps_ok = true;
  Serial.println(F("OK — Listening on D6/D5 @ 9600 baud (fix may take 30-90 s)"));

  // ── MAX30102 ──
  Serial.print(F("[MAX30102] Initializing... "));
  if (max30102.begin(Wire, I2C_SPEED_STANDARD, 0x57)) {
    max30102_ok = true;
    max30102.setup(60, 4, 2, 200, 411, 4096);
    max30102.setPulseAmplitudeRed(0x1F);
    max30102.setPulseAmplitudeIR(0x1F);
    Serial.println(F("OK"));
  } else {
    Serial.println(F("FAIL — Not found at 0x57. Check wiring."));
  }

  // ── MPU6050 (RAW I2C) ──
  Serial.print(F("[MPU6050]  Initializing (raw I2C)... "));
  if (mpuInit()) {
    mpu6050_ok = true;
    Serial.println(F("OK"));
  } else {
    Serial.println(F("FAIL — No data. Check wiring."));
  }

  // ── Resolve cow_id from paired RFID tag ──
  resolveCowId();

  Serial.println(F("\n── Starting sensor readings ──\n"));
}

// ═══════════════════════════════════════════
//  READ DS18B20
// ═══════════════════════════════════════════
void readDS18B20() {
  if (!ds18b20_ok) {
    Serial.println(F("[DS18B20]  ✗ Not connected"));
    return;
  }
  ds18b20.requestTemperatures();
  float tempC = ds18b20.getTempCByIndex(0);
  lastTempC = tempC;
  if (tempC == DEVICE_DISCONNECTED_C) {
    Serial.println(F("[DS18B20]  ✗ Read error (disconnected?)"));
  } else {
    Serial.printf("[DS18B20]  ✓ Temp: %.2f °C  |  %.2f °F\n", tempC, tempC * 9.0 / 5.0 + 32.0);
  }
}

// ═══════════════════════════════════════════
//  READ GPS
// ═══════════════════════════════════════════
void readGPS() {
  unsigned long start = millis();
  while (gpsSerial.available() > 0 && millis() - start < 100) {
    gps.encode(gpsSerial.read());
  }

  bool pps = digitalRead(GPS_PPS_PIN);

  if (gps.location.isValid()) {
    lastGpsValid  = true;
    lastLat       = gps.location.lat();
    lastLng       = gps.location.lng();
    lastAlt       = gps.altitude.meters();
    lastSats      = gps.satellites.value();
    lastHdop      = gps.hdop.hdop();
    lastSpeedKmph = gps.speed.kmph();

    Serial.printf("[GPS]      ✓ Lat: %.6f  Lon: %.6f  Alt: %.1f m\n",
                  gps.location.lat(), gps.location.lng(), gps.altitude.meters());
    Serial.printf("           Sats: %d  HDOP: %.1f  Speed: %.1f km/h  PPS: %d\n",
                  gps.satellites.value(), gps.hdop.hdop(), gps.speed.kmph(), pps);
    if (gps.date.isValid() && gps.time.isValid()) {
      Serial.printf("           Date: %04d-%02d-%02d  Time: %02d:%02d:%02d UTC\n",
                    gps.date.year(), gps.date.month(), gps.date.day(),
                    gps.time.hour(), gps.time.minute(), gps.time.second());
    }
  } else {
    Serial.printf("[GPS]      ⏳ Waiting for fix... (chars: %lu  sentences: %lu  PPS: %d)\n",
                  gps.charsProcessed(), gps.sentencesWithFix(), pps);
    if (gps.charsProcessed() < 10) {
      Serial.println(F("           ⚠ No data — check TX→D6 wiring & baud rate"));
    }
  }
}

// ═══════════════════════════════════════════
//  READ MAX30102  (Heart Rate + IR for SpO2)
// ═══════════════════════════════════════════
void readMAX30102() {
  if (!max30102_ok) {
    Serial.println(F("[MAX30102] ✗ Not connected"));
    return;
  }

  long irValue = max30102.getIR();
  long redValue = max30102.getRed();

  if (irValue < 50000) {
    Serial.println(F("[MAX30102] ⏳ No finger detected — place finger on sensor"));
    return;
  }

  if (checkForBeat(irValue)) {
    long delta = millis() - lastBeat;
    lastBeat = millis();
    beatsPerMinute = 60.0 / (delta / 1000.0);
    if (beatsPerMinute > 20 && beatsPerMinute < 255) {
      rates[rateSpot++ % RATE_SIZE] = (byte)beatsPerMinute;
      beatAvg = 0;
      for (byte i = 0; i < RATE_SIZE; i++) beatAvg += rates[i];
      beatAvg /= RATE_SIZE;
    }
  }

  float ratio = (float)redValue / (float)irValue;
  int spo2Est = constrain((int)(110.0 - 25.0 * ratio), 0, 100);
  lastHrValid = beatAvg > 0;
  lastSpo2Est = spo2Est;

  Serial.printf("[MAX30102] ✓ IR: %ld  Red: %ld  BPM: %.1f  Avg BPM: %d  SpO2~: %d%%\n",
                irValue, redValue, beatsPerMinute, beatAvg, spo2Est);
}

// ═══════════════════════════════════════════
//  READ MPU6050 (RAW I2C)
// ═══════════════════════════════════════════
void readMPU6050() {
  if (!mpu6050_ok) {
    Serial.println(F("[MPU6050]  ✗ Not connected"));
    return;
  }

  int16_t ax, ay, az, rawTemp, gx, gy, gz;
  mpuReadSensorData(&ax, &ay, &az, &rawTemp, &gx, &gy, &gz);

  // Convert: ±4g → 8192 LSB/g
  float accelX = ax / 8192.0;
  float accelY = ay / 8192.0;
  float accelZ = az / 8192.0;
  float mag    = sqrt(accelX * accelX + accelY * accelY + accelZ * accelZ);

  // Convert: ±500°/s → 65.5 LSB/(°/s)
  float gyroX = gx / 65.5;
  float gyroY = gy / 65.5;
  float gyroZ = gz / 65.5;

  // Temperature: °C = raw/340.0 + 36.53
  float tempC = rawTemp / 340.0 + 36.53;

  // Motion detection
  bool moving = fabs(mag - 1.0) > 0.15;
  const char* motionStatus = moving ? "⚡ MOTION" : "— Still";

  lastAccelX = accelX; lastAccelY = accelY; lastAccelZ = accelZ;
  lastGyroX  = gyroX;  lastGyroY  = gyroY;  lastGyroZ  = gyroZ;
  lastMotion = moving;

  Serial.printf("[MPU6050]  ✓ Accel: X:%+.2fg  Y:%+.2fg  Z:%+.2fg  |%.2fg| [%s]\n",
                accelX, accelY, accelZ, mag, motionStatus);
  Serial.printf("           Gyro:  X:%+.1f  Y:%+.1f  Z:%+.1f °/s\n",
                gyroX, gyroY, gyroZ);
  Serial.printf("           Temp (MPU): %.1f °C\n", tempC);
}

// ═══════════════════════════════════════════
//  LOOP
// ═══════════════════════════════════════════
void loop() {
  // Always feed GPS data
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // Always sample MAX30102 for accurate heart-rate
  if (max30102_ok) {
    long irValue = max30102.getIR();
    if (irValue > 50000 && checkForBeat(irValue)) {
      long delta = millis() - lastBeat;
      lastBeat = millis();
      beatsPerMinute = 60.0 / (delta / 1000.0);
      if (beatsPerMinute > 20 && beatsPerMinute < 255) {
        rates[rateSpot++ % RATE_SIZE] = (byte)beatsPerMinute;
        beatAvg = 0;
        for (byte i = 0; i < RATE_SIZE; i++) beatAvg += rates[i];
        beatAvg /= RATE_SIZE;
      }
    }
  }

  // Print all readings every PRINT_INTERVAL
  if (millis() - lastPrint >= PRINT_INTERVAL) {
    lastPrint = millis();

    Serial.println(F("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    Serial.printf("  Uptime: %lu s\n", millis() / 1000);
    Serial.println(F("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));

    lastGpsValid = false; // recomputed by readGPS() each cycle if a fix is available
    readDS18B20();
    readGPS();
    readMAX30102();
    readMPU6050();

    sendVitalsData(lastTempC, lastLat, lastLng, lastAlt, lastSpeedKmph,
                   lastSats, lastHdop, lastGpsValid,
                   beatsPerMinute, lastSpo2Est, lastHrValid,
                   lastAccelX, lastAccelY, lastAccelZ,
                   lastGyroX, lastGyroY, lastGyroZ, lastMotion);

    Serial.println();
  }

  yield();  // ESP8266 watchdog
}
