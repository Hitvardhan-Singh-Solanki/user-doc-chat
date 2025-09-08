/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

export const up = (pgm) => {
  pgm.createTable("chat_messages", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    chat_id: { type: "uuid", notNull: true },
    sender: { type: "varchar(20)", notNull: true }, // 'user' or 'ai'
    message: { type: "text", notNull: true },
    created_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.addConstraint("chat_messages", "fk_chat_messages_chat", {
    foreignKeys: [
      {
        columns: "chat_id",
        references: "chats(id)",
        onDelete: "CASCADE",
      },
    ],
  });
};

export const down = (pgm) => {
  pgm.dropTable("chat_messages");
};
