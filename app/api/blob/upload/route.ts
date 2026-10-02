import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { isSignedIn } from "@/lib/auth";
import { isBookId } from "@/lib/book";

const PDF_PATH = /^pdfs\/[0-9a-f-]{36}\.pdf$/i;

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  if (body.type === "blob.generate-client-token" && !(await isSignedIn())) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!(await isSignedIn())) throw new Error("Sign in required.");
        const id = pathname.replace(/^pdfs\//, "").replace(/\.pdf$/i, "");
        if (!PDF_PATH.test(pathname) || !isBookId(id)) {
          throw new Error("That file path is not allowed.");
        }
        return {
          allowedContentTypes: ["application/pdf", "application/octet-stream"],
          maximumSizeInBytes: 1024 * 1024 * 1024,
          addRandomSuffix: false,
          allowOverwrite: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload was rejected.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
