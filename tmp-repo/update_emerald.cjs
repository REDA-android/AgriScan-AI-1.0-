const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const replacements = [
  // Primary buttons
  [/bg-emerald-600 text-white rounded-xl text-\[10px\] font-bold uppercase/g, 'bg-gradient-to-r from-emerald-400 to-[#124227] text-[#0d120f] rounded-full text-[10px] font-bold uppercase shadow-[0_0_15px_rgba(52,211,153,0.2)]'],
  [/bg-emerald-600 text-white rounded-2xl font-black shadow-lg hover:bg-emerald-700/g, 'bg-gradient-to-r from-emerald-400 to-[#124227] text-[#0d120f] rounded-full font-black hover:opacity-90 shadow-[0_0_15px_rgba(52,211,153,0.2)]'],
  [/bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700/g, 'bg-gradient-to-r from-emerald-400 to-[#124227] text-[#0d120f] rounded-full font-bold hover:opacity-90 shadow-[0_0_15px_rgba(52,211,153,0.2)]'],
  [/bg-emerald-600 text-white rounded-full font-bold shadow-lg hover:bg-emerald-700/g, 'bg-gradient-to-r from-emerald-400 to-[#124227] text-[#0d120f] rounded-full font-bold shadow-[0_0_15px_rgba(52,211,153,0.2)] hover:opacity-90'],
  // Headers/banners with emerald
  [/bg-emerald-600 p-4 text-white/g, 'bg-[#161c18] border-b border-white/5 p-4 text-emerald-400'],
  [/p-4 bg-emerald-600 text-white/g, 'p-4 bg-[#161c18] border-b border-white/5 text-emerald-400'],
  // The central scan button
  [/bg-emerald-600 text-white rounded-full shadow-lg shadow-emerald-600\/30/g, 'bg-emerald-500/20 text-emerald-400 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.3)]'],
];

replacements.forEach(([regex, replacement]) => {
  content = content.replace(regex, replacement);
});

fs.writeFileSync('src/App.tsx', content, 'utf8');
console.log('Emerald buttons replacements done!');
