// ─── Avatar Utilities ──────────────────────────────────────────────────────
// Users can upload a photo (stored as base64 data URL or http URL).
// When no photo is set, a deterministic gradient is generated from username.

/**
 * Check if an avatarUrl is a real image (uploaded photo or http URL).
 */
export function isPhotoAvatar(avatarUrl: string | null | undefined): boolean {
  if (!avatarUrl) return false;
  return avatarUrl.startsWith('data:image/') || avatarUrl.startsWith('http') || avatarUrl.startsWith('/');
}

/**
 * Get gradient CSS for an avatar fallback (when no photo uploaded).
 * Generates a deterministic gradient from the username.
 */
export function getAvatarGradient(_avatarId: string | null | undefined, username: string): string {
  const colors = ['#7717ff', '#14F195', '#5b8def', '#f87171', '#fbbf24', '#34d399', '#c084fc', '#8b8bf5', '#ec4899', '#06b6d4', '#f97316', '#6366f1'];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c1 = colors[Math.abs(hash) % colors.length];
  const c2 = colors[Math.abs(hash * 7 + 3) % colors.length];
  return `linear-gradient(135deg, ${c1}, ${c2})`;
}

export function getInitials(name: string): string {
  return name.charAt(0).toUpperCase();
}

/**
 * Resize an image file to max dimensions and return as base64 JPEG data URL.
 * Used for avatar uploads — keeps file size small for DB storage.
 */
export function resizeImageToBase64(
  file: File,
  maxSize = 128,
  quality = 0.8,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Crop to square from center
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, maxSize, maxSize);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
