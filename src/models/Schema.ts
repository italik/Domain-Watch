import {
  bigint,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// This file defines the structure of your database tables using the Drizzle ORM.

// To modify the database schema:
// 1. Update this file with your desired changes.
// 2. Generate a new migration by running: `npm run db:generate`

// The generated migration file will reflect your schema changes.
// The migration is automatically applied during the next database interaction,
// so there's no need to run it manually or restart the Next.js server.

// Need a database for production? Check out https://www.prisma.io/?via=saasboilerplatesrc
// Tested and compatible with Next.js Boilerplate
export const organizationSchema = pgTable(
  'organization',
  {
    id: text('id').primaryKey(),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    stripeSubscriptionPriceId: text('stripe_subscription_price_id'),
    stripeSubscriptionStatus: text('stripe_subscription_status'),
    stripeSubscriptionCurrentPeriodEnd: bigint(
      'stripe_subscription_current_period_end',
      { mode: 'number' },
    ),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => {
    return {
      stripeCustomerIdIdx: uniqueIndex('stripe_customer_id_idx').on(
        table.stripeCustomerId,
      ),
    };
  },
);

export const todoSchema = pgTable('todo', {
  id: serial('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const dnsRecordTypes = [
  'A',
  'AAAA',
  'CAA',
  'CNAME',
  'MX',
  'NS',
  'SOA',
  'TXT',
] as const;

export const dnsMonitorStatuses = ['active', 'paused'] as const;

export const dnsRecordTypeEnum = pgEnum(
  'dns_record_type',
  dnsRecordTypes,
);

export const dnsMonitorStatusEnum = pgEnum(
  'dns_monitor_status',
  dnsMonitorStatuses,
);

export const dnsMonitorSchema = pgTable(
  'dns_monitor',
  {
    id: serial('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    createdBy: text('created_by').notNull(),
    domain: text('domain').notNull(),
    recordType: dnsRecordTypeEnum('record_type').notNull().default('A'),
    status: dnsMonitorStatusEnum('status').notNull().default('active'),
    lastCheckedAt: timestamp('last_checked_at', { mode: 'date' }),
    lastChangeAt: timestamp('last_change_at', { mode: 'date' }),
    lastError: text('last_error'),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => {
    return {
      orgDomainTypeIdx: uniqueIndex('dns_monitor_org_domain_type_idx').on(
        table.organizationId,
        table.domain,
        table.recordType,
      ),
    };
  },
);

export const dnsRecordSnapshotSchema = pgTable('dns_record_snapshot', {
  id: serial('id').primaryKey(),
  monitorId: integer('monitor_id')
    .references(() => dnsMonitorSchema.id, { onDelete: 'cascade' })
    .notNull(),
  records: jsonb('records').notNull(),
  fetchedAt: timestamp('fetched_at', { mode: 'date' }).defaultNow().notNull(),
});

export const dnsChangeEventSchema = pgTable('dns_change_event', {
  id: serial('id').primaryKey(),
  monitorId: integer('monitor_id')
    .references(() => dnsMonitorSchema.id, { onDelete: 'cascade' })
    .notNull(),
  previousRecords: jsonb('previous_records'),
  currentRecords: jsonb('current_records'),
  changeSummary: text('change_summary').notNull(),
  detectedAt: timestamp('detected_at', { mode: 'date' }).defaultNow().notNull(),
});
