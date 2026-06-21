import https from 'https';

const urls = [
  "https://storage.googleapis.com/mediapipe-models/image_classifier/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite",
  "https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/int8/1/efficientnet_lite0.tflite"
];

urls.forEach(u => {
  https.get(u, (res) => {
    console.log(u, res.statusCode);
  });
});
