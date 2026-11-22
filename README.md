# Toyota Price List

Monthly Toyota Malaysia price list as a static web page, hosted on GitHub Pages and refreshed automatically.

## What updates automatically

A GitHub Actions workflow (`.github/workflows/update.yml`) runs at **08:00 Malaysia time on the 1st and 15th of every month** (and on demand from the Actions tab → *Run workflow*). It runs `scraper/update.mjs`, commits `site/data/prices.json`, and redeploys the site.

| Column | Source |
| --- | --- |
| Body price | "On The Road Price without Insurance" (Individual, Peninsular Malaysia) in each model's price-list PDF linked from toyota.com.my/en/price-and-model-tools/price-list.html |
| Rebate | Monthly promo page, toyota.com.my/en/promotions/monthly-promo.html (the promo cards embedded in the page) |
| Est. insurance | Toyota publishes no premiums. Estimate = the PDF's *Recommended Sum Insured* x a per-variant rate calibrated from the original Excel estimates (`est / baseSI` in `config/products.json`), rounded to the nearest RM100 |
| D/P 10% | 10% x (body price + est. insurance), calculated in the browser (`site/calc.js`) |
| Loan | body price − D/P |
| 9 years / 90% | (loan x 2.3% x 9 + loan) / 108, flat rate |
| 9 years / 100% | (body price x 2.3% x 9 + body price) / 108, no D/P |

The header month and year (`NOVEMBER 2026`) come from the time the data was generated. The page shows a warning if the data is older than 20 days.

Rate, D/P % and tenure live in `config/products.json` → `settings`.

## Name card

The card at the top can be edited in the browser (name, job title, phone with Malaysian format, company, address, and a profile photo shown in a circle with zoom / reposition). Edits are saved in that browser only (localStorage). Shared defaults are in `site/data/card.json`.

## If a model fails to update

The scraper keeps the previous data for that model, and the workflow run turns red (GitHub emails you). Typical causes: Toyota renamed a variant or moved a PDF. Fix `config/products.json` (variant names, `pdf` folder, `hdr` column regex, `promo` card title) and run the workflow again.

New model or variant: add it to `config/products.json`, add its image to `site/assets/cars/`, then run `node scraper/update.mjs --init-baseline` once to store its insurance calibration base (use the Excel/quote estimate as `est`).

## Local use

```
npm install
npm run update      # refresh data from toyota.com.my
npm run serve       # http://localhost:4173
npm test            # compare against the November 2026 Excel (only valid for that month's prices)
```

Prices are estimates for reference. Always confirm with the official Toyota price list.
