/** Runs once when the server boots: make sure the demo directory has content. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { ensureSeeded } = await import("./lib/seed");
    ensureSeeded();
  } catch (err) {
    console.error("[instrumentation] seed skipped", err);
  }
}
