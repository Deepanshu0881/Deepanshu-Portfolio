// Content schema. Every write from the admin dashboard goes through sanitizeContent(),
// which fills defaults, trims lengths and drops unsafe values (e.g. javascript: URLs).
import crypto from 'node:crypto';

export const SOCIAL_PLATFORMS = [
  'github', 'linkedin', 'x', 'leetcode', 'stackoverflow', 'medium', 'devdotto', 'hashnode',
  'youtube', 'instagram', 'dribbble', 'codepen', 'kaggle', 'hackerrank', 'discord', 'website', 'other',
];
export const ACHIEVEMENT_TYPES = ['award', 'certification', 'hackathon', 'talk', 'publication', 'open-source', 'milestone'];
export const SECTION_KEYS = ['about', 'stack', 'experience', 'projects', 'achievements', 'contact'];

const str = (max, def = '') => ({ type: 'str', max, def });
const text = (max, def = '') => ({ type: 'text', max, def });
const url = () => ({ type: 'url' });
const bool = def => ({ type: 'bool', def });
const int = (min, max, def) => ({ type: 'int', min, max, def });
const oneOf = (values, def) => ({ type: 'enum', values, def });
const color = def => ({ type: 'color', def });
const month = () => ({ type: 'month' });
const id = () => ({ type: 'id' });
const list = (of, max) => ({ type: 'list', of, max });
const obj = shape => ({ type: 'obj', shape });
const custom = (fn) => ({ type: 'custom', fn });

const section = (title, subtitle = '') => obj({ visible: bool(true), title: str(80, title), subtitle: str(240, subtitle) });

const handle = custom(v => (typeof v === 'string' ? v.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 24) : ''));
const timezone = custom(v => {
  if (typeof v !== 'string' || !v.trim()) return '';
  try { new Intl.DateTimeFormat('en', { timeZone: v.trim() }); return v.trim(); } catch { return ''; }
});

export const contentSchema = obj({
  site: obj({
    title: str(120, 'Developer Portfolio'),
    description: str(300),
    accent: color('#10b981'),
    theme: oneOf(['dark', 'light', 'system'], 'dark'),
    terminal: bool(true),
    footerNote: str(200, 'Designed & built from scratch.'),
    sections: obj({
      about: section('About me'),
      stack: section('Technologies I work with'),
      experience: section('Where I’ve worked'),
      projects: section('Things I’ve built'),
      achievements: section('Achievements'),
      contact: section('Let’s build something together'),
    }),
  }),
  profile: obj({
    name: str(80, 'Your Name'),
    handle,
    greeting: str(60, 'Hi, I’m'),
    roles: list(str(60), 8),
    headline: str(240),
    bio: text(4000),
    photo: url(),
    photoFocus: int(0, 100, 30),
    location: str(80),
    timezone,
    email: str(120),
    resume: url(),
    available: bool(true),
    availability: str(100, 'Available for new opportunities'),
    yearsExperience: int(0, 60, 0),
    socials: list(obj({ platform: oneOf(SOCIAL_PLATFORMS, 'website'), url: url() }), 12),
  }),
  technologies: list(obj({
    id: id(), name: str(60), category: str(40, 'Other'), icon: str(60), level: int(0, 5, 0), visible: bool(true),
  }), 200),
  experience: list(obj({
    id: id(), role: str(100), company: str(100), url: url(), location: str(80),
    start: month(), end: month(), current: bool(false), description: text(3000),
    tags: list(str(40), 20), visible: bool(true),
  }), 50),
  projects: list(obj({
    id: id(), title: str(100), description: text(3000), image: url(),
    tags: list(str(40), 15), highlights: list(str(200), 8),
    liveUrl: url(), repoUrl: url(), year: str(12), featured: bool(false), visible: bool(true),
  }), 100),
  achievements: list(obj({
    id: id(), title: str(140), issuer: str(100), date: month(), type: oneOf(ACHIEVEMENT_TYPES, 'award'),
    description: text(1500), url: url(), visible: bool(true),
  }), 100),
  updatedAt: str(40),
});

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const newId = () => crypto.randomBytes(6).toString('hex');

export function cleanUrl(v) {
  if (typeof v !== 'string') return '';
  const s = v.trim().slice(0, 2000);
  if (!s) return '';
  if (/^\/(?!\/)\S*$/.test(s)) return s; // site-relative, e.g. /uploads/photo.webp
  if (/^mailto:\S+@\S+$/i.test(s)) return s;
  const tryParse = candidate => {
    try {
      const u = new URL(candidate);
      return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.') ? u.href : '';
    } catch { return ''; }
  };
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? tryParse(s) : tryParse(`https://${s}`);
}

function clean(node, v) {
  switch (node.type) {
    case 'str':
      return typeof v === 'string' || typeof v === 'number'
        ? String(v).replace(/[\r\n\t]+/g, ' ').replace(CTRL, '').trim().slice(0, node.max)
        : node.def;
    case 'text':
      return typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(CTRL, '').trim().slice(0, node.max) : node.def;
    case 'url': return cleanUrl(v);
    case 'bool': return typeof v === 'boolean' ? v : node.def;
    case 'int': {
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
      return Number.isFinite(n) ? Math.min(node.max, Math.max(node.min, Math.round(n))) : node.def;
    }
    case 'enum': return node.values.includes(v) ? v : node.def;
    case 'color': return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : node.def;
    case 'month': return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : '';
    case 'id': return typeof v === 'string' && /^[\w-]{1,40}$/.test(v) ? v : newId();
    case 'custom': return node.fn(v);
    case 'list':
      return Array.isArray(v) ? v.slice(0, node.max).map(x => clean(node.of, x)).filter(x => x !== '') : [];
    case 'obj': {
      const src = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
      const out = {};
      for (const [k, child] of Object.entries(node.shape)) out[k] = clean(child, src[k]);
      return out;
    }
    default: throw new Error(`Unknown schema type ${node.type}`);
  }
}

export function sanitizeContent(input) {
  const out = clean(contentSchema, input);
  // Ensure ids are unique within each collection.
  for (const key of ['technologies', 'experience', 'projects', 'achievements']) {
    const seen = new Set();
    for (const item of out[key]) {
      if (seen.has(item.id)) item.id = newId();
      seen.add(item.id);
    }
  }
  return out;
}
