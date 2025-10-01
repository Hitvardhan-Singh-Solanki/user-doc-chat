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
  pgm.createIndex('file_embeddings', ['file_id', 'chunk_index'], {
    unique: true,
    name: 'file_embeddings_file_chunk_uidx',
  });
  pgm.createIndex('file_embeddings', 'pinecone_id', {
    unique: true,
    name: 'file_embeddings_pinecone_id_uidx',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropIndex('file_embeddings', 'file_embeddings_file_chunk_uidx');
  pgm.dropIndex('file_embeddings', 'file_embeddings_pinecone_id_uidx');
};
