// CivicMesh-SOS — radio link test (MASTER_PROMPT Appendix B).
//
// One sketch for both boards. Set ROLE_SENDER to 1 for the field node, 0 for the
// base station. ATTACH THE ANTENNA BEFORE POWERING A BOARD WITH THIS SKETCH:
// transmitting without one can damage the SX1262.
//
// Done when the receiver prints FRAME 861200012B0BF3BA7E6A68E77800BEEF0050 ...
// for the first frame; later frames differ only in bytes 10-13 and byte 16.

#define ROLE_SENDER 1   // 1 = sender (field node), 0 = receiver (base station)
#define LORA_SF 7       // spreading factor — must match on both boards

#include "civicmesh_common.h"

SSD1306Wire display(CM_OLED_ADDR, CM_OLED_SDA, CM_OLED_SCL);
SX1262 radio = new Module(CM_LORA_NSS, CM_LORA_DIO1, CM_LORA_RST, CM_LORA_BUSY, SPI);

uint32_t counter = 0;

void setup() {
  Serial.begin(115200);
  delay(200);
  cmOledInit(display);
  SPI.begin(CM_LORA_SCK, CM_LORA_MISO, CM_LORA_MOSI, CM_LORA_NSS);

  int16_t state = cmRadioInit(radio);
#if !ROLE_SENDER
  if (state == RADIOLIB_ERR_NONE) state = cmStartListening(radio);
#endif
  if (state != RADIOLIB_ERR_NONE) cmHaltOnRadioError(display, state);

  const char* ready = ROLE_SENDER ? "SENDER ready" : "RECEIVER ready";
  Serial.printf("%s (SF%d)\n", ready, LORA_SF);
  cmOledShow(display, ready, "SF" + String(LORA_SF));
}

#if ROLE_SENDER

void loop() {
  // Test vector 1 (§3); only the timestamp and seq change per frame.
  CmFrameFields f = {2, 1, 2, 2, 1, 0x0001, 30.2672, -97.7431, 0, 0xBEEF, 0, 2};
  f.timestamp = 1760000000u + counter;
  f.seq = (uint8_t)(counter % 256);

  uint8_t frame[CM_FRAME_LEN];
  cmPackFrameV1(f, frame);

  uint32_t start = millis();
  int16_t state = radio.transmit(frame, CM_FRAME_LEN);
  uint32_t elapsed = millis() - start;

  if (state == RADIOLIB_ERR_NONE) {
    Serial.printf("Sent seq %u (%lu ms on air)\n", f.seq, (unsigned long)elapsed);
    cmOledShow(display, "SENDER  SF" + String(LORA_SF), "Sent seq " + String(f.seq),
               String(elapsed) + " ms on air");
  } else {
    Serial.printf("Transmit error %d\n", state);
    cmOledShow(display, "SENDER", "Transmit error " + String(state));
  }

  counter++;
  delay(3000);
}

#else

void loop() {
  uint8_t buf[256];
  CmRxResult rx;
  if (!cmPollPacket(radio, buf, rx)) return;

  if (rx.state == RADIOLIB_ERR_CRC_MISMATCH) {
    Serial.println("CRC error, packet dropped");
  } else if (rx.state != RADIOLIB_ERR_NONE) {
    Serial.printf("Receive error %d\n", rx.state);
  } else if (rx.len != CM_FRAME_LEN || cmFrameVersion(buf) != CM_FRAME_VERSION) {
    Serial.println("Unknown frame version, ignored");
  } else {
    char hex[2 * CM_FRAME_LEN + 1];
    cmToHex(buf, CM_FRAME_LEN, hex);
    Serial.printf("FRAME %s %.1f %.2f\n", hex, rx.rssi, rx.snr);

    char ids[32];
    snprintf(ids, sizeof(ids), "dev %04X  seq %u", cmFrameDeviceId(buf), cmFrameSeq(buf));
    cmOledShow(display, cmPriorityWord(cmFramePriority(buf)),
               String(cmFrameAdults(buf)) + " adults  " + String(cmFrameChildren(buf)) + " children",
               ids, "RSSI " + String(rx.rssi, 0) + "  SNR " + String(rx.snr, 1));
  }
}

#endif
