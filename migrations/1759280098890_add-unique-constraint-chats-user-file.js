/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

export const up = (pgm) => {
  // Add unique constraint on (user_id, file_id) to prevent duplicate chats
  // This allows for atomic upsert operations using INSERT ... ON CONFLICT
  pgm.addConstraint('chats', 'unique_chats_user_file', {
    unique: ['user_id', 'file_id'],
  });
};

export const down = (pgm) => {
  pgm.dropConstraint('chats', 'unique_chats_user_file');
};
