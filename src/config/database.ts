import knex from 'knex';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'nhs_booking',
    user: process.env.DB_USER || 'nhs_booking_app',
    password: process.env.DB_PASSWORD,
  },
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    tableName: 'knex_migrations',
    directory: './database/migrations'
  }
};

export const db = knex(config);
export default db;
