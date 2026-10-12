import "dotenv/config";
import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const adapterConfig = process.env.DATABASE_URL || {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 5,
};

const adapter = new PrismaMariaDb(adapterConfig);

export const prisma = new PrismaClient({ adapter });
