require('dotenv').config();

const nodemailer = require('nodemailer');

const locations = ['Hyderabad', 'Bengaluru', 'Chennai', 'Visakhapatnam', 'Remote'];
const recipient = process.env.JOB_EMAIL_TO || 'rajeshvantapati117@gmail.com';
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const required = (name) => {
  if (!process.env[name]) throw new Error(`Missing ${name}. Add it to .env or GitHub Secrets.`);
  return process.env[name];
};

const plainText = (value = '') => String(value)
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/\s+/g, ' ')
  .trim();

const escapeHtml = (value = '') => plainText(value).replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

function requirements(description) {
  const sentences = plainText(description).match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const selected = sentences.filter((sentence) =>
    /require|skill|experience|node(?:\.js)?|javascript|express|api|sql|mongodb|typescript|degree/i.test(sentence),
  ).slice(0, 3);
  return (selected.length ? selected : sentences.slice(0, 2)).join(' ').trim() || 'See the application page for requirements.';
}

async function search(location) {
  const url = new URL('https://api.adzuna.com/v1/api/jobs/in/search/1');
  url.search = new URLSearchParams({
    app_id: required('ADZUNA_APP_ID'),
    app_key: required('ADZUNA_APP_KEY'),
    // Adzuna treats `OR` as literal text, so use the common technology term.
    what: 'Node.js',
    where: location,
    results_per_page: '20',
    max_days_old: '14',
    sort_by: 'date',
  }).toString();
  let response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (response.status === 429) {
    const retryAfterSeconds = Number(response.headers.get('retry-after')) || 3;
    await sleep(Math.min(retryAfterSeconds, 10) * 1000);
    response = await fetch(url, { headers: { Accept: 'application/json' } });
  }
  if (!response.ok) throw new Error(`Adzuna request failed for ${location}: ${response.status}`);
  const { results = [] } = await response.json();
  return results.map((job) => ({ ...job, searchLocation: location }));
}

function selectJobs(results) {
  const seen = new Set();
  return results
    .filter((job) => job.title && job.company?.display_name && job.redirect_url)
    .filter((job) => /node\s*\.?\s*js/i.test(`${job.title} ${plainText(job.description)}`))
    .filter((job) => !seen.has(job.redirect_url) && seen.add(job.redirect_url))
    .sort((a, b) => {
      const score = (job) => {
        const title = job.title.toLowerCase();
        let value = /node\s*\.?\s*js/.test(title) ? 100 : 0;
        if (/developer|engineer|backend/.test(title)) value += 20;
        if (/java|spring|sap|oracle/.test(title) && !/node\s*\.?\s*js/.test(title)) value -= 80;
        return value;
      };
      return score(b) - score(a) || new Date(b.created || 0) - new Date(a.created || 0);
    })
    .slice(0, 5);
}

function composeEmail(jobs) {
  const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeZone: 'Asia/Kolkata' }).format(new Date());
  const text = jobs.map((job, index) => `${index + 1}. ${job.title} — ${job.company.display_name}\nLocation: ${job.location?.display_name || job.searchLocation}\nKey requirements: ${requirements(job.description)}\nApply: ${job.redirect_url}`).join('\n\n');
  const rows = jobs.map((job, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHtml(job.title)}</strong><br>${escapeHtml(job.company.display_name)}<br>${escapeHtml(job.location?.display_name || job.searchLocation)}</td><td>${escapeHtml(requirements(job.description))}</td><td><a href="${escapeHtml(job.redirect_url)}">Apply now</a></td></tr>`).join('');
  return {
    subject: `Daily Node.js jobs — ${date}`,
    text: `Top ${jobs.length} openings for ${date}\n\n${text}`,
    html: `<h2>Daily Node.js jobs</h2><p>Top ${jobs.length} listings found on ${date}.</p><table border="1" cellpadding="10" cellspacing="0"><thead><tr><th>#</th><th>Opening</th><th>Key requirements</th><th>Application</th></tr></thead><tbody>${rows}</tbody></table>`,
  };
}

async function main() {
  const results = [];
  for (const location of locations) {
    results.push(...await search(location));
    // Keep free-tier API requests below burst-rate limits.
    if (location !== locations.at(-1)) await sleep(1000);
  }
  const jobs = selectJobs(results);
  if (!jobs.length) throw new Error('No matching jobs were found today.');
  const email = composeEmail(jobs);
  if (process.env.DRY_RUN === 'true') return console.log(email.text);

  const user = required('GMAIL_USER');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass: required('GMAIL_APP_PASSWORD') },
  });
  await transporter.sendMail({ from: `Node.js Job Digest <${user}>`, to: recipient, ...email });
  console.log(`Sent ${jobs.length} jobs to ${recipient}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
