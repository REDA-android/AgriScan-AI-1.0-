
import fetch from 'node-fetch';

const urls = [
  "https://storage.googleapis.com/mediapipe-models/image_classifier/mobilenet_v2_1.0_224/int8/1/mobilenet_v2_1.0_224.tflite",
  "https://storage.googleapis.com/mediapipe-models/image_classifier/mobilenet_v2_1.0_224/float32/1/mobilenet_v2_1.0_224.tflite",
  "https://storage.googleapis.com/mediapipe-tasks/image_classifier/mobilenet_v2_1.0_224_int8.tflite",
  "https://storage.googleapis.com/mediapipe-tasks/image_classifier/mobilenet_v2_1.0_224_fp32.tflite"
];

async function check() {
  for (const url of urls) {
    const res = await fetch(url, { method: 'HEAD' });
    console.log(url, res.status);
  }
}
check();
