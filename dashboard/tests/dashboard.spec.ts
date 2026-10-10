import { expect, test } from "@playwright/test";

test("renders the operator dashboard without browser errors", async ({ page }) => {
  const browserErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "CivicMesh-SOS Operator Dashboard" }),
  ).toBeVisible();
  await expect(page.getByLabel("Incident queue")).toBeVisible();
  await expect(page.locator(".incident-card")).toHaveCount(9);
  await expect(page.getByRole("heading", { name: "No location" })).toBeVisible();
  await expect(page.locator(".map-mode")).toContainText(
    /Offline canvas|Grid fallback/,
  );
  await expect(page.locator(".maplibregl-canvas, .fallback-grid").first()).toBeVisible();

  expect(browserErrors).toEqual([]);
});
