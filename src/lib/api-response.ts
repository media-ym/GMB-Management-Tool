import { NextResponse } from "next/server";
import type { ApiResponse } from "./types";

export function ok<T>(data: T, message = "Operation completed"): NextResponse {
  const body: ApiResponse<T> = {
    success: true,
    message,
    data,
    errors: null,
    timestamp: new Date().toISOString(),
  };
  return NextResponse.json(body);
}

export function fail(
  message: string,
  status = 400,
  errors: unknown = null,
): NextResponse {
  const body: ApiResponse = {
    success: false,
    message,
    data: null,
    errors,
    timestamp: new Date().toISOString(),
  };
  return NextResponse.json(body, { status });
}

export function unauthorized(message = "Unauthorized"): NextResponse {
  return fail(message, 401);
}

export function forbidden(message = "Forbidden"): NextResponse {
  return fail(message, 403);
}

export function notFound(message = "Not found"): NextResponse {
  return fail(message, 404);
}
