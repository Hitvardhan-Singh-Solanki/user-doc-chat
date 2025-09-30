/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  pgm.createType('doc_status', ['new', 'processing', 'processed', 'failed']);

  pgm.createTable('legal_documents', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    source_name: { type: 'text', notNull: true },
    source_url: { type: 'text', notNull: true, unique: true },
    law_type: { type: 'text' },
    jurisdiction: { type: 'text' },
    last_crawled: { type: 'timestamp with time zone' },
    last_updated: { type: 'timestamp with time zone' },
    status: { type: 'doc_status', notNull: true, default: 'new' },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('legal_documents', 'status');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropTable('legal_documents');
  pgm.dropType('doc_status');
};
