const SEEKABLE_AUDIO_PATH = "/suzhou-park-kiss.mp3";

function parseByteRange(value, length) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    return {
      start: Math.max(0, length - suffixLength),
      end: length - 1
    };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : length - 1;
  if (
    !Number.isInteger(start)
    || !Number.isInteger(requestedEnd)
    || start < 0
    || start >= length
    || requestedEnd < start
  ) {
    return null;
  }
  return {
    start,
    end: Math.min(requestedEnd, length - 1)
  };
}

export async function onRequest(context) {
  const response = await context.next();
  const url = new URL(context.request.url);
  if (url.pathname !== SEEKABLE_AUDIO_PATH || response.status !== 200) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("Accept-Ranges", "bytes");
  const rangeHeader = context.request.headers.get("Range");
  if (!rangeHeader || context.request.method === "HEAD") {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  const audio = await response.arrayBuffer();
  const range = parseByteRange(rangeHeader, audio.byteLength);
  if (!range) {
    headers.set("Content-Range", `bytes */${audio.byteLength}`);
    headers.set("Content-Length", "0");
    return new Response(null, { status: 416, headers });
  }

  const partialAudio = audio.slice(range.start, range.end + 1);
  headers.set(
    "Content-Range",
    `bytes ${range.start}-${range.end}/${audio.byteLength}`
  );
  headers.set("Content-Length", String(partialAudio.byteLength));
  return new Response(partialAudio, {
    status: 206,
    statusText: "Partial Content",
    headers
  });
}
