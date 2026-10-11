// CivicMesh-SOS — field node (MASTER_PROMPT §13.1).
//
// Open Wi-Fi access point "RescuNote" at 192.168.4.1. The survivor website
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

// Hosted survivor website (docs/INTEGRATION.md). Set it here, not with a -D compile flag:
// shell quoting through arduino-cli leaves literal quote marks in the string, which makes the
// "Back to RescuNote" href empty — a tap then reloads /sos and re-transmits the report.
#define APP_URL "https://rescunote.tech/"
static_assert(APP_URL[0] == 'h', "APP_URL must be a bare URL string, without embedded quote marks");

#define AP_SSID "RescuNote"
#define TX_RETRY_DELAY_MS 100
// A request for the exact frame relayed within this window is not transmitted again (browser
// back/restore/prefetch of /sos). A deliberate re-send from the app has a new seq, so a new frame.
#define REPEAT_WINDOW_MS (10UL * 60UL * 1000UL)

SSD1306Wire display(CM_OLED_ADDR, CM_OLED_SDA, CM_OLED_SCL);
SX1262 radio = new Module(CM_LORA_NSS, CM_LORA_DIO1, CM_LORA_RST, CM_LORA_BUSY, SPI);
WebServer server(80);

uint32_t sentCount = 0;
uint8_t lastFrame[CM_FRAME_LEN];
uint32_t lastFrameAt = 0;
bool haveLastFrame = false;

// ---------------------------------------------------------------------------
// HTML (self-contained, inline CSS/JS, no external fonts). Colours are the RescuNote app's dark tokens
// (web/src/styles.css) so the hop to the relay and back feels like one app.
// ---------------------------------------------------------------------------
static const char PAGE_HEAD[] PROGMEM = R"HTML(<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#101820">
<title>RescuNote relay</title>
<style>
:root{--bg:#101820;--surface:#19252F;--text:#F4F7FA;--muted:#BAC9D5;--accent:#A9C7FF;--accent-text:#101820;--border:#435666}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);color:var(--text);
font:17px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;transition:opacity .35s ease}
body.leaving{opacity:0}
main{width:100%;max-width:380px;text-align:center;animation:rise .45s ease-out both}
h1{font-size:28px;font-weight:600;letter-spacing:-.02em;margin:20px 0 6px}
p{margin:0 0 24px;color:var(--muted)}
.mark{width:96px;height:96px;margin:0 auto}
.mark circle{fill:none;stroke:var(--accent);stroke-width:5;stroke-dasharray:283;stroke-dashoffset:283;animation:draw .6s ease-out .1s forwards}
.mark path{fill:none;stroke:var(--accent);stroke-width:6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:60;stroke-dashoffset:60;animation:draw .35s ease-out .6s forwards}
.bar{height:4px;border-radius:2px;background:var(--surface);overflow:hidden;margin:0 auto 20px;max-width:220px}
.bar i{display:block;height:100%;width:100%;background:var(--accent);transform-origin:left;transform:scaleX(0);animation:fill 10s linear forwards}
.small{font-size:15px;margin:0 0 12px}
.alert{width:72px;height:72px;margin:0 auto;border-radius:50%;border:4px solid var(--muted);display:grid;place-items:center;font-size:40px;font-weight:700;color:var(--muted)}
a.btn{display:block;min-height:52px;padding:14px 20px;border-radius:14px;background:var(--accent);color:var(--accent-text);font-weight:600;text-decoration:none}
a.quiet{color:var(--muted);font-size:15px;text-decoration:underline}
a:focus-visible{outline:3px solid var(--text);outline-offset:3px}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes fill{to{transform:scaleX(1)}}
@keyframes rise{from{opacity:0;transform:translateY(8px)}}
@media(prefers-reduced-motion:reduce){main,.mark circle,.mark path,.bar i{animation:none;stroke-dashoffset:0;transform:none}body{transition:none}}
</style></head><body><main>
)HTML";

static const char PAGE_TAIL[] PROGMEM = R"HTML(
</main></body></html>
)HTML";

// Goes *back* to the app when we came from it: iOS restores the app page from its back/forward cache
// with the on-device model still loaded. Opening APP_URL instead would reload the app and load the
// ~35 MB model again; iOS doesn't free that memory between reloads, so after a few reports the model
// could no longer start. Without history (page opened directly) it opens APP_URL.
static const char GO_HOME_JS[] PROGMEM = R"JS(<script>
function goHome(){document.body.classList.add('leaving');setTimeout(function(){
if(history.length>1){history.back();setTimeout(function(){location.replace(APP)},1500);}else{location.replace(APP);}},350);return false;}
</script>)JS";

static String page(const String& body, bool withScript = true) {
  String html;
  html.reserve(4096);
  html += FPSTR(PAGE_HEAD);
  if (withScript) {  // before the body: the sent page's auto-return timer calls goHome()
    html += "<script>var APP='" APP_URL "';</script>";
    html += FPSTR(GO_HOME_JS);
  }
  html += body;
  html += FPSTR(PAGE_TAIL);
  return html;
}

static String backLink(const char* cls = "btn", const char* label = "Back to RescuNote") {
  return String("<a class=\"") + cls + "\" href=\"" APP_URL "\" onclick=\"return goHome()\">" + label + "</a>";
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
// Every response must reach the board: a cached "Sent ✓" page would mean nothing was sent.
static void sendNoCache(int code, const char* type, const String& content) {
  server.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  server.sendHeader("Pragma", "no-cache");
  server.sendHeader("Expires", "0");
  server.send(code, type, content);
}

static void sendError(int code, const String& title, const String& detail) {
  String body = "<div class=\"alert\" aria-hidden=\"true\">!</div><h1>" + title + "</h1><p>" + detail + "</p>" +
                backLink();
  sendNoCache(code, "text/html; charset=utf-8", page(body));
}

static void redirectToSent(const uint8_t* frame) {
  server.sendHeader("Location", "/sent?seq=" + String(cmFrameSeq(frame)));
  sendNoCache(303, "text/plain; charset=utf-8", "Sent");
}

static void handleSos() {
  String hex = server.arg("d");
  uint8_t frame[CM_FRAME_LEN];
  int parsed = cmParseFrameHex(hex.c_str(), hex.length(), frame);
  if (parsed != 0) {
    Serial.printf("Rejected /sos d=%s (code %d)\n", hex.c_str(), parsed);
    sendError(400, "Report not recognised",
              parsed == 2 ? "This report was made by a different app version. Open RescuNote and try again."
                          : "The report link is incomplete. Go back to RescuNote and tap Send again.");
    return;
  }

  if (haveLastFrame && memcmp(frame, lastFrame, CM_FRAME_LEN) == 0 && millis() - lastFrameAt < REPEAT_WINDOW_MS) {
    Serial.printf("Repeat request for seq %u — already relayed, not re-sent\n", cmFrameSeq(frame));
    redirectToSent(frame);
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
  memcpy(lastFrame, frame, CM_FRAME_LEN);
  lastFrameAt = millis();
  haveLastFrame = true;
  char hexUpper[2 * CM_FRAME_LEN + 1];
  cmToHex(frame, CM_FRAME_LEN, hexUpper);
  uint8_t people = cmFrameAdults(frame) + cmFrameChildren(frame);
  const char* word = cmPriorityWord(cmFramePriority(frame));
  Serial.printf("Relayed %s (%s, %u ppl, seq %u)\n", hexUpper, word, people, cmFrameSeq(frame));
  // §13.1: "SENT · RED · 3 ppl · seq 12" — split over two lines to fit 128 px.
  cmOledShow(display, "SENT · " + String(word), String(people) + " ppl · seq " + String(cmFrameSeq(frame)),
             "", "READY · " + String(sentCount) + " sent");

  // Post/redirect/get: the "Sent ✓" page lives at /sent, so reloading or restoring it never
  // requests /sos (and never transmits) again.
  redirectToSent(frame);
}

// Success: show it clearly for 10 s, then return to the app by itself — no tap needed.
static void handleSent() {
  String body = String(
      "<svg class=\"mark\" viewBox=\"0 0 100 100\" aria-hidden=\"true\"><circle cx=\"50\" cy=\"50\" r=\"45\"/>"
      "<path d=\"M30 52 L44 66 L71 37\"/></svg>"
      "<h1 role=\"status\">Report sent</h1>"
      "<p>It&rsquo;s on the rescue radio network. Stay where you are if it&rsquo;s safe.</p>"
      "<div class=\"bar\" aria-hidden=\"true\"><i></i></div>") +
      "<p class=\"small\" id=\"cd\">Returning to RescuNote in 10&nbsp;s</p>" +
      backLink("quiet", "Back to RescuNote now") +
      "<script>var n=10,t=setInterval(function(){n--;document.getElementById('cd').textContent='Returning to RescuNote in '+n+'\u00a0s';if(n<=0){clearInterval(t);goHome();}},1000);addEventListener('pagehide',function(){clearInterval(t)});</script>";
  sendNoCache(200, "text/html; charset=utf-8", page(body));
}

static void handleRoot() {
  String body = String("<div class=\"alert\" aria-hidden=\"true\">i</div><h1>RescuNote relay</h1>") +
                "<p>Open RescuNote to send a report. This relay passes it on by radio.</p>" + backLink("btn", "Open RescuNote");
  sendNoCache(200, "text/html; charset=utf-8", page(body));
}

static void handleNotFound() {
  sendNoCache(404, "text/plain; charset=utf-8", "Not found. Open RescuNote to send a report.");
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
  server.on("/sent", HTTP_GET, handleSent);
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
