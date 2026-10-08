import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cookieParser = require('cookie-parser');

async function bootstrap() {
  const logger = new Logger('KumkumPayalBootstrap');
  const app = await NestFactory.create(AppModule);

  const cookieMiddleware =
    typeof cookieParser === 'function'
      ? cookieParser()
      : cookieParser?.default?.();
  if (cookieMiddleware) {
    app.use(cookieMiddleware);
  }
  app.setGlobalPrefix('api/v1');

  const configuredOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://localhost:4000'];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      try {
        const url = new URL(origin);
        if (
          configuredOrigins.includes(origin) ||
          url.hostname.endsWith('.vercel.app') ||
          url.hostname === 'localhost'
        ) {
          return callback(null, true);
        }
      } catch {
        // Ignored
      }
      return callback(null, true);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Swagger OpenAPI Documentation
  const config = new DocumentBuilder()
    .setTitle('Kumkum Payal API')
    .setDescription(
      'Accounting & Inventory Management System for Jewellery Trading and Job Work (Polish & Meena)',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('access_token')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`Kumkum Payal API running on port ${port}`);
  logger.log(`OpenAPI documentation available at http://localhost:${port}/api/docs`);
}

bootstrap();
