// CivicMesh-SOS — base station (MASTER_PROMPT §13.2, Appendix B receiver role).
//
// Receives 18-byte v1 frames over LoRa and prints one machine-readable line per
// frame for the laptop bridge:   FRAME <36 uppercase hex> <rssi> <snr>
// The OLED shows the last frame's priority, headcount, seq and RSSI.
//
// ATTACH THE ANTENNA BEFORE POWERING THE BOARD.
// Shared settings live in civicmesh_common.h (edit firmware/common/, then run
// firmware/sync_common.sh).

#include "civicmesh_common.h"

SSD1306Wire display(CM_OLED_ADDR, CM_OLED_SDA, CM_OLED_SCL);
SX1262 radio = new Module(CM_LORA_NSS, CM_LORA_DIO1, CM_LORA_RST, CM_LORA_BUSY, SPI);

uint32_t framesHeard = 0;

void setup() {
  Serial.begin(115200);
  delay(200);
  cmOledInit(display);
  SPI.begin(CM_LORA_SCK, CM_LORA_MISO, CM_LORA_MOSI, CM_LORA_NSS);

  int16_t state = cmRadioInit(radio);
  if (state != RADIOLIB_ERR_NONE) cmHaltOnRadioError(display, state);

  Serial.printf("BASE STATION ready (SF%d)\n", LORA_SF);
  cmOledShow(display, "BASE STATION ready", "SF" + String(LORA_SF) + "  915 MHz", "Waiting for frames...");
}

void loop() {
  uint8_t frame[CM_FRAME_LEN];
  int16_t state = radio.receive(frame, CM_FRAME_LEN);

  if (state == RADIOLIB_ERR_NONE) {
    if (radio.getPacketLength() != CM_FRAME_LEN || cmFrameVersion(frame) != CM_FRAME_VERSION) {
      Serial.println("Unknown frame version, ignored");
      return;
    }
    float rssi = radio.getRSSI();
    float snr = radio.getSNR();
    char hex[2 * CM_FRAME_LEN + 1];
    cmToHex(frame, CM_FRAME_LEN, hex);
    Serial.printf("FRAME %s %.1f %.2f\n", hex, rssi, snr);
    framesHeard++;

    uint8_t people = cmFrameAdults(frame) + cmFrameChildren(frame);
    cmOledShow(display,
               String(cmPriorityWord(cmFramePriority(frame))) + " · " + String(people) + " ppl",
               String(cmFrameAdults(frame)) + " adults + " + String(cmFrameChildren(frame)) + " children",
               "seq " + String(cmFrameSeq(frame)) + "  dev " + String(cmFrameDeviceId(frame), HEX),
               "RSSI " + String(rssi, 0) + "  SNR " + String(snr, 1) + "  #" + String(framesHeard));
  } else if (state == RADIOLIB_ERR_CRC_MISMATCH) {
    Serial.println("CRC error, packet dropped");
  } else if (state != RADIOLIB_ERR_RX_TIMEOUT) {
    Serial.printf("Receive error %d\n", state);
  }
}
