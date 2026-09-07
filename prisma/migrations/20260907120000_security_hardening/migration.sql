-- Limitação distribuída para login e formulários públicos. A chave armazena
-- somente HMAC dos identificadores, nunca IP/e-mail em texto claro.
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

-- Links de confirmação do boletim passam a expirar.
ALTER TABLE "NewsletterSubscriber" ADD COLUMN "confirmExpiresAt" TIMESTAMP(3);
