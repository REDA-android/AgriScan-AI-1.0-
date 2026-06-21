export const uploadToCloudinary = async (file: Blob, onProgress?: (progress: number) => void): Promise<string> => {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error("Configuration Cloudinary manquante (VITE_CLOUDINARY_CLOUD_NAME, VITE_CLOUDINARY_UPLOAD_PRESET).");
  }

  // Simulation of progress since fetch doesn't support it easily for upload without XHR
  if (onProgress) onProgress(30);

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);

  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    });

    if (onProgress) onProgress(70);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Erreur Cloudinary: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    if (onProgress) onProgress(100);
    return data.secure_url;
  } catch (error: any) {
    console.error("Cloudinary upload error:", error);
    throw error;
  }
};
