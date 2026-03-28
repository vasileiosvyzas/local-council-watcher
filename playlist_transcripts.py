#!/usr/bin/env python3
import argparse
import json
import os
import re
from datetime import datetime, date
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, urlparse

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable,
)
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError


GREEK_LANG_CODES = ["el", "el-GR", "el_GR"]

TITLE_RE = re.compile(
    r"""^Συνεδρίαση\s+Δημοτικού\s+Συμβουλίου\s+
        (?P<date>\d{1,2}/\d{1,2}/\d{4})
        (?:\s+Ώρα\s+(?P<time>\d{1,2}:\d{2}))?
        (?:\s+Live)?\s*$""",
    re.VERBOSE | re.UNICODE,
)


def parse_title_metadata(title: str) -> Dict[str, Optional[str]]:
    m = TITLE_RE.match(title.strip())
    if not m:
        return {"meeting_date": None, "meeting_time": None}
    return {"meeting_date": m.group("date"), "meeting_time": m.group("time")}


def safe_filename(s: str, max_len: int = 160) -> str:
    s = s.strip().replace("\n", " ")
    s = re.sub(r"[\/\\\:\*\?\"\<\>\|\u0000-\u001F]", "_", s)
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) > max_len:
        s = s[:max_len].rstrip()
    return s


def entry_sort_key(entry: Dict[str, Any]) -> Tuple[int, int]:
    ts = entry.get("timestamp")
    if isinstance(ts, (int, float)):
        ts_i = int(ts)
    else:
        ts_i = -1

    upload_date = entry.get("upload_date")  # usually YYYYMMDD
    ud_i = -1
    if isinstance(upload_date, str) and upload_date.isdigit():
        try:
            ud_i = int(upload_date)
        except ValueError:
            ud_i = -1

    return (ts_i, ud_i)


def entry_meeting_date(entry: Dict[str, Any]) -> Optional[date]:
    """
    Parse the meeting date out of the title, based on the agreed naming
    convention, e.g.:
    \"Συνεδρίαση Δημοτικού Συμβουλίου 25/2/2026 Ώρα 19:00 Live\"
    """
    title = entry.get("title") or ""
    meta = parse_title_metadata(title)
    date_str = meta.get("meeting_date")
    if not date_str:
        return None
    try:
        # Supports both 1/2/2026 and 01/02/2026
        return datetime.strptime(date_str, "%d/%m/%Y").date()
    except ValueError:
        return None


def list_playlist_videos_most_recent_first(playlist_url: str) -> List[Dict[str, Any]]:
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "skip_download": True,
        "noplaylist": False,
    }
    try:
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(playlist_url, download=False)
    except DownloadError as exc:
        raise SystemExit(f"Failed to load playlist: {exc}") from exc

    entries = info.get("entries") or []
    entries = [e for e in entries if isinstance(e, dict)]
    entries_sorted = sorted(entries, key=entry_sort_key, reverse=True)

    # If we can't sort by upload info, fall back to reversed playlist order,
    # which often yields most-recent first.
    all_missing = all(entry_sort_key(e) == (-1, -1) for e in entries_sorted)
    if all_missing:
        entries_sorted = list(reversed(entries))

    return entries_sorted


def get_best_greek_transcript(video_id: str):
    """
    Return the best available Greek transcript for a given video.

    This uses the instance API (`YouTubeTranscriptApi().list`) which is the
    supported interface in the installed version of youtube-transcript-api.
    """
    api = YouTubeTranscriptApi()
    transcripts = api.list(video_id)

    # Prefer manually created Greek
    try:
        return transcripts.find_manually_created_transcript(GREEK_LANG_CODES)
    except NoTranscriptFound:
        # Fall back to auto-generated Greek; if this also fails, the
        # NoTranscriptFound from here will bubble up to the caller.
        return transcripts.find_generated_transcript(GREEK_LANG_CODES)


def transcript_to_text(items: List[Dict[str, Any]]) -> str:
    parts: List[str] = []
    for it in items:
        text_val = ""
        if isinstance(it, dict):
            text_val = (it.get("text") or "").strip()
        else:
            text_val = (getattr(it, "text", "") or "").strip()
        if text_val:
            parts.append(text_val)
    return " ".join(parts)


def parse_limit(s: str) -> int:
    try:
        n = int(s)
    except ValueError as ex:
        raise argparse.ArgumentTypeError("limit must be an integer") from ex
    if n <= 0:
        raise argparse.ArgumentTypeError("limit must be >= 1")
    return n


def parse_playlist_url_or_id(value: str) -> str:
    v = value.strip()
    if v.startswith("http://") or v.startswith("https://"):
        # If this is a watch URL that contains a playlist id (?list=...),
        # normalize it to the canonical playlist URL so yt-dlp treats it
        # as a playlist instead of a single video.
        parsed = urlparse(v)
        qs = parse_qs(parsed.query)
        lst = qs.get("list")
        if lst and lst[0]:
            pid = lst[0]
            return f"https://www.youtube.com/playlist?list={pid}"
        return v

    # Allow passing a playlist id directly (e.g. "PLxxxx") and normalize to URL
    return f"https://www.youtube.com/playlist?list={v}"


def playlist_id_from_url(playlist_url: str) -> Optional[str]:
    try:
        q = parse_qs(urlparse(playlist_url).query)
        lst = q.get("list")
        if lst and lst[0]:
            return lst[0]
    except Exception:
        return None
    return None


def download_audio_mp3(video_url: str, base_filename: str, audio_dir: str) -> Optional[str]:
    """
    Download best available audio for a single video and convert it to MP3.

    Requires ffmpeg/avconv to be available on the system for the postprocessor.
    Returns the expected MP3 filepath on success, or None on failure.
    """
    os.makedirs(audio_dir, exist_ok=True)
    outtmpl = os.path.join(audio_dir, base_filename + ".%(ext)s")

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": outtmpl,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "wav"
                # "preferredquality": "192",
            }
        ],
    }

    try:
        with YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(video_url, download=True)
    except DownloadError as exc:
        print(f"  WARN: failed to download audio for {video_url}: {exc}")
        return None
    except Exception as exc:
        print(f"  WARN: unexpected error while downloading audio for {video_url}: {exc}")
        return None

    # After FFmpegExtractAudio, the extension should be .mp3
    wav_path = os.path.join(audio_dir, base_filename + ".wav")
    return wav_path if os.path.exists(wav_path) else None


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Extract Greek transcripts from newest videos in a YouTube playlist."
    )
    ap.add_argument(
        "playlist",
        help="YouTube playlist URL or playlist id (e.g. https://... or PLxxxx)",
        type=parse_playlist_url_or_id,
    )
    ap.add_argument(
        "--limit",
        type=parse_limit,
        default=5,
        help="How many most-recent videos to process (default: 5)",
    )
    ap.add_argument(
        "--output-dir",
        default="transcripts_out",
        help="Directory to write per-video transcript files (default: transcripts_out)",
    )
    ap.add_argument(
        "--write-txt",
        action="store_true",
        help="Also write a .txt file with plain transcript text",
    )
    ap.add_argument(
        "--title-regex",
        default=None,
        help="Optional regex filter; only process videos whose title matches",
    )
    ap.add_argument(
        "--min-upload-date",
        default=None,
        help=(
            "Only process meetings on or after this date (YYYY-MM-DD). "
            "The date is taken from the title (e.g. 25/2/2026), not from YouTube's internal upload_date."
        ),
    )
    ap.add_argument(
        "--audio-dir",
        default="audio_out",
        help="Directory to save downloaded audio MP3 files (default: audio_out)",
    )
    ap.add_argument(
        "--no-audio",
        action="store_true",
        help="Do not download audio files; only fetch transcripts.",
    )
    args = ap.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    if not args.no_audio:
        os.makedirs(args.audio_dir, exist_ok=True)

    playlist_url = args.playlist
    pid = playlist_id_from_url(playlist_url)
    pid_msg = f" (list={pid})" if pid else ""

    videos = list_playlist_videos_most_recent_first(playlist_url)

    # Optional: filter out older meetings based on the date encoded in the title
    min_upload_date: Optional[date] = None
    if args.min_upload_date:
        try:
            min_upload_date = datetime.strptime(args.min_upload_date, "%Y-%m-%d").date()
        except ValueError as ex:
            raise SystemExit(f"Invalid --min-upload-date (expected YYYY-MM-DD): {ex}") from ex

    if min_upload_date:
        videos = [
            v
            for v in videos
            if (d := entry_meeting_date(v)) is not None and d >= min_upload_date
        ]

    if args.title_regex:
        try:
            tr = re.compile(args.title_regex)
        except re.error as ex:
            raise SystemExit(f"Invalid --title-regex: {ex}") from ex
        videos = [v for v in videos if tr.search((v.get("title") or ""))]

    videos = videos[: args.limit]

    if not videos:
        raise SystemExit("No videos found to process (playlist unavailable or filtered out).")

    print(f"Playlist{pid_msg}: processing {len(videos)} video(s) (most recent first).")

    for idx, e in enumerate(videos, start=1):
        video_id = e.get("id") or e.get("url")
        title = e.get("title") or "(no title)"

        if not video_id or not isinstance(video_id, str):
            print(f"[{idx}/{len(videos)}] SKIP: could not determine video id for title={title!r}")
            continue

        video_url = f"https://www.youtube.com/watch?v={video_id}"
        title_meta = parse_title_metadata(title)

        print(f"[{idx}/{len(videos)}] {title}")
        try:
            transcript = get_best_greek_transcript(video_id)
            items = transcript.fetch()
            # Normalise to list[dict] for JSON output
            segments: Any
            if hasattr(items, "to_raw_data"):
                segments = items.to_raw_data()
            else:
                segments = items  # type: ignore[assignment]
            text = transcript_to_text(segments)  # type: ignore[arg-type]

            base = safe_filename(f"{title} [{video_id}]")

            audio_path: Optional[str] = None
            if not args.no_audio:
                audio_path = download_audio_mp3(video_url, base, args.audio_dir)

            payload = {
                "video_id": video_id,
                "video_url": video_url,
                "title": title,
                "title_parsed": title_meta,
                "language_code": getattr(transcript, "language_code", None),
                "language": getattr(transcript, "language", None),
                "is_generated": getattr(transcript, "is_generated", None),
                "fetched_at_utc": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                "segments": segments,
                "text": text,
                "audio_path": audio_path,
            }

            out_json = os.path.join(args.output_dir, f"{base}.json")
            with open(out_json, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)

            if args.write_txt:
                out_txt = os.path.join(args.output_dir, f"{base}.txt")
                with open(out_txt, "w", encoding="utf-8") as f:
                    f.write(text + "\n")

            print(f"  OK: wrote {out_json}")

        except (TranscriptsDisabled, VideoUnavailable) as ex:
            print(f"  SKIP: transcripts unavailable ({type(ex).__name__}) for {video_url}")
        except NoTranscriptFound:
            print(f"  SKIP: no Greek transcript found (manual or generated) for {video_url}")
        except Exception as ex:
            print(f"  ERROR: {type(ex).__name__}: {ex} for {video_url}")


if __name__ == "__main__":
    main()

