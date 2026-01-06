import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Security
  app.use(helmet());

  // CORS
  app.enableCors({
    origin: configService.get<string>('FRONTEND_URL', 'http://localhost:5173'),
    credentials: true,
  });

  // API Versioning
  app.setGlobalPrefix(configService.get<string>('API_PREFIX', 'api/v1'));
  app.enableVersioning({
    type: VersioningType.URI,
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('Nexora Assistant API')
    .setDescription(
      `
      ## Nexora Assistant - Tu Chief of Staff Digital

      API para gestión inteligente de tareas, correos y calendario.

      ### Módulos disponibles:
      - **Auth**: Autenticación y autorización
      - **Tasks**: Gestión de tareas con prioridades
      - **Communications**: Gestión de correos
      - **Calendar**: Gestión de calendario y reuniones
      - **Agent**: Asistente conversacional con IA

      ### Sistema de Prioridades:
      - 🔴 **HIGH**: 1 día - Urgente
      - 🟡 **MEDIUM**: 2 días - Importante
      - ⚪ **LOW**: 5 días - Puede esperar
      - 💭 **NOISE**: Sin clasificar - Requiere decisión
      `,
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Auth', 'Autenticación y usuarios')
    .addTag('Tasks', 'Gestión de tareas')
    .addTag('Communications', 'Gestión de correos')
    .addTag('Calendar', 'Gestión de calendario')
    .addTag('Agent', 'Asistente conversacional')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
    customSiteTitle: 'Nexora API Docs',
  });

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);

  console.log(`
  🚀 Nexora Backend running on: http://localhost:${port}
  📚 Swagger docs: http://localhost:${port}/docs
  `);
}
bootstrap();
