const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
global.document = dom.window.document;
global.window = dom.window;

const code = fs.readFileSync('c:/Users/rrsha/Downloads/Relay_GitHub_Extension_Phase2/relay-github-extension/panel.js', 'utf8');

// Extract just the appendMessage function text
const match = code.match(/function appendMessage.*?ui\.messages\.append\(article\);\s*}/s);
if (!match) {
  console.log("Could not find appendMessage");
  process.exit(1);
}

const ui = { messages: document.createElement('div') };
const currentContext = {};

// Evaluate the function
const appendMessageStr = match[0];
const appendMessage = eval('(' + appendMessageStr + ')');

appendMessage({
  role: 'assistant',
  text: 'Here is your issue plan',
  issuePlan: {
    issues: [{ title: 'Fix bug', body: 'This is a bug' }]
  }
});

console.log(ui.messages.innerHTML);
