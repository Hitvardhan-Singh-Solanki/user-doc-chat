/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

export const up = (pgm) => {
  pgm.createType('chat_sender_enum', ['user', 'ai']);
  pgm.createTable('chat_messages', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    chat_id: { type: 'uuid', notNull: true },
    sender: { type: 'chat_sender_enum', notNull: true },
    message: { type: 'text', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex(
    'chat_messages',
    ['chat_id', { name: 'created_at', sort: 'ASC' }],
    { name: 'idx_chat_messages_chat_created_at' },
  );

  pgm.addConstraint('chat_messages', 'fk_chat_messages_chat', {
    foreignKeys: [
      {
        columns: 'chat_id',
        references: 'chats(id)',
        onDelete: 'CASCADE',
      },
    ],
  });
};

export const down = (pgm) => {
  pgm.dropIndex('chat_messages', 'idx_chat_messages_chat_created_at');
  pgm.dropTable('chat_messages');
  pgm.dropType('chat_sender_enum');
};
