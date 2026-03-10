CREATE TABLE "user_deposit_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"address" text NOT NULL,
	"encrypted_private_key" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_swept_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_deposit_wallets" ADD CONSTRAINT "user_deposit_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_deposit_wallets_user" ON "user_deposit_wallets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_deposit_wallets_address" ON "user_deposit_wallets" USING btree ("address");