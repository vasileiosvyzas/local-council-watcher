#!/usr/bin/env python3
import argparse
import json
import os
import sys
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import requests


OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"


# System prompt taken from backend/app/llm/analyser.py (lines 9-34)
SYSTEM_PROMPT_EL = """Είσαι ειδικός αναλυτής δημοτικών συμβουλίων. Αναλύεις πρακτικά συνεδριάσεων δημοτικών συμβουλίων στα ελληνικά.

Η εργασία σου είναι:
1. Να δημιουργήσεις μια συνοπτική περίληψη της συνεδρίασης στα ελληνικά
2. Να εξαγάγεις τα βασικά θέματα που συζητήθηκαν

Για κάθε θέμα:
- Δώσε έναν σαφή τίτλο στα ελληνικά (π.χ. "Αύξηση δημοτικών τελών", "Έγκριση προϋπολογισμού 2025")
- Κατηγοριοποίησέ το (χρησιμοποίησε μία από τις εξής: taxation, budget, infrastructure, environment, public_safety, education, culture, housing, administration, other)
- Παράθεσε 3-6 ελληνικές λέξεις-κλειδιά για αναζήτηση
- Γράψε μια σύντομη περιγραφή (2-4 προτάσεις) του τι ειπώθηκε για αυτό το θέμα σε αυτή τη συνεδρίαση

ΣΗΜΑΝΤΙΚΟ: Απάντησε ΜΟΝΟ με έγκυρο JSON. Χωρίς επεξηγήσεις, χωρίς markdown, μόνο JSON.

Το JSON πρέπει να έχει αυτή τη δομή:
{
  "summary_el": "Περίληψη συνεδρίασης...",
  "topics": [
    {
      "title_el": "Τίτλος θέματος",
      "category": "taxation",
      "keywords": ["λέξη1", "λέξη2", "λέξη3"],
      "description_el": "Τι συζητήθηκε για αυτό το θέμα..."
    }
  ]
}
"""


@dataclass
class AnalysisResult:
    summary_el: str
    topics: List[Dict[str, Any]]


def read_transcript_text(path: str) -> str:
    """
    Read the transcript text from a JSON file produced by playlist_transcripts.py.
    Expects a top-level 'text' field containing the full Greek transcript.
    """
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    text = data.get("text")
    if not isinstance(text, str) or not text.strip():
        raise ValueError(f"No non-empty 'text' field in transcript file: {path}")
    return text


def call_openrouter(
    api_key: str,
    transcript_text: str,
    model: str,
    temperature: float = 0.2,
    max_tokens: Optional[int] = None,
) -> AnalysisResult:
    """
    Call OpenRouter chat completions API with the given transcript and system prompt.
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT_EL},
        {
            "role": "user",
            "content": (
                "Παρακάτω είναι τα πρακτικά (μεταγραφή) μίας συνεδρίασης "
                "δημοτικού συμβουλίου στα ελληνικά. Ανάλυσέ τα σύμφωνα με τις "
                "οδηγίες του system prompt και επέστρεψε ΜΟΝΟ έγκυρο JSON.\n\n"
                "Πρακτικά:\n"
                f"{transcript_text}"
            ),
        },
    ]

    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens

    resp = requests.post(OPENROUTER_API_URL, headers=headers, json=payload, timeout=120)
    if resp.status_code != 200:
        raise RuntimeError(f"OpenRouter API error {resp.status_code}: {resp.text}")

    data = resp.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"Unexpected OpenRouter response format: {data}") from exc

    # Model is instructed to return JSON only, but we still defensively strip.
    content_str = content.strip()

    try:
        parsed = json.loads(content_str)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Model did not return valid JSON: {exc}\n\nRaw content:\n{content_str}") from exc

    summary = parsed.get("summary_el") or ""
    topics = parsed.get("topics") or []
    if not isinstance(summary, str) or not isinstance(topics, list):
        raise RuntimeError(f"JSON does not match expected structure: {parsed}")

    return AnalysisResult(summary_el=summary, topics=topics)


def analyse_file(
    transcript_path: str,
    output_dir: str,
    api_key: str,
    model: str,
    overwrite: bool = False,
) -> str:
    """
    Analyse a single transcript JSON file and write the LLM result to output_dir.

    Returns the path to the analysis JSON.
    """
    base_name = os.path.basename(transcript_path)
    root, _ = os.path.splitext(base_name)
    out_path = os.path.join(output_dir, root + ".analysis.json")

    if os.path.exists(out_path) and not overwrite:
        return out_path

    transcript_text = read_transcript_text(transcript_path)
    result = call_openrouter(api_key=api_key, transcript_text=transcript_text, model=model)

    os.makedirs(output_dir, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "summary_el": result.summary_el,
                "topics": result.topics,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    return out_path


def find_transcript_files(input_path: str) -> List[str]:
    """
    If input_path is a file, return [input_path].
    If it's a directory, return all *.json files inside (non-recursive).
    """
    if os.path.isfile(input_path):
        return [input_path]
    if os.path.isdir(input_path):
        return [
            os.path.join(input_path, name)
            for name in sorted(os.listdir(input_path))
            if name.lower().endswith(".json")
        ]
    raise FileNotFoundError(f"Input path not found: {input_path}")


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description=(
            "Use OpenRouter.ai to summarise Greek council meeting transcripts "
            "and extract structured topics as JSON."
        )
    )
    ap.add_argument(
        "input",
        help="Path to a transcript JSON file or a directory containing transcript JSON files.",
    )
    ap.add_argument(
        "--output-dir",
        default="analyses_out",
        help="Directory to write analysis JSON files (default: analyses_out).",
    )
    ap.add_argument(
        "--model",
        default="openrouter/auto",
        help="OpenRouter model name to use (default: openrouter/auto).",
    )
    ap.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing analysis files instead of skipping them.",
    )
    ap.add_argument(
        "--max-files",
        type=int,
        default=None,
        help="Optional maximum number of transcript files to process.",
    )
    return ap.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> None:
    args = parse_args(argv)

    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise SystemExit(
            "OPENROUTER_API_KEY environment variable is not set. "
            "Create an API key at https://openrouter.ai/ and export it before running this script."
        )

    try:
        files = find_transcript_files(args.input)
    except FileNotFoundError as exc:
        raise SystemExit(str(exc)) from exc

    if args.max_files is not None and args.max_files > 0:
        files = files[: args.max_files]

    if not files:
        raise SystemExit("No transcript JSON files found to analyse.")

    print(f"Analysing {len(files)} transcript file(s) with model {args.model!r}...")
    for idx, path in enumerate(files, start=1):
        print(f"[{idx}/{len(files)}] {os.path.basename(path)}")
        try:
            out_path = analyse_file(
                transcript_path=path,
                output_dir=args.output_dir,
                api_key=api_key,
                model=args.model,
                overwrite=bool(args.overwrite),
            )
            print(f"  OK: wrote {out_path}")
        except Exception as exc:
            print(f"  ERROR analysing {path}: {exc}")


if __name__ == "__main__":
    main(sys.argv[1:])

