# Exec Voice Replic8

Internal tool for security awareness training. Two capabilities: (1) automatically finds executives at a target company, extracts their voice from public media, and clones it in Cartesia for vishing simulations; (2) generates synthetic talking-head avatar videos from a portrait image and voice sample.

> **Internal use only** — for authorized security awareness training campaigns.

---

## What it does

### Voice Extraction

1. Enter a company name or URL
2. Discovers C-level executives from the company website + LinkedIn
3. Searches public media for interviews, podcasts, and keynotes featuring that executive
4. Downloads the audio, identifies the executive's voice via speaker diarization, and extracts a clean 30s clip
5. Clones the voice in Cartesia and exports a JSON payload ready to upload to the vishing platform

### Avatar Generation (Image-to-Avatar)

1. Upload a landscape portrait image and provide a voice (Cartesia Voice ID or ~5s audio sample)
2. Kling AI generates a short motion video from the still image
3. Cartesia clones the voice (or uses the provided ID) and synthesises TTS audio
4. HeyGen creates a talking-head video with lip-synced audio
5. ffmpeg merges the clips into a final composite video
6. (Optional) Upload to Beyond Presence to train a live interactive avatar

---

## Prerequisites

- **Node.js** 20+
- **yt-dlp** — for downloading audio from YouTube and other sources
- **ffmpeg** — for audio processing

```bash
# macOS
brew install yt-dlp ffmpeg

# Check they work
yt-dlp --version
ffmpeg -version
```

---

## Setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd VoiceExtractor

# 2. Install dependencies
npm install

# 3. Configure API keys
cp .env.local.example .env.local
# Open .env.local and fill in all keys (see API Keys section below)

# 4. Run locally
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with the password you set as `PENTEST_KEY`.

---

## API Keys

| Key | Purpose | Get it at |
|-----|---------|-----------|
| `PENTEST_KEY` | App login password — choose anything | — |
| `ANTHROPIC_API_KEY` | Executive parsing + gender inference | console.anthropic.com |
| `SERPER_API_KEY` | Google search (LinkedIn, photos, media) | serper.dev |
| `ASSEMBLYAI_API_KEY` | Speaker diarization (who is the exec?) | assemblyai.com |
| `CARTESIA_API_KEY` | Voice cloning + TTS | play.cartesia.ai |
| `KLING_ACCESS_KEY` / `KLING_SECRET_KEY` | Motion video generation (avatar pipeline) | klingai.com |
| `HEYGEN_API_KEY` | Talking-head video generation (avatar pipeline) | heygen.com |
| `BEY_API_KEY` | Beyond Presence avatar training (optional) | beyondpresence.ai |

Copy `.env.local.example` to `.env.local` and fill in each value. Keys marked "avatar pipeline" are only required for the Avatar Generation feature.

---

## Usage

### Avatar Generation

1. Go to the **Avatar Generation** tab
2. Upload a **landscape portrait** (width must be greater than height)
3. Enter an **avatar name**
4. Provide a voice via:
   - **Cartesia Voice ID** — if you already have a cloned voice
   - **Audio file** (~5s of clean speech, MP3/WAV/M4A/OGG) — to clone a new voice on the fly
5. Select a **language** (German, English, French, Spanish, Italian, Portuguese)
6. Click **Generate Avatar** — pipeline takes ~10–15 minutes
7. Preview the output of each step (motion video, TTS audio, talking-head video, final composite)
8. (Optional) Click **Upload to Beyond Presence** to start avatar training (~5–6 hours)

---

### Finding an executive's voice

1. Enter a **company name** (e.g. `Siemens`) or company website URL
2. Click **Find Executives** — a list of C-level executives loads with photos and LinkedIn links
3. Click an executive to select them
4. Use the **media type filter** (Podcast / YouTube / Keynote) to narrow sources
5. Select a media result and click **Extract Voice**

### Audio timeline

After extraction, the full audio is shown as a waveform with a highlighted 30s window showing which clip was selected.

- **Play** the clip to verify it's clean executive speech (no interviewer talking over)
- **Drag the window** to a better position if needed, then click **Use [time]** to re-extract
- **Download** the extracted clip if you need the raw audio

### Pushing to Cartesia

Once happy with the clip, click **Push to Cartesia**. The voice is cloned and a JSON payload appears — copy it and upload to the vishing platform.

---

## Notes

### Voice Extraction
- **Podcasts work best** — RSS-based download, reliable from any server
- **YouTube may fail on hosted deployments** due to datacenter IP blocking; works fine locally
- Speaker diarization requires AssemblyAI. Without `ASSEMBLYAI_API_KEY`, the tool falls back to a fixed 60–90s clip
- Voice clips should be 15–30s of clean, uninterrupted speech for best Cartesia results

### Avatar Generation
- Portrait image must be **landscape orientation** (wider than tall)
- Audio sample for voice cloning should be ~5 seconds of clean, uninterrupted speech
- The pipeline runs sequentially: Kling → Cartesia → HeyGen → merge. Total time ~10–15 minutes
- Job state is held in memory with a 2-hour TTL — refresh the page within that window to retrieve results
- Beyond Presence training is asynchronous; the avatar will not be live until training completes (~5–6 hours)
