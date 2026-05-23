/**
 * Cloudflare R2 presigned-URL helper.
 *
 * Generates batch PUT URLs for worker capture photos. The S3-compatible API
 * with the `requestChecksumCalculation: 'WHEN_REQUIRED'` workaround is the
 * proven shape from v2 (`_archive/codebases/eclean-v2-b2b/backend/src/modules/
 * media/media.service.ts`) — without that flag the SDK injects
 * `x-amz-checksum-*` query params into the URL that Cloudflare's signature
 * verifier rejects (root cause of v2's "photos not showing in admin" bug).
 *
 * Bucket and credentials live in env vars on Railway: `R2_ACCOUNT_ID`,
 * `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`. When any are
 * missing, every call returns `{ kind: 'NOT_CONFIGURED' }` and the route
 * surfaces 503 R2_NOT_CONFIGURED.
 *
 * @derives(WORKER_MVP_SLICE_2B_2_PLAN.md §1)
 */

import type { UploadUrlEntry, UploadUrlFile } from '@axhy/shared-schema';

/** Presigned PUT URL expiry. 1 hour covers slow networks + mobile retries. */
const PRESIGN_EXPIRY_SECONDS = 3600;

type S3ClientInstance = InstanceType<typeof import('@aws-sdk/client-s3').S3Client>;

let _s3: S3ClientInstance | null = null;

/** Lazy singleton — defer SDK init until first call so server boot stays fast. */
async function getS3Client(env: R2Env): Promise<S3ClientInstance> {
  if (_s3) return _s3;
  const { S3Client } = await import('@aws-sdk/client-s3');
  _s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
    // Disable auto-checksum middleware (SDK >=3.729). Cloudflare R2 rejects the
    // x-amz-checksum-* params it injects into presigned URLs with
    // SignatureDoesNotMatch. v2 hit this in production; lifted verbatim.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return _s3;
}

/** Test-only: drop the cached S3Client so the next call re-reads env. Tests
 *  may swap env vars between cases. Production code never touches this.
 *  @derives(master-plan §G) */
export function resetS3ClientForTests(): void {
  _s3 = null;
}

type R2Env = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
};

/** Read + validate the four R2 env vars. Returns null when any are missing. */
function readR2Env(): R2Env | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) return null;
  return { accountId, accessKeyId, secretAccessKey, bucketName };
}

/** Build the object key for one worker/visit/phase/index slot. v3 prefix keeps
 *  workspace cleanly separated from v2's `uploads/` prefix even though the
 *  bucket is currently dedicated.
 *
 *  Accepts a narrow Pick so worker-submit-service can call it with a
 *  WorkerSubmitPhoto (which has no fileSize) — only the three fields used in
 *  the key formula are required.
 * @derives(master-plan §G) */
export function buildObjectKey(
  workerId: string,
  visitId: string,
  file: Pick<UploadUrlFile, 'phase' | 'index' | 'contentType'>,
): string {
  const ext =
    file.contentType === 'image/png' ? 'png' : file.contentType === 'image/webp' ? 'webp' : 'jpg';
  const padded = String(file.index).padStart(2, '0');
  return `v3-captures/${workerId}/${visitId}/${file.phase}-${padded}.${ext}`;
}

/** @derives(master-plan §G) */
export type GenerateBatchResult =
  | { kind: 'OK'; entries: UploadUrlEntry[] }
  | { kind: 'NOT_CONFIGURED' };

/** Generate one presigned PUT URL per requested file. Returns NOT_CONFIGURED
 *  when env vars are missing so the route can return 503 without crashing.
 *
 * @derives(master-plan §G)
 */
export async function generateBatchUploadUrls(
  workerId: string,
  visitId: string,
  files: ReadonlyArray<UploadUrlFile>,
): Promise<GenerateBatchResult> {
  const env = readR2Env();
  if (!env) return { kind: 'NOT_CONFIGURED' };

  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const s3 = await getS3Client(env);

  const expiresAt = new Date(Date.now() + PRESIGN_EXPIRY_SECONDS * 1000).toISOString();

  const entries = await Promise.all(
    files.map(async (file): Promise<UploadUrlEntry> => {
      const objectKey = buildObjectKey(workerId, visitId, file);
      // ContentLength is intentionally NOT signed: R2 rejects the upload with
      // SignatureDoesNotMatch when the actual body byte length differs from
      // the signed value. The 20MB cap is enforced upstream by the Zod schema
      // before reaching this signer.
      const command = new PutObjectCommand({
        Bucket: env.bucketName,
        Key: objectKey,
        ContentType: file.contentType,
      });
      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRY_SECONDS });
      return {
        phase: file.phase,
        index: file.index,
        uploadUrl,
        objectKey,
        expiresAt,
      };
    }),
  );

  return { kind: 'OK', entries };
}
