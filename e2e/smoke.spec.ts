import { expect, test } from "@playwright/test";

test("T-E1: login, KPIs, búsqueda, ficha y foco en plano", async ({ page }) => {
  const username = process.env.E2E_USERNAME ?? process.env.ADMIN_INITIAL_USER ?? "admin";
  const password = process.env.E2E_PASSWORD ?? process.env.ADMIN_INITIAL_PASSWORD;
  if (!password) throw new Error("Define E2E_PASSWORD o ADMIN_INITIAL_PASSWORD");

  await page.goto("/login");
  await page.getByLabel("Usuario").fill(username);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
  await expect(page.getByText("Total equipos", { exact: true })).toBeVisible();

  await page.goto("/equipos");
  await page.getByLabel("Búsqueda").fill("PC-01-SEED");
  await page.getByLabel("Búsqueda").press("Enter");
  const computer = page.getByRole("link", { name: "PC-01-SEED", exact: true });
  await expect(computer).toBeVisible();
  await computer.click();

  await expect(page.getByRole("heading", { name: "PC-01-SEED" })).toBeVisible();
  await page.getByRole("link", { name: "Ver en plano", exact: true }).click();
  await expect(page).toHaveURL(/\/mapa\?.*focus=seed-c-01/);
  await expect(page.getByRole("heading", { name: "Mapa" })).toBeVisible();
  await expect(page.locator(".pm-focus-ring")).toBeVisible();
});
