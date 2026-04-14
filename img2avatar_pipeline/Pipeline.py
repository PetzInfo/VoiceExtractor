"""
Avatar-Video Pipeline
=====================
Reihenfolge:
  1. Kling       → Motion-Video aus Bild + Prompt
  2. Cartesia    → Voice-Clone + TTS-Audiotrack
  3. HeyGen      → Talking-Head-Video aus Bild + Audiotrack
  4. VideoMerger → Kling-Video + HeyGen-Video zusammenfügen

PipelineInput kann später von einem externen Service oder
Frontend befüllt werden.
"""

from __future__ import annotations

import os
import logging
from dataclasses import dataclass
from pathlib import Path

from KlingClient import KlingClient
from CartesiaClient import CartesiaClient
from HeyGenClient import HeyGenClient
from VideoMerger import VideoMerger

log = logging.getLogger(__name__)


# ── Data contracts ────────────────────────────────────────────

@dataclass
class PipelineInput:
    """Alles was die Pipeline braucht."""

    # Pflichtfelder
    name: str              # Anzeigename für den Voice-Clone
    image_path: str        # Portraitfoto (Gesicht klar sichtbar)
    audio_path: str        # Referenz-Audio für Voice-Cloning (~5 s)
    script: str = """Hey, how's it going. I am a Voice Clone, and I'd like to tell you about a company that really impressed me. They're called revel8, a cybersecurity startup based in Munich, Germany.
        So here's the thing. Every organization today faces the same challenge. You can invest millions in firewalls, endpoint protection, and all the technical security you want. But at the end of the day, the biggest vulnerability is always the human element. Attackers know this, and they're getting incredibly good at exploiting it.
        We're not talking about obvious scam emails anymore. Modern social engineering attacks use cloned voices, deepfake video calls, and perfectly personalized phishing emails that are almost impossible to distinguish from the real thing. And these attacks are targeting everyone, from junior employees all the way up to the C-suite.
        That's exactly what revel8 addresses. They've built an AI-native platform that simulates real-world social engineering attacks in a completely safe environment. Their system runs realistic scenarios, things like phishing emails, suspicious phone calls, even deepfake video meetings, and tests how employees respond.
        What I find particularly compelling about their approach is the personalization. They don't just send out the same generic test to everyone. They use publicly available information to craft scenarios that are tailored to each individual, their role, their company, their digital footprint. Exactly how a real attacker would operate.
        And it's not a one-time exercise. The platform creates a continuous learning loop that adapts over time. Employees who are already quite sharp get more sophisticated scenarios, while those who need more support receive additional training. The difficulty scales with awareness.
        For security leaders, revel8 provides a complete analytics dashboard. You can see where the human risk sits in your organization, track how awareness improves over time, and generate compliance-ready reports. Everything is automated, so there's minimal operational overhead.
        What really sets them apart is the quality of their simulations. The deepfake technology they use is genuinely convincing. When you experience one of their scenarios firsthand, it makes you realize just how vulnerable most organizations actually are. And that moment of realization is exactly what drives lasting behavioral change.
        They're based in Munich, they're growing fast, and they're already working with major enterprise customers across Europe. I genuinely believe that what revel8 is building represents the future of security awareness.
        If you're interested in learning more or seeing a demo, I'd highly recommend reaching out to their team. Thanks for listening, and have a great day. Bye.
        """           # Text, den der Avatar sprechen soll

    # Kling
    kling_prompt: str = " A realistic man looks directly into the camera, completely silent and almost perfectly still. His head is fully fixed in place, as if physically stabilized — no movement, no nodding, no tilting, no micro-movements of the head or neck at all. His mouth remains fully closed at all times, with no lip or jaw movement under any circumstances. His expression is neutral, calm, and steady. Eye contact is fixed and unwavering. Breathing is extremely subtle and barely perceptible, with only minimal chest movement — almost imperceptible. His body remains stable and grounded, with no posture shifts or gestures. No facial acting, no emotional reactions, no expressive behavior. The overall impression is a silent, highly controlled human presence, similar to a frozen moment or stabilized live frame. Static camera, medium close-up, warm ambient lighting, ultra-realistic human appearance."
    kling_duration: int = 10

    # Cartesia
    language: str = "de"

    # HeyGen
    heygen_expressiveness: str = "low"
    heygen_resolution: str = "740p"
    heygen_aspect_ratio: str = "16:9"


@dataclass
class PipelineOutput:
    """Alle Artefakte eines Durchlaufs."""

    kling_video_path: str = ""
    voice_clone_id: str = ""
    audio_track_path: str = ""
    heygen_video_path: str = ""
    final_video_path: str = ""


# ── Pipeline ──────────────────────────────────────────────────

class Pipeline:

    def __init__(self, output_dir: str = "output"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        self.kling = KlingClient(
            access_key=os.environ["KLING_ACCESS_KEY"],
            secret_key=os.environ["KLING_SECRET_KEY"],
        )
        self.cartesia = CartesiaClient(api_key=os.environ["CARTESIA_API_KEY"])
        self.heygen = HeyGenClient(api_key=os.environ["HEYGEN_API_KEY"])
        self.merger = VideoMerger()

    def run(self, inp: PipelineInput) -> PipelineOutput:
        log.info("Pipeline gestartet für '%s'", inp.name)
        out = PipelineOutput()

        # 1 ── Kling: Motion-Video aus Bild
        out.kling_video_path = self._generate_kling_video(inp)

        # 2 ── Cartesia: Voice-Clone + TTS
        out.voice_clone_id = self._clone_voice(inp)
        out.audio_track_path = self._generate_audio(inp, out.voice_clone_id)

        # 3 ── HeyGen: Talking-Head-Video aus Bild + Audio
        out.heygen_video_path = self._generate_heygen_video(inp, out.audio_track_path)

        # 4 ── VideoMerger: Kling + HeyGen zusammenführen
        out.final_video_path = self._merge_videos(out)

        log.info("Pipeline fertig — Ergebnis: %s", out.final_video_path)
        return out

    # ── Einzelschritte ────────────────────────────────────────

    def _generate_kling_video(self, inp: PipelineInput) -> str:
        log.info("Schritt 1/4 · Kling – Motion-Video generieren")
        return self.kling.generate_video(
            image_path=inp.image_path,
            prompt=inp.kling_prompt,
            duration=inp.kling_duration,
        )

    def _clone_voice(self, inp: PipelineInput) -> str:
        log.info("Schritt 2/4 · Cartesia – Stimme klonen")
        return self.cartesia.clone_voice(
            audio_path=inp.audio_path,
            name=inp.name,
            language=inp.language,
            description=f"Pipeline-Clone für {inp.name}",
        )

    def _generate_audio(self, inp: PipelineInput, voice_id: str) -> str:
        log.info("Schritt 2/4 · Cartesia – Audiotrack erzeugen")
        dest = str(self.output_dir / "audio_track.mp3")
        return self.cartesia.create_audio_track(
            voice_clone_id=voice_id,
            text=inp.script,
            output_path=dest,
        )

    def _generate_heygen_video(self, inp: PipelineInput, audio_path: str) -> str:
        log.info("Schritt 3/4 · HeyGen – Talking-Head-Video generieren")
        dest = str(self.output_dir / "heygen_video.mp4")
        return self.heygen.generate_video(
            image_path=inp.image_path,
            audio_path=audio_path,
            output_path=dest,
            expressiveness=inp.heygen_expressiveness,
            resolution=inp.heygen_resolution,
            aspect_ratio=inp.heygen_aspect_ratio,
        )

    def _merge_videos(self, out: PipelineOutput) -> str:
        log.info("Schritt 4/4 · Videos zusammenführen")
        dest = str(self.output_dir / "final_video.mp4")
        return self.merger.merge(
            video_paths=[out.kling_video_path, out.heygen_video_path],
            output_path=dest,
        )


# ── Standalone-Test ───────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s")

    demo = PipelineInput(
        name="DemoAvatar",
        image_path="local_images/person.png",
        audio_path="local_audio/zlatan.wav",
        script="Hallo, das ist ein Test unserer neuen Avatar-Pipeline.",
    )

    result = Pipeline(output_dir="runs/demo").run(demo)

    print("\n✔ Fertig")
    print(f"  Kling-Video    : {result.kling_video_path}")
    print(f"  Voice-Clone-ID : {result.voice_clone_id}")
    print(f"  Audiotrack     : {result.audio_track_path}")
    print(f"  HeyGen-Video   : {result.heygen_video_path}")
    print(f"  Endvideo       : {result.final_video_path}")