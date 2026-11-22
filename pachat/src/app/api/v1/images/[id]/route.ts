import { getAttachment } from "@/lib/repo";
import { verifyValue } from "@/lib/auth";
import { ApiError, handle, requireAnyAuth } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

// GET /images/{id} — the image bytes from a message. Auth via agent token, the
// web session, or a short-lived signed link (the one /attachments hands out).
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
      throw new ApiError("attachment_not_found", "There's no such image.", 404);
    }
    if (!att.mime.startsWith("image/") || att.mime === "image/svg+xml") {
      throw new ApiError("not_an_image", "That attachment isn't an image.", 400);
    }

    return new Response(Buffer.from(att.data), {
      headers: {
        "content-type": att.mime,
        "content-length": String(att.data.byteLength),
        "cache-control": "private, max-age=300",
      },
    });
  });
}
