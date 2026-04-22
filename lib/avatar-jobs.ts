/**
 * In-memory job store for avatar generation pipeline.
 * Jobs survive client disconnects — the pipeline runs to completion regardless.
 * Jobs are cleaned up after JOB_TTL_MS to prevent unbounded memory growth.
 */

import { unlink } from 'fs/promises'

export type MediaType = 'idle' | 'tts' | 'heygen' | 'final'

export interface JobStep {
  label: string
  status: 'idle' | 'running' | 'done' | 'error'
}

export interface AvatarJob {
  id: string
  createdAt: number
  steps: JobStep[]
  status: 'running' | 'done' | 'error'
  error?: string
  // HeyGen video IDs for idle and heygen — videos stay on HeyGen's CDN, never downloaded
  heygenVideoIds: { idle?: string; heygen?: string }
  // File paths on disk — only tts (small) and final (served via streaming endpoint)
  media: Partial<Record<MediaType, { filePath: string; mimeType: string }>>
}

const JOB_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

const jobs = new Map<string, AvatarJob>()

function deleteJobFiles(job: AvatarJob) {
  for (const m of Object.values(job.media)) {
    unlink(m.filePath).catch(() => {})
  }
}

export function createJob(id: string): AvatarJob {
  const job: AvatarJob = {
    id,
    createdAt: Date.now(),
    steps: [
      { label: 'Generating idle video', status: 'idle' },
      { label: 'Preparing voice', status: 'idle' },
      { label: 'Generating talking-head video', status: 'idle' },
      { label: 'Merging final video', status: 'idle' },
    ],
    status: 'running',
    heygenVideoIds: {},
    media: {},
  }
  jobs.set(id, job)
  setTimeout(() => {
    const j = jobs.get(id)
    if (j) deleteJobFiles(j)
    jobs.delete(id)
  }, JOB_TTL_MS)
  return job
}

export function getJob(id: string): AvatarJob | undefined {
  return jobs.get(id)
}

export function updateJobStep(id: string, stepIndex: number, status: JobStep['status']): void {
  const job = jobs.get(id)
  if (!job) return
  job.steps[stepIndex] = { ...job.steps[stepIndex], status }
}

export function setHeygenVideoId(id: string, type: 'idle' | 'heygen', videoId: string): void {
  const job = jobs.get(id)
  if (!job) return
  job.heygenVideoIds[type] = videoId
}

export function setJobMedia(id: string, type: MediaType, filePath: string, mimeType: string): void {
  const job = jobs.get(id)
  if (!job) return
  job.media[type] = { filePath, mimeType }
}

export function getJobMedia(id: string, type: MediaType): { filePath: string; mimeType: string } | undefined {
  return jobs.get(id)?.media[type]
}

export function completeJob(id: string): void {
  const job = jobs.get(id)
  if (!job) return
  job.status = 'done'
}

export function failJob(id: string, error: string): void {
  const job = jobs.get(id)
  if (!job) return
  job.status = 'error'
  job.error = error
  for (const step of job.steps) {
    if (step.status === 'running') step.status = 'error'
  }
  deleteJobFiles(job)
}
