# Configuration CORS pour Firebase Storage

Pour éviter les erreurs `Failed to fetch` lors du téléversement et de l'analyse d'images depuis votre application web mobile, vous devez configurer le partage de ressources cross-origin (CORS) sur votre bucket Firebase Storage.

Firebase Storage repose sur **Google Cloud Storage (GCS)**, ce qui vous permet de configurer le CORS à l'aide de l'outil en ligne de commande `gcloud` ou `gsutil`.

---

## Option 1 : Fichier JSON (Recommandé pour `gcloud` / `gsutil`)

Créez un fichier local nommé `cors.json` et appliquez-le à votre bucket.

```json
[
  {
    "origin": ["*"],
    "method": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "responseHeader": ["Content-Type", "Authorization", "Content-Length", "User-Agent", "x-goog-meta-*"],
    "maxAgeSeconds": 3600
  }
]
```

### Comment l'appliquer ?
1. Ouvrez votre terminal (où Google Cloud CLI / SDK est installé).
2. Connectez-vous à votre compte Google Cloud :
   ```bash
   gcloud auth login
   ```
3. Appliquez la configuration CORS sur votre bucket (remplacez `VOTRE_BUCKET_ID` par exemple par `openclaw-bot-494215.firebasestorage.app`) :
   ```bash
   gcloud storage buckets update gs://VOTRE_BUCKET_ID --cors-file=cors.json
   ```
   *Ou avec l'ancien outil `gsutil` :*
   ```bash
   gsutil cors set cors.json gs://VOTRE_BUCKET_ID
   ```

---

## Option 2 : Gabarit XML (Si requis par d'autres API S3 client)

Si vous configurez le compartiment à l'aide d'outils compatibles avec l'API S3 d'Amazon Web Services, voici le gabarit XML équivalent :

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <CORSRule>
        <AllowedOrigin>*</AllowedOrigin>
        <AllowedMethod>GET</AllowedMethod>
        <AllowedMethod>PUT</AllowedMethod>
        <AllowedMethod>POST</AllowedMethod>
        <AllowedMethod>DELETE</AllowedMethod>
        <AllowedMethod>HEAD</AllowedMethod>
        <MaxAgeSeconds>3600</MaxAgeSeconds>
        <AllowedHeader>Content-Type</AllowedHeader>
        <AllowedHeader>Authorization</AllowedHeader>
        <AllowedHeader>Content-Length</AllowedHeader>
        <AllowedHeader>User-Agent</AllowedHeader>
        <AllowedHeader>x-goog-meta-*</AllowedHeader>
    </CORSRule>
</CORSConfiguration>
```

---

## Vérification de la configuration
Une fois appliqué, vous pouvez vérifier les en-têtes actuellement configurés sur votre bucket avec la commande :
```bash
gcloud storage buckets describe gs://VOTRE_BUCKET_ID --format="default(cors)"
```
Les requêtes d'image préchargeront désormais l'en-tête `Access-Control-Allow-Origin: *` de manière transparente !
