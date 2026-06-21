const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const replacements = [
  [/hover:bg-slate-200/g, 'hover:bg-white/10'],
  [/hover:bg-slate-100/g, 'hover:bg-white/5'],
  [/bg-slate-800/g, 'bg-emerald-500/20 text-emerald-400'],
  [/bg-slate-900/g, 'bg-[#0d120f]'],
  [/bg-slate-200/g, 'bg-white/10'],
  [/border-slate-300/g, 'border-white/20'],
];

replacements.forEach(([regex, replacement]) => {
  content = content.replace(regex, replacement);
});

fs.writeFileSync('src/App.tsx', content, 'utf8');
console.log('Rest of replacements done!');
