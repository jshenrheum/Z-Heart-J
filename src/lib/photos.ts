import { MAX_PHOTO_BYTES } from './records.ts';

/** The longest side a photo keeps; plenty for a phone screen, small enough to keep many. */
const MAX_EDGE = 1600;

export class PhotoError extends Error {}

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new PhotoError(`“${file.name}” couldn’t be read. Try a JPEG or PNG.`));
    };
    img.src = url;
  });
}

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

/**
 * Shrinks a photo on the device before it's sent: the longest side to 1,600 px,
 * as a JPEG, upright (the browser applies the camera's rotation when it decodes),
 * and without the original's location and camera details, which the redraw drops.
 */
export async function preparePhoto(file: File): Promise<{ blob: Blob; w: number; h: number }> {
  if (!file.type.startsWith('image/')) throw new PhotoError(`“${file.name}” isn’t a photo.`);
  const img = await load(file);
  let edge = MAX_EDGE;
  for (const quality of [0.82, 0.72, 0.62, 0.62]) {
    const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new PhotoError('This browser can’t prepare photos.');
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await toBlob(canvas, quality);
    if (blob && blob.size <= MAX_PHOTO_BYTES) return { blob, w, h };
    edge = 1280;
  }
  throw new PhotoError(`“${file.name}” is too large to keep.`);
}
