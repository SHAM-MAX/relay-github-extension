// Tiny deterministic DOM/Chrome test doubles, NOT a browser or Chrome emulator.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {};
    this.handlers = {}; this.dataset = {}; this.value = ''; this.textContent = '';
    this.hidden = false; this.disabled = false; this.scrollHeight = 500;
    this.style = {};
  }
  contains(el) { return this === el || this.children.some(c => c.contains(el)); }
  get textContent() {
    return this._textContent || this.children.map(c => c.textContent).join('');
  }
  set textContent(val) {
    this._textContent = val;
    if (val) this.children = [];
  }
  get className() { return this.getAttribute('class') || ''; }
  set className(val) { this.setAttribute('class', val); }
  get classList() {
    const self = this;
    return {
      contains(cls) { return self.className.split(/\s+/).includes(cls); },
      add(cls) { const classes = new Set(self.className.split(/\s+/).filter(Boolean)); classes.add(cls); self.className = [...classes].join(' '); },
      remove(cls) { const classes = new Set(self.className.split(/\s+/).filter(Boolean)); classes.delete(cls); self.className = [...classes].join(' '); },
      toggle(cls) { if (this.contains(cls)) this.remove(cls); else this.add(cls); }
    };
  }
  append(...elements) { for (const el of elements) { el.parent = this; this.children.push(el); } }
  appendChild(el) { this.append(el); return el; }
  replaceChildren(...elements) { this.children = []; this.append(...elements); }
  setAttribute(key, value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key]; }
  addEventListener(type, callback) { (this.handlers[type] ||= []).push(callback); }
  removeEventListener(type, callback) { this.handlers[type] = (this.handlers[type] || []).filter(fn => fn !== callback); }
  async emit(type, detail = {}) {
    const event = { preventDefault() {}, stopPropagation() {}, ...detail };
    for (const callback of this.handlers[type] || []) await callback(event);
  }
  click() { return this.emit('click'); }
  focus() { this.focused = true; }
  requestSubmit() { return this.emit('submit'); }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  querySelectorAll(selector) {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      return walk(this).filter(el => el.classList && el.classList.contains(cls));
    }
    return [];
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  closest(selector) {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      let curr = this;
      while (curr) {
        if (curr.classList && curr.classList.contains(cls)) return curr;
        curr = curr.parent;
      }
    }
    return null;
  }
}
function walk(el) { return [el, ...el.children.flatMap(walk)]; }
function documentFixture(panel = false) {
  const document = new Element('document');
  document.documentElement = new Element('html'); document.append(document.documentElement);
  document.body = new Element('body'); document.documentElement.append(document.body);
  document.createElement = tag => new Element(tag);
  document.getElementById = id => walk(document).find(el => el.id === id) || null;
  document.querySelectorAll = selector => selector === '[data-relay-prompt]' ? walk(document).filter(el => el.dataset.relayPrompt) : [];
  document.querySelector = () => null;
  if (panel) {
    const html = fs.readFileSync(path.join(root, 'panel.html'), 'utf8');
    for (const match of html.matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"([^>]*)>/g)) {
      const element = document.createElement(match[1]); element.id = match[2];
      element.hidden = /\bhidden\b/.test(match[0]); 
      const classMatch = match[3].match(/\bclass="([^"]+)"/);
      if (classMatch) element.className = classMatch[1];
      if (element.hidden && !element.classList.contains('hidden')) element.classList.add('hidden');
      document.body.append(element);
    }
    for (const match of html.matchAll(/data-relay-prompt="([^"]+)"/g)) {
      const element = document.createElement('button'); element.dataset.relayPrompt = match[1]; document.body.append(element);
    }
  }
  return document;
}
function event() {
  const listeners = [];
  return { listeners, addListener: callback => listeners.push(callback), emit: (...args) => listeners.map(callback => callback(...args)) };
}
function environment({ panel = false, url = 'https://github.com/SHAM-MAX/new-kanban-board' } = {}) {
  const document = documentFixture(panel);
  const timers = new Map(); const intervals = []; const observers = []; const sent = [];
  let nextTimer = 1;
  const window = new Element('window'); window.parent = window; window.postMessage = (msg) => Promise.resolve().then(() => window.emit('message', { data: msg, source: window }));
  const location = { href: url };
  const current = { id: 10, windowId: 1, url };
  const chrome = {
    runtime: { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', onMessage: event(), onStartup: event(), onInstalled: event(), getURL: path => 'chrome-extension://' + path, sendMessage: async message => { sent.push(message); return { ok: true }; } },
    tabs: { query: (q, cb) => cb ? cb([{ ...current }]) : Promise.resolve([{ ...current }]), sendMessage: (id, msg, cb) => { const ctx = { url: current.url, branch: null, owner: 'SHAM-MAX', repository: 'new-kanban-board' }; return cb ? cb({ context: ctx }) : Promise.resolve({ context: ctx }); }, onActivated: event(), onUpdated: event(), onRemoved: event() },
    windows: { getCurrent: async () => ({ id: 1 }) },
    action: { onClicked: event(), setBadgeText() {}, setTitle() {} },
    sidePanel: { open: async () => {}, setOptions: async () => {} },
    storage: { local: { get: (keys, cb) => cb && cb({}), set: (obj, cb) => cb && cb(), remove: (key, cb) => cb && cb() } }
  };
  const scope = vm.createContext({
    URL, console, document, window, location, chrome, fetch,
    setTimeout: (callback, delay) => { const id = nextTimer++; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval: callback => { intervals.push(callback); return intervals.length; },
    clearInterval() {},
    MutationObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() {} }
  });
  const run = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), scope, { filename: file });
  async function tick(delay) {
    const ready = [...timers.entries()].filter(([, timer]) => delay === undefined || timer.delay === delay);
    for (const [id, timer] of ready) { timers.delete(id); timer.callback(); }
    await settle();
  }
  return { scope, chrome, current, location, document, window, observers, sent, intervals, run, tick, timers, get: suffix => document.getElementById('relay-ai-' + suffix) };
}
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
module.exports = { environment, settle, walk, root };
