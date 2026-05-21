#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <LiquidCrystal_I2C.h>
#include <string.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* geolocationKey = "YOUR_GOOGLE_API_KEY";
const char* firebaseDatabaseUrl = "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com";
const char* firebaseDatabaseSecret = ""; // Optional: legacy database secret or auth token
const char* firebaseAlertsPath = "/AccidentHistory.json";
const char* dashboardSubmitUrl = "https://YOUR_RENDER_SERVICE.onrender.com/api/submit"; // Replace after Render deploy

const int lowLedPin = 25;
const int mediumLedPin = 26;
const int highLedPin = 27;
const unsigned long telemetryIntervalMs = 5000;

Adafruit_MPU6050 mpu;
LiquidCrystal_I2C lcd(0x27, 16, 2);
unsigned long lastTelemetrySent = 0;

struct VibrationState {
  const char* level;
  const char* status;
  const char* ledState;
};

VibrationState getVibrationState(float vibrationG);
void setLedState(const char* level);
void addTelemetryFields(StaticJsonDocument<768> &doc, float ax, float ay, float az, float vibrationG, VibrationState vibration);
bool sendFirebaseReport(float ax, float ay, float az, float vibrationG, VibrationState vibration);
bool sendDashboardReport(float ax, float ay, float az, float vibrationG, VibrationState vibration);
bool fetchLocation(float &latitude, float &longitude);

void setup() {
  Serial.begin(115200);
  Wire.begin();
  pinMode(lowLedPin, OUTPUT);
  pinMode(mediumLedPin, OUTPUT);
  pinMode(highLedPin, OUTPUT);
  setLedState("Normal");

  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("ESP32 Accident");
  lcd.setCursor(0, 1);
  lcd.print("Initializing...");

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi connected");
  lcd.clear();
  lcd.print("WiFi connected");

  if (!mpu.begin()) {
    Serial.println("MPU6050 not found");
    lcd.clear();
    lcd.print("MPU6050 error");
    while (true) {
      delay(1000);
    }
  }

  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  delay(1000);
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    sensors_event_t accel;
    sensors_event_t gyro;
    sensors_event_t temp;
    mpu.getEvent(&accel, &gyro, &temp);

    float ax = accel.acceleration.x;
    float ay = accel.acceleration.y;
    float az = accel.acceleration.z;
    float totalAcceleration = sqrt(ax * ax + ay * ay + az * az);
    float vibrationG = totalAcceleration / 9.81;
    VibrationState vibration = getVibrationState(vibrationG);
    setLedState(vibration.level);

    Serial.printf("Accel: %.2f %.2f %.2f | G: %.2f | Level: %s\n", ax, ay, az, vibrationG, vibration.level);

    if (millis() - lastTelemetrySent > telemetryIntervalMs || totalAcceleration > 18.0) {
      bool success = sendFirebaseReport(ax, ay, az, vibrationG, vibration);
      lastTelemetrySent = millis();
      Serial.println(success ? "Firebase report sent" : "Firebase report failed");
    }

    if (totalAcceleration > 18.0) {
      lcd.clear();
      lcd.print("Accident Detected");
      bool success = sendDashboardReport(ax, ay, az, vibrationG, vibration);
      lcd.setCursor(0, 1);
      lcd.print(success ? "Report sent" : "Send failed");
      delay(30000);
    }
  } else {
    lcd.clear();
    lcd.print("WiFi reconnect");
  }
  delay(1000);
}

VibrationState getVibrationState(float vibrationG) {
  if (vibrationG >= 2.5) {
    return {"High", "Severe collision", "High LED"};
  }
  if (vibrationG >= 1.8) {
    return {"Medium", "Strong vibration", "Medium LED"};
  }
  if (vibrationG >= 1.2) {
    return {"Low", "Light vibration", "Low LED"};
  }
  return {"Normal", "Normal movement", "No LED"};
}

void setLedState(const char* level) {
  digitalWrite(lowLedPin, strcmp(level, "Low") == 0 ? HIGH : LOW);
  digitalWrite(mediumLedPin, strcmp(level, "Medium") == 0 ? HIGH : LOW);
  digitalWrite(highLedPin, strcmp(level, "High") == 0 ? HIGH : LOW);
}

void addTelemetryFields(StaticJsonDocument<768> &doc, float ax, float ay, float az, float vibrationG, VibrationState vibration) {
  float latitude = 0;
  float longitude = 0;
  if (!fetchLocation(latitude, longitude)) {
    Serial.println("Location fetch failed");
  }

  doc["vehicle_type"] = "Truck";
  doc["vehicle_number"] = "MPU-6050-01";
  doc["latitude"] = String(latitude, 6);
  doc["longitude"] = String(longitude, 6);
  doc["status"] = vibration.status;
  doc["severity"] = vibration.level;
  doc["vibration_g"] = String(vibrationG, 2);
  doc["vibration_level"] = vibration.level;
  doc["led_state"] = vibration.ledState;
  doc["accel_x"] = String(ax, 2);
  doc["accel_y"] = String(ay, 2);
  doc["accel_z"] = String(az, 2);
  doc["description"] = "MPU6050 vibration data and Wi-Fi geolocation reported by ESP32";
}

bool sendFirebaseReport(float ax, float ay, float az, float vibrationG, VibrationState vibration) {
  if (String(firebaseDatabaseUrl).indexOf("YOUR_PROJECT_ID") >= 0) {
    Serial.println("Firebase URL is not configured");
    return false;
  }

  StaticJsonDocument<768> doc;
  addTelemetryFields(doc, ax, ay, az, vibrationG, vibration);

  String payload;
  serializeJson(doc, payload);

  HTTPClient http;
  String url = String(firebaseDatabaseUrl) + firebaseAlertsPath;
  if (strlen(firebaseDatabaseSecret) > 0) {
    url += String("?auth=") + firebaseDatabaseSecret;
  }
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  int httpResponseCode = http.POST(payload);

  if (httpResponseCode > 0) {
    Serial.println(http.getString());
  } else {
    Serial.printf("Firebase POST failed: %d\n", httpResponseCode);
  }

  http.end();
  return httpResponseCode == 200;
}

bool sendDashboardReport(float ax, float ay, float az, float vibrationG, VibrationState vibration) {
  StaticJsonDocument<768> doc;
  addTelemetryFields(doc, ax, ay, az, vibrationG, vibration);

  String payload;
  serializeJson(doc, payload);

  HTTPClient http;
  WiFiClientSecure client;
  client.setInsecure();
  http.begin(client, dashboardSubmitUrl);
  http.addHeader("Content-Type", "application/json");
  int httpResponseCode = http.POST(payload);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println(response);
  } else {
    Serial.printf("POST failed: %d\n", httpResponseCode);
  }

  http.end();
  return httpResponseCode == 200 || httpResponseCode == 201;
}

bool fetchLocation(float &latitude, float &longitude) {
  int n = WiFi.scanNetworks();
  StaticJsonDocument<1024> requestDoc;
  JsonArray wifiArray = requestDoc.createNestedArray("wifiAccessPoints");
  for (int i = 0; i < n && i < 8; i++) {
    JsonObject ap = wifiArray.createNestedObject();
    ap["macAddress"] = WiFi.BSSIDstr(i);
    ap["signalStrength"] = WiFi.RSSI(i);
  }

  String jsonPayload;
  serializeJson(requestDoc, jsonPayload);

  HTTPClient http;
  String url = String("https://www.googleapis.com/geolocation/v1/geolocate?key=") + geolocationKey;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(jsonPayload);
  if (code != HTTP_CODE_OK) {
    Serial.printf("Geolocation request failed: %d\n", code);
    http.end();
    return false;
  }

  String body = http.getString();
  http.end();

  StaticJsonDocument<512> resultDoc;
  DeserializationError error = deserializeJson(resultDoc, body);
  if (error) {
    Serial.println("Geolocation parse failed");
    return false;
  }

  latitude = resultDoc["location"]["lat"].as<float>();
  longitude = resultDoc["location"]["lng"].as<float>();
  Serial.printf("Location: %.6f, %.6f\n", latitude, longitude);
  return true;
}
