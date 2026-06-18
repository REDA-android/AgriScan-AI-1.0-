# Dossier des Modèles LiteRT (Analyse Offline)

Pour une analyse IA performante sans consommer trop de ressources (RAM/CPU/GPU), voici une sélection de 10 modèles optimisés (format `.tflite`).

### 10 Modèles Recommandés (Légers & Puissants)

| # | Modèle | Usage Idéal | Lien de téléchargement (Kaggle/TFHub) |
|---|---|---|---|
| 1 | **CropNet** | Maladies des cultures (Ultra précis) | [Kaggle - CropNet](https://www.kaggle.com/models/google/cropnet) |
| 2 | **MobileNet V3 (Small)** | Vitesse absolue, très peu de RAM | [TFHub - MobileNet V3](https://tfhub.dev/google/imagenet/mobilenet_v3_small_100_224/classification/5) |
| 3 | **EfficientNet-Lite** | Meilleur rapport précision/légèreté | [TFHub - EfficientNet Lite B0](https://tfhub.dev/tensorflow/efficientnet/lite0/classification/2) |
| 4 | **MobileNet V2** | Le standard industrie (très stable) | [TFHub - MobileNet V2](https://tfhub.dev/google/tf2-preview/mobilenet_v2/classification/4) |
| 5 | **AIy Plant Classifier** | Reconnais +2000 espèces de plantes | [Kaggle - AIy Plant](https://www.kaggle.com/models/google/aiy-plant-picasa-v1) |
| 6 | **iNaturalist (Vision)** | Biodiversité (Plantes et Animaux) | [TFHub - iNaturalist](https://tfhub.dev/google/inaturalist/v2/vision/classifier/1) |
| 7 | **ShuffleNet V2** | Optimisé pour le processeur mobile | [TFHub - ShuffleNet](https://tfhub.dev/google/imagenet/shufflenet_v2_1_0_224/classification/1) |
| 8 | **MnasNet** | Designé par IA pour être rapide | [TFHub - MnasNet](https://tfhub.dev/google/imagenet/mnasnet_1.0_224/classification/4) |
| 9 | **GhostNet** | Utilise des opérations "bon marché" | [Kaggle - GhostNet](https://www.kaggle.com/models/google/ghostnet) |
| 10 | **SqueezeNet** | Taille de fichier dérisoire (< 5 Mo) | [TFHub - SqueezeNet](https://tfhub.dev/google/imagenet/squeezenet_v1.1/classification/1) |

---

### Instructions d'Installation
1. Choisissez un modèle dans la liste ci-dessus.
2. Téléchargez le fichier `.tflite`.
3. **Renommez-le** impérativement en : `plant_classifier.tflite`.
4. Copiez ce fichier dans ce dossier : `/public/models/`.

### Pourquoi ces modèles ?
Contrairement à des modèles comme **Gemma** ou **LLama** (qui sont des modèles de texte demandant beaucoup de mémoire), ces modèles de **Vision** sont conçus pour s'exécuter localement sur votre téléphone ou ordinateur sans ralentir le système.

- **Poids** : ~5 Mo à 20 Mo.
- **Vitesse** : Analyse en quelques millisecondes.
- **Confidentialité** : Aucune image ne quitte votre appareil local.

