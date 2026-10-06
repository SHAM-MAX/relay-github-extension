const fs = require('fs');

// Fix CSS
let css = fs.readFileSync('panel.css', 'utf8');
css = css.replace(/\.relay-ai-issue-desc\s*\{[\s\S]*?line-height:\s*1\.5;\s*\}/, 
'.relay-ai-issue-desc {\n  margin: 0;\n  color: #a9bcda;\n  font-size: 12px;\n  line-height: 1.5;\n  white-space: pre-wrap;\n}');
fs.writeFileSync('panel.css', css);

// Fix JS labels rendering
let js = fs.readFileSync('panel.js', 'utf8');
const jsReplacement = `            for (const rawLabel of issue.labels) {
              const parts = typeof rawLabel === 'string' ? rawLabel.split(',') : [rawLabel];
              for (const p of parts) {
                const clean = (typeof p === 'string' ? p.trim() : p);
                if (!clean) continue;
                const span = document.createElement("span");
                span.className = "relay-ai-issue-label";
                span.textContent = clean;
                labelsDiv.append(span);
              }
            }`;

js = js.replace(/for\s*\(\s*const\s+label\s+of\s+issue\.labels\s*\)\s*\{[\s\S]*?labelsDiv\.append\(span\);\s*\}/, jsReplacement);

fs.writeFileSync('panel.js', js);
console.log('Fixed panel.js and panel.css');
