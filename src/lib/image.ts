const MAX_SIZE_BYTES = 256 * 1024;
const MAX_DIMENSION = 1024;

export interface ChatImage {
  url: string;
  width: number;
  height: number;
}

export async function compressImage(file: File): Promise<ChatImage> {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot create canvas context');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = 0.85;
  let blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });

  while (blob.size > MAX_SIZE_BYTES && quality > 0.1) {
    quality -= 0.1;
    blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  }

  const reader = new FileReader();
  const url = await new Promise<string>((resolve) => {
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });

  return { url, width, height };
}

export async function compressFromDataTransfer(
  items: DataTransferItemList,
): Promise<ChatImage | null> {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item?.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return compressImage(file);
    }
  }
  return null;
}
