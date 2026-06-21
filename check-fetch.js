import fetch from 'node-fetch';

const check = async () => {
    const res = await fetch("https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/float32/1/efficientnet_lite0.tflite");
    console.log(res.status);
    const res2 = await fetch("https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/int8/1/efficientnet_lite0.tflite");
    console.log(res2.status);
}
check();
