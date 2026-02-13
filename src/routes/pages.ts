import { Hono } from 'hono';
import { config } from '../config.js';
import { savePage, getPage } from '../storage/db.js';
import { generateEtag } from '../utils/etag.js';
import { validateId, validatePageBody, decodeHtml, decodeMarkdown, validateAuthInput } from '../utils/validation.js';
import { hashPassword, generateUrlToken } from '../utils/auth.js';

const pages = new Hono();

interface CreatePageBody {
  html?: string;
  markdown?: string;
  encoding?: 'utf-8' | 'base64';
  markdown_encoding?: 'utf-8' | 'base64';
  content_type?: string;
  title?: string;
  auth?: {
    password?: string;
    urlToken?: boolean;
  };
}

// POST /v1/pages/:id - Create or replace a page
pages.post('/:id', async (c) => {
  const id = c.req.param('id');

  // Validate ID
  const idError = validateId(id);
  if (idError) {
    return c.json({ error: idError.message }, 400);
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

  // Check if ID is already taken
  const existing = getPage(id);
  if (existing) {
    return c.json({ error: `Page ID "${id}" is already taken` }, 409);
  }

  // Decode HTML if provided
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
      auth: authData,
    },
    etag
  );

  // Build response URLs
  const baseUrl = config.baseUrl;
  const response: Record<string, string> = {
    id: page.id,
    url: `${baseUrl}/p/${page.id}`,
    raw_url: `${baseUrl}/p/${page.id}/raw`,
    etag: page.etag,
  };

  // Add markdown URL if markdown was provided
  if (page.markdown) {
    response.markdown_url = `${baseUrl}/p/${page.id}/md`;
  }

  // Add secret URLs if token was generated
  if (urlToken) {
    response.secret_url = `${baseUrl}/p/${page.id}?token=${urlToken}`;
    response.secret_raw_url = `${baseUrl}/p/${page.id}/raw?token=${urlToken}`;
    if (page.markdown) {
      response.secret_markdown_url = `${baseUrl}/p/${page.id}/md?token=${urlToken}`;
    }
  }

  c.header('ETag', page.etag);
  return c.json(response, 201);
});

export { pages };
