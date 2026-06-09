import heic2any from 'heic2any';

export const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const response = await fetch(dataUrl);
  return await response.blob();
};

export const compressImage = async (file: File, maxWidth = 1024, maxHeight = 1024, quality = 0.7): Promise<{ dataUrl: string, blob: Blob }> => {
  let fileToProcess: Blob = file;
  
  // Convert HEIC to JPEG if necessary
  if (file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
    try {
      const converted = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: quality
      });
      fileToProcess = Array.isArray(converted) ? converted[0] : converted;
    } catch (e) {
      console.error("HEIC conversion failed", e);
      throw new Error("HEIC conversion failed");
    }
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Compression timeout")), 15000);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        try {
          clearTimeout(timeout);
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Canvas context not available'));
          
          ctx.drawImage(img, 0, 0, width, height);
          
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          canvas.toBlob((blob) => {
            if (blob) {
              resolve({ dataUrl, blob });
            } else {
              reject(new Error("Blob conversion failed"));
            }
          }, 'image/jpeg', quality);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = (error) => {
        clearTimeout(timeout);
        reject(error);
      };
    };
    reader.onerror = (error) => {
      clearTimeout(timeout);
      reject(error);
    };
    try {
      reader.readAsDataURL(fileToProcess);
    } catch (e) {
      clearTimeout(timeout);
      reject(e);
    }
  });
};
