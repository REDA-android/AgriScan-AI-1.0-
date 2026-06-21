import fetch from 'node-fetch';

const check = async () => {
    const res = await fetch("https://storage.googleapis.com/mediapipe-models/image_classifier/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite");
    console.log(res.status);
}
check();
