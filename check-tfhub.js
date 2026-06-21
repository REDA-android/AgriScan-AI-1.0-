import https from 'https';
const url = "https://tfhub.dev/google/lite-model/mobilenet_v2_1.0_224/quantized/1?lite-format=tflite";
https.get(url, (res) => {
    console.log(res.statusCode, res.headers.location);
});
