import { Hono } from 'hono';
import { config } from '../config.js';
import { savePage, getPage, getSubdomain, incrementSubdomainPageCount } from '../storage/db.js';
import { generateEtag } from '../utils/etag.js';
import { validateId, validatePageBody, decodeHtml, decodeMarkdown, validateAuthInput } from '../utils/validation.js';
import { hashPassword, generateUrlToken } from '../utils/auth.js';
import { validateSubdomainName } from './subdomains.js';
import { trackApiCall, trackPageCreated } from '../analytics/posthog.js';

const pages = new Hono();

interface CreatePageBody {
  html?: string;
  markdown?: string;
  encoding?: 'utf-8' | 'base64';
  markdown_encoding?: 'utf-8' | 'base64';
  content_type?: string;
  title?: string;
  subdomain?: string;
  auth?: {
    password?: string;
    urlToken?: boolean;
  };
}

// POST /v1/pages/:id - Create or replace a page
pages.post('/:id', async (c) => {
  const id = c.req.param('id');
  
  // Get subdomain from header
  const subdomainHeader = c.req.header('X-Subdomain');
  const subdomain = subdomainHeader ? subdomainHeader.toLowerCase() : undefined;

  // Validate ID
  const idError = validateId(id);
  if (idError) {
    return c.json({ error: idError.message }, 400);
  }

  // Validate subdomain if provided
  if (subdomain) {
    const subdomainValidation = validateSubdomainName(subdomain);
    if (!subdomainValidation.valid) {
      return c.json({ error: subdomainValidation.error }, 400);
    }
    
    // Check if subdomain exists
    const existingSubdomain = getSubdomain(subdomain);
    if (!existingSubdomain) {
      return c.json({ error: `Subdomain '${subdomain}' does not exist. Claim it first with POST /v1/subdomains/${subdomain}` }, 404);
    }
    
    // Check page count limit
    if (existingSubdomain.page_count >= config.subdomains.maxPagesPerSubdomain) {
      return c.json({ error: `Subdomain '${subdomain}' has reached the maximum of ${config.subdomains.maxPagesPerSubdomain} pages` }, 403);
    }
  }

  // Parse and validate body
  let body: CreatePageBody;
  try {
    body = await c.req.json<CreatePageBody>();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const bodyError = validatePageBody(body);
  if (bodyError) {
    return c.json({ error: bodyError.message }, 400);
  }

  // Validate auth if provided
  if (body.auth) {
    const authError = validateAuthInput(body.auth);
    if (authError) {
      return c.json({ error: authError.message }, 400);
    }
  }

  // For non-subdomain pages, check if ID is already taken
  if (!subdomain) {
    const existing = getPage(id);
    if (existing) {
      return c.json({ error: `Page ID "${id}" is already taken` }, 409);
    }
  } else {
    // For subdomain pages, check if ID exists within that subdomain
    const existing = getPage(id, subdomain);
    if (existing) {
      return c.json({ error: `Page "${id}" already exists in subdomain "${subdomain}"` }, 409);
    }
  }

  // Decode HTML if given
  const decodedHtml = body.html ? decodeHtml(body.html, body.encoding) : undefined;

  // Decode markdown if provided
  const decodedMarkdown = body.markdown 
    ? decodeMarkdown(body.markdown, body.markdown_encoding || body.encoding) 
    : undefined;

  // Generate ETag from combined content
  const etagContent = (decodedHtml || '') + (decodedMarkdown || '');
  const etag = generateEtag(etagContent);

  // Process auth if provided
  let authData: { passwordHash?: string; urlTokenHash?: string } | undefined;
  let urlToken: string | undefined;

  if (body.auth) {
    authData = {};
    
    if (body.auth.password) {
      authData.passwordHash = await hashPassword(body.auth.password);
    }
    
    if (body.auth.urlToken) {
      const tokenResult = generateUrlToken();
      urlToken = tokenResult.token;
      authData.urlTokenHash = tokenResult.hash;
    }
  }

  // Save to database
  const { page, created } = await savePage(
    id,
    {
      html: decodedHtml,
      markdown: decodedMarkdown,
      encoding: 'utf-8',
      content_type: body.content_type,
      title: body.title,
      subdomain: subdomain,
      auth: authData,
    },
    etag
  );
  
  // Increment subdomain page count if this is a new page
  if (created && subdomain) {
    incrementSubdomainPageCount(subdomain);
  }

  // Build response URLs
  const baseUrl = config.baseUrl;
  const protocol = baseUrl.startsWith('https') ? 'https' : 'http';
  const domain = baseUrl.replace(/^https?:\/\//, '');
  
  let pageUrl: string;
  if (subdomain) {
    // Subdomain URL: https://{subdomain}.{domain}/{path}
    const path = page.id === 'index' ? '/' : `/${page.id}`;
    pageUrl = `${protocol}://${subdomain}.${domain}${path}`;
  } else {
    // Regular URL: https://{domain}/p/{id}
    pageUrl = `${baseUrl}/p/${page.id}`;
  }
  
  const response: Record<string, string> = {
    id: page.id,
    url: pageUrl,
    etag: page.etag,
  };
  
  // Add subdomain info if applicable
  if (subdomain) {
    response.subdomain = subdomain;
    response.path = page.id === 'index' ? '/' : `/${page.id}`;
  }
  
  // Add raw URL
  if (subdomain) {
    response.raw_url = `${pageUrl}/raw`;
  } else {
    response.raw_url = `${baseUrl}/p/${page.id}/raw`;
  }

  // Add markdown URL if markdown was provided
  if (page.markdown) {
    if (subdomain) {
      response.markdown_url = `${pageUrl}/md`;
    } else {
      response.markdown_url = `${baseUrl}/p/${page.id}/md`;
    }
  }

  // Add secret URLs if token was generated
  if (urlToken) {
    response.secret_url = `${pageUrl}?token=${urlToken}`;
    response.secret_raw_url = `${pageUrl}/raw?token=${urlToken}`;
    if (page.markdown) {
      response.secret_markdown_url = `${pageUrl}/md?token=${urlToken}`;
    }
  }

  // Track page creation
  if (created) {
    trackPageCreated({
      pageId: page.id,
      hasAuth: !!authData,
      contentType: page.content_type || 'text/html',
      hasMarkdown: !!page.markdown,
    });
  }

  // Track API call
  trackApiCall({
    endpoint: '/v1/pages/:id',
    method: 'POST',
    pageId: page.id,
    statusCode: 201,
  });

  c.header('ETag', page.etag);
  return c.json(response, 201);
});

export { pages };