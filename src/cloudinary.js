// Cloudinary unsigned upload — safe to use from the browser.
// The cloud name + upload preset are public identifiers, not secrets.
// (The Cloudinary API secret is only ever used server-side for signed ops.)

export const CLOUDINARY_CLOUD_NAME =
  import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'iwc15fis'
export const CLOUDINARY_UPLOAD_PRESET =
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'ml_default'

export const cloudinaryUploadUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`

/**
 * Upload a File/Blob to Cloudinary via an unsigned preset.
 * Returns the secure_url string.
 */
export async function uploadToCloudinary(file) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET)
  const res = await fetch(cloudinaryUploadUrl, { method: 'POST', body: fd })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Cloudinary upload failed: ${res.status} ${errText}`)
  }
  const data = await res.json()
  return data.secure_url
}
