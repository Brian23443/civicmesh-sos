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
  if (state == RADIOLIB_ERR_NONE) state = cmStartListening(radio);
  if (state != RADIOLIB_ERR_NONE) cmHaltOnRadioError(display, state);

  Serial.printf("BASE STATION ready (SF%d)\n", LORA_SF);
  cmOledShow(display, "BASE STATION ready", "SF" + String(LORA_SF) + "  915 MHz", "Waiting for frames...");
}

void loop() {
  uint8_t buf[256];
  CmRxResult rx;
  if (!cmPollPacket(radio, buf, rx)) return;

  if (rx.state == RADIOLIB_ERR_CRC_MISMATCH) {
    Serial.println("CRC error, packet dropped");
    return;
  }
  if (rx.state != RADIOLIB_ERR_NONE) {
    Serial.printf("Receive error %d\n", rx.state);
    return;
  }
  if (rx.len != CM_FRAME_LEN || cmFrameVersion(buf) != CM_FRAME_VERSION) {
    Serial.println("Unknown frame version, ignored");
    return;
  }

  char hex[2 * CM_FRAME_LEN + 1];
  cmToHex(buf, CM_FRAME_LEN, hex);
  Serial.printf("FRAME %s %.1f %.2f\n", hex, rx.rssi, rx.snr);
  framesHeard++;

  uint8_t people = cmFrameAdults(buf) + cmFrameChildren(buf);
  cmOledShow(display,
             String(cmPriorityWord(cmFramePriority(buf))) + " · " + String(people) + " ppl",
             String(cmFrameAdults(buf)) + " adults + " + String(cmFrameChildren(buf)) + " children",
             "seq " + String(cmFrameSeq(buf)) + "  dev " + String(cmFrameDeviceId(buf), HEX),
             "RSSI " + String(rx.rssi, 0) + "  SNR " + String(rx.snr, 1) + "  #" + String(framesHeard));
}
