const fs = require('fs');
const path = require('path');

const dir = 'src/components';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx')).map(f => path.join(dir, f));

const replacements = [
  [/bg-emerald-500\/100\/20/g, 'bg-emerald-500/20'],
  [/bg-emerald-500\/100/g, 'bg-emerald-500'],
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  replacements.forEach(([regex, replacement]) => {
    content = content.replace(regex, replacement);
  });
  fs.writeFileSync(file, content, 'utf8');
});

// App.tsx
let contentApp = fs.readFileSync('src/App.tsx', 'utf8');
contentApp = contentApp.replace(/bg-amber-500\/100\/20/g, 'bg-amber-500/20');
contentApp = contentApp.replace(/bg-amber-500\/100/g, 'bg-amber-500');
contentApp = contentApp.replace(/bg-emerald-500\/100/g, 'bg-emerald-500');
fs.writeFileSync('src/App.tsx', contentApp, 'utf8');

console.log('Fixed invalid tailwind colors!');
