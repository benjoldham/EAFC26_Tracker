# FC26 Transfer Tracker (local, no-build web app)

New in v6:
- Name placeholders: **New / Player** (and header shows “New Player”)
- Money values in tables are abbreviated: £100K, £1M, etc.
- After Add/Update, the affected row is briefly highlighted
- If you add (or edit to) a **Youth** player, the Seniority filter auto-switches to **Youth**
- Pot (avg) column renamed to **Potential**
- Currency switcher (top-right of Add/Edit): **£ / € / $**
  - Inputs and tables convert using stored FX rates (base GBP)

FX rates used in this build:
- Base: GBP
- EUR: 1 GBP = 1.144446 EUR
- USD: 1 GBP = 1.34518 USD
- Source: exchangerate-api.com (open.er-api.com), last updated Tue, 23 Dec 2025

Run:
```bash
cd fc26-tracker
python -m http.server 5173
```
