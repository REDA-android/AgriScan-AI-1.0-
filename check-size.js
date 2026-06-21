import fs from 'fs';

const files = fs.readdirSync('public/assets/models/');
files.forEach(f => {
    const stats = fs.statSync('public/assets/models/' + f);
    console.log(`${f} - ${stats.size} bytes`);
});
