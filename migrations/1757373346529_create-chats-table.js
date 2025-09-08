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
        user_id: {type: "uuid", notNull: true},
        file_id: {type: "uuid"},
        created_at: {
            type: "timestampz",
            notNull: true,
            default: pgm.func("now()"),
        },
        updated_at: {
            type: "timestampz",
            notNull: true,
            default: pgm.func("now()"),
        },
    });

    pgm.createFunction(
        "set_updated_at",
        [],
        {returns: "trigger", language: "plpgsql"},
        "BEGIN NEW.updated_at = now(); RETURN NEW; END;"
    );
    pgm.createTrigger("chats", "chats_set_updated_at", {
        when: "BEFORE",
        operation: "UPDATE",
        level: "ROW",
        function: "set_updated_at",
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
    pgm.dropTrigger("chats", "chats_set_updated_at");
    pgm.dropFunction("set_updated_at", []);
};
