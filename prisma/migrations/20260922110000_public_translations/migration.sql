CREATE TABLE "PublicTranslation" (
    "id" TEXT NOT NULL,
    "contentKey" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "translatedFields" JSONB,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "retryAfter" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PublicTranslation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PublicTranslation_locale_check" CHECK ("locale" IN ('en', 'fr', 'es', 'ar'))
);

CREATE UNIQUE INDEX "PublicTranslation_contentKey_sourceHash_locale_key"
ON "PublicTranslation"("contentKey", "sourceHash", "locale");
CREATE INDEX "PublicTranslation_updatedAt_idx" ON "PublicTranslation"("updatedAt");

CREATE TABLE "TranslationUsage" (
    "day" TEXT NOT NULL,
    "characters" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TranslationUsage_pkey" PRIMARY KEY ("day"),
    CONSTRAINT "TranslationUsage_characters_check" CHECK ("characters" >= 0)
);
