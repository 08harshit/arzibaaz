import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Global validation pipe — strips unknown properties and validates DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Behind a hosting proxy every request would otherwise look like it comes from the proxy's IP,
  // so the rate limiter would count all users together. Set TRUST_PROXY=1 on such hosts only
  // (trusting the header when directly exposed lets clients spoof their IP).
  if (process.env.TRUST_PROXY) {
    (app.getHttpAdapter().getInstance() as { set: (k: string, v: number) => void }).set(
      'trust proxy',
      Number(process.env.TRUST_PROXY) || 1,
    );
  }

  app.use(helmet());
  app.enableShutdownHooks();

  // CORS — in production only the extension may call the API from a browser.
  // The cors package does not support wildcards in origin strings, so match by pattern
  // (Chrome extension ids are 32 chars a–p), or pin one id with EXTENSION_ID.
  const isProduction = process.env.NODE_ENV === 'production';
  const extensionId = process.env.EXTENSION_ID;
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Requests without an Origin header are not browser calls (health probes, curl).
      if (!origin || !isProduction) return callback(null, true);
      const allowed = extensionId
        ? origin === `chrome-extension://${extensionId}`
        : /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
      callback(null, allowed);
    },
  });

  // Swagger (development only)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ArziBaaz API')
      .setDescription('Backend API for the ArziBaaz job application copilot')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
    logger.log('Swagger docs available at /api/docs');
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`ArziBaaz API running on port ${port}`);
}

bootstrap();
