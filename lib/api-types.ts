export interface ApiSuccessResponse<T> {
  data: T;
  meta?: { count?: number; page?: number };
}

export interface ApiErrorResponse {
  error: { code: string; message: string; details?: unknown };
}
