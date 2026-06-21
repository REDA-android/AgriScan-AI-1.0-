const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const replacements = [
  [/bg-white/g, 'bg-[#161c18]'],
  [/bg-slate-50/g, 'bg-[#0d120f]'],
  [/bg-slate-100/g, 'bg-white/5'],
  [/border-slate-100/g, 'border-white/5'],
  [/border-slate-200/g, 'border-white/10'],
  [/text-slate-900/g, 'text-white'],
  [/text-slate-800/g, 'text-slate-200'],
  [/text-slate-700/g, 'text-slate-300'],
  [/text-slate-600/g, 'text-slate-400'],
  [/text-emerald-900/g, 'text-emerald-400'],
  [/text-emerald-800/g, 'text-emerald-400'],
  [/text-emerald-700/g, 'text-emerald-400'],
  [/text-emerald-600/g, 'text-emerald-400'],
  [/bg-emerald-100/g, 'bg-emerald-500/20'],
  [/bg-emerald-50/g, 'bg-emerald-500/10'],
  [/border-emerald-100/g, 'border-emerald-500/20'],
  [/border-emerald-200/g, 'border-emerald-500/30'],
  [/bg-\[#161c18\]\/80 backdrop-blur-sm/g, 'bg-[#161c18]/80 backdrop-blur-md'],
  [/bg-\[#161c18\]\/90 backdrop-blur-sm/g, 'bg-[#161c18]/80 backdrop-blur-md'],
  [/shadow-sm/g, 'shadow-none'],
];

replacements.forEach(([regex, replacement]) => {
  content = content.replace(regex, replacement);
});

fs.writeFileSync('src/App.tsx', content, 'utf8');
console.log('Replacements done!');
