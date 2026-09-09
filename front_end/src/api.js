export async function apiRequest(path, options = {}) {
  let response
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'include',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new Error('Could not reach the server. Please try again.')
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || 'Something went wrong. Please try again.')
  return data
}
