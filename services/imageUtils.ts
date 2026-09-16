export const optimizeImage = (base64Str: string, maxWidth = 800): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round(height * (maxWidth / width));
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white'; // Ensure background is white for transparent PNGs
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => resolve(base64Str);
    img.src = base64Str;
  });
};

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const urlToBase64 = async (url: string): Promise<string> => {
  const fetchBlob = async (targetUrl: string) => {
      const response = await fetch(targetUrl);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
      return await response.blob();
  };

  // 1. Attempt Direct Fetch (cleanest)
  try {
    const blob = await fetchBlob(url);
    return await blobToBase64(blob);
  } catch (e) {
    console.warn("Direct fetch failed, switching to Proxy A...", e);
  }

  // 2. Attempt Proxy A (corsproxy.io)
  try {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const blob = await fetchBlob(proxyUrl);
    return await blobToBase64(blob);
  } catch (e) {
    console.warn("Proxy A failed, switching to Proxy B...", e);
  }

  // 3. Attempt Proxy B (allorigins.win)
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const blob = await fetchBlob(proxyUrl);
    return await blobToBase64(blob);
  } catch (e) {
    console.warn("Proxy B failed.", e);
  }

  // If all attempts fail, throw specific error to trigger UI Fallback
  throw new Error("CORS_ERROR");
};
