from __future__ import annotations

import requests


class CartesiaClient:
    BASE_URL = "https://api.cartesia.ai"
    API_VERSION = "2026-03-01"
    MODEL_ID = "sonic-multilingual"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def _headers(self, include_content_type: bool = True) -> dict:
        h = {
            "Authorization": f"Bearer {self.api_key}",
            "Cartesia-Version": self.API_VERSION,
        }
        if include_content_type:
            h["Content-Type"] = "application/json"
        return h

    def clone_voice(
        self,
        audio_path: str,
        name: str = "MyClone",
        language: str = "en",
        description: str | None = None,
    ) -> str:
        """
        Create a voice clone from an audio sample.

        Args:
            audio_path:  Path to the reference audio file (~5 sec recommended).
            name:        Display name for the clone in Cartesia.
            language:    Language code, e.g. "en", "de".
            description: Optional description for the voice.

        Returns:
            voice_clone_id (str) — use this in create_audio_track().
        """
        with open(audio_path, "rb") as f:
            audio_bytes = f.read()

        data = {"name": name, "language": language}
        if description:
            data["description"] = description

        resp = requests.post(
            f"{self.BASE_URL}/voices/clone",
            headers=self._headers(include_content_type=False),  # let requests set boundary
            files={"clip": (audio_path, audio_bytes, "audio/wav")},
            data=data,
        )
        resp.raise_for_status()
        return resp.json()["id"]

    def create_audio_track(
        self,
        voice_clone_id: str,
        text: str,
        output_path: str = "local_audio/audio_track.mp3",
    ) -> str:
        """
        Synthesize speech from text using a cloned voice.

        Args:
            voice_clone_id: ID returned by clone_voice().
            text:           The text to be spoken.
            output_path:    Where to save the resulting audio file.

        Returns:
            Path to the saved audio file.
        """
        payload = {
            "model_id": self.MODEL_ID,
            "transcript": text,
            "voice": {
                "mode": "id",
                "id": voice_clone_id,
            },
            "output_format": {
                "container": "mp3",
                "encoding": "pcm_s16le",
                "sample_rate": 44100,
            },
        }

        resp = requests.post(
            f"{self.BASE_URL}/tts/bytes",
            json=payload,
            headers=self._headers(),
        )
        resp.raise_for_status()

        with open(output_path, "wb") as f:
            f.write(resp.content)
        return output_path