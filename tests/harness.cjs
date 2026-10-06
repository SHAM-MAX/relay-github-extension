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
  append(...elements) { for (const el of elements) { el.parent = this; this.children.push(el); } }
  replaceChildren(...elements) { this.children = []; this.append(...elements); }
  setAttribute(key, value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key]; }
  addEventListener(type, callback) { (this.handlers[type] ||= []).push(callback); }
  removeEventListener(type, callback) { this.handlers[type] = (this.handlers[type] || []).filter(fn => fn !== callback); }
  async emit(type, detail = {}) {
    const event = { preventDefault() {}, ...detail };
    for (const callback of this.handlers[type] || []) await callback(event);
  }
  click() { return this.emit('click'); }
  focus() { this.focused = true; }
  requestSubmit() { return this.emit('submit'); }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
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
    for (const match of html.matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
      const element = document.createElement(match[1]); element.id = match[2];
      element.hidden = /\bhidden\b/.test(match[0]); document.body.append(element);
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
  const window = new Element('window');
  const location = { href: url };
  const current = { id: 10, windowId: 1, url };
  const chrome = {
    runtime: { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', onMessage: event(), onStartup: event(), onInstalled: event(), sendMessage: async message => { sent.push(message); return { ok: true }; } },
    tabs: { query: async () => [{ ...current }], sendMessage: async () => ({ context: { url: current.url, branch: null } }), onActivated: event(), onUpdated: event(), onRemoved: event() },
    windows: { getCurrent: async () => ({ id: 1 }) },
    action: { onClicked: event(), setBadgeText() {}, setTitle() {} },
    sidePanel: { open: async () => {} }
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
