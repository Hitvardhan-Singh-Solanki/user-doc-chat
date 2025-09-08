/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

export const up = (pgm) => {
  pgm.createTable("chats", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    user_id: { type: "uuid", notNull: true },
    file_id: { type: "uuid" }, // optional if chat is related to a file
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

  pgm.addConstraint("chats", "fk_chats_user", {
    foreignKeys: [
      {
        columns: "user_id",
        references: "users(id)",
        onDelete: "CASCADE",
      },
    ],
  });

  pgm.addConstraint("chats", "fk_chats_file", {
    foreignKeys: [
      {
        columns: "file_id",
        references: "user_files(id)",
        onDelete: "SET NULL",
      },
    ],
  });
};

export const down = (pgm) => {
  pgm.dropTable("chats");
};
