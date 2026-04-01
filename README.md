# Exec Voice Replic8

Internal tool for security awareness training. Automatically finds executives at a target company, extracts their voice from public media (podcasts, YouTube, keynotes), and clones it in Cartesia for vishing simulations.

> **Internal use only** — for authorized security awareness training campaigns.

---

## What it does

1. Enter a company name or URL
2. Discovers C-level executives from the company website + LinkedIn
3. Searches public media for interviews, podcasts, and keynotes featuring that executive
4. Downloads the audio, identifies the executive's voice via speaker diarization, and extracts a clean 30s clip
5. Clones the voice in Cartesia and exports a JSON payload ready to upload to the vishing platform

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

You need four API keys. All have free tiers sufficient for internal use:

| Key | Purpose | Get it at |
|-----|---------|-----------|
| `PENTEST_KEY` | App login password — choose anything | — |
| `ANTHROPIC_API_KEY` | Executive parsing + gender inference | console.anthropic.com |
| `SERPER_API_KEY` | Google search (LinkedIn, photos, media) | serper.dev |
| `ASSEMBLYAI_API_KEY` | Speaker diarization (who is the exec?) | assemblyai.com |
| `CARTESIA_API_KEY` | Voice cloning | play.cartesia.ai |

Copy `.env.local.example` to `.env.local` and fill in each value.

---

## Usage

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

- **Podcasts work best** — RSS-based download, reliable from any server
- **YouTube may fail on hosted deployments** due to datacenter IP blocking; works fine locally
- Speaker diarization requires AssemblyAI. Without `ASSEMBLYAI_API_KEY`, the tool falls back to a fixed 60–90s clip
- Voice clips should be 15–30s of clean, uninterrupted speech for best Cartesia results
