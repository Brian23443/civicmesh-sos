// CivicMesh-SOS — field node (MASTER_PROMPT §13.1).
//
// Open Wi-Fi access point "CivicMesh-SOS" at 192.168.4.1. The survivor website
// navigates to  http://192.168.4.1/sos?d=<36 hex>  and this node relays the
// 18-byte frame over LoRa to the base station, then shows a "Sent ✓" page.
// No captive-portal DNS redirect (iOS's portal browser can't see the website's
// cached model).
//
// ATTACH THE ANTENNA BEFORE POWERING THE BOARD.
// Shared settings live in civicmesh_common.h (edit firmware/common/, then run
// firmware/sync_common.sh).

#include <WebServer.h>
#include <WiFi.h>

#include "civicmesh_common.h"

// Hosted survivor website (docs/INTEGRATION.md, filled in by Track 4).
#ifndef APP_URL
#define APP_URL "https://REPLACE-WITH-APP-URL.example"
#endif

#define AP_SSID "CivicMesh-SOS"
#define TX_RETRY_DELAY_MS 100

SSD1306Wire display(CM_OLED_ADDR, CM_OLED_SDA, CM_OLED_SCL);
SX1262 radio = new Module(CM_LORA_NSS, CM_LORA_DIO1, CM_LORA_RST, CM_LORA_BUSY, SPI);
WebServer server(80);

uint32_t sentCount = 0;

// ---------------------------------------------------------------------------
// HTML (self-contained, inline CSS, no external fonts). Colors are placeholders
// until Track 4's design tokens land in design/REFERENCES.md — change only :root.
// ---------------------------------------------------------------------------
static const char PAGE_HEAD[] PROGMEM = R"HTML(<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CivicMesh relay</title>
<style>
:root{--bg:#0b0f14;--surface:#141a22;--text:#e8edf2;--muted:#9aa7b4;--accent:#5aa9ff;--ok:#3ecf8e;--radius:16px}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;
background:var(--bg);color:var(--text);font:17px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.card{width:100%;max-width:420px;background:var(--surface);border-radius:var(--radius);padding:28px 24px;text-align:center}
.icon{font-size:56px;line-height:1;margin-bottom:12px}
.ok{color:var(--ok)}
h1{font-size:26px;margin:0 0 8px}
p{margin:0 0 20px;color:var(--muted)}
a.btn{display:block;min-height:48px;padding:13px 20px;border-radius:12px;background:var(--accent);color:#06121f;
font-weight:600;text-decoration:none}
a.btn:focus-visible{outline:3px solid var(--text);outline-offset:3px}
.meta{margin-top:16px;font:13px ui-monospace,Menlo,monospace;color:var(--muted)}
</style></head><body><main class="card">
)HTML";

static const char PAGE_TAIL[] PROGMEM = R"HTML(
</main></body></html>
)HTML";

static String page(const String& body) {
  String html;
  html.reserve(2200);
  html += FPSTR(PAGE_HEAD);
  html += body;
  html += FPSTR(PAGE_TAIL);
  return html;
}

static String backLink() {
  return String("<a class=\"btn\" href=\"") + APP_URL + "\" aria-label=\"Back to CivicMesh\">Back to CivicMesh</a>";
}

// ---------------------------------------------------------------------------
// OLED
// ---------------------------------------------------------------------------
static void showIdle() {
  cmOledShow(display, "READY · " + String(sentCount) + " sent", "Wi-Fi: " AP_SSID, "192.168.4.1",
             "SF" + String(LORA_SF) + "  915 MHz");
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------
static void sendError(int code, const String& title, const String& detail) {
  String body = "<div class=\"icon\" aria-hidden=\"true\">!</div><h1>" + title + "</h1><p>" + detail + "</p>" +
                backLink();
  server.send(code, "text/html; charset=utf-8", page(body));
}

static void handleSos() {
  String hex = server.arg("d");
  uint8_t frame[CM_FRAME_LEN];
  int parsed = cmParseFrameHex(hex.c_str(), hex.length(), frame);
  if (parsed != 0) {
    Serial.printf("Rejected /sos d=%s (code %d)\n", hex.c_str(), parsed);
    sendError(400, "Report not recognised",
              parsed == 2 ? "This report was made by a different app version. Open CivicMesh and try again."
                          : "The report link is incomplete. Go back to CivicMesh and tap Send again.");
    return;
  }

  int16_t state = radio.transmit(frame, CM_FRAME_LEN);
  if (state != RADIOLIB_ERR_NONE) {
    delay(TX_RETRY_DELAY_MS);
    state = radio.transmit(frame, CM_FRAME_LEN);
  }
  if (state != RADIOLIB_ERR_NONE) {
    Serial.printf("Transmit error %d\n", state);
    cmOledShow(display, "TX ERROR " + String(state), "seq " + String(cmFrameSeq(frame)));
    sendError(503, "Not sent yet", "The relay couldn't reach the rescue network. Wait a moment and tap Send again.");
    return;
  }

  sentCount++;
  char hexUpper[2 * CM_FRAME_LEN + 1];
  cmToHex(frame, CM_FRAME_LEN, hexUpper);
  uint8_t people = cmFrameAdults(frame) + cmFrameChildren(frame);
  const char* word = cmPriorityWord(cmFramePriority(frame));
  Serial.printf("Relayed %s (%s, %u ppl, seq %u)\n", hexUpper, word, people, cmFrameSeq(frame));
  // §13.1: "SENT · RED · 3 ppl · seq 12" — split over two lines to fit 128 px.
  cmOledShow(display, "SENT · " + String(word), String(people) + " ppl · seq " + String(cmFrameSeq(frame)),
             "", "READY · " + String(sentCount) + " sent");

  String body = String("<div class=\"icon ok\" aria-hidden=\"true\">&#10003;</div>") +
                "<h1>Sent &#10003;</h1>" +
                "<p>Your report is on the rescue network. Stay where you are if it is safe.</p>" + backLink() +
                "<div class=\"meta\">seq " + String(cmFrameSeq(frame)) + "</div>";
  server.send(200, "text/html; charset=utf-8", page(body));
}

static void handleRoot() {
  String body = String("<div class=\"icon\" aria-hidden=\"true\">&#128225;</div><h1>CivicMesh relay</h1>") +
                "<p>Open the CivicMesh website to send a report.</p>" + backLink();
  server.send(200, "text/html; charset=utf-8", page(body));
}

static void handleNotFound() {
  server.send(404, "text/plain; charset=utf-8", "Not found. Open the CivicMesh website to send a report.");
}

// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(200);
  cmOledInit(display);
  SPI.begin(CM_LORA_SCK, CM_LORA_MISO, CM_LORA_MOSI, CM_LORA_NSS);

  int16_t state = cmRadioInit(radio);
  if (state != RADIOLIB_ERR_NONE) cmHaltOnRadioError(display, state);

  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
  WiFi.softAP(AP_SSID);  // open network, no password

  server.on("/sos", HTTP_GET, handleSos);
  server.on("/", HTTP_GET, handleRoot);
  server.onNotFound(handleNotFound);
  server.begin();

  Serial.printf("FIELD NODE ready: SSID %s, http://%s/ (SF%d)\n", AP_SSID, WiFi.softAPIP().toString().c_str(),
                LORA_SF);
  showIdle();
}

void loop() {
  server.handleClient();
  delay(2);
}
