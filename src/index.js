require('dotenv').config();

const nodemailer = require('nodemailer');

const locations = ['Hyderabad', 'Bengaluru', 'Chennai', 'Visakhapatnam', 'Remote'];
const searchTerms = ['Node.js', 'Backend Software Engineer'];
const recipient = process.env.JOB_EMAIL_TO || 'rajeshvantapati117@gmail.com';
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const skillKeywords = [
  'node.js', 'express', 'mongodb', 'mysql', 'redis', 'rest api', 'microservice',
  'websocket', 'jwt', 'oauth', 'rbac', 'sequelize', 'mongoose', 'jest', 'swagger', 'openapi',
];
const MAX_EXPERIENCE_YEARS = 4;

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

function isWithinExperienceLimit(job) {
  const text = `${job.title} ${plainText(job.description)}`.toLowerCase();
  const ranges = [...text.matchAll(/(\d+)\s*(?:-|–|to)\s*(\d+)\s*(?:years?|yrs?)/g)];
  if (ranges.length) return ranges.some((match) => Number(match[2]) <= MAX_EXPERIENCE_YEARS);

  const plusYears = [...text.matchAll(/(\d+)\s*\+\s*(?:years?|yrs?)/g)];
  if (plusYears.length) return plusYears.some((match) => Number(match[1]) <= MAX_EXPERIENCE_YEARS);

  const exactYears = [...text.matchAll(/(?:experience(?:\s+of)?|minimum|min\.?|at least)?\s*(\d+)\s*(?:years?|yrs?)/g)];
  return exactYears.length > 0 && exactYears.some((match) => Number(match[1]) <= MAX_EXPERIENCE_YEARS);
}

async function search(location, searchTerm) {
  const url = new URL('https://api.adzuna.com/v1/api/jobs/in/search/1');
  url.search = new URLSearchParams({
    app_id: required('ADZUNA_APP_ID'),
    app_key: required('ADZUNA_APP_KEY'),
    what: searchTerm,
    where: location,
    results_per_page: '50',
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
  return results.map((job) => ({ ...job, searchLocation: location, searchTerm }));
}

function selectJobs(results) {
  const seen = new Set();
  const skillScore = (job) => {
    const text = `${job.title} ${plainText(job.description)}`.toLowerCase();
    const title = job.title.toLowerCase();
    const matches = skillKeywords.reduce((total, skill) => total + (text.includes(skill) ? 1 : 0), 0);
    let score = matches * 15;
    if (/node\s*\.?\s*js/.test(title)) score += 80;
    if (/backend|software engineer|api developer/.test(title)) score += 25;
    if (/java|spring|sap|oracle/.test(title) && !/node\s*\.?\s*js/.test(title)) score -= 60;
    return { matches, score };
  };
  return results
    .filter((job) => job.title && job.company?.display_name && job.redirect_url)
    .filter(isWithinExperienceLimit)
    .filter((job) => skillScore(job).matches >= 2)
    .filter((job) => !seen.has(job.redirect_url) && seen.add(job.redirect_url))
    .sort((a, b) => skillScore(b).score - skillScore(a).score || new Date(b.created || 0) - new Date(a.created || 0))
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
    for (const searchTerm of searchTerms) {
      results.push(...await search(location, searchTerm));
      // Keep free-tier API requests below burst-rate limits.
      await sleep(1000);
    }
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
