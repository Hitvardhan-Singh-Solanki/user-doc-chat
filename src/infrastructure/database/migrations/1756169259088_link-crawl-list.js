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

  // Create trigger function to update updated_at column
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  // Create trigger to automatically update updated_at on row updates
  pgm.sql(`
    CREATE TRIGGER update_legal_documents_updated_at
      BEFORE UPDATE ON legal_documents
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  `);

  pgm.createIndex('legal_documents', 'status');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  // Drop trigger first
  pgm.sql(
    'DROP TRIGGER IF EXISTS update_legal_documents_updated_at ON legal_documents CASCADE;',
  );

  // Drop trigger function
  pgm.sql('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;');

  pgm.dropTable('legal_documents');
  pgm.dropType('doc_status');
};
