import { pgTable, serial, text, timestamp, boolean, integer, varchar } from 'drizzle-orm/pg-core';

export const articles = pgTable('articles', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  content: text('content').notNull().default(''),
  tags: text('tags').array().notNull().default([]),
  featured: boolean('featured').notNull().default(false),
  status: varchar('status', { length: 20, enum: ['draft', 'published', 'archived'] }).notNull().default('draft'),
  readingTime: integer('reading_time'),
  author: varchar('author', { length: 255 }).notNull().default('Przemysław Filipiak'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  publishedAt: timestamp('published_at'),
});

export const geoQueries = pgTable('geo_queries', {
  id: serial('id').primaryKey(),
  query: text('query').notNull(),
  model: varchar('model', { length: 50 }).notNull(),
  response: text('response'),
  hasMention: boolean('has_mention').notNull().default(false),
  gapDetected: boolean('gap_detected').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const geoRuns = pgTable('geo_runs', {
  id: serial('id').primaryKey(),
  runAt: timestamp('run_at').notNull().defaultNow(),
  queriesCount: integer('queries_count').notNull(),
  gapsFound: integer('gaps_found').notNull(),
  draftsGenerated: integer('drafts_generated').notNull(),
});

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
