import fs from 'fs';
import https from 'https';

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
};

const baseUrl = 'https://raw.githubusercontent.com/REDA-android/AgriScan-AI-1.0-/main/public/assets/models';
const files = [
  'mobilenetv3_small.tflite',
  'mobilenetv3_large.tflite',
  'mobilenetv2.tflite',
  'efficientnet_lite0.tflite',
  'plant_classifier.tflite'
];

async function run() {
  if (!fs.existsSync("public/assets/models")) {
    fs.mkdirSync("public/assets/models", { recursive: true });
  }

  for (const f of files) {
    try {
      console.log(`Downloading ${f}...`);
      await downloadFile(`${baseUrl}/${f}`, `public/assets/models/${f}`);
      console.log(`Successfully downloaded ${f}`);
    } catch(e) {
      console.error(`Failed ${f}:`, e);
    }
  }
}
run();
