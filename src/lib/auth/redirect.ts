// src/lib/auth/redirect.ts
export function getPostAuthRedirect(urlParam?: string | null) {
  // honor ?next=/some/path if present; otherwise default
  return urlParam && urlParam.startsWith("/") ? urlParam : "/app";
}
