require("dotenv").config();
const path = require("path");

module.exports = {
  dir: path.join(__dirname, "migrations"),
  databaseUrl: process.env.DATABASE_URL,
  migrationsTable: "pgmigrations",
};
