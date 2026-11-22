import { getAttachment } from "@/lib/repo";
import { signValue } from "@/lib/auth";
import { ApiError, handle, json, originOf, requireAnyAuth } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

const TEXT_LIMIT = 16 * 1024;

function isTextMime(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    /\/(json|xml|x-yaml|yaml|csv|javascript|xml\+)/.test(mime) ||
    mime === "application/x-ndjson"
  );
}

// GET /attachments/{id} — the same content as /images or /files, as JSON, for
// callers that can't follow a download: an image as base64, a text file as
// `text`, anything else as a token-free `downloadUrl` good for 5 minutes.
export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    await requireAnyAuth(req);

    const att = getAttachment(id);
    if (!att || !att.data) {
      throw new ApiError("attachment_not_found", "There's no such attachment.", 404);
    }
    const bytes = Buffer.from(att.data);

    if (att.mime.startsWith("image/") && att.mime !== "image/svg+xml") {
      return json({
        id: att.id,
        name: att.name,
        mime: att.mime,
        size: att.size,
        kind: "image",
        encoding: "base64",
        data: bytes.toString("base64"),
      });
    }

    if (isTextMime(att.mime)) {
      const url = new URL(req.url);
      const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
      const slice = bytes.subarray(offset);
      const truncated = slice.byteLength > TEXT_LIMIT;
      const body = slice.subarray(0, TEXT_LIMIT).toString("utf8");
      return json({
        id: att.id,
        name: att.name,
        mime: att.mime,
        size: att.size,
        kind: "text",
        offset,
        truncated,
        text: body,
        textLength: slice.byteLength,
      });
    }

    const origin = originOf(req);
    const sig = signValue(att.id, 5 * 60 * 1000);
    return json({
      id: att.id,
      name: att.name,
      mime: att.mime,
      size: att.size,
      kind: "file",
      downloadUrl: `${origin}/api/v1/files/${att.id}?sig=${encodeURIComponent(sig)}`,
      expiresIn: 300,
    });
  });
}
