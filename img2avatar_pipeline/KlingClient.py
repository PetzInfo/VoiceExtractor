import time
import base64
import requests
import jwt  # pip install PyJWT


class KlingClient:
    BASE_URL = "https://api-singapore.klingai.com/v1"
    POLL_INTERVAL = 5   # seconds between status checks
    TIMEOUT = 300       # max seconds to wait for completion

    def __init__(self, access_key: str, secret_key: str):
        self.access_key = access_key
        self.secret_key = secret_key

    def _get_token(self) -> str:
        now = int(time.time())
        headers = {
        "alg": "HS256",
        "typ": "JWT"
        }
        payload = {
            "iss": self.access_key,
            "exp": now + 1800, 
            "nbf": now - 5,
            "iat": now
        }
        token = jwt.encode(payload, self.secret_key, headers=headers)
        return token

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._get_token()}", "Content-Type": "application/json"}

    def generate_video(self, image_path: str, prompt: str, duration: int = 5) -> str:
        """
        Generate a video from a static image.

        Args:
            image_path: Path to the input image (jpg/png).
            prompt:     Text prompt describing the desired motion.
            duration:   Clip length in seconds (5 or 10).

        Returns:
            Path to the downloaded video file.
        """
        with open(image_path, "rb") as f:
            image_b64 = base64.b64encode(f.read()).decode()

        payload = {
            "model": "kling-v3",
            "image": image_b64,
            "prompt": prompt,
            "duration": duration,
            "mode": "std",
        }
    
        resp = requests.post(f"{self.BASE_URL}/videos/image2video", json=payload, headers=self._headers())
        if not resp.ok:
            raise RuntimeError(f"Kling API error {resp.status_code}: {resp.text}")
        resp.raise_for_status()
        task_id = resp.json()["data"]["task_id"]

        return self._poll_and_download(task_id)

    def _poll_and_download(self, task_id: str) -> str:
        deadline = time.time() + self.TIMEOUT
        while time.time() < deadline:
            resp = requests.get(
                f"{self.BASE_URL}/videos/image2video/{task_id}",
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()["data"]
            status = data["task_status"]

            if status == "succeed":
                video_url = data["task_result"]["videos"][0]["url"]
                return self._download(video_url, f"kling_{task_id}.mp4")
            if status == "failed":
                raise RuntimeError(f"Kling task failed: {data.get('task_status_msg')}")

            time.sleep(self.POLL_INTERVAL)

        raise TimeoutError(f"Kling task {task_id} did not complete within {self.TIMEOUT}s")

    def _download(self, url: str, filename: str) -> str:
        resp = requests.get(url, stream=True)
        resp.raise_for_status()
        with open(filename, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        return filename