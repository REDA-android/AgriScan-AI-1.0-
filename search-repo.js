import https from 'https';

https.get('https://api.github.com/repos/REDA-android/AgriScan-AI-1.0-/git/trees/main?recursive=1', {
  headers: {
    'User-Agent': 'node.js'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const list = JSON.parse(data);
    if(list.tree) {
       list.tree.forEach(item => {
           if(item.path.endsWith('.tflite')) console.log(item.path);
       });
    } else {
       console.log('Error:', data);
    }
  });
});
