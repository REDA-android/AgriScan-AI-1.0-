import fs from 'fs';
import https from 'https';

https.get('https://api.github.com/repos/REDA-android/AgriScan-AI-1.0-/contents/public/assets/models', {
  headers: {
    'User-Agent': 'node.js'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const list = JSON.parse(data);
    if(Array.isArray(list)) {
       list.forEach(item => console.log(item.name, item.download_url));
    } else {
       console.log('Error:', data);
    }
  });
});
