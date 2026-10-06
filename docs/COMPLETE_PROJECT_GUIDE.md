# Complete Project Guide — Node Job Digest

## 1. What this project does

This is a standalone Node.js automation. Every day, GitHub Actions starts the app at **12:00 PM India Standard Time**. The app searches Adzuna for recent backend jobs in Hyderabad, Bengaluru, Chennai, Visakhapatnam, and Remote. It scores each result against the skills in Rajesh's resume and emails the five best distinct matches.

Resume skills used for matching: Node.js, Express.js, MongoDB, MySQL, Redis, REST APIs, microservices, WebSockets, JWT, OAuth, RBAC, Sequelize, Mongoose, Jest, Swagger, and OpenAPI.

## 2. Project files

| File | Why it exists |
| --- | --- |
| `src/index.js` | The application: search, score, format, and email jobs. |
| `.github/workflows/daily-job-digest.yml` | GitHub Actions schedule and cloud execution instructions. |
| `.env` | Local secrets. This is private and ignored by Git. |
| `.env.example` | Safe template showing the required environment-variable names. |
| `package.json` | Project metadata, run commands, and dependencies. |
| `package-lock.json` | Exact dependency versions used by `npm ci` in GitHub Actions. |
| `.gitignore` | Prevents `.env` and `node_modules` from being uploaded to GitHub. |
| `README.md` | Short installation and deployment guide. |

## 3. Before running

Install Node.js 20 or newer, then create a local secret file:

```powershell
cd C:\Users\rajes\OneDrive\Desktop\node_task\node-job-digest
Copy-Item .env.example .env
npm install
```

Fill in `.env`. Never commit this file or send its values in chat.

```env
ADZUNA_APP_ID=your_real_adzuna_app_id
ADZUNA_APP_KEY=your_real_adzuna_app_key
GMAIL_USER=your-sending-gmail-address@gmail.com
GMAIL_APP_PASSWORD=your_16_character_google_app_password
JOB_EMAIL_TO=rajeshvantapati117@gmail.com
DRY_RUN=false
```

`GMAIL_APP_PASSWORD` is a Google App Password, not the normal Gmail password. Google requires 2-Step Verification before creating one.

## 4. Local commands

| Command | Result |
| --- | --- |
| `npm install` | Installs dependencies for local development. |
| `npm run jobs:daily` | Searches jobs and sends the email. |
| `$env:DRY_RUN='true'; npm run jobs:daily` | Searches and prints the email content without sending. |
| `node --check src/index.js` | Checks JavaScript syntax only. |

## 5. `package.json`, line by line

```json
{
  "name": "node-job-digest",       // npm package/project name
  "version": "1.0.0",               // current project version
  "private": true,                   // prevents accidental npm publishing
  "description": "...",             // short project description
  "main": "src/index.js",           // main JavaScript entry file
  "scripts": {
    "start": "node src/index.js",   // starts the app
    "jobs:daily": "node src/index.js" // named command used locally and by GitHub
  },
  "engines": { "node": ">=20" },  // requires Node.js 20 or newer
  "dependencies": {
    "dotenv": "^16.4.7",            // loads local `.env` variables
    "nodemailer": "^6.10.1"          // sends the Gmail email
  }
}
```

## 6. `src/index.js`, complete explanation

### Lines 1–13: imports and job-search profile

```js
require('dotenv').config();
const nodemailer = require('nodemailer');
const locations = [...];
const searchTerms = [...];
const recipient = ...;
const sleep = ...;
const skillKeywords = [...];
```

- `dotenv.config()` loads `.env` locally. In GitHub Actions, environment variables come from repository Secrets instead.
- `require('nodemailer')` imports the email library.
- `locations` is the list of target places. Add/remove a city here.
- `searchTerms` makes two searches per location: one technology search (`Node.js`) and one role search (`Backend Software Engineer`). Adzuna treats `OR` as ordinary text, so separate searches are more reliable.
- `recipient` reads `JOB_EMAIL_TO`; the fallback is your Gmail address if the variable is absent.
- `sleep` creates a Promise that waits for the supplied milliseconds. It avoids Adzuna free-tier burst-rate limits.
- `skillKeywords` is the resume-skill dictionary. It controls relevance scoring.

### Lines 15–18: required configuration

```js
const required = (name) => {
  if (!process.env[name]) throw new Error(...);
  return process.env[name];
};
```

This helper reads one environment variable. If it is missing, it stops with a clear message rather than attempting a request with empty credentials.

### Lines 20–27: text cleaning and HTML protection

```js
const plainText = (value = '') => String(value) ...;
const escapeHtml = (value = '') => plainText(value).replace(...);
```

- `plainText` converts Adzuna job HTML to readable text: it removes tags, converts common entities, collapses spaces, and trims the result.
- `escapeHtml` first cleans text, then converts special characters such as `<`, `>`, `&`, quotes, and apostrophes to safe HTML entities. This prevents job descriptions from breaking the email HTML.

### Lines 29–35: requirements summary

```js
function requirements(description) { ... }
```

1. Converts the job description into plain text.
2. Splits it into sentences.
3. Keeps up to three sentences containing useful requirement words such as `experience`, `Node.js`, `API`, `SQL`, `MongoDB`, or `degree`.
4. If none match, uses the first two sentences.
5. If there is no usable text, returns a safe fallback message.

### Lines 37–60: Adzuna search

```js
async function search(location, searchTerm) { ... }
```

- `async` allows the function to wait for the network response.
- `new URL(...)` creates the Adzuna India API endpoint.
- `URLSearchParams` safely creates the query string:
  - `app_id` and `app_key` are the Adzuna credentials.
  - `what` is either `Node.js` or `Backend Software Engineer`.
  - `where` is the current city/Remote item.
  - `results_per_page: '50'` asks for enough listings to select the best five.
  - `max_days_old: '14'` excludes older listings.
  - `sort_by: 'date'` prefers new listings.
- `fetch` sends the request and requests JSON.
- HTTP `429` means rate limited. The code reads Adzuna's `retry-after` header, waits up to ten seconds, and retries once.
- Any other unsuccessful HTTP response throws an error containing the location and status code.
- `response.json()` reads the returned data. `results = []` means an empty list is safe if Adzuna omits the field.
- The last line adds `searchLocation` and `searchTerm` to every result; those fields help explain and display the listing later.

### Lines 62–86: matching, filtering, ranking, and selecting five jobs

```js
function selectJobs(results) { ... }
```

- `seen = new Set()` remembers application URLs already included, preventing duplicates returned by two searches.
- `skillScore(job)` is the ranking algorithm:
  - Combines title and description into lowercase searchable text.
  - Counts how many `skillKeywords` occur.
  - Gives 15 points for each matched skill.
  - Adds 80 points when the title itself says Node.js.
  - Adds 25 points for titles containing Backend, Software Engineer, or API Developer.
  - Removes 60 points from Java/Spring/SAP/Oracle-led titles unless the title explicitly says Node.js.
- First `filter` rejects incomplete records without title, company, or application URL.
- Second `filter` requires at least two resume-skill matches.
- Third `filter` retains only the first occurrence of an application URL.
- `sort` orders by score descending; if scores tie, the newer listing comes first.
- `slice(0, 5)` returns at most five jobs.

### Lines 88–96: email construction

```js
function composeEmail(jobs) { ... }
```

- `Intl.DateTimeFormat` formats today's date in Indian English using the `Asia/Kolkata` timezone.
- `text` creates a plain-text email version for email clients that cannot render HTML.
- `rows` creates one safe HTML table row per job, with title, company, location, requirement summary, and Apply link.
- The returned object has `subject`, `text`, and `html`. Nodemailer uses all three when it sends the message.

### Lines 98–121: main program and email delivery

```js
async function main() { ... }
main().catch((error) => { ... });
```

1. Creates an empty `results` list.
2. Loops through each location, then each of the two search terms.
3. Adds each API response to `results` using the spread operator (`...`).
4. Waits one second after every request to avoid rate-limit bursts.
5. Calls `selectJobs` to keep the five best resume-matched listings.
6. Throws an error if there are no matches; this makes a GitHub Actions failure visible rather than silently sending an empty email.
7. Calls `composeEmail`.
8. When `DRY_RUN === 'true'`, prints the plain-text digest and stops before SMTP is used.
9. Otherwise, reads `GMAIL_USER`, creates a Gmail SMTP transport, reads `GMAIL_APP_PASSWORD`, then calls `sendMail`.
10. The final `console.log` gives a successful terminal/Actions message.
11. `.catch(...)` prints errors and sets exit code `1`, so GitHub Actions marks a failed run correctly.

## 7. GitHub Actions workflow, line by line

```yaml
name: Daily Node.js job digest
```

The visible name in the GitHub Actions tab.

```yaml
on:
  schedule:
    - cron: '30 6 * * *'
  workflow_dispatch:
```

- The cron expression means **06:30 UTC every day**, which is **12:00 PM IST**.
- `workflow_dispatch` adds the **Run workflow** button for manual tests.

```yaml
permissions:
  contents: read
```

The workflow may read repository files but has no unnecessary write permissions.

```yaml
jobs:
  send-digest:
    runs-on: ubuntu-latest
```

Creates one job on a GitHub-hosted Ubuntu machine.

```yaml
steps:
  - uses: actions/checkout@v4
```

Downloads this repository into the temporary GitHub runner.

```yaml
  - uses: actions/setup-node@v4
    with:
      node-version: 20
      cache: npm
```

Installs Node.js 20 and caches downloaded npm packages to make future runs faster.

```yaml
  - run: npm ci
```

Installs exactly the dependency versions in `package-lock.json`.

```yaml
  - run: npm run jobs:daily
    env:
      ADZUNA_APP_ID: ${{ secrets.ADZUNA_APP_ID }}
      ADZUNA_APP_KEY: ${{ secrets.ADZUNA_APP_KEY }}
      GMAIL_USER: ${{ secrets.GMAIL_USER }}
      GMAIL_APP_PASSWORD: ${{ secrets.GMAIL_APP_PASSWORD }}
      JOB_EMAIL_TO: rajeshvantapati117@gmail.com
```

Runs the program and gives it secrets safely. GitHub masks Secret values in logs. `JOB_EMAIL_TO` is not secret and is written directly in the workflow. Add the first four Secret names in **Repository → Settings → Secrets and variables → Actions**.

## 8. Testing checklist

1. Local search only: set `DRY_RUN=true`, then run `npm run jobs:daily`.
2. Local email: remove/disable `DRY_RUN`, then run `npm run jobs:daily` and check Inbox and Spam.
3. Cloud email: add all four GitHub Secrets.
4. GitHub test: **Actions → Daily Node.js job digest → Run workflow**.
5. A green check and received email confirm successful deployment.

## 9. Troubleshooting

| Message | Meaning | Fix |
| --- | --- | --- |
| `Missing ADZUNA_APP_ID` | A local `.env` entry or GitHub Secret is missing. | Add the named variable/Secret. |
| `401` from Adzuna | Adzuna credentials are invalid. | Copy the App ID and App Key again from Adzuna. |
| `429` from Adzuna | Temporary request rate limit. | The app waits and retries; run again later if it continues. |
| `No matching jobs` | No job passed the resume-skill threshold. | Adjust `searchTerms`, `locations`, or `skillKeywords`. |
| Gmail authentication error | Gmail App Password is missing/incorrect. | Enable 2-Step Verification and create a new App Password. |
| GitHub log shows blank secrets | Local `.env` is not available in Actions. | Add all four values as repository Secrets. |

## 10. Safe customization

- Add a city: edit `locations` in `src/index.js`.
- Add a resume skill: add a lowercase word/phrase to `skillKeywords`.
- Change search roles: edit `searchTerms`.
- Change number of emailed jobs: replace `.slice(0, 5)`.
- Change schedule: edit the cron value in `.github/workflows/daily-job-digest.yml`. Remember that GitHub cron uses UTC.

Do not commit `.env`, API keys, Gmail App Passwords, or other secrets.
