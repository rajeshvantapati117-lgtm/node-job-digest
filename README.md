# Node Job Digest

Searches Adzuna every day for **Node.js Developer** or **Node.js Engineer** openings in Hyderabad, Bengaluru, Chennai, Visakhapatnam, and Remote. It emails the five newest distinct jobs, including company, application link, and key requirements.

## Setup

1. Copy `.env.example` to `.env`.
2. Create an Adzuna app and add its ID/key.
3. Enable Google 2-Step Verification and create an App Password for the sending Gmail account.
4. Install and run the project:

```bash
npm install
npm run jobs:daily
```

Set `DRY_RUN=true` to preview the email without sending it.

## GitHub Actions

The workflow runs daily at **12:00 PM IST**. Add these repository secrets before enabling it:

- `ADZUNA_APP_ID`
- `ADZUNA_APP_KEY`
- `GMAIL_USER`
- `GMAIL_APP_PASSWORD`

Use **Actions → Daily Node.js job digest → Run workflow** for a first test. Scheduled GitHub Actions runs may occasionally start a few minutes late.
