import { test, expect } from '@playwright/test'

test('solo defeat modal appears and navigation works', async ({ page }) => {
  await page.goto('/?debug_solo_defeat=1')

  // Wait for modal heading
  await expect(page.locator('text=Perdeste a run')).toBeVisible({ timeout: 5000 })

  const mainBtn = page.getByRole('button', { name: 'Voltar ao menu principal' })
  const anotherBtn = page.getByRole('button', { name: 'Começar outra run' })

  await expect(mainBtn).toBeVisible()
  await expect(anotherBtn).toBeVisible()

  // Click 'Começar outra run' and expect to navigate to /solo
  await anotherBtn.click()
  await page.waitForURL('**/solo')
  await expect(page).toHaveURL(/\/solo$/)

  // Go back and open again
  await page.goto('/?debug_solo_defeat=1')
  await mainBtn.click()
  await page.waitForURL('**/')
  await expect(page).toHaveURL(/\/$/)
})
