import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

const CONFIRMED_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>Email confirmed - ArziBaaz</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f8f9fa; color: #202124;
           display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; }
    main { background: #fff; border: 1px solid #dadce0; border-radius: 12px; padding: 32px; max-width: 380px; text-align: center; }
    .tick { font-size: 40px; color: #1e8e3e; }
    h1 { font-size: 20px; margin: 8px 0; }
    p { font-size: 14px; color: #5f6368; line-height: 1.5; margin: 0; }
  </style>
</head>
<body>
  <main>
    <div class="tick">&#10003;</div>
    <h1>Email confirmed</h1>
    <p>Your ArziBaaz account is ready. Close this tab, open the ArziBaaz extension and sign in.</p>
  </main>
</body>
</html>`;

/** Public landing page that Supabase redirects to after a user clicks the email confirmation link. */
@ApiExcludeController()
@Controller('auth')
export class AuthPagesController {
  @Get('confirmed')
  @Header('Content-Type', 'text/html; charset=utf-8')
  confirmed(): string {
    return CONFIRMED_PAGE;
  }
}
