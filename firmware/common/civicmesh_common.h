// CivicMesh-SOS — shared firmware definitions (MASTER_PROMPT §1, §3, Appendix B).
//
// CANONICAL COPY. The Arduino IDE only compiles files inside a sketch folder, so
// firmware/sync_common.sh copies this file into every sketch folder. Edit it here,
// then run the script; never edit the copies.
//
// The frame-packing part (no Arduino dependencies) is also compiled on the host by
// firmware/common/test_pack.cpp, which checks both §3 test vectors.

#pragma once

#include <math.h>
#include <stdint.h>
#include <stddef.h>

// ---------------------------------------------------------------------------
// Radio settings (§1). Identical on both boards — change them only here.
// ---------------------------------------------------------------------------
#ifndef LORA_SF
#define LORA_SF 7                 // spreading factor; stay <= 10 (400 ms US dwell limit)
#endif
#define LORA_FREQ_MHZ 915.0
#define LORA_BW_KHZ 125.0
#define LORA_CR 5                 // coding rate 4/5
#define LORA_SYNC_WORD 0x12       // private sync word
#define LORA_TX_POWER_DBM 14
#define LORA_PREAMBLE 8
#define LORA_TCXO_V 1.8
#define LORA_CRC_BYTES 2

// Heltec WiFi LoRa 32 V3 pin map (§1). Prefixed names avoid clashing with the
// board variant's own macros (Vext, RST_OLED, ...).
#define CM_LORA_NSS 8
#define CM_LORA_SCK 9
#define CM_LORA_MOSI 10
#define CM_LORA_MISO 11
#define CM_LORA_RST 12
#define CM_LORA_BUSY 13
#define CM_LORA_DIO1 14
#define CM_OLED_SDA 17
#define CM_OLED_SCL 18
#define CM_OLED_RST 21
#define CM_VEXT 36                // drive LOW to power the OLED
#define CM_OLED_ADDR 0x3C

// ---------------------------------------------------------------------------
// Frame format v1 (§3): 18 bytes, big-endian.
// ---------------------------------------------------------------------------
#define CM_FRAME_LEN 18
#define CM_FRAME_VERSION 1
#define CM_INT24_MAX 8388607L     // 2^23 - 1

struct CmFrameFields {
  uint8_t priority;      // TriagePriority 0..3
  uint8_t hazard;        // HazardClass 0..15
  uint8_t status;        // RescueStatus 0..3
  uint8_t adults;        // clamped 0..15
  uint8_t children;      // clamped 0..15
  uint16_t flags;        // MedicalFlags, already including bits 8..12
  double lat;            // double precision: float32 is off by ~2 m (§3)
  double lon;
  uint32_t timestamp;    // POSIX seconds
  uint16_t deviceId;
  uint8_t seq;
  uint8_t gpsAccuracy;   // GpsAccuracy 0..7
};

static inline int32_t cmEncodeCoord(double value, double range) {
  // round(v / range * (2^23 - 1)), clamped. lround rounds half away from zero;
  // Python's round is half-to-even — exact .5 ties don't occur with real coordinates.
  long v = lround(value / range * (double)CM_INT24_MAX);
  if (v > CM_INT24_MAX) v = CM_INT24_MAX;
  if (v < -CM_INT24_MAX) v = -CM_INT24_MAX;
  return (int32_t)v;
}

static inline double cmDecodeCoord(const uint8_t* p, double range) {
  int32_t v = ((int32_t)p[0] << 16) | ((int32_t)p[1] << 8) | p[2];
  if (v & 0x800000) v -= 0x1000000;  // sign-extend 24-bit two's complement
  return (double)v / (double)CM_INT24_MAX * range;
}

static inline void cmPutInt24(uint8_t* p, int32_t v) {
  uint32_t u = (uint32_t)v & 0xFFFFFFu;
  p[0] = (uint8_t)(u >> 16);
  p[1] = (uint8_t)(u >> 8);
  p[2] = (uint8_t)u;
}

static inline uint8_t cmClamp15(uint8_t n) { return n > 15 ? 15 : n; }

static inline void cmPackFrameV1(const CmFrameFields& f, uint8_t out[CM_FRAME_LEN]) {
  out[0] = (uint8_t)((f.priority & 0x03) | ((f.hazard & 0x0F) << 2) | ((f.status & 0x03) << 6));
  out[1] = (uint8_t)(cmClamp15(f.adults) | (cmClamp15(f.children) << 4));
  out[2] = (uint8_t)(f.flags >> 8);
  out[3] = (uint8_t)f.flags;
  cmPutInt24(out + 4, cmEncodeCoord(f.lat, 90.0));
  cmPutInt24(out + 7, cmEncodeCoord(f.lon, 180.0));
  out[10] = (uint8_t)(f.timestamp >> 24);
  out[11] = (uint8_t)(f.timestamp >> 16);
  out[12] = (uint8_t)(f.timestamp >> 8);
  out[13] = (uint8_t)f.timestamp;
  out[14] = (uint8_t)(f.deviceId >> 8);
  out[15] = (uint8_t)f.deviceId;
  out[16] = f.seq;
  out[17] = (uint8_t)(((f.gpsAccuracy & 0x07) << 3) | (CM_FRAME_VERSION << 6));
}

// Field accessors for a received / relayed frame.
static inline uint8_t cmFrameVersion(const uint8_t* b) { return b[17] >> 6; }
static inline uint8_t cmFramePriority(const uint8_t* b) { return b[0] & 0x03; }
static inline uint8_t cmFrameAdults(const uint8_t* b) { return b[1] & 0x0F; }
static inline uint8_t cmFrameChildren(const uint8_t* b) { return b[1] >> 4; }
static inline uint16_t cmFrameDeviceId(const uint8_t* b) { return (uint16_t)((b[14] << 8) | b[15]); }
static inline uint8_t cmFrameSeq(const uint8_t* b) { return b[16]; }

// Triage color words for the OLED (TriagePriority order).
static inline const char* cmPriorityWord(uint8_t p) {
  static const char* const words[4] = {"GREEN", "YELLOW", "RED", "BLACK"};
  return words[p & 0x03];
}

// Uppercase hex: out must hold 2 * len + 1 chars.
static inline void cmToHex(const uint8_t* data, size_t len, char* out) {
  static const char digits[] = "0123456789ABCDEF";
  for (size_t i = 0; i < len; i++) {
    out[2 * i] = digits[data[i] >> 4];
    out[2 * i + 1] = digits[data[i] & 0x0F];
  }
  out[2 * len] = '\0';
}

static inline int cmHexNibble(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  return -1;
}

// Parses exactly 36 hex chars (either case) into a v1 frame.
// Returns 0 on success, 1 for bad length/characters, 2 for a wrong version.
static inline int cmParseFrameHex(const char* hex, size_t hexLen, uint8_t out[CM_FRAME_LEN]) {
  if (hexLen != 2 * CM_FRAME_LEN) return 1;
  for (size_t i = 0; i < CM_FRAME_LEN; i++) {
    int hi = cmHexNibble(hex[2 * i]);
    int lo = cmHexNibble(hex[2 * i + 1]);
    if (hi < 0 || lo < 0) return 1;
    out[i] = (uint8_t)((hi << 4) | lo);
  }
  return cmFrameVersion(out) == CM_FRAME_VERSION ? 0 : 2;
}

// ---------------------------------------------------------------------------
// Board bring-up (Arduino only).
// ---------------------------------------------------------------------------
#ifdef ARDUINO
#include <Arduino.h>
#include <RadioLib.h>
#include <SPI.h>
#include <SSD1306Wire.h>

// Powers and resets the OLED, then initializes it (Appendix B setup step 2).
static inline void cmOledInit(SSD1306Wire& display) {
  pinMode(CM_VEXT, OUTPUT);
  digitalWrite(CM_VEXT, LOW);
  delay(50);
  pinMode(CM_OLED_RST, OUTPUT);
  digitalWrite(CM_OLED_RST, LOW);
  delay(20);
  digitalWrite(CM_OLED_RST, HIGH);
  delay(20);
  display.init();
  display.flipScreenVertically();
  display.setFont(ArialMT_Plain_10);
  display.setTextAlignment(TEXT_ALIGN_LEFT);
}

// Shows up to four lines of text.
static inline void cmOledShow(SSD1306Wire& display, const String& l1, const String& l2 = "",
                              const String& l3 = "", const String& l4 = "") {
  display.clear();
  display.drawString(0, 0, l1);
  display.drawString(0, 14, l2);
  display.drawString(0, 28, l3);
  display.drawString(0, 42, l4);
  display.display();
}

// Configures the SX1262 with the §1 settings. Returns a RadioLib status code
// (RADIOLIB_ERR_NONE on success). SPI must already be started on the §1 pins.
static inline int16_t cmRadioInit(SX1262& radio) {
  int16_t state = radio.begin(LORA_FREQ_MHZ, LORA_BW_KHZ, LORA_SF, LORA_CR, LORA_SYNC_WORD,
                              LORA_TX_POWER_DBM, LORA_PREAMBLE, LORA_TCXO_V);
  if (state != RADIOLIB_ERR_NONE) return state;
  return radio.setCRC(LORA_CRC_BYTES);  // 2-byte hardware CRC, enabled explicitly
}

// --- Continuous receive -----------------------------------------------------
// Don't use the blocking radio.receive(): it listens in windows of 5x the
// time on air and restarts the radio between them, so a frame that starts in
// the gap is silently lost (seen on hardware: 1 of 3 frames missed). Instead
// the radio stays in continuous RX and DIO1 raises a flag per packet.

static volatile bool cmRxFlag = false;
static void IRAM_ATTR cmOnPacketReceived() { cmRxFlag = true; }

// Puts the radio in continuous receive. Call once in setup().
static inline int16_t cmStartListening(SX1262& radio) {
  radio.setPacketReceivedAction(cmOnPacketReceived);
  return radio.startReceive();
}

struct CmRxResult {
  int16_t state;   // RADIOLIB_ERR_NONE, RADIOLIB_ERR_CRC_MISMATCH, ...
  size_t len;      // received packet length
  float rssi;
  float snr;
};

// Returns false if no packet arrived since the last call. Otherwise reads it
// into buf (must hold 256 bytes), fills r, and re-arms continuous receive.
static inline bool cmPollPacket(SX1262& radio, uint8_t* buf, CmRxResult& r) {
  if (!cmRxFlag) return false;
  cmRxFlag = false;
  r.len = radio.getPacketLength();
  r.state = radio.readData(buf, r.len);
  r.rssi = radio.getRSSI();
  r.snr = radio.getSNR();
  radio.startReceive();
  return true;
}

// Prints the error, shows it on the OLED and halts (Appendix B setup step 5).
static inline void cmHaltOnRadioError(SSD1306Wire& display, int16_t code) {
  Serial.printf("Radio init FAILED %d\n", code);
  cmOledShow(display, "Radio init FAILED " + String(code));
  while (true) delay(1000);
}
#endif  // ARDUINO
