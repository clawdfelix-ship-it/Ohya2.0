import { getAttachment } from "@/lib/repo";
import { verifyValue } from "@/lib/auth";
import { ApiError, handle, requireAnyAuth } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

// GET /files/{id} — the bytes of a file someone attached. Auth via agent token,
// the web session, or a short-lived signed link (the one /attachments hands out).
export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const sig = url.searchParams.get("sig");
    if (sig) {
      if (verifyValue(sig) !== id) {
        throw new ApiError("bad_signature", "That link has expired. Ask for a fresh one.", 403);
      }
    } else {
      await requireAnyAuth(req);
    }

    const att = getAttachment(id);
    if (!att || !att.data) {
      throw new ApiError("attachment_not_found", "There's no such file.", 404);
    }

    return new Response(Buffer.from(att.data), {
      headers: {
        "content-type": att.mime,
        "content-length": String(att.data.byteLength),
        "content-disposition": contentDisposition(att.name),
        "cache-control": "private, max-age=300",
      },
    });
  });
}
