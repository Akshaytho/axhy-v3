/**
 * Photo attachment pipeline for the chat surface.
 *
 * Lifecycle (3 steps):
 *
 *   1. `pickImage()` — opens a picker and returns a local Blob + mime.
 *      - Web: HTML `<input type="file" accept="image/*">`.
 *      - Native: dynamically imports `expo-image-picker` if present.
 *        If absent (this build does not ship the picker yet), surfaces a
 *        clean error — no placeholder, no silent no-op.
 *
 *   2. `requestUploadSlot(mime, size)` — calls `POST /uploads/sign-image`
 *      to mint a one-shot S3 PUT URL plus the matching public GET URL.
 *      Backend returns `{ putUrl, getUrl, expiresAt }`. If the backend
 *      lacks the route (404), surfaces a clean error: "Photo upload
 *      service not yet available."
 *
 *   3. `putToSignedUrl(putUrl, blob, mime)` — single PUT to S3, no
 *      Authorization header (the URL is the credential).
 *
 * The chat screen composes these as `uploadPhotoAttachment()` and threads
 * the resulting `getUrl` into the chat send body's `attachments[]`.
 *
 * Size cap: 8 MB before upload. The backend has its own cap; this is the
 * client's first line of defence so we don't waste bandwidth on a too-big
 * blob.
 *
 * @derives(supervisor-drawer-and-decisions-redesign.md §C — chat photo attach)
 * @derives(master-plan §G) — supervisor surface
 */

import { ApiError, apiFetch } from '../api';

/**
 * Detect the web platform without importing react-native (whose Flow-typed
 * source confuses vitest's Rollup-based SSR transform). The DOM-only
 * `document` global is present on web (and Expo web's react-native-web
 * shim) and absent on native runtimes — a clean enough signal for the
 * picker fork.
 */
function isWebPlatform(): boolean {
  return typeof document !== 'undefined';
}

/** Maximum size of an uploaded photo, in bytes. 8 MB matches Whisper's 10 MB. */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** Local pick result before upload. Held in component state until PUT succeeds. */
export type LocalImagePick = {
  readonly blob: Blob;
  readonly mime: string;
  /**
   * Object URL (web) or local file URI (native). Safe to render in
   * <Image source={{ uri }}>. The caller is responsible for revoking
   * object URLs when the pick is removed.
   */
  readonly previewUri: string;
  readonly sizeBytes: number;
};

/** Backend response shape from `POST /uploads/sign-image`. */
type UploadSlotResponse = {
  readonly putUrl: string;
  readonly getUrl: string;
  /** ISO-8601 timestamp. After this the PUT URL no longer accepts uploads. */
  readonly expiresAt: string;
};

/** Final attachment ready to send on the chat body. */
export type UploadedAttachment = {
  readonly type: 'image';
  /** Signed (or public) GET URL the AI tool-loop can render and reason about. */
  readonly url: string;
};

/**
 * Open the platform's image picker. Returns null when the user cancels.
 *
 * On web we synthesise a hidden `<input type="file">`, click it, and resolve
 * on `change`. We do not keep the input mounted — this keeps the chat
 * surface free of focus-ring artefacts.
 *
 * On native we dynamically import `expo-image-picker`. If the import fails
 * (the library is not installed in this build), we throw with a precise
 * message so the chat screen can render a clean banner.
 */
export async function pickImage(): Promise<LocalImagePick | null> {
  if (isWebPlatform()) {
    return pickImageWeb();
  }
  return pickImageNative();
}

/** Web picker via DOM `<input type="file">`. */
function pickImageWeb(): Promise<LocalImagePick | null> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Photo attach requires a document context.'));
  }
  return new Promise<LocalImagePick | null>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.opacity = '0';
    document.body.appendChild(input);

    let settled = false;
    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };

    input.addEventListener('change', () => {
      if (settled) return;
      settled = true;
      const file = input.files && input.files.length > 0 ? input.files[0] : null;
      cleanup();
      if (!file) {
        resolve(null);
        return;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        reject(
          new Error(`Photo is too large. Max ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)} MB.`),
        );
        return;
      }
      const previewUri = URL.createObjectURL(file);
      resolve({
        blob: file,
        mime: file.type || 'image/jpeg',
        previewUri,
        sizeBytes: file.size,
      });
    });

    // Some browsers do not fire 'change' on cancel; we rely on the user
    // not lingering for hours on the picker. No timeout — that would be a
    // worse UX than a no-op.
    input.click();
  });
}

/**
 * Native picker. Sprint 2 ships the chat photo-attach surface on web
 * (DevTools-verified per the plan §I); native picker requires
 * `expo-image-picker` which is not in this build's deps. Until a future
 * sprint adds the dependency, native callers get a clean explanatory
 * error — no placeholder, no silent no-op.
 *
 * The decision to NOT dynamic-import here is deliberate: Rollup / Vite's
 * SSR transform (used by vitest in this repo) rejects `import(variable)`
 * specifiers at parse time. A future sprint that adds the dep should
 * convert this to a real static import + Platform.OS gate, then ship the
 * native surface alongside.
 */
function pickImageNative(): Promise<LocalImagePick | null> {
  return Promise.reject(
    new Error(
      'Photo attach is not available in this build. Please update the app or use the web supervisor surface for now.',
    ),
  );
}

/**
 * Mint a one-shot S3 PUT URL from the backend. The backend route is
 * `POST /uploads/sign-image` with body `{ mime, sizeBytes }`.
 *
 * If the backend returns 404 (route not yet deployed), we surface a clean
 * Error the chat screen can render as a banner. No silent failure.
 */
export async function requestUploadSlot(
  mime: string,
  sizeBytes: number,
): Promise<UploadSlotResponse> {
  try {
    return await apiFetch<UploadSlotResponse>('/uploads/sign-image', {
      method: 'POST',
      body: { mime, sizeBytes },
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      throw new Error('Photo upload service not yet available. Please try again later.');
    }
    throw err;
  }
}

/**
 * Single PUT to the S3 signed URL. The URL embeds the credential, so we
 * do NOT add an Authorization header. We DO set Content-Type — S3 checks
 * the header against the signed mime.
 */
export async function putToSignedUrl(putUrl: string, blob: Blob, mime: string): Promise<void> {
  const res = await fetch(putUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mime },
    body: blob,
  });
  if (!res.ok) {
    throw new Error(`Photo upload failed (HTTP ${res.status}). Please try again.`);
  }
}

/**
 * Inputs to the end-to-end upload pipeline. Subset of LocalImagePick — the
 * preview URI is not needed once the blob is in hand.
 */
export type UploadInput = {
  readonly blob: Blob;
  readonly mime: string;
  readonly sizeBytes: number;
};

/**
 * Compose the three steps end-to-end. Called by the chat surface when the
 * supervisor confirms a pick.
 *
 * Returns the attachment ready to put into the chat send body's
 * `attachments[]` array.
 */
export async function uploadPhotoAttachment(input: UploadInput): Promise<UploadedAttachment> {
  const slot = await requestUploadSlot(input.mime, input.sizeBytes);
  await putToSignedUrl(slot.putUrl, input.blob, input.mime);
  return { type: 'image', url: slot.getUrl };
}
