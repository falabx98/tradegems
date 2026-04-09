ALTER TABLE "users" ADD COLUMN "contact_telegram" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "contact_discord" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_on_withdrawal_delay" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "contacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "contact_notes" text;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "delay_reason" text;