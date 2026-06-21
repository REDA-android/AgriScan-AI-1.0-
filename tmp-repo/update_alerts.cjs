const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const replacements = [
  [/bg-amber-50 text-amber-700/g, 'bg-amber-500/10 text-amber-400'],
  [/border-amber-200/g, 'border-amber-500/20'],
  [/border-amber-100/g, 'border-amber-500/20'],
  [/bg-amber-50/g, 'bg-amber-500/10'],
  [/text-amber-700/g, 'text-amber-400'],
  [/text-amber-600/g, 'text-amber-500'],
  [/text-amber-500/g, 'text-amber-400'],
  [/bg-red-50 text-red-600/g, 'bg-red-500/10 text-red-400'],
  [/border-red-200/g, 'border-red-500/20'],
  [/border-red-100/g, 'border-red-500/20'],
  [/bg-red-50/g, 'bg-red-500/10'],
  [/text-red-700/g, 'text-red-400'],
  [/text-red-600/g, 'text-red-400'],
  [/text-red-500/g, 'text-red-400'],
  [/bg-blue-50/g, 'bg-blue-500/10'],
  [/border-blue-50/g, 'border-blue-500/20'],
  [/text-blue-600/g, 'text-blue-400'],
];

replacements.forEach(([regex, replacement]) => {
  content = content.replace(regex, replacement);
});

fs.writeFileSync('src/App.tsx', content, 'utf8');
console.log('Rest of components updated!');
