/**
 * In-memory job store for avatar generation pipeline.
 * Jobs survive client disconnects — the pipeline runs to completion regardless.
 * Jobs are cleaned up after JOB_TTL_MS to prevent unbounded memory growth.
 */

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
  // Interim + final media — stored as Buffer, served on demand
  media: Partial<Record<MediaType, { buffer: Buffer; mimeType: string }>>
}

const JOB_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

const jobs = new Map<string, AvatarJob>()

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
    media: {},
  }
  jobs.set(id, job)
  setTimeout(() => jobs.delete(id), JOB_TTL_MS)
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

export function setJobMedia(id: string, type: MediaType, buffer: Buffer, mimeType: string): void {
  const job = jobs.get(id)
  if (!job) return
  job.media[type] = { buffer, mimeType }
}

export function getJobMedia(id: string, type: MediaType): { buffer: Buffer; mimeType: string } | undefined {
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
}
