-- CreateTable
CREATE TABLE "tracking_links" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "destination_url" TEXT NOT NULL,
    "default_source" TEXT,
    "default_medium" TEXT,
    "default_campaign" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tracking_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_clicks" (
    "id" TEXT NOT NULL,
    "tracking_link_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "clicked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "landing_url" TEXT NOT NULL,
    "referrer" TEXT,
    "user_agent" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_content" TEXT,
    "utm_term" TEXT,
    "fbclid" TEXT,
    "ctwa_clid" TEXT,
    "gclid" TEXT,
    "campaign_id" TEXT,
    "adset_id" TEXT,
    "ad_id" TEXT,

    CONSTRAINT "tracking_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tracking_links_code_key" ON "tracking_links"("code");

-- CreateIndex
CREATE INDEX "tracking_links_organization_id_idx" ON "tracking_links"("organization_id");

-- CreateIndex
CREATE INDEX "tracking_clicks_organization_id_idx" ON "tracking_clicks"("organization_id");

-- CreateIndex
CREATE INDEX "tracking_clicks_tracking_link_id_clicked_at_idx" ON "tracking_clicks"("tracking_link_id", "clicked_at");

-- AddForeignKey
ALTER TABLE "tracking_links" ADD CONSTRAINT "tracking_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_clicks" ADD CONSTRAINT "tracking_clicks_tracking_link_id_fkey" FOREIGN KEY ("tracking_link_id") REFERENCES "tracking_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
