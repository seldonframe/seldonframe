import { handlers } from "@/auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL("/signup", request.url);
  return NextResponse.redirect(url);
}

export const POST = handlers.POST;
