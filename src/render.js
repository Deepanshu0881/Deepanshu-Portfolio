// Server-side rendering of the public portfolio. Everything user-controlled is escaped here.
import { icon, socialIcon, SOCIALS, ACHIEVEMENT_ICONS } from '../public/js/icons.js';
import { SECTION_KEYS } from './schema.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s = '') => String(s).replace(/[&<>"']/g, ch => ESC[ch]);
const safeUrl = (u = '') => (/^(https?:\/\/|mailto:|\/(?!\/))/i.test(String(u).trim()) ? String(u).trim() : '');
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtMonth = m => (m ? `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : '');

function duration(start, end) {
  if (!start) return '';
  const [y1, m1] = start.split('-').map(Number);
  const now = new Date();
  const [y2, m2] = end ? end.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const total = (y2 - y1) * 12 + (m2 - m1) + 1;
  if (total <= 0) return '';
  const y = Math.floor(total / 12), m = total % 12;
  return [y && `${y} yr${y > 1 ? 's' : ''}`, m && `${m} mo${m > 1 ? 's' : ''}`].filter(Boolean).join(' ');
}

/** Minimal inline markdown: **bold**, `code`, [text](url). Input is escaped first. */
function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, raw) => {
      const href = safeUrl(raw.replace(/&amp;/g, '&'));
      return href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${label}</a>` : label;
    });
}
const prose = text => (text || '').split(/\n{2,}/).filter(Boolean)
  .map(p => `<p>${inline(p).replace(/\n/g, '<br>')}</p>`).join('');
const plain = text => (text || '').replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

export const initials = name => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
export const handleOf = p => p.handle || (p.name || 'dev').split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'dev';
const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ext = (href, cls = '', label = '') => `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener"${label ? ` aria-label="${esc(label)}"` : ''}>`;

export function publicContent(c) {
  const visible = list => list.filter(item => item.visible !== false);
  return {
    ...c,
    technologies: visible(c.technologies),
    experience: visible(c.experience),
    projects: visible(c.projects),
    achievements: visible(c.achievements),
  };
}

function activeSections(c) {
  const hasContent = {
    about: Boolean(c.profile.bio), stack: c.technologies.length, experience: c.experience.length,
    projects: c.projects.length, achievements: c.achievements.length, contact: true,
  };
  return SECTION_KEYS.filter(key => c.site.sections[key].visible && hasContent[key]);
}

/** Readable text color (near-black or white) for a given accent background. */
export function inkFor(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? '#0a0a0b' : '#ffffff';
}

/* --------------------------------- sections --------------------------------- */

function sectionHead(c, key, number) {
  const sec = c.site.sections[key];
  return `<header class="section-head reveal">
      <p class="kicker"><span>${number}</span><span class="kicker-rule"></span>${key}</p>
      <h2>${esc(sec.title)}</h2>
      ${sec.subtitle ? `<p class="section-sub">${esc(sec.subtitle)}</p>` : ''}
    </header>`;
}

function socialLinks(p, { labels = false } = {}) {
  const items = p.socials.filter(s => safeUrl(s.url)).map(s => {
    const label = SOCIALS[s.platform]?.label || 'Link';
    return `<li>${ext(s.url, 'social', labels ? '' : label)}${socialIcon(s.platform)}${labels ? `<span>${esc(label)}</span>${icon('arrowUpRight', 'social-arrow')}` : ''}</a></li>`;
  });
  if (isEmail(p.email)) {
    items.push(`<li><a class="social" href="mailto:${esc(p.email)}"${labels ? '' : ' aria-label="Email"'}>${icon('mail')}${labels ? `<span>Email</span>${icon('arrowUpRight', 'social-arrow')}` : ''}</a></li>`);
  }
  return items.length ? `<ul class="socials${labels ? ' socials-list' : ''}">${items.join('')}</ul>` : '';
}

function hero(c) {
  const p = c.profile;
  const photo = p.photo
    ? `<img src="${esc(p.photo)}" alt="Portrait of ${esc(p.name)}" style="object-position:50% ${p.photoFocus}%" width="440" height="520" fetchpriority="high">`
    : `<div class="portrait-initials" aria-hidden="true">${esc(initials(p.name))}</div>`;
  const firstRole = p.roles[0] || '';
  return `<section class="hero container" id="home" aria-label="Introduction">
    <div class="hero-text">
      ${p.available && p.availability ? `<p class="status reveal"><span class="pulse" aria-hidden="true"></span>${esc(p.availability)}</p>` : ''}
      <h1 class="hero-title reveal"><span class="hero-greeting">${esc(p.greeting)}</span> <span class="hero-name">${esc(p.name)}</span></h1>
      ${firstRole ? `<p class="hero-role reveal"><span class="prompt" aria-hidden="true">&gt;</span> <span class="typed" data-roles="${esc(JSON.stringify(p.roles))}">${esc(firstRole)}</span><span class="cursor" aria-hidden="true"></span></p>` : ''}
      ${p.headline ? `<p class="hero-headline reveal">${esc(p.headline)}</p>` : ''}
      <div class="hero-cta reveal">
        ${c.projects.length ? `<a class="btn btn-primary" href="#projects">View my work ${icon('arrowRight')}</a>` : ''}
        ${safeUrl(p.resume) ? `<a class="btn" href="${esc(p.resume)}" download="${esc(slugify(p.name))}-resume.pdf">Résumé ${icon('download')}</a>` : ''}
        ${c.site.sections.contact.visible ? `<a class="btn btn-ghost" href="#contact">Get in touch</a>` : ''}
      </div>
      <div class="hero-meta reveal">
        ${p.location ? `<span>${icon('mapPin')}${esc(p.location)}</span>` : ''}
        ${p.timezone ? `<span>${icon('clock')}<time data-localtime data-tz="${esc(p.timezone)}">--:--</time>&nbsp;local time</span>` : ''}
      </div>
      <div class="reveal">${socialLinks(p)}</div>
    </div>
    <div class="hero-visual reveal">
      <div class="portrait">
        <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
        <div class="portrait-frame">${photo}</div>
        ${p.yearsExperience ? `<div class="portrait-badge"><strong>${p.yearsExperience}+</strong><span>years<br>shipping code</span></div>` : ''}
      </div>
    </div>
  </section>`;
}

function codeCard(c) {
  const p = c.profile;
  const k = s => `<span class="t-key">${esc(s)}</span>`;
  const str = s => `<span class="t-str">"${esc(s)}"</span>`;
  const top = [...c.technologies].sort((a, b) => b.level - a.level).slice(0, 4).map(t => t.name);
  const stack = [];
  for (let i = 0; i < top.length; i += 2) stack.push(`    ${top.slice(i, i + 2).map(str).join(', ')},`);
  const lines = [
    `<span class="t-com">// ${esc(handleOf(p))}.ts</span>`,
    `<span class="t-kw">const</span> <span class="t-var">developer</span> <span class="t-op">=</span> {`,
    `  ${k('name')}: ${str(p.name)},`,
    p.roles[0] ? `  ${k('role')}: ${str(p.roles[0])},` : null,
    p.location ? `  ${k('location')}: ${str(p.location)},` : null,
    p.yearsExperience ? `  ${k('experience')}: ${str(`${p.yearsExperience}+ years`)},` : null,
    ...(stack.length ? [`  ${k('stack')}: [`, ...stack, '  ],'] : []),
    `  ${k('available')}: <span class="t-bool">${p.available}</span>,`,
    '};',
    ' ',
    `<span class="t-kw">export default</span> <span class="t-var">developer</span>;`,
  ].filter(line => line !== null);
  return `<figure class="code-card reveal">
      <figcaption class="code-head">
        <span class="code-tab">${icon('code')}${esc(handleOf(p))}.ts</span>
        <button class="code-run" type="button" data-action="run-code" aria-label="Run this code">${icon('play')}Run</button>
      </figcaption>
      <pre><code>${lines.map(l => `<span class="line">${l}</span>`).join('')}</code></pre>
      <div class="code-output" aria-live="polite" hidden></div>
    </figure>`;
}

function about(c, n) {
  const p = c.profile;
  const stats = [
    p.yearsExperience && { value: p.yearsExperience, suffix: '+', label: 'Years of experience' },
    c.projects.length && { value: c.projects.length, label: 'Projects built' },
    c.technologies.length && { value: c.technologies.length, label: 'Technologies' },
    c.achievements.length && { value: c.achievements.length, label: 'Achievements' },
  ].filter(Boolean);
  return `<section class="section container" id="about">
    ${sectionHead(c, 'about', n)}
    <div class="about-grid">
      <div class="prose about-bio reveal">${prose(p.bio)}</div>
      ${codeCard(c)}
    </div>
    ${stats.length ? `<dl class="stats reveal">${stats.map(s => `<div class="stat"><dt>${esc(s.label)}</dt><dd><span data-count="${s.value}">${s.value}</span>${s.suffix || ''}</dd></div>`).join('')}</dl>` : ''}
  </section>`;
}

function stack(c, n) {
  const categories = [...new Set(c.technologies.map(t => t.category || 'Other'))];
  const chips = categories.length > 1
    ? `<div class="chips reveal" role="group" aria-label="Filter technologies" data-filter-group="stack">
        <button class="chip is-active" type="button" data-filter="*" aria-pressed="true">All <span>${c.technologies.length}</span></button>
        ${categories.map(cat => `<button class="chip" type="button" data-filter="${esc(cat)}" aria-pressed="false">${esc(cat)} <span>${c.technologies.filter(t => (t.category || 'Other') === cat).length}</span></button>`).join('')}
      </div>` : '';
  const tiles = c.technologies.map(t => {
    const slug = (t.icon || '').trim();
    const levels = t.level ? `<span class="tech-level" title="Proficiency ${t.level}/5" aria-label="Proficiency ${t.level} out of 5">${[1, 2, 3, 4, 5].map(i => `<i${i <= t.level ? ' class="on"' : ''}></i>`).join('')}</span>` : '';
    return `<li class="tech card reveal" data-filter-item="${esc(t.category || 'Other')}">
        <span class="tech-icon"${slug ? ` data-icon="${esc(slug)}"` : ''}><span class="tech-mono">${esc(t.name.replace(/[^A-Za-z0-9+#]/g, '').slice(0, 2) || '?')}</span></span>
        <span class="tech-body"><span class="tech-name">${esc(t.name)}</span><span class="tech-cat">${esc(t.category)}</span></span>
        ${levels}
      </li>`;
  }).join('');
  return `<section class="section container" id="stack">
    ${sectionHead(c, 'stack', n)}
    ${chips}
    <ul class="tech-grid" data-filter-target="stack">${tiles}</ul>
  </section>`;
}

function experience(c, n) {
  const items = c.experience.map(e => {
    const company = e.company ? (safeUrl(e.url) ? `${ext(e.url)}${esc(e.company)}</a>` : esc(e.company)) : '';
    const range = [fmtMonth(e.start), e.current ? 'Present' : fmtMonth(e.end)].filter(Boolean).join(' — ');
    const len = duration(e.start, e.current ? '' : e.end);
    return `<li class="tl-item reveal">
        <div class="tl-when"><span>${esc(range)}</span>${len ? `<small>${esc(len)}</small>` : ''}</div>
        <div class="tl-body">
          <h3>${esc(e.role)}${company ? ` <span class="tl-at">@ ${company}</span>` : ''}</h3>
          ${e.location ? `<p class="tl-loc">${icon('mapPin')}${esc(e.location)}</p>` : ''}
          ${e.description ? `<div class="prose">${prose(e.description)}</div>` : ''}
          ${e.tags.length ? `<ul class="tags">${e.tags.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        </div>
      </li>`;
  }).join('');
  return `<section class="section container" id="experience">
    ${sectionHead(c, 'experience', n)}
    <ol class="timeline">${items}</ol>
  </section>`;
}

function projectLinks(pr) {
  return [
    safeUrl(pr.repoUrl) && `${ext(pr.repoUrl, 'icon-link', `Source code for ${pr.title}`)}${socialIcon('github')}</a>`,
    safeUrl(pr.liveUrl) && `${ext(pr.liveUrl, 'icon-link', `Live demo of ${pr.title}`)}${icon('external')}</a>`,
  ].filter(Boolean).join('');
}

function cover(pr) {
  return `<div class="cover" aria-hidden="true">
      <div class="cover-bar"><i></i><i></i><i></i><span>~/projects/${esc(slugify(pr.title))}</span></div>
      <div class="cover-body">
        <span class="cover-title">${esc(pr.title)}</span>
        <span class="cover-lines"><i style="width:64%"></i><i style="width:86%"></i><i style="width:42%"></i><i style="width:72%"></i></span>
      </div>
    </div>`;
}

function projects(c, n) {
  const counts = new Map();
  for (const pr of c.projects) for (const t of pr.tags) counts.set(t, (counts.get(t) || 0) + 1);
  const topTags = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  const chips = topTags.length > 1
    ? `<div class="chips reveal" role="group" aria-label="Filter projects" data-filter-group="projects">
        <button class="chip is-active" type="button" data-filter="*" aria-pressed="true">All <span>${c.projects.length}</span></button>
        ${topTags.map(t => `<button class="chip" type="button" data-filter="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join('')}
      </div>` : '';
  const tagData = pr => esc(pr.tags.join('|'));
  const tagList = pr => (pr.tags.length ? `<ul class="tags">${pr.tags.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '');

  const featured = c.projects.filter(p => p.featured).map(pr => {
    const href = safeUrl(pr.liveUrl) || safeUrl(pr.repoUrl);
    const media = pr.image ? `<img src="${esc(pr.image)}" alt="Screenshot of ${esc(pr.title)}" loading="lazy">` : cover(pr);
    return `<article class="feature card reveal" data-filter-item="${tagData(pr)}">
        ${href ? `${ext(href, 'feature-media', pr.title)}${media}</a>` : `<div class="feature-media">${media}</div>`}
        <div class="feature-body">
          <p class="feature-kicker">Featured${pr.year ? ` · ${esc(pr.year)}` : ''}</p>
          <h3>${esc(pr.title)}</h3>
          <div class="prose">${prose(pr.description)}</div>
          ${pr.highlights.length ? `<ul class="highlights">${pr.highlights.map(h => `<li>${inline(h)}</li>`).join('')}</ul>` : ''}
          ${tagList(pr)}
          <div class="feature-links">
            ${safeUrl(pr.liveUrl) ? `${ext(pr.liveUrl, 'btn btn-sm btn-primary')}Live demo ${icon('arrowUpRight')}</a>` : ''}
            ${safeUrl(pr.repoUrl) ? `${ext(pr.repoUrl, 'btn btn-sm')}${socialIcon('github')} Source</a>` : ''}
          </div>
        </div>
      </article>`;
  }).join('');

  const others = c.projects.filter(p => !p.featured).map(pr => `<article class="project card reveal" data-filter-item="${tagData(pr)}">
        <div class="project-top">${icon('folder', 'project-folder')}<div class="project-links">${projectLinks(pr)}</div></div>
        <h3>${safeUrl(pr.liveUrl) || safeUrl(pr.repoUrl) ? `${ext(safeUrl(pr.liveUrl) || pr.repoUrl, 'stretched')}${esc(pr.title)}</a>` : esc(pr.title)}</h3>
        <div class="prose project-desc">${prose(pr.description)}</div>
        <div class="project-foot">${tagList(pr)}${pr.year ? `<span class="project-year">${esc(pr.year)}</span>` : ''}</div>
      </article>`).join('');

  return `<section class="section container" id="projects">
    ${sectionHead(c, 'projects', n)}
    ${chips}
    <div data-filter-target="projects">
      ${featured ? `<div class="features">${featured}</div>` : ''}
      ${others ? `<div class="project-grid">${others}</div>` : ''}
      <p class="empty-filter" hidden>No projects match this filter.</p>
    </div>
  </section>`;
}

function achievements(c, n) {
  const items = c.achievements.map(a => {
    const meta = ACHIEVEMENT_ICONS[a.type] || ACHIEVEMENT_ICONS.award;
    return `<li class="ach card reveal">
        <span class="ach-icon">${icon(meta.icon)}</span>
        <div class="ach-body">
          <p class="ach-meta">${esc(meta.label)}${a.date ? ` · ${esc(fmtMonth(a.date))}` : ''}</p>
          <h3>${esc(a.title)}</h3>
          ${a.issuer ? `<p class="ach-issuer">${esc(a.issuer)}</p>` : ''}
          ${a.description ? `<div class="prose">${prose(a.description)}</div>` : ''}
          ${safeUrl(a.url) ? `${ext(a.url, 'link-arrow')}${a.type === 'certification' ? 'View credential' : 'Learn more'} ${icon('arrowUpRight')}</a>` : ''}
        </div>
      </li>`;
  }).join('');
  return `<section class="section container" id="achievements">
    ${sectionHead(c, 'achievements', n)}
    <ul class="ach-grid">${items}</ul>
  </section>`;
}

function contact(c, n) {
  const p = c.profile;
  return `<section class="section container" id="contact">
    ${sectionHead(c, 'contact', n)}
    <div class="contact-grid">
      <div class="contact-info reveal">
        ${isEmail(p.email) ? `<button class="email-copy" type="button" data-copy="${esc(p.email)}" aria-label="Copy email address">
            <span class="email-label">Email me at</span>
            <span class="email-value">${esc(p.email)}</span>
            <span class="email-hint">${icon('copy')}<span>Click to copy</span></span>
          </button>` : ''}
        ${socialLinks({ ...p, email: '' }, { labels: true })}
      </div>
      <form class="contact-form card reveal" action="/api/contact" method="post" novalidate>
        <div class="field-row">
          <label class="field"><span>Name</span><input name="name" autocomplete="name" required maxlength="100" placeholder="Jane Doe"></label>
          <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required maxlength="160" placeholder="jane@company.com"></label>
        </div>
        <label class="field"><span>Message</span><textarea name="message" rows="5" required maxlength="5000" placeholder="Hi! I'd love to talk about…"></textarea></label>
        <label class="hp" aria-hidden="true">Company<input name="company" tabindex="-1" autocomplete="off"></label>
        <div class="form-foot">
          <p class="form-status" role="status" aria-live="polite"></p>
          <button class="btn btn-primary" type="submit">Send message ${icon('send')}</button>
        </div>
      </form>
    </div>
  </section>`;
}

const RENDERERS = { about, stack, experience, projects, achievements, contact };

/* ----------------------------------- page ----------------------------------- */

function clientData(c, sections) {
  const p = c.profile;
  return {
    name: p.name, handle: handleOf(p), roles: p.roles, headline: p.headline, bio: plain(p.bio),
    email: isEmail(p.email) ? p.email : '', location: p.location, timezone: p.timezone,
    available: p.available, resume: safeUrl(p.resume),
    socials: p.socials.filter(s => safeUrl(s.url)).map(s => ({ platform: s.platform, label: SOCIALS[s.platform]?.label || 'Link', url: s.url })),
    sections: sections.map(key => ({ key, title: c.site.sections[key].title })),
    technologies: c.technologies.map(t => ({ name: t.name, category: t.category, level: t.level })),
    experience: c.experience.map(e => ({ role: e.role, company: e.company, range: [fmtMonth(e.start), e.current ? 'Present' : fmtMonth(e.end)].filter(Boolean).join(' — ') })),
    projects: c.projects.map(pr => ({ title: pr.title, description: plain(pr.description), tags: pr.tags, url: safeUrl(pr.liveUrl) || safeUrl(pr.repoUrl), year: pr.year })),
    achievements: c.achievements.map(a => ({ title: a.title, issuer: a.issuer, date: fmtMonth(a.date), type: a.type })),
    terminal: c.site.terminal,
  };
}

const jsonForScript = data => JSON.stringify(data).replace(/</g, '\\u003c');

export function renderPage(raw, { nonce, version, origin }) {
  const c = publicContent(raw);
  const p = c.profile, s = c.site;
  const sections = activeSections(c);
  const number = key => String(sections.indexOf(key) + 1).padStart(2, '0');
  const absPhoto = p.photo ? new URL(p.photo, origin).href : '';
  const description = s.description || p.headline;
  const person = {
    '@context': 'https://schema.org', '@type': 'Person', name: p.name, url: origin,
    jobTitle: p.roles[0] || undefined, description: p.headline || undefined, image: absPhoto || undefined,
    email: isEmail(p.email) ? `mailto:${p.email}` : undefined,
    address: p.location ? { '@type': 'PostalAddress', addressLocality: p.location } : undefined,
    sameAs: p.socials.map(x => x.url).filter(safeUrl),
    knowsAbout: c.technologies.map(t => t.name),
  };
  const navLinks = sections.map(key => `<a href="#${key}" data-nav="${key}">${key}</a>`).join('');

  return `<!doctype html>
<html lang="en" data-theme="${s.theme === 'light' ? 'light' : 'dark'}" data-default-theme="${s.theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(s.title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="author" content="${esc(p.name)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(s.title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(origin)}">
${absPhoto ? `<meta property="og:image" content="${esc(absPhoto)}">` : ''}
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#09090b">
<link rel="canonical" href="${esc(origin)}/">
<link rel="icon" href="/favicon.svg?v=${version}" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/css/site.css?v=${version}">
<style>:root{--accent:${s.accent};--accent-ink:${inkFor(s.accent)}}</style>
<script nonce="${nonce}">(()=>{const d=document.documentElement;let t;try{t=localStorage.getItem('theme')}catch(e){}if(t!=='light'&&t!=='dark'){t=d.dataset.defaultTheme;if(t==='system')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}d.dataset.theme=t;d.classList.add('js')})()</script>
<script type="application/ld+json" nonce="${nonce}">${jsonForScript(person)}</script>
</head>
<body>
<div class="progress" aria-hidden="true"></div>
<a class="skip-link" href="#main">Skip to content</a>
<header class="nav">
  <div class="container nav-inner">
    <a class="logo" href="#home" aria-label="${esc(p.name)} — home"><span class="logo-tilde">~/</span>${esc(handleOf(p))}<span class="logo-caret" aria-hidden="true"></span></a>
    <nav class="nav-links" id="nav-links" aria-label="Primary">${navLinks}</nav>
    <div class="nav-actions">
      <button class="kbd-btn" type="button" data-action="palette" aria-label="Open command palette"><span class="kbd-mod">Ctrl</span><span>K</span></button>
      ${s.terminal ? `<button class="icon-btn" type="button" data-action="terminal" aria-label="Open terminal" title="Terminal ( \` )">${icon('terminal')}</button>` : ''}
      <button class="icon-btn theme-toggle" type="button" data-action="theme" aria-label="Toggle color theme">${icon('sun', 'when-dark')}${icon('moon', 'when-light')}</button>
      <button class="icon-btn menu-btn" type="button" data-action="menu" aria-label="Open menu" aria-expanded="false" aria-controls="nav-links">${icon('menu')}</button>
    </div>
  </div>
</header>
<main id="main">
  ${hero(c)}
  ${sections.map(key => RENDERERS[key](c, number(key))).join('\n')}
</main>
<footer class="footer">
  <div class="container footer-inner">
    <p>© ${new Date().getFullYear()} ${esc(p.name)}${s.footerNote ? ` · ${esc(s.footerNote)}` : ''}</p>
    <p class="footer-hint">Press <kbd class="kbd-mod">Ctrl</kbd><kbd>K</kbd> for commands${s.terminal ? ' · <kbd>`</kbd> for a terminal' : ''}</p>
  </div>
</footer>

<div class="overlay palette" id="palette" hidden>
  <div class="palette-box" role="dialog" aria-modal="true" aria-label="Command palette">
    <label class="palette-search">${icon('search')}<input type="text" placeholder="Type a command or search…" aria-label="Search commands" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="palette-list"><kbd>esc</kbd></label>
    <ul class="palette-list" id="palette-list" role="listbox"></ul>
  </div>
</div>
${s.terminal ? `<div class="overlay term" id="terminal" hidden>
  <div class="term-window" role="dialog" aria-modal="true" aria-label="Interactive terminal">
    <div class="term-bar"><span>${icon('terminal')} guest@${esc(handleOf(p))}: ~</span><button class="icon-btn" type="button" data-action="terminal-close" aria-label="Close terminal">${icon('x')}</button></div>
    <div class="term-body" id="term-body" aria-live="polite"></div>
    <form class="term-input"><label for="term-input" class="term-prompt">guest@${esc(handleOf(p))}:~$</label><input id="term-input" autocomplete="off" autocapitalize="off" spellcheck="false"></form>
  </div>
</div>` : ''}
<div class="toast" role="status" aria-live="polite"></div>
<script id="site-data" type="application/json">${jsonForScript(clientData(c, sections))}</script>
<script type="module" src="/js/site.js?v=${version}"></script>
</body>
</html>`;
}

export function renderFavicon(raw) {
  const { profile, site } = raw;
  const letters = esc(initials(profile.name).slice(0, 2));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#09090b"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="28" font-weight="700" fill="${site.accent}">${letters}</text></svg>`;
}

export function renderNotFound(raw, { version, nonce }) {
  const p = raw.profile;
  return `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>404 — Not found</title><meta name="robots" content="noindex">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600&family=Geist+Mono&display=swap">
<link rel="stylesheet" href="/css/site.css?v=${version}"><style>:root{--accent:${raw.site.accent};--accent-ink:${inkFor(raw.site.accent)}}</style></head>
<body><main class="not-found container"><pre class="nf-term"><span class="t-com">guest@${esc(handleOf(p))}:~$</span> cd ${'<span class="nf-path"></span>'}
bash: cd: No such file or directory
<span class="t-com">guest@${esc(handleOf(p))}:~$</span> <span class="cursor"></span></pre>
<h1>404</h1><p>This page doesn’t exist — but the rest of the portfolio does.</p>
<a class="btn btn-primary" href="/">cd ~ ${icon('arrowRight')}</a></main>
<script nonce="${nonce}">document.querySelector('.nf-path').textContent=location.pathname</script></body></html>`;
}
