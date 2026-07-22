import { readFile } from "fs/promises";
import { join } from "path";

export async function GET() {
  try {
    const filePath = join(process.cwd(), "public/lm-logo.glb");
    const fileContent = await readFile(filePath);

    return new Response(fileContent, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Erro ao servir logo:", error);
    return new Response("Not Found", { status: 404 });
  }
}
