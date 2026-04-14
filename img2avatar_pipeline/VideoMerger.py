from moviepy import VideoFileClip, concatenate_videoclips


class VideoMerger:

    def merge(self, video_paths: list[str], output_path: str = "final_video.mp4") -> str:
        """
        Concatenate multiple video files into one, in the given order.

        Args:
            video_paths: Ordered list of video file paths (e.g. [v1, v2, v3]).
            output_path: Path for the merged output file.

        Returns:
            Path to the merged video file.
        """
        if not video_paths:
            raise ValueError("video_paths must not be empty")

        clips = [VideoFileClip(p) for p in video_paths]
        merged = concatenate_videoclips(clips, method="compose")

        merged.write_videofile(
            output_path,
            codec="libx264",
            audio_codec="aac",
            logger=None,
        )

        for clip in clips:
            clip.close()
        merged.close()

        return output_path