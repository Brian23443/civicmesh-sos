import { expect, test, type Page } from "@playwright/test";

import { mockIncidents } from "../src/mocks/incidents";
import type { Incident } from "../src/types/incident";

async function mockBridge(page: Page) {
  const state = new Map<string, Incident>(
    mockIncidents.map((incident) => [incident.id, { ...incident }]),
  );

  await page.route("**/api/incidents?state=all", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([...state.values()]),
    });
  });
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        serial_connected: true,
        port: "/dev/mock-radio",
        last_frame_at: Math.floor(Date.now() / 1000) - 4,
        active_count: [...state.values()].filter(
          (incident) => incident.state === "active",
        ).length,
      }),
    });
  });
  await page.route(/\/api\/incidents\/([^/]+)\/(remove|restore)$/, async (route) => {
    const match = new URL(route.request().url()).pathname.match(
      /\/api\/incidents\/([^/]+)\/(remove|restore)$/,
    );
    const id = decodeURIComponent(match?.[1] ?? "");
    const action = match?.[2];
    const incident = state.get(id);
    if (!incident || !action) {
      await route.fulfill({ status: 404, body: "Not found" });
      return;
    }

    const updated: Incident = {
      ...incident,
      state: action === "remove" ? "removed" : "active",
      removed_at:
        action === "remove" ? Math.floor(Date.now() / 1000) : null,
    };
    state.set(id, updated);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(updated),
    });
  });
  await page.routeWebSocket("**/ws", (socket) => {
    socket.send(
      JSON.stringify({
        type: "health",
        health: {
          serial_connected: true,
          port: "/dev/mock-radio",
          last_frame_at: Math.floor(Date.now() / 1000) - 4,
          active_count: 9,
        },
      }),
    );
  });
}

test.beforeEach(async ({ page }) => {
  await mockBridge(page);
});

test("renders the live operator dashboard without browser errors", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "CivicMesh-SOS Operator Dashboard" }),
  ).toBeVisible();
  await expect(page.getByText("WS connected")).toBeVisible();
  await expect(page.getByLabel("Incident queue")).toBeVisible();
  await expect(page.locator(".incident-card")).toHaveCount(9);
  await expect(page.getByRole("heading", { name: "No location" })).toBeVisible();
  await expect(page.locator(".map-mode")).toContainText(
    /Offline canvas|Grid fallback/,
  );
  await expect(
    page.locator(".maplibregl-canvas, .fallback-grid").first(),
  ).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test("opens the detail drawer and decodes every frame field", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".incident-card").first().click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("18-byte radio frame")).toBeVisible();
  await expect(drawer.locator(".frame-hex")).toHaveText(/^[0-9A-F]{36}$/);
  await expect(drawer.locator(".frame-table tbody tr")).toHaveCount(9);
  await expect(drawer.getByText("Priority / Hazard / Status")).toBeVisible();
  await expect(
    drawer.getByText(
      "Only these 18 bytes traveled over the radio; the survivor's original text is never transmitted.",
    ),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("removes a pin and restores it from the Undo toast", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".incident-card")).toHaveCount(9);
  await page.locator(".incident-card").first().click();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove pin" }).click();

  const toast = page.getByRole("status");
  await expect(toast).toContainText("Incident removed from the map");
  await expect(page.locator(".incident-card")).toHaveCount(8);

  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(toast).toBeHidden();
  await expect(page.locator(".incident-card")).toHaveCount(9);
});
