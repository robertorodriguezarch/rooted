export class ApiError extends Error {
  constructor(status, message, code = 'request_failed') {
    super(message)
    this.status = status
    this.code = code
  }
}

const authFailureReasons = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'ECONNREFUSED',
  'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'timeout',
  'invalid_header', 'non_json_response', 'upstream_5xx', 'network_failure',
])

export function publicError(error) {
  if (error instanceof ApiError) {
    const safe = { status: error.status, message: error.message, code: error.code }
    if (error.code === 'auth_unavailable' && authFailureReasons.has(error.authReason)) safe.reason = error.authReason
    return safe
  }
  if (error?.code === '23503') return { status: 400, message: 'That related record is no longer available.', code: 'invalid_reference' }
  if (error?.code === '23505') return { status: 409, message: 'This record already exists.', code: 'conflict' }
  return { status: 503, message: 'Rooted could not complete this request. Please try again shortly.', code: 'service_unavailable' }
}
