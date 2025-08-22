require("dotenv").config();

module.exports = {
  migrationFolder: "migrations",
  direction: "up",
  databaseUrl: process.env.DATABASE_URL,
  migrationsTable: "pgmigrations",
};
