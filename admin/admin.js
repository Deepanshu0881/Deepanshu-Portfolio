import { icon, SOCIALS, ACHIEVEMENT_ICONS } from '/js/icons.js';

const API = '/api/admin';
const app = document.getElementById('app');
const isMac = /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform || navigator.platform || '');
const SECTION_KEYS = ['about', 'stack', 'experience', 'projects', 'achievements', 'contact'];
const SECTION_LABELS = { about: 'About', stack: 'Tech stack', experience: 'Experience', projects: 'Projects', achievements: 'Achievements', contact: 'Contact' };
const LEVELS = ['Hidden', 'Beginner', 'Familiar', 'Proficient', 'Advanced', 'Expert'];
const ACCENTS = ['#10b981', '#22c55e', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#f59e0b'];

const state = { session: null, content: null, saved: '', messages: [], saving: false, route: 'overview' };
let saveBar = null;
let activeDrawer = null;
let dragState = null;
let afterRoute = null;

/* ================================================================= helpers */

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (['value', 'checked', 'disabled', 'hidden', 'selected'].includes(key)) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === '') continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

function ic(name, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = icon(name, cls);
  return t.content.firstElementChild;
}

const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const monogram = name => (name || '').replace(/[^A-Za-z0-9+#]/g, '').slice(0, 2) || '?';
const slugFor = name => (name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\+/g, 'plus').replace(/\./g, 'dot').replace(/#/g, 'sharp').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtMonth = m => (m ? `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : '');

function timeAgo(iso) {
  if (!iso) return 'never';
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, size] of units) if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  return 'just now';
}

function inkFor(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? '#0a0a0b' : '#ffffff';
}

function applyAccent() {
  const accent = state.content?.site.accent;
  if (!accent) return;
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-ink', inkFor(accent));
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch { /* ignore */ }
}

function toast(message, type = 'ok') {
  const el = h('div', { class: `toast ${type}` }, ic(type === 'error' ? 'alert' : 'circleCheck'), h('span', {}, message));
  document.querySelector('.toasts').append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 250); }, type === 'error' ? 5000 : 2800);
}

function confirmDialog({ title, message, confirmText = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    const dialog = h('dialog', { class: 'confirm' },
      h('form', { method: 'dialog' },
        h('div', { class: 'confirm-body' }, h('h2', {}, title), message && h('p', {}, message)),
        h('div', { class: 'confirm-foot' },
          h('button', { class: 'btn', value: 'cancel' }, 'Cancel'),
          h('button', { class: danger ? 'btn btn-danger-solid' : 'btn btn-primary', value: 'ok' }, confirmText))));
    dialog.addEventListener('close', () => { resolve(dialog.returnValue === 'ok'); dialog.remove(); });
    document.body.append(dialog);
    dialog.showModal();
  });
}

async function api(path, { method = 'GET', body, raw, type } = {}) {
  const headers = { 'X-Admin-Request': '1' };
  let payload;
  if (raw) { payload = raw; headers['Content-Type'] = type; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  let res;
  try {
    res = await fetch(API + path, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new Error('Network error — is the server running?');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !['/login', '/session'].includes(path)) {
    state.session = { authenticated: false };
    renderLogin('Your session has expired. Sign in again — your unsaved edits are kept.');
    throw new Error('Session expired');
  }
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, data });
  return data;
}

/* ========================================================== dirty / saving */

const isDirty = () => Boolean(state.content) && JSON.stringify(state.content) !== state.saved;

function changed() {
  saveBar?.classList.toggle('show', isDirty());
}

function updateSaveBar() {
  changed();
  const btn = saveBar?.querySelector('#save-btn');
  if (btn) {
    btn.disabled = state.saving;
    btn.textContent = state.saving ? 'Saving…' : 'Save & publish';
  }
}

function validateAll() {
  if (!state.content.profile.name.trim()) return { route: 'profile', message: 'Your name is required.' };
  for (const [key, cfg] of Object.entries(COLLECTIONS)) {
    const index = state.content[key].findIndex(item => Object.keys(cfg.required).some(k => !String(item[k] ?? '').trim()));
    if (index >= 0) return { route: key, index, message: `One of your ${cfg.title.toLowerCase()} is missing a ${Object.values(cfg.required)[0].toLowerCase()}.` };
  }
  return null;
}

async function save() {
  if (state.saving || !isDirty()) return;
  document.activeElement?.blur?.(); // commit half-typed tags
  const problem = validateAll();
  if (problem) {
    toast(problem.message, 'error');
    navigate(problem.route, problem.index != null ? () => openDrawer(problem.route, problem.index) : null);
    return;
  }
  state.saving = true;
  updateSaveBar();
  try {
    const saved = await api('/content', { method: 'PUT', body: state.content });
    state.content = saved;
    state.saved = JSON.stringify(saved);
    toast('Saved & published ✓');
    renderRoute({ keepScroll: true });
  } catch (err) {
    if (err.message !== 'Session expired') toast(err.message, 'error');
  } finally {
    state.saving = false;
    updateSaveBar();
  }
}

async function discard() {
  const ok = await confirmDialog({ title: 'Discard unsaved changes?', message: 'Everything you changed since the last save will be lost.', confirmText: 'Discard', danger: true });
  if (!ok) return;
  state.content = JSON.parse(state.saved);
  applyAccent();
  renderRoute({ keepScroll: true });
  changed();
}

/* ========================================================== form controls */

function fieldBox(label, control, { hint, required, extra, cls = '' } = {}) {
  const target = control.matches?.('input, textarea, select') ? control : control.querySelector?.('input:not([type="file"]), textarea, select');
  if (target && !target.id) target.id = `f-${uid()}`;
  if (target && required) target.setAttribute('aria-required', 'true');
  return h('div', { class: `field ${cls}` },
    h('label', { class: 'field-label', for: target?.id }, h('span', {}, label, required && h('span', { class: 'req', 'aria-hidden': 'true' }, '*')), extra),
    control,
    hint && h('small', { class: 'field-hint' }, hint));
}

function textInput(obj, key, { type = 'text', placeholder = '', maxlength, rows, onInput, min, max } = {}) {
  const el = rows ? h('textarea', { rows, placeholder, maxlength }) : h('input', { type, placeholder, maxlength, min, max });
  el.value = obj[key] ?? '';
  el.addEventListener('input', () => {
    obj[key] = type === 'number' ? (el.value === '' ? 0 : Number(el.value)) : el.value;
    el.classList.remove('invalid');
    onInput?.(el.value);
    changed();
  });
  return el;
}

function monthInput(obj, key) {
  return textInput(obj, key, { type: 'month', placeholder: 'YYYY-MM' });
}

function linesInput(obj, key, { rows = 3, placeholder = 'One per line' } = {}) {
  const el = h('textarea', { rows, placeholder });
  el.value = obj[key].join('\n');
  el.addEventListener('input', () => {
    obj[key] = el.value.split('\n').map(s => s.trim()).filter(Boolean);
    changed();
  });
  return el;
}

function toggle(obj, key, { onChange, label } = {}) {
  const input = h('input', { type: 'checkbox', role: 'switch', 'aria-label': label });
  input.checked = Boolean(obj[key]);
  input.addEventListener('change', () => {
    obj[key] = input.checked;
    onChange?.(input.checked);
    changed();
  });
  return h('span', { class: 'switch' }, input, h('span', { class: 'switch-track' }));
}

function switchRow(label, hint, control) {
  const input = control.querySelector('input');
  if (input && !input.getAttribute('aria-label')) input.setAttribute('aria-label', label);
  return h('div', { class: 'switch-row' },
    h('div', {}, h('span', { class: 'field-label' }, label), hint && h('small', { class: 'field-hint' }, hint)),
    control);
}

function select(obj, key, options, { onChange } = {}) {
  const el = h('select', {}, options.map(([value, label]) => h('option', { value }, label)));
  el.value = obj[key];
  el.addEventListener('change', () => {
    obj[key] = el.value;
    onChange?.(el.value);
    changed();
  });
  return el;
}

function datalist(values) {
  return h('datalist', { id: `dl-${uid()}` }, values.map(v => h('option', { value: v })));
}

function tagsInput(obj, key, { placeholder = 'Type and press Enter', suggestions = [] } = {}) {
  const list = suggestions.length ? datalist([]) : null;
  const input = h('input', { type: 'text', placeholder, list: list?.id });
  const wrap = h('div', { class: 'tags-input' });
  const render = () => {
    wrap.replaceChildren(
      ...obj[key].map((tag, i) => h('span', { class: 'tag' }, tag,
        h('button', {
          type: 'button', 'aria-label': `Remove ${tag}`,
          onclick: () => { obj[key].splice(i, 1); changed(); render(); input.focus(); },
        }, ic('x')))),
      input);
    if (list) {
      list.replaceChildren(...suggestions.filter(s => !obj[key].includes(s)).map(s => h('option', { value: s })));
      wrap.append(list);
    }
  };
  const commit = () => {
    const parts = input.value.split(',').map(s => s.trim()).filter(Boolean);
    input.value = '';
    let added = false;
    for (const part of parts) if (!obj[key].includes(part)) { obj[key].push(part); added = true; }
    if (added) { changed(); render(); }
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); input.focus(); }
    else if (e.key === 'Backspace' && !input.value && obj[key].length) { obj[key].pop(); changed(); render(); input.focus(); }
  });
  input.addEventListener('input', e => { if (e.inputType === 'insertReplacementText' || (suggestions.includes(input.value) && !e.inputType)) { commit(); input.focus(); } });
  input.addEventListener('blur', commit);
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) { e.preventDefault(); input.focus(); } });
  render();
  return wrap;
}

async function processImage(file, max) {
  if (file.type === 'image/gif') return file; // keep animations
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const webp = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.86));
  if (webp?.type === 'image/webp') return webp;
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
}

function imageInput(obj, key, { aspect = '16 / 10', max = 1600, focusKey } = {}) {
  const preview = h('div', { class: 'img-preview', style: { aspectRatio: aspect, cursor: 'pointer' }, title: 'Click or drop an image' });
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });
  const urlInput = h('input', { type: 'url', placeholder: '…or paste an image URL (https://…)' });
  urlInput.value = obj[key].startsWith('/uploads/') ? '' : obj[key];
  const removeBtn = h('button', {
    type: 'button', class: 'btn btn-sm btn-ghost',
    onclick: () => { obj[key] = ''; urlInput.value = ''; changed(); render(); },
  }, ic('trash'), 'Remove');

  const render = () => {
    let img = null;
    if (obj[key]) {
      img = h('img', { src: obj[key], alt: '' });
      if (focusKey) img.style.objectPosition = `50% ${obj[focusKey]}%`;
    }
    preview.replaceChildren(img || h('div', { class: 'img-empty' }, ic('image'), h('span', {}, 'Click to upload or drop an image')));
    removeBtn.hidden = !obj[key];
  };

  const upload = async f => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return toast('Please choose a PNG, JPG, WebP or GIF image.', 'error');
    preview.append(h('div', { class: 'img-busy' }, 'Uploading…'));
    try {
      const blob = await processImage(f, max);
      const { url } = await api('/upload', { method: 'POST', raw: blob, type: blob.type });
      obj[key] = url;
      urlInput.value = '';
      changed();
      toast('Image uploaded — save to publish it.');
    } catch (err) {
      if (err.message !== 'Session expired') toast(err.message, 'error');
    }
    render();
  };

  urlInput.addEventListener('change', () => { obj[key] = urlInput.value.trim(); changed(); render(); });
  file.addEventListener('change', () => { upload(file.files[0]); file.value = ''; });
  preview.addEventListener('click', () => file.click());
  preview.addEventListener('dragover', e => { e.preventDefault(); preview.classList.add('dragover'); });
  preview.addEventListener('dragleave', () => preview.classList.remove('dragover'));
  preview.addEventListener('drop', e => { e.preventDefault(); preview.classList.remove('dragover'); upload(e.dataTransfer.files[0]); });
  render();

  const wrap = h('div', { class: 'media-input' },
    preview,
    h('div', { class: 'media-actions' }, h('button', { type: 'button', class: 'btn btn-sm', onclick: () => file.click() }, ic('upload'), 'Upload'), removeBtn),
    urlInput, file);
  wrap.refresh = render;
  return wrap;
}

function pdfInput(obj, key) {
  const wrap = h('div', { class: 'media-actions' });
  const file = h('input', { type: 'file', accept: 'application/pdf', hidden: true });
  const render = () => wrap.replaceChildren(
    obj[key]
      ? h('a', { class: 'file-chip', href: obj[key], target: '_blank', rel: 'noopener' }, ic('fileText'), 'View current file', ic('arrowUpRight'))
      : h('span', { class: 'field-hint' }, 'No file uploaded yet.'),
    h('button', { type: 'button', class: 'btn btn-sm', onclick: () => file.click() }, ic('upload'), obj[key] ? 'Replace' : 'Upload PDF'),
    obj[key] && h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { obj[key] = ''; changed(); render(); } }, ic('trash'), 'Remove'),
    file);
  file.addEventListener('change', async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    if (f.type !== 'application/pdf') return toast('Please choose a PDF file.', 'error');
    try {
      const { url } = await api('/upload', { method: 'POST', raw: f, type: 'application/pdf' });
      obj[key] = url;
      changed();
      render();
      toast('File uploaded — save to publish it.');
    } catch (err) {
      if (err.message !== 'Session expired') toast(err.message, 'error');
    }
  });
  render();
  return wrap;
}

function colorInput(obj, key, onChange) {
  const picker = h('input', { type: 'color', 'aria-label': 'Pick a custom color' });
  const text = h('input', { type: 'text', maxlength: 7, 'aria-label': 'Hex color' });
  let swatches = [];
  const set = (value, from) => {
    const color = value.toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(color)) return;
    obj[key] = color;
    if (from !== picker) picker.value = color;
    if (from !== text) text.value = color;
    swatches.forEach(s => s.classList.toggle('active', s.dataset.color === color));
    onChange?.(color);
    changed();
  };
  swatches = ACCENTS.map(color => h('button', {
    type: 'button', class: 'swatch', style: { background: color }, 'data-color': color, title: color, 'aria-label': `Use ${color}`,
    onclick: () => set(color),
  }));
  picker.value = obj[key];
  text.value = obj[key];
  swatches.forEach(s => s.classList.toggle('active', s.dataset.color === obj[key]));
  picker.addEventListener('input', () => set(picker.value, picker));
  text.addEventListener('input', () => set(text.value.startsWith('#') ? text.value : `#${text.value}`, text));
  return h('div', { class: 'color-row' }, swatches, picker, text);
}

function socialsEditor(list) {
  const wrap = h('div', { class: 'stack', style: { gap: '8px' } });
  const render = () => wrap.replaceChildren(
    ...list.map((social, i) => h('div', { class: 'social-row' },
      select(social, 'platform', Object.entries(SOCIALS).map(([value, meta]) => [value, meta.label])),
      textInput(social, 'url', { type: 'url', placeholder: 'https://…' }),
      h('button', { type: 'button', class: 'icon-btn danger', 'aria-label': 'Remove link', onclick: () => { list.splice(i, 1); changed(); render(); } }, ic('trash')))),
    h('div', {}, h('button', {
      type: 'button', class: 'btn btn-sm',
      onclick: () => { list.push({ platform: 'github', url: '' }); changed(); render(); wrap.querySelector('.social-row:last-of-type input')?.focus(); },
    }, ic('plus'), 'Add link')));
  render();
  return wrap;
}

const markdownHint = () => h('span', {}, 'Supports ', h('code', {}, '**bold**'), ', ', h('code', {}, '`code`'), ' and ', h('code', {}, '[text](https://…)'), '. A blank line starts a new paragraph.');

/* Simple Icons previews (same CDN the public site uses) */
const iconCache = new Map();
function fetchSimpleIcon(slug) {
  if (!iconCache.has(slug)) {
    iconCache.set(slug, fetch(`https://cdn.simpleicons.org/${encodeURIComponent(slug)}`)
      .then(res => (res.ok ? res.text() : Promise.reject(new Error('not found'))))
      .then(svg => {
        const d = svg.match(/<path[^>]*\sd="([^"]+)"/)?.[1];
        if (!d || !/^[\d\s.,a-zA-Z+-]+$/.test(d)) throw new Error('bad icon');
        return d;
      }));
  }
  return iconCache.get(slug);
}
function showSimpleIcon(el, slug, fallback) {
  el.dataset.slug = slug || '';
  el.replaceChildren(fallback);
  if (!slug) return;
  fetchSimpleIcon(slug).then(d => {
    if (el.dataset.slug !== slug) return;
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
  }).catch(() => { if (el.dataset.slug === slug) el.title = `No icon found for “${slug}”`; });
}

const techNames = () => state.content.technologies.map(t => t.name).filter(Boolean);

/* ============================================================ collections */

function techForm(t) {
  const preview = h('span', { class: 'icon-preview' });
  const updatePreview = () => showSimpleIcon(preview, t.icon, monogram(t.name));
  let autoIcon = !t.icon || t.icon === slugFor(t.name);
  const iconInput = textInput(t, 'icon', { placeholder: 'e.g. react', onInput: v => { autoIcon = !v; updatePreview(); } });
  const nameInput = textInput(t, 'name', {
    placeholder: 'e.g. TypeScript',
    onInput: v => { if (autoIcon) { t.icon = slugFor(v); iconInput.value = t.icon; } updatePreview(); },
  });
  const categories = datalist([...new Set(state.content.technologies.map(x => x.category).filter(Boolean))]);
  const categoryInput = textInput(t, 'category', { placeholder: 'e.g. Frontend' });
  categoryInput.setAttribute('list', categories.id);
  const levelLabel = h('span', { class: 'range-value' }, LEVELS[t.level]);
  const range = h('input', { type: 'range', min: 0, max: 5, step: 1, 'aria-label': 'Proficiency' });
  range.value = t.level;
  range.addEventListener('input', () => { t.level = Number(range.value); levelLabel.textContent = LEVELS[t.level]; changed(); });
  updatePreview();
  return [
    fieldBox('Name', nameInput, { required: true }),
    fieldBox('Category', h('div', {}, categoryInput, categories), { hint: 'Technologies are grouped and filterable by category.' }),
    fieldBox('Icon', h('div', { class: 'input-group' }, preview, iconInput), {
      hint: h('span', {}, 'A ', h('a', { href: 'https://simpleicons.org', target: '_blank', rel: 'noopener' }, 'Simple Icons'), ' slug such as ', h('code', {}, 'react'), ' or ', h('code', {}, 'nodedotjs'), '. Filled in automatically from the name.'),
    }),
    fieldBox('Proficiency', h('div', { class: 'range-row' }, range, levelLabel), { hint: 'Shown as small bars on the card. Set to 0 to hide them.' }),
    switchRow('Visible on site', null, toggle(t, 'visible')),
  ];
}

function experienceForm(e) {
  const end = monthInput(e, 'end');
  end.disabled = e.current;
  return [
    fieldBox('Role', textInput(e, 'role', { placeholder: 'e.g. Senior Software Engineer' }), { required: true }),
    h('div', { class: 'grid-2' },
      fieldBox('Company', textInput(e, 'company')),
      fieldBox('Company website', textInput(e, 'url', { type: 'url', placeholder: 'https://' }))),
    fieldBox('Location', textInput(e, 'location', { placeholder: 'e.g. Remote' })),
    h('div', { class: 'grid-2' }, fieldBox('Start', monthInput(e, 'start')), fieldBox('End', end)),
    switchRow('I currently work here', 'Shows “Present” as the end date.', toggle(e, 'current', { onChange: v => { end.disabled = v; } })),
    fieldBox('Description', textInput(e, 'description', { rows: 5 }), { hint: markdownHint() }),
    fieldBox('Technologies used', tagsInput(e, 'tags', { suggestions: techNames() })),
    switchRow('Visible on site', null, toggle(e, 'visible')),
  ];
}

function projectForm(p) {
  return [
    fieldBox('Title', textInput(p, 'title', { placeholder: 'e.g. DevPulse' }), { required: true }),
    fieldBox('Cover image', imageInput(p, 'image', { aspect: '16 / 10' }), { hint: 'Optional — without an image a code-style cover is generated for featured projects.' }),
    fieldBox('Description', textInput(p, 'description', { rows: 4 }), { hint: markdownHint() }),
    fieldBox('Highlights', linesInput(p, 'highlights', { placeholder: 'One highlight per line' }), { hint: 'Bullet points shown on featured projects.' }),
    fieldBox('Tags', tagsInput(p, 'tags', { suggestions: techNames() }), { hint: 'The most common tags become filter chips above your projects.' }),
    h('div', { class: 'grid-2' },
      fieldBox('Live demo URL', textInput(p, 'liveUrl', { type: 'url', placeholder: 'https://' })),
      fieldBox('Source code URL', textInput(p, 'repoUrl', { type: 'url', placeholder: 'https://github.com/…' }))),
    fieldBox('Year', textInput(p, 'year', { placeholder: String(new Date().getFullYear()), maxlength: 12 })),
    switchRow('Featured', 'Featured projects get a large card with cover image and highlights.', toggle(p, 'featured')),
    switchRow('Visible on site', null, toggle(p, 'visible')),
  ];
}

function achievementForm(a) {
  return [
    fieldBox('Title', textInput(a, 'title', { placeholder: 'e.g. 1st place — Global Hackathon' }), { required: true }),
    h('div', { class: 'grid-2' },
      fieldBox('Type', select(a, 'type', Object.entries(ACHIEVEMENT_ICONS).map(([value, meta]) => [value, meta.label]))),
      fieldBox('Date', monthInput(a, 'date'))),
    fieldBox('Issuer / organization', textInput(a, 'issuer')),
    fieldBox('Description', textInput(a, 'description', { rows: 3 }), { hint: markdownHint() }),
    fieldBox('Link', textInput(a, 'url', { type: 'url', placeholder: 'Credential, certificate or article URL' })),
    switchRow('Visible on site', null, toggle(a, 'visible')),
  ];
}

const COLLECTIONS = {
  technologies: {
    title: 'Technologies', singular: 'technology', icon: 'layers', section: 'stack',
    description: 'Languages, frameworks and tools in your tech stack section. Drag to reorder.',
    blank: () => ({ id: uid(), name: '', category: state.content.technologies.at(-1)?.category || 'Languages', icon: '', level: 3, visible: true }),
    primary: t => t.name,
    secondary: t => [t.category, t.level ? LEVELS[t.level] : null].filter(Boolean).join(' · '),
    thumb: t => { const el = h('span', { class: 'item-thumb' }); showSimpleIcon(el, t.icon, monogram(t.name)); return el; },
    required: { name: 'Name' },
    form: techForm,
  },
  experience: {
    title: 'Experience', singular: 'position', icon: 'briefcase', section: 'experience',
    description: 'Your work history, shown as a timeline. The first entry is highlighted.',
    blank: () => ({ id: uid(), role: '', company: '', url: '', location: '', start: '', end: '', current: false, description: '', tags: [], visible: true }),
    primary: e => e.role,
    secondary: e => [e.company, [fmtMonth(e.start), e.current ? 'Present' : fmtMonth(e.end)].filter(Boolean).join(' — ')].filter(Boolean).join(' · '),
    thumb: () => h('span', { class: 'item-thumb' }, ic('briefcase')),
    required: { role: 'Role' },
    form: experienceForm,
  },
  projects: {
    title: 'Projects', singular: 'project', icon: 'folder', section: 'projects',
    description: 'Featured projects get large cards; the rest appear in a grid. Drag to reorder.',
    blank: () => ({ id: uid(), title: '', description: '', image: '', tags: [], highlights: [], liveUrl: '', repoUrl: '', year: String(new Date().getFullYear()), featured: false, visible: true }),
    primary: p => p.title,
    secondary: p => [p.year, p.tags.slice(0, 4).join(', ')].filter(Boolean).join(' · '),
    thumb: p => h('span', { class: 'item-thumb' }, p.image ? h('img', { src: p.image, alt: '' }) : ic('folder')),
    badges: p => p.featured && h('span', { class: 'pill accent' }, 'Featured'),
    required: { title: 'Title' },
    form: projectForm,
  },
  achievements: {
    title: 'Achievements', singular: 'achievement', icon: 'trophy', section: 'achievements',
    description: 'Awards, certifications, talks, hackathons and milestones.',
    blank: () => ({ id: uid(), title: '', issuer: '', date: '', type: 'award', description: '', url: '', visible: true }),
    primary: a => a.title,
    secondary: a => [ACHIEVEMENT_ICONS[a.type]?.label, a.issuer, fmtMonth(a.date)].filter(Boolean).join(' · '),
    thumb: a => h('span', { class: 'item-thumb' }, ic(ACHIEVEMENT_ICONS[a.type]?.icon || 'trophy')),
    required: { title: 'Title' },
    form: achievementForm,
  },
};

function renderCollection(key) {
  const cfg = COLLECTIONS[key];
  const list = state.content[key];
  const add = () => {
    list.push(cfg.blank());
    changed();
    renderCollection(key);
    openDrawer(key, list.length - 1, true);
  };
  const sectionToggle = h('label', { class: 'switch-row', style: { gap: '10px' } },
    h('span', { class: 'muted' }, 'Show section'),
    toggle(state.content.site.sections[cfg.section], 'visible', { label: `Show the ${cfg.title} section` }));
  setPage(
    pageHead(cfg.title, cfg.description, [sectionToggle, h('button', { class: 'btn btn-primary', type: 'button', onclick: add }, ic('plus'), `Add ${cfg.singular}`)]),
    list.length
      ? h('ul', { class: 'items card', role: 'list' }, list.map((item, i) => itemRow(key, item, i)))
      : h('div', { class: 'empty' }, ic(cfg.icon), h('h3', {}, `No ${cfg.title.toLowerCase()} yet`),
        h('p', {}, `Add your first ${cfg.singular} to show it on your portfolio.`),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: add }, ic('plus'), `Add ${cfg.singular}`)),
  );
}

function itemRow(key, item, index) {
  const cfg = COLLECTIONS[key];
  const list = state.content[key];
  const rerender = () => renderCollection(key);
  const move = to => {
    if (to < 0 || to >= list.length) return;
    const [moved] = list.splice(index, 1);
    list.splice(to, 0, moved);
    changed();
    rerender();
  };
  const hidden = item.visible === false;
  const row = h('li', { class: `item${hidden ? ' is-hidden' : ''}` },
    h('button', { class: 'drag-handle', type: 'button', 'aria-label': 'Drag to reorder', title: 'Drag to reorder' }, ic('grip')),
    cfg.thumb(item),
    h('button', { class: 'item-main', type: 'button', onclick: () => openDrawer(key, index) },
      h('strong', {}, cfg.primary(item) || 'Untitled'),
      h('span', {}, cfg.secondary(item) || '—')),
    cfg.badges?.(item),
    hidden && h('span', { class: 'pill' }, 'Hidden'),
    h('div', { class: 'item-actions' },
      h('button', { class: 'icon-btn move', type: 'button', 'aria-label': 'Move up', disabled: index === 0, onclick: () => move(index - 1) }, ic('chevronUp')),
      h('button', { class: 'icon-btn move', type: 'button', 'aria-label': 'Move down', disabled: index === list.length - 1, onclick: () => move(index + 1) }, ic('chevronDown')),
      h('button', {
        class: 'icon-btn', type: 'button', title: hidden ? 'Hidden — click to show' : 'Visible — click to hide', 'aria-label': hidden ? 'Show on site' : 'Hide from site',
        onclick: () => { item.visible = hidden; changed(); rerender(); },
      }, ic(hidden ? 'eyeOff' : 'eye')),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Edit', title: 'Edit', onclick: () => openDrawer(key, index) }, ic('pencil')),
      h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'Delete', title: 'Delete', onclick: () => removeItem(key, index) }, ic('trash'))));

  const handle = row.querySelector('.drag-handle');
  handle.addEventListener('pointerdown', () => { row.draggable = true; });
  handle.addEventListener('pointerup', () => { row.draggable = false; });
  row.addEventListener('dragstart', e => {
    dragState = { key, index };
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  });
  row.addEventListener('dragend', () => { row.draggable = false; row.classList.remove('dragging'); });
  row.addEventListener('dragover', e => { if (dragState?.key === key) { e.preventDefault(); row.classList.add('drag-over'); } });
  row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
  row.addEventListener('drop', e => {
    e.preventDefault();
    if (dragState?.key === key && dragState.index !== index) {
      const [moved] = list.splice(dragState.index, 1);
      list.splice(index, 0, moved);
      changed();
    }
    dragState = null;
    rerender();
  });
  return row;
}

async function removeItem(key, index) {
  const cfg = COLLECTIONS[key];
  const item = state.content[key][index];
  const ok = await confirmDialog({
    title: `Delete this ${cfg.singular}?`,
    message: `“${cfg.primary(item) || 'Untitled'}” will be removed from your portfolio when you save.`,
    confirmText: 'Delete', danger: true,
  });
  if (!ok) return false;
  state.content[key].splice(index, 1);
  changed();
  renderCollection(key);
  return true;
}

function openDrawer(key, index, isNew = false) {
  activeDrawer?.teardown();
  const cfg = COLLECTIONS[key];
  const item = state.content[key][index];
  if (!item) return;
  const initial = JSON.stringify(item);
  const body = h('div', { class: 'drawer-body' }, cfg.form(item));

  const close = () => {
    const missing = Object.entries(cfg.required).filter(([k]) => !String(item[k] ?? '').trim());
    if (missing.length) {
      if (isNew && JSON.stringify(item) === initial) {
        state.content[key].splice(state.content[key].indexOf(item), 1);
        changed();
      } else {
        toast(`${missing.map(([, label]) => label).join(', ')} is required.`, 'error');
        const input = body.querySelector('[aria-required="true"]');
        input?.classList.add('invalid');
        input?.focus();
        return;
      }
    }
    teardown();
    renderCollection(key);
  };
  const onKey = e => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) close(); };
  const backdrop = h('div', { class: 'drawer-backdrop', onmousedown: e => { if (e.target === backdrop) close(); } },
    h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${isNew ? 'New' : 'Edit'} ${cfg.singular}` },
      h('header', { class: 'drawer-head' },
        h('h2', {}, `${isNew ? 'New' : 'Edit'} ${cfg.singular}`),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, ic('x'))),
      body,
      h('footer', { class: 'drawer-foot' },
        h('button', {
          class: 'btn btn-danger', type: 'button',
          onclick: async () => { if (await removeItem(key, state.content[key].indexOf(item))) teardown(); },
        }, ic('trash'), 'Delete'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: close }, 'Done'))));
  const teardown = () => {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    activeDrawer = null;
  };
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  activeDrawer = { teardown };
  body.querySelector('input:not([type="file"]), textarea')?.focus();
}

/* ================================================================== pages */

function pageHead(title, description, actions = []) {
  return h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, title), description && h('p', {}, description)),
    actions.length ? h('div', { class: 'page-actions' }, actions) : null);
}

function card(title, description, body, { actions } = {}) {
  return h('section', { class: 'card' },
    title && h('header', { class: 'card-head' }, h('div', {}, h('h2', {}, title), description && h('p', {}, description)), actions),
    h('div', { class: 'card-body' }, body));
}

function setPage(...nodes) {
  document.getElementById('page').replaceChildren(...nodes.flat().filter(Boolean));
}

const viewLive = (hash = '') => h('a', { class: 'btn', href: `/${hash}`, target: '_blank', rel: 'noopener' }, 'View live', ic('arrowUpRight'));

/* ---------------------------------------------------------------- overview */

async function renderOverview() {
  const c = state.content;
  const s = state.session;
  const firstName = c.profile.name.split(/\s+/)[0];
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const checks = [
    ['Upload a profile photo', Boolean(c.profile.photo), 'profile'],
    ['Replace the sample name and bio', c.profile.name !== 'Alex Morgan', 'profile'],
    ['Add your real email address', Boolean(c.profile.email) && !c.profile.email.endsWith('@example.com'), 'profile'],
    ['Point social links to your profiles', !c.profile.socials.some(x => x.url.includes('your-username')), 'profile'],
    ['Upload your résumé (PDF)', Boolean(c.profile.resume), 'profile'],
    ['Add your own projects', c.projects.length > 0 && !c.projects.some(p => `${p.repoUrl}${p.liveUrl}`.match(/your-username|example\.com/)), 'projects'],
    ['Change the initial admin password', !s.mustChangePassword, 'security'],
    ['Turn on two-factor authentication', s.totpEnabled, 'security'],
  ];
  const done = checks.filter(([, ok]) => ok).length;
  const pct = Math.round((done / checks.length) * 100);

  const statsBox = h('div', { class: 'stack' }, h('div', { class: 'stat-cards' }, ['Views today', 'Views · 7 days', 'Visitors · 30 days', 'Unread messages'].map(label => h('div', { class: 'card stat-card' }, h('span', {}, label), h('strong', {}, '—')))));

  setPage(
    h('div', { class: 'page-head hello' },
      h('div', {}, h('h1', {}, `${greeting}, ${firstName} 👋`), h('p', {}, `Last published ${timeAgo(c.updatedAt)}. Here’s how your portfolio is doing.`)),
      h('div', { class: 'page-actions' }, viewLive())),
    h('div', { class: 'stack' },
      s.mustChangePassword && h('div', { class: 'banner warn' }, ic('alert'),
        h('div', { class: 'banner-body' }, h('strong', {}, 'You’re using the auto-generated admin password.'),
          h('span', {}, 'Choose your own in ', h('a', { href: '#/security' }, 'Security'), ' — it takes 10 seconds.'))),
      !s.mustChangePassword && !s.totpEnabled && h('div', { class: 'banner info' }, ic('shield'),
        h('div', { class: 'banner-body' }, h('strong', {}, 'Add a second layer of protection.'),
          h('span', {}, 'Enable free two-factor authentication with any authenticator app in ', h('a', { href: '#/security' }, 'Security'), '.'))),
      statsBox,
      h('div', { class: 'overview-grid' },
        card('Getting started', `${done} of ${checks.length} done — replace the sample content with your own.`, [
          h('div', { class: 'progress-bar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { style: { width: `${pct}%` } })),
          h('div', { class: 'checklist' }, checks.map(([label, ok, route]) => h('a', { class: `check-item${ok ? ' done' : ''}`, href: `#/${route}` }, ic(ok ? 'circleCheck' : 'circle'), label, ic('arrowRight', 'go')))),
        ]),
        card('Content', 'Everything on your site, at a glance.', h('div', { class: 'counts' },
          [['profile', 'user', 'Introduction', c.profile.roles.length ? `${c.profile.roles.length} roles` : ''],
            ['technologies', 'layers', 'Technologies', c.technologies.length],
            ['experience', 'briefcase', 'Experience', c.experience.length],
            ['projects', 'folder', 'Projects', c.projects.length],
            ['achievements', 'trophy', 'Achievements', c.achievements.length],
            ['messages', 'inbox', 'Messages', state.messages.length],
          ].map(([route, iconName, label, count]) => h('a', { class: 'count-link', href: `#/${route}` }, ic(iconName), label, h('strong', {}, String(count)))))),
      ),
    ),
  );

  try {
    const stats = await api('/stats');
    if (state.route !== 'overview') return;
    const values = [stats.today.views, stats.last7.views, stats.last30.visitors, stats.unread];
    statsBox.querySelectorAll('.stat-card strong').forEach((el, i) => { el.textContent = values[i].toLocaleString(); });
    statsBox.append(card('Page views', 'Last 30 days. Bots and your own visits while signed in aren’t counted.', viewsChart(stats.series)));
  } catch { /* stats are optional */ }
}

function viewsChart(series) {
  const max = Math.max(1, ...series.map(d => d.views));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 300 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Page views per day, peak ${max}`);
  series.forEach((day, i) => {
    const height = day.views ? Math.max(3, (day.views / max) * 96) : 1.5;
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('class', day.views ? 'bar' : 'bar zero');
    rect.setAttribute('x', String(i * 10 + 1.5));
    rect.setAttribute('width', '7');
    rect.setAttribute('y', String(100 - height));
    rect.setAttribute('height', String(height));
    rect.setAttribute('rx', '1.5');
    const title = document.createElementNS(ns, 'title');
    title.textContent = `${day.date}: ${day.views} views, ${day.visitors} visitors`;
    rect.append(title);
    svg.append(rect);
  });
  const fmt = d => new Date(`${d}T00:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric' });
  return h('div', { class: 'chart' }, svg, h('div', { class: 'chart-axis' }, h('span', {}, fmt(series[0].date)), h('span', {}, `peak ${max}/day`), h('span', {}, 'today')));
}

/* ---------------------------------------------------------------- profile */

function renderProfile() {
  const p = state.content.profile;
  const photo = imageInput(p, 'photo', { aspect: '11 / 13', max: 1200, focusKey: 'photoFocus' });
  const focus = h('input', { type: 'range', min: 0, max: 100, 'aria-label': 'Vertical focus' });
  focus.value = p.photoFocus;
  focus.addEventListener('input', () => { p.photoFocus = Number(focus.value); photo.refresh(); changed(); });

  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const tzList = datalist(zones);
  const tz = textInput(p, 'timezone', { placeholder: 'e.g. Asia/Kolkata' });
  tz.setAttribute('list', tzList.id);
  const detectTz = h('button', {
    type: 'button', class: 'btn btn-sm',
    onclick: () => { p.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; tz.value = p.timezone; changed(); },
  }, 'Use mine');
  const availability = textInput(p, 'availability', { placeholder: 'Open to new opportunities' });
  availability.disabled = !p.available;

  setPage(
    pageHead('Introduction', 'Your photo, name and story — shown in the hero and About sections.', [viewLive('#home')]),
    h('div', { class: 'stack' },
      card('Profile photo', 'Shown in the hero section. It’s resized and optimized automatically.',
        h('div', { class: 'grid-2' },
          h('div', { style: { maxWidth: '260px', width: '100%' } }, photo),
          h('div', { class: 'stack', style: { alignContent: 'start' } },
            fieldBox('Vertical focus', h('div', { class: 'range-row' }, focus), { hint: 'Choose which part of the photo stays visible when it’s cropped.' }),
            h('p', { class: 'field-hint' }, 'No photo yet? Your initials are shown in a styled frame instead.')))),
      card('Identity', null, [
        h('div', { class: 'grid-2' },
          fieldBox('Full name', textInput(p, 'name'), { required: true }),
          fieldBox('Handle', textInput(p, 'handle', { placeholder: 'e.g. alex', maxlength: 24 }), { hint: h('span', {}, 'Used in the ', h('code', {}, '~/handle'), ' logo and the terminal prompt.') })),
        fieldBox('Greeting', textInput(p, 'greeting', { placeholder: 'Hi, I’m' }), { hint: 'Small line above your name.' }),
        fieldBox('Roles', tagsInput(p, 'roles', { placeholder: 'Add a role and press Enter' }), { hint: 'Typed out one after another in the hero. The first is also used as your job title.' }),
        fieldBox('Headline', textInput(p, 'headline', { rows: 2, maxlength: 240 }), { hint: 'One or two sentences under your name.' }),
      ]),
      card('About', 'The longer story in the About section.', [
        fieldBox('Bio', textInput(p, 'bio', { rows: 8 }), { hint: markdownHint() }),
        h('div', { class: 'grid-2' },
          fieldBox('Years of experience', textInput(p, 'yearsExperience', { type: 'number', min: 0, max: 60 }), { hint: 'Set to 0 to hide the badge and stat.' }),
          fieldBox('Location', textInput(p, 'location', { placeholder: 'e.g. Bengaluru, India' }))),
        fieldBox('Time zone', h('div', { class: 'input-group' }, tz, detectTz, tzList), { hint: 'Shows your current local time next to your location.' }),
        switchRow('Available for work', 'Shows a pulsing status badge at the top of the hero.', toggle(p, 'available', { onChange: v => { availability.disabled = !v; } })),
        fieldBox('Availability text', availability),
      ]),
      card('Contact & links', null, [
        fieldBox('Email', textInput(p, 'email', { type: 'email', placeholder: 'you@example.com' }), { hint: 'Shown in the contact section with a one-click copy button.' }),
        fieldBox('Résumé', pdfInput(p, 'resume'), { hint: 'Adds a “Résumé” download button to the hero.' }),
        fieldBox('Social links', socialsEditor(p.socials)),
      ]),
    ),
  );
}

/* ---------------------------------------------------------------- settings */

function renderSettings() {
  const s = state.content.site;
  const counter = h('small', {}, `${s.description.length}/300`);
  const serpTitle = h('span', { class: 'serp-title' });
  const serpDesc = h('span', { class: 'serp-desc' });
  const updateSerp = () => {
    serpTitle.textContent = s.title || 'Untitled';
    serpDesc.textContent = s.description || state.content.profile.headline || 'Add a description…';
    counter.textContent = `${s.description.length}/300`;
  };
  updateSerp();

  setPage(
    pageHead('Appearance & SEO', 'Theme, accent color, sections, and how your site looks in search results.', [viewLive()]),
    h('div', { class: 'stack' },
      card('Appearance', null, [
        fieldBox('Accent color', colorInput(s, 'accent', applyAccent), { hint: 'Used for highlights, buttons and the blinking cursor. The dashboard previews it live.' }),
        h('div', { class: 'grid-2' },
          fieldBox('Default theme', select(s, 'theme', [['dark', 'Dark'], ['light', 'Light'], ['system', 'Match visitor’s system']]), { hint: 'Visitors can still switch themes.' }),
          fieldBox('Footer note', textInput(s, 'footerNote', { maxlength: 200 }))),
        switchRow('Interactive terminal', h('span', {}, 'Visitors can press ', h('kbd', {}, '`'), ' to explore your portfolio from a fake terminal.'), toggle(s, 'terminal')),
      ]),
      card('Search engines & link previews', 'What Google and social networks show for your site.', [
        fieldBox('Site title', textInput(s, 'title', { maxlength: 120, onInput: updateSerp })),
        fieldBox('Meta description', textInput(s, 'description', { rows: 3, maxlength: 300, onInput: updateSerp }), { extra: counter, hint: 'Aim for 120–160 characters. Falls back to your headline.' }),
        h('div', { class: 'serp', 'aria-label': 'Search result preview' }, h('span', { class: 'serp-url' }, location.host), serpTitle, serpDesc),
      ]),
      card('Sections', 'Show, hide or rename each section. Empty sections are hidden automatically.',
        SECTION_KEYS.map(key => {
          const sec = s.sections[key];
          return h('div', { class: 'section-edit' },
            switchRow(SECTION_LABELS[key], null, toggle(sec, 'visible', { label: `Show ${SECTION_LABELS[key]} section` })),
            h('div', { class: 'grid-2' },
              fieldBox('Title', textInput(sec, 'title', { maxlength: 80 })),
              fieldBox('Subtitle', textInput(sec, 'subtitle', { maxlength: 240 }))));
        })),
    ),
  );
}

/* ---------------------------------------------------------------- security */

function scorePassword(pw) {
  if (!pw) return 0;
  if (pw.length < 10) return 1;
  let score = 1;
  if (pw.length >= 14) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.min(4, score);
}

function codeInput() {
  return h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 7, placeholder: '123456', class: 'mono' });
}

function statusLine(on, text) {
  return h('span', { class: `status-line ${on ? 'on' : 'off'}` }, ic(on ? 'circleCheck' : 'circle'), text);
}

function renderTwoFactor(box, setup) {
  if (state.session.totpEnabled) {
    const pw = h('input', { type: 'password', autocomplete: 'current-password' });
    const code = codeInput();
    box.replaceChildren(
      statusLine(true, 'Two-factor authentication is on'),
      h('p', { class: 'muted' }, 'Every sign-in requires a 6-digit code from your authenticator app.'),
      h('details', { class: 'danger-zone' },
        h('summary', { class: 'btn btn-sm btn-danger' }, 'Turn off two-factor…'),
        h('form', {
          class: 'grid-3', style: { marginTop: '14px', alignItems: 'end' },
          onsubmit: async e => {
            e.preventDefault();
            try {
              state.session = { ...state.session, ...(await api('/2fa/disable', { method: 'POST', body: { password: pw.value, code: code.value } })) };
              toast('Two-factor authentication turned off.');
              renderTwoFactor(box);
            } catch (err) { toast(err.message, 'error'); }
          },
        }, fieldBox('Password', pw), fieldBox('Current code', code), h('div', {}, h('button', { class: 'btn btn-danger', type: 'submit' }, 'Turn off')))));
    return;
  }

  if (setup) {
    const code = codeInput();
    box.replaceChildren(
      h('div', { class: 'qr-box' },
        h('img', { src: setup.qr, alt: 'QR code to add this account to your authenticator app', width: 180, height: 180 }),
        h('div', { class: 'stack', style: { gap: '12px' } },
          h('ol', { class: 'steps' },
            h('li', {}, 'Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).'),
            h('li', {}, 'Scan the QR code, or enter this setup key manually:')),
          h('div', { class: 'secret' }, setup.secret.match(/.{1,4}/g).join(' ')),
          h('form', {
            class: 'stack', style: { gap: '10px' },
            onsubmit: async e => {
              e.preventDefault();
              try {
                state.session = { ...state.session, ...(await api('/2fa/enable', { method: 'POST', body: { code: code.value } })) };
                toast('Two-factor authentication is on 🎉');
                renderTwoFactor(box);
              } catch (err) { toast(err.message, 'error'); code.select(); }
            },
          },
          fieldBox('Enter the 6-digit code shown in the app', code),
          h('div', { class: 'media-actions' },
            h('button', { class: 'btn btn-primary', type: 'submit' }, 'Verify & turn on'),
            h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => renderTwoFactor(box) }, 'Cancel'))))));
    code.focus();
    return;
  }

  box.replaceChildren(
    statusLine(false, 'Two-factor authentication is off'),
    h('p', { class: 'muted' }, 'Require a 6-digit code from an authenticator app at sign-in. It’s free, works offline and is more secure than SMS codes.'),
    h('div', {}, h('button', {
      class: 'btn btn-primary', type: 'button',
      onclick: async () => {
        try { renderTwoFactor(box, await api('/2fa/setup', { method: 'POST' })); } catch (err) { toast(err.message, 'error'); }
      },
    }, ic('shield'), 'Set up two-factor authentication')));
}

function renderSecurity() {
  const current = h('input', { type: 'password', autocomplete: 'current-password' });
  const next = h('input', { type: 'password', autocomplete: 'new-password', minlength: 10 });
  const confirm = h('input', { type: 'password', autocomplete: 'new-password' });
  const meter = h('div', { class: 'strength', 'data-score': '0', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));
  next.addEventListener('input', () => { meter.dataset.score = String(scorePassword(next.value)); });

  const pwForm = h('form', {
    class: 'stack',
    onsubmit: async e => {
      e.preventDefault();
      if (next.value.length < 10) return toast('Use at least 10 characters.', 'error');
      if (next.value !== confirm.value) return toast('The new passwords don’t match.', 'error');
      try {
        state.session = { ...state.session, ...(await api('/password', { method: 'POST', body: { current: current.value, next: next.value } })) };
        pwForm.reset();
        meter.dataset.score = '0';
        toast('Password updated. Other devices were signed out.');
        renderSecurity();
      } catch (err) { toast(err.message, 'error'); }
    },
  },
  fieldBox('Current password', current),
  h('div', { class: 'grid-2' },
    fieldBox('New password', next, { hint: 'At least 10 characters. A passphrase of 3–4 random words works great.' }),
    fieldBox('Confirm new password', confirm)),
  meter,
  h('div', {}, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Update password')));

  const twoFactorBox = h('div', { class: 'stack', style: { gap: '14px' } });
  renderTwoFactor(twoFactorBox);

  setPage(
    pageHead('Security', 'Your dashboard is protected by a password and optional two-factor authentication.'),
    h('div', { class: 'stack' },
      state.session.mustChangePassword && h('div', { class: 'banner warn' }, ic('alert'),
        h('div', { class: 'banner-body' }, h('strong', {}, 'You’re still using the auto-generated password.'), h('span', {}, 'Set your own below. The initial password file is deleted automatically.'))),
      card('Password', 'Changing it signs you out everywhere else.', pwForm),
      card('Two-factor authentication', 'A one-time code from your phone, in addition to your password.', twoFactorBox),
      card('Sessions', 'Sessions last 7 days.', h('div', { class: 'media-actions', style: { justifyContent: 'space-between' } },
        h('span', { class: 'muted' }, 'Lost a device or used a shared computer?'),
        h('button', {
          class: 'btn', type: 'button',
          onclick: async () => {
            try { await api('/sessions/revoke', { method: 'POST' }); toast('Signed out of all other devices.'); } catch (err) { toast(err.message, 'error'); }
          },
        }, ic('logOut'), 'Sign out other devices'))),
      card('Locked out?', null, h('p', { class: 'muted' }, 'On the server, run ', h('code', {}, 'npm run reset-admin'), '. It creates a new random password, turns off two-factor authentication and signs out every session.')),
    ),
  );
}

/* ----------------------------------------------------------------- backups */

async function renderBackups() {
  const tableBody = h('tbody', {}, h('tr', {}, h('td', { colspan: 3, class: 'muted' }, 'Loading…')));
  const importFile = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  importFile.addEventListener('change', async () => {
    const f = importFile.files[0];
    importFile.value = '';
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      if (!parsed?.profile || !parsed?.site) throw new Error('This doesn’t look like a portfolio export.');
      const ok = await confirmDialog({ title: 'Import this file?', message: 'It replaces all content in the editor. Nothing is published until you click Save.', confirmText: 'Import' });
      if (!ok) return;
      state.content = await api('/content/sanitize', { method: 'POST', body: parsed });
      applyAccent();
      changed();
      toast('Imported — review your content, then Save & publish.');
    } catch (err) {
      toast(err instanceof SyntaxError ? 'That file isn’t valid JSON.' : err.message, 'error');
    }
  });
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(JSON.parse(state.saved), null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `portfolio-content-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  setPage(
    pageHead('Backups', 'A snapshot is saved automatically every time you publish. The last 30 are kept.'),
    h('div', { class: 'stack' },
      card('Export & import', 'Download your published content as JSON, or load it back — handy when moving servers.',
        h('div', { class: 'media-actions' },
          h('button', { class: 'btn', type: 'button', onclick: exportJson }, ic('download'), 'Export JSON'),
          h('button', { class: 'btn', type: 'button', onclick: () => importFile.click() }, ic('upload'), 'Import JSON'),
          importFile)),
      h('section', { class: 'card' },
        h('header', { class: 'card-head' }, h('div', {}, h('h2', {}, 'Version history'), h('p', {}, 'Restore any previous version. Your current version is backed up first.'))),
        h('table', { class: 'table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Saved'), h('th', {}, 'Size'), h('th', {}, ''))), tableBody)),
    ),
  );

  try {
    const backups = await api('/backups');
    if (state.route !== 'backups') return;
    tableBody.replaceChildren(...(backups.length ? backups.map(b => h('tr', {},
      h('td', {}, h('strong', { style: { fontWeight: 500 } }, timeAgo(b.createdAt)), h('div', { class: 'field-hint' }, new Date(b.createdAt).toLocaleString())),
      h('td', { class: 'muted mono' }, `${(b.size / 1024).toFixed(1)} KB`),
      h('td', {}, h('button', {
        class: 'btn btn-sm', type: 'button',
        onclick: async () => {
          const ok = await confirmDialog({
            title: 'Restore this version?',
            message: `Your site will immediately show the content from ${new Date(b.createdAt).toLocaleString()}.${isDirty() ? ' Unsaved edits will be lost.' : ''}`,
            confirmText: 'Restore',
          });
          if (!ok) return;
          try {
            state.content = await api(`/backups/${encodeURIComponent(b.name)}/restore`, { method: 'POST' });
            state.saved = JSON.stringify(state.content);
            applyAccent();
            changed();
            toast('Version restored and published.');
            renderBackups();
          } catch (err) { toast(err.message, 'error'); }
        },
      }, ic('history'), 'Restore')))) : [h('tr', {}, h('td', { colspan: 3, class: 'muted' }, 'No backups yet — one is created the first time you save.'))]));
  } catch (err) {
    if (err.message !== 'Session expired') tableBody.replaceChildren(h('tr', {}, h('td', { colspan: 3, class: 'muted' }, err.message)));
  }
}

/* ---------------------------------------------------------------- messages */

let messageFilter = 'all';

async function refreshMessages() {
  try {
    state.messages = await api('/messages');
    updateBadge();
  } catch { /* handled by api() */ }
}

function updateBadge() {
  const badge = document.getElementById('unread-badge');
  if (!badge) return;
  const unread = state.messages.filter(m => !m.read).length;
  badge.hidden = unread === 0;
  badge.textContent = String(unread);
}

async function renderMessages() {
  const listBox = h('div');
  const filters = h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter messages' },
    ['all', 'unread'].map(f => h('button', {
      type: 'button', class: messageFilter === f ? 'active' : '', 'aria-pressed': String(messageFilter === f),
      onclick: () => { messageFilter = f; renderMessages(); },
    }, f === 'all' ? 'All' : 'Unread')));
  setPage(pageHead('Messages', 'Sent through the contact form on your portfolio.', [filters]), listBox);

  const draw = () => {
    const msgs = state.messages.filter(m => messageFilter === 'all' || !m.read);
    if (!msgs.length) {
      listBox.replaceChildren(h('div', { class: 'empty' }, ic('inbox'), h('h3', {}, messageFilter === 'unread' ? 'You’re all caught up' : 'No messages yet'), h('p', {}, 'When someone uses your contact form, it shows up here.')));
      return;
    }
    listBox.replaceChildren(h('div', { class: 'card' }, msgs.map(m => {
      const body = h('div', { class: 'msg-body', hidden: true },
        h('p', { class: 'msg-meta' }, h('strong', {}, m.name), ' · ', h('a', { href: `mailto:${m.email}` }, m.email), ' · ', new Date(m.createdAt).toLocaleString()),
        h('div', { class: 'msg-text' }, m.message),
        h('div', { class: 'media-actions' },
          h('a', { class: 'btn btn-sm btn-primary', href: `mailto:${m.email}?subject=${encodeURIComponent('Re: your message on my portfolio')}` }, ic('reply'), 'Reply'),
          h('button', {
            class: 'btn btn-sm', type: 'button',
            onclick: async () => { await setRead(m, !m.read); draw(); },
          }, m.read ? 'Mark as unread' : 'Mark as read'),
          h('button', {
            class: 'btn btn-sm btn-danger', type: 'button',
            onclick: async () => {
              if (!(await confirmDialog({ title: 'Delete this message?', message: 'This can’t be undone.', confirmText: 'Delete', danger: true }))) return;
              try {
                await api(`/messages/${m.id}`, { method: 'DELETE' });
                state.messages = state.messages.filter(x => x.id !== m.id);
                updateBadge();
                renderMessages();
              } catch (err) { toast(err.message, 'error'); }
            },
          }, ic('trash'), 'Delete')));
      const head = h('button', {
        class: 'msg-head', type: 'button', 'aria-expanded': 'false',
        onclick: async () => {
          body.hidden = !body.hidden;
          head.setAttribute('aria-expanded', String(!body.hidden));
          if (!body.hidden && !m.read) { await setRead(m, true); row.classList.remove('unread'); }
        },
      },
      h('span', { class: 'msg-dot' }),
      h('span', { class: 'msg-from' }, m.name),
      h('span', { class: 'msg-preview' }, m.message.replace(/\s+/g, ' ')),
      h('span', { class: 'msg-date' }, timeAgo(m.createdAt)));
      const row = h('article', { class: `msg${m.read ? '' : ' unread'}` }, head, body);
      return row;
    })));
  };

  draw();
  await refreshMessages();
  if (state.route === 'messages') draw();
}

async function setRead(message, read) {
  try {
    await api(`/messages/${message.id}`, { method: 'PATCH', body: { read } });
    message.read = read;
    updateBadge();
  } catch (err) { if (err.message !== 'Session expired') toast(err.message, 'error'); }
}

/* ================================================================== shell */

const NAV = [
  { group: 'Dashboard', items: [{ id: 'overview', label: 'Overview', icon: 'layout' }, { id: 'messages', label: 'Messages', icon: 'inbox' }] },
  {
    group: 'Content',
    items: [
      { id: 'profile', label: 'Introduction', icon: 'user' },
      { id: 'technologies', label: 'Technologies', icon: 'layers' },
      { id: 'experience', label: 'Experience', icon: 'briefcase' },
      { id: 'projects', label: 'Projects', icon: 'folder' },
      { id: 'achievements', label: 'Achievements', icon: 'trophy' },
    ],
  },
  {
    group: 'Site',
    items: [
      { id: 'settings', label: 'Appearance & SEO', icon: 'settings' },
      { id: 'security', label: 'Security', icon: 'shield' },
      { id: 'backups', label: 'Backups', icon: 'history' },
    ],
  },
];

const ROUTES = {
  overview: renderOverview,
  messages: renderMessages,
  profile: renderProfile,
  technologies: () => renderCollection('technologies'),
  experience: () => renderCollection('experience'),
  projects: () => renderCollection('projects'),
  achievements: () => renderCollection('achievements'),
  settings: renderSettings,
  security: renderSecurity,
  backups: renderBackups,
};

function renderShell() {
  const sidebar = h('aside', { class: 'sidebar' },
    h('div', { class: 'brand' }, h('span', { class: 'brand-name' }, h('span', {}, '~/'), 'admin'), h('span', { class: 'brand-tag' }, 'CMS')),
    h('nav', { class: 'stack', style: { gap: '14px' }, 'aria-label': 'Dashboard' },
      NAV.map(group => h('div', { class: 'nav-group' },
        h('span', { class: 'nav-group-label' }, group.group),
        group.items.map(item => h('a', { class: 'nav-item', href: `#/${item.id}`, 'data-route': item.id },
          ic(item.icon), item.label,
          item.id === 'messages' && h('span', { class: 'badge', id: 'unread-badge', hidden: true })))))),
    h('div', { class: 'sidebar-foot' },
      h('a', { class: 'nav-item', href: '/', target: '_blank', rel: 'noopener' }, ic('external'), 'View live site'),
      h('button', { class: 'nav-item', type: 'button', onclick: toggleTheme }, ic('sun'), 'Toggle theme'),
      h('button', { class: 'nav-item', type: 'button', onclick: logout }, ic('logOut'), 'Sign out')));

  const topbar = h('header', { class: 'topbar' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Open menu', onclick: () => document.body.classList.add('nav-open') }, ic('menu')),
    h('span', { class: 'topbar-title', id: 'topbar-title' }),
    h('a', { class: 'btn btn-sm', href: '/', target: '_blank', rel: 'noopener' }, 'View site', ic('arrowUpRight')));

  saveBar = h('div', { class: 'savebar', role: 'region', 'aria-label': 'Unsaved changes' },
    h('span', { class: 'savebar-text' }, h('span', { class: 'savebar-dot' }), 'Unsaved changes', h('kbd', {}, isMac ? '⌘S' : 'Ctrl+S')),
    h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: discard }, 'Discard'),
    h('button', { class: 'btn btn-primary btn-sm', type: 'button', id: 'save-btn', onclick: save }, 'Save & publish'));

  app.replaceChildren(
    h('div', { class: 'layout' }, sidebar, h('div', { class: 'main' }, topbar, h('main', { class: 'page', id: 'page' }))),
    h('div', { class: 'scrim', onclick: () => document.body.classList.remove('nav-open') }),
    saveBar);
  updateBadge();
  changed();
}

function navigate(route, then) {
  if (state.route === route && location.hash === `#/${route}`) {
    renderRoute();
    then?.();
  } else {
    afterRoute = then;
    location.hash = `#/${route}`;
  }
}

function renderRoute({ keepScroll = false } = {}) {
  if (!state.session?.authenticated || !document.getElementById('page')) return;
  const requested = location.hash.replace(/^#\/?/, '') || 'overview';
  state.route = ROUTES[requested] ? requested : 'overview';
  activeDrawer?.teardown();
  document.body.classList.remove('nav-open');
  document.querySelectorAll('[data-route]').forEach(a => {
    const active = a.dataset.route === state.route;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const label = NAV.flatMap(g => g.items).find(i => i.id === state.route)?.label || '';
  document.getElementById('topbar-title').textContent = label;
  document.title = `${label} · Admin`;
  const y = scrollY;
  ROUTES[state.route]();
  window.scrollTo(0, keepScroll ? y : 0);
  const then = afterRoute;
  afterRoute = null;
  then?.();
}

/* ================================================================== login */

function renderLogin(message = '') {
  activeDrawer?.teardown();
  saveBar = null;
  let need2fa = false;
  const pw = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const reveal = h('button', {
    type: 'button', class: 'icon-btn', 'aria-label': 'Show password',
    onclick: () => {
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      reveal.replaceChildren(ic(show ? 'eyeOff' : 'eye'));
      reveal.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    },
  }, ic('eye'));
  const code = codeInput();
  const codeField = fieldBox('Authentication code', code, { hint: 'Enter the 6-digit code from your authenticator app.' });
  codeField.hidden = true;
  const error = h('p', { class: 'login-error', role: 'alert' }, message);
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Sign in', ic('arrowRight'));

  const form = h('form', {
    class: 'login-card',
    onsubmit: async e => {
      e.preventDefault();
      error.textContent = '';
      submit.disabled = true;
      try {
        state.session = await api('/login', { method: 'POST', body: { password: pw.value, code: need2fa ? code.value : undefined } });
        await enterApp();
      } catch (err) {
        if (err.data?.need2fa) {
          need2fa = true;
          codeField.hidden = false;
          code.focus();
        }
        error.textContent = err.data?.error || (err.data?.need2fa ? '' : err.message);
      } finally {
        submit.disabled = false;
      }
    },
  },
  h('div', { class: 'login-logo' }, ic('lock')),
  h('div', {}, h('h1', {}, 'Welcome back'), h('p', { class: 'sub' }, 'Sign in to manage your portfolio.')),
  fieldBox('Password', h('div', { class: 'pw-wrap' }, pw, reveal)),
  codeField,
  error,
  submit,
  h('div', { class: 'login-foot' },
    h('a', { href: '/' }, '← Back to portfolio'),
    h('span', {}, 'Forgot it? Run ', h('code', {}, 'npm run reset-admin'))));

  app.replaceChildren(h('div', { class: 'login' }, form));
  document.title = 'Sign in · Admin';
  pw.focus();
}

async function logout() {
  if (isDirty()) {
    const ok = await confirmDialog({ title: 'Sign out with unsaved changes?', message: 'Your unsaved edits will be lost.', confirmText: 'Sign out', danger: true });
    if (!ok) return;
  }
  await api('/logout', { method: 'POST' }).catch(() => {});
  state.session = { authenticated: false };
  state.content = null;
  state.saved = '';
  renderLogin();
}

/* =================================================================== boot */

let messagePoll = null;

async function enterApp() {
  if (!state.content) {
    state.content = await api('/content');
    state.saved = JSON.stringify(state.content);
  }
  applyAccent();
  renderShell();
  renderRoute();
  refreshMessages();
  clearInterval(messagePoll);
  messagePoll = setInterval(() => { if (state.session?.authenticated) refreshMessages(); }, 60_000);
}

async function boot() {
  try {
    state.session = await api('/session');
  } catch (err) {
    app.replaceChildren(h('div', { class: 'boot' }, err.message));
    return;
  }
  if (!state.session.authenticated) return renderLogin();
  await enterApp();
}

addEventListener('hashchange', () => renderRoute());
addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && state.session?.authenticated) {
    e.preventDefault();
    save();
  }
});
addEventListener('beforeunload', e => {
  if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
});

boot();
