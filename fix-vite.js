import fs from 'fs';

let content = fs.readFileSync('vite.config.ts', 'utf-8');
content = content.replace(/server: {[\s\S]*?},/, "server: {\n      hmr: false,\n    },");
fs.writeFileSync('vite.config.ts', content);
