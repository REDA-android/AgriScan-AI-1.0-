# Dossier des Modèles LiteRT (Analyse Offline)

Pour une analyse IA performante sans connexion, placez vos modèles `.tflite` dans ce dossier.

### ⚠️ IMPORTANT : Format TFLite uniquement
Sur Kaggle ou TFHub, vous verrez souvent plusieurs formats (TFJS, SavedModel, etc.).
- **NE PAS TÉLÉCHARGER** : Format **TFJS** (fichiers `model.json` + `.bin`). C'est pour le web classique, pas pour LiteRT.
- **TÉLÉCHARGER UNIQUEMENT** : La variation **TFLite** (un seul fichier fini par **`.tflite`**).

---

### Les 4 "Experts" recommandés pour cette application

| Modèle | Spécialité | Lien Direct Kaggle | Nom du fichier attendu |
|---|---|---|---|
| **CropNet** | Maladies des plantes | [Télécharger TFLite](https://www.kaggle.com/models/google/cropnet/tfLite) | `plant_classifier.tflite` |
| **AIy Plants** | +2000 espèces | [Télécharger TFLite](https://www.kaggle.com/models/google/aiy-plant-picasa-v1/tfLite) | `aiy_plants.tflite` |
| **MobileNet V3** | Ultra Rapide | [Télécharger TFLite](https://www.kaggle.com/models/google/mobilenet-v3/tfLite) | `mobilenet_v3.tflite` |
| **EfficientNet** | Très Précis | [Télécharger tensorflow/efficientnet](https://www.kaggle.com/models/tensorflow/efficientnet/tfLite) | `efficientnet_lite.tflite` |

---

### Instructions d'Installation
1. Téléchargez la variation **TFLite** d'un des modèles ci-dessus.
2. Copiez le fichier `.tflite` dans ce dossier : `/public/assets/models/`.
3. Assurez-vous que le nom du fichier correspond à ce qui est écrit dans le tableau (ou changez le chemin dans l'application).
4. L'application détectera automatiquement le modèle au démarrage.

### Pourquoi ces modèles ?
Ces modèles de **Vision** sont optimisés "Edge AI" :
- **Poids** : ~3 Mo à 15 Mo.
- **RAM/CPU** : Consommation quasi nulle, idéal pour rester fluide.
- **Confidentialité** : Aucune donnée ne quitte l'appareil.

