import { icon, socialIcon } from './icons.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const data = JSON.parse($('#site-data')?.textContent || '{}');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMac = /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform || navigator.platform || '');
const root = document.documentElement;

/* ------------------------------------------------------------------ helpers */

let toastTimer;
function toast(message) {
  const el = $('.toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function scrollToSection(id) {
  const target = document.getElementById(id);
  if (!target) return false;
  target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  history.replaceState(null, '', `#${id}`);
  return true;
}

const openExternal = url => window.open(url, '_blank', 'noopener');

/* -------------------------------------------------------------------- theme */

function setTheme(theme) {
  root.dataset.theme = theme;
  try { localStorage.setItem('theme', theme); } catch { /* private mode */ }
}

function toggleTheme(event) {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  if (!document.startViewTransition || reduceMotion) return setTheme(next);
  // Circular reveal from the click position.
  const x = event?.clientX ?? innerWidth - 60;
  const y = event?.clientY ?? 30;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  root.classList.add('theme-transition');
  const transition = document.startViewTransition(() => setTheme(next));
  transition.finished.finally(() => root.classList.remove('theme-transition'));
  transition.ready.then(() => {
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 550, easing: 'cubic-bezier(.2,.7,.2,1)', pseudoElement: '::view-transition-new(root)' },
    );
  }).catch(() => {});
}

/* ---------------------------------------------------------------------- nav */

const nav = $('.nav');
const menuBtn = $('[data-action="menu"]');
const setMenu = open => {
  nav.classList.toggle('menu-open', open);
  menuBtn?.setAttribute('aria-expanded', String(open));
};

const onScroll = () => {
  const max = root.scrollHeight - innerHeight;
  root.style.setProperty('--progress', max > 0 ? (scrollY / max).toFixed(4) : '0');
  nav.classList.toggle('is-scrolled', scrollY > 8);
};
addEventListener('scroll', onScroll, { passive: true });
onScroll();

const navLinks = new Map($$('[data-nav]').map(a => [a.dataset.nav, a]));
const spy = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    navLinks.forEach(a => a.classList.remove('is-active'));
    navLinks.get(entry.target.id)?.classList.add('is-active');
  }
}, { rootMargin: '-45% 0px -50% 0px' });
$$('main > section[id]').forEach(section => spy.observe(section));

$$('.kbd-mod').forEach(el => { el.textContent = isMac ? '⌘' : 'Ctrl'; });

/* ------------------------------------------------------------ reveal on scroll */

const revealables = $$('.reveal');
if (!reduceMotion && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('in');
      io.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -6% 0px' });
  for (const el of revealables) {
    const siblings = [...el.parentElement.children].filter(c => c.classList.contains('reveal'));
    el.style.setProperty('--delay', `${Math.min(siblings.indexOf(el), 8) * 60}ms`);
    io.observe(el);
  }
} else {
  revealables.forEach(el => el.classList.add('in'));
}

/* --------------------------------------------------------------- typed roles */

const typed = $('.typed');
if (typed && !reduceMotion) {
  const roles = JSON.parse(typed.dataset.roles || '[]');
  if (roles.length > 1) {
    let index = 0, chars = roles[0].length, deleting = true;
    const tick = () => {
      if (deleting) {
        chars -= 1;
        typed.textContent = roles[index].slice(0, chars);
        if (chars === 0) { deleting = false; index = (index + 1) % roles.length; }
        return setTimeout(tick, 32);
      }
      chars += 1;
      typed.textContent = roles[index].slice(0, chars);
      if (chars === roles[index].length) { deleting = true; return setTimeout(tick, 2400); }
      setTimeout(tick, 65 + Math.random() * 55);
    };
    setTimeout(tick, 2400);
  }
}

/* ---------------------------------------------------------------- local time */

$$('[data-localtime]').forEach(el => {
  try {
    const fmt = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit', timeZone: el.dataset.tz, timeZoneName: 'short' });
    const update = () => { el.textContent = fmt.format(new Date()); };
    update();
    setInterval(update, 15_000);
  } catch {
    el.closest('span')?.remove();
  }
});

/* ----------------------------------------------------------------- count-up */

const counters = $$('[data-count]');
if (!reduceMotion) {
  const io = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      io.unobserve(entry.target);
      const el = entry.target, end = Number(el.dataset.count), start = performance.now();
      const step = now => {
        const p = Math.min(1, (now - start) / 1400);
        el.textContent = Math.round(end * (1 - (1 - p) ** 3));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }, { threshold: 0.6 });
  counters.forEach(el => { el.textContent = '0'; io.observe(el); });
}

/* ------------------------------------------------- brand icons (Simple Icons) */

const iconCache = new Map();
function fetchIcon(slug) {
  if (!iconCache.has(slug)) {
    iconCache.set(slug, fetch(`https://cdn.simpleicons.org/${encodeURIComponent(slug)}`)
      .then(res => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then(svg => {
        const d = svg.match(/<path[^>]*\sd="([^"]+)"/)?.[1];
        if (!d || !/^[\d\s.,a-zA-Z+-]+$/.test(d)) throw new Error('Unexpected icon format');
        return { d, fill: svg.match(/<svg[^>]*\sfill="(#[0-9a-fA-F]{6})"/)?.[1] };
      }));
  }
  return iconCache.get(slug);
}

const luminance = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function upgradeIcons(scope = document) {
  for (const el of $$('[data-icon]', scope)) {
    fetchIcon(el.dataset.icon).then(({ d, fill }) => {
      el.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
      // Use the brand color on hover unless it's too dark/light to read.
      if (fill) { const l = luminance(fill); if (l > 0.08 && l < 0.85) el.style.setProperty('--brand', fill); }
    }).catch(() => { /* keep the fallback monogram */ });
  }
}
upgradeIcons();

/* ------------------------------------------------------------------ filters */

$$('[data-filter-group]').forEach(group => {
  const target = $(`[data-filter-target="${group.dataset.filterGroup}"]`);
  const items = $$('[data-filter-item]', target);
  group.addEventListener('click', event => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    $$('.chip', group).forEach(c => {
      c.classList.toggle('is-active', c === chip);
      c.setAttribute('aria-pressed', String(c === chip));
    });
    const filter = chip.dataset.filter;
    let shown = 0;
    const apply = () => {
      for (const item of items) {
        const match = filter === '*' || item.dataset.filterItem.split('|').includes(filter);
        item.classList.toggle('is-hidden', !match);
        if (match) { shown += 1; item.classList.add('in'); }
      }
      const empty = $('.empty-filter', target);
      if (empty) empty.hidden = shown > 0;
    };
    document.startViewTransition && !reduceMotion ? document.startViewTransition(apply) : apply();
  });
});

/* ----------------------------------------------------------- card spotlight */

document.addEventListener('pointermove', event => {
  const card = event.target.closest?.('.card');
  if (!card) return;
  const rect = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
  card.style.setProperty('--my', `${event.clientY - rect.top}px`);
}, { passive: true });

/* -------------------------------------------------------------- code "run" */

function runCode() {
  const out = $('.code-output');
  if (!out) return;
  out.hidden = false;
  out.replaceChildren();
  const lines = [
    ['t-com', `$ npx tsx ${data.handle}.ts`],
    ['', 'Compiling…'],
    ['ok', `✓ developer loaded in ${Math.round(8 + Math.random() * 20)}ms`],
    ['', `→ ${data.name} is ${data.available ? 'open to new opportunities 🚀' : 'currently heads-down building 🔨'}`],
    data.email ? ['', `→ Say hi at ${data.email}`] : null,
  ].filter(Boolean);
  lines.forEach(([cls, text], i) => setTimeout(() => {
    const line = document.createElement('div');
    line.className = cls;
    line.textContent = text;
    out.append(line);
  }, i * 260));
}

/* ------------------------------------------------------------- contact form */

const form = $('.contact-form');
form?.addEventListener('submit', async event => {
  event.preventDefault();
  const status = $('.form-status', form);
  const button = $('button[type="submit"]', form);
  let invalid = false;
  for (const name of ['name', 'email', 'message']) {
    const el = form.elements[name];
    const value = el.value.trim();
    const bad = !value || (name === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value));
    el.classList.toggle('invalid', bad);
    invalid ||= bad;
  }
  if (invalid) {
    status.className = 'form-status err';
    status.textContent = 'Please fill in every field with a valid email.';
    return;
  }
  button.disabled = true;
  status.className = 'form-status';
  status.textContent = 'Sending…';
  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Something went wrong — please try again.');
    form.reset();
    status.className = 'form-status ok';
    status.textContent = '✓ Message sent — I’ll get back to you soon!';
  } catch (err) {
    status.className = 'form-status err';
    status.textContent = err.message;
  } finally {
    button.disabled = false;
  }
});
if (new URLSearchParams(location.search).get('contact') === 'sent') toast('✓ Message sent — thank you!');

/* ---------------------------------------------------------- overlay helpers */

let lastFocus = null;
function openOverlay(el, focusEl) {
  lastFocus = document.activeElement;
  el.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => focusEl.focus());
}
function closeOverlay(el) {
  el.hidden = true;
  if ($$('.overlay').every(o => o.hidden)) document.body.style.overflow = '';
  lastFocus?.focus?.();
}
$$('.overlay').forEach(el => el.addEventListener('mousedown', event => { if (event.target === el) closeOverlay(el); }));

/* ---------------------------------------------------------- command palette */

const palette = $('#palette');
const paletteInput = $('input', palette);
const paletteList = $('#palette-list');
let paletteItems = [];
let paletteIndex = 0;

function commandList() {
  const sections = [{ key: 'home', title: 'Home' }, ...data.sections];
  return [
    ...sections.map(s => ({ group: 'Navigate', label: s.title, hint: `#${s.key}`, icon: 'arrowRight', run: () => scrollToSection(s.key) })),
    { group: 'Actions', label: 'Toggle light / dark theme', icon: 'sun', run: () => toggleTheme() },
    data.email && { group: 'Actions', label: 'Copy email address', hint: data.email, icon: 'copy', run: () => copyText(data.email).then(ok => ok && toast('Email copied to clipboard ✓')) },
    data.resume && { group: 'Actions', label: 'Download résumé', icon: 'download', run: () => openExternal(data.resume) },
    data.terminal && { group: 'Actions', label: 'Open terminal', hint: '`', icon: 'terminal', run: () => openTerminal() },
    ...data.projects.filter(p => p.url).map(p => ({ group: 'Projects', label: p.title, hint: p.tags.slice(0, 3).join(' · '), icon: 'folder', run: () => openExternal(p.url) })),
    ...data.socials.map(s => ({ group: 'Links', label: s.label, hint: s.url.replace(/^https?:\/\/(www\.)?/, ''), social: s.platform, run: () => openExternal(s.url) })),
  ].filter(Boolean);
}

function renderPalette() {
  const terms = paletteInput.value.toLowerCase().split(/\s+/).filter(Boolean);
  paletteItems = commandList().filter(cmd => {
    const hay = `${cmd.group} ${cmd.label} ${cmd.hint || ''}`.toLowerCase();
    return terms.every(t => hay.includes(t));
  });
  paletteIndex = Math.min(paletteIndex, Math.max(0, paletteItems.length - 1));
  paletteList.replaceChildren();
  if (!paletteItems.length) {
    const li = document.createElement('li');
    li.className = 'palette-empty';
    li.textContent = 'No results. Try “projects” or “theme”.';
    paletteList.append(li);
    return;
  }
  let group = '';
  paletteItems.forEach((cmd, i) => {
    if (cmd.group !== group) {
      group = cmd.group;
      const heading = document.createElement('li');
      heading.className = 'palette-group';
      heading.setAttribute('role', 'presentation');
      heading.textContent = group;
      paletteList.append(heading);
    }
    const li = document.createElement('li');
    li.className = 'palette-item';
    li.id = `cmd-${i}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(i === paletteIndex));
    li.innerHTML = cmd.social ? socialIcon(cmd.social) : icon(cmd.icon);
    const label = document.createElement('span');
    label.textContent = cmd.label;
    li.append(label);
    if (cmd.hint) {
      const hint = document.createElement('small');
      hint.textContent = cmd.hint;
      li.append(hint);
    }
    li.addEventListener('mousemove', () => { if (paletteIndex !== i) { paletteIndex = i; highlightPalette(); } });
    li.addEventListener('click', () => runPalette(i));
    paletteList.append(li);
  });
  upgradeIcons(paletteList);
  paletteInput.setAttribute('aria-activedescendant', `cmd-${paletteIndex}`);
}

function highlightPalette() {
  $$('.palette-item', paletteList).forEach(li => li.setAttribute('aria-selected', String(li.id === `cmd-${paletteIndex}`)));
  $(`#cmd-${paletteIndex}`)?.scrollIntoView({ block: 'nearest' });
  paletteInput.setAttribute('aria-activedescendant', `cmd-${paletteIndex}`);
}

function runPalette(i) {
  const cmd = paletteItems[i];
  if (!cmd) return;
  closeOverlay(palette);
  cmd.run();
}

function openPalette() {
  paletteInput.value = '';
  paletteIndex = 0;
  renderPalette();
  openOverlay(palette, paletteInput);
}

paletteInput.addEventListener('input', () => { paletteIndex = 0; renderPalette(); });
paletteInput.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!paletteItems.length) return;
    paletteIndex = (paletteIndex + (event.key === 'ArrowDown' ? 1 : -1) + paletteItems.length) % paletteItems.length;
    highlightPalette();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    runPalette(paletteIndex);
  }
});

/* ----------------------------------------------------------------- terminal */

const term = $('#terminal');
const termBody = $('#term-body');
const termInput = $('#term-input');
const termHistory = [];
let historyIndex = 0;
let booted = false;

function print(html = '', cls = '') {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.innerHTML = html;
  termBody.append(line);
  termBody.scrollTop = termBody.scrollHeight;
}
const pad = (s, n) => escHtml(s) + ' '.repeat(Math.max(1, n - String(s).length));
const link = (url, label = url) => `<a href="${escHtml(url)}" target="_blank" rel="noopener">${escHtml(label)}</a>`;
const FILES = { 'about.txt': 'about', 'skills.json': 'skills', 'projects/': 'projects', 'experience.log': 'experience', 'achievements.md': 'achievements', 'contact.md': 'contact' };
if (data.resume) FILES['resume.pdf'] = 'resume';

function neofetch() {
  const top = [...data.technologies].sort((a, b) => b.level - a.level).slice(0, 4).map(t => t.name).join(', ');
  const initialsArt = (data.name || '?').split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
  const art = ['   ┌─────────┐ ', `   │  ${initialsArt.padEnd(2)}  _  │ `, '   │  ─────  │ ', '   └─────────┘ ', '               '];
  const info = [
    `<span class="t-accent">${escHtml(data.handle)}</span>@<span class="t-accent">portfolio</span>`,
    '─'.repeat(22),
    `<span class="t-accent">Name</span>     ${escHtml(data.name)}`,
    `<span class="t-accent">Role</span>     ${escHtml(data.roles[0] || 'Developer')}`,
    data.location && `<span class="t-accent">Location</span> ${escHtml(data.location)}`,
    top && `<span class="t-accent">Stack</span>    ${escHtml(top)}`,
    `<span class="t-accent">Projects</span> ${data.projects.length}`,
    `<span class="t-accent">Status</span>   ${data.available ? 'open to opportunities' : 'busy building'}`,
  ].filter(Boolean);
  const rows = Math.max(art.length, info.length);
  for (let i = 0; i < rows; i++) print(`<span class="t-accent">${escHtml(art[i] || ' '.repeat(15))}</span>${info[i] || ''}`);
}

const COMMANDS = {
  help: { desc: 'List available commands', run: () => {
    print('Available commands:', 't-dim');
    for (const [name, cmd] of Object.entries(COMMANDS)) if (!cmd.hidden) print(`  <span class="t-accent">${pad(name, 14)}</span>${escHtml(cmd.desc)}`);
    print('Tip: use ↑/↓ for history and Tab to autocomplete.', 't-dim');
  } },
  whoami: { desc: 'Who is this person?', run: () => print(`${escHtml(data.name)} — ${escHtml(data.roles.join(' · '))}`) },
  neofetch: { desc: 'System information, but make it personal', run: neofetch },
  about: { desc: 'Read a short bio', run: () => print(escHtml(data.bio || data.headline)) },
  skills: { desc: 'Technologies I work with', run: () => {
    const groups = {};
    for (const t of data.technologies) (groups[t.category] ||= []).push(t);
    for (const [cat, list] of Object.entries(groups)) {
      print(`<span class="t-accent">${pad(cat, 16)}</span>${list.map(t => escHtml(t.name)).join(', ')}`);
    }
  } },
  experience: { desc: 'Work history', run: () => data.experience.forEach(e => print(`<span class="t-accent">${pad(e.range, 22)}</span>${escHtml(e.role)} <span class="t-dim">@</span> ${escHtml(e.company)}`)) },
  projects: { desc: 'Things I have built (try: open 1)', run: () => {
    data.projects.forEach((p, i) => print(`<span class="t-accent">[${i + 1}]</span> <span class="t-cmd">${escHtml(p.title)}</span> <span class="t-dim">— ${escHtml(p.description.slice(0, 90))}${p.description.length > 90 ? '…' : ''}</span>`));
    print("Type 'open &lt;number&gt;' to open a project.", 't-dim');
  } },
  open: { desc: 'Open a project by number', hidden: true, run: ([n]) => {
    const p = data.projects[Number(n) - 1];
    if (!p) return print(`open: no project #${escHtml(n ?? '')}. Run 'projects' to see the list.`, 't-err');
    if (!p.url) return print(`${escHtml(p.title)} has no public link yet.`, 't-dim');
    openExternal(p.url);
    print(`Opening ${escHtml(p.title)}…`, 't-dim');
  } },
  achievements: { desc: 'Awards, certifications & milestones', run: () => data.achievements.forEach(a => print(`<span class="t-accent">★</span> ${escHtml(a.title)}${a.issuer ? ` <span class="t-dim">— ${escHtml(a.issuer)}${a.date ? `, ${escHtml(a.date)}` : ''}</span>` : ''}`)) },
  contact: { desc: 'How to reach me', run: () => {
    if (data.email) print(`<span class="t-accent">${pad('email', 12)}</span>${link(`mailto:${data.email}`, data.email)}`);
    data.socials.forEach(s => print(`<span class="t-accent">${pad(s.label.toLowerCase(), 12)}</span>${link(s.url)}`));
  } },
  resume: { desc: 'Download my résumé', run: () => {
    if (!data.resume) return print('Résumé not uploaded yet — ask me for it via `contact`.', 't-dim');
    openExternal(data.resume);
    print('Opening résumé…', 't-dim');
  } },
  ls: { desc: 'List files', run: () => print(Object.keys(FILES).map(f => (f.endsWith('/') ? `<span class="t-accent">${escHtml(f)}</span>` : escHtml(f))).join('   ')) },
  cat: { desc: 'Print a file (e.g. cat about.txt)', hidden: true, run: ([file]) => {
    const cmd = FILES[file] || FILES[`${file}/`];
    if (!cmd) return print(`cat: ${escHtml(file ?? '')}: No such file. Try 'ls'.`, 't-err');
    if (cmd === 'projects') return print(`cat: ${escHtml(file)}: Is a directory`, 't-err');
    COMMANDS[cmd].run([]);
  } },
  cd: { desc: 'Jump to a section (e.g. cd projects)', hidden: true, run: ([dir = '']) => COMMANDS.goto.run([dir.replace(/\/$/, '')]) },
  goto: { desc: 'Scroll to a section', run: ([name = '']) => {
    const alias = { skills: 'stack', home: 'home', '~': 'home', '..': 'home' };
    const id = alias[name] || name;
    if (!scrollToSection(id)) {
      return print(`goto: unknown section '${escHtml(name)}'. Sections: ${data.sections.map(s => s.key).join(', ')}`, 't-err');
    }
    closeTerminal();
  } },
  theme: { desc: 'Switch theme: theme [light|dark]', run: ([t]) => {
    if (t === 'light' || t === 'dark') setTheme(t); else toggleTheme();
    print(`Theme set to ${root.dataset.theme}.`, 't-dim');
  } },
  hire: { desc: 'The best command', run: () => { print('Excellent choice. Opening the contact section… 🤝', 't-accent'); setTimeout(() => COMMANDS.goto.run(['contact']), 600); } },
  date: { desc: 'Show the current date', hidden: true, run: () => print(escHtml(new Date().toString())) },
  echo: { desc: 'Print text', hidden: true, run: args => print(escHtml(args.join(' '))) },
  history: { desc: 'Command history', hidden: true, run: () => termHistory.forEach((h, i) => print(`  ${i + 1}  ${escHtml(h)}`)) },
  sudo: { desc: '', hidden: true, run: () => print('Permission denied: nice try 😄 — but you could hire me instead. Type `hire`.', 't-err') },
  rm: { desc: '', hidden: true, run: () => print('🙅 Not today.', 't-err') },
  clear: { desc: 'Clear the screen', run: () => termBody.replaceChildren() },
  exit: { desc: 'Close the terminal', run: () => closeTerminal() },
};

function execute(raw) {
  const line = raw.trim();
  print(`<span class="term-prompt">guest@${escHtml(data.handle)}:~$</span> <span class="t-cmd">${escHtml(line)}</span>`);
  if (!line) return;
  termHistory.push(line);
  historyIndex = termHistory.length;
  const [name, ...args] = line.split(/\s+/);
  const cmd = COMMANDS[name.toLowerCase()];
  if (!cmd) return print(`command not found: ${escHtml(name)}. Type 'help' for a list of commands.`, 't-err');
  cmd.run(args);
}

function openTerminal() {
  if (!term) return;
  if (!booted) {
    booted = true;
    print(`Welcome to <span class="t-accent">${escHtml(data.handle)}</span>’s portfolio terminal.`);
    print("Type 'help' to see what you can do, or try 'neofetch'.", 't-dim');
    print('');
  }
  openOverlay(term, termInput);
}
function closeTerminal() { if (term && !term.hidden) closeOverlay(term); }

term && $('form', term).addEventListener('submit', event => {
  event.preventDefault();
  execute(termInput.value);
  termInput.value = '';
});
termInput?.addEventListener('keydown', event => {
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    historyIndex = Math.max(0, Math.min(termHistory.length, historyIndex + (event.key === 'ArrowUp' ? -1 : 1)));
    termInput.value = termHistory[historyIndex] ?? '';
  } else if (event.key === 'Tab') {
    event.preventDefault();
    const value = termInput.value.trimStart();
    const matches = Object.keys(COMMANDS).filter(c => c.startsWith(value.toLowerCase()));
    if (value && matches.length === 1) termInput.value = `${matches[0]} `;
    else if (value && matches.length > 1) print(matches.join('   '), 't-dim');
  } else if (event.key === 'l' && event.ctrlKey) {
    event.preventDefault();
    termBody.replaceChildren();
  }
});

/* ----------------------------------------------------- global click & keys */

document.addEventListener('click', async event => {
  const actionEl = event.target.closest('[data-action]');
  const action = actionEl?.dataset.action;
  if (action === 'theme') toggleTheme(event);
  else if (action === 'menu') setMenu(!nav.classList.contains('menu-open'));
  else if (action === 'palette') openPalette();
  else if (action === 'terminal') openTerminal();
  else if (action === 'terminal-close') closeTerminal();
  else if (action === 'run-code') runCode();

  if (event.target.closest('.nav-links a')) setMenu(false);

  const copyEl = event.target.closest('[data-copy]');
  if (copyEl) {
    if (await copyText(copyEl.dataset.copy)) {
      toast('Email copied to clipboard ✓');
      copyEl.classList.add('copied');
      const hint = $('.email-hint span', copyEl);
      if (hint) { hint.textContent = 'Copied!'; setTimeout(() => { hint.textContent = 'Click to copy'; copyEl.classList.remove('copied'); }, 2000); }
    } else {
      location.href = `mailto:${copyEl.dataset.copy}`;
    }
  }
});

addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    palette.hidden ? openPalette() : closeOverlay(palette);
    return;
  }
  if (event.key === 'Escape') {
    if (!palette.hidden) closeOverlay(palette);
    else if (term && !term.hidden) closeTerminal();
    else setMenu(false);
    return;
  }
  const active = document.activeElement;
  const typing = active && (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable);
  if (!typing && event.key === '`' && term) {
    event.preventDefault();
    openTerminal();
  }
});

/* --------------------------------------------------- hello, fellow developer */

const accent = getComputedStyle(root).getPropertyValue('--accent').trim();
console.log(
  `%c${data.name}%c\nHey there, curious developer 👋\nThis site was hand-built — no frameworks, no trackers.\n${data.email ? `Like what you see? Say hi: ${data.email}` : ''}`,
  `font: 600 22px system-ui; color: ${accent}; padding: 4px 0;`,
  'font: 12px ui-monospace, monospace; color: #8a8a94; line-height: 1.6;',
);
