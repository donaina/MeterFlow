-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "feature_key" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "quantity" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_records_customer_id_period_start_period_end_idx" ON "usage_records"("customer_id", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "usage_records_customer_id_feature_key_period_start_period_e_key" ON "usage_records"("customer_id", "feature_key", "period_start", "period_end");

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
