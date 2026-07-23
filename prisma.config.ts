import path from 'node:path';
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  datasource: {
    url: process.env.DATABASE_URL ?? 'file:./db/custom.db',
  },
});
