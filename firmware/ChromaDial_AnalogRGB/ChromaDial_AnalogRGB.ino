/*
  ChromaDial analog RGB strip receiver (12 V / 24 V common-anode)
  Arduino-ESP32 core 3.x. Compatible with ChromaDial's BLE and USB protocol.
  Use THREE logic-level MOSFETs, one per colour. NEVER power a strip from GPIO.
  Change the pins to match your ESP32 board. These are classic ESP32 defaults.
*/
#include <Arduino.h>
#include "soc/soc_caps.h"
#if SOC_BLE_SUPPORTED
  #include <BLEDevice.h>
  #include <BLEServer.h>
  #include <BLEUtils.h>
#endif

const int PIN_R=25, PIN_G=26, PIN_B=27; // GPIO outputs -> MOSFET gates
const char *SERVICE="ddbe9d0a-5849-4a29-b83d-f04e7bb6d120";
const char *RGB_WRITE="ddbe9d0a-5849-4a29-b83d-f04e7bb6d121";
const char *INFO_READ="ddbe9d0a-5849-4a29-b83d-f04e7bb6d122";

portMUX_TYPE mux=portMUX_INITIALIZER_UNLOCKED;
volatile uint8_t nextR=0,nextG=0,nextB=0;
volatile bool dirty=false;
void setColour(uint8_t r,uint8_t g,uint8_t b) {
  portENTER_CRITICAL(&mux);
  nextR=r; nextG=g; nextB=b; dirty=true;
  portEXIT_CRITICAL(&mux);
}
void receive(String msg,bool serial) {
  msg.trim();
  if(msg=="HELLO") {
    if(serial) Serial.println("READY,CHROMADIAL,1");
    return;
  }
  int r=0,g=0,b=0,n=0;
  if(sscanf(msg.c_str(),"RGB,%d,%d,%d%n",&r,&g,&b,&n)==3 &&
     n==(int)msg.length() &&
     r>=0 && r<=255 && g>=0 && g<=255 && b>=0 && b<=255) {
    setColour((uint8_t)r,(uint8_t)g,(uint8_t)b);
    return;
  }
  if(serial) Serial.println("ERR,BAD_RGB");
}
#if SOC_BLE_SUPPORTED
class ColourWrites: public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override { receive(c->getValue(),false); }
};
class Disconnects: public BLEServerCallbacks {
  void onDisconnect(BLEServer *s) override {
    setColour(0,0,0);
    s->startAdvertising();
  }
};
void initBLE() {
  BLEDevice::init("ChromaDial-Analog");
  BLEServer *server=BLEDevice::createServer();
  server->setCallbacks(new Disconnects());
  BLEService *service=server->createService(SERVICE);
  BLECharacteristic *rgb=service->createCharacteristic(RGB_WRITE,BLECharacteristic::PROPERTY_WRITE);
  rgb->setCallbacks(new ColourWrites());
  BLECharacteristic *info=service->createCharacteristic(INFO_READ,BLECharacteristic::PROPERTY_READ);
  info->setValue("CHROMADIAL,1");
  service->start();
  BLEAdvertising *adv=BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
}
#endif
char line[64]; size_t used=0;
void pollSerial() {
  while(Serial.available()) {
    char c=(char)Serial.read();
    if(c=='\n'||c=='\r') {
      if(used) { line[used]=0; receive(String(line),true); used=0; }
    } else if(used<sizeof(line)-1) line[used++]=c;
    else { used=0; Serial.println("ERR,TOO_LONG"); }
  }
}
void setup() {
  Serial.begin(115200);
  // 8-bit PWM: 0 means OFF, 255 means full brightness.
  ledcAttach(PIN_R,5000,8);
  ledcAttach(PIN_G,5000,8);
  ledcAttach(PIN_B,5000,8);
  ledcWrite(PIN_R,0); ledcWrite(PIN_G,0); ledcWrite(PIN_B,0);
#if SOC_BLE_SUPPORTED
  initBLE();
#endif
  Serial.println("READY,CHROMADIAL,1");
}
void loop() {
  pollSerial();
  uint8_t r,g,b; bool update;
  portENTER_CRITICAL(&mux);
  update=dirty; r=nextR; g=nextG; b=nextB; dirty=false;
  portEXIT_CRITICAL(&mux);
  if(update) {
    ledcWrite(PIN_R,r);
    ledcWrite(PIN_G,g);
    ledcWrite(PIN_B,b);
  }
  delay(3);
}
