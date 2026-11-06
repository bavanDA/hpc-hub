"""Run by the edge-tts Python, never imports hpc_hub.

stdin: {"voice": ..., "rate": "+0%", "out": folder, "chunks": [text, ...]}
stdout: one JSON line per chunk: {"i": n, "tokens": [[text, start, end], ...]}; audio in out/<n>.mp3
"""

import asyncio
import json
import sys

import edge_tts

TICKS = 10_000_000


async def one(i: int, text: str, voice: str, rate: str, out: str, limit: asyncio.Semaphore) -> None:
    async with limit:
        audio, tokens = bytearray(), []
        for attempt in range(5):
            if attempt:
                await asyncio.sleep(1.5 * attempt)  # the service is busy: give it a moment
            try:
                audio, tokens = bytearray(), []
                async for c in edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary").stream():
                    if c["type"] == "audio":
                        audio.extend(c["data"])
                    elif c["type"] == "WordBoundary":
                        start = c["offset"] / TICKS
                        tokens.append([c["text"], start, start + c["duration"] / TICKS])
                break
            except Exception as e:  # noqa: BLE001 - the service hiccups now and then; try again
                if attempt == 4:
                    print(json.dumps({"i": i, "error": str(e)}), flush=True)
                    return
        with open(f"{out}/{i}.mp3", "wb") as fh:
            fh.write(audio)
        print(json.dumps({"i": i, "tokens": tokens}), flush=True)


async def main() -> None:
    job = json.load(sys.stdin)
    limit = asyncio.Semaphore(12)  # the service is happy with a dozen at once
    await asyncio.gather(*(one(i, t, job["voice"], job.get("rate", "+0%"), job["out"], limit)
                           for i, t in enumerate(job["chunks"])))


if __name__ == "__main__":
    asyncio.run(main())
