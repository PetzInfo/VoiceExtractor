import jwt from 'jsonwebtoken'
import * as fs from 'fs/promises'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { v4 as uuidv4 } from 'uuid'

const BASE_URL = 'https://api-singapore.klingai.com/v1'
const POLL_INTERVAL_MS = 5_000
const TIMEOUT_MS = 300_000

function getToken(accessKey: string, secretKey: string): string {
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(
    { iss: accessKey, exp: now + 1800, nbf: now - 5, iat: now },
    secretKey,
    { algorithm: 'HS256' }
  )
}

function authHeaders(accessKey: string, secretKey: string) {
  return {
    Authorization: `Bearer ${getToken(accessKey, secretKey)}`,
    'Content-Type': 'application/json',
  }
}

export async function generateKlingVideo(
  imageBase64: string,
  prompt: string,
  duration: number = 10
): Promise<string> {
  const accessKey = process.env.KLING_ACCESS_KEY
  const secretKey = process.env.KLING_SECRET_KEY
  if (!accessKey || !secretKey) throw new Error('KLING_ACCESS_KEY / KLING_SECRET_KEY not configured')

  // Strip data URL prefix if present
  const rawBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '')

  const resp = await fetch(`${BASE_URL}/videos/image2video`, {
    method: 'POST',
    headers: authHeaders(accessKey, secretKey),
    body: JSON.stringify({ model: 'kling-v3', image: rawBase64, prompt, duration, mode: 'std' }),
  })
  if (!resp.ok) throw new Error(`Kling API error ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  const taskId: string = data.data.task_id

  return pollAndDownload(accessKey, secretKey, taskId)
}

async function pollAndDownload(accessKey: string, secretKey: string, taskId: string): Promise<string> {
  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    const resp = await fetch(`${BASE_URL}/videos/image2video/${taskId}`, {
      headers: authHeaders(accessKey, secretKey),
    })
    if (!resp.ok) throw new Error(`Kling poll error ${resp.status}: ${await resp.text()}`)
    const body = await resp.json()
    const status: string = body.data.task_status

    if (status === 'succeed') {
      const videoUrl: string = body.data.task_result.videos[0].url
      return downloadToTmp(videoUrl, `${uuidv4()}_kling.mp4`)
    }
    if (status === 'failed') {
      throw new Error(`Kling task failed: ${body.data.task_status_msg ?? 'unknown'}`)
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error(`Kling task ${taskId} timed out after ${TIMEOUT_MS / 1000}s`)
}

async function downloadToTmp(url: string, filename: string): Promise<string> {
  const dest = `/tmp/${filename}`
  const resp = await fetch(url)
  if (!resp.ok || !resp.body) throw new Error(`Failed to download Kling video: ${resp.status}`)
  const ws = createWriteStream(dest)
  await pipeline(Readable.fromWeb(resp.body as import('stream/web').ReadableStream), ws)
  return dest
}
