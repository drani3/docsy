import r2Client from './client'
import {
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const BUCKET_NAME = process.env.R2_BUCKET_NAME!

const UPLOAD_URL_EXPIRY = 60 * 10 // 10 minutes
const DOWNLOAD_URL_EXPIRY = 60 * 5 // 5 minutes

export async function generateUploadUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  })

  return getSignedUrl(r2Client, command, { expiresIn: UPLOAD_URL_EXPIRY })
}

export async function generateDownloadUrl(key: string, fileName: string) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${fileName.replace(/["\\\r\n]/g, '_')}"`,
  })

  return getSignedUrl(r2Client, command, { expiresIn: DOWNLOAD_URL_EXPIRY })
}

// Returns the object's size, or null if it does not exist.
export async function getObjectSize(key: string): Promise<number | null> {
  try {
    const result = await r2Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }))
    return result.ContentLength ?? 0
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') {
      return null
    }
    throw error
  }
}

export async function deleteFile(key: string) {
  await r2Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }))
}

// Keys are derived only from server-generated IDs, never from the user's filename,
// so they cannot be used for path traversal or to collide with another user's objects.
export function generateStorageKey(userId: string, documentId: string): string {
  return `${userId}/${documentId}/original.pdf`
}
