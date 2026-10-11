/*
 ═══════════════════════════════════════════════
  RationSetu - ESP32 Code
  Components:
  - R307/AS608 Fingerprint Sensor
  - HX711 + Load Cell (Weight Sensor)
  - ESP32 DevKit
 ═══════════════════════════════════════════════
 
 WIRING:
 ┌─────────────────────────────────────────────┐
 │  Fingerprint Sensor (R307/AS608):           │
 │    VCC  → ESP32 3.3V or 5V                  │
 │    GND  → ESP32 GND                         │
 │    TX   → ESP32 GPIO 16 (RX2)               │
 │    RX   → ESP32 GPIO 17 (TX2)               │
 │                                             │
 │  HX711 (Load Cell Amplifier):               │
 │    VCC  → ESP32 3.3V                        │
 │    GND  → ESP32 GND                         │
 │    DT   → ESP32 GPIO 4                      │
 │    SCK  → ESP32 GPIO 5                      │
 └─────────────────────────────────────────────┘
*/

#include <Adafruit_Fingerprint.h>
#include <HardwareSerial.h>
#include "HX711.h"

// ─── FINGERPRINT ───
HardwareSerial mySerial(2);   // UART2
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);

// ─── LOAD CELL ───
const int LOADCELL_DOUT_PIN = 4;
const int LOADCELL_SCK_PIN  = 5;
HX711 scale;

// Calibration factor (adjust after testing)
float calibration_factor = -7050.0;

// State
bool enrollMode  = false;
int  enrollId    = 0;
bool scanMode    = false;
bool dispenseMode = false;
float dispenseQty = 0.0;

// ─────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    
    // Fingerprint
    mySerial.begin(57600, SERIAL_8N1, 16, 17);
    
    if (finger.verifyPassword()) {
        Serial.println("FINGER_INIT_OK");
    } else {
        Serial.println("FINGER_INIT_FAIL");
    }
    
    finger.getTemplateCount();
    
    // Load Cell
    scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
    scale.set_scale(calibration_factor);
    scale.tare(); // Reset to 0
    
    Serial.println("LOADCELL_INIT_OK");
    Serial.println("READY");
}

// ─────────────────────────────────────────────
void loop() {
    // Read commands from Python
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();
        
        if (cmd == "SCAN") {
            scanMode = true;
            Serial.println("SCANNING...");
            
        } else if (cmd.startsWith("ENROLL:")) {
            enrollId = cmd.substring(7).toInt();
            enrollMode = true;
            Serial.println("ENROLL_START:" + String(enrollId));
            enrollFingerprint(enrollId);
            
        } else if (cmd == "WEIGHT") {
            float weight = scale.get_units(5);
            Serial.println("WEIGHT:" + String(weight, 2));
            
        } else if (cmd.startsWith("DISPENSE:")) {
            dispenseQty = cmd.substring(9).toFloat();
            dispenseMode = true;
            Serial.println("DISPENSE_START:" + String(dispenseQty));
            
        } else if (cmd == "TARE") {
            scale.tare();
            Serial.println("TARE_OK");
        }
    }
    
    // Fingerprint Scan
    if (scanMode) {
        int result = getFingerprintID();
        if (result >= 0) {
            Serial.println("FINGER_OK:" + String(result));
            scanMode = false;
        } else if (result == -1) {
            // Keep trying
        } else {
            Serial.println("FINGER_FAIL");
            scanMode = false;
        }
    }
    
    // Dispense Mode (Monitor weight)
    if (dispenseMode) {
        float currentWeight = scale.get_units(3);
        Serial.println("CURRENT_WEIGHT:" + String(currentWeight, 2));
        
        if (currentWeight >= dispenseQty * 0.95) {
            Serial.println("DISPENSE_DONE");
            dispenseMode = false;
        }
        delay(500);
    }
    
    delay(100);
}

// ─────────────────────────────────────────────
int getFingerprintID() {
    uint8_t p = finger.getImage();
    
    if (p == FINGERPRINT_NOFINGER) return -1;
    if (p != FINGERPRINT_OK) return -2;
    
    p = finger.image2Tz();
    if (p != FINGERPRINT_OK) return -2;
    
    p = finger.fingerFastSearch();
    if (p != FINGERPRINT_OK) return -2;
    
    return finger.fingerID;
}

// ─────────────────────────────────────────────
void enrollFingerprint(int id) {
    Serial.println("ENROLL_PLACE_FINGER");
    
    int p = -1;
    while (p != FINGERPRINT_OK) {
        p = finger.getImage();
        if (p == FINGERPRINT_OK) Serial.println("ENROLL_IMAGE1_OK");
        delay(100);
    }
    
    p = finger.image2Tz(1);
    if (p != FINGERPRINT_OK) {
        Serial.println("ENROLL_FAIL");
        return;
    }
    
    Serial.println("ENROLL_REMOVE_FINGER");
    delay(2000);
    
    p = 0;
    while (p != FINGERPRINT_NOFINGER) {
        p = finger.getImage();
        delay(100);
    }
    
    Serial.println("ENROLL_PLACE_AGAIN");
    p = -1;
    while (p != FINGERPRINT_OK) {
        p = finger.getImage();
        if (p == FINGERPRINT_OK) Serial.println("ENROLL_IMAGE2_OK");
        delay(100);
    }
    
    p = finger.image2Tz(2);
    if (p != FINGERPRINT_OK) {
        Serial.println("ENROLL_FAIL");
        return;
    }
    
    p = finger.createModel();
    if (p != FINGERPRINT_OK) {
        Serial.println("ENROLL_FAIL");
        return;
    }
    
    p = finger.storeModel(id);
    if (p == FINGERPRINT_OK) {
        Serial.println("ENROLL_OK:" + String(id));
    } else {
        Serial.println("ENROLL_FAIL");
    }
}