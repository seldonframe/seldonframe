export function assertWritable() {
  if (process.env.NEXT_PUBLIC_DEMO_READONLY === "true") {
    throw new Error("Write operations are disabled in demo mode.");
  }
}
