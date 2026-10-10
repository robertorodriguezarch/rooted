export class ApiError extends Error {
  constructor(status, message, code = 'request_failed') {
    super(message)
    this.status = status
    this.code = code
  }
}

export function publicError(error) {
  if (error instanceof ApiError) return { status: error.status, message: error.message, code: error.code }
  if (error?.code === '23503') return { status: 400, message: 'That related record is no longer available.', code: 'invalid_reference' }
  if (error?.code === '23505') return { status: 409, message: 'This record already exists.', code: 'conflict' }
  return { status: 503, message: 'Rooted could not complete this request. Please try again shortly.', code: 'service_unavailable' }
}
