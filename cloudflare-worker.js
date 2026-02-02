// Cloudflare Worker for subdomain routing
// Deploy this at your-worker.alfiepro.workers.dev
// Then route *.alfiepro.com.au to this worker

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const hostname = url.hostname

  // Redirect www to non-www
  if (hostname === 'www.alfiepro.com.au') {
    const redirectUrl = new URL(request.url)
    redirectUrl.hostname = 'alfiepro.com.au'
    return Response.redirect(redirectUrl.toString(), 301)
  }

  // Check if it's a subdomain
  if (hostname.includes('.alfiepro.com.au') &&
      !hostname.startsWith('www.') &&
      hostname !== 'alfiepro.com.au') {

    // Extract subdomain
    const subdomain = hostname.split('.')[0]

    // Rewrite to main domain with subdomain preserved
    const mainDomainUrl = new URL(request.url)
    mainDomainUrl.hostname = 'alfiepro.com.au'

    // Forward the request to main domain
    const modifiedRequest = new Request(mainDomainUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'manual'
    })

    // Add custom header so app knows the original subdomain
    modifiedRequest.headers.set('X-Original-Host', hostname)
    modifiedRequest.headers.set('X-Subdomain', subdomain)

    // Fetch from main domain
    const response = await fetch(modifiedRequest)

    // Return response
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    })
  }

  // Not a subdomain, pass through
  return fetch(request)
}
