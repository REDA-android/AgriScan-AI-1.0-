const fs = require('fs');
const path = require('path');

const dir = 'src/components';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx')).map(f => path.join(dir, f));

const replacements = [
  [/bg-white/g, 'bg-[#161c18]'],
  [/bg-slate-50/g, 'bg-[#0d120f]'],
  [/bg-slate-100/g, 'bg-white/5'],
  [/border-slate-100/g, 'border-white/5'],
  [/border-slate-200/g, 'border-white/10'],
  [/border-slate-300/g, 'border-white/20'],
  [/text-slate-900/g, 'text-white'],
  [/text-slate-800/g, 'text-slate-200'],
  [/text-slate-700/g, 'text-slate-300'],
  [/text-slate-600/g, 'text-slate-400'],
  [/text-emerald-900/g, 'text-emerald-400'],
  [/text-emerald-800/g, 'text-emerald-400'],
  [/text-emerald-700/g, 'text-emerald-400'],
  [/text-emerald-600/g, 'text-emerald-400'],
  [/text-slate-500/g, 'text-slate-400'],
  [/bg-emerald-100/g, 'bg-emerald-500/20'],
  [/bg-emerald-50/g, 'bg-emerald-500/10'],
  [/border-emerald-100/g, 'border-emerald-500/20'],
  [/border-emerald-200/g, 'border-emerald-500/30'],
  [/shadow-sm/g, 'shadow-none'],
  [/hover:bg-slate-200/g, 'hover:bg-white/10'],
  [/hover:bg-slate-100/g, 'hover:bg-white/5'],
  [/bg-slate-800/g, 'bg-emerald-500/20 text-emerald-400'],
  [/bg-slate-900/g, 'bg-[#0d120f]'],
  [/bg-slate-200/g, 'bg-white/10'],
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
  [new RegExp('bg-emerald-600 text-white rounded-xl text-\\\\[10px\\\\] font-bold uppercase', 'g'), 'bg-gradient-to-r from-emerald-400 to-[#124227] text-[#0d120f] rounded-full text-[10px] font-bold uppercase shadow-[0_0_15px_rgba(52,211,153,0.2)]'],
  [new RegExp('bg-emerald-600 text-white rounded-2xl font-black shadow-lg hover:bg-emerald-700', 'g'), 'bg-gradient-to-r from-emerald-400 to-[#124227] text-[#0d120f] rounded-full font-black hover:opacity-90 shadow-[0_0_15px_rgba(52,211,153,0.2)]'],
  [new RegExp('bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700', 'g'), 'bg-gradient-to-r from-emerald-400 to-[#124227] text-[#0d120f] rounded-full font-bold hover:opacity-90 shadow-[0_0_15px_rgba(52,211,153,0.2)]'],
  [new RegExp('bg-emerald-600 text-white rounded-full font-bold shadow-lg hover:bg-emerald-700', 'g'), 'bg-gradient-to-r from-emerald-400 to-[#124227] text-[#0d120f] rounded-full font-bold shadow-[0_0_15px_rgba(52,211,153,0.2)] hover:opacity-90'],
  [new RegExp('bg-emerald-600 p-4 text-white', 'g'), 'bg-[#161c18] border-b border-white/5 p-4 text-emerald-400'],
  [new RegExp('p-4 bg-emerald-600 text-white', 'g'), 'p-4 bg-[#161c18] border-b border-white/5 text-emerald-400'],
  [new RegExp('bg-emerald-600 text-white rounded-full shadow-lg shadow-emerald-600/30', 'g'), 'bg-emerald-500/20 text-emerald-400 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.3)]'],
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  replacements.forEach(([regex, replacement]) => {
    content = content.replace(regex, replacement);
  });
  fs.writeFileSync(file, content, 'utf8');
});
console.log('All components updated!');
