/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createType("file_status", [
    "uploaded",
    "processing",
    "processed",
    "failed",
  ]);

  pgm.createTable("user_files", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    file_name: { type: "text", notNull: true },
    file_size: { type: "bigint", notNull: true },
    owner_id: { type: "uuid", notNull: true },
    status: { type: "file_status", notNull: true, default: "uploaded" },
    error_message: { type: "text" },
    processing_started_at: { type: "timestamp" },
    processing_finished_at: { type: "timestamp" },
    created_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.addConstraint("user_files", "fk_user_files_owner", {
    foreignKeys: [
      {
        columns: "owner_id",
        references: "users(id)",
        onDelete: "CASCADE",
      },
    ],
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable("user_files");
  pgm.dropType("file_status");
};
