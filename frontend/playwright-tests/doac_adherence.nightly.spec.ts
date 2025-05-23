import { test } from '@playwright/test'

test('DOAC Adherence', async ({ page }) => {
  await page.goto(
    '/exploredata?mls=1.medicare_cardiovascular-3.00&group1=All&dt1=doac_adherence',
  )
  await page
    .locator('#rate-map')
    .getByRole('heading', {
      name: 'Population adherent to direct oral anticoagulants in the United States',
    })
    .click()
  await page
    .locator('#rate-chart')
    .getByRole('heading', {
      name: 'Population adherent to direct oral anticoagulants in the United States',
    })
    .click()
  await page
    .getByRole('heading', {
      name: 'Adherent beneficiary population with unknown race/ethnicity in the United States',
    })
    .click()
  await page
    .getByRole('heading', {
      name: 'Summary for adherence to direct oral anticoagulants in the United States',
    })
    .click()
  await page.getByRole('heading', { name: 'Definitions:' }).click()
  await page
    .getByText('Adherence to direct oral anticoagulants', { exact: true })
    .click()
  await page.getByRole('heading', { name: 'What data are missing?' }).click()
  await page
    .getByText(
      'Do you have information that belongs on the Health Equity Tracker? We would love',
    )
    .click()
})
