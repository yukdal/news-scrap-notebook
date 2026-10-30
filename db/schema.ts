import {sqliteTable,text,integer,primaryKey,index} from 'drizzle-orm/sqlite-core';
export const records=sqliteTable('records',{
 ownerId:text('owner_id').notNull(),id:text('id').notNull(),kind:text('kind').notNull(),
 payload:text('payload'),version:integer('version').notNull().default(1),deleted:integer('deleted').notNull().default(0),
 updatedAt:integer('updated_at').notNull(),mutationId:text('mutation_id').notNull(),
},t=>[primaryKey({columns:[t.ownerId,t.id]}),index('records_owner_updated').on(t.ownerId,t.updatedAt)]);
export const images=sqliteTable('images',{
 ownerId:text('owner_id').notNull(),id:text('id').notNull(),objectKey:text('object_key').notNull(),name:text('name').notNull(),
 mime:text('mime').notNull(),size:integer('size').notNull(),createdAt:integer('created_at').notNull(),
},t=>[primaryKey({columns:[t.ownerId,t.id]})]);
