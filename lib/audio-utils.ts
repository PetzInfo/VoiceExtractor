import { spawn } from 'child_process'
import * as fs from 'fs/promises'

export function trimAudio(
  inputPath: string,
  outputPath: string,
  startSeconds = 30,
  durationSeconds = 30
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-i',
      inputPath,
      '-ss',
      String(startSeconds),
      '-t',
      String(durationSeconds),
      '-ar',
      '16000',
      '-ac',
      '1',
      '-c:a',
      'libmp3lame',
      '-y',
      outputPath,
    ])

    const stderrChunks: Buffer[] = []
    proc.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        const stderr = Buffer.concat(stderrChunks).toString().slice(-500)
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}. Is ffmpeg installed?`))
    })
  })
}

export async function cleanupTmpFiles(paths: string[]): Promise<void> {
  await Promise.allSettled(paths.map((p) => fs.unlink(p)))
}

export function bufferToBase64(buffer: Buffer): string {
  return buffer.toString('base64')
}

export function base64ToBuffer(base64: string): Buffer {
  return Buffer.from(base64, 'base64')
}
