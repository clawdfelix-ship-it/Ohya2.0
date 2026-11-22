import { CLI_SOURCE } from "@/lib/cli-source";

// GET /pachat.mjs — the CLI served as an ES module so it can be fetched and
// run, or piped straight into Node.
export async function GET() {
  return new Response(CLI_SOURCE, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "content-disposition": 'inline; filename="pachat.mjs"',
    },
  });
}
