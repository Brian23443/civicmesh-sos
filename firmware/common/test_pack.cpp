// Host-side test of the C frame packer against the §3 test vectors.
//   c++ -std=c++17 -Wall -o /tmp/test_pack firmware/common/test_pack.cpp && /tmp/test_pack
#include <cmath>
#include <cstdio>
#include <cstring>

#include "civicmesh_common.h"

static int failures = 0;

static void expectHex(const char* name, const CmFrameFields& f, const char* expected) {
  uint8_t frame[CM_FRAME_LEN];
  char hex[2 * CM_FRAME_LEN + 1];
  cmPackFrameV1(f, frame);
  cmToHex(frame, CM_FRAME_LEN, hex);
  bool ok = std::strcmp(hex, expected) == 0;
  std::printf("%s %s\n  got      %s\n  expected %s\n", ok ? "PASS" : "FAIL", name, hex, expected);
  if (!ok) failures++;
}

int main() {
  // Vector 1: IMMEDIATE, FLOOD, TRAPPED, 2 adults + 1 child, INSULIN, M10.
  CmFrameFields v1 = {2, 1, 2, 2, 1, 0x0001, 30.2672, -97.7431, 1760000000u, 0xBEEF, 0, 2};
  expectHex("vector 1", v1, "861200012B0BF3BA7E6A68E77800BEEF0050");

  // Vector 2: IMMEDIATE, MEDICAL_CRISIS, TRAPPED, 1 adult, third-party + address (flags 0x1900), NO_FIX.
  CmFrameFields v2 = {2, 7, 2, 1, 0, 0x1900, 30.2672, -97.7431, 1760000000u, 0, 0, 0};
  expectHex("vector 2", v2, "9E0119002B0BF3BA7E6A68E7780000000040");

  // Headcounts saturate at 15.
  CmFrameFields big = v1;
  big.adults = 40;
  big.children = 20;
  uint8_t frame[CM_FRAME_LEN];
  cmPackFrameV1(big, frame);
  bool sat = frame[1] == 0xFF;
  std::printf("%s headcount saturation\n", sat ? "PASS" : "FAIL");
  if (!sat) failures++;

  // Hex parsing: lowercase accepted, wrong version and wrong length rejected.
  uint8_t parsed[CM_FRAME_LEN];
  const char* lower = "861200012b0bf3ba7e6a68e77800beef0050";
  bool parseOk = cmParseFrameHex(lower, std::strlen(lower), parsed) == 0 &&
                 cmParseFrameHex("861200012B0BF3BA7E6A68E77800BEEF0010", 36, parsed) == 2 &&
                 cmParseFrameHex("8612", 4, parsed) == 1 &&
                 cmParseFrameHex("ZZ1200012B0BF3BA7E6A68E77800BEEF0050", 36, parsed) == 1;
  std::printf("%s hex parsing\n", parseOk ? "PASS" : "FAIL");
  if (!parseOk) failures++;

  // Coordinate round trip at the §3 points.
  const double pts[][2] = {{90, 180}, {-90, -180}, {0, 0}, {-33.8688, 151.2093}, {64.1466, -21.9426}};
  bool rt = true;
  for (auto& p : pts) {
    CmFrameFields c = v1;
    c.lat = p[0];
    c.lon = p[1];
    cmPackFrameV1(c, frame);
    double lat = cmDecodeCoord(frame + 4, 90.0), lon = cmDecodeCoord(frame + 7, 180.0);
    if (std::fabs(lat - p[0]) > 1.1e-5 || std::fabs(lon - p[1]) > 2.2e-5) rt = false;
  }
  std::printf("%s coordinate round trip\n", rt ? "PASS" : "FAIL");
  if (!rt) failures++;

  return failures == 0 ? 0 : 1;
}
