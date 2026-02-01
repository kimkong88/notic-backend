// Prisma config: schema path, migrations, and datasource URL for CLI (migrate, generate).
// Install: npm install --save-dev prisma dotenv
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DIRECT_URL']!,
  },
});
