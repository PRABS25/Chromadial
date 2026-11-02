/*
 * ChromaDial ESP32 RGB strip receiver, Arduino-ESP32 core 2.x / 3.x
 * Protocol: RGB,0..255,0..255,0..255\n on USB serial at 115200 or BLE.
 * Serial probe: HELLO\n -> READY,CHROMADIAL,1\n
 *
 * Defaults for WS2812B / NeoPixel 5V strips. Change pin/count/order below
 * to match your hardware. External 5V supply, common GND, and preferably
 * a 74AHCT125 level shifter are required for reliable signal integrity.
 * NEVER connect the strip power rail to an ESP32 GPIO.
 */
#include <Arduino.h>
#include <Adafruit_NeoPixel.h>
#include "soc/soc_caps.h"

#if SOC_BLE_SUPPORTED
  #include <BLEDevice.h>
  #include <BLEServer.h>
  #include <BLEUtils.h>
#endif

constexpr uint8_t LED_PIN = 5;       // Data through a 3.3V -> 5V logic level shifter.
constexpr uint16_t LED_COUNT = 16;   // Number of addressable RGB LEDs in your strip.
constexpr neoPixelType LED_ORDER = NEO_GRB + NEO_KHZ800; // WS2812B default.
constexpr uint32_t SERIAL_BAUD = 115200;

const char *SERVICE_UUID = "ddbe9d0a-5849-4a29-b83d-f04e7bb6d120";
const char *RGB_UUID     = "ddbe9d0a-5849-4a29-b83d-f04e7bb6d121";
const char *INFO_UUID    = "ddbe9d0a-5849-4a29-b83d-f04e7bb6d122";

Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, LED_ORDER);
portMUX_TYPE colorLock = portMUX_INITIALIZER_UNLOCKED;
volatile uint8_t requestedRed = 0, requestedGreen = 0, requestedBlue = 0;
volatile bool colorPending = false;

void setRequestedColor(uint8_t r, uint8_t g, uint8_t b) {
  portENTER_CRITICAL(&colorLock);
  requestedRed = r;
  requestedGreen = g;
  requestedBlue = b;
  colorPending = true;
  portEXIT_CRITICAL(&colorLock);
}

void receiveCommand(String command) {
  command.trim();
  if (command == "HELLO") {
    Serial.println("READY,CHROMADIAL,1");
    return;
  }
  int r, g, b;
  char unexpected;
  const int fields = sscanf(command.c_str(), "RGB,%d,%d,%d%c", &r, &g, &b, &unexpected);
  if (fields == 3 &&
      r >= 0 && r <= 255 &&
      g >= 0 && g <= 255 &&
      b >= 0 && b <= 255) {
    setRequestedColor((uint8_t)r, (uint8_t)g, (uint8_t)b);
  } else {
    Serial.println("ERR,BAD_RGB");
  }
}

#if SOC_BLE_SUPPORTED
class RGBWriteCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    String command = characteristic->getValue();
    receiveCommand(command);
  }
};

class ServerCallbacks : public BLEServerCallbacks {
  void onDisconnect(BLEServer *server) override {
    BLEDevice::startAdvertising();
  }
};

void initBluetooth() {
  BLEDevice::init("ChromaDial-ESP32");
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService *service = server->createService(SERVICE_UUID);

  BLECharacteristic *rgb = service->createCharacteristic(
    RGB_UUID, BLECharacteristic::PROPERTY_WRITE
  );
  rgb->setCallbacks(new RGBWriteCallbacks());
  BLECharacteristic *info = service->createCharacteristic(
    INFO_UUID, BLECharacteristic::PROPERTY_READ
  );
  info->setValue("CHROMADIAL,1");

  service->start();
  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println("BLE ready: ChromaDial-ESP32");
}
#endif

void setup() {
  Serial.begin(SERIAL_BAUD);
  strip.begin();
  strip.clear();
  strip.show(); // Default OFF at boot.
  #if SOC_BLE_SUPPORTED
    initBluetooth();
  #else
    Serial.println("BLE not supported on this chip; USB serial remains available.");
  #endif
  Serial.println("READY,CHROMADIAL,1");
}

void loop() {
  static char line[48];
  static size_t used = 0;

  while (Serial.available()) {
    const char ch = (char) Serial.read();
    if (ch == '\n') {
      line[used] = '\0';
      receiveCommand(String(line));
      used = 0;
    } else if (ch != '\r') {
      if (used < sizeof(line) - 1) line[used++] = ch;
      else used = 0; // Drop oversize command.
    }
  }

  uint8_t red, green, blue;
  bool changed;
  portENTER_CRITICAL(&colorLock);
  changed = colorPending;
  red = requestedRed;
  green = requestedGreen;
  blue = requestedBlue;
  colorPending = false;
  portEXIT_CRITICAL(&colorLock);

  if (changed) {
    strip.fill(strip.Color(red, green, blue));
    strip.show();
  }
  delay(2);
}
