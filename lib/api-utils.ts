import { NextRequest, NextResponse } from 'next/server'
import { ZodSchema } from 'zod'
import { logger } from '@/lib/logger'

export class AppError extends Error {
  constructor(
    message: string,
    public status: number = 500,
    public code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'AppError';
  }
}

type ParseSuccess<T> = { data: T; error: null }
type ParseFailure = { data: null; error: NextResponse }
type ParseResult<T> = ParseSuccess<T> | ParseFailure

export async function parseBody<T>(
  request: NextRequest,
  schema: ZodSchema<T>
): Promise<ParseResult<T>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return {
      data: null,
      error: NextResponse.json(
        { code: 'INVALID_JSON', message: 'Request body must be valid JSON' },
        { status: 400 }
      ),
    }
  }
  const result = schema.safeParse(body)
  if (!result.success) {
    return {
      data: null,
      error: NextResponse.json(
        { code: 'VALIDATION_ERROR', errors: result.error.flatten().fieldErrors },
        { status: 400 }
      ),
    }
  }
  return { data: result.data, error: null }
}

export function apiError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ code, message }, { status })
}

export function withErrorHandler(
  handler: (req: NextRequest, ctx?: unknown) => Promise<NextResponse>
) {
  return async (req: NextRequest, ctx?: unknown): Promise<NextResponse> => {
    try {
      return await handler(req, ctx)
    } catch (err) {
      logger.error({ err, route: req.nextUrl.pathname }, 'Unhandled API error')

      if (err instanceof AppError) {
        return apiError(err.code, err.message, err.status)
      }

      return apiError('INTERNAL_ERROR', 'Something went wrong', 500)
    }
  }
}
