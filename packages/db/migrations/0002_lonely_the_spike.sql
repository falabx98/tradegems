CREATE TABLE "daily_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rarity" text NOT NULL,
	"amount_lamports" bigint NOT NULL,
	"user_level" integer NOT NULL,
	"vip_tier" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_rewards" ADD CONSTRAINT "daily_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_daily_rewards_user" ON "daily_rewards" USING btree ("user_id","claimed_at");--> statement-breakpoint
CREATE INDEX "idx_daily_rewards_claimed" ON "daily_rewards" USING btree ("claimed_at");