# Toyota Price List

Monthly Toyota Malaysia price list as a static web page, hosted on GitHub Pages and refreshed automatically.

## What updates automatically

A GitHub Actions workflow (`.github/workflows/update.yml`) runs at these Malaysia times: **1st 7:30am, 2nd 7:00am, 3rd 7:00am and 15th 8:00am of every month** (and on demand from the Actions tab → *Run workflow*). GitHub cron is UTC only, so each slot is scheduled at its UTC equivalent and a first step checks the real Malaysia day and hour. It runs `scraper/update.mjs`, commits `site/data/prices.json`, and redeploys the site. If you change the slots, change `SLOTS` in `site/app.js` too (it shows the next update time).

| Column | Source |
| --- | --- |
| Body price | "On The Road Price without Insurance" (Individual, Peninsular Malaysia) in each model's price-list PDF linked from toyota.com.my/en/price-and-model-tools/price-list.html |
| Rebate | Monthly promo page, toyota.com.my/en/promotions/monthly-promo.html (the promo cards embedded in the page) |
| Est. insurance | Toyota publishes no premiums. Estimate = the PDF's *Recommended Sum Insured* x a per-variant rate calibrated from the original Excel estimates (`est / baseSI` in `config/products.json`), rounded to the nearest RM100 |
| D/P 10% | 10% x body price (insurance is paid separately), calculated in the browser (`site/calc.js`) |
| Loan | body price − D/P |
| 9 years / 90% | (loan x 2.3% x 9 + loan) / 108, flat rate |
| 9 years / 0% D/P | (body price x 2.3% x 9 + body price) / 108, whole body price financed |

The header month and year (`NOVEMBER 2026`) come from the time the data was generated. The page shows a warning if the data is older than 20 days.

Rate, D/P % and tenure live in `config/products.json` → `settings`.

## For any Toyota sales advisor

The card starts with sample details from `site/data/card.json` (Wan Jasni, 016-331 3607, TOYOTA PCM | Telok Panglima Garang). Each sales advisor taps **Edit card** and replaces them with their own name, job title, phone (auto-formatted as 016-331 3607), company, address, a profile photo (shown in a circle, with zoom and reposition) and up to three extra images. The card is saved in that person's own **browser data (localStorage)** on their phone and never sent anywhere.

**Share PDF to WhatsApp** and **Download PDF** build a one-page A4 landscape vector PDF in the browser (`site/pdf.js`, jsPDF in `site/vendor/`), with that advisor's own name card on it. On phones the share sheet sends the PDF file; on desktop the PDF is downloaded and WhatsApp Web opens so it can be attached. **Print** uses a matching one-page print layout.

Change the sample details everyone starts with in `site/data/card.json`.

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

Extra images: besides the circular profile photo, the card has three more image slots (company logo plus two others). They show beside the details on the page and are drawn on the PDF (up to 11 mm tall). They are saved in the browser with the rest of the card.

**Image for WhatsApp Catalogue** exports the same sheet as one high-resolution picture (4200 x 2970 px, PNG; JPEG 95% only if the PNG would be over ~4.8 MB) so it stays sharp when a customer zooms in. It is drawn by `site/canvasdoc.js`, a small canvas stand-in for jsPDF, so the layout is identical to the PDF.

**WhatsApp QR code:** made automatically from the phone number on the card (mobile numbers only; `site/qr.js`, vendored qrcode-generator, MIT). It opens a WhatsApp chat with that number (`https://wa.me/60...`). It is shown on the name card, on the PDF and on the catalogue image, and on the page its size is 1.3 x the profile picture (30% larger); on the generated PDF / image it is 30% bigger again (18.6 mm, the profile picture is 11 mm), and the phone number is drawn 20% larger (15.6 pt).
