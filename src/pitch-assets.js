// Browser-local preparation only. Files never leave the device.
const databaseName = "anti-private-pitch-assets";
let database;
function openDatabase() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("images");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("This browser could not open local image storage."));
  });
  return database;
}
export async function readImages() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("images", "readonly");
    const store = transaction.objectStore("images");
    const keys = store.getAllKeys(),
      values = store.getAll();
    transaction.oncomplete = () =>
      resolve(new Map(keys.result.map((key, i) => [key, values.result[i]])));
    transaction.onerror = () =>
      reject(new Error("Saved images could not be read."));
  });
}
export async function saveImage(id, file) {
  if (
    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)
  )
    throw new Error("Choose a PNG, JPG, WebP, or GIF image.");
  if (!file.size || file.size > 5 * 1024 * 1024)
    throw new Error("Choose an image smaller than 5 MB.");
  const url = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = resolve;
      image.onerror = () =>
        reject(new Error("That file could not be opened as an image."));
      image.src = url;
    });
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("images", "readwrite");
      transaction.objectStore("images").put(file, id);
      transaction.oncomplete = resolve;
      transaction.onerror = () =>
        reject(
          new Error(
            "This browser could not save the image. Check available storage.",
          ),
        );
    });
    return url;
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
