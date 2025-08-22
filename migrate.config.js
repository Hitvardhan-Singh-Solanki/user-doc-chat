require("dotenv").config();

module.exports = {
  dir: "migrations",
  databaseUrl: process.env.DATABASE_URL,
  migrationsTable: "pgmigrations",
};
