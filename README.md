# RaraLabs Mock API

A pretend API. It gives back fake but realistic answers, so other people and systems can build against it before the real Sumo Ledger API exists.

## How it works
- **One file = one endpoint.** Each `.json` file in `routes/` describes one address (e.g. `GET /api/v1/invoices/:invoice_number`) and what it replies.
- Opening the home page (`/`) lists every endpoint.
- No code changes are needed to add a route. Just add a JSON file (or ask Claude to).

## Route file format (see `_template.json`)
| Field | Meaning |
|---|---|
| `method` | GET, POST, PUT, PATCH or DELETE |
| `path` | The address. `:something` is a placeholder, e.g. `:invoice_number` |
| `request.required_fields` | Fields that must be in the request body, otherwise the reply is a 400 error |
| `response` | The normal reply: `status` (200 = OK) and `body` |
| `examples` | Special replies for specific inputs, e.g. invoice `INV-0000` → 404 "not found" |
| `{{params.x}}` / `{{query.x}}` / `{{body.x}}` | Copies a value from the request into the reply |

## Deploy to Vercel
Option A (easiest, needs Node.js installed from nodejs.org):
```
cd mock-apis
npx vercel          # first time: log in, accept the defaults
npx vercel --prod   # publish to the live URL
```

Option B (no installs): put this `mock-apis` folder in a GitHub repo, then on vercel.com choose **Add New → Project → Import** and select the repo. Each push redeploys automatically.

## Run on your own computer
```
node dev.js
```
Then open http://localhost:3000
