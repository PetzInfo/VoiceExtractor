import time
import mimetypes
from typing import Literal

import requests


class HeyGenClient:
    """
    HeyGen API client aligned with the official docs:
    - Upload:   POST https://upload.heygen.com/v1/asset
    - Generate: POST https://api.heygen.com/v2/videos       (Avatar IV)
    - Status:   GET  https://api.heygen.com/v1/video_status.get
    """

    BASE_URL = "https://api.heygen.com"
    UPLOAD_URL = "https://upload.heygen.com/v1/asset"
    POLL_INTERVAL = 10   # seconds between status checks
    TIMEOUT = 600        # max wait for render

    # Docs-supported MIME types for upload
    SUPPORTED_MIME = {
        "image/png", "image/jpeg",
        "audio/mpeg",
        "video/mp4", "video/webm",
    }

    def __init__(self, api_key: str):
        self.api_key = api_key

    # ── helpers ───────────────────────────────────────────────

    def _headers(self, content_type: str = "application/json") -> dict:
        return {
            "X-Api-Key": self.api_key,
            "Content-Type": content_type,
        }

    @staticmethod
    def _resolve_mime(file_path: str, asset_type: str) -> str:
        """
        Return a MIME type that the HeyGen upload endpoint accepts.
        Falls back to safe defaults per asset type.
        """
        mime, _ = mimetypes.guess_type(file_path)
        defaults = {"image": "image/jpeg", "audio": "audio/mpeg", "video": "video/mp4"}

        if mime and mime in HeyGenClient.SUPPORTED_MIME:
            return mime
        return defaults.get(asset_type, "application/octet-stream")

    # ── public API ────────────────────────────────────────────

    def generate_video(
        self,
        image_path: str,
        audio_path: str,
        output_path: str = "heygen_output.mp4",
        expressiveness: Literal["low", "medium", "high"] = "low",
        resolution: Literal["1080p", "720p"] = "1080p",
        aspect_ratio: Literal["16:9", "9:16"] = "16:9",
    ) -> str:
        """
        Generate a talking-photo video from a portrait image and an audio track.

        Uses POST /v2/videos (Avatar IV) — supports expressiveness control.
        Expressive Motion (motion_prompt) is intentionally NOT sent.

        Args:
            image_path:     Path to the portrait image (jpg/png, face clearly visible).
            audio_path:     Path to the audio file (mp3 recommended; wav needs conversion).
            output_path:    Where to save the finished video.
            expressiveness: Avatar expressiveness level — "low", "medium", or "high".
            resolution:     Output resolution — "1080p" or "720p".
            aspect_ratio:   Output aspect ratio — "16:9" or "9:16".

        Returns:
            Path to the downloaded video file.
        """
        image_asset_id = self._upload_asset(image_path, "image")
        audio_asset_id = self._upload_asset(audio_path, "audio")

        # POST /v2/videos — flat payload, Avatar IV
        # motion_prompt is omitted on purpose → no expressive motion
        payload = {
            "image_asset_id": image_asset_id,
            "audio_asset_id": audio_asset_id,
            "expressiveness": expressiveness,
            "resolution": resolution,
            "aspect_ratio": aspect_ratio,
        }

        resp = requests.post(
            f"{self.BASE_URL}/v2/videos",
            json=payload,
            headers=self._headers(),
        )
        resp.raise_for_status()

        body = resp.json()
        video_id = body.get("video_id") or body["data"]["video_id"]
        return self._poll_and_download(video_id, output_path)

    # ── internal ──────────────────────────────────────────────

    def _upload_asset(self, file_path: str, asset_type: str) -> str:
        """Upload a file to HeyGen and return the asset ID."""
        content_type = self._resolve_mime(file_path, asset_type)

        with open(file_path, "rb") as f:
            resp = requests.post(
                self.UPLOAD_URL,
                headers=self._headers(content_type),
                data=f.read(),
            )
        resp.raise_for_status()
        return resp.json()["data"]["id"]

    def _poll_and_download(self, video_id: str, output_path: str) -> str:
        """Poll GET /v1/video_status.get until completed or failed."""
        deadline = time.time() + self.TIMEOUT

        while time.time() < deadline:
            resp = requests.get(
                f"{self.BASE_URL}/v1/video_status.get",
                params={"video_id": video_id},
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()["data"]
            status = data["status"]

            if status == "completed":
                return self._download(data["video_url"], output_path)

            if status == "failed":
                # error is an object: {code, detail, message}
                err = data.get("error") or {}
                detail = err.get("detail", err.get("message", "unknown error"))
                raise RuntimeError(
                    f"HeyGen render failed ({err.get('code', '?')}): {detail}"
                )

            time.sleep(self.POLL_INTERVAL)

        raise TimeoutError(
            f"HeyGen video {video_id} did not complete within {self.TIMEOUT}s"
        )

    @staticmethod
    def _download(url: str, output_path: str) -> str:
        resp = requests.get(url, stream=True)
        resp.raise_for_status()
        with open(output_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        return output_path