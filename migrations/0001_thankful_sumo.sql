CREATE TYPE "public"."dns_monitor_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."dns_record_type" AS ENUM('A', 'AAAA', 'CAA', 'CNAME', 'MX', 'NS', 'SOA', 'TXT');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dns_change_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"monitor_id" integer NOT NULL,
	"previous_records" jsonb,
	"current_records" jsonb,
	"change_summary" text NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dns_monitor" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by" text NOT NULL,
	"domain" text NOT NULL,
	"record_type" "dns_record_type" DEFAULT 'A' NOT NULL,
	"status" "dns_monitor_status" DEFAULT 'active' NOT NULL,
	"last_checked_at" timestamp,
	"last_change_at" timestamp,
	"last_error" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dns_record_snapshot" (
	"id" serial PRIMARY KEY NOT NULL,
	"monitor_id" integer NOT NULL,
	"records" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dns_change_event" ADD CONSTRAINT "dns_change_event_monitor_id_dns_monitor_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."dns_monitor"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dns_record_snapshot" ADD CONSTRAINT "dns_record_snapshot_monitor_id_dns_monitor_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."dns_monitor"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dns_monitor_org_domain_type_idx" ON "dns_monitor" USING btree ("organization_id","domain","record_type");